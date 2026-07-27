// 활성 센서 소스 선택 지점.
//
// 기본은 Composite: config.victron 바인딩이 있는 장비는 Venus OS 실측값을 쓰고,
// 아직 실통신이 없는 나머지 장비만 목업으로 채운다(리딩에 mock=true 표시).
// SENSOR_SOURCE=mock 이면 전부 목업, =victron 이면 실측 장비만 표시된다.
import type { Device, DeviceReading } from "@/lib/types";
import type { SensorSource } from "./types";
import { MockSensorSource } from "./mock";
import { VictronSensorSource } from "./victron";
import { bindingOf } from "@/lib/victron/binding";

/** 실측(Victron) + 목업(나머지) 합성 소스 */
class CompositeSensorSource implements SensorSource {
  readonly name = "victron+mock";
  private victron = new VictronSensorSource();
  private mock = new MockSensorSource();

  async getReadings(devices: Device[]): Promise<DeviceReading[]> {
    const bound = devices.filter((d) => !!bindingOf(d));
    const unbound = devices.filter((d) => !bindingOf(d));

    const [real, fake] = await Promise.all([
      this.victron.getReadings(bound),
      this.mock.getReadings(unbound),
    ]);

    return [
      ...real,
      // 목업 리딩은 실측과 구분되도록 표시 — UI 에서 "모의" 배지로 렌더링된다
      ...fake.map((r) => ({ ...r, source: "mock", mock: true })),
    ];
  }
}

let cached: SensorSource | null = null;

export function getSensorSource(): SensorSource {
  if (cached) return cached;
  switch (process.env.SENSOR_SOURCE) {
    case "mock":
      cached = new MockSensorSource();
      break;
    case "victron":
      cached = new VictronSensorSource();
      break;
    // case "can": cached = new CanSensorSource(); break;
    default:
      cached = new CompositeSensorSource();
  }
  return cached;
}

export type { SensorSource } from "./types";
