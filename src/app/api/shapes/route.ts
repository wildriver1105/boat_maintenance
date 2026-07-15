// 사용자 도형 CRUD API (로그인 필요 — 미들웨어가 보호)
import { NextResponse } from "next/server";
import { addShape, deleteShape, readShapes, updateShape, type ShapeInput } from "@/lib/shapes/registry";
import type { PlanShape } from "@/lib/shapes/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readShapes());
}

export async function POST(req: Request) {
  const body = (await req.json()) as ShapeInput;
  if (!body.view || !body.kind) {
    return NextResponse.json({ error: "view, kind 필수" }, { status: 400 });
  }
  const shape = await addShape(body);
  return NextResponse.json(shape, { status: 201 });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<PlanShape> & { id?: string };
  if (!body.id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  const { id, ...patch } = body;
  const shape = await updateShape(id, patch);
  if (!shape) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(shape);
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  const ok = await deleteShape(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
