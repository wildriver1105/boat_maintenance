// Victron 실측 센서 소스 — devices.json 의 config.victron 바인딩을 따라
// Venus OS MQTT 값을 DeviceReading 으로 변환한다.
//
// 값(values) 형태는 목업 소스와 동일하게 맞춘다. 그래야 format.ts(summarize/detailRows)와
// 마커/패널이 소스 구분 없이 그대로 동작한다.
//   charging   → { mode, outputW }
//   electrical → { soc(0..1), voltage, currentA }

import type { Device, DeviceReading, DeviceStatus } from "@/lib/types";
import { getVictronBroker } from "@/lib/victron/mqtt";
import { CHARGE_STATE } from "@/lib/victron/types";
import { bindingOf } from "@/lib/victron/binding";
import type { SensorSource } from "./types";

type Vals = Map<string, unknown>;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number | null, d = 2): number | null {
  if (v == null) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** 12V 계통 전압 기준 상태 판정 (목업과 동일 임계값) */
function voltageStatus(voltage: number | null): DeviceStatus {
  if (voltage == null) return "offline";
  if (voltage < 11.6) return "alert";
  if (voltage < 12.1) return "warning";
  return "ok";
}

/** 충전기 계열(vebus/solarcharger/alternator) → { mode, outputW } */
function chargerReading(vals: Vals, path: string): { values: Record<string, number | string | boolean>; status: DeviceStatus } | null {
  const service = path.split("/")[0];
  const connected = vals.get(`${path}/Connected`);
  const stateCode = num(vals.get(`${path}/State`));
  const errorCode = num(vals.get(`${path}/ErrorCode`));

  let outputW: number | null = null;
  if (service === "solarcharger") outputW = num(vals.get(`${path}/Yield/Power`));
  else if (service === "vebus") outputW = num(vals.get(`${path}/Dc/0/Power`));
  else outputW = num(vals.get(`${path}/Dc/0/Power`));

  const voltage = num(vals.get(`${path}/Dc/0/Voltage`));
  const current = num(vals.get(`${path}/Dc/0/Current`));

  // 값이 하나도 없으면 미바인딩/미수신
  if (stateCode == null && outputW == null && voltage == null) return null;

  // vebus 는 State 가 시스템 상태 코드(9=인버팅 등), 나머지는 충전 상태 코드
  const isOff = stateCode === 0;
  const mode = isOff ? "off" : CHARGE_STATE[stateCode ?? -1] ?? `상태 ${stateCode}`;

  let status: DeviceStatus = "ok";
  if (connected === 0) status = "offline";
  else if (errorCode != null && errorCode !== 0) status = "alert";
  else if (stateCode === 2) status = "alert"; // 고장

  const values: Record<string, number | string | boolean> = {
    mode,
    outputW: Math.round(outputW ?? 0),
  };
  if (voltage != null) values.voltage = round(voltage, 2)!;
  if (current != null) values.currentA = round(current, 1)!;

  return { values, status };
}

/** 배터리 모니터 / system 집계 → { soc, voltage, currentA } */
function batteryReading(vals: Vals, path: string): { values: Record<string, number | string | boolean>; status: DeviceStatus } | null {
  const isSystem = path === "system/0";
  const socRaw = num(vals.get(isSystem ? "system/0/Dc/Battery/Soc" : `${path}/Soc`));
  const voltage = num(
    vals.get(isSystem ? "system/0/Dc/Battery/Voltage" : `${path}/Dc/0/Voltage`),
  );
  const current = num(
    vals.get(isSystem ? "system/0/Dc/Battery/Current" : `${path}/Dc/0/Current`),
  );
  const power = num(vals.get(isSystem ? "system/0/Dc/Battery/Power" : `${path}/Dc/0/Power`));
  const temp = num(
    vals.get(isSystem ? "system/0/Dc/Battery/Temperature" : `${path}/Dc/0/Temperature`),
  );

  if (socRaw == null && voltage == null) return null;

  const values: Record<string, number | string | boolean> = {};
  // 목업과 동일하게 SoC 는 0..1 비율로 (format.ts 가 pct() 로 100 을 곱함)
  if (socRaw != null) values.soc = round(socRaw / 100, 3)!;
  if (voltage != null) values.voltage = round(voltage, 2)!;
  if (current != null) values.currentA = round(current, 1)!;
  if (power != null) values.powerW = Math.round(power);
  if (temp != null) values.tempC = round(temp, 1)!;

  const connected = vals.get(`${path}/Connected`);
  let status = voltageStatus(voltage);
  if (!isSystem && connected === 0) status = "offline";
  // SoC 가 매우 낮으면 승격
  if (socRaw != null && socRaw < 20 && status === "ok") status = "warning";
  if (socRaw != null && socRaw < 10) status = "alert";

  return { values, status };
}

export class VictronSensorSource implements SensorSource {
  readonly name = "victron";

  async getReadings(devices: Device[]): Promise<DeviceReading[]> {
    const { values, connected } = getVictronBroker();
    const ts = Date.now();
    const out: DeviceReading[] = [];

    for (const device of devices) {
      if (!device.sensorId) continue;
      const binding = bindingOf(device);
      if (!binding) continue;

      // 브로커가 끊겼으면 실측 장비는 offline 으로 표시 (목업으로 대체하지 않는다)
      if (!connected) {
        out.push({
          sensorId: device.sensorId,
          status: "offline",
          values: {},
          ts,
          source: this.name,
        });
        continue;
      }

      const service = binding.path.split("/")[0];
      const built =
        service === "battery" || binding.path === "system/0"
          ? batteryReading(values, binding.path)
          : chargerReading(values, binding.path);

      out.push({
        sensorId: device.sensorId,
        status: built?.status ?? "offline",
        values: built?.values ?? {},
        ts,
        source: this.name,
      });
    }

    return out;
  }
}
