// 알림 상태 조회 / 테스트 발송 — 관리자 전용.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getChannel } from "@/lib/notifications";
import type { NotifyPriority } from "@/lib/notifications/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  return session?.user?.role === "admin" ? session : null;
}

export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const channel = getChannel();
  return NextResponse.json({
    channel: channel.name,
    configured: channel.configured,
    monitor: process.env.ALERT_MONITOR === "on",
    monitorLevel: process.env.ALERT_MONITOR_LEVEL ?? "alert",
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    message?: string;
    priority?: NotifyPriority;
  };

  const result = await getChannel().send({
    title: body.title ?? "⛵ 테스트 알림",
    message:
      body.message ??
      "Oceanis Clipper 473 유지보수 디스플레이 · 푸시 알림 연결 테스트입니다.",
    priority: body.priority ?? "normal",
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
