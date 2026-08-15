// Zigbee 스마트플러그 API (Zigbee2MQTT 경유).
// GET        → 브리지 상태 + 등록된 플러그들의 현재 값
// PUT {id,on} → 해당 플러그 켜기/끄기
//
// id 는 devices.json 의 **디바이스 id**(dev-plug-1 …)다. z2m 토픽 키를 그대로
// 받지 않는 이유: 임의의 토픽으로 아무 기기나 조작하는 통로가 되면 안 되고,
// 등록되지 않은 기기는 이 앱의 책임 범위 밖이기 때문이다.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AUTH_DISABLED } from "@/lib/auth-mode";
import { readDevices } from "@/lib/devices/registry";
import { zigbeeBindingOf } from "@/lib/zigbee/binding";
import {
  getZigbeeDevice,
  getZigbeeStatus,
  isZigbeeDeviceLive,
  setZigbeeSwitch,
} from "@/lib/zigbee/mqtt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function allowed() {
  if (AUTH_DISABLED) return true;
  const session = await auth();
  return !!session?.user;
}

/** 등록된 Zigbee 기기 찾기 — 바인딩이 없으면 조작 대상이 아니다 */
async function findBound(deviceId: string) {
  const devices = await readDevices();
  const device = devices.find((d) => d.id === deviceId);
  if (!device) return null;
  const binding = zigbeeBindingOf(device);
  return binding ? { device, binding } : null;
}

export async function GET() {
  const devices = await readDevices();
  const plugs = devices
    .map((d) => ({ d, b: zigbeeBindingOf(d) }))
    .filter((x) => x.b)
    .map(({ d, b }) => {
      const e = getZigbeeDevice(b!.id);
      const live = e ? isZigbeeDeviceLive(e) : false;
      return {
        id: d.id,
        name: d.name,
        zigbeeId: b!.id,
        model: b!.model,
        live,
        values: live && e ? e.values : {},
      };
    });
  return NextResponse.json(
    { bridge: getZigbeeStatus(), plugs },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(req: Request) {
  if (!(await allowed()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; on?: unknown };
  if (typeof body.id !== "string" || typeof body.on !== "boolean") {
    return NextResponse.json({ error: "id(문자열)와 on(true/false)이 필요합니다" }, { status: 400 });
  }

  const found = await findBound(body.id);
  if (!found) {
    return NextResponse.json({ error: "Zigbee 기기가 아닙니다" }, { status: 404 });
  }

  const state = getZigbeeDevice(found.binding.id);
  if (!state || !isZigbeeDeviceLive(state)) {
    return NextResponse.json(
      { error: "플러그가 응답하지 않습니다 — Zigbee 연결을 확인하세요" },
      { status: 503 },
    );
  }

  if (!setZigbeeSwitch(found.binding.id, body.on)) {
    return NextResponse.json({ error: "MQTT 브로커에 연결되어 있지 않습니다" }, { status: 503 });
  }
  // 전환 확인은 기기가 보내는 다음 상태로 이뤄진다 (SSE 로 도착)
  return NextResponse.json({ ok: true, id: body.id, requested: body.on ? "ON" : "OFF" });
}
