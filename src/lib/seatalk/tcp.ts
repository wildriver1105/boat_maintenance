// SeaTalkng / NMEA2000 게이트웨이 브리지 (서버 전용 싱글턴).
//
// ~/Desktop/seatalk 의 ESP32 게이트웨이가 CAN 버스를 listen-only 로 받아
// seatalk.local:2000 으로 JSON 을 한 줄씩 밀어준다:
//
//   {"pgn":127250,"src":201,"type":"heading","heading_deg":279.4,"ref":"Magnetic"}
//   {"type":"canhealth","state":"running","rxFrames":41229,"rxMissed":12,...}
//
// 이 브리지가 하는 일은 그 스트림을 **기기(src)별로 접어두는 것**이다. N2K 는
// 주소가 곧 기기이므로, src 를 키로 마지막 값과 마지막 수신 시각을 들고 있으면
// "어느 계기가 무엇을 얼마나 자주 보내는가"를 그대로 화면에 낼 수 있다.
//
// 건강 판정이 두 단계인 이유: 게이트웨이가 살아 있어도 버스가 조용할 수 있다.
// 실제로 그런 상태를 만났다 — ESP32 는 14시간째 running 인데 rxFrames 가 멈춰
// 있었고, 원인은 계기 쪽 통신이 꺼져 있던 것이었다. 그래서 소켓 연결(connected),
// 게이트웨이 보고(canhealth), 프레임 증가(busActive)를 따로 본다.

import net from "net";
import dns from "dns";

const DEFAULT_HOST = "seatalk.local";
const DEFAULT_PORT = 2000;
const RECONNECT_MS = 5000;
/** 이 시간 동안 새 프레임이 없으면 버스가 조용하다고 본다 */
const BUS_IDLE_MS = 20_000;
/** 계기 하나가 이 시간 동안 말이 없으면 그 기기는 끊긴 것으로 본다 */
const SRC_STALE_MS = 15_000;

export interface SeatalkSource {
  /** N2K 주소 */
  src: number;
  /** 이 기기가 보내는 데이터 종류 → 마지막 값 */
  data: Record<string, Record<string, unknown>>;
  /** 관측된 PGN 번호 */
  pgns: number[];
  lastSeen: number;
  count: number;
}

interface CanHealth {
  state: string;
  rxFrames: number;
  rxMissed: number;
  rxErr: number;
  txErr: number;
  upSec: number;
  at: number;
}

interface Bridge {
  sock: net.Socket | null;
  connected: boolean;
  error: string | null;
  buf: string;
  sources: Map<number, SeatalkSource>;
  health: CanHealth | null;
  /** rxFrames 가 마지막으로 늘어난 시각 — 버스 활동 판정용 */
  lastFrameGrowth: number;
  lastRxFrames: number;
  /** 게이트웨이가 알려주는, 버스에서 관측된 전체 PGN 목록 */
  pgnsSeen: number[];
  timer: NodeJS.Timeout | null;
}

const g = globalThis as unknown as { __seatalk?: Bridge };

const host = () => process.env.SEATALK_HOST || DEFAULT_HOST;
const port = () => Number(process.env.SEATALK_PORT || DEFAULT_PORT);

function handleLine(b: Bridge, line: string) {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // 잘린 줄 — 다음 청크에서 이어진다
  }
  const type = typeof msg.type === "string" ? msg.type : null;
  if (!type) return;

  if (type === "canhealth") {
    const rx = Number(msg.rxFrames ?? 0);
    if (b.health === null || rx > b.lastRxFrames) b.lastFrameGrowth = Date.now();
    b.lastRxFrames = rx;
    b.health = {
      state: String(msg.state ?? ""),
      rxFrames: rx,
      rxMissed: Number(msg.rxMissed ?? 0),
      rxErr: Number(msg.rxErr ?? 0),
      txErr: Number(msg.txErr ?? 0),
      upSec: Number(msg.upSec ?? 0),
      at: Date.now(),
    };
    return;
  }
  if (type === "pgnseen") {
    if (Array.isArray(msg.pgns)) b.pgnsSeen = msg.pgns as number[];
    return;
  }

  const src = typeof msg.src === "number" ? msg.src : null;
  if (src === null) return;

  let e = b.sources.get(src);
  if (!e) {
    e = { src, data: {}, pgns: [], lastSeen: 0, count: 0 };
    b.sources.set(src, e);
  }
  // pgn/src/type 은 봉투(envelope)라 값에서 뺀다 — 화면에 되풀이할 이유가 없다
  const { pgn, src: _s, type: _t, ...values } = msg as Record<string, unknown> & { pgn?: number };
  e.data[type] = values;
  if (typeof pgn === "number" && !e.pgns.includes(pgn)) e.pgns.push(pgn);
  e.lastSeen = Date.now();
  e.count++;
}

function connect(b: Bridge) {
  if (b.sock) return;
  const sock = net.createConnection({
    host: host(),
    port: port(),
    // .local 기본 해석은 AAAA 질의를 기다리느라 느리다 — ESP32 는 IPv4 뿐이다
    lookup: (h, o, cb) => dns.lookup(h, { ...o, family: 4 }, cb),
  });
  b.sock = sock;
  sock.setEncoding("utf-8");
  sock.setNoDelay(true);

  sock.on("connect", () => {
    b.connected = true;
    b.error = null;
  });
  sock.on("data", (chunk: string) => {
    b.buf += chunk;
    let i;
    while ((i = b.buf.indexOf("\n")) >= 0) {
      const line = b.buf.slice(0, i).trim();
      b.buf = b.buf.slice(i + 1);
      if (line) handleLine(b, line);
    }
    // 줄바꿈 없이 계속 커지면(형식 이상) 버퍼가 무한히 자라지 않게 자른다
    if (b.buf.length > 64_000) b.buf = "";
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

function start(): Bridge {
  if (g.__seatalk) return g.__seatalk;
  const b: Bridge = {
    sock: null,
    connected: false,
    error: null,
    buf: "",
    sources: new Map(),
    health: null,
    lastFrameGrowth: 0,
    lastRxFrames: -1,
    pgnsSeen: [],
    timer: null,
  };
  g.__seatalk = b;
  connect(b);
  b.timer = setInterval(() => {
    if (!b.connected) connect(b);
  }, RECONNECT_MS);
  b.timer.unref?.();
  return b;
}

export interface SeatalkDeviceView {
  src: number;
  /** 이 기기가 보내는 데이터 종류 (heading, wind, position …) */
  types: string[];
  pgns: number[];
  values: Record<string, Record<string, unknown>>;
  live: boolean;
  lastSeen: number;
  /** 관측된 메시지 수 (브리지 기동 이후 누적) */
  count: number;
}

export interface SeatalkStatus {
  /** 게이트웨이 TCP 소켓 */
  connected: boolean;
  /** 게이트웨이가 CAN 컨트롤러 상태를 보고하는가 */
  gateway: string | null;
  /**
   * 버스에 실제로 프레임이 흐르는가.
   * 게이트웨이가 살아 있어도 계기가 송신하지 않으면 false 다 — 이 둘을 합치면
   * "왜 값이 없는지"를 구분할 수 없다.
   */
  busActive: boolean;
  rxFrames: number | null;
  rxMissed: number | null;
  rxErr: number | null;
  upSec: number | null;
  endpoint: string;
  error: string | null;
  /** 버스에서 관측된 전체 PGN (디코딩하지 않는 것 포함) */
  pgnsSeen: number[];
  devices: SeatalkDeviceView[];
}

export function getSeatalkStatus(): SeatalkStatus {
  const b = start();
  const now = Date.now();
  const devices: SeatalkDeviceView[] = [...b.sources.values()]
    .sort((x, y) => x.src - y.src)
    .map((e) => ({
      src: e.src,
      types: Object.keys(e.data).sort(),
      pgns: [...e.pgns].sort((a, z) => a - z),
      values: e.data,
      live: now - e.lastSeen < SRC_STALE_MS,
      lastSeen: e.lastSeen,
      count: e.count,
    }));

  return {
    connected: b.connected,
    gateway: b.health?.state ?? null,
    busActive: b.lastFrameGrowth > 0 && now - b.lastFrameGrowth < BUS_IDLE_MS,
    rxFrames: b.health?.rxFrames ?? null,
    rxMissed: b.health?.rxMissed ?? null,
    rxErr: b.health?.rxErr ?? null,
    upSec: b.health?.upSec ?? null,
    endpoint: `${host()}:${port()}`,
    error: b.error,
    pgnsSeen: b.pgnsSeen,
    devices,
  };
}

/** 한 기기(src)의 현재 값 — 센서 소스가 쓴다 */
export function getSeatalkSource(src: number): SeatalkDeviceView | null {
  return getSeatalkStatus().devices.find((d) => d.src === src) ?? null;
}
