// 조명 센서 소스 — ESP32 시리얼 브리지 상태를 DeviceReading 으로 변환.
// config.lighting 이 있는 장비가 대상. 브리지가 끊겨 있으면 offline 로 정직하게 표시.
import type { Device, DeviceReading } from "@/lib/types";
import { getLightState } from "@/lib/lighting/tcp";
import type { SensorSource } from "./types";

export function isLightingDevice(d: Device): boolean {
  return d.config?.lighting === true;
}

export class LightingSensorSource implements SensorSource {
  readonly name = "esp32";

  async getReadings(devices: Device[]): Promise<DeviceReading[]> {
    const targets = devices.filter((d) => d.sensorId && isLightingDevice(d));
    if (targets.length === 0) return [];
    const s = getLightState();
    const ts = Date.now();
    const values: Record<string, number | string | boolean> =
      s.responding && s.duty != null ? { on: s.duty > 0, duty: s.duty } : {};
    return targets.map((d) => ({
      sensorId: d.sensorId!,
      status: s.responding ? ("ok" as const) : ("offline" as const),
      values,
      ts,
      source: this.name,
    }));
  }
}
