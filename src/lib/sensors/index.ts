// 활성 센서 소스 선택 지점.
// 이후 CAN/zigbee 구현을 추가하고 SENSOR_SOURCE 환경변수로 스위치한다.
import type { SensorSource } from "./types";
import { MockSensorSource } from "./mock";

let cached: SensorSource | null = null;

export function getSensorSource(): SensorSource {
  if (cached) return cached;
  switch (process.env.SENSOR_SOURCE) {
    // case "can": cached = new CanSensorSource(); break;
    // case "zigbee": cached = new ZigbeeSensorSource(); break;
    default:
      cached = new MockSensorSource();
  }
  return cached;
}

export type { SensorSource } from "./types";
