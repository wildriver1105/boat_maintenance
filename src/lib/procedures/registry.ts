// 프로시저 레지스트리 — 템플릿(data/procedures.json)과 수행 기록(data/procedure-runs.json)을
// 파일에 영속화. devices/users 레지스트리와 동일 패턴 (추후 DB 로 교체).
// 체크 기록의 checkedBy/At 는 호출한 API 라우트가 세션에서 넘긴 값만 사용 — 위조 불가.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  ProcedurePhase,
  ProcedureRun,
  ProcedureTemplate,
} from "./types";
import { DEFAULT_TEMPLATES } from "./defaults";

const TPL_FILE = path.join(process.cwd(), "data", "procedures.json");
const RUN_FILE = path.join(process.cwd(), "data", "procedure-runs.json");

// 파일 read-modify-write 직렬화 락 — 여러 크루의 동시 체크로 인한 lost-update 방지.
// (단일 서버 프로세스 기준; 추후 DB 로 교체 시 트랜잭션으로 대체)
let writeChain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function ensure(file: string, seed: string) {
  try {
    await fs.access(file);
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, seed, "utf-8");
  }
}

export async function readTemplates(): Promise<ProcedureTemplate[]> {
  await ensure(TPL_FILE, JSON.stringify(DEFAULT_TEMPLATES, null, 2) + "\n");
  try {
    return JSON.parse(await fs.readFile(TPL_FILE, "utf-8")) as ProcedureTemplate[];
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export async function templateFor(
  phase: ProcedurePhase,
): Promise<ProcedureTemplate | undefined> {
  return (await readTemplates()).find((t) => t.phase === phase);
}

async function readRuns(): Promise<ProcedureRun[]> {
  await ensure(RUN_FILE, "[]\n");
  try {
    return JSON.parse(await fs.readFile(RUN_FILE, "utf-8")) as ProcedureRun[];
  } catch {
    return [];
  }
}

async function writeRuns(runs: ProcedureRun[]): Promise<void> {
  await ensure(RUN_FILE, "[]\n");
  await fs.writeFile(RUN_FILE, JSON.stringify(runs, null, 2) + "\n", "utf-8");
}

/** 최신순 전체 기록 */
export async function listRuns(): Promise<ProcedureRun[]> {
  const runs = await readRuns();
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getRun(id: string): Promise<ProcedureRun | undefined> {
  return (await readRuns()).find((r) => r.id === id);
}

export interface ActingUser {
  id: string;
  name: string;
}

export async function createRun(
  phase: ProcedurePhase,
  user: ActingUser,
  now: string,
): Promise<ProcedureRun> {
  const tpl = await templateFor(phase);
  if (!tpl) throw new Error("unknown phase");
  return withLock(async () => {
    const runs = await readRuns();
    const run: ProcedureRun = {
      id: randomUUID(),
      phase,
      title: tpl.title,
      startedBy: user.id,
      startedByName: user.name,
      startedAt: now,
      checks: [],
    };
    runs.push(run);
    await writeRuns(runs);
    return run;
  });
}

/** 항목 체크 토글 — 체크 시 세션 사용자/시각 기록, 해제 시 기록 삭제 */
export async function toggleCheck(
  runId: string,
  itemId: string,
  checked: boolean,
  user: ActingUser,
  now: string,
): Promise<ProcedureRun | null> {
  return withLock(async () => {
    const runs = await readRuns();
    const run = runs.find((r) => r.id === runId);
    if (!run) return null;
    if (run.completedAt) return run; // 완료된 기록은 수정 불가
    const existing = run.checks.find((c) => c.itemId === itemId);
    if (checked) {
      if (!existing) {
        run.checks.push({
          itemId,
          checkedBy: user.id,
          checkedByName: user.name,
          checkedAt: now,
        });
      }
    } else {
      run.checks = run.checks.filter((c) => c.itemId !== itemId);
    }
    await writeRuns(runs);
    return run;
  });
}

/** 이미 체크된 항목에 메모 추가/수정 (체크한 사람/시각은 유지) */
export async function setNote(
  runId: string,
  itemId: string,
  note: string,
): Promise<ProcedureRun | null> {
  return withLock(async () => {
    const runs = await readRuns();
    const run = runs.find((r) => r.id === runId);
    if (!run || run.completedAt) return run ?? null;
    const rec = run.checks.find((c) => c.itemId === itemId);
    if (rec) rec.note = note.trim() || undefined;
    await writeRuns(runs);
    return run;
  });
}

export async function completeRun(
  runId: string,
  now: string,
): Promise<ProcedureRun | null> {
  return withLock(async () => {
    const runs = await readRuns();
    const run = runs.find((r) => r.id === runId);
    if (!run) return null;
    run.completedAt = now;
    await writeRuns(runs);
    return run;
  });
}
