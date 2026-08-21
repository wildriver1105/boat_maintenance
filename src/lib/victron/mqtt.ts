// Victron Venus OS MQTT 클라이언트 (서버 전용 싱글턴).
// venus.local 브로커에 붙어 전체 dbus 트리(N/<portal>/#)를 구독하고,
// 최신 값을 메모리 Map 에 유지한다. Venus 는 keepalive 를 주기적으로 받아야
// 값 갱신을 계속 내보내므로 R/<portal>/keepalive 로 heartbeat 를 보낸다.
//
// 읽기 전용. 이후 제어(쓰기)는 여기의 client.publish 로 W/<portal>/... 를 쓰면 된다.

import mqtt, { type MqttClient } from "mqtt";

const KEEPALIVE_MS = 20_000; // Venus 타임아웃(60s)보다 짧게
const STALE_MS = 15_000; // 마지막 수신 후 이 시간 넘으면 connected=false 로 간주

interface VictronBroker {
  client: MqttClient | null;
  values: Map<string, unknown>; // dbus 경로("system/0/Dc/Battery/Soc") → value
  portalId: string | null;
  connected: boolean;
  lastMessageAt: number | null;
  error: string | null;
  keepaliveTimer: NodeJS.Timeout | null;
  host: string;
  port: number;
}

// dev HMR 에서도 하나의 연결만 유지되도록 globalThis 에 보관.
const g = globalThis as unknown as { __victronBroker?: VictronBroker };

function host(): string {
  return process.env.VICTRON_MQTT_HOST || "venus.local";
}
function port(): number {
  return Number(process.env.VICTRON_MQTT_PORT || 1883);
}

function sendKeepalive(b: VictronBroker) {
  if (b.client && b.connected && b.portalId) {
    // 빈 payload = 전체 트리 재발행 요청. 이후 변경분만 push 된다.
    b.client.publish(`R/${b.portalId}/keepalive`, "");
  }
}

function start(): VictronBroker {
  if (g.__victronBroker?.client) return g.__victronBroker;

  const b: VictronBroker = g.__victronBroker ?? {
    client: null,
    values: new Map(),
    portalId: null,
    connected: false,
    lastMessageAt: null,
    error: null,
    keepaliveTimer: null,
    host: host(),
    port: port(),
  };
  g.__victronBroker = b;
  b.host = host();
  b.port = port();

  const url = `mqtt://${b.host}:${b.port}`;
  const client = mqtt.connect(url, {
    connectTimeout: 8000,
    reconnectPeriod: 5000, // 끊기면 자동 재접속
    keepalive: 30,
  });
  b.client = client;

  client.on("connect", () => {
    b.connected = true;
    b.error = null;
    // 재접속 시에도 매번 재구독 (portalId 를 다시 확인)
    b.portalId = null;
    client.subscribe("N/#", (err) => {
      if (err) b.error = `구독 실패: ${err.message}`;
    });
  });

  client.on("message", (topic, payload) => {
    const parts = topic.split("/");
    if (parts[0] !== "N") return;
    b.lastMessageAt = Date.now();

    if (!b.portalId) {
      b.portalId = parts[1];
      sendKeepalive(b);
      if (b.keepaliveTimer) clearInterval(b.keepaliveTimer);
      b.keepaliveTimer = setInterval(() => sendKeepalive(b), KEEPALIVE_MS);
    }

    // 경로 = portalId 이후 부분. 값 payload 는 {"value": ...} JSON.
    const path = parts.slice(2).join("/");
    let value: unknown;
    const text = payload.toString();
    if (text.length === 0) {
      value = null;
    } else {
      try {
        value = JSON.parse(text).value;
      } catch {
        value = text;
      }
    }
    b.values.set(path, value);
  });

  client.on("error", (err) => {
    b.error = err.message;
  });
  client.on("close", () => {
    b.connected = false;
  });
  client.on("offline", () => {
    b.connected = false;
  });

  return b;
}

export interface VictronBrokerState {
  values: Map<string, unknown>;
  portalId: string | null;
  connected: boolean;
  host: string;
  updatedAt: number | null;
  error: string | null;
}

/**
 * 설정값 쓰기 — Venus 는 `W/<portal>/<path>` 를 받아 적용하고, 결과를 다시
 * `N/...` 로 내보낸다. 그래서 성공 판정은 이 함수가 아니라 **되돌아온 값**으로
 * 한다 (읽기 전용 설계를 깨는 유일한 지점이라 여기 한 곳에만 둔다).
 */
export function publishVictron(path: string, value: number): { ok: boolean; error?: string } {
  const b = start();
  if (!b.client || !b.connected) return { ok: false, error: "Victron MQTT 에 연결되어 있지 않습니다" };
  if (!b.portalId) return { ok: false, error: "포털 ID 를 아직 받지 못했습니다" };
  b.client.publish(`W/${b.portalId}/${path}`, JSON.stringify({ value }));
  return { ok: true };
}

/** 브로커를 (필요시) 기동하고 현재 상태를 반환. API 라우트에서 호출한다. */
export function getVictronBroker(): VictronBrokerState {
  const b = start();
  const fresh =
    b.connected && b.lastMessageAt != null && Date.now() - b.lastMessageAt < STALE_MS;
  return {
    values: b.values,
    portalId: b.portalId,
    connected: fresh,
    host: b.host,
    updatedAt: b.lastMessageAt,
    error: b.error,
  };
}
