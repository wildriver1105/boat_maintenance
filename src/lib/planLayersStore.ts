// 레이어 가시성 영속화 — data/plan-layers.json (서버 전용)
import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_LAYERS, type PlanLayersConfig } from "./planLayers";

const FILE = path.join(process.cwd(), "data", "plan-layers.json");

export async function readLayers(): Promise<PlanLayersConfig> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf-8")) as Partial<PlanLayersConfig>;
    return {
      top: { ...DEFAULT_LAYERS.top, ...raw.top },
      side: { ...DEFAULT_LAYERS.side, ...raw.side },
      three: { ...DEFAULT_LAYERS.three, ...raw.three },
    };
  } catch {
    return DEFAULT_LAYERS;
  }
}

export async function writeLayers(patch: Partial<PlanLayersConfig>): Promise<PlanLayersConfig> {
  const cur = await readLayers();
  const next: PlanLayersConfig = {
    top: { ...cur.top, ...patch.top },
    side: { ...cur.side, ...patch.side },
    three: { ...cur.three, ...patch.three },
  };
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return next;
}
