// 알림 모니터 — 사용자가 만든 규칙을 주기적으로 평가해 푸시를 보낸다.
//
// 규칙마다 전용 코드를 두지 않는다. 규칙은 데이터(대상·지표·조건)이고 여기서는
// 그것을 일반적으로 평가한다 — 그래야 화면에서 만든 규칙이 즉시 동작한다.
//
//   ALERT_MONITOR           on 이어야 모니터가 돈다 (기본 off)
//   ALERT_MONITOR_INTERVAL  폴링 주기(ms, 기본 20000)
//   APP_BASE_URL            알림에 넣을 앱 링크 (옵션)
//
// 발송은 **가장자리에서만**: 조건이 거짓→참으로 바뀌는 순간 1회. 참인 동안 계속
// 보내면 폰이 울려대고, 그러면 사람이 알림 자체를 꺼버려 정작 중요한 걸 놓친다.
// 첫 관측은 참/거짓만 기록하고 보내지 않는다 (재시작 직후 스팸 방지).
//
// 규칙이 꺼져 있어도 평가는 계속한다. 그래야 규칙을 켜는 순간 몇 시간 전 값과
// 비교해 엉뚱한 알림이 나가지 않는다.

import { readDevices } from "@/lib/devices/registry";
import { getSensorSource } from "@/lib/sensors";
import { buildSnapshot } from "@/lib/victron/snapshot";
import { userKeysByIds } from "@/lib/notifications/recipients";
import type { Device, DeviceReading } from "@/lib/types";
import { describeRule, listRules, metricOf, type AlertRule } from "./rules";
import { getChannel } from "./index";

let started = false;

/** 규칙+대상별 직전 판정 (규칙id::대상id → 조건이 참이었는가) */
const lastTruth = new Map<string, boolean>();

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

/** 규칙이 보는 값 하나를 꺼낸다. 읽을 수 없으면 null (판정하지 않음) */
function valueFor(rule: AlertRule, subject: { reading?: DeviceReading; system?: Record<string, unknown> }): number | string | boolean | null {
  if (rule.scope === "system") {
    const v = subject.system?.[rule.metric];
    return typeof v === "number" || typeof v === "string" || typeof v === "boolean" ? v : null;
  }
  const r = subject.reading;
  if (!r) return null;
  if (rule.metric === "status") return r.status;
  const v = r.values[rule.metric];
  return typeof v === "number" || typeof v === "string" || typeof v === "boolean" ? v : null;
}

function isTrue(rule: AlertRule, value: number | string | boolean): boolean {
  if (rule.op === "becomes") return String(value) === String(rule.value);
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return false;
  return rule.op === "above" ? n >= Number(rule.value) : n < Number(rule.value);
}

function fmt(value: number | string | boolean, unit?: string): string {
  if (typeof value === "number") return `${Math.round(value * 100) / 100}${unit ? ` ${unit}` : ""}`;
  return String(value);
}

async function fire(rule: AlertRule, subjectName: string, value: number | string | boolean) {
  const m = metricOf(rule.metric, rule.scope);
  const emergency = rule.priority === "emergency";
  const base = process.env.APP_BASE_URL;
  // 규칙에 대상이 지정돼 있으면 그 사람들에게만, 없으면 활성 수신자 전원
  const to = rule.recipientIds?.length ? await userKeysByIds(rule.recipientIds) : undefined;

  await getChannel().send({
    title: `${emergency ? "🚨" : rule.priority === "high" ? "🟠" : "🔔"} ${rule.name}`,
    message: [
      `${subjectName} — ${m?.label ?? rule.metric} ${fmt(value, m?.unit)}`,
      describeRule(rule, subjectName),
      rule.note,
    ]
      .filter(Boolean)
      .join("\n"),
    priority: rule.priority,
    sound: emergency ? (process.env.ALERT_SOUND ?? "siren") : process.env.WARN_SOUND || undefined,
    retrySec: emergency ? Number(process.env.ALERT_RETRY ?? 30) : undefined,
    expireSec: emergency ? Number(process.env.ALERT_EXPIRE ?? 600) : undefined,
    url: base ? `${base}/` : undefined,
    urlTitle: base ? "도면 열기" : undefined,
    to,
  });
  console.log(`[alert-monitor] 발송(${rule.name}): ${subjectName} = ${fmt(value, m?.unit)}`);
}

/**
 * 한 (규칙, 대상) 쌍을 평가한다.
 * 값을 읽을 수 없으면 직전 판정을 지운다 — 통신이 끊겼다 돌아왔을 때
 * 끊기기 전 값과 비교해서 알림이 나가면 안 된다.
 */
async function evaluate(
  rule: AlertRule,
  subjectId: string,
  subjectName: string,
  value: number | string | boolean | null,
) {
  const key = `${rule.id}::${subjectId}`;
  if (value === null) {
    lastTruth.delete(key);
    return;
  }
  const now = isTrue(rule, value);
  const prev = lastTruth.get(key);
  lastTruth.set(key, now);
  if (prev === undefined || prev === now) return; // 첫 관측이거나 변화 없음
  if (!now) return; // 참 → 거짓(해제)은 발송하지 않는다
  if (!rule.enabled) return; // 판정만 갱신하고 조용히 넘어간다
  await fire(rule, subjectName, value);
}

async function tick(): Promise<void> {
  try {
    const rules = await listRules();
    const devices = await readDevices();
    const readings = await getSensorSource().getReadings(devices);
    const byId = new Map(readings.map((r) => [r.sensorId, r]));

    const needSystem = rules.some((r) => r.scope === "system");
    let system: Record<string, unknown> | undefined;
    if (needSystem) {
      const snap = buildSnapshot();
      // 끊긴 Victron 의 값으로는 판정하지 않는다 (전부 null 처리되어 판정 보류)
      system = snap.connected ? (snap.system as unknown as Record<string, unknown>) : undefined;
    }

    for (const rule of rules) {
      if (rule.scope === "system") {
        await evaluate(rule, "system", "Victron 시스템", valueFor(rule, { system }));
        continue;
      }
      const targets: Device[] =
        rule.deviceId === "*" || !rule.deviceId
          ? devices.filter((d) => d.sensorId && d.enabled !== false)
          : devices.filter((d) => d.id === rule.deviceId);

      for (const d of targets) {
        const reading = d.sensorId ? byId.get(d.sensorId) : undefined;
        // 대상 전체(*) 규칙은 그 지표를 가진 장비에만 적용한다 — 소비전력 규칙이
        // 전력을 재지 않는 장비까지 훑을 이유가 없다
        if (rule.deviceId === "*" && rule.metric !== "status" && reading?.values[rule.metric] === undefined) {
          lastTruth.delete(`${rule.id}::${d.id}`);
          continue;
        }
        await evaluate(rule, d.id, d.name, valueFor(rule, { reading }));
      }
    }
  } catch (err) {
    console.error("[alert-monitor] tick 오류:", (err as Error).message);
  }
}
