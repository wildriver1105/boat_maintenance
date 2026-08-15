// 알림 상태 조회 / 테스트 발송 — 관리자 전용.
import { NextResponse } from "next/server";
import { listRules } from "@/lib/notifications/rules";
import { auth } from "@/auth";
import { AUTH_DISABLED } from "@/lib/auth-mode";
import { getChannel } from "@/lib/notifications";
import { enabledUserKeys, userKeysByIds } from "@/lib/notifications/recipients";
import type { NotifyPriority } from "@/lib/notifications/types";

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
  const channel = getChannel();
  return NextResponse.json({
    channel: channel.name,
    configured: channel.configured,
    recipientCount: (await enabledUserKeys()).length,
    monitor: process.env.ALERT_MONITOR === "on",
    // 무엇을 보낼지는 규칙이 정한다 — 모니터가 켜져 있어도 규칙이 다 꺼져 있으면
    // 아무것도 발송되지 않으므로, 그 숫자를 함께 보여준다.
    rulesEnabled: (await listRules()).filter((r) => r.enabled).length,
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    message?: string;
    priority?: NotifyPriority;
    /** 지정하면 이 수신자들에게만 발송 (비우면 활성 수신자 전원) */
    recipientIds?: string[];
  };

  const to = body.recipientIds?.length ? await userKeysByIds(body.recipientIds) : undefined;
  if (body.recipientIds?.length && !to?.length) {
    return NextResponse.json(
      { ok: false, status: 400, detail: "선택한 수신자를 찾을 수 없습니다." },
      { status: 400 },
    );
  }

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
    to,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
