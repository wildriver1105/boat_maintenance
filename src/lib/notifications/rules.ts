// 알림 규칙 — "무엇이 일어났을 때 푸시를 보낼 것인가".
//
// 규칙 목록(카탈로그)은 코드가 소유한다. 모니터가 실제로 구현한 것만 여기 있어야
// 한다 — 켜도 아무 일도 안 일어나는 토글은 없느니만 못하다. 사용자가 바꾸는 것은
// 켜짐/꺼짐과 임계값뿐이고, 그 부분만 data/alert-rules.json 에 저장한다.
//
// 새 규칙을 추가하면 저장 파일에 없으므로 기본값(비활성)으로 나타난다. 반대로
// 코드에서 사라진 규칙은 저장 파일에 남아 있어도 무시된다.

import { promises as fs } from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "alert-rules.json");

export type RuleKey =
  | "device-alert"
  | "device-warning"
  | "device-offline"
  | "battery-soc-low"
  | "shore-power-lost"
  | "plug-power-rise"
  | "plug-power-drop";

export type RuleGroup = "장비 상태" | "전기 계통" | "스마트플러그";

export interface RuleParam {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface RuleDef {
  key: RuleKey;
  group: RuleGroup;
  label: string;
  /** 언제 발송되는가 — 화면에 그대로 보여준다 */
  description: string;
  /** 왜 필요한가 / 무엇을 놓치지 않게 되는가 */
  why?: string;
  priority: "normal" | "high" | "emergency";
  params?: RuleParam[];
}

/** 구현되어 있는 규칙 전부. 여기 없는 알림은 발송되지 않는다. */
export const RULE_CATALOG: RuleDef[] = [
  {
    key: "device-alert",
    group: "장비 상태",
    label: "장비 경고 전환",
    description: "장비 상태가 '경고'로 바뀔 때 (전환 시 1회)",
    why: "긴급 — 사이렌 소리로 반복 발송됩니다.",
    priority: "emergency",
  },
  {
    key: "device-warning",
    group: "장비 상태",
    label: "장비 주의 전환",
    description: "장비 상태가 '주의'로 바뀔 때 (전환 시 1회)",
    priority: "high",
  },
  {
    key: "device-offline",
    group: "장비 상태",
    label: "장비 통신 두절",
    description: "값을 보내던 장비가 응답을 멈출 때",
    why: "계기가 멈춘 것을 모르고 '이상 없음'으로 착각하는 상황을 막습니다.",
    priority: "normal",
  },
  {
    key: "battery-soc-low",
    group: "전기 계통",
    label: "배터리 잔량 부족",
    description: "하우스 배터리 SoC 가 임계값 아래로 내려갈 때",
    priority: "high",
    params: [{ key: "soc", label: "임계 잔량", unit: "%", min: 5, max: 95, step: 5, default: 50 }],
  },
  {
    key: "shore-power-lost",
    group: "전기 계통",
    label: "육상 전원 끊김",
    description: "연결되어 있던 육상 전원(AC 입력)이 끊길 때",
    why: "정박 중 정전이면 냉장고·제습기가 배터리를 소모하기 시작합니다.",
    priority: "high",
  },
  {
    key: "plug-power-rise",
    group: "스마트플러그",
    label: "소비전력 급상승",
    description: "콘센트 소비전력이 임계값을 넘어설 때",
    why: "평소 쉬던 펌프가 돌기 시작한 것을 잡아냅니다.",
    priority: "high",
    params: [{ key: "watts", label: "임계 전력", unit: "W", min: 5, max: 3000, step: 5, default: 50 }],
  },
  {
    key: "plug-power-drop",
    group: "스마트플러그",
    label: "소비전력 급감",
    description: "켜져 있는 콘센트의 소비전력이 임계값 아래로 떨어질 때",
    why: "제습기 물통 만수, 냉장고 정지처럼 '조용히 멈춘' 상태를 알립니다.",
    priority: "normal",
    // min/step 은 기본값과 눈금이 맞아야 한다 — 어긋나면 슬라이더가 스냅되면서
    // 표시된 숫자와 손잡이 위치가 달라진다
    params: [{ key: "watts", label: "임계 전력", unit: "W", min: 5, max: 3000, step: 5, default: 5 }],
  },
];

/** 저장되는 부분 — 켜짐 여부와 임계값만 */
export interface RuleSetting {
  enabled: boolean;
  params?: Record<string, number>;
}

export type RuleSettings = Partial<Record<RuleKey, RuleSetting>>;

/**
 * 카탈로그 + 저장값을 합친 화면/모니터용 형태.
 * params 는 "어떤 임계값이 있는지"(정의), values 는 "지금 얼마인지"(값) — 이름을
 * 겹치게 두면 화면에서 범위와 값을 동시에 쓸 수 없다.
 */
export interface Rule extends RuleDef {
  enabled: boolean;
  values: Record<string, number>;
}

function defaults(def: RuleDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of def.params ?? []) out[p.key] = p.default;
  return out;
}

async function readSettings(): Promise<RuleSettings> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf-8")) as RuleSettings;
  } catch {
    return {}; // 파일이 없으면 전부 기본값(비활성)
  }
}

async function writeSettings(s: RuleSettings): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(s, null, 2) + "\n", "utf-8");
}

export async function listRules(): Promise<Rule[]> {
  const saved = await readSettings();
  return RULE_CATALOG.map((def) => {
    const s = saved[def.key];
    return {
      ...def,
      // 기본은 비활성 — 켜는 것은 사람이 의도적으로 해야 한다
      enabled: s?.enabled === true,
      values: { ...defaults(def), ...(s?.params ?? {}) },
    };
  });
}

export async function updateRule(
  key: string,
  patch: { enabled?: boolean; params?: Record<string, number> },
): Promise<Rule | null> {
  const def = RULE_CATALOG.find((d) => d.key === key);
  if (!def) return null;

  const saved = await readSettings();
  const cur = saved[def.key] ?? { enabled: false };
  const next: RuleSetting = {
    enabled: patch.enabled ?? cur.enabled,
    params: { ...defaults(def), ...(cur.params ?? {}) },
  };

  // 임계값은 카탈로그가 정한 범위 안으로만 — 화면을 우회해도 이상값이 들어오지 않게
  for (const [k, v] of Object.entries(patch.params ?? {})) {
    const p = def.params?.find((x) => x.key === k);
    if (!p || typeof v !== "number" || !Number.isFinite(v)) continue;
    next.params![k] = Math.min(p.max, Math.max(p.min, v));
  }

  saved[def.key] = next;
  await writeSettings(saved);
  return { ...def, enabled: next.enabled, values: next.params! };
}
