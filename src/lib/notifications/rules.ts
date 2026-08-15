// 알림 규칙 — "무엇이 일어났을 때 푸시를 보낼 것인가".
//
// 규칙은 데이터다. 사용자가 화면에서 만들고 고치고 지운다 (data/alert-rules.json).
// 그게 가능하려면 모니터가 규칙마다 전용 코드를 갖는 대신, 아래 세 조각을
// 조합해 **일반적으로 평가**할 수 있어야 한다:
//
//   대상(scope+deviceId) · 지표(metric) · 조건(op + value)
//
// 지표 목록(METRICS)만 코드가 소유한다. 실제로 읽을 수 있는 값이어야 하기
// 때문이다 — 없는 지표를 고를 수 있게 하면 켜도 아무 일 없는 규칙이 생긴다.
//
// 발송은 항상 **가장자리(edge)**에서만 한다: 조건이 거짓→참으로 바뀌는 순간
// 1회. 참인 동안 계속 보내면 폰이 울려대고, 그러면 사람이 알림 자체를 꺼버린다.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const DATA_FILE = path.join(process.cwd(), "data", "alert-rules.json");

export type RuleScope = "device" | "system";
export type RuleOp = "above" | "below" | "becomes";
export type RulePriority = "normal" | "high" | "emergency";

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  scope: RuleScope;
  /** scope=device 일 때 대상 장비. "*" 면 해당 지표를 가진 모든 장비 */
  deviceId?: string;
  metric: string;
  op: RuleOp;
  /** above/below 는 숫자, becomes 는 상태 문자열("alert"/"on" 등) */
  value: number | string;
  priority: RulePriority;
  /** 사용자 메모 (알림 본문에 덧붙는다) */
  note?: string;
  /**
   * 이 규칙을 받을 사람(수신자 id). 비어 있으면 활성 수신자 전원.
   * "빌지 경보는 선장만" 처럼 규칙마다 대상이 다를 수 있어서 규칙에 둔다.
   */
  recipientIds?: string[];
}

/** 화면이 고를 수 있는 지표 — 실제로 읽히는 것만 */
export interface MetricDef {
  key: string;
  label: string;
  scope: RuleScope;
  unit?: string;
  /** becomes 로 비교할 수 있는 값들 (숫자 지표면 없음) */
  states?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}

export const METRICS: MetricDef[] = [
  // ---- 장비 (센서 리딩) ----
  {
    key: "status",
    label: "장비 상태",
    scope: "device",
    states: [
      { value: "alert", label: "경고" },
      { value: "warning", label: "주의" },
      { value: "offline", label: "통신 두절" },
      { value: "ok", label: "정상" },
    ],
    hint: "상태가 그 값으로 바뀌는 순간 발송",
  },
  { key: "watts", label: "소비전력", scope: "device", unit: "W", min: 0, max: 3000, step: 5 },
  { key: "amps", label: "전류", scope: "device", unit: "A", min: 0, max: 30, step: 0.5 },
  { key: "volts", label: "전압", scope: "device", unit: "V", min: 0, max: 300, step: 1 },
  { key: "kwh", label: "누적 사용량", scope: "device", unit: "kWh", min: 0, max: 1000, step: 1 },
  { key: "duty", label: "조명 밝기", scope: "device", unit: "%", min: 0, max: 100, step: 5 },
  { key: "lqi", label: "Zigbee 링크 품질", scope: "device", unit: "", min: 0, max: 255, step: 5 },
  {
    key: "on",
    label: "전원 상태",
    scope: "device",
    states: [
      { value: "true", label: "켜짐" },
      { value: "false", label: "꺼짐" },
    ],
  },
  // ---- Victron 시스템 ----
  { key: "soc", label: "배터리 잔량", scope: "system", unit: "%", min: 0, max: 100, step: 5 },
  { key: "voltage", label: "배터리 전압", scope: "system", unit: "V", min: 0, max: 60, step: 0.1 },
  { key: "power", label: "배터리 순전력", scope: "system", unit: "W", min: -5000, max: 5000, step: 50, hint: "+ 충전 / − 방전" },
  { key: "pvPower", label: "솔라 발전", scope: "system", unit: "W", min: 0, max: 5000, step: 50 },
  { key: "acLoadPower", label: "AC 부하", scope: "system", unit: "W", min: 0, max: 5000, step: 50 },
  { key: "dcLoadPower", label: "DC 부하", scope: "system", unit: "W", min: 0, max: 3000, step: 25 },
  { key: "acInputPower", label: "육상 전원 입력", scope: "system", unit: "W", min: 0, max: 5000, step: 50 },
  {
    key: "acInputConnected",
    label: "육상 전원 연결",
    scope: "system",
    states: [
      { value: "false", label: "끊김" },
      { value: "true", label: "연결됨" },
    ],
  },
];

export function metricOf(key: string, scope: RuleScope): MetricDef | undefined {
  return METRICS.find((m) => m.key === key && m.scope === scope);
}

/** 처음 실행 시 넣어 두는 예시 규칙 — 전부 비활성. 지우거나 고쳐도 된다. */
function seedRules(): AlertRule[] {
  const mk = (r: Omit<AlertRule, "id" | "enabled">): AlertRule => ({
    ...r,
    id: randomUUID(),
    enabled: false,
  });
  return [
    mk({ name: "장비 경고 전환", scope: "device", deviceId: "*", metric: "status", op: "becomes", value: "alert", priority: "emergency" }),
    mk({ name: "장비 주의 전환", scope: "device", deviceId: "*", metric: "status", op: "becomes", value: "warning", priority: "high" }),
    mk({ name: "장비 통신 두절", scope: "device", deviceId: "*", metric: "status", op: "becomes", value: "offline", priority: "normal" }),
    mk({ name: "배터리 잔량 부족", scope: "system", metric: "soc", op: "below", value: 50, priority: "high" }),
    mk({ name: "육상 전원 끊김", scope: "system", metric: "acInputConnected", op: "becomes", value: "false", priority: "high" }),
    mk({ name: "콘센트 소비전력 급상승", scope: "device", deviceId: "*", metric: "watts", op: "above", value: 50, priority: "high", note: "평소 쉬던 펌프가 돌기 시작한 것을 잡아냅니다." }),
    mk({ name: "콘센트 소비전력 급감", scope: "device", deviceId: "*", metric: "watts", op: "below", value: 5, priority: "normal", note: "제습기 물통 만수, 냉장고 정지처럼 조용히 멈춘 상태." }),
  ];
}

async function readFile(): Promise<AlertRule[] | null> {
  try {
    const raw = JSON.parse(await fs.readFile(DATA_FILE, "utf-8"));
    return Array.isArray(raw) ? (raw as AlertRule[]) : null;
  } catch {
    return null;
  }
}

async function writeFile(rules: AlertRule[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(rules, null, 2) + "\n", "utf-8");
}

export async function listRules(): Promise<AlertRule[]> {
  const existing = await readFile();
  if (existing) return existing;
  // 파일이 없거나 옛 형식(객체)이면 예시 규칙으로 시작한다
  const seeded = seedRules();
  await writeFile(seeded);
  return seeded;
}

/** 화면/API 가 넘긴 값을 규칙으로 정규화. 문제가 있으면 사유를 던진다 */
function normalize(input: Partial<AlertRule>, base?: AlertRule): AlertRule {
  const scope: RuleScope = (input.scope ?? base?.scope ?? "device") as RuleScope;
  const metricKey = input.metric ?? base?.metric ?? "";
  const metric = metricOf(metricKey, scope);
  if (!metric) throw new Error("알 수 없는 지표입니다");

  const op: RuleOp = (input.op ?? base?.op ?? (metric.states ? "becomes" : "above")) as RuleOp;
  if (metric.states && op !== "becomes") throw new Error("이 지표는 '~로 바뀔 때'만 쓸 수 있습니다");
  if (!metric.states && op === "becomes") throw new Error("숫자 지표는 임계값 비교만 쓸 수 있습니다");

  let value = input.value ?? base?.value;
  if (metric.states) {
    if (!metric.states.some((s) => s.value === String(value)))
      throw new Error("허용되지 않은 값입니다");
    value = String(value);
  } else {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error("임계값은 숫자여야 합니다");
    // 지표가 정한 범위 안으로 — 화면을 우회해도 이상값이 들어오지 않게
    value = Math.min(metric.max ?? n, Math.max(metric.min ?? n, n));
  }

  const name = (input.name ?? base?.name ?? "").trim();
  if (!name) throw new Error("규칙 이름을 입력하세요");

  return {
    id: base?.id ?? randomUUID(),
    name,
    enabled: input.enabled ?? base?.enabled ?? false,
    scope,
    deviceId: scope === "device" ? (input.deviceId ?? base?.deviceId ?? "*") : undefined,
    metric: metricKey,
    op,
    value: value as number | string,
    priority: (input.priority ?? base?.priority ?? "normal") as RulePriority,
    note: (input.note ?? base?.note ?? "").trim() || undefined,
    recipientIds: (input.recipientIds ?? base?.recipientIds ?? []).filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    ),
  };
}

export async function addRule(input: Partial<AlertRule>): Promise<AlertRule> {
  const rules = await listRules();
  // 새 규칙은 꺼진 채로 만든다 — 만들자마자 울리면 놀란다
  const rule = normalize({ ...input, enabled: input.enabled ?? false });
  rules.push(rule);
  await writeFile(rules);
  return rule;
}

export async function updateRule(id: string, patch: Partial<AlertRule>): Promise<AlertRule | null> {
  const rules = await listRules();
  const i = rules.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const next = normalize(patch, rules[i]);
  rules[i] = next;
  await writeFile(rules);
  return next;
}

export async function deleteRule(id: string): Promise<boolean> {
  const rules = await listRules();
  const next = rules.filter((r) => r.id !== id);
  if (next.length === rules.length) return false;
  await writeFile(next);
  return true;
}

/** 규칙을 사람이 읽는 한 줄로 — 화면과 알림 본문에서 같은 문장을 쓴다 */
export function describeRule(r: AlertRule, deviceName?: string): string {
  const m = metricOf(r.metric, r.scope);
  const label = m?.label ?? r.metric;
  const who = r.scope === "system" ? "시스템" : r.deviceId === "*" ? "모든 장비" : (deviceName ?? "장비");
  if (r.op === "becomes") {
    const state = m?.states?.find((s) => s.value === String(r.value))?.label ?? String(r.value);
    return `${who} · ${label}이(가) '${state}'로 바뀔 때`;
  }
  const unit = m?.unit ? ` ${m.unit}` : "";
  return `${who} · ${label}이(가) ${r.value}${unit} ${r.op === "above" ? "이상이 될 때" : "미만이 될 때"}`;
}
