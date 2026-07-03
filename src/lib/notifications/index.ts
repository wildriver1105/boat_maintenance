// 활성 알림 채널 선택. NOTIFY_CHANNEL 로 스위치 (기본 pushover).
import type { NotificationChannel } from "./types";
import { PushoverChannel } from "./pushover";

let cached: NotificationChannel | null = null;

export function getChannel(): NotificationChannel {
  if (cached) return cached;
  switch (process.env.NOTIFY_CHANNEL ?? "pushover") {
    // case "webpush": cached = new WebPushChannel(); break;
    default:
      cached = new PushoverChannel();
  }
  return cached;
}

export type { NotificationChannel, NotifyMessage, NotifyResult } from "./types";
