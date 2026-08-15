// Zigbee2MQTT 클라이언트 (서버 전용 싱글턴).
//
// 같은 Mac 의 루프백 브로커(127.0.0.1:1883)에 붙어 `zigbee2mqtt/#` 를 구독하고,
// 기기별 최신 상태를 메모리에 유지한다. 하드웨어는 Sonoff ZBDongle-P 코디네이터가
// 소유하고 Zigbee2MQTT(LaunchAgent: local.zigbee.z2m)가 구동한다 — 이 앱은
// MQTT 로 읽기만 한다.
//
// Victron 과 달리 keepalive 가 필요 없다. z2m 이 기기 리포팅을 그대로 흘려주고,
// availability 토픽으로 온·오프라인까지 알려준다.
//
// 신선도 판정: 스마트플러그는 상태가 변하지 않으면 조용할 수 있으므로
// 마지막 수신 시각만으로 죽었다고 보지 않는다. z2m 의 availability 를 우선하고,
// 그것이 없을 때만 STALE_MS 로 판단한다.

import mqtt, { type MqttClient } from "mqtt";

const BASE = "zigbee2mqtt";
const STALE_MS = 15 * 60_000; // availability 가 없는 기기용 (플러그 리포팅 주기는 길다)

export interface ZigbeeDeviceState {
  /** 마지막으로 받은 payload (state/power/voltage/…) */
  values: Record<string, unknown>;
  /** z2m availability — true=online, false=offline, null=아직 모름 */
  available: boolean | null;
  lastMessageAt: number;
}

interface ZigbeeBroker {
  client: MqttClient | null;
  devices: Map<string, ZigbeeDeviceState>; // ieee(또는 friendly_name) → 상태
  bridgeOnline: boolean;
  connected: boolean;
  error: string | null;
  host: string;
  port: number;
}

// dev HMR 에서도 연결이 하나만 유지되도록 globalThis 에 보관
const g = globalThis as unknown as { __zigbeeBroker?: ZigbeeBroker };

const host = () => process.env.ZIGBEE_MQTT_HOST || "127.0.0.1";
const port = () => Number(process.env.ZIGBEE_MQTT_PORT || 1883);

function entry(b: ZigbeeBroker, id: string): ZigbeeDeviceState {
  let e = b.devices.get(id);
  if (!e) {
    e = { values: {}, available: null, lastMessageAt: 0 };
    b.devices.set(id, e);
  }
  return e;
}

function start(): ZigbeeBroker {
  if (g.__zigbeeBroker?.client) return g.__zigbeeBroker;

  const b: ZigbeeBroker = g.__zigbeeBroker ?? {
    client: null,
    devices: new Map(),
    bridgeOnline: false,
    connected: false,
    error: null,
    host: host(),
    port: port(),
  };
  g.__zigbeeBroker = b;
  b.host = host();
  b.port = port();

  const client = mqtt.connect(`mqtt://${b.host}:${b.port}`, {
    connectTimeout: 8000,
    reconnectPeriod: 5000,
    keepalive: 30,
  });
  b.client = client;

  client.on("connect", () => {
    b.connected = true;
    b.error = null;
    client.subscribe(`${BASE}/#`, (err) => {
      if (err) b.error = `구독 실패: ${err.message}`;
    });
  });

  client.on("message", (topic, payload) => {
    const rest = topic.startsWith(`${BASE}/`) ? topic.slice(BASE.length + 1) : null;
    if (!rest) return;

    if (rest === "bridge/state") {
      try {
        const s = JSON.parse(payload.toString()) as { state?: string };
        b.bridgeOnline = s.state === "online";
      } catch {
        b.bridgeOnline = payload.toString() === "online";
      }
      return;
    }
    if (rest.startsWith("bridge/")) return; // devices/info/logging 등은 쓰지 않는다

    // "<id>/availability" 와 "<id>" 두 종류만 남는다. set/get 은 우리가 보낸 것.
    if (rest.endsWith("/set") || rest.endsWith("/get")) return;

    const availability = rest.endsWith("/availability");
    const id = availability ? rest.slice(0, -"/availability".length) : rest;
    const e = entry(b, id);

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.toString());
    } catch {
      return; // 값이 JSON 이 아니면 무시 (z2m 은 항상 JSON 을 보낸다)
    }

    if (availability) {
      const s = (parsed as { state?: string })?.state;
      e.available = s === "online";
      return;
    }
    if (parsed && typeof parsed === "object") {
      e.values = { ...e.values, ...(parsed as Record<string, unknown>) };
      e.lastMessageAt = Date.now();
    }
  });

  client.on("error", (err) => {
    b.error = err.message;
  });
  client.on("close", () => {
    b.connected = false;
  });

  return b;
}

export interface ZigbeeStatus {
  /** 브로커 TCP 연결 */
  connected: boolean;
  /** z2m 브리지 자체가 온라인이라고 알려왔는가 */
  bridgeOnline: boolean;
  broker: string;
  deviceCount: number;
  error: string | null;
}

export function getZigbeeStatus(): ZigbeeStatus {
  const b = start();
  return {
    connected: b.connected,
    bridgeOnline: b.bridgeOnline,
    broker: `${host()}:${port()}`,
    deviceCount: b.devices.size,
    error: b.error,
  };
}

/** 기기 상태. 아직 아무 값도 못 받았으면 null */
export function getZigbeeDevice(id: string): ZigbeeDeviceState | null {
  const b = start();
  const e = b.devices.get(id);
  if (!e || e.lastMessageAt === 0) return null;
  return e;
}

/**
 * 기기에 현재 상태를 물어본다 (ZCL read — 스위치를 건드리지 않는다).
 *
 * z2m 은 기기 상태 토픽을 retain 하지 않는 것이 기본이라, 앱이 새로 붙으면
 * 그 기기가 다음번 자발적 보고를 할 때까지 아무 값도 못 받는다. 플러그는
 * 부하가 일정하면 몇 분씩 조용하므로 그 사이 "미수신"으로 남는다.
 * 그래서 값이 없는 동안만 주기적으로 한 번씩 물어본다.
 */
const askedAt = new Map<string, number>();
const ASK_INTERVAL_MS = 30_000;

export function requestZigbeeState(id: string) {
  const b = start();
  if (!b.client || !b.connected) return;
  const now = Date.now();
  if (now - (askedAt.get(id) ?? 0) < ASK_INTERVAL_MS) return;
  askedAt.set(id, now);
  b.client.publish(`${BASE}/${id}/get`, JSON.stringify({ state: "" }));
}

/**
 * 스위치 켜기/끄기. 실제 전환 여부는 기기가 되돌려주는 상태로 확인한다
 * (낙관적으로 로컬 값을 바꾸지 않는다 — 안 켜졌는데 켜졌다고 보이면 안 된다).
 * 호출자는 이 id 가 devices.json 에 등록된 기기인지 먼저 확인해야 한다.
 */
export function setZigbeeSwitch(id: string, on: boolean): boolean {
  return publishSet(id, { state: on ? "ON" : "OFF" });
}

/**
 * 임의의 set 페이로드 전송 (계측 전용 모드, 정전 복구 동작, 타이머 등).
 * 어떤 키를 허용할지는 API 라우트가 판단한다 — 여기서는 통로만 제공한다.
 */
export function publishSet(id: string, payload: Record<string, unknown>): boolean {
  const b = start();
  if (!b.client || !b.connected) return false;
  b.client.publish(`${BASE}/${id}/set`, JSON.stringify(payload));
  return true;
}

/** 이 기기를 살아 있는 것으로 볼 수 있는가 (availability 우선) */
export function isZigbeeDeviceLive(e: ZigbeeDeviceState): boolean {
  if (e.available !== null) return e.available;
  return Date.now() - e.lastMessageAt < STALE_MS;
}
