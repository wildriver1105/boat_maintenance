// 엔진 사양·정비 API.
// GET  — 레코드 + 항목별 잔여 주기
// PUT  — { hours, date } 운전시간 갱신 / { itemId, ...patch } 정비 항목 수정
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AUTH_DISABLED } from "@/lib/auth-mode";
import { computeDue, readEngine, updateHours, updateItem } from "@/lib/engine/registry";
import { buildSnapshot } from "@/lib/victron/snapshot";
import type { EngineLive, EngineRecord } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function allowed() {
  if (AUTH_DISABLED) return true;
  const session = await auth();
  return !!session?.user;
}

/**
 * 계기판 실측값을 모은다.
 * rpm·냉각수·유압·연료는 센서가 없어 null (NMEA 2000 엔진 게이트웨이 미설치).
 * 엔진 배터리는 Victron SmartShunt 에서 실제로 가져온다.
 */
function liveOf(rec: EngineRecord): EngineLive {
  const empty: EngineLive = {
    rpm: null, coolantC: null, oilBar: null, fuelRatio: null,
    batteryV: null, batterySoc: null, batteryTempC: null,
    sources: { rpm: null, coolantC: null, oilBar: null, fuelRatio: null, battery: null },
  };
  try {
    const snap = buildSnapshot();
    if (!snap.connected) return empty;
    const b = snap.batteries.find((x) => x.service === rec.links?.batteryService);
    const t = snap.temperatures.find(
      (x) => `temperature/${x.instance}` === rec.links?.batteryTempService,
    );
    return {
      ...empty,
      batteryV: b?.voltage ?? null,
      batterySoc: b?.soc ?? null,
      batteryTempC: t?.celsius ?? b?.temperature ?? null,
      sources: { ...empty.sources, battery: b ? `Victron ${b.name}` : null },
    };
  } catch {
    return empty;
  }
}

export async function GET() {
  const rec = await readEngine();
  if (!rec) return NextResponse.json({ error: "엔진 정보 없음" }, { status: 404 });
  return NextResponse.json({ ...rec, due: computeDue(rec), live: liveOf(rec) }, {
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
