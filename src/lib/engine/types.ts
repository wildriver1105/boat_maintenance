// 엔진 도메인 타입 — 사양(고정) + 정비 이력(가변).
//
// 이 배의 엔진은 NMEA 2000 게이트웨이가 없어 실시간 계측(RPM·유온·유압)이 들어오지 않는다.
// (Signal K 에 propulsion 경로 없음 확인) 그래서 계측값이 아니라
// "사양 + 운전시간 + 정비 주기" 를 관리하는 패널이다. 나중에 엔진 데이터가
// 올라오면 EngineSnapshot 에 live 필드를 추가하면 된다.

export interface EngineSpec {
  maker: string;
  model: string;
  /** 정격 출력 */
  ratedHp: number | null;
  ratedRpm: number | null;
  /** 연속 정격 */
  continuousHp: number | null;
  continuousRpm: number | null;
  cylinders: number | null;
  displacementL: number | null;
  boreMm: number | null;
  strokeMm: number | null;
  aspiration: string | null;
  cooling: string | null;
  weightKg: number | null;
  /** 최대 출력 시 연료 소비 (L/h) */
  fuelLph: number | null;
  /** 사양 출처 — 어디서 온 값인지 남긴다 */
  specSource?: string;
}

export interface MaintenanceItem {
  id: string;
  /** 정비 항목명 — 예 "엔진 오일" */
  name: string;
  /** 소모품 규격 (예 "SAE 15W-40, CD급") — 매뉴얼 확인 후 입력 */
  spec?: string | null;
  /** 교체 주기(운전시간). null 이면 미입력 */
  intervalHours?: number | null;
  /** 교체 주기(개월). 시간·개월 중 먼저 도달하는 쪽 */
  intervalMonths?: number | null;
  /** 마지막 정비 시점 */
  lastHours?: number | null;
  lastDate?: string | null; // YYYY-MM-DD
  notes?: string | null;
}

/** 엔진 관련 실측을 어디서 가져올지 (Victron dbus 서비스 경로) */
export interface EngineLinks {
  batteryService?: string | null;
  batteryTempService?: string | null;
}

/**
 * 계기판 실측값. 이 배는 NMEA 2000 엔진 게이트웨이가 없어 rpm/냉각수/유압/연료는
 * 항상 null 이다 — 센서가 붙으면 여기만 채우면 계기판이 그대로 살아난다.
 * 엔진 배터리는 Victron SmartShunt 로 실제 측정되고 있다.
 */
export interface EngineLive {
  rpm: number | null;
  coolantC: number | null;
  oilBar: number | null;
  /** 연료 잔량 0..1 */
  fuelRatio: number | null;
  batteryV: number | null;
  batterySoc: number | null;
  batteryTempC: number | null;
  /** 각 값의 출처 — UI 에서 "실측/미연결"을 구분해 보여준다 */
  sources: Record<string, string | null>;
}

export interface EngineRecord {
  id: string;
  name: string;
  spec: EngineSpec;
  links?: EngineLinks;
  /** 현재 운전시간(시간계 판독값) — 센서가 없어 수동 입력 */
  hours: number | null;
  hoursUpdated: string | null; // YYYY-MM-DD
  maintenance: MaintenanceItem[];
}

/** 다음 정비까지 남은 시간/개월. 주기 미입력이면 null */
export interface MaintenanceDue {
  itemId: string;
  /** 남은 운전시간 (음수면 초과) */
  hoursLeft: number | null;
  /** 남은 개월 (음수면 초과) */
  monthsLeft: number | null;
  /** 하나라도 초과했는가 */
  overdue: boolean;
  /** 임박(10% 이내 또는 1개월 이내) */
  soon: boolean;
}
