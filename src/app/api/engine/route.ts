// 엔진 사양·정비 API.
// GET  — 레코드 + 항목별 잔여 주기
// PUT  — { hours, date } 운전시간 갱신 / { itemId, ...patch } 정비 항목 수정
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AUTH_DISABLED } from "@/lib/auth-mode";
import { computeDue, readEngine, updateHours, updateItem } from "@/lib/engine/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function allowed() {
  if (AUTH_DISABLED) return true;
  const session = await auth();
  return !!session?.user;
}

export async function GET() {
  const rec = await readEngine();
  if (!rec) return NextResponse.json({ error: "엔진 정보 없음" }, { status: 404 });
  return NextResponse.json({ ...rec, due: computeDue(rec) }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request) {
  if (!(await allowed()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    hours?: number;
    date?: string;
    itemId?: string;
    spec?: string | null;
    intervalHours?: number | null;
    intervalMonths?: number | null;
    lastHours?: number | null;
    lastDate?: string | null;
    notes?: string | null;
  };

  if (body.itemId) {
    const { itemId, ...patch } = body;
    const rec = await updateItem(itemId, patch);
    if (!rec) return NextResponse.json({ error: "항목 없음" }, { status: 404 });
    return NextResponse.json({ ...rec, due: computeDue(rec) });
  }

  if (typeof body.hours === "number") {
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const rec = await updateHours(body.hours, date);
    if (!rec) return NextResponse.json({ error: "엔진 정보 없음" }, { status: 404 });
    return NextResponse.json({ ...rec, due: computeDue(rec) });
  }

  return NextResponse.json({ error: "hours 또는 itemId 가 필요합니다" }, { status: 400 });
}
