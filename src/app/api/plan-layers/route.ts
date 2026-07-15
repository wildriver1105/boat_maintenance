// 도면 레이어 가시성 조회/수정
import { NextResponse } from "next/server";
import { readLayers, writeLayers } from "@/lib/planLayersStore";
import type { PlanLayersConfig } from "@/lib/planLayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readLayers());
}

export async function PUT(req: Request) {
  const patch = (await req.json()) as Partial<PlanLayersConfig>;
  return NextResponse.json(await writeLayers(patch));
}
