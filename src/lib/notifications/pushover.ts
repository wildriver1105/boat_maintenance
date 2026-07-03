// Pushover 채널 — https://pushover.net API 로 발송.
// 환경변수: PUSHOVER_APP_TOKEN (애플리케이션 토큰), PUSHOVER_USER_KEY (사용자/그룹 키)
import type { NotificationChannel, NotifyMessage, NotifyResult, NotifyPriority } from "./types";

const PRIORITY_MAP: Record<NotifyPriority, number> = {
  low: -1,
  normal: 0,
  high: 1,
  emergency: 2,
};

export class PushoverChannel implements NotificationChannel {
  readonly name = "pushover";

  private get token() {
    return process.env.PUSHOVER_APP_TOKEN;
  }
  private get user() {
    return process.env.PUSHOVER_USER_KEY;
  }

  get configured(): boolean {
    return !!(this.token && this.user);
  }

  async send(msg: NotifyMessage): Promise<NotifyResult> {
    if (!this.configured) {
      return {
        ok: false,
        status: 0,
        detail: "PUSHOVER_APP_TOKEN / PUSHOVER_USER_KEY 가 설정되지 않았습니다.",
      };
    }
    const prio = PRIORITY_MAP[msg.priority ?? "normal"];
    const body = new URLSearchParams({
      token: this.token!,
      user: this.user!,
      title: msg.title,
      message: msg.message,
      priority: String(prio),
    });
    if (msg.url) body.set("url", msg.url);
    if (msg.urlTitle) body.set("url_title", msg.urlTitle);
    // emergency(2) 는 재전송/만료 파라미터 필수
    if (prio === 2) {
      body.set("retry", "60");
      body.set("expire", "3600");
    }

    try {
      const res = await fetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: number;
        errors?: string[];
        request?: string;
      };
      const ok = res.ok && data.status === 1;
      return {
        ok,
        status: res.status,
        detail: ok
          ? `요청 ID ${data.request ?? "?"}`
          : (data.errors?.join(", ") ?? `HTTP ${res.status}`),
      };
    } catch (err) {
      return { ok: false, status: 0, detail: (err as Error).message };
    }
  }
}
