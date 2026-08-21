// Victron 설정 제어 — 화이트리스트에 있는 값만 읽고 쓴다.
//
// GET → 현재 값 + 조절 가능한 항목 정의 + 목표 SoC 자동 제어 상태
// PUT → { key, value } 설정 변경 · { mode } 인버터 모드 · { goal } 자동 제어

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AUTH_DISABLED } from "@/lib/auth-mode";
import {
  SETTINGS,
  VEBUS_MODES,
  VEBUS_MODE_PATH,
  clampValue,
  readVictron,
  settingOf,
  writeVictron,
} from "@/lib/victron/control";
import { readGoal, updateGoal } from "@/lib/victron/chargeGoal";
import { getVictronBroker } from "@/lib/victron/mqtt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function allowed() {
  if (AUTH_DISABLED) return true;
  const session = await auth();
  return !!session?.user;
}

export async function GET() {
  const b = getVictronBroker();
  return NextResponse.json(
    {
      connected: b.connected,
      settings: SETTINGS.map((s) => ({ ...s, value: readVictron(s.path) })),
      modes: VEBUS_MODES,
      mode: readVictron(VEBUS_MODE_PATH),
      soc: readVictron("system/0/Dc/Battery/Soc"),
      goal: await readGoal(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(req: Request) {
  if (!(await allowed()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    key?: unknown;
    value?: unknown;
    mode?: unknown;
    goal?: unknown;
  };

  // 목표 SoC 자동 제어
  if (body.goal && typeof body.goal === "object") {
    return NextResponse.json({ goal: await updateGoal(body.goal as Record<string, never>) });
  }

  // 인버터/충전기 모드
  if (body.mode !== undefined) {
    const m = Number(body.mode);
    if (!VEBUS_MODES.some((x) => x.value === m))
      return NextResponse.json({ error: "알 수 없는 모드입니다" }, { status: 400 });
    const res = writeVictron(VEBUS_MODE_PATH, m);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 503 });
    return NextResponse.json({ ok: true, mode: m });
  }

  // 설정값
  if (typeof body.key !== "string" || typeof body.value !== "number")
    return NextResponse.json({ error: "key(문자열)와 value(숫자)가 필요합니다" }, { status: 400 });

  const s = settingOf(body.key);
  if (!s) return NextResponse.json({ error: "허용되지 않은 설정입니다" }, { status: 400 });

  const value = clampValue(s, body.value);
  const res = writeVictron(s.path, value);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 503 });
  // 적용 여부는 Venus 가 되돌려주는 값으로 확인된다 (다음 GET 에 반영)
  return NextResponse.json({ ok: true, key: s.key, value });
}
