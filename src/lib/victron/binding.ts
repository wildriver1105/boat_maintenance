// 디바이스 ↔ Victron dbus 서비스 바인딩.
// devices.json 의 config.victron 을 읽는 순수 헬퍼 — 서버(센서 소스)와
// 클라이언트(상세 패널) 양쪽에서 쓰이므로 mqtt 등 서버 전용 의존성을 두지 않는다.

import type { Device } from "@/lib/types";

export interface VictronBinding {
  /** dbus 서비스 경로. 예: "vebus/276", "solarcharger/288", "battery/0", "system/0" */
  path: string;
  /** GX(Cerbo)에 표시되는 실제 장비명 — 매핑이 맞는지 눈으로 확인하기 위한 메모 */
  gxName?: string;
}

export function bindingOf(device: Device): VictronBinding | null {
  const raw = device.config?.victron;
  if (!raw) return null;
  if (typeof raw === "string") return { path: raw };
  const obj = raw as { path?: unknown; gxName?: unknown };
  return typeof obj.path === "string"
    ? { path: obj.path, gxName: typeof obj.gxName === "string" ? obj.gxName : undefined }
    : null;
}
