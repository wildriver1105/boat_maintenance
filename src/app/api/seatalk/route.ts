// SeaTalkng / NMEA2000 버스 상태 — 어떤 기기가 어떤 데이터를 보내는지.
//
// 계측값은 읽기 전용이다 (게이트웨이가 listen-only 라 애초에 쓸 방법이 없다).
// PUT 은 기기 이름만 바꾼다 — 버스가 이름을 알려주지 않기 때문이다.

import { NextResponse } from "next/server";
import { getSeatalkStatus } from "@/lib/seatalk/tcp";
import { readNames, setName } from "@/lib/seatalk/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ...getSeatalkStatus(), names: await readNames() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { src?: unknown; name?: unknown };
  if (typeof body.src !== "number" || typeof body.name !== "string") {
    return NextResponse.json({ error: "src(숫자)와 name(문자열)이 필요합니다" }, { status: 400 });
  }
  return NextResponse.json({ names: await setName(body.src, body.name) });
}
