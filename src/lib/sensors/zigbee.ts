// Zigbee 센서 소스 — Zigbee2MQTT 가 흘려주는 기기 상태를 DeviceReading 으로 변환.
// config.zigbee 가 있는 장비가 대상. 브리지나 기기가 응답하지 않으면 offline 으로
// 정직하게 표시하고 값은 비운다 (마지막 값을 계속 보여주면 죽은 계기를 살아있는
// 것으로 착각하게 된다).

import type { Device, DeviceReading, DeviceStatus } from "@/lib/types";
import { getZigbeeDevice, isZigbeeDeviceLive, requestZigbeeState } from "@/lib/zigbee/mqtt";
import { zigbeeBindingOf } from "@/lib/zigbee/binding";
import type { SensorSource } from "./types";

/** 링크 품질이 이보다 낮으면 통신이 불안정하다고 본다 (0~255) */
const WEAK_LINK = 30;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export class ZigbeeSensorSource implements SensorSource {
  readonly name = "zigbee";

  async getReadings(devices: Device[]): Promise<DeviceReading[]> {
    const ts = Date.now();
    const out: DeviceReading[] = [];

    for (const d of devices) {
      const b = zigbeeBindingOf(d);
      if (!b || !d.sensorId) continue;

      const e = getZigbeeDevice(b.id);
      if (!e || !isZigbeeDeviceLive(e)) {
        // 값이 없거나 오래됐으면 한 번 물어본다 (내부에서 30초 간격으로 제한)
        requestZigbeeState(b.id);
        out.push({ sensorId: d.sensorId, status: "offline", values: {}, ts, source: this.name });
        continue;
      }

      const v = e.values;
      const values: Record<string, number | string | boolean> = {};

      // 스위치
      if (typeof v.state === "string") values.on = v.state === "ON";
      // 전력 계측 (플러그가 보고하는 것만 담는다)
      const power = num(v.power);
      const voltage = num(v.voltage);
      const current = num(v.current);
      const energy = num(v.energy);
      const pf = num(v.power_factor);
      const freq = num(v.ac_frequency);
      const lqi = num(v.linkquality);
      if (power !== undefined) values.watts = power;
      if (voltage !== undefined) values.volts = voltage;
      if (current !== undefined) values.amps = current;
      if (energy !== undefined) values.kwh = energy;
      if (pf !== undefined) values.powerFactor = pf;
      if (freq !== undefined) values.hz = freq;
      if (lqi !== undefined) values.lqi = lqi;
      if (typeof v.power_on_behavior === "string") values.powerOnBehavior = v.power_on_behavior;
      // 켜진 채 고정되어 있는가 (UI 의 "끄기 잠금")
      if (typeof v.metering_only_mode === "string")
        values.meteringOnly = v.metering_only_mode === "ON";
      const led = num(v.led_brightness);
      if (led !== undefined) values.ledBrightness = led;
      // 남은 타이머 (0 = 없음)
      const cOff = num(v.countdown_to_turn_off);
      const cOn = num(v.countdown_to_turn_on);
      if (cOff !== undefined) values.countdownOff = cOff;
      if (cOn !== undefined) values.countdownOn = cOn;

      // 값은 오는데 링크가 약하면 경고 — 곧 끊길 수 있다는 신호다
      const status: DeviceStatus = lqi !== undefined && lqi < WEAK_LINK ? "warning" : "ok";
      out.push({ sensorId: d.sensorId, status, values, ts, source: this.name });
    }

    return out;
  }
}

export function isZigbeeDevice(d: Device): boolean {
  return zigbeeBindingOf(d) !== null;
}
