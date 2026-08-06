// 계기판 프리미티브 — 전기(Victron)·엔진 패널이 공유한다.
//
// 설계 규칙 (지키지 않으면 읽기 어려워짐):
//  - 한계값 대비 비율 하나 → Meter. 채움은 심각도색, 트랙은 같은 색 계열의 옅은 단계.
//  - 뷰를 대표하는 단일 수치 → RadialGauge(히어로). 한 화면에 하나만.
//  - 크기 비교 → Bars. 단일 색상(파랑) 농도로만 표현하고 무지개색을 쓰지 않는다.
//  - 상태는 색만으로 전달하지 않는다. 항상 아이콘+글자를 함께 둔다
//    (심각도색은 흰 배경 대비가 3:1 미만이라 색만 쓰면 안 보이는 사람이 있다).
//  - 큰 숫자는 비례숫자, 표의 숫자열만 tabular-nums.
"use client";

export type Severity = "ok" | "warn" | "crit" | "unknown";

/** 심각도 → 색 + 아이콘 + 글자 (색 단독 사용 금지) */
export const SEVERITY: Record<Severity, { fill: string; track: string; icon: string; label: string; text: string }> = {
  ok: { fill: "#10b981", track: "#d1fae5", icon: "✓", label: "정상", text: "text-emerald-700" },
  warn: { fill: "#f59e0b", track: "#fef3c7", icon: "▲", label: "주의", text: "text-amber-700" },
  crit: { fill: "#ef4444", track: "#fee2e2", icon: "■", label: "경고", text: "text-red-700" },
  unknown: { fill: "#94a3b8", track: "#e2e8f0", icon: "–", label: "알 수 없음", text: "text-slate-500" },
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/**
 * 반원 게이지 — 그 패널이 대표하는 단 하나의 수치에만 쓴다 (SoC 등).
 * value/max 비율을 240° 호로 그린다.
 */
export function RadialGauge({
  value,
  max = 100,
  unit = "%",
  label,
  severity = "ok",
  sub,
  size = 168,
}: {
  value: number | null;
  max?: number;
  unit?: string;
  label: string;
  severity?: Severity;
  sub?: string;
  size?: number;
}) {
  const s = SEVERITY[value == null ? "unknown" : severity];
  const ratio = value == null ? 0 : clamp01(value / max);

  // 240° 호 (좌하 -210° → 우하 30°)
  const R = 62;
  const C = size / 2;
  const SWEEP = 240;
  const START = 150; // deg, SVG 좌표계(시계방향)
  const pt = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    return [C + R * Math.cos(r), C + R * Math.sin(r)];
  };
  const arc = (frac: number) => {
    const end = START + SWEEP * frac;
    const [x0, y0] = pt(START);
    const [x1, y1] = pt(end);
    return `M ${x0} ${y0} A ${R} ${R} 0 ${SWEEP * frac > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.78}`} role="img"
        aria-label={`${label} ${value ?? "알 수 없음"}${unit}`}>
        {/* 트랙 — 같은 계열의 옅은 단계 */}
        <path d={arc(1)} fill="none" stroke={s.track} strokeWidth={12} strokeLinecap="round" />
        {value != null && (
          <path d={arc(ratio)} fill="none" stroke={s.fill} strokeWidth={12} strokeLinecap="round" />
        )}
        {/* 히어로 수치 — 비례숫자(tabular 아님) */}
        <text x={C} y={C + 4} textAnchor="middle" className="fill-slate-800"
          style={{ fontSize: 40, fontWeight: 600 }}>
          {value == null ? "—" : Math.round(value)}
          <tspan style={{ fontSize: 18, fontWeight: 500 }} className="fill-slate-400">{unit}</tspan>
        </text>
        <text x={C} y={C + 26} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 12 }}>
          {label}
        </text>
      </svg>
      {/* 상태는 아이콘+글자 (색 단독 금지) */}
      <div className={`-mt-1 text-xs font-medium ${s.text}`}>
        <span aria-hidden>{s.icon}</span> {sub ?? s.label}
      </div>
    </div>
  );
}

/**
 * 미터 — "한계값 대비 얼마" 하나를 보여준다 (정비 주기 소진율, 전압 범위 등).
 * 채움은 심각도색, 트랙은 같은 계열 옅은 단계. 데이터 끝은 4px 라운드.
 */
export function Meter({
  label,
  value,
  valueText,
  ratio,
  severity = "ok",
  note,
  marker,
}: {
  label: string;
  value?: string;
  valueText?: string;
  /** 0..1. null 이면 "알 수 없음" (0% 로 그리지 않는다) */
  ratio: number | null;
  severity?: Severity;
  note?: string;
  /** 기준선 표시 (0..1) — 예: 경보 임계 */
  marker?: number | null;
}) {
  const s = SEVERITY[ratio == null ? "unknown" : severity];
  const pct = ratio == null ? 0 : clamp01(ratio) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-medium tabular-nums text-slate-700">
          {valueText ?? value ?? (ratio == null ? "—" : `${Math.round(pct)}%`)}
        </span>
      </div>
      <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: s.track }}>
        {ratio != null && (
          <div className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%`, background: s.fill }} />
        )}
        {marker != null && (
          <div className="absolute top-0 h-full w-0.5 bg-slate-400/70"
            style={{ left: `${clamp01(marker) * 100}%` }} aria-hidden />
        )}
      </div>
      {(note || ratio == null) && (
        <p className={`mt-0.5 text-[11px] ${ratio == null ? s.text : "text-slate-400"}`}>
          {ratio == null ? `${s.icon} ${note ?? s.label}` : note}
        </p>
      )}
    </div>
  );
}

/**
 * 크기 비교 막대 — 여러 항목의 상대 크기(예: MPPT 4대 발전량).
 * 정체성이 아니라 크기가 주제이므로 단일 색상 농도만 쓴다(무지개 금지).
 */
export function Bars({
  items,
  unit = "W",
}: {
  items: { id: string; label: string; value: number | null; sub?: string }[];
  unit?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <div className="space-y-1.5">
      {items.map((i) => {
        const v = i.value ?? 0;
        const frac = clamp01(v / max);
        // 크기에 따라 같은 파랑의 농도만 변화 (순차 스케일)
        const shade = v === 0 ? "#e2e8f0" : `rgba(2,132,199,${0.35 + 0.65 * frac})`;
        return (
          <div key={i.id} className="flex items-center gap-2">
            <span className="w-32 shrink-0 truncate text-xs text-slate-500">{i.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${frac * 100}%`, background: shade }} />
            </div>
            <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">
              {i.value == null ? "—" : `${Math.round(v)} ${unit}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 전력 흐름 — 차트가 아니라 계통도. 발전원 → 배터리 → 부하 방향을 보여준다.
 * 유입은 녹색, 유출은 주황. 0 은 회색으로 죽인다.
 */
export function FlowRow({
  items,
}: {
  items: { id: string; label: string; watts: number | null; dir: "in" | "out" }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((i) => {
        const active = (i.watts ?? 0) !== 0;
        const color = !active ? "#94a3b8" : i.dir === "in" ? "#10b981" : "#f97316";
        return (
          <div key={i.id} className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
            <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <span aria-hidden style={{ color }}>{i.dir === "in" ? "▲" : "▼"}</span>
              {i.label}
            </div>
            <div className="mt-0.5 text-lg font-semibold" style={{ color: active ? color : "#94a3b8" }}>
              {i.watts == null
                ? "—"
                : Math.abs(i.watts) >= 1000
                  ? `${(Math.abs(i.watts) / 1000).toFixed(2)} kW`
                  : `${Math.round(Math.abs(i.watts))} W`}
            </div>
            <div className="text-[10px] text-slate-400">{i.dir === "in" ? "유입" : "유출"}</div>
          </div>
        );
      })}
    </div>
  );
}
