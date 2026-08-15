// 알림 모니터 — 주기적으로 상태를 읽어 "규칙에 걸리는 전이"가 생겼을 때만 발송한다.
//
// 어떤 알림을 보낼지는 env 가 아니라 관리 화면(/admin/notifications)의 규칙이
// 결정한다. 기본값은 전부 비활성이므로, 사람이 켜지 않는 한 아무것도 발송되지
// 않는다. env ALERT_MONITOR 는 모니터 자체의 마스터 스위치로만 남는다.
//
//   ALERT_MONITOR           on 이어야 모니터가 돈다 (기본 off)
//   ALERT_MONITOR_INTERVAL  폴링 주기(ms, 기본 20000)
//   APP_BASE_URL            알림에 넣을 앱 링크 (옵션)
//
// 발송 원칙: **상태가 바뀌는 순간에만** 보낸다. 조건이 유지되는 동안 계속 보내면
// 폰이 울려대고, 그러면 사람이 알림을 꺼버려서 정작 중요한 것을 놓친다.
// 첫 관측은 기준선만 잡고 발송하지 않는다 (재시작 직후 스팸 방지).

import { readDevices } from "@/lib/devices/registry";
import { getSensorSource } from "@/lib/sensors";
import { summarize } from "@/lib/format";
import { buildSnapshot } from "@/lib/victron/snapshot";
import { zigbeeBindingOf } from "@/lib/zigbee/binding";
import { STATUS_META, type Device, type DeviceReading, type DeviceStatus } from "@/lib/types";
import { listRules, type Rule, type RuleKey } from "./rules";
import { getChannel } from "./index";

let started = false;

/** 직전 관측 — 전이 판정용 */
const lastStatus = new Map<string, DeviceStatus>();
const lastWatts = new Map<string, number>();
const lastSoc = { value: null as number | null };
const lastShore = { connected: null as boolean | null };

export function startAlertMonitor(): void {
  if (started) return;
  started = true;
  if (process.env.ALERT_MONITOR !== "on") {
    console.log("[alert-monitor] 비활성 (ALERT_MONITOR=on 으로 켜세요)");
    return;
  }
  const interval = Number(process.env.ALERT_MONITOR_INTERVAL ?? 20000);
  console.log(`[alert-monitor] 활성 · ${interval}ms 주기 · 규칙은 /admin/notifications 에서 관리`);
  void tick();
  setInterval(() => void tick(), interval);
}

function link() {
  const base = process.env.APP_BASE_URL;
  return base ? { url: `${base}/`, urlTitle: "도면 열기" } : {};
}

async function push(rule: Rule, title: string, message: string) {
  const emergency = rule.priority === "emergency";
  await getChannel().send({
    title,
    message,
    priority: rule.priority,
    sound: emergency ? (process.env.ALERT_SOUND ?? "siren") : process.env.WARN_SOUND || undefined,
    retrySec: emergency ? Number(process.env.ALERT_RETRY ?? 30) : undefined,
    expireSec: emergency ? Number(process.env.ALERT_EXPIRE ?? 600) : undefined,
    ...link(),
  });
  console.log(`[alert-monitor] 발송(${rule.key}): ${title}`);
}

/** 장비 상태 전이 — 경고/주의/두절 */
async function checkDevices(rules: Map<RuleKey, Rule>, devices: Device[], byId: Map<string, DeviceReading>) {
  for (const d of devices) {
    if (!d.sensorId || d.enabled === false) continue;
    const reading = byId.get(d.sensorId);
    const status: DeviceStatus = reading?.status ?? "offline";
    const prev = lastStatus.get(d.sensorId);
    lastStatus.set(d.sensorId, status);
    if (prev === undefined || prev === status) continue; // 첫 관측이거나 변화 없음

    const detail = summarize(d, reading);
    if (status === "alert" && rules.get("device-alert")?.enabled) {
      await push(rules.get("device-alert")!, `🚨 경고 · ${d.name}`,
        `${d.name} 상태가 ${STATUS_META[status].label}로 전환됨 — ${detail}`);
    } else if (status === "warning" && rules.get("device-warning")?.enabled) {
      await push(rules.get("device-warning")!, `🟠 주의 · ${d.name}`,
        `${d.name} 상태가 ${STATUS_META[status].label}로 전환됨 — ${detail}`);
    } else if (status === "offline" && rules.get("device-offline")?.enabled) {
      await push(rules.get("device-offline")!, `⚪️ 통신 두절 · ${d.name}`,
        `${d.name} 가 응답을 멈췄습니다 (직전 상태: ${STATUS_META[prev].label})`);
    }
  }
}

/** 전기 계통 — 배터리 잔량, 육상 전원 */
async function checkElectrical(rules: Map<RuleKey, Rule>) {
  const socRule = rules.get("battery-soc-low");
  const shoreRule = rules.get("shore-power-lost");
  if (!socRule?.enabled && !shoreRule?.enabled) return;

  const snap = buildSnapshot();
  if (!snap.connected) return; // Victron 이 끊긴 상태의 값으로는 판단하지 않는다

  const soc = snap.system.soc;
  if (socRule?.enabled && soc != null) {
    const limit = socRule.values.soc;
    const prev = lastSoc.value;
    if (prev != null && prev >= limit && soc < limit) {
      await push(socRule, "🔋 배터리 잔량 부족",
        `하우스 배터리 ${Math.round(soc)}% — 임계 ${limit}% 아래로 내려갔습니다.`);
    }
    lastSoc.value = soc;
  }

  if (shoreRule?.enabled) {
    const now = snap.system.acInputConnected;
    const prev = lastShore.connected;
    if (prev === true && now === false) {
      await push(shoreRule, "🔌 육상 전원 끊김",
        "AC 입력이 끊겼습니다 — 이제 배터리로 공급됩니다.");
    }
    lastShore.connected = now;
  }
}

/** 스마트플러그 — 소비전력 급변 */
async function checkPlugs(rules: Map<RuleKey, Rule>, devices: Device[], byId: Map<string, DeviceReading>) {
  const rise = rules.get("plug-power-rise");
  const drop = rules.get("plug-power-drop");
  if (!rise?.enabled && !drop?.enabled) return;

  for (const d of devices) {
    if (!d.sensorId || !zigbeeBindingOf(d)) continue;
    const r = byId.get(d.sensorId);
    // 통신이 끊긴 플러그의 마지막 값으로 판단하면 0W 로 읽혀 오탐이 난다
    if (!r || (r.status !== "ok" && r.status !== "warning")) {
      lastWatts.delete(d.sensorId);
      continue;
    }
    const w = typeof r.values.watts === "number" ? r.values.watts : null;
    if (w == null) continue;
    const prev = lastWatts.get(d.sensorId);
    lastWatts.set(d.sensorId, w);
    if (prev === undefined) continue;

    if (rise?.enabled && prev < rise.values.watts && w >= rise.values.watts) {
      await push(rise, `⚡ 소비전력 급상승 · ${d.name}`,
        `${Math.round(prev)}W → ${Math.round(w)}W (임계 ${rise.values.watts}W)`);
    }
    // 급감은 켜져 있는 콘센트에서만 의미가 있다 (사람이 끈 경우는 알림 대상이 아니다)
    if (drop?.enabled && r.values.on === true && prev >= drop.values.watts && w < drop.values.watts) {
      await push(drop, `🔻 소비전력 급감 · ${d.name}`,
        `${Math.round(prev)}W → ${Math.round(w)}W — 물려 있는 기기가 멈춘 것으로 보입니다.`);
    }
  }
}

async function tick(): Promise<void> {
  try {
    const rules = new Map((await listRules()).map((r) => [r.key, r]));
    const devices = await readDevices();
    const readings = await getSensorSource().getReadings(devices);
    const byId = new Map(readings.map((r) => [r.sensorId, r]));

    // 규칙이 다 꺼져 있어도 기준선은 계속 갱신한다 — 켜는 순간 과거 값과
    // 비교해 엉뚱한 알림이 나가지 않도록.
    await checkDevices(rules, devices, byId);
    await checkElectrical(rules);
    await checkPlugs(rules, devices, byId);
  } catch (err) {
    console.error("[alert-monitor] tick 오류:", (err as Error).message);
  }
}
