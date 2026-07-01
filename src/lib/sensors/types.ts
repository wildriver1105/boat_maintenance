// 센서 소스 추상화 — 지금은 Mock, 이후 CAN/zigbee 를 같은 인터페이스로 구현.
import type { Device, DeviceReading } from "@/lib/types";

export interface SensorSource {
  /** 소스 식별용 이름 (UI 연결 상태 표시에 사용) */
  readonly name: string;
  /** 현재 등록된 디바이스들에 대한 최신 리딩을 반환 */
  getReadings(devices: Device[]): Promise<DeviceReading[]>;
}
