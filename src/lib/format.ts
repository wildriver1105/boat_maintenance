// 카테고리별 리딩값 → 사람이 읽는 요약/상세 문자열.
import type { Device, DeviceReading } from "@/lib/types";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 마커/리스트에 붙일 짧은 한 줄 요약 */
export function summarize(device: Device, r?: DeviceReading): string {
  // 그룹(시스템) 집계 리딩
  if (r?.sensorId?.startsWith("group:")) {
    const n = r.values["기기"], a = r.values["경고"], w = r.values["주의"];
    const tail = (a as number) > 0 ? ` · 경고 ${a}` : (w as number) > 0 ? ` · 주의 ${w}` : " · 정상";
    return `기기 ${n}개${tail}`;
  }
  if (!device.sensorId) return "센서 미연결";
  // sensorId 는 있지만 이를 만들어내는 소스가 없는 경우.
  // "대기 중"은 곧 값이 올 것처럼 읽히므로, 연결이 없다는 사실을 그대로 적는다.
  if (!r) return "미연결";
  const v = r.values;
  switch (device.category) {
    case "fuel":
    case "water":
    case "waste":
      return typeof v.level === "number" ? pct(v.level) : "—";
    case "engine":
      return v.running ? `${v.tempC}°C · ${v.rpm}rpm` : "정지";
    case "electrical":
      if (typeof v.voltage !== "number" && typeof v.soc !== "number") return "미수신";
      return `${typeof v.voltage === "number" ? `${v.voltage}V` : "—"} · ${
        typeof v.soc === "number" ? pct(v.soc) : "—"
      }`;
    case "bilge":
      return `${v.levelMm}mm${v.pumpOn ? " · 펌프ON" : ""}`;
    case "seacock":
      return v.open ? "열림" : "닫힘";
    case "charging":
      if (v.mode === undefined) return "미수신";
      return v.mode === "off" ? "정지" : `${v.mode} · ${v.outputW ?? 0}W`;
    case "navigation":
    case "comms":
      return v.online ? `온라인 · ${v.signal}%` : "오프라인";
    case "safety":
      return v.armed ? "정상" : "점검 필요";
    default:
      return typeof v.value === "number" ? String(v.value) : "—";
  }
}

/** 상세 패널용 (라벨, 값) 목록 */
export function detailRows(device: Device, r?: DeviceReading): [string, string][] {
  if (!r) return [];
  const v = r.values;
  const rows: [string, string][] = [];
  const cap = device.config?.capacityL as number | undefined;

  switch (device.category) {
    case "fuel":
    case "water":
    case "waste":
      if (typeof v.level === "number") {
        rows.push(["수위", pct(v.level)]);
        if (cap) rows.push(["잔량", `${Math.round(v.level * cap)} / ${cap} L`]);
      }
      break;
    case "engine":
      rows.push(["상태", v.running ? "가동" : "정지"]);
      if (v.running) {
        rows.push(["냉각수 온도", `${v.tempC} °C`]);
        rows.push(["회전수", `${v.rpm} rpm`]);
        rows.push(["유압", `${v.oilBar} bar`]);
      }
      break;
    case "electrical":
      if (typeof v.voltage === "number") rows.push(["전압", `${v.voltage} V`]);
      if (typeof v.soc === "number") rows.push(["충전량(SoC)", pct(v.soc)]);
      if (typeof v.currentA === "number") rows.push(["전류", `${v.currentA} A`]);
      // 실측(Victron) 리딩에만 있는 값
      if (typeof v.powerW === "number") rows.push(["전력", `${v.powerW} W`]);
      if (typeof v.tempC === "number") rows.push(["온도", `${v.tempC} °C`]);
      break;
    case "bilge":
      rows.push(["수위", `${v.levelMm} mm`]);
      rows.push(["펌프", v.pumpOn ? "가동" : "정지"]);
      if (v.alarmMm) rows.push(["경보 수위", `${v.alarmMm} mm`]);
      break;
    case "seacock":
      rows.push(["밸브", v.open ? "열림 (OPEN)" : "닫힘 (CLOSED)"]);
      break;
    case "charging":
      if (v.mode !== undefined) rows.push(["모드", v.mode === "off" ? "정지" : String(v.mode)]);
      if (typeof v.outputW === "number") rows.push(["출력", `${v.outputW} W`]);
      // 실측(Victron) 리딩에만 있는 값
      if (typeof v.voltage === "number") rows.push(["전압", `${v.voltage} V`]);
      if (typeof v.currentA === "number") rows.push(["전류", `${v.currentA} A`]);
      break;
    case "navigation":
    case "comms":
      rows.push(["연결", v.online ? "온라인" : "오프라인"]);
      if (typeof v.signal === "number") rows.push(["신호", `${v.signal} %`]);
      break;
    case "safety":
      rows.push(["상태", v.armed ? "정상(Armed)" : "점검 필요"]);
      break;
    default:
      Object.entries(v).forEach(([k, val]) => rows.push([k, String(val)]));
  }
  return rows;
}
