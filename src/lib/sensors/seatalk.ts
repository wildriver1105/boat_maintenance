// SeaTalkng/NMEA2000 센서 소스 — 버스에 **송신하는** 기기의 생존 여부.
//
// 목적이 계측값이 아니라 연결 관리다. 그래서 이 소스가 답하는 질문은 하나다:
// "이 기기가 지금 버스에 말을 하고 있는가."
//
// 수신 전용 기기(Axiom·i70·i60·p70s 같은 디스플레이)는 여기 넣지 않는다. 그것들은
// 전원이 들어와 있어도 버스에 데이터를 내보내지 않으므로, 목록에 올리면 멀쩡한
// 기기가 영원히 "미연결"로 남는다 — 없느니만 못한 표시다.

import type { Device, DeviceReading, DeviceStatus } from "@/lib/types";
import { getSeatalkStatus } from "@/lib/seatalk/tcp";
import type { SensorSource } from "./types";

export interface SeatalkBinding {
  /** N2K 주소 */
  src: number;
}

export function seatalkBindingOf(d: Device): SeatalkBinding | null {
  const raw = d.config?.seatalk as { src?: unknown } | undefined;
  return raw && typeof raw.src === "number" ? { src: raw.src } : null;
}

export function isSeatalkDevice(d: Device): boolean {
  return seatalkBindingOf(d) !== null;
}

/** 값 하나를 골라 마커 요약에 쓴다 — 그 기기가 "무엇을 보내는 기기인지" 보이게 */
function headline(values: Record<string, Record<string, unknown>>): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  const h = values.heading?.heading_deg;
  if (typeof h === "number") out.headingDeg = Math.round(h * 10) / 10;
  const sog = values.cogsog?.sog_kn;
  if (typeof sog === "number") out.sogKn = Math.round(sog * 100) / 100;
  const sats = values.sats?.view;
  if (typeof sats === "number") out.sats = sats;
  const wind = values.wind?.speed_kn;
  if (typeof wind === "number") out.windKn = Math.round(wind * 10) / 10;
  const water = values.env?.water_c ?? values.temp?.temp_c;
  if (typeof water === "number") out.waterC = Math.round(water * 10) / 10;
  const stw = values.stw?.stw_kn;
  if (typeof stw === "number") out.stwKn = Math.round(stw * 100) / 100;
  return out;
}

export class SeatalkSensorSource implements SensorSource {
  readonly name = "seatalk";

  async getReadings(devices: Device[]): Promise<DeviceReading[]> {
    const targets = devices.filter((d) => d.sensorId && isSeatalkDevice(d));
    if (targets.length === 0) return [];

    const st = getSeatalkStatus();
    const ts = Date.now();
    const bySrc = new Map(st.devices.map((d) => [d.src, d]));

    return targets.map((d) => {
      const b = seatalkBindingOf(d)!;
      const seen = bySrc.get(b.src);
      // 게이트웨이가 끊겼으면 기기 판정을 하지 않는다 — 계기가 멀쩡해도 우리가
      // 모르는 것뿐이고, 그걸 "기기 고장"으로 적으면 엉뚱한 곳을 뜯게 된다
      const status: DeviceStatus = !st.connected ? "offline" : seen?.live ? "ok" : "offline";
      return {
        sensorId: d.sensorId!,
        status,
        values: seen?.live ? { ...headline(seen.values), 메시지: seen.count } : {},
        ts,
        source: this.name,
      };
    });
  }
}
