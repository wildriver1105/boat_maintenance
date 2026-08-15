// 알림 규칙 관리 — 관리자 전용.
// GET  → 카탈로그 + 현재 설정(켜짐/임계값)
// PUT  → { key, enabled?, params? } 부분 갱신
//
// 규칙 자체를 추가·삭제하는 경로는 없다. 목록은 모니터가 구현한 것과 1:1 이어야
// 하므로 코드가 소유한다 (src/lib/notifications/rules.ts).

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AUTH_DISABLED } from "@/lib/auth-mode";
import { listRules, updateRule } from "@/lib/notifications/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  if (AUTH_DISABLED) return true;
  const session = await auth();
  return session?.user?.role === "admin";
}

export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await listRules(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    key?: unknown;
    enabled?: unknown;
    params?: unknown;
  };
  if (typeof body.key !== "string")
    return NextResponse.json({ error: "key 필수" }, { status: 400 });

  const rule = await updateRule(body.key, {
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    params:
      body.params && typeof body.params === "object"
        ? (body.params as Record<string, number>)
        : undefined,
  });
  if (!rule) return NextResponse.json({ error: "알 수 없는 규칙입니다" }, { status: 404 });
  return NextResponse.json(rule);
}
