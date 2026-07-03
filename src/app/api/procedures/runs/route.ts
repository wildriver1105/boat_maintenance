// 절차 수행 기록 — 목록 조회 / 새 수행 시작
import { NextResponse } from "next/server";
import { createRun, listRuns } from "@/lib/procedures/registry";
import { actingUser } from "@/lib/procedures/session";
import { PHASE_ORDER, type ProcedurePhase } from "@/lib/procedures/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listRuns());
}

export async function POST(req: Request) {
  const user = await actingUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { phase?: ProcedurePhase };
  if (!body.phase || !PHASE_ORDER.includes(body.phase)) {
    return NextResponse.json({ error: "valid phase required" }, { status: 400 });
  }
  const run = await createRun(body.phase, user, new Date().toISOString());
  return NextResponse.json(run, { status: 201 });
}
