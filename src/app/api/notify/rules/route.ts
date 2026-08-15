// 알림 규칙 CRUD — 관리자 전용.
// GET    → { rules, metrics } (지표 목록은 화면이 폼을 그리는 데 쓴다)
// POST   → 규칙 생성 (항상 비활성으로 시작)
// PUT    → 규칙 수정 { id, ... }
// DELETE → ?id=…
//
// 지표(metric)는 코드가 소유한다. 모니터가 실제로 읽을 수 있는 값이어야 하기
// 때문이다 — 없는 지표를 고를 수 있으면 켜도 아무 일 없는 규칙이 만들어진다.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AUTH_DISABLED } from "@/lib/auth-mode";
import { addRule, deleteRule, listRules, METRICS, updateRule } from "@/lib/notifications/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  if (AUTH_DISABLED) return true;
  const session = await auth();
  return session?.user?.role === "admin";
}

const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

export async function GET() {
  if (!(await requireAdmin())) return forbidden();
  return NextResponse.json(
    { rules: await listRules(), metrics: METRICS },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return forbidden();
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await addRule(body), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  try {
    const rule = await updateRule(body.id, body);
    if (!rule) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(rule);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return forbidden();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  const ok = await deleteRule(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
