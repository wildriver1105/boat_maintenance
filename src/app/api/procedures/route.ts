// 체크리스트 템플릿 조회
import { NextResponse } from "next/server";
import { readTemplates } from "@/lib/procedures/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readTemplates());
}
