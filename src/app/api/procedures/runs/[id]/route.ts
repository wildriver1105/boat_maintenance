// 단일 실행 로그 — 조회 / 항목 체크·메모·완료 / 삭제(관리자)
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  completeRun,
  deleteRun,
  getRun,
  setNote,
  setStatus,
} from "@/lib/procedures/registry";
import type { CheckStatus } from "@/lib/procedures/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  const su = session?.user;
  if (!su) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = { id: su.id ?? su.email ?? "unknown", name: su.name ?? su.email ?? "알 수 없음" };
  const isAdmin = su.role === "admin";

  const body = (await req.json()) as {
    action: "status" | "note" | "complete";
    itemId?: string;
    status?: CheckStatus | "none";
    note?: string;
  };
  const now = new Date().toISOString();

  let run;
  if (body.action === "status" && body.itemId && body.status) {
    run = await setStatus(id, body.itemId, body.status, user, isAdmin, now);
  } else if (body.action === "note" && body.itemId) {
    run = await setNote(id, body.itemId, body.note ?? "");
  } else if (body.action === "complete") {
    run = await completeRun(id, user, now);
  } else {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const ok = await deleteRun(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
