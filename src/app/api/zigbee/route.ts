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
  getZigbeeTimer,
  isZigbeeDeviceLive,
  publishSet,
  setZigbeeSwitch,
  setZigbeeTimer,
  waitForEcho,
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
        // 기기는 남은 시간을 보고하지 않으므로 서버가 센 값을 함께 준다
        timer: getZigbeeTimer(b!.id),
      };
    });
  return NextResponse.json(
    { bridge: getZigbeeStatus(), plugs },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * set 으로 넘길 수 있는 설정 키 — 화이트리스트.
 * 아무 키나 통과시키면 z2m 이 지원하는 모든 명령(펌웨어 갱신 트리거 등)이
 * 열린 통로가 된다. UI 가 실제로 쓰는 것만 허용한다.
 */
const ALLOWED_SET: Record<string, (v: unknown) => boolean> = {
  // 릴레이를 ON 으로 고정 (실수로 끄지 못하게)
  metering_only_mode: (v) => v === "ON" || v === "OFF",
  // 정전 복구 후 동작
  power_on_behavior: (v) => ["off", "on", "toggle", "previous"].includes(v as string),
  // 지정 시간 뒤 자동 전환 (초)
  countdown_to_turn_off: (v) => typeof v === "number" && v >= 0 && v <= 65535,
  countdown_to_turn_on: (v) => typeof v === "number" && v >= 0 && v <= 65535,
  // led_brightness 는 뺐다 — 이 모델의 펌웨어가 UNSUPPORTED_ATTRIBUTE 로 거부한다.
  //   z2m: genBasic.write({"ledBrightness":40}) failed (Status 'UNSUPPORTED_ATTRIBUTE')
  // 통과시키면 API 는 성공을 돌려주는데 기기는 아무것도 하지 않는 상태가 된다.
};

export async function PUT(req: Request) {
  if (!(await allowed()))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    on?: unknown;
    set?: unknown;
  };
  const hasSet = body.set !== undefined;
  if (typeof body.id !== "string" || (typeof body.on !== "boolean" && !hasSet)) {
    return NextResponse.json(
      { error: "id(문자열)와 on(true/false) 또는 set(객체)이 필요합니다" },
      { status: 400 },
    );
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

  if (hasSet) {
    const set = body.set as Record<string, unknown>;
    if (typeof set !== "object" || set === null || Array.isArray(set)) {
      return NextResponse.json({ error: "set 은 객체여야 합니다" }, { status: 400 });
    }
    for (const [k, v] of Object.entries(set)) {
      const check = ALLOWED_SET[k];
      if (!check) return NextResponse.json({ error: `허용되지 않은 설정: ${k}` }, { status: 400 });
      if (!check(v)) return NextResponse.json({ error: `${k} 값이 올바르지 않습니다` }, { status: 400 });
    }
    if (!publishSet(found.binding.id, set)) {
      return NextResponse.json({ error: "MQTT 브로커에 연결되어 있지 않습니다" }, { status: 503 });
    }
    // 카운트다운은 남은 시간을 기기가 알려주지 않으므로 우리가 마감 시각을 센다
    if (typeof set.countdown_to_turn_off === "number")
      setZigbeeTimer(found.binding.id, set.countdown_to_turn_off, "off");
    if (typeof set.countdown_to_turn_on === "number")
      setZigbeeTimer(found.binding.id, set.countdown_to_turn_on, "on");
    return NextResponse.json({ ok: true, id: body.id, set, timer: getZigbeeTimer(found.binding.id) });
  }

  const want = body.on as boolean;
  if (!setZigbeeSwitch(found.binding.id, want)) {
    return NextResponse.json({ error: "MQTT 브로커에 연결되어 있지 않습니다" }, { status: 503 });
  }

  // 사람이 손으로 껐다/켰다면 걸어둔 카운트다운은 의미가 없다 — 같이 지운다.
  // (타이머만 남겨두면 잊고 있다가 엉뚱한 시각에 혼자 동작한다)
  setZigbeeTimer(found.binding.id, 0, want ? "on" : "off");
  publishSet(found.binding.id, { countdown_to_turn_off: 0, countdown_to_turn_on: 0 });

  // **보낸 뒤 돌아오는 신호를 기다린다.** 이게 없으면 호출자는 다음 폴링까지
  // 아무것도 모르고, 화면은 눌러도 반응이 없는 것처럼 보인다.
  const echo = await waitForEcho(
    found.binding.id,
    (v) => v.state === (want ? "ON" : "OFF"),
    4000,
  );
  return NextResponse.json({
    ok: true,
    id: body.id,
    requested: want ? "ON" : "OFF",
    confirmed: echo !== null,
    state: echo?.state ?? null,
    watts: typeof echo?.power === "number" ? echo.power : null,
  });
}
