// 선실 조명 ESP32 브리지 — WiFi TCP 콘솔 (서버 전용 싱글턴).
//
// 펌웨어(~/Desktop/esp32_lighting)는 lighting.local:23 에서 시리얼과 동일한
// 텍스트 명령을 받는다: `d <0-100>`, `off`, `status`. 로그도 같은 소켓으로 온다.
//
// 프로토콜 특성 두 가지에 맞춘 설계:
//  - 콘솔은 동시 1명 — 사람이 nc 로 붙으면 우리가 끊긴다. 그때는 재접속을
//    60초 미뤄서 디버깅을 방해하지 않는다 ("다른 곳에서 접속" 메시지로 감지).
//  - 보드는 부팅 시 스스로 100% 점등한다(벽 스위치처럼 동작하도록 한 설계).
//    그래서 서버가 부팅 후 밝기를 되돌리지 않는다 — 그건 펌웨어의 의도다.
//
// 건강 판정: 소켓 연결(connected)이 아니라 실제 수신(responding)을 본다.
// 10초마다 status 를 보내 에코를 받는 것으로 생존을 확인한다.

import dns from "dns";
import net from "net";

const DEFAULT_HOST = "lighting.local";
const DEFAULT_PORT = 23;
const RECONNECT_MS = 5000;
const KICKED_BACKOFF_MS = 60_000; // 사람 콘솔에 밀려났을 때의 재접속 유예
const POLL_MS = 10_000;
const STALE_MS = 25_000;

interface LightBridge {
  sock: net.Socket | null;
  connected: boolean;
  duty: number | null;
  wantDuty: number | null; // 이 서버가 마지막으로 지시한 값 (정보용)
  lastSeen: number | null;
  error: string | null;
  buf: string;
  nextRetryAt: number;
  timer: NodeJS.Timeout | null;
}

const g = globalThis as unknown as { __lightTcp?: LightBridge };

const host = () => process.env.LIGHT_HOST || DEFAULT_HOST;
const port = () => Number(process.env.LIGHT_PORT || DEFAULT_PORT);

function handleLine(b: LightBridge, line: string) {
  b.lastSeen = Date.now();
  // "[MANUAL] duty=40% (raw=..)" / "  duty      : 40 %" 양쪽 다 잡는다
  const m = line.match(/duty\s*[=:]\s*(\d+)\s*%/i);
  if (m) b.duty = Math.min(100, Number(m[1]));
  // 사람이 nc 로 접속해 우리가 밀려남 — 한동안 자리를 비켜준다
  if (line.includes("다른 곳에서 접속")) {
    b.nextRetryAt = Date.now() + KICKED_BACKOFF_MS;
  }
}

function connect(b: LightBridge) {
  if (b.sock || Date.now() < b.nextRetryAt) return;
  const sock = net.createConnection({
    host: host(),
    port: port(),
    timeout: 4000,
    // .local(mDNS) 이름을 기본 해석하면 AAAA(IPv6) 질의가 5초를 기다려
    // 연결 타임아웃에 걸린다. ESP32 는 IPv4 뿐이므로 A 레코드만 묻는다 (5ms).
    // ⚠ net 이 넘기는 options(all:true 등)를 보존해야 한다 — 버리면 반환
    //   형태가 어긋나 "Invalid IP address: undefined" 로 실패한다.
    lookup: (h, o, cb) => dns.lookup(h, { ...o, family: 4 }, cb),
  });
  b.sock = sock;
  sock.setNoDelay(true);
  sock.setEncoding("utf-8");

  sock.on("connect", () => {
    b.connected = true;
    b.error = null;
    // timeout 옵션은 "유휴" 타임아웃이라 연결 후에도 살아 있다 — 콘솔은
    // 명령 사이에 조용하므로 여기서 꺼야 4초마다 끊기지 않는다.
    sock.setTimeout(0);
    // 접속 시 펌웨어가 STATUS 를 자동으로 뿌려주므로 duty 가 곧 동기화된다
  });
  sock.on("data", (chunk: string) => {
    b.buf += chunk;
    let i;
    while ((i = b.buf.indexOf("\n")) >= 0) {
      const line = b.buf.slice(0, i).trim();
      b.buf = b.buf.slice(i + 1);
      if (line) handleLine(b, line);
    }
  });
  sock.on("timeout", () => {
    b.error = "연결 시간 초과";
    sock.destroy();
  });
  sock.on("error", (err) => {
    b.error = err.message;
  });
  sock.on("close", () => {
    b.connected = false;
    b.sock = null;
    b.buf = "";
  });
}

function writeCmd(b: LightBridge, cmd: string): boolean {
  if (!b.sock || !b.connected) return false;
  try {
    b.sock.write(cmd + "\n");
    return true;
  } catch (err) {
    b.error = (err as Error).message;
    return false;
  }
}

function start(): LightBridge {
  if (g.__lightTcp) return g.__lightTcp;
  const b: LightBridge = {
    sock: null,
    connected: false,
    duty: null,
    wantDuty: null,
    lastSeen: null,
    error: null,
    buf: "",
    nextRetryAt: 0,
    timer: null,
  };
  g.__lightTcp = b;
  connect(b);
  b.timer = setInterval(() => {
    if (!b.connected) connect(b);
    else writeCmd(b, "status"); // 생존 확인 — 응답으로 lastSeen/duty 동기화
  }, POLL_MS);
  b.timer.unref?.();
  setTimeout(() => {
    if (!b.connected) connect(b);
  }, RECONNECT_MS).unref?.();
  return b;
}

export interface LightState {
  /** TCP 소켓이 붙어 있는가 */
  connected: boolean;
  /** 보드가 실제로 응답하는가 — UI/음성은 이걸 봐야 한다 */
  responding: boolean;
  duty: number | null;
  wantDuty: number | null;
  /** 접속 대상 (호스트:포트) */
  port: string;
  lastSeen: number | null;
  error: string | null;
}

export function getLightState(): LightState {
  const b = start();
  return {
    connected: b.connected,
    responding: b.connected && b.lastSeen != null && Date.now() - b.lastSeen < STALE_MS,
    duty: b.duty,
    wantDuty: b.wantDuty,
    port: `${host()}:${port()}`,
    lastSeen: b.lastSeen,
    error: b.error,
  };
}

/** 듀티 설정 (0=소등, 1~100). 에코 파싱이 실제값으로 동기화한다 */
export function setLightDuty(pct: number): { ok: boolean; state: LightState } {
  const b = start();
  const duty = Math.max(0, Math.min(100, Math.round(pct)));
  b.wantDuty = duty;
  const ok = writeCmd(b, `d ${duty}`);
  if (ok) b.duty = duty; // 낙관적 — 에코가 확정
  return { ok, state: getLightState() };
}
