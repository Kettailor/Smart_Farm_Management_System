"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CowLoading from "@/components/cow-loading";
import { withBasePath } from "@/lib/app-path";

type InviteStatus = "idle" | "checking" | "valid" | "expired" | "accepted" | "declined" | "not_found";

export default function RegistrationPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>("idle");
  const [inviteStatusMessage, setInviteStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextInviteToken = params.get("invite")?.trim() || "";
    const invitedEmail = params.get("email")?.trim() || "";
    setInviteToken(nextInviteToken);
    if (invitedEmail) setEmail(invitedEmail);
    if (!nextInviteToken) {
      setInviteStatus("idle");
      return;
    }

    const controller = new AbortController();
    setInviteStatus("checking");
    setInviteStatusMessage("");
    const statusUrl = new URL("/api/invitations/status", window.location.origin);
    statusUrl.searchParams.set("token", nextInviteToken);
    if (invitedEmail) statusUrl.searchParams.set("email", invitedEmail);

    fetch(statusUrl.toString(), { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as { status?: InviteStatus; message?: string; email?: string | null };
        if (data.email) setEmail(data.email);
        if (response.ok && data.status === "valid") {
          setInviteStatus("valid");
          return;
        }
        const nextStatus = data.status && data.status !== "idle" && data.status !== "checking" && data.status !== "valid" ? data.status : "expired";
        setInviteStatus(nextStatus);
        setInviteStatusMessage(data.message || "Lời mời đã hết hạn.");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setInviteStatus("expired");
        setInviteStatusMessage("Không thể kiểm tra lời mời. Vui lòng yêu cầu chủ sở hữu gửi lại lời mời.");
      });

    return () => controller.abort();
  }, []);

  const onCreateAccount = async () => {
    if (submittingRef.current) return;
    setError("");
    if (inviteToken && inviteStatus !== "valid") return setError("Lời mời đã hết hạn hoặc không còn hiệu lực.");
    if (!fullName.trim() || !email.trim() || !password.trim()) return setError("Vui lòng nhập đầy đủ thông tin.");
    if (password.length < 8) return setError("Mật khẩu phải có ít nhất 8 ký tự.");

    submittingRef.current = true;
    setLoading(true);
    let shouldResetLoading = true;
    try {
      const res = await fetch("/api/register-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim(), password, inviteToken: inviteToken || undefined }),
      });
      const data = (await res.json()) as { message?: string; nextPath?: string };
      if (!res.ok) return setError(data.message || "Không thể tạo tài khoản.");
      shouldResetLoading = false;
      window.dispatchEvent(new Event("farm:navigation-loading"));
      router.push(data.nextPath || "/register/farm");
      router.refresh();
    } catch {
      setError("Không thể kết nối máy chủ.");
    } finally {
      if (shouldResetLoading) {
        submittingRef.current = false;
        setLoading(false);
      }
    }
  };

  const inviteUnavailable = Boolean(inviteToken && inviteStatus !== "valid" && inviteStatus !== "checking");
  const inviteUnavailableTitle =
    inviteStatus === "accepted"
      ? "Lời mời đã được chấp nhận"
      : inviteStatus === "declined"
        ? "Lời mời đã được từ chối"
        : inviteStatus === "not_found"
          ? "Không tìm thấy lời mời"
          : "Lời mời đã hết hạn";
  const inviteUnavailableMessage =
    inviteStatusMessage ||
    (inviteStatus === "accepted"
      ? "Tài khoản này đã tham gia trang trại trước đó."
      : inviteStatus === "declined"
        ? "Lời mời này đã được từ chối và không còn hiệu lực."
        : "Lời mời này đã hết hạn hoặc đã bị chủ sở hữu xóa.");

  return (
    <main className="page-shell auth-shell">
      <section className="auth-card card auth-card-register">
        <aside className="auth-visual auth-visual-register">
          <div className="auth-brand-row">
            <Image src={withBasePath("/favicon.ico")} alt="KetKat-EcoFarm" width={46} height={46} className="auth-logo" />
            <div>
              <p className="auth-brand-label">KetKat-EcoFarm</p>
              <strong>{inviteToken ? "Hoàn tất lời mời" : "Tạo tài khoản chủ sở hữu"}</strong>
            </div>
          </div>

          <h1 className="auth-visual-title">{inviteToken ? "Tạo mật khẩu để tham gia trang trại đã được phân quyền." : "Thiết lập tài khoản để bắt đầu quản trị nông trại."}</h1>
          <p className="auth-visual-text">
            {inviteToken
              ? "Lời mời đã được gửi tới email của bạn. Hoàn tất thông tin tài khoản để truy cập dashboard."
              : "Quy trình đăng ký được thiết kế theo hướng rõ ràng, hiện đại và dễ đi tiếp sang bước khởi tạo farm."}
          </p>

          <div className="auth-feature-list">
            <div className="auth-feature-item">
              <strong>1. Tài khoản</strong>
              <span>Nhập họ tên, email và mật khẩu</span>
            </div>
            <div className="auth-feature-item">
              <strong>2. Khởi tạo farm</strong>
              <span>Thêm thông tin nông trại sau khi đăng ký</span>
            </div>
            <div className="auth-feature-item">
              <strong>3. Bắt đầu sử dụng</strong>
              <span>Vào dashboard và hoàn thiện dữ liệu</span>
            </div>
          </div>
        </aside>

        <div className="auth-panel">
          {inviteToken && inviteStatus === "checking" ? (
            <div className="auth-panel-head">
              <p className="kicker">Đang kiểm tra</p>
              <h2>Kiểm tra lời mời</h2>
              <CowLoading label="Đang kiểm tra lời mời..." />
            </div>
          ) : inviteUnavailable ? (
            <>
              <div className="auth-panel-head">
                <p className="kicker">Lời mời trang trại</p>
                <h2>{inviteUnavailableTitle}</h2>
                <p className="section-subtitle">{inviteUnavailableMessage}</p>
              </div>

              <div className="auth-links">
                <a href="/login">Quay lại đăng nhập</a>
                <a href="/">Xem trang giới thiệu</a>
              </div>
            </>
          ) : (
            <>
          <div className="auth-panel-head">
            <p className="kicker">Đăng ký</p>
            <h2>{inviteToken ? "Chấp nhận lời mời" : "Tạo tài khoản mới"}</h2>
            <p className="section-subtitle">{inviteToken ? "Nhập họ tên và mật khẩu để kích hoạt tài khoản được mời." : "Hoàn tất thông tin cơ bản trước khi cấu hình nông trại."}</p>
          </div>

          <div className="auth-form-grid">
            <label className="auth-field full">
              <span>Họ và tên</span>
              <input className="input" placeholder="Nguyễn Văn A" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
            <label className="auth-field full">
              <span>Email</span>
              <input className="input" placeholder="ban@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="auth-field full">
              <span>Mật khẩu</span>
              <input className="input" type="password" placeholder="Ít nhất 8 ký tự" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </div>

          <button type="button" className="btn btn-primary auth-submit" onClick={onCreateAccount} disabled={loading}>
            {loading ? <CowLoading label="Đang tải..." /> : inviteToken ? "Chấp nhận lời mời" : "Tạo tài khoản"}
          </button>

          {error && <p className="error-text auth-error">{error}</p>}

          <div className="auth-links">
            <a href="/login">Đã có tài khoản? Đăng nhập</a>
            <a href="/">Xem trang giới thiệu</a>
          </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
