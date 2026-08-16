// 계측 이력 — 지금 값만 보여주는 화면으로는 답할 수 없는 질문("밤새 얼마나 썼나",
// "언제부터 방전이 시작됐나")을 위해 주기적으로 표본을 남긴다.
//
// 저장소는 하루 한 파일의 JSONL (data/history/YYYY-MM-DD.jsonl). 한 줄이 한 표본:
//
//   {"t":1786838007973,"v":{"sys.soc":98.8,"sys.acLoadPower":112,"plug.dev-plug-1.watts":64}}
//
// 파일을 고른 이유: 추가는 append 한 줄이고, 보존은 오래된 파일 삭제이며, 문제가
// 생기면 사람이 열어 볼 수 있다. 이 배의 표본 수(분당 1개)에는 DB 가 과하다.
//
// 값이 없는 지표는 **키를 아예 넣지 않는다.** 0 으로 채우면 "센서가 끊긴 것"과
// "실제로 0 인 것"을 그래프에서 구분할 수 없게 된다.

import { promises as fs } from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "data", "history");
/** 표본 주기 — 1분. 더 촘촘히 남겨도 이 배에서 읽어낼 정보가 늘지 않는다 */
const SAMPLE_MS = 60_000;
/** 보존 기간 — 14일 (하루 1440줄 × 14 ≈ 20k 줄) */
const KEEP_DAYS = 14;

export interface Sample {
  t: number;
  v: Record<string, number>;
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function appendSample(s: Sample): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(path.join(DIR, `${dayKey(s.t)}.jsonl`), JSON.stringify(s) + "\n", "utf-8");
}

async function prune(): Promise<void> {
  const cutoff = dayKey(Date.now() - KEEP_DAYS * 86_400_000);
  const files = await fs.readdir(DIR).catch(() => [] as string[]);
  for (const f of files) {
    if (f.endsWith(".jsonl") && f.slice(0, 10) < cutoff) {
      await fs.unlink(path.join(DIR, f)).catch(() => {});
    }
  }
}

/** 표본 하나를 만든다 — 읽히지 않는 값은 넣지 않는다 */
async function collect(): Promise<Sample> {
  const v: Record<string, number> = {};
  const put = (k: string, n: unknown) => {
    if (typeof n === "number" && Number.isFinite(n)) v[k] = Math.round(n * 100) / 100;
  };

  // Victron 시스템 — 끊겨 있으면 통째로 건너뛴다 (마지막 값이 굳으면 안 된다)
  const { buildSnapshot } = await import("@/lib/victron/snapshot");
  const snap = buildSnapshot();
  if (snap.connected) {
    const s = snap.system;
    put("sys.soc", s.soc);
    put("sys.voltage", s.voltage);
    put("sys.current", s.current);
    put("sys.power", s.power);
    put("sys.pvPower", s.pvPower);
    put("sys.acLoadPower", s.acLoadPower);
    put("sys.dcLoadPower", s.dcLoadPower);
    put("sys.acInputPower", s.acInputConnected ? s.acInputPower : 0);
  }

  // 장비 리딩 — 숫자값만, 장비별로
  const { readDevices } = await import("@/lib/devices/registry");
  const { getSensorSource } = await import("@/lib/sensors");
  const devices = await readDevices();
  const readings = await getSensorSource().getReadings(devices);
  const byId = new Map(readings.map((r) => [r.sensorId, r]));
  for (const d of devices) {
    if (!d.sensorId) continue;
    const r = byId.get(d.sensorId);
    if (!r || (r.status !== "ok" && r.status !== "warning")) continue;
    for (const key of ["watts", "volts", "amps", "kwh", "duty"]) {
      put(`dev.${d.id}.${key}`, r.values[key]);
    }
  }

  return { t: Date.now(), v };
}

let started = false;

export function startHistoryCollector(): void {
  if (started) return;
  started = true;
  console.log(`[history] 계측 이력 수집 시작 · ${SAMPLE_MS / 1000}초 주기 · ${KEEP_DAYS}일 보존`);
  const tick = async () => {
    try {
      const s = await collect();
      // 값이 하나도 없으면(모든 소스 두절) 빈 줄을 남기지 않는다
      if (Object.keys(s.v).length > 0) await appendSample(s);
    } catch (err) {
      console.error("[history] 수집 오류:", (err as Error).message);
    }
  };
  void tick();
  setInterval(() => void tick(), SAMPLE_MS);
  void prune();
  setInterval(() => void prune(), 6 * 3600_000);
}

/** 구간 안의 표본을 시간순으로 읽는다 */
export async function readRange(fromMs: number, toMs: number): Promise<Sample[]> {
  const days: string[] = [];
  for (let t = fromMs; t <= toMs + 86_400_000; t += 86_400_000) days.push(dayKey(t));
  if (!days.includes(dayKey(toMs))) days.push(dayKey(toMs));

  const out: Sample[] = [];
  for (const day of [...new Set(days)]) {
    const raw = await fs.readFile(path.join(DIR, `${day}.jsonl`), "utf-8").catch(() => "");
    for (const line of raw.split("\n")) {
      if (!line) continue;
      try {
        const s = JSON.parse(line) as Sample;
        if (s.t >= fromMs && s.t <= toMs) out.push(s);
      } catch {
        /* 깨진 줄은 건너뛴다 — 쓰다가 중단된 마지막 줄일 수 있다 */
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * 화면 폭보다 촘촘한 표본은 의미가 없으므로 버킷 평균으로 줄인다.
 * 버킷에 표본이 하나도 없으면 **점을 만들지 않는다** — 선이 끊겨야 결측이 보인다.
 */
export function downsample(
  samples: Sample[],
  keys: string[],
  fromMs: number,
  toMs: number,
  buckets = 240,
): { t: number; v: Record<string, number> }[] {
  const width = Math.max(1, (toMs - fromMs) / buckets);
  const acc = new Map<number, { sum: Record<string, number>; n: Record<string, number> }>();

  for (const s of samples) {
    const b = Math.floor((s.t - fromMs) / width);
    let e = acc.get(b);
    if (!e) {
      e = { sum: {}, n: {} };
      acc.set(b, e);
    }
    for (const k of keys) {
      const val = s.v[k];
      if (typeof val !== "number") continue;
      e.sum[k] = (e.sum[k] ?? 0) + val;
      e.n[k] = (e.n[k] ?? 0) + 1;
    }
  }

  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([b, e]) => {
      const v: Record<string, number> = {};
      for (const k of keys) {
        if (e.n[k]) v[k] = Math.round((e.sum[k] / e.n[k]) * 100) / 100;
      }
      return { t: Math.round(fromMs + (b + 0.5) * width), v };
    })
    .filter((p) => Object.keys(p.v).length > 0);
}
