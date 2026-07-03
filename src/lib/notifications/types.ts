// 푸시 알림 채널 추상화 — 지금은 Pushover, 이후 Web Push/FCM 등을 같은 인터페이스로 교체.
export type NotifyPriority = "low" | "normal" | "high" | "emergency";

export interface NotifyMessage {
  title: string;
  message: string;
  priority?: NotifyPriority;
  /** 알림에서 열 링크 (예: 해당 장비 도면) */
  url?: string;
  urlTitle?: string;
}

export interface NotifyResult {
  ok: boolean;
  status: number;
  detail?: string;
}

export interface NotificationChannel {
  readonly name: string;
  /** 필요한 키가 설정되어 실제 발송 가능한 상태인지 */
  readonly configured: boolean;
  send(msg: NotifyMessage): Promise<NotifyResult>;
}
