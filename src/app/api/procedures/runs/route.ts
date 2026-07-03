// 절차 실행 로그 — 목록 조회 / 새 실행 시작
import { NextResponse } from "next/server";
import { createRun, listRuns } from "@/lib/procedures/registry";
import { actingUser } from "@/lib/procedures/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listRuns());
}

export async function POST(req: Request) {
  const user = await actingUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { templateId?: string };
  if (!body.templateId)
    return NextResponse.json({ error: "templateId required" }, { status: 400 });
  try {
    const run = await createRun(body.templateId, user, new Date().toISOString());
    return NextResponse.json(run, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
