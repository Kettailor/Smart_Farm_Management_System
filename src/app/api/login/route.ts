import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hashDangLegacyMd5,
  kiemTraMatKhau,
  taoCauHinhCookieXacThuc,
  taoMatKhauHash,
  taoTokenXacThuc,
  TEN_COOKIE_XAC_THUC,
} from "@/lib/auth";

type LoginPayload = {
  email: string;
  password: string;
};

async function tableExists(schema: string, table: string) {
  try {
    const rs = await db.query(`select to_regclass($1) is not null as exists`, [`${schema}.${table}`]);
    return Boolean(rs.rows[0]?.exists);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginPayload;
    const email = body?.email?.trim().toLowerCase();
    const password = body?.password;

    if (!email || !password) {
      return NextResponse.json({ message: "Vui lòng nhập đầy đủ email và mật khẩu." }, { status: 400 });
    }

    const hasNguoiDung = await tableExists("du_lieu", "nguoi_dung");
    const hasTrangTrai = await tableExists("du_lieu", "trang_trai");
    const hasThanhVienTrangTrai = await tableExists("du_lieu", "thanh_vien_trang_trai");

    if (!hasNguoiDung) {
      throw new Error("Không tìm thấy bảng người dùng trong cơ sở dữ liệu.");
    }

    const result = await db.query(
      `select c.id, c.ho_ten as full_name, c.email, c.mat_khau_hash as password_hash,
              ${
                hasTrangTrai
                  ? `(
                      exists(select 1 from du_lieu.trang_trai t where t.chu_so_huu_id = c.id limit 1)
                      ${
                        hasThanhVienTrangTrai
                          ? `or exists(
                              select 1
                              from du_lieu.thanh_vien_trang_trai tv
                              where tv.nguoi_dung_id = c.id
                                and lower(coalesce(tv.trang_thai, 'active')) = 'active'
                              limit 1
                            )`
                          : ""
                      }
                    )`
                  : "false"
              } as has_farm
       from du_lieu.nguoi_dung c
       where lower(c.email) = $1
         and coalesce(nullif(c.trang_thai, ''), 'active') <> 'disabled'
       limit 1`,
      [email]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ message: "Email hoặc mật khẩu không đúng." }, { status: 401 });
    }

    const user = result.rows[0] as { id: string; full_name: string; email: string; password_hash: string; has_farm: boolean };
    const hopLe = kiemTraMatKhau(password, user.password_hash);
    if (!hopLe) {
      return NextResponse.json({ message: "Email hoặc mật khẩu không đúng." }, { status: 401 });
    }

    if (hashDangLegacyMd5(user.password_hash)) {
      const hashMoi = taoMatKhauHash(password);
      await db.query("update du_lieu.nguoi_dung set mat_khau_hash = $2 where id = $1", [user.id, hashMoi]);
    }

    const token = taoTokenXacThuc(String(user.id));
    const response = NextResponse.json({
      message: "Đăng nhập thành công.",
      user: { id: user.id, fullName: user.full_name, email: user.email },
      nextPath: user.has_farm ? "/dashboard" : "/register/farm",
    });

    const cookieConfig = taoCauHinhCookieXacThuc(request);
    response.cookies.set(TEN_COOKIE_XAC_THUC, token, cookieConfig);
    response.cookies.set("ownerId", "", { ...cookieConfig, maxAge: 0 });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message: "Không thể đăng nhập vào lúc này.",
        error: String(error),
      },
      { status: 500 }
    );
  }
}
