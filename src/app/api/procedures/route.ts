// 체크리스트 템플릿 — 목록 조회(모두) / 생성(관리자)
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createTemplate, readTemplates } from "@/lib/procedures/registry";
import type { ProcedureTemplate } from "@/lib/procedures/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readTemplates());
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as Partial<ProcedureTemplate>;
  const tpl = await createTemplate(body);
  return NextResponse.json(tpl, { status: 201 });
}
