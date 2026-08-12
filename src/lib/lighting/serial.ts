// 선실 조명 ESP32 시리얼 브리지 (서버 전용 싱글턴).
//
// 좌현 후방 선실 천장등에 ESP32 + HW-517 MOSFET PWM 디머가 물려 있고,
// 펌웨어(~/Desktop/lighting/lighting.ino)는 USB 시리얼 115200 baud 로
// 개행 단위 텍스트 명령을 받는다: `d <0-100>`(듀티 %), `off`, `status`.
// WiFi/MQTT 는 없다 — Mac 에 USB 로 꽂혀 있어야 제어된다.
//
// 주의: 포트를 여는 순간 DTR 토글로 ESP32 가 리셋되어 소등(duty 0)된다.
// 그래서 마지막 듀티를 data/lighting.json 에 남겨 두고, 부팅 배너([READY])를
// 보면 그 값을 다시 보낸다 — 서버 재배포 때 불이 꺼진 채 남지 않게.
//
// 포트 식별: 이 Mac 에는 usbserial-110(GPS, JSON 스트림)과 usbserial-2 가 있다.
// 조명은 usbserial-2 로 가정하되 LIGHT_SERIAL_PORT 로 바꿀 수 있다.

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const BAUD = 115200;
const RECONNECT_MS = 5000;
const POLL_MS = 10_000; // 주기적으로 status 를 보내 살아있는지 확인 (펌웨어가 에코함)
const STALE_MS = 25_000; // 마지막 수신이 이보다 오래됐으면 "응답 없음" — 포트가 열려도 보드가 죽어 있을 수 있다

const PERSIST = path.join(process.cwd(), "data", "lighting.json");

interface LightBridge {
  fd: number | null;
  stream: fs.ReadStream | null;
  connected: boolean;
  /** 마지막으로 알고 있는 듀티(%) — 펌웨어 에코를 파싱해 동기화 */
  duty: number | null;
  lastSeen: number | null;
  error: string | null;
  port: string;
  timer: NodeJS.Timeout | null;
  buf: string;
  /** 리셋 후 재적용할 목표 듀티 */
  wantDuty: number;
}

const g = globalThis as unknown as { __lightBridge?: LightBridge };

function portPath(): string {
  return process.env.LIGHT_SERIAL_PORT || "/dev/cu.usbserial-2";
}

function loadPersist(): number {
  try {
    const v = JSON.parse(fs.readFileSync(PERSIST, "utf-8")).duty;
    return typeof v === "number" && v >= 0 && v <= 100 ? Math.round(v) : 0;
  } catch {
    return 0;
  }
}

function savePersist(duty: number) {
  try {
    fs.writeFileSync(PERSIST, JSON.stringify({ duty }, null, 2) + "\n");
  } catch {
    /* 저장 실패는 치명적이지 않다 */
  }
}

function closePort(b: LightBridge) {
  try {
    b.stream?.destroy();
  } catch {
    /* noop */
  }
  if (b.fd != null) {
    try {
      fs.closeSync(b.fd);
    } catch {
      /* noop */
    }
  }
  b.stream = null;
  b.fd = null;
  b.connected = false;
}

function handleLine(b: LightBridge, line: string) {
  b.lastSeen = Date.now();
  // 펌웨어 에코: "[MANUAL] duty=40% (raw=..)" / STATUS: "  duty      : 40 %"
  const m = line.match(/duty\s*[=:]\s*(\d+)\s*%/i);
  if (m) b.duty = Math.min(100, Number(m[1]));
  // 부팅 완료 → 리셋으로 소등된 상태. 마지막 듀티를 복원한다.
  if (line.includes("[READY]")) {
    b.duty = 0;
    if (b.wantDuty > 0) {
      writeCmd(b, `d ${b.wantDuty}`);
    }
  }
}

function writeCmd(b: LightBridge, cmd: string): boolean {
  if (b.fd == null) return false;
  try {
    fs.writeSync(b.fd, cmd + "\n");
    return true;
  } catch (err) {
    b.error = (err as Error).message;
    closePort(b);
    return false;
  }
}

function openPort(b: LightBridge) {
  b.port = portPath();
  // baud/raw 설정 — stty 는 열려 있는 동안에도 장치 파일에 적용된다
  const r = spawnSync("stty", ["-f", b.port, String(BAUD), "cs8", "-cstopb", "-parenb", "raw", "-echo"]);
  if (r.status !== 0) {
    b.error = `stty 실패 (${b.port}) — 포트 없음/권한`;
    return;
  }
  try {
    // cu.* 장치는 캐리어를 기다리지 않으므로 논블로킹 없이 열 수 있다
    b.fd = fs.openSync(b.port, "r+");
  } catch (err) {
    b.error = (err as Error).message;
    return;
  }
  b.stream = fs.createReadStream("", { fd: b.fd, autoClose: false });
  b.stream.setEncoding("utf-8");
  b.stream.on("data", (chunk: string | Buffer) => {
    b.buf += String(chunk);
    let i;
    while ((i = b.buf.indexOf("\n")) >= 0) {
      const line = b.buf.slice(0, i).trim();
      b.buf = b.buf.slice(i + 1);
      if (line) handleLine(b, line);
    }
  });
  b.stream.on("error", (err) => {
    b.error = err.message;
    closePort(b);
  });
  b.connected = true;
  b.error = null;
  // 포트 open 이 ESP32 를 리셋시킨다 — 부팅(≈0.5s) 후 상태 동기화 요청.
  // [READY] 파싱이 복원을 처리하지만, 배너를 놓친 경우를 대비해 status 도 보낸다.
  setTimeout(() => {
    if (b.connected) writeCmd(b, "status");
  }, 3000).unref?.();
}

function start(): LightBridge {
  if (g.__lightBridge) return g.__lightBridge;
  const b: LightBridge = {
    fd: null,
    stream: null,
    connected: false,
    duty: null,
    lastSeen: null,
    error: null,
    port: portPath(),
    timer: null,
    buf: "",
    wantDuty: loadPersist(),
  };
  g.__lightBridge = b;
  openPort(b);
  b.timer = setInterval(() => {
    if (!b.connected) openPort(b);
    else writeCmd(b, "status"); // 생존 확인 — 응답이 오면 lastSeen 갱신
  }, POLL_MS);
  b.timer.unref?.();
  // 첫 재연결은 빠르게
  setTimeout(() => { if (!b.connected) openPort(b); }, RECONNECT_MS).unref?.();
  return b;
}

export interface LightState {
  /** 시리얼 포트가 열려 있는가 (케이블/포트 수준) */
  connected: boolean;
  /** 보드가 실제로 응답하는가 — UI/음성은 이걸 봐야 한다 */
  responding: boolean;
  /** 현재 듀티(%) — 펌웨어와 동기화된 값. 모르면 null */
  duty: number | null;
  /** 서버가 목표로 삼는 듀티 (재연결 시 복원값) */
  wantDuty: number;
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
    port: b.port,
    lastSeen: b.lastSeen,
    error: b.error,
  };
}

/** 듀티 설정 (0=소등, 1~100=밝기). 성공 여부만 반환 — 확정값은 에코 파싱으로 갱신 */
export function setLightDuty(pct: number): { ok: boolean; state: LightState } {
  const b = start();
  const duty = Math.max(0, Math.min(100, Math.round(pct)));
  b.wantDuty = duty;
  savePersist(duty);
  const ok = writeCmd(b, `d ${duty}`);
  if (ok) b.duty = duty; // 낙관적 갱신 — 에코가 오면 실제값으로 덮인다
  return { ok, state: getLightState() };
}
