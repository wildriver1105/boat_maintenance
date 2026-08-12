// 선실 조명 API — ESP32 PWM 디머 (좌현 후방 선실).
// GET  → 현재 상태 { connected, duty, ... }
// PUT  → { duty: 0~100 } 절대 밝기 설정. 0=소등.
//
// 상대 조절("절반으로", "더 밝게")은 호출자가 GET 으로 현재값을 읽어 계산한다 —
// nav.local 음성 인텐트가 그렇게 쓴다. 서버는 절대값만 받아 단순하게 유지.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AUTH_DISABLED } from "@/lib/auth-mode";
import { getLightState, setLightDuty } from "@/lib/lighting/serial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function allowed() {
  if (AUTH_DISABLED) return true;
  const session = await auth();
  return !!session?.user;
}

export async function GET() {
  return NextResponse.json(getLightState(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request) {
  if (!(await allowed()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { duty?: unknown };
  if (typeof body.duty !== "number" || !Number.isFinite(body.duty)) {
    return NextResponse.json({ error: "duty(0~100 숫자)가 필요합니다" }, { status: 400 });
  }

  const { ok, state } = setLightDuty(body.duty);
  if (!ok || !state.responding) {
    // 보드 미응답 — 목표값은 저장되므로 살아나면 복원된다
    return NextResponse.json(
      { ...state, error: state.error ?? "조명 컨트롤러(ESP32)가 응답하지 않습니다 — 목표값은 저장됨" },
      { status: 503 },
    );
  }
  return NextResponse.json(state);
}
