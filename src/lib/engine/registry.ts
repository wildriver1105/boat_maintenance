// 엔진 레코드 저장소 — data/engine.json.
// devices/procedures 레지스트리와 같은 패턴(파일 기반). 이후 DB 로 교체 가능.
import { promises as fs } from "fs";
import path from "path";
import type { EngineRecord, MaintenanceDue, MaintenanceItem } from "./types";

const FILE = path.join(process.cwd(), "data", "engine.json");

export async function readEngine(): Promise<EngineRecord | null> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf-8")) as EngineRecord;
  } catch {
    return null;
  }
}

async function write(rec: EngineRecord): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rec, null, 2) + "\n", "utf-8");
}

/** 운전시간 갱신 (시간계 판독값 수동 입력) */
export async function updateHours(hours: number, date: string): Promise<EngineRecord | null> {
  const rec = await readEngine();
  if (!rec) return null;
  rec.hours = hours;
  rec.hoursUpdated = date;
  await write(rec);
  return rec;
}

/** 정비 항목 수정 (주기·규격 입력, 정비 완료 기록) */
export async function updateItem(
  id: string,
  patch: Partial<Omit<MaintenanceItem, "id">>,
): Promise<EngineRecord | null> {
  const rec = await readEngine();
  if (!rec) return null;
  const i = rec.maintenance.findIndex((m) => m.id === id);
  if (i < 0) return null;
  rec.maintenance[i] = { ...rec.maintenance[i], ...patch, id };
  await write(rec);
  return rec;
}

function monthsBetween(from: string, to: Date): number {
  const a = new Date(from);
  if (Number.isNaN(a.getTime())) return 0;
  return (to.getFullYear() - a.getFullYear()) * 12 + (to.getMonth() - a.getMonth());
}

/**
 * 항목별 잔여 주기 계산.
 * 주기(시간/개월)가 입력되지 않았거나 마지막 정비 기록이 없으면 null — "알 수 없음"이지
 * "정상"이 아니다. UI 에서 그렇게 구분해 보여준다.
 */
export function computeDue(rec: EngineRecord, now = new Date()): MaintenanceDue[] {
  return rec.maintenance.map((m) => {
    const hoursLeft =
      m.intervalHours != null && m.lastHours != null && rec.hours != null
        ? m.lastHours + m.intervalHours - rec.hours
        : null;
    const monthsLeft =
      m.intervalMonths != null && m.lastDate
        ? m.intervalMonths - monthsBetween(m.lastDate, now)
        : null;

    const overdue = (hoursLeft != null && hoursLeft < 0) || (monthsLeft != null && monthsLeft < 0);
    const soon =
      !overdue &&
      ((hoursLeft != null && m.intervalHours != null && hoursLeft <= m.intervalHours * 0.1) ||
        (monthsLeft != null && monthsLeft <= 1));

    return { itemId: m.id, hoursLeft, monthsLeft, overdue, soon };
  });
}
