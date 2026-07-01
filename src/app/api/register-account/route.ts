import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { taoCauHinhCookieXacThuc, taoMatKhauHash, taoTokenXacThuc, TEN_COOKIE_XAC_THUC } from "@/lib/auth";
import { ensureCoreSchema } from "@/lib/core-schema";
import { expireFarmInvitations, notifyFarmInvitationOwner } from "@/lib/farm-invitations";
import { ensureSettingsSchema } from "@/lib/settings-schema";

type Payload = {
  fullName: string;
  email: string;
  password: string;
  inviteToken?: string;
};

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

class RegisterAccountError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function completeInviteRegistration(fullName: string, email: string, password: string, inviteToken: string) {
  await ensureSettingsSchema();
  await expireFarmInvitations();

  let acceptedNotification: {
    ownerId: string;
    farmId: string;
    farmName: string;
    inviteId: string;
  } | null = null;
  let completedUser: { id: string; full_name: string; email: string } | null = null;
  const client = await db.connect();
  try {
    await client.query("begin");

    const invite = await client.query(
      `select lm.id::text,
              lm.trang_trai_id::text,
              lm.vai_tro_id::text,
              lm.so_dien_thoai,
              lm.ngon_ngu,
              t.chu_so_huu_id::text as owner_id,
              t.ten_trang_trai as farm_name
       from du_lieu.loi_moi_trang_trai lm
       join du_lieu.trang_trai t on t.id = lm.trang_trai_id
       where lm.token = $1
         and lower(lm.email) = $2
         and lower(lm.trang_thai) = 'pending'
         and (lm.het_han_luc is null or lm.het_han_luc > now())
       limit 1`,
      [inviteToken, email]
    );
    const inviteRow = invite.rows[0] as {
      id?: string;
      trang_trai_id?: string;
      vai_tro_id?: string | null;
      so_dien_thoai?: string | null;
      ngon_ngu?: string | null;
      owner_id?: string;
      farm_name?: string | null;
    } | undefined;
    if (!inviteRow?.id || !inviteRow.trang_trai_id || !inviteRow.vai_tro_id) {
      throw new RegisterAccountError("Lời mời không hợp lệ hoặc đã hết hạn.", 400);
    }

    const passwordHash = taoMatKhauHash(password);
    const existing = await client.query(
      `select id::text
       from du_lieu.nguoi_dung
       where lower(email) = $1
       limit 1`,
      [email]
    );

    let userId = existing.rows[0]?.id ? String(existing.rows[0].id) : null;
    const memberCount = await client.query(
      `select count(*)::int as member_count
       from du_lieu.thanh_vien_trang_trai
       where trang_trai_id = $1
         and ($2::uuid is null or nguoi_dung_id <> $2::uuid)`,
      [inviteRow.trang_trai_id, userId]
    );
    if (Number(memberCount.rows[0]?.member_count ?? 0) >= 3) {
      throw new RegisterAccountError("Trang trại đã đạt giới hạn 3 người dùng.", 409);
    }

    if (userId) {
      await client.query(
        `update du_lieu.nguoi_dung
         set ho_ten = $2,
             mat_khau_hash = $3,
             so_dien_thoai = coalesce(nullif(so_dien_thoai, ''), $4),
             ngon_ngu = coalesce(nullif(ngon_ngu, ''), nullif($5, ''), ngon_ngu),
             trang_thai = 'active',
             updated_at = now()
         where id = $1`,
        [userId, fullName, passwordHash, inviteRow.so_dien_thoai ?? null, inviteRow.ngon_ngu ?? null]
      );
    } else {
      const newUserId = randomUUID();
      const created = await client.query(
        `insert into du_lieu.nguoi_dung (id, ho_ten, email, mat_khau_hash, so_dien_thoai, ngon_ngu, trang_thai)
         values ($1, $2, $3, $4, $5, $6, 'active')
         returning id::text`,
        [newUserId, fullName, email, passwordHash, inviteRow.so_dien_thoai ?? null, inviteRow.ngon_ngu ?? "vi-VN"]
      );
      userId = String(created.rows[0].id);
    }

    await client.query(
      `insert into du_lieu.thanh_vien_trang_trai
         (id, trang_trai_id, nguoi_dung_id, vai_tro_id, trang_thai, metadata_json)
       values ($1, $2, $3, $4, 'active', $5::jsonb)
       on conflict (trang_trai_id, nguoi_dung_id) do update
       set vai_tro_id = excluded.vai_tro_id,
           trang_thai = 'active',
           metadata_json = du_lieu.thanh_vien_trang_trai.metadata_json || excluded.metadata_json,
           updated_at = now()`,
      [randomUUID(), inviteRow.trang_trai_id, userId, inviteRow.vai_tro_id, JSON.stringify({ source: "invite", invite_id: inviteRow.id })]
    );

    await client.query(
      `update du_lieu.loi_moi_trang_trai
       set trang_thai = 'accepted',
           updated_at = now()
       where id = $1`,
      [inviteRow.id]
    );

    await client.query("commit");
    acceptedNotification = {
      ownerId: String(inviteRow.owner_id),
      farmId: inviteRow.trang_trai_id,
      farmName: String(inviteRow.farm_name || "trang trại"),
      inviteId: inviteRow.id,
    };
    completedUser = { id: userId, full_name: fullName, email };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (acceptedNotification) {
    await notifyFarmInvitationOwner({
      ownerId: acceptedNotification.ownerId,
      farmId: acceptedNotification.farmId,
      farmName: acceptedNotification.farmName,
      email,
      fullName,
      decision: "accepted",
      inviteId: acceptedNotification.inviteId,
    }).catch((error) => {
      console.warn("[farm_invitation_notification_failed]", error);
    });
  }

  if (!completedUser) {
    throw new RegisterAccountError("Không thể hoàn tất lời mời.", 500);
  }

  return completedUser;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Payload;
    const fullName = body?.fullName?.trim();
    const email = body?.email?.trim().toLowerCase();
    const password = body?.password ?? "";
    const inviteToken = body?.inviteToken?.trim();

    if (!fullName || !email || !password) {
      return NextResponse.json({ message: "Vui lòng nhập đầy đủ thông tin." }, { status: 400 });
    }
    if (!isEmail(email)) {
      return NextResponse.json({ message: "Email không hợp lệ." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ message: "Mật khẩu phải có ít nhất 8 ký tự." }, { status: 400 });
    }

    if (inviteToken) {
      const user = await completeInviteRegistration(fullName, email, password, inviteToken);
      const token = taoTokenXacThuc(String(user.id));
      const response = NextResponse.json({ message: "Đã chấp nhận lời mời và tạo mật khẩu thành công.", user, nextPath: "/dashboard" });
      const cookieConfig = taoCauHinhCookieXacThuc(request);
      response.cookies.set(TEN_COOKIE_XAC_THUC, token, cookieConfig);
      response.cookies.set("ownerId", "", { ...cookieConfig, maxAge: 0 });
      return response;
    }

    await ensureCoreSchema();
    const existed = await db.query("select id from du_lieu.nguoi_dung where lower(email) = $1 limit 1", [email]);
    if (existed.rowCount) {
      return NextResponse.json({ message: "Email đã tồn tại trong hệ thống. Vui lòng dùng email khác." }, { status: 409 });
    }

    const passwordHash = taoMatKhauHash(password);
    const userId = randomUUID();
    const result = await db.query(
      `insert into du_lieu.nguoi_dung (id, ho_ten, email, mat_khau_hash)
       values ($1, $2, $3, $4)
       returning id, ho_ten, email`,
      [userId, fullName, email, passwordHash]
    );

    const user = result.rows[0] as { id: string; full_name: string; email: string };
    const token = taoTokenXacThuc(String(user.id));
    const response = NextResponse.json({ message: "Tạo tài khoản thành công.", user, nextPath: "/register/farm" });
    const cookieConfig = taoCauHinhCookieXacThuc(request);
    response.cookies.set(TEN_COOKIE_XAC_THUC, token, cookieConfig);
    response.cookies.set("ownerId", "", { ...cookieConfig, maxAge: 0 });
    return response;
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không thể tạo tài khoản.", error: String(error) },
      { status: error instanceof RegisterAccountError ? error.status : 500 }
    );
  }
}
