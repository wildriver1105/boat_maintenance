// Victron 설정 쓰기 — MQTT `W/<portal>/<path>` 로 값을 바꾼다.
//
// **화이트리스트 밖은 쓰지 않는다.** dbus 트리에는 수천 개의 경로가 있고 그중
// 상당수는 잘못 쓰면 배터리를 상하게 하거나 인버터를 멈춘다. 여기 적힌 것은
// (1) 이 배에서 실제로 존재함을 확인했고 (2) 뜻과 범위를 아는 것뿐이다.
//
// 범위도 함께 박아둔다. 화면을 우회해 API 를 직접 부르더라도 리튬 뱅크에
// 60V 같은 값이 들어가지 못하게 한다.

import { getVictronBroker, publishVictron } from "./mqtt";

export interface VictronSetting {
  key: string;
  /** dbus 경로 (포털 ID 제외) */
  path: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** 이 값이면 "제한 없음" */
  disabledValue?: number;
  hint?: string;
  /** 잘못 만지면 위험한 항목 — 화면에서 한 번 더 확인받는다 */
  caution?: string;
}

export const SETTINGS: VictronSetting[] = [
  {
    key: "maxChargeCurrent",
    path: "settings/0/Settings/SystemSetup/MaxChargeCurrent",
    label: "최대 충전 전류 (DVCC)",
    unit: "A",
    min: -1,
    max: 200,
    step: 1,
    disabledValue: -1,
    hint: "모든 충전원(솔라·육상·발전기)에 걸리는 상한. -1 이면 제한 없음",
  },
  {
    key: "maxChargeVoltage",
    path: "settings/0/Settings/SystemSetup/MaxChargeVoltage",
    label: "최대 충전 전압 (DVCC)",
    unit: "V",
    min: 0,
    max: 16,
    step: 0.1,
    disabledValue: 0,
    caution: "리튬 뱅크의 셀 전압을 넘기면 BMS 가 차단되거나 셀이 상한다",
    hint: "0 이면 제한 없음. 12V 리튬(LiFePO4)은 보통 14.2~14.6V",
  },
  {
    key: "minimumSocLimit",
    path: "settings/0/Settings/CGwacs/BatteryLife/MinimumSocLimit",
    label: "ESS 최소 SoC",
    unit: "%",
    min: 0,
    max: 100,
    step: 5,
    hint: "이 아래로는 배터리를 쓰지 않는다 (육상 전원이 있을 때)",
  },
  {
    key: "acInputCurrentLimit",
    path: "vebus/276/Ac/ActiveIn/CurrentLimit",
    label: "육상 전원 입력 제한",
    unit: "A",
    min: 3,
    max: 50,
    step: 1,
    hint: "부두 차단기 용량에 맞춘다 — 넘기면 차단기가 내려간다",
  },
];

/** 인버터/충전기 동작 모드 (vebus Mode) */
export const VEBUS_MODES: { value: number; label: string; caution?: string }[] = [
  { value: 3, label: "켜짐 (인버터 + 충전)" },
  { value: 1, label: "충전만" },
  { value: 2, label: "인버터만" },
  { value: 4, label: "꺼짐", caution: "AC 출력이 끊긴다 — 선내 220V 가 모두 죽는다" },
];
export const VEBUS_MODE_PATH = "vebus/276/Mode";

export function settingOf(key: string): VictronSetting | undefined {
  return SETTINGS.find((s) => s.key === key);
}

/** 범위 안으로 자른다 (화면을 우회한 호출도 막기 위해 서버에서 한 번 더) */
export function clampValue(s: VictronSetting, v: number): number {
  if (s.disabledValue !== undefined && v === s.disabledValue) return v;
  const stepped = Math.round(v / s.step) * s.step;
  return Math.min(s.max, Math.max(s.min, Math.round(stepped * 100) / 100));
}

export interface WriteResult {
  ok: boolean;
  error?: string;
}

/**
 * 값 쓰기. Venus 는 W/ 토픽을 받으면 적용 후 N/ 로 되돌려주므로, 성공 여부는
 * 곧이어 도착하는 읽기값으로 확인한다 (여기서는 발행까지만 책임진다).
 */
export function writeVictron(path: string, value: number): WriteResult {
  return publishVictron(path, value);
}

/** 현재 값 읽기 — 화면이 지금 설정을 보여줄 수 있게 */
export function readVictron(path: string): number | null {
  const v = getVictronBroker().values.get(path);
  return typeof v === "number" ? v : null;
}
