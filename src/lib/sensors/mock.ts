// 목업 센서 소스 — 카테고리별로 그럴듯한 값을 만들고 시간에 따라 완만히 변동시킨다.
// 실제 하드웨어 없이 UI/파이프라인을 검증하기 위한 것이며, CAN/zigbee 소스로 대체된다.

import type { Device, DeviceReading, DeviceStatus } from "@/lib/types";
import type { SensorSource } from "./types";

/** 문자열 → 안정적인 0..1 시드 (Math.random 대신 sensorId 기반 결정론) */
function seed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

/** -1..1 사이를 천천히 오가는 값 (시간 + 시드 위상) */
function drift(id: string, periodS: number, tSec: number): number {
  const phase = seed(id) * Math.PI * 2;
  return Math.sin((tSec / periodS) * Math.PI * 2 + phase);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function worst(...s: DeviceStatus[]): DeviceStatus {
  const order: DeviceStatus[] = ["ok", "warning", "alert"];
  return s.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a), "ok");
}

function readingFor(device: Device, tSec: number): DeviceReading {
  const sid = device.sensorId!;
  const s = seed(sid);
  let status: DeviceStatus = "ok";
  let values: Record<string, number | string | boolean> = {};

  switch (device.category) {
    case "fuel": {
      const level = clamp01(0.55 + 0.4 * drift(sid, 600, tSec) - 0.1);
      values = { level: +level.toFixed(3), capacityL: (device.config?.capacityL as number) ?? null };
      status = level < 0.08 ? "alert" : level < 0.2 ? "warning" : "ok";
      break;
    }
    case "water": {
      const level = clamp01(0.6 + 0.35 * drift(sid, 500, tSec));
      values = { level: +level.toFixed(3), capacityL: (device.config?.capacityL as number) ?? null };
      status = level < 0.1 ? "alert" : level < 0.25 ? "warning" : "ok";
      break;
    }
    case "waste": {
      const level = clamp01(0.35 + 0.4 * (0.5 + 0.5 * drift(sid, 700, tSec)));
      values = { level: +level.toFixed(3), capacityL: (device.config?.capacityL as number) ?? null };
      status = level > 0.9 ? "alert" : level > 0.75 ? "warning" : "ok";
      break;
    }
    case "engine": {
      const running = s > 0.4;
      const tempC = running ? 82 + 12 * (0.5 + 0.5 * drift(sid, 120, tSec)) : 24;
      const rpm = running ? Math.round(1400 + 600 * drift(sid, 90, tSec)) : 0;
      const oilBar = running ? +(3.8 + 0.6 * drift(sid, 60, tSec)).toFixed(2) : 0;
      values = { running, tempC: +tempC.toFixed(1), rpm, oilBar };
      status = !running ? "ok" : tempC > 102 ? "alert" : tempC > 94 ? "warning" : "ok";
      break;
    }
    case "electrical": {
      const soc = clamp01(0.7 + 0.25 * drift(sid, 400, tSec));
      const voltage = +(11.9 + 0.9 * soc + 0.1 * drift(sid, 40, tSec)).toFixed(2);
      const currentA = +(-8 + 30 * (0.5 + 0.5 * drift(sid, 80, tSec))).toFixed(1);
      values = { soc: +soc.toFixed(3), voltage, currentA };
      status = voltage < 11.6 ? "alert" : voltage < 12.1 ? "warning" : "ok";
      break;
    }
    case "bilge": {
      const levelMm = Math.max(0, Math.round(20 + 180 * (0.5 + 0.5 * drift(sid, 240, tSec)) - 60));
      const alarmMm = (device.config?.alarmMm as number) ?? 150;
      const pumpOn = levelMm > 40;
      values = { levelMm, pumpOn, alarmMm };
      status = levelMm >= alarmMm ? "alert" : levelMm > 50 ? "warning" : "ok";
      break;
    }
    case "seacock": {
      const open = drift(sid, 3600, tSec) > -0.3;
      values = { open };
      status = "ok"; // 시콕크는 개폐 상태 정보 표시(경고 아님)
      break;
    }
    case "charging": {
      const modes = ["off", "bulk", "absorption", "float"] as const;
      const mode = modes[Math.floor((0.5 + 0.5 * drift(sid, 300, tSec)) * modes.length) % modes.length];
      const outputW = mode === "off" ? 0 : Math.round(200 + 1600 * (0.5 + 0.5 * drift(sid, 120, tSec)));
      values = { mode, outputW };
      status = "ok";
      break;
    }
    case "navigation":
    case "comms": {
      const online = drift(sid, 900, tSec) > -0.85;
      const signal = Math.round(60 + 40 * drift(sid, 100, tSec));
      values = { online, signal: Math.max(0, Math.min(100, signal)) };
      status = online ? "ok" : "warning";
      break;
    }
    case "safety": {
      const armed = drift(sid, 5000, tSec) > -0.95;
      values = { armed };
      status = armed ? "ok" : "alert";
      break;
    }
    default: {
      const value = +(0.5 + 0.5 * drift(sid, 300, tSec)).toFixed(3);
      values = { value };
      status = "ok";
    }
  }

  return { sensorId: sid, status: worst(status), values, ts: Math.round(tSec * 1000) };
}

export class MockSensorSource implements SensorSource {
  readonly name = "mock";

  async getReadings(devices: Device[]): Promise<DeviceReading[]> {
    const tSec = Date.now() / 1000;
    return devices
      .filter((d) => !!d.sensorId)
      .map((d) => readingFor(d, tSec));
  }
}
