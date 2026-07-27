// 임포트된 3D 모델(GLB) 레지스트리 — 파일은 data/models/, 메타는 data/models.json.
// 블렌더 등에서 만든 .glb 를 업로드해 3D 씬에 배치한다.
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export interface ImportedModel {
  id: string;
  name: string;
  /** data/models/ 내 파일명 (uuid.glb) */
  file: string;
  /** 3D 월드 배치 (미터 근사 단위) */
  x: number;
  y: number;
  z: number;
  /** Y축 회전 (도) */
  rotYDeg: number;
  scale: number;
  visible: boolean;
}

const DIR = path.join(process.cwd(), "data", "models");
const META = path.join(process.cwd(), "data", "models.json");

let writeChain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

async function ensure(): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  try {
    await fs.access(META);
  } catch {
    await fs.writeFile(META, "[]\n", "utf-8");
  }
}

export async function listModels(): Promise<ImportedModel[]> {
  await ensure();
  try {
    return JSON.parse(await fs.readFile(META, "utf-8")) as ImportedModel[];
  } catch {
    return [];
  }
}

async function write(list: ImportedModel[]): Promise<void> {
  await ensure();
  await fs.writeFile(META, JSON.stringify(list, null, 2) + "\n", "utf-8");
}

export async function addModel(name: string, data: Buffer): Promise<ImportedModel> {
  return withLock(async () => {
    await ensure();
    const id = randomUUID();
    const file = `${id}.glb`;
    await fs.writeFile(path.join(DIR, file), data);
    const list = await listModels();
    const m: ImportedModel = {
      id,
      name: name.trim() || "모델",
      file,
      x: 0,
      y: 0,
      z: 0,
      rotYDeg: 0,
      scale: 1,
      visible: true,
    };
    list.push(m);
    await write(list);
    return m;
  });
}

export async function updateModel(
  id: string,
  patch: Partial<Omit<ImportedModel, "id" | "file">>,
): Promise<ImportedModel | null> {
  return withLock(async () => {
    const list = await listModels();
    const i = list.findIndex((m) => m.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch, id, file: list[i].file };
    await write(list);
    return list[i];
  });
}

export async function deleteModel(id: string): Promise<boolean> {
  return withLock(async () => {
    const list = await listModels();
    const m = list.find((x) => x.id === id);
    if (!m) return false;
    await write(list.filter((x) => x.id !== id));
    await fs.unlink(path.join(DIR, m.file)).catch(() => {});
    return true;
  });
}

/** 파일 서빙용 — 등록된 파일명만 허용 (경로 탈출 방지) */
export async function modelFilePath(file: string): Promise<string | null> {
  const list = await listModels();
  if (!list.some((m) => m.file === file)) return null;
  return path.join(DIR, file);
}
