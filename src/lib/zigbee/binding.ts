// 디바이스 ↔ Zigbee2MQTT 기기 바인딩.
// devices.json 의 config.zigbee 를 읽는 순수 헬퍼 — 서버(센서 소스)와
// 클라이언트(상세 패널) 양쪽에서 쓰이므로 mqtt 등 서버 전용 의존성을 두지 않는다.
//
//   "config": { "zigbee": { "id": "0x4ce175b575300000", "model": "3RSP02064Z" } }
//
// id 는 z2m 토픽에 쓰이는 값이다. friendly_name 을 바꾸면 토픽도 바뀌므로
// 이름을 바꾸지 않는 한 IEEE 주소를 그대로 쓰는 편이 안전하다.

import type { Device } from "@/lib/types";

export interface ZigbeeBinding {
  /** z2m 토픽 키 — IEEE 주소 또는 friendly_name */
  id: string;
  /** 어떤 기기인지 눈으로 확인하기 위한 메모 */
  model?: string;
}

export function zigbeeBindingOf(device: Device): ZigbeeBinding | null {
  const raw = device.config?.zigbee;
  if (!raw) return null;
  if (typeof raw === "string") return { id: raw };
  const obj = raw as { id?: unknown; model?: unknown };
  return typeof obj.id === "string"
    ? { id: obj.id, model: typeof obj.model === "string" ? obj.model : undefined }
    : null;
}
