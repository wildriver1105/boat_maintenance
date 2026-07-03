// 단일 수행 기록 조회 / 항목 체크·메모·완료
import { NextResponse } from "next/server";
import {
  completeRun,
  getRun,
  setNote,
  toggleCheck,
} from "@/lib/procedures/registry";
import { actingUser } from "@/lib/procedures/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await actingUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    action: "check" | "note" | "complete";
    itemId?: string;
    checked?: boolean;
    note?: string;
  };
  const now = new Date().toISOString();

  let run;
  if (body.action === "check" && body.itemId) {
    run = await toggleCheck(id, body.itemId, !!body.checked, user, now);
  } else if (body.action === "note" && body.itemId) {
    run = await setNote(id, body.itemId, body.note ?? "");
  } else if (body.action === "complete") {
    run = await completeRun(id, now);
  } else {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}
