// 단일 템플릿 — 수정 / 삭제 (관리자 전용). 조회는 목록(GET /api/procedures) 사용.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteTemplate, updateTemplate } from "@/lib/procedures/registry";
import type { ProcedureTemplate } from "@/lib/procedures/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  return session?.user?.role === "admin";
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const patch = (await req.json()) as Partial<ProcedureTemplate>;
  const tpl = await updateTemplate(id, patch);
  if (!tpl) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(tpl);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const ok = await deleteTemplate(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
