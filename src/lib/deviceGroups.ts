// 디바이스 그룹(시스템) 헬퍼 — parentId 로 묶인 하위 기기를 집계한다.
// 예: "Victron 시스템" 마커 하나가 맵에 표시되고, 상태는 하위 기기들의 최악 상태.
import type { Device, DeviceReading, DeviceStatus } from "./types";

const SEVERITY: Record<DeviceStatus, number> = { ok: 0, offline: 1, warning: 2, alert: 3 };

/** 맵(마커/라벨)에 표시할 최상위 디바이스 */
export function visibleDevices(devices: Device[]): Device[] {
  return devices.filter((d) => !d.parentId);
}

/** 특정 그룹의 하위 기기 */
export function childrenOf(devices: Device[], id: string): Device[] {
  return devices.filter((d) => d.parentId === id);
}

/**
 * 디바이스의 유효 리딩 — 하위 기기가 있으면 집계 리딩(sensorId "group:<id>")을 합성.
 * summarize() 가 group: 프리픽스를 인식해 "기기 N개 · 경고 M" 형태로 요약한다.
 */
export function groupReading(
  device: Device,
  devices: Device[],
  readings: Record<string, DeviceReading>,
): DeviceReading | undefined {
  const kids = childrenOf(devices, device.id);
  if (kids.length === 0) {
    return device.sensorId ? readings[device.sensorId] : undefined;
  }
  let worst: DeviceStatus = "ok";
  let alert = 0, warning = 0, offline = 0;
  for (const k of kids) {
    const s: DeviceStatus = k.sensorId ? readings[k.sensorId]?.status ?? "offline" : "offline";
    if (s === "alert") alert++;
    else if (s === "warning") warning++;
    else if (s === "offline") offline++;
    if (SEVERITY[s] > SEVERITY[worst]) worst = s;
  }
  return {
    sensorId: `group:${device.id}`,
    status: worst,
    values: { 기기: kids.length, 경고: alert, 주의: warning, 미연결: offline },
    ts: Date.now(),
  };
}
