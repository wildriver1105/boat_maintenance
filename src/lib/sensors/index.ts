// 활성 센서 소스 선택 지점.
//
// 지금 이 배에서 실제로 계측되는 것은 Victron(Venus OS MQTT) 뿐이다.
// 그 외 장비는 센서가 물리적으로 연결되어 있지 않으므로 리딩을 만들지 않는다 —
// 값이 없으면 UI 가 "미연결"로 표시한다.
//
// 가짜 값으로 채우지 않는 이유: 배에서 계기가 그럴듯한 숫자를 보여주면
// 연결이 끊긴 것인지 정상인지 구분할 수 없고, 그 판단 착오는 위험하다.
//
// 이후 CAN/NMEA2000/ESP32 소스를 추가할 때는 여기에 케이스를 늘리고
// CompositeSensorSource 처럼 합치면 된다.
import type { Device, DeviceReading } from "@/lib/types";
import type { SensorSource } from "./types";
import { VictronSensorSource } from "./victron";
import { LightingSensorSource, isLightingDevice } from "./lighting";
import { bindingOf } from "@/lib/victron/binding";

/** 실측 소스 합성: Victron(MQTT) + 조명 ESP32(시리얼). 가짜 값은 만들지 않는다. */
class CompositeSensorSource implements SensorSource {
  readonly name = "victron+esp32";
  private victron = new VictronSensorSource();
  private lighting = new LightingSensorSource();

  async getReadings(devices: Device[]): Promise<DeviceReading[]> {
    const [a, b] = await Promise.all([
      this.victron.getReadings(devices.filter((d) => bindingOf(d))),
      this.lighting.getReadings(devices.filter((d) => isLightingDevice(d))),
    ]);
    return [...a, ...b];
  }
}

let cached: SensorSource | null = null;

export function getSensorSource(): SensorSource {
  if (cached) return cached;
  switch (process.env.SENSOR_SOURCE) {
    // case "can": cached = new CanSensorSource(); break;
    default:
      cached = new CompositeSensorSource();
  }
  return cached;
}

export type { SensorSource } from "./types";
