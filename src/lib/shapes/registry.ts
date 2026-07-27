// 사용자 도형 레지스트리 — data/shapes.json 파일 영속화 (devices 와 동일 패턴).
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { DEFAULT_STYLE, type PlanShape, type ShapeStyle } from "./types";

/** 생성 입력 — style 은 부분 지정 가능(기본값 병합) */
export type ShapeInput = Omit<PlanShape, "id" | "style"> & { style?: Partial<ShapeStyle> };

const FILE = path.join(process.cwd(), "data", "shapes.json");

let writeChain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

async function ensure(): Promise<void> {
  try {
    await fs.access(FILE);
  } catch {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, "[]\n", "utf-8");
  }
}

export async function readShapes(): Promise<PlanShape[]> {
  await ensure();
  try {
    return JSON.parse(await fs.readFile(FILE, "utf-8")) as PlanShape[];
  } catch {
    return [];
  }
}

async function writeShapes(list: PlanShape[]): Promise<void> {
  await ensure();
  await fs.writeFile(FILE, JSON.stringify(list, null, 2) + "\n", "utf-8");
}

export async function addShape(input: ShapeInput): Promise<PlanShape> {
  return withLock(async () => {
    const list = await readShapes();
    const shape: PlanShape = {
      show3d: true,
      height3d: 0.5,
      elevation3d: -0.3,
      ...input,
      style: { ...DEFAULT_STYLE, ...input.style },
      id: randomUUID(),
    };
    list.push(shape);
    await writeShapes(list);
    return shape;
  });
}

export async function updateShape(
  id: string,
  patch: Partial<Omit<PlanShape, "id">>,
): Promise<PlanShape | null> {
  return withLock(async () => {
    const list = await readShapes();
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return null;
    list[i] = {
      ...list[i],
      ...patch,
      style: patch.style ? { ...list[i].style, ...patch.style } : list[i].style,
      id,
    };
    await writeShapes(list);
    return list[i];
  });
}

export async function deleteShape(id: string): Promise<boolean> {
  return withLock(async () => {
    const list = await readShapes();
    const next = list.filter((s) => s.id !== id);
    if (next.length === list.length) return false;
    await writeShapes(next);
    return true;
  });
}
