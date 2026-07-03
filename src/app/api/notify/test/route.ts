// 알림 상태 조회 / 테스트 발송 — 관리자 전용.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getChannel } from "@/lib/notifications";
import { enabledUserKeys } from "@/lib/notifications/recipients";
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
    recipientCount: (await enabledUserKeys()).length,
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

  const priority = body.priority ?? "normal";
  // 긴급 테스트는 실제 경고처럼 사이렌+반복 (단, 테스트라 만료를 짧게 120초)
  const isEmergency = priority === "emergency";

  const result = await getChannel().send({
    title: body.title ?? "⛵ 테스트 알림",
    message:
      body.message ??
      "Oceanis Clipper 473 유지보수 디스플레이 · 푸시 알림 연결 테스트입니다.",
    priority,
    sound: isEmergency ? (process.env.ALERT_SOUND ?? "siren") : undefined,
    retrySec: isEmergency ? 30 : undefined,
    expireSec: isEmergency ? 120 : undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
