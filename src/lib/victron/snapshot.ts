// 원시 dbus 값 Map → UI 용 VictronSnapshot 으로 정리.
// 브로커에서 받은 평평한 경로 맵을 서비스별로 그룹핑하고 관심 경로만 뽑는다.

import { getVictronBroker } from "./mqtt";
import {
  BATTERY_STATE,
  CHARGE_STATE,
  SYSTEM_STATE,
  VEBUS_MODE,
  type VictronAlternator,
  type VictronBattery,
  type VictronInverter,
  type VictronSnapshot,
  type VictronSolarCharger,
  type VictronTemperature,
} from "./types";

type Vals = Map<string, unknown>;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function round(v: number | null, digits = 1): number | null {
  if (v == null) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
function label(map: Record<number, string>, code: number | null): string | null {
  return code == null ? null : map[code] ?? `상태 ${code}`;
}

/** 특정 서비스(type)의 인스턴스 목록을 찾는다. 예: "solarcharger" → [277,278,...] */
function instancesOf(vals: Vals, service: string): number[] {
  const set = new Set<number>();
  const prefix = `${service}/`;
  for (const key of vals.keys()) {
    if (!key.startsWith(prefix)) continue;
    const inst = Number(key.slice(prefix.length).split("/")[0]);
    if (Number.isFinite(inst)) set.add(inst);
  }
  return [...set].sort((a, b) => a - b);
}

function get(vals: Vals, path: string): unknown {
  return vals.get(path);
}

/** 모든 장비 공통: 서비스 경로·물리 연결 방식·펌웨어·시리얼·에러코드 */
function link(vals: Vals, path: string) {
  return {
    service: path,
    connection: str(get(vals, `${path}/Mgmt/Connection`)),
    firmware: (() => {
      const f = get(vals, `${path}/FirmwareVersion`);
      return f == null ? null : String(f);
    })(),
    serial: str(get(vals, `${path}/Serial`)),
    errorCode: num(get(vals, `${path}/ErrorCode`)),
  };
}

/** MPP 추적 모드 (solarcharger/MppOperationMode) */
const MPP_MODE: Record<number, string> = { 0: "꺼짐", 1: "전압/전류 제한", 2: "MPPT 추적" };

function battery(vals: Vals, inst: number): VictronBattery {
  const p = `battery/${inst}`;
  return {
    ...link(vals, p),
    instance: inst,
    name: str(get(vals, `${p}/CustomName`)) ?? `배터리 ${inst}`,
    product: str(get(vals, `${p}/ProductName`)),
    connected: get(vals, `${p}/Connected`) === 1,
    voltage: round(num(get(vals, `${p}/Dc/0/Voltage`)), 2),
    current: round(num(get(vals, `${p}/Dc/0/Current`)), 1),
    power: round(num(get(vals, `${p}/Dc/0/Power`)), 0),
    soc: round(num(get(vals, `${p}/Soc`)), 1),
    temperature: round(num(get(vals, `${p}/Dc/0/Temperature`)), 1),
    timeToGoS: num(get(vals, `${p}/TimeToGo`)),
    consumedAh: round(num(get(vals, `${p}/ConsumedAmphours`)), 1),
  };
}

function solarCharger(vals: Vals, inst: number): VictronSolarCharger {
  const p = `solarcharger/${inst}`;
  const stateCode = num(get(vals, `${p}/State`));
  return {
    ...link(vals, p),
    instance: inst,
    name: str(get(vals, `${p}/CustomName`)) ?? `MPPT ${inst}`,
    product: str(get(vals, `${p}/ProductName`)),
    connected: get(vals, `${p}/Connected`) === 1,
    pvVoltage: round(num(get(vals, `${p}/Pv/V`)), 1),
    power: round(num(get(vals, `${p}/Yield/Power`)), 0),
    current: round(num(get(vals, `${p}/Dc/0/Current`)), 1),
    voltage: round(num(get(vals, `${p}/Dc/0/Voltage`)), 2),
    yieldTodayKwh: round(num(get(vals, `${p}/Yield/User`)), 2),
    yieldSystemKwh: round(num(get(vals, `${p}/Yield/System`)), 2),
    mppMode: (() => {
      const m = num(get(vals, `${p}/MppOperationMode`));
      return m == null ? null : MPP_MODE[m] ?? `모드 ${m}`;
    })(),
    stateCode,
    state: label(CHARGE_STATE, stateCode),
  };
}

function alternator(vals: Vals, inst: number): VictronAlternator {
  const p = `alternator/${inst}`;
  const stateCode = num(get(vals, `${p}/State`));
  return {
    ...link(vals, p),
    instance: inst,
    name: str(get(vals, `${p}/CustomName`)) ?? `얼터네이터 ${inst}`,
    product: str(get(vals, `${p}/ProductName`)),
    connected: get(vals, `${p}/Connected`) === 1,
    voltage: round(num(get(vals, `${p}/Dc/0/Voltage`)), 2),
    current: round(num(get(vals, `${p}/Dc/0/Current`)), 1),
    power: round(num(get(vals, `${p}/Dc/0/Power`)), 0),
    stateCode,
    state: label(CHARGE_STATE, stateCode),
  };
}

function inverter(vals: Vals, inst: number): VictronInverter {
  const p = `vebus/${inst}`;
  const stateCode = num(get(vals, `${p}/State`));
  const modeCode = num(get(vals, `${p}/Mode`));
  return {
    ...link(vals, p),
    instance: inst,
    name: str(get(vals, `${p}/CustomName`)) ?? "인버터/충전기",
    product: str(get(vals, `${p}/ProductName`)),
    stateCode,
    state: label(SYSTEM_STATE, stateCode),
    modeCode,
    mode: label(VEBUS_MODE, modeCode),
    acInConnected: get(vals, `${p}/Ac/ActiveIn/Connected`) === 1,
    acInputLabel: null,
    acInVoltage: round(num(get(vals, `${p}/Ac/ActiveIn/L1/V`)), 0),
    acInPower: round(num(get(vals, `${p}/Ac/ActiveIn/P`)), 0),
    acOutVoltage: round(num(get(vals, `${p}/Ac/Out/L1/V`)), 0),
    acOutPower: round(num(get(vals, `${p}/Ac/Out/P`)), 0),
    dcVoltage: round(num(get(vals, `${p}/Dc/0/Voltage`)), 2),
    dcCurrent: round(num(get(vals, `${p}/Dc/0/Current`)), 1),
    dcPower: round(num(get(vals, `${p}/Dc/0/Power`)), 0),
    currentLimit: num(get(vals, `${p}/Ac/ActiveIn/CurrentLimit`)),
    alarms: {
      overload: num(get(vals, `${p}/Alarms/Overload`)) === 1 || num(get(vals, `${p}/Alarms/Overload`)) === 2,
      lowBattery: num(get(vals, `${p}/Alarms/LowBattery`)) === 1 || num(get(vals, `${p}/Alarms/LowBattery`)) === 2,
      highTemp: num(get(vals, `${p}/Alarms/HighTemperature`)) === 1 || num(get(vals, `${p}/Alarms/HighTemperature`)) === 2,
    },
  };
}

function temperature(vals: Vals, inst: number): VictronTemperature {
  const p = `temperature/${inst}`;
  return {
    instance: inst,
    name: str(get(vals, `${p}/CustomName`)) ?? `온도 센서 ${inst}`,
    connected: get(vals, `${p}/Connected`) === 1,
    celsius: round(num(get(vals, `${p}/Temperature`)), 1),
  };
}

export function buildSnapshot(): VictronSnapshot {
  const broker = getVictronBroker();
  const vals = broker.values;
  const sys = (path: string) => get(vals, `system/0/${path}`);

  const batteries = instancesOf(vals, "battery").map((i) => battery(vals, i));
  const solarChargers = instancesOf(vals, "solarcharger").map((i) => solarCharger(vals, i));
  const alternators = instancesOf(vals, "alternator").map((i) => alternator(vals, i));
  const temperatures = instancesOf(vals, "temperature").map((i) => temperature(vals, i));
  const vebusInstances = instancesOf(vals, "vebus");
  const inv = vebusInstances.length > 0 ? inverter(vals, vebusInstances[0]) : null;

  const systemStateCode = num(sys("SystemState/State"));
  const batteryStateCode = num(sys("Dc/Battery/State"));

  return {
    connected: broker.connected,
    portalId: broker.portalId,
    host: broker.host,
    updatedAt: broker.updatedAt,
    error: broker.error,
    system: {
      soc: round(num(sys("Dc/Battery/Soc")), 1),
      voltage: round(num(sys("Dc/Battery/Voltage")), 2),
      current: round(num(sys("Dc/Battery/Current")), 1),
      power: round(num(sys("Dc/Battery/Power")), 0),
      timeToGoS: num(sys("Dc/Battery/TimeToGo")),
      batteryState: label(BATTERY_STATE, batteryStateCode),
      temperature: round(num(sys("Dc/Battery/Temperature")), 1),
      pvPower: round(num(sys("Dc/Pv/Power")), 0),
      dcLoadPower: round(num(sys("Dc/System/Power")), 0),
      acLoadPower: round(num(sys("Ac/Consumption/L1/Power")), 0),
      alternatorPower: round(num(sys("Dc/Alternator/Power")), 0),
      acInputConnected: get(vals, "system/0/Ac/In/0/Connected") === 1,
      acInputPower: round(num(sys("Ac/ActiveIn/L1/Power")), 0),
      systemStateCode,
      systemState: label(SYSTEM_STATE, systemStateCode),
    },
    batteries,
    solarChargers,
    alternators,
    inverter: inv,
    temperatures,
  };
}
