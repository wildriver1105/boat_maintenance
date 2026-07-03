// Pushover 채널 — https://pushover.net API 로 발송.
// 환경변수: PUSHOVER_APP_TOKEN (애플리케이션 토큰, 발신자)
// 수신자(User Key)는 recipients 레지스트리에서 여러 명 관리 → 전원에게 팬아웃.
// (레지스트리가 비어있으면 env PUSHOVER_USER_KEY 로 폴백)
import type { NotificationChannel, NotifyMessage, NotifyResult, NotifyPriority } from "./types";
import { enabledUserKeys } from "./recipients";

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
  private get envUser() {
    return process.env.PUSHOVER_USER_KEY;
  }

  get configured(): boolean {
    return !!this.token;
  }

  private async sendOne(userKey: string, msg: NotifyMessage): Promise<NotifyResult> {
    const prio = PRIORITY_MAP[msg.priority ?? "normal"];
    const body = new URLSearchParams({
      token: this.token!,
      user: userKey,
      title: msg.title,
      message: msg.message,
      priority: String(prio),
    });
    if (msg.url) body.set("url", msg.url);
    if (msg.urlTitle) body.set("url_title", msg.urlTitle);
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
      };
      const ok = res.ok && data.status === 1;
      return { ok, status: res.status, detail: ok ? undefined : data.errors?.join(", ") ?? `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, status: 0, detail: (err as Error).message };
    }
  }

  async send(msg: NotifyMessage): Promise<NotifyResult> {
    if (!this.token) {
      return { ok: false, status: 0, detail: "PUSHOVER_APP_TOKEN 이 설정되지 않았습니다." };
    }
    const keys = await enabledUserKeys();
    const recipients = keys.length ? keys : this.envUser ? [this.envUser] : [];
    if (recipients.length === 0) {
      return { ok: false, status: 0, detail: "등록된 수신자가 없습니다." };
    }

    let okCount = 0;
    const errors: string[] = [];
    for (const key of recipients) {
      const r = await this.sendOne(key, msg);
      if (r.ok) okCount += 1;
      else errors.push(r.detail ?? "실패");
    }
    return {
      ok: okCount === recipients.length,
      status: okCount > 0 ? 200 : 502,
      detail: `수신자 ${recipients.length}명 중 ${okCount}명 발송 성공${
        errors.length ? ` · 오류: ${errors.join("; ")}` : ""
      }`,
    };
  }
}
