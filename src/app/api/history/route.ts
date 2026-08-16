// 계측 이력 조회 — 그래프용.
//   GET /api/history?keys=sys.soc,sys.acLoadPower&hours=24
//
// 반환: { from, to, points: [{ t, v: { key: number } }] }
// 값이 없는 지표는 그 점에서 키가 빠진다 (0 으로 채우지 않는다 — 결측과 0 은 다르다).

import { NextResponse } from "next/server";
import { downsample, readRange } from "@/lib/history/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HOURS = 14 * 24;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const keys = (url.searchParams.get("keys") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (keys.length === 0)
    return NextResponse.json({ error: "keys 파라미터가 필요합니다" }, { status: 400 });

  const hours = Math.min(MAX_HOURS, Math.max(0.5, Number(url.searchParams.get("hours") ?? 24)));
  const to = Date.now();
  const from = to - hours * 3600_000;

  const samples = await readRange(from, to);
  // 구간이 길수록 버킷을 넓혀 점 개수를 화면 폭 수준으로 유지한다
  const points = downsample(samples, keys, from, to, hours <= 6 ? 180 : 240);

  return NextResponse.json(
    { from, to, keys, points, sampleCount: samples.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
