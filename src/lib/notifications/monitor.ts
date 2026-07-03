// 상태 경고 자동 알림 모니터 — 서버에서 주기적으로 센서를 읽어 장비 상태가
// 임계 수준으로 "전이"될 때만 푸시 발송(연속 스팸 방지). 서버 프로세스 1개 기준.
//
// 활성화: env ALERT_MONITOR=on (기본 off — 목업 센서로 인한 스팸 방지)
//   ALERT_MONITOR_INTERVAL  폴링 주기(ms, 기본 20000)
//   ALERT_MONITOR_LEVEL     "alert"(기본) | "warning" — 이 수준 이상에서 알림
//   APP_BASE_URL            알림에 넣을 앱 링크 (옵션)

import { readDevices } from "@/lib/devices/registry";
import { getSensorSource } from "@/lib/sensors";
import { summarize } from "@/lib/format";
import { STATUS_META, type DeviceStatus } from "@/lib/types";
import { getChannel } from "./index";

const SEVERITY: Record<DeviceStatus, number> = { ok: 0, offline: 1, warning: 2, alert: 3 };

let started = false;
const lastStatus = new Map<string, DeviceStatus>();

export function startAlertMonitor(): void {
  if (started) return;
  started = true;
  if (process.env.ALERT_MONITOR !== "on") {
    console.log("[alert-monitor] 비활성 (ALERT_MONITOR=on 으로 켜세요)");
    return;
  }
  const interval = Number(process.env.ALERT_MONITOR_INTERVAL ?? 20000);
  console.log(`[alert-monitor] 활성 · ${interval}ms 주기`);
  void tick();
  setInterval(() => void tick(), interval);
}

async function tick(): Promise<void> {
  try {
    const threshold = SEVERITY[
      (process.env.ALERT_MONITOR_LEVEL as DeviceStatus) ?? "alert"
    ] ?? SEVERITY.alert;
    const devices = await readDevices();
    const readings = await getSensorSource().getReadings(devices);
    const byId = new Map(readings.map((r) => [r.sensorId, r]));
    const channel = getChannel();

    for (const d of devices) {
      if (!d.sensorId) continue;
      const reading = byId.get(d.sensorId);
      const status: DeviceStatus = reading?.status ?? "offline";
      const prev = lastStatus.get(d.sensorId);
      lastStatus.set(d.sensorId, status);

      const crossedUp =
        SEVERITY[status] >= threshold &&
        (prev === undefined ? false : SEVERITY[prev] < threshold);
      // 첫 관측이면 알림하지 않고 기준선만 저장(부팅 직후 스팸 방지)
      if (prev === undefined) continue;
      if (!crossedUp) continue;

      const priority = status === "alert" ? "emergency" : "high";
      const base = process.env.APP_BASE_URL;
      await channel.send({
        title: `${status === "alert" ? "🔴 경고" : "🟠 주의"} · ${d.name}`,
        message: `${d.name} 상태가 ${STATUS_META[status].label}로 전환됨 — ${summarize(d, reading)}`,
        priority,
        url: base ? `${base}/` : undefined,
        urlTitle: base ? "도면 열기" : undefined,
      });
      console.log(`[alert-monitor] 발송: ${d.name} → ${status}`);
    }
  } catch (err) {
    console.error("[alert-monitor] tick 오류:", (err as Error).message);
  }
}
