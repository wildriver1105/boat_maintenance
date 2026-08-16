// SeaTalkng / NMEA2000 게이트웨이 브리지 (서버 전용 싱글턴).
//
// ESP32 게이트웨이(~/Desktop/seatalk)가 CAN 버스를 listen-only 로 받아 JSON 을
// 한 줄씩 내보낸다. 그 줄을 **nav 브리지에서 중계받는다**:
//
//   ESP32 ──USB 시리얼──▶ nav 브리지(포트 독점) ──SSE /ap/stream──▶ 이 앱
//
// 직접 붙지 않는 이유: 게이트웨이가 USB 로 전환되면서 tty 는 한 프로세스만
// 열 수 있게 됐다. 둘이 같이 열면 바이트를 나눠 갖고 양쪽 다 깨진다. 중계를
// 거치면 USB 든 WiFi 든 전송 방식이 바뀌어도 이 앱은 영향을 받지 않는다.
//
// 줄 형식은 게이트웨이 원본 그대로다:
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

const DEFAULT_RELAY = "http://127.0.0.1:8002/ap/stream";
const RECONNECT_MS = 5000;
/** 중계에서 이 시간 동안 아무 줄도 안 오면 끊긴 것으로 본다 */
const RELAY_STALE_MS = 10_000;
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
  abort: AbortController | null;
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
  /** 마지막으로 줄이 도착한 시각 — "열려 있음"과 "받고 있음"을 가르는 기준 */
  lastLineAt: number;
  timer: NodeJS.Timeout | null;
}

const g = globalThis as unknown as { __seatalk?: Bridge };

const relay = () => process.env.SEATALK_RELAY || DEFAULT_RELAY;

function handleLine(b: Bridge, line: string) {
  b.lastLineAt = Date.now();
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
  if (b.abort) return;
  const ac = new AbortController();
  b.abort = ac;

  void (async () => {
    try {
      const res = await fetch(relay(), {
        signal: ac.signal,
        headers: { Accept: "text/event-stream" },
        cache: "no-store",
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      b.connected = true;
      b.error = null;

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        b.buf += dec.decode(value, { stream: true });
        let i;
        while ((i = b.buf.indexOf("\n")) >= 0) {
          const raw = b.buf.slice(0, i).trim();
          b.buf = b.buf.slice(i + 1);
          // SSE 프레임에서 데이터 줄만 꺼낸다 (retry:/빈 줄은 버린다)
          if (raw.startsWith("data:")) handleLine(b, raw.slice(5).trim());
        }
        if (b.buf.length > 64_000) b.buf = "";
      }
      b.error = "중계가 종료되었습니다";
    } catch (err) {
      if (!ac.signal.aborted) b.error = (err as Error).message;
    } finally {
      b.connected = false;
      b.buf = "";
      if (b.abort === ac) b.abort = null;
    }
  })();
}

function start(): Bridge {
  if (g.__seatalk) return g.__seatalk;
  const b: Bridge = {
    abort: null,
    connected: false,
    error: null,
    buf: "",
    sources: new Map(),
    health: null,
    lastFrameGrowth: 0,
    lastRxFrames: -1,
    pgnsSeen: [],
    lastLineAt: 0,
    timer: null,
  };
  g.__seatalk = b;
  connect(b);
  b.timer = setInterval(() => {
    // 조용해진 스트림은 끊고 새로 붙는다 — 살아 있는 척하는 연결이 제일 나쁘다
    if (b.connected && b.lastLineAt > 0 && Date.now() - b.lastLineAt > RELAY_STALE_MS) {
      b.abort?.abort();
      b.abort = null;
      b.connected = false;
    }
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
  /**
   * 중계에서 실제로 줄이 들어오고 있는가.
   * 소켓/스트림이 열려 있다는 사실만으로 true 로 두면 안 된다 — 네트워크가
   * 바뀌어 상대가 사라져도 커널은 한동안 "연결됨"으로 들고 있어서, 화면이
   * "연결됨"이라고 말하는 동안 아무 값도 안 들어오는 상태가 된다(실제로 겪었다).
   */
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

  // 스트림이 열려 있어도 조용하면 연결로 치지 않는다
  const receiving =
    b.connected && b.lastLineAt > 0 && now - b.lastLineAt < RELAY_STALE_MS;

  return {
    connected: receiving,
    gateway: b.health?.state ?? null,
    busActive: b.lastFrameGrowth > 0 && now - b.lastFrameGrowth < BUS_IDLE_MS,
    rxFrames: b.health?.rxFrames ?? null,
    rxMissed: b.health?.rxMissed ?? null,
    rxErr: b.health?.rxErr ?? null,
    upSec: b.health?.upSec ?? null,
    endpoint: relay(),
    error: b.error,
    pgnsSeen: b.pgnsSeen,
    devices,
  };
}

/** 한 기기(src)의 현재 값 — 센서 소스가 쓴다 */
export function getSeatalkSource(src: number): SeatalkDeviceView | null {
  return getSeatalkStatus().devices.find((d) => d.src === src) ?? null;
}
