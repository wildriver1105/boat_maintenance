// 디바이스 레지스트리 CRUD API
import { NextResponse } from "next/server";
import {
  readDevices,
  addDevice,
  updateDevice,
  deleteDevice,
} from "@/lib/devices/registry";
import { DEVICE_CATEGORIES, type Device } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validate(body: Partial<Device>): string | null {
  if (!body.name || typeof body.name !== "string") return "name is required";
  if (!body.category || !DEVICE_CATEGORIES.includes(body.category))
    return "valid category is required";
  if (
    !body.position ||
    typeof body.position.x !== "number" ||
    typeof body.position.y !== "number"
  )
    return "position {x,y} is required";
  return null;
}

export async function GET() {
  const devices = await readDevices();
  return NextResponse.json(devices);
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Device>;
  const err = validate(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const device = await addDevice({
    name: body.name!,
    category: body.category!,
    position: body.position!,
    sensorId: body.sensorId,
    config: body.config,
    notes: body.notes,
  });
  return NextResponse.json(device, { status: 201 });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<Device> & { id?: string };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { id, ...patch } = body;
  const updated = await updateDevice(id, patch);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const ok = await deleteDevice(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
