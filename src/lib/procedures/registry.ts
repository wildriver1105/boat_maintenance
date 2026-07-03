// 프로시저 레지스트리 — 템플릿(data/procedures.json)과 실행 로그(data/procedure-runs.json)를
// JSON 파일에 영속화. devices/users 레지스트리와 동일 패턴 (추후 DB 로 교체).
// 체크/완료 기록의 사용자·시각은 호출한 API 라우트가 세션에서 넘긴 값만 사용 — 위조 불가.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ChecklistItem, ProcedureRun, ProcedureTemplate } from "./types";
import { DEFAULT_TEMPLATES } from "./defaults";

const TPL_FILE = path.join(process.cwd(), "data", "procedures.json");
const RUN_FILE = path.join(process.cwd(), "data", "procedure-runs.json");

// 파일 read-modify-write 직렬화 락 — 동시 쓰기로 인한 lost-update 방지.
let writeChain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(() => undefined, () => undefined);
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

/* ---------------- 템플릿 ---------------- */

export async function readTemplates(): Promise<ProcedureTemplate[]> {
  await ensure(TPL_FILE, JSON.stringify(DEFAULT_TEMPLATES, null, 2) + "\n");
  try {
    const list = JSON.parse(await fs.readFile(TPL_FILE, "utf-8")) as ProcedureTemplate[];
    return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

async function writeTemplates(list: ProcedureTemplate[]) {
  await ensure(TPL_FILE, "[]\n");
  await fs.writeFile(TPL_FILE, JSON.stringify(list, null, 2) + "\n", "utf-8");
}

export async function getTemplate(id: string): Promise<ProcedureTemplate | undefined> {
  return (await readTemplates()).find((t) => t.id === id);
}

/** 항목 id 가 없으면 부여 (관리 UI 에서 새 항목 추가 시) */
function normalizeItems(items: ChecklistItem[] = []): ChecklistItem[] {
  return items.map((it) => ({
    id: it.id?.trim() || randomUUID(),
    label: it.label.trim(),
    detail: it.detail?.trim() || undefined,
    deviceId: it.deviceId?.trim() || undefined,
    required: !!it.required,
  }));
}

export async function createTemplate(
  input: Partial<ProcedureTemplate>,
): Promise<ProcedureTemplate> {
  return withLock(async () => {
    const list = await readTemplates();
    const tpl: ProcedureTemplate = {
      id: (input.id?.trim() || `tpl-${randomUUID().slice(0, 8)}`),
      title: input.title?.trim() || "새 체크리스트",
      category: input.category?.trim() || undefined,
      icon: input.icon || "📋",
      color: input.color || "#0ea5e9",
      order: input.order ?? list.length + 1,
      items: normalizeItems(input.items),
    };
    if (list.some((t) => t.id === tpl.id)) tpl.id = `tpl-${randomUUID().slice(0, 8)}`;
    list.push(tpl);
    await writeTemplates(list);
    return tpl;
  });
}

export async function updateTemplate(
  id: string,
  patch: Partial<ProcedureTemplate>,
): Promise<ProcedureTemplate | null> {
  return withLock(async () => {
    const list = await readTemplates();
    const i = list.findIndex((t) => t.id === id);
    if (i < 0) return null;
    list[i] = {
      ...list[i],
      ...patch,
      id,
      items: patch.items ? normalizeItems(patch.items) : list[i].items,
    };
    await writeTemplates(list);
    return list[i];
  });
}

export async function deleteTemplate(id: string): Promise<boolean> {
  return withLock(async () => {
    const list = await readTemplates();
    const next = list.filter((t) => t.id !== id);
    if (next.length === list.length) return false;
    await writeTemplates(next);
    return true;
  });
}

/* ---------------- 실행 로그(run) ---------------- */

async function readRuns(): Promise<ProcedureRun[]> {
  await ensure(RUN_FILE, "[]\n");
  try {
    return JSON.parse(await fs.readFile(RUN_FILE, "utf-8")) as ProcedureRun[];
  } catch {
    return [];
  }
}

async function writeRuns(runs: ProcedureRun[]) {
  await ensure(RUN_FILE, "[]\n");
  await fs.writeFile(RUN_FILE, JSON.stringify(runs, null, 2) + "\n", "utf-8");
}

export async function listRuns(): Promise<ProcedureRun[]> {
  return (await readRuns()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getRun(id: string): Promise<ProcedureRun | undefined> {
  return (await readRuns()).find((r) => r.id === id);
}

export interface ActingUser {
  id: string;
  name: string;
}

export async function createRun(
  templateId: string,
  user: ActingUser,
  now: string,
): Promise<ProcedureRun> {
  const tpl = await getTemplate(templateId);
  if (!tpl) throw new Error("unknown template");
  return withLock(async () => {
    const runs = await readRuns();
    const run: ProcedureRun = {
      id: randomUUID(),
      templateId: tpl.id,
      title: tpl.title,
      category: tpl.category,
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
    if (run.completedAt) return run;
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
  user: ActingUser,
  now: string,
): Promise<ProcedureRun | null> {
  return withLock(async () => {
    const runs = await readRuns();
    const run = runs.find((r) => r.id === runId);
    if (!run) return null;
    run.completedAt = now;
    run.completedBy = user.id;
    run.completedByName = user.name;
    await writeRuns(runs);
    return run;
  });
}

export async function deleteRun(runId: string): Promise<boolean> {
  return withLock(async () => {
    const runs = await readRuns();
    const next = runs.filter((r) => r.id !== runId);
    if (next.length === runs.length) return false;
    await writeRuns(next);
    return true;
  });
}
