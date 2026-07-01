import { randomBytes } from "crypto";
import net from "net";
import tls from "tls";

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  startTls: boolean;
  tlsRejectUnauthorized: boolean;
  user: string | null;
  pass: string | null;
  from: string;
};

type SendMailOptions = {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
};

export type SendMailResult = {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
};

export type FarmInvitationEmailOptions = {
  appName?: string;
  inviteUrl: string;
  declineUrl?: string | null;
  invitedEmail: string;
  inviterName: string;
  farmName: string;
  roleName: string;
  expiresInDays?: number;
  supportEmail?: string | null;
  supportPhone?: string | null;
  logoUrl?: string | null;
};

export type WorkTaskAssignmentEmailOptions = {
  appName?: string;
  taskTitle: string;
  workTitle: string;
  assigneeName: string;
  reporterName: string;
  dueDate?: string | null;
  priority?: string | null;
  taskUrl: string;
};

const SMTP_TIMEOUT_MS = 30000;

function envText(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = envText(name);
    if (value) return value;
  }
  return null;
}

function hasAnyEnv(...names: string[]) {
  return names.some((name) => Boolean(envText(name)));
}

function envBooleanValue(value: string | null, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envNumberValue(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function domainFromEmail(address: string | null) {
  const email = address ? extractEmail(address) : "";
  const domain = email.split("@")[1]?.trim().toLowerCase();
  return domain || null;
}

function getMailConfig(): MailConfig | null {
  const user = firstEnv("WEBMAIL_EMAIL", "WEBMAIL_USER", "SMTP_USER");
  const pass = firstEnv("WEBMAIL_PASSWORD", "WEBMAIL_PASS", "SMTP_PASS");
  const webmailMode = hasAnyEnv("WEBMAIL_EMAIL", "WEBMAIL_USER", "WEBMAIL_PASSWORD", "WEBMAIL_PASS", "WEBMAIL_HOST", "WEBMAIL_PORT");
  const webmailDomain = domainFromEmail(user);
  const inferredWebmailHost = webmailMode && webmailDomain ? `mail.${webmailDomain}` : null;
  const host = firstEnv("WEBMAIL_HOST", "SMTP_HOST") || inferredWebmailHost;
  const portText = firstEnv("WEBMAIL_PORT", "SMTP_PORT");
  const defaultSecure = portText ? portText === "465" : webmailMode;
  const secure = envBooleanValue(firstEnv("WEBMAIL_SECURE", "SMTP_SECURE"), defaultSecure);
  const port = envNumberValue(portText, secure ? 465 : 587);
  const appName = envText("NEXT_PUBLIC_APP_NAME") || "KetKat-EcoFarm";
  const from = firstEnv("WEBMAIL_FROM", "MAIL_FROM", "SMTP_FROM") || (user ? `${appName} <${user}>` : null);
  const tlsRejectUnauthorized = envBooleanValue(firstEnv("WEBMAIL_TLS_REJECT_UNAUTHORIZED", "SMTP_TLS_REJECT_UNAUTHORIZED"), true);

  if (!host || !from || (webmailMode && (!user || !pass))) return null;
  return {
    host,
    port,
    secure,
    startTls: envBooleanValue(firstEnv("WEBMAIL_STARTTLS", "SMTP_STARTTLS"), !secure),
    tlsRejectUnauthorized,
    user,
    pass,
    from,
  };
}

function extractEmail(address: string) {
  const match = address.match(/<([^>]+)>/);
  return (match?.[1] ?? address).trim();
}

function encodeHeader(value: string) {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function encodeAddress(address: string) {
  const match = address.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return address;
  const [, name, email] = match;
  return `${encodeHeader(name.replace(/^"|"$/g, ""))} <${email}>`;
}

function chunkBase64(value: string) {
  return Buffer.from(value, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function createMimeMessage(options: Required<SendMailOptions>) {
  const boundary = `ketkat-${randomBytes(12).toString("hex")}`;
  const messageIdHost = extractEmail(options.from).split("@")[1] || "ketkat.local";

  return [
    `From: ${encodeAddress(options.from)}`,
    `To: ${encodeAddress(options.to)}`,
    `Subject: ${encodeHeader(options.subject)}`,
    "MIME-Version: 1.0",
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomBytes(16).toString("hex")}@${messageIdHost}>`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    chunkBase64(options.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    chunkBase64(options.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

class SmtpConnection {
  private buffer = "";
  private pending:
    | {
        lines: string[];
        resolve: (response: { code: number; message: string }) => void;
        reject: (error: Error) => void;
        timer: NodeJS.Timeout;
      }
    | null = null;

  private onData = (chunk: Buffer) => {
    this.buffer += chunk.toString("utf8");
    this.flush();
  };

  private onError = (error: Error) => {
    this.rejectPending(error);
  };

  private onClose = () => {
    this.rejectPending(new Error("Kết nối SMTP đã đóng trước khi hoàn tất gửi mail."));
  };

  constructor(private socket: net.Socket | tls.TLSSocket) {
    this.attach(socket);
  }

  private attach(socket: net.Socket | tls.TLSSocket) {
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
  }

  private detach() {
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.socket.off("close", this.onClose);
    return this.socket;
  }

  private rejectPending(error: Error) {
    if (!this.pending) return;
    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private flush() {
    if (!this.pending) return;

    while (this.pending) {
      const end = this.buffer.indexOf("\r\n");
      if (end < 0) return;

      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      this.pending.lines.push(line);

      const done = line.match(/^(\d{3})\s/);
      if (done) {
        const pending = this.pending;
        this.pending = null;
        clearTimeout(pending.timer);
        pending.resolve({ code: Number(done[1]), message: pending.lines.join("\n") });
      }
    }
  }

  readResponse() {
    if (this.pending) return Promise.reject(new Error("Đang chờ phản hồi SMTP khác."));

    return new Promise<{ code: number; message: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rejectPending(new Error("SMTP timeout."));
      }, SMTP_TIMEOUT_MS);
      this.pending = { lines: [], resolve, reject, timer };
      this.flush();
    });
  }

  async expect(minCode: number, maxCode = minCode) {
    const response = await this.readResponse();
    if (response.code < minCode || response.code > maxCode) {
      throw new Error(`SMTP phản hồi không hợp lệ: ${response.message}`);
    }
    return response;
  }

  sendLine(line: string) {
    this.socket.write(`${line}\r\n`);
  }

  sendMessage(message: string) {
    const normalized = message.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    this.socket.write(`${normalized}\r\n.\r\n`);
  }

  async upgradeTls(host: string, rejectUnauthorized = true) {
    const rawSocket = this.detach();
    const secureSocket = tls.connect({ socket: rawSocket, servername: host, rejectUnauthorized });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SMTP STARTTLS timeout.")), SMTP_TIMEOUT_MS);
      secureSocket.once("secureConnect", () => {
        clearTimeout(timer);
        resolve();
      });
      secureSocket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    this.socket = secureSocket;
    this.attach(secureSocket);
  }

  close() {
    this.detach();
    this.socket.end();
  }
}

function connectSocket(config: MailConfig) {
  const socket = config.secure
    ? tls.connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: config.tlsRejectUnauthorized })
    : net.connect({ host: config.host, port: config.port });

  return new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SMTP connect timeout.")), SMTP_TIMEOUT_MS);
    const eventName = config.secure ? "secureConnect" : "connect";
    socket.once(eventName, () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function sendViaSmtp(config: MailConfig, options: Required<SendMailOptions>) {
  const socket = await connectSocket(config);
  const connection = new SmtpConnection(socket);
  const heloName = firstEnv("WEBMAIL_HELO_NAME", "SMTP_HELO_NAME") || "localhost";

  try {
    await connection.expect(220, 299);
    connection.sendLine(`EHLO ${heloName}`);
    await connection.expect(250, 299);

    if (!config.secure && config.startTls) {
      connection.sendLine("STARTTLS");
      await connection.expect(220, 299);
      await connection.upgradeTls(config.host, config.tlsRejectUnauthorized);
      connection.sendLine(`EHLO ${heloName}`);
      await connection.expect(250, 299);
    }

    if (config.user && config.pass) {
      connection.sendLine("AUTH LOGIN");
      await connection.expect(334);
      connection.sendLine(Buffer.from(config.user, "utf8").toString("base64"));
      await connection.expect(334);
      connection.sendLine(Buffer.from(config.pass, "utf8").toString("base64"));
      await connection.expect(235, 299);
    }

    connection.sendLine(`MAIL FROM:<${extractEmail(options.from)}>`);
    await connection.expect(250, 299);
    connection.sendLine(`RCPT TO:<${extractEmail(options.to)}>`);
    await connection.expect(250, 299);
    connection.sendLine("DATA");
    await connection.expect(354);
    connection.sendMessage(createMimeMessage(options));
    await connection.expect(250, 299);
    connection.sendLine("QUIT");
  } finally {
    connection.close();
  }
}

function mailErrorReason(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function sendMail(options: SendMailOptions): Promise<SendMailResult> {
  const config = getMailConfig();
  if (!config) {
    return { sent: false, skipped: true, reason: "Webmail/SMTP chua duoc cau hinh. Can WEBMAIL_EMAIL va WEBMAIL_PASSWORD hoac SMTP_*." };
  }

  try {
    await sendViaSmtp(config, {
      ...options,
      from: options.from || config.from,
    });
    return { sent: true };
  } catch (error) {
    const reason = mailErrorReason(error);
    console.error("[mail_send_failed]", {
      host: config.host,
      port: config.port,
      secure: config.secure,
      startTls: config.startTls,
      user: config.user,
      reason,
    });
    return { sent: false, reason };
  }
}

export function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFarmInvitationEmail(options: FarmInvitationEmailOptions) {
  const appName = options.appName || "KetKat-EcoFarm";
  const supportEmail = options.supportEmail || "support@ketkat-ecofarm.local";
  const supportPhone = options.supportPhone || "";
  const expiresInDays = options.expiresInDays ?? 7;
  const subject = `${options.inviterName} mời bạn tham gia ${options.farmName} trên ${appName}`;
  const logoBlock = options.logoUrl
    ? `<img src="${escapeHtml(options.logoUrl)}" alt="${escapeHtml(appName)}" width="210" style="display:block;margin:0 auto;max-width:210px;height:auto;border:0;">`
    : `<div style="font-size:32px;line-height:1;font-weight:800;color:#ffffff;letter-spacing:0;">${escapeHtml(appName)}</div>`;

  const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;margin:0;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:100%;background:#ffffff;border-collapse:collapse;box-shadow:0 1px 2px rgba(16,24,40,0.08);">
            <tr>
              <td align="center" style="background:#56c900;padding:38px 24px;">
                ${logoBlock}
              </td>
            </tr>
            <tr>
              <td style="padding:36px 28px 16px;">
                <h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;color:#0f172a;">Bạn đã được mời tham gia ${escapeHtml(options.farmName)} trên ${escapeHtml(appName)}!</h1>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Xin chào,</p>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">${escapeHtml(options.inviterName)} đã mời bạn tham gia trang trại <strong>${escapeHtml(options.farmName)}</strong> với vai trò <strong>${escapeHtml(options.roleName)}</strong>.</p>
                <p style="margin:0 0 28px;font-size:16px;line-height:1.6;">Nhấn nút bên dưới để chấp nhận lời mời và hoàn tất tài khoản trước khi truy cập dữ liệu trang trại. Lời mời sẽ hết hạn sau ${expiresInDays} ngày.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 28px;">
                  <tr>
                    <td align="center" bgcolor="#56c900" style="border-radius:5px;">
                      <a href="${escapeHtml(options.inviteUrl)}" style="display:inline-block;padding:15px 24px;font-size:16px;line-height:1;color:#ffffff;text-decoration:none;font-weight:700;">Tham gia ${escapeHtml(appName)}</a>
                    </td>
                  </tr>
                </table>
                ${
                  options.declineUrl
                    ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.6;text-align:center;color:#64748b;">Không tham gia? <a href="${escapeHtml(options.declineUrl)}" style="color:#b42318;">Từ chối lời mời</a>.</p>`
                    : ""
                }
                <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">Hoặc sao chép đường dẫn sau vào trình duyệt:</p>
                <p style="margin:0 0 28px;font-size:15px;line-height:1.6;word-break:break-all;"><a href="${escapeHtml(options.inviteUrl)}" style="color:#0b63ce;">${escapeHtml(options.inviteUrl)}</a></p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">Chúng tôi rất mong được đồng hành cùng bạn trong việc quản lý trang trại hằng ngày.</p>
                <p style="margin:0;font-size:18px;line-height:1.5;color:#56c900;font-weight:700;">The ${escapeHtml(appName)} Team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 26px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#334155;">Cần hỗ trợ? Liên hệ ${supportPhone ? `qua ${escapeHtml(supportPhone)} hoặc ` : ""}<a href="mailto:${escapeHtml(supportEmail)}" style="color:#0b63ce;">${escapeHtml(supportEmail)}</a>.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:100%;border-collapse:collapse;">
            <tr>
              <td align="center" style="padding:22px 12px 14px;font-size:12px;color:#64748b;">Theo dõi ${escapeHtml(appName)} trên các kênh xã hội</td>
            </tr>
            <tr>
              <td align="center" style="background:#56c900;padding:14px;">
                <span style="display:inline-block;width:24px;height:24px;border-radius:999px;background:#ffffff;color:#111827;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin:0 8px;">▶</span>
                <span style="display:inline-block;width:24px;height:24px;border-radius:999px;background:#ffffff;color:#111827;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin:0 8px;">f</span>
                <span style="display:inline-block;width:24px;height:24px;border-radius:999px;background:#ffffff;color:#111827;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin:0 8px;">↗</span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 12px 0;font-size:12px;line-height:1.6;color:#64748b;">Copyright © ${new Date().getFullYear()} ${escapeHtml(appName)}. All rights reserved.<br>Thư mời được gửi tới ${escapeHtml(options.invitedEmail)}.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${options.inviterName} mời bạn tham gia ${options.farmName} trên ${appName}.`,
    "",
    `Vai trò: ${options.roleName}`,
    `Email nhận lời mời: ${options.invitedEmail}`,
    `Hạn chấp nhận: ${expiresInDays} ngày`,
    "",
    "Mở đường dẫn sau để chấp nhận lời mời:",
    options.inviteUrl,
    ...(options.declineUrl ? ["", "Nếu không tham gia, mở đường dẫn sau để từ chối:", options.declineUrl] : []),
    "",
    `The ${appName} Team`,
  ].join("\n");

  return { subject, html, text };
}

export function buildWorkTaskAssignmentEmail(options: WorkTaskAssignmentEmailOptions) {
  const appName = options.appName || "KetKat-EcoFarm";
  const dueDateText = options.dueDate || "Chưa đặt hạn";
  const priorityText = options.priority || "Trung bình";
  const subject = `Bạn được giao nhiệm vụ: ${options.taskTitle}`;

  const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;margin:0;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:100%;background:#ffffff;border-collapse:collapse;box-shadow:0 1px 2px rgba(16,24,40,0.08);">
            <tr>
              <td style="background:#56c900;padding:28px;color:#ffffff;">
                <div style="font-size:26px;line-height:1.2;font-weight:800;">${escapeHtml(appName)}</div>
                <div style="margin-top:8px;font-size:15px;line-height:1.5;">Thông báo giao nhiệm vụ</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;">
                <h1 style="margin:0 0 18px;font-size:22px;line-height:1.35;color:#0f172a;">Bạn được giao nhiệm vụ mới</h1>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Xin chào ${escapeHtml(options.assigneeName)},</p>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">${escapeHtml(options.reporterName)} đã giao cho bạn nhiệm vụ <strong>${escapeHtml(options.taskTitle)}</strong> trong công việc <strong>${escapeHtml(options.workTitle)}</strong>.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-collapse:collapse;">
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#64748b;font-size:14px;">Hạn hoàn thành</td>
                    <td align="right" style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:700;">${escapeHtml(dueDateText)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#64748b;font-size:14px;">Mức ưu tiên</td>
                    <td align="right" style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:700;">${escapeHtml(priorityText)}</td>
                  </tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
                  <tr>
                    <td align="center" bgcolor="#56c900" style="border-radius:5px;">
                      <a href="${escapeHtml(options.taskUrl)}" style="display:inline-block;padding:14px 22px;font-size:15px;line-height:1;color:#ffffff;text-decoration:none;font-weight:700;">Mở nhiệm vụ</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;word-break:break-all;color:#64748b;">${escapeHtml(options.taskUrl)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Bạn được giao nhiệm vụ mới trên ${appName}.`,
    "",
    `Nhiệm vụ: ${options.taskTitle}`,
    `Công việc: ${options.workTitle}`,
    `Người báo cáo: ${options.reporterName}`,
    `Hạn hoàn thành: ${dueDateText}`,
    `Mức ưu tiên: ${priorityText}`,
    "",
    "Mở nhiệm vụ:",
    options.taskUrl,
  ].join("\n");

  return { subject, html, text };
}
