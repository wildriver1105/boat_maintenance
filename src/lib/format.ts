// 카테고리별 리딩값 → 사람이 읽는 요약/상세 문자열.
import type { Device, DeviceReading } from "@/lib/types";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Zigbee 플러그의 power_on_behavior 값 */
const POWER_ON_BEHAVIOR: Record<string, string> = {
  off: "꺼짐 유지",
  on: "켜짐",
  toggle: "반전",
  previous: "이전 상태 복원",
};

/** 마커/리스트에 붙일 짧은 한 줄 요약 */
export function summarize(device: Device, r?: DeviceReading): string {
  // 그룹(시스템) 집계 리딩
  if (r?.sensorId?.startsWith("group:")) {
    const n = r.values["기기"], a = r.values["경고"], w = r.values["주의"], off = r.values["미연결"];
    // 심각한 것부터 하나만 — 미연결까지 넣지 않으면 아이콘은 노란데 글자는
    // "정상"이라고 말하는 어긋난 상태가 된다
    const tail =
      (a as number) > 0
        ? ` · 경고 ${a}`
        : (w as number) > 0
          ? ` · 주의 ${w}`
          : (off as number) > 0
            ? ` · 미연결 ${off}`
            : " · 정상";
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
    case "comms": {
      // online/signal 은 목업 시절 형식이다. 실측 소스(SeaTalk 등)는 그 기기가
      // 실제로 보내는 값을 싣기 때문에 online 이 없고, 그걸 "오프라인"으로
      // 읽어버리면 **마커는 초록인데 글자는 오프라인**인 상태가 된다.
      if (typeof v.online === "boolean") return v.online ? `온라인 · ${v.signal}%` : "오프라인";
      if (r?.status === "offline") return "미연결";
      const parts: string[] = [];
      if (typeof v.headingDeg === "number") parts.push(`${v.headingDeg}°`);
      if (typeof v.sogKn === "number") parts.push(`${v.sogKn} kn`);
      if (typeof v.sats === "number") parts.push(`위성 ${v.sats}`);
      if (typeof v.windKn === "number") parts.push(`바람 ${v.windKn} kn`);
      if (typeof v.stwKn === "number") parts.push(`대수 ${v.stwKn} kn`);
      if (typeof v.waterC === "number") parts.push(`${v.waterC}°C`);
      return parts.length ? parts.join(" · ") : "수신 중";
    }
    case "safety":
      return v.armed ? "정상" : "점검 필요";
    case "lighting":
      if (typeof v.duty !== "number") return "미수신";
      return v.duty > 0 ? `밝기 ${v.duty}%` : "꺼짐";
    case "outlet": {
      if (typeof v.on !== "boolean") return "미수신";
      if (!v.on) return "꺼짐";
      // 켜져 있으면 지금 얼마나 쓰는지가 제일 궁금한 값이다
      return typeof v.watts === "number" ? `켜짐 · ${Math.round(v.watts)}W` : "켜짐";
    }
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
      if (typeof v.online === "boolean") {
        rows.push(["연결", v.online ? "온라인" : "오프라인"]);
        if (typeof v.signal === "number") rows.push(["신호", `${v.signal} %`]);
      } else {
        // 실측(SeaTalk 등) — 이 기기가 실제로 보내는 값을 그대로 보여준다
        rows.push(["연결", r.status === "offline" ? "미연결" : "수신 중"]);
        if (typeof v.headingDeg === "number") rows.push(["선수방위", `${v.headingDeg} °`]);
        if (typeof v.sogKn === "number") rows.push(["대지속력", `${v.sogKn} kn`]);
        if (typeof v.sats === "number") rows.push(["위성", `${v.sats} 개`]);
        if (typeof v.windKn === "number") rows.push(["풍속", `${v.windKn} kn`]);
        if (typeof v.stwKn === "number") rows.push(["대수속력", `${v.stwKn} kn`]);
        if (typeof v.waterC === "number") rows.push(["수온", `${v.waterC} °C`]);
        if (typeof v["메시지"] === "number") rows.push(["수신 메시지", `${v["메시지"]} 건`]);
      }
      break;
    case "safety":
      rows.push(["상태", v.armed ? "정상(Armed)" : "점검 필요"]);
      break;
    case "lighting":
      if (typeof v.duty === "number") {
        rows.push(["상태", v.duty > 0 ? "켜짐" : "꺼짐"]);
        rows.push(["밝기", `${v.duty}%`]);
      }
      break;
    case "outlet":
      if (typeof v.on === "boolean") rows.push(["상태", v.on ? "켜짐" : "꺼짐"]);
      if (typeof v.watts === "number") rows.push(["소비전력", `${v.watts} W`]);
      if (typeof v.volts === "number") rows.push(["전압", `${v.volts} V`]);
      if (typeof v.amps === "number") rows.push(["전류", `${v.amps} A`]);
      if (typeof v.powerFactor === "number") rows.push(["역률", String(v.powerFactor)]);
      if (typeof v.hz === "number") rows.push(["주파수", `${v.hz} Hz`]);
      if (typeof v.kwh === "number") rows.push(["누적 사용량", `${v.kwh} kWh`]);
      if (typeof v.powerOnBehavior === "string")
        rows.push(["정전 복구 시", POWER_ON_BEHAVIOR[v.powerOnBehavior] ?? v.powerOnBehavior]);
      if (typeof v.lqi === "number") rows.push(["Zigbee 링크", `${v.lqi} / 255`]);
      break;
    default:
      Object.entries(v).forEach(([k, val]) => rows.push([k, String(val)]));
  }
  return rows;
}
