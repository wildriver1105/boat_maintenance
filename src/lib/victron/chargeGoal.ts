// "배터리를 몇 %까지만 충전" — Victron 에는 이런 설정이 없다.
//
// MPPT 는 전압 기반으로 동작한다(벌크→흡수→플로트). 목표 SoC 라는 개념 자체가
// 없어서, 원하는 동작을 만들려면 **SoC 를 보고 충전 상한을 우리가 조절**해야
// 한다: 목표에 닿으면 DVCC 최대 충전 전류를 0 으로 내려 충전을 멈추고,
// 되돌림 폭만큼 떨어지면 원래 값으로 되돌린다.
//
// 왜 리튬에 이게 필요한가: LiFePO4 는 100% 로 오래 두면 수명이 준다. 정박 중
// 상시 만충 대신 80~90% 에서 멈추는 편이 낫다.
//
// ⚠ 이건 **우리가 만든 동작**이지 Victron 기능이 아니다. 그래서
//   - 기본은 꺼짐. 사람이 켜야 돈다.
//   - 앱이 죽으면 상한이 0 인 채로 남을 수 있다 → 켤 때 그 사실을 알린다.
//   - 되돌림(hysteresis)이 없으면 목표 근처에서 매초 껐다 켰다 한다.

import { promises as fs } from "fs";
import path from "path";
import { readVictron, writeVictron } from "./control";
import { getVictronBroker } from "./mqtt";

const FILE = path.join(process.cwd(), "data", "charge-goal.json");
const TICK_MS = 30_000;
const MAX_CURRENT_PATH = "settings/0/Settings/SystemSetup/MaxChargeCurrent";

export interface ChargeGoal {
  enabled: boolean;
  /** 이 SoC 에 닿으면 충전을 멈춘다 */
  targetSoc: number;
  /** 목표보다 이만큼 떨어지면 다시 충전한다 */
  resumeBelow: number;
  /** 멈추기 전의 상한 — 되돌릴 때 쓴다 (-1 = 제한 없음) */
  restoreCurrent: number;
  /** 지금 우리가 멈춰 둔 상태인가 */
  holding: boolean;
}

const DEFAULTS: ChargeGoal = {
  enabled: false,
  targetSoc: 90,
  resumeBelow: 80,
  restoreCurrent: -1,
  holding: false,
};

export async function readGoal(): Promise<ChargeGoal> {
  try {
    return { ...DEFAULTS, ...(JSON.parse(await fs.readFile(FILE, "utf-8")) as Partial<ChargeGoal>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeGoal(g: ChargeGoal): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(g, null, 2) + "\n", "utf-8");
}

export async function updateGoal(patch: Partial<ChargeGoal>): Promise<ChargeGoal> {
  const cur = await readGoal();
  const next: ChargeGoal = { ...cur, ...patch };
  next.targetSoc = Math.min(100, Math.max(20, Math.round(next.targetSoc)));
  // 되돌림은 목표보다 낮아야 한다 — 같거나 높으면 껐다 켰다를 반복한다
  next.resumeBelow = Math.min(next.targetSoc - 2, Math.max(10, Math.round(next.resumeBelow)));

  // 끄는 순간에는 우리가 걸어둔 상한을 반드시 되돌린다.
  // 안 그러면 "자동 제어를 껐는데 충전이 안 된다"가 된다.
  if (cur.holding && next.enabled === false) {
    writeVictron(MAX_CURRENT_PATH, cur.restoreCurrent);
    next.holding = false;
  }
  await writeGoal(next);
  return next;
}

let started = false;

export function startChargeGoal(): void {
  if (started) return;
  started = true;
  setInterval(() => void tick(), TICK_MS);
}

async function tick(): Promise<void> {
  try {
    const g = await readGoal();
    if (!g.enabled) return;

    const b = getVictronBroker();
    // 값을 못 읽는 상태에서 상한을 건드리면 안 된다 — 끊긴 사이에 배터리가
    // 어떻게 됐는지 모르는 채로 조작하는 셈이 된다.
    if (!b.connected) return;
    const soc = readVictron("system/0/Dc/Battery/Soc");
    if (soc == null) return;

    if (!g.holding && soc >= g.targetSoc) {
      const current = readVictron(MAX_CURRENT_PATH) ?? -1;
      const res = writeVictron(MAX_CURRENT_PATH, 0);
      if (res.ok) {
        await writeGoal({ ...g, holding: true, restoreCurrent: current });
        console.log(`[charge-goal] SoC ${soc}% ≥ 목표 ${g.targetSoc}% — 충전 상한 0A 로 멈춤`);
      }
    } else if (g.holding && soc <= g.resumeBelow) {
      const res = writeVictron(MAX_CURRENT_PATH, g.restoreCurrent);
      if (res.ok) {
        await writeGoal({ ...g, holding: false });
        console.log(`[charge-goal] SoC ${soc}% ≤ ${g.resumeBelow}% — 충전 재개(${g.restoreCurrent}A)`);
      }
    }
  } catch (err) {
    console.error("[charge-goal] 오류:", (err as Error).message);
  }
}
