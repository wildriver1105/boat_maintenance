// 디바이스 레지스트리 — 지금은 data/devices.json 파일에 영속화.
// 추후 이 파일만 Prisma/SQLite 구현으로 교체하면 나머지 코드는 그대로 유지됩니다.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Device } from "@/lib/types";

const DATA_FILE = path.join(process.cwd(), "data", "devices.json");

async function ensureFile(): Promise<void> {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, "[]\n", "utf-8");
  }
}

export async function readDevices(): Promise<Device[]> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  try {
    return JSON.parse(raw) as Device[];
  } catch {
    return [];
  }
}

export async function writeDevices(devices: Device[]): Promise<void> {
  await ensureFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(devices, null, 2) + "\n", "utf-8");
}

export async function addDevice(input: Omit<Device, "id">): Promise<Device> {
  const devices = await readDevices();
  const device: Device = { ...input, id: randomUUID() };
  devices.push(device);
  await writeDevices(devices);
  return device;
}

export async function updateDevice(
  id: string,
  patch: Partial<Omit<Device, "id">>,
): Promise<Device | null> {
  const devices = await readDevices();
  const idx = devices.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  devices[idx] = { ...devices[idx], ...patch, id };
  await writeDevices(devices);
  return devices[idx];
}

export async function deleteDevice(id: string): Promise<boolean> {
  const devices = await readDevices();
  const next = devices.filter((d) => d.id !== id);
  if (next.length === devices.length) return false;
  await writeDevices(next);
  return true;
}
