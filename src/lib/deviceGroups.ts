// 디바이스 그룹(시스템) 헬퍼 — parentId 로 묶인 하위 기기를 집계한다.
// 예: "Victron 시스템" 마커 하나가 맵에 표시되고, 상태는 하위 기기들의 최악 상태.
import type { Device, DeviceReading, DeviceStatus } from "./types";

const SEVERITY: Record<DeviceStatus, number> = { ok: 0, caution: 1, offline: 2, warning: 3, alert: 4 };

/**
 * 맵(마커/라벨)에 표시할 최상위 디바이스.
 * enabled === false 는 아직 데이터 소스가 없어 감춰둔 장비라 제외한다.
 */
export function visibleDevices(devices: Device[]): Device[] {
  return devices.filter((d) => !d.parentId && d.enabled !== false);
}

/** 감춰둔(연결 대기) 장비 — 우측 패널에서 다시 켤 수 있게 노출한다 */
export function pendingDevices(devices: Device[]): Device[] {
  return devices.filter((d) => !d.parentId && d.enabled === false);
}

/** 특정 그룹의 하위 기기 (감춘 것 포함 — 상세 패널에서는 전부 보여준다) */
export function childrenOf(devices: Device[], id: string): Device[] {
  return devices.filter((d) => d.parentId === id);
}

/** 상태 집계 대상 하위 기기 — 감춰둔(모니터링하지 않는) 기기는 제외 */
function monitoredChildren(devices: Device[], id: string): Device[] {
  return childrenOf(devices, id).filter((d) => d.enabled !== false);
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
  // 감춰둔 기기(통신 기능이 없는 수동 장비 등)는 그룹 건강도에 반영하지 않는다.
  // 그러지 않으면 절연 트랜스 같은 부품 하나 때문에 시스템 전체가 미연결로 보인다.
  const kids = monitoredChildren(devices, device.id);
  if (kids.length === 0) {
    return device.sensorId ? readings[device.sensorId] : undefined;
  }
  let worst: DeviceStatus = "ok";
  let alert = 0, warning = 0, offline = 0;
  for (const k of kids) {
    const s: DeviceStatus = k.sensorId ? readings[k.sensorId]?.status ?? "offline" : "offline";
    if (s === "alert") alert++;
    else if (s === "warning") warning++;
    else if (s === "offline" || s === "caution") offline++;
    if (SEVERITY[s] > SEVERITY[worst]) worst = s;
  }

  // 일부만 끊긴 그룹은 offline(회색)이 아니라 caution 이다. MPPT 한 대가 빠졌다고
  // 시스템 전체가 죽은 것처럼 보이면, 정작 전체가 끊겼을 때 그 사실을 알아채지
  // 못한다 — 같은 색이 두 상황을 가리키게 되기 때문이다.
  const partial = offline > 0 && offline < kids.length;
  if (partial && worst === "offline") worst = "caution";

  return {
    sensorId: `group:${device.id}`,
    status: worst,
    values: { 기기: kids.length, 경고: alert, 주의: warning, 미연결: offline },
    ts: Date.now(),
  };
}
