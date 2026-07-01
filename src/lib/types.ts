// 도메인 타입: 디바이스(무엇이 어디에) + 센서 리딩(상태값)
// 이 파일은 UI / API / 센서 소스가 공유하는 계약(contract)입니다.

export type DeviceCategory =
  | "engine" // 엔진
  | "fuel" // 연료 탱크
  | "water" // 청수 탱크
  | "waste" // 오수/홀딩 탱크
  | "electrical" // 전기 (배터리/분배)
  | "charging" // 충전/인버터 (Multiplus, MPPT, DC-DC 등)
  | "navigation" // 항해/계기 (MFD, 오토파일럿, 센서)
  | "comms" // 통신 (VHF, AIS, Starlink, 안테나)
  | "safety" // 안전 (EPIRB 등)
  | "bilge" // 빌지/펌프
  | "seacock" // 시콕크 (through-hull 밸브)
  | "other"; // 기타

export type DeviceStatus = "ok" | "warning" | "alert" | "offline";

/** 도면 위 한 지점에 놓인 관리 대상 부품/기기 */
export interface Device {
  id: string;
  name: string;
  category: DeviceCategory;
  /** SVG viewBox(0 0 2000 850) 기준 좌표 */
  position: { x: number; y: number };
  /** 텔레메트리 바인딩 키. 없으면 센서 미연결(offline)로 표시 */
  sensorId?: string;
  /** 라벨 위치 미세조정(옵션). 없으면 자동 배치(상/하단 여백) */
  labelOffset?: { dx: number; dy: number };
  /** 용량, 임계값 등 카테고리별 설정 */
  config?: Record<string, unknown>;
  notes?: string;
}

/** 센서 소스가 내보내는 한 시점의 상태값 */
export interface DeviceReading {
  sensorId: string;
  status: DeviceStatus;
  /** 예: { level: 0.8 } (탱크), { open: true } (시콕크), { tempC: 88 } (엔진) */
  values: Record<string, number | string | boolean>;
  ts: number;
}

/** 카테고리 표시 메타 (라벨/색/아이콘) — UI 전역에서 재사용 */
export const CATEGORY_META: Record<
  DeviceCategory,
  { label: string; short: string; icon: string; accent: string }
> = {
  engine: { label: "엔진", short: "ENG", icon: "⚙️", accent: "#6366f1" },
  fuel: { label: "연료 탱크", short: "FUEL", icon: "⛽", accent: "#f97316" },
  water: { label: "청수 탱크", short: "H2O", icon: "💧", accent: "#0ea5e9" },
  waste: { label: "오수 탱크", short: "WASTE", icon: "🚽", accent: "#a16207" },
  electrical: { label: "전기", short: "ELEC", icon: "🔋", accent: "#eab308" },
  charging: { label: "충전/인버터", short: "CHG", icon: "🔌", accent: "#22c55e" },
  navigation: { label: "항해/계기", short: "NAV", icon: "🧭", accent: "#3b82f6" },
  comms: { label: "통신", short: "COMM", icon: "📡", accent: "#06b6d4" },
  safety: { label: "안전", short: "SOS", icon: "🆘", accent: "#ef4444" },
  bilge: { label: "빌지/펌프", short: "BILGE", icon: "🌊", accent: "#14b8a6" },
  seacock: { label: "시콕크", short: "COCK", icon: "🔧", accent: "#8b5cf6" },
  other: { label: "기타", short: "MISC", icon: "📦", accent: "#64748b" },
};

/** 상태 색상 — 마커/범례/패널 공통 */
export const STATUS_META: Record<
  DeviceStatus,
  { label: string; color: string }
> = {
  ok: { label: "정상", color: "#10b981" },
  warning: { label: "주의", color: "#f59e0b" },
  alert: { label: "경고", color: "#ef4444" },
  offline: { label: "미연결", color: "#9ca3af" },
};

export const DEVICE_CATEGORIES = Object.keys(CATEGORY_META) as DeviceCategory[];
