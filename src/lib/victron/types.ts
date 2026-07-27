// Victron(Venus OS) 읽기 모델 — MQTT dbus 트리를 UI 가 쓰기 좋은 형태로 정리한 계약.
// API(/api/victron) 와 VictronPanel 이 공유한다. 지금은 읽기 전용이며,
// 이후 쓰기(제어)를 추가할 때도 이 스냅샷 구조는 그대로 재사용한다.

/** dbus State 코드 → 라벨 (solarcharger / vebus 공통 충전 상태) */
export const CHARGE_STATE: Record<number, string> = {
  0: "꺼짐",
  1: "저전력",
  2: "고장",
  3: "벌크",
  4: "흡수",
  5: "플로트",
  6: "보관",
  7: "이퀄라이즈",
  8: "패스스루",
  9: "인버팅",
  10: "파워 어시스트",
  11: "파워 서플라이",
  245: "웨이크업",
  247: "자동 이퀄라이즈",
  252: "외부 제어",
};

/** system/0/SystemState/State → 라벨 (시스템 전체 상태) */
export const SYSTEM_STATE: Record<number, string> = {
  0: "꺼짐",
  1: "저전력",
  2: "VE.Bus 고장",
  3: "벌크 충전",
  4: "흡수 충전",
  5: "플로트 충전",
  6: "보관",
  7: "이퀄라이즈",
  8: "패스스루",
  9: "인버팅",
  10: "파워 어시스트",
  11: "파워 서플라이",
  252: "외부 제어",
  256: "방전 중",
  257: "서스테인",
  258: "재충전",
  259: "예약 충전",
};

/** vebus/Mode → 라벨 (인버터/충전기 동작 모드) */
export const VEBUS_MODE: Record<number, string> = {
  1: "충전기만",
  2: "인버터만",
  3: "ON",
  4: "OFF",
};

/** 배터리 모니터 State → 라벨 (0 대기 / 1 충전 / 2 방전) */
export const BATTERY_STATE: Record<number, string> = {
  0: "대기",
  1: "충전 중",
  2: "방전 중",
};

export interface VictronBattery {
  instance: number;
  name: string;
  product: string | null;
  connected: boolean;
  voltage: number | null;
  current: number | null;
  power: number | null;
  soc: number | null;
  temperature: number | null;
  timeToGoS: number | null;
  consumedAh: number | null;
}

export interface VictronSolarCharger {
  instance: number;
  name: string;
  product: string | null;
  connected: boolean;
  pvVoltage: number | null;
  power: number | null; // Yield/Power (현재 발전 W)
  current: number | null; // Dc/0/Current
  voltage: number | null; // Dc/0/Voltage
  yieldTodayKwh: number | null;
  stateCode: number | null;
  state: string | null;
}

export interface VictronAlternator {
  instance: number;
  name: string;
  product: string | null;
  connected: boolean;
  voltage: number | null;
  current: number | null;
  power: number | null;
  stateCode: number | null;
  state: string | null;
}

export interface VictronInverter {
  instance: number;
  name: string;
  product: string | null;
  stateCode: number | null;
  state: string | null;
  modeCode: number | null;
  mode: string | null;
  acInConnected: boolean;
  acInputLabel: string | null;
  acInVoltage: number | null;
  acInPower: number | null;
  acOutVoltage: number | null;
  acOutPower: number | null;
  dcVoltage: number | null;
  dcCurrent: number | null;
  dcPower: number | null;
  currentLimit: number | null;
  alarms: { overload: boolean; lowBattery: boolean; highTemp: boolean };
}

/** system/0 집계 — 대시보드 상단 요약용 */
export interface VictronSystem {
  soc: number | null;
  voltage: number | null;
  current: number | null;
  power: number | null; // 배터리 순 전력(+충전 / -방전)
  timeToGoS: number | null;
  batteryState: string | null;
  temperature: number | null;
  pvPower: number | null; // DC 솔라 총 발전 W
  dcLoadPower: number | null; // Dc/System/Power (DC 부하)
  acLoadPower: number | null; // Ac/Consumption 총 W
  alternatorPower: number | null;
  acInputConnected: boolean;
  acInputPower: number | null;
  systemStateCode: number | null;
  systemState: string | null;
}

export interface VictronSnapshot {
  connected: boolean;
  portalId: string | null;
  host: string;
  updatedAt: number | null; // 마지막 MQTT 메시지 수신 시각(ms)
  error: string | null;
  system: VictronSystem;
  batteries: VictronBattery[];
  solarChargers: VictronSolarCharger[];
  alternators: VictronAlternator[];
  inverter: VictronInverter | null;
}
