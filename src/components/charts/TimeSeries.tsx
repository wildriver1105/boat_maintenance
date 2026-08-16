// 시계열 선그래프 — 계측 이력 전용.
//
// 규칙 (지키지 않으면 읽기 어려워지거나 오해를 부른다):
//  - 축은 하나. 단위가 다른 값을 한 그래프에 겹치지 않는다 (전압과 전력을 같이
//    그리면 둘 다 못 읽는다). 단위가 다르면 그래프를 나눈다.
//  - 결측은 선을 끊는다. 이어 버리면 센서가 죽어 있던 구간이 정상으로 보인다.
//  - 값은 모든 점에 적지 않는다. 마지막 점에만 직접 라벨을 달고 나머지는
//    호버 툴팁이 맡는다.
//  - 색만으로 계열을 구분하지 않는다 — 계열이 2개 이상이면 범례가 항상 있고,
//    마지막 점에 이름을 직접 붙인다.
"use client";

import { useMemo, useRef, useState } from "react";

/** 검증된 카테고리 팔레트(light) — 순서 고정, 순환하지 않는다 */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

export interface Series {
  key: string;
  label: string;
  /** 없으면 순서대로 팔레트에서 가져온다 */
  color?: string;
}

export interface Point {
  t: number;
  v: Record<string, number>;
}

type Props = {
  points: Point[];
  series: Series[];
  unit: string;
  /** y 축을 0 부터 그릴지 (전력은 0 기준, 전압·SoC 는 데이터 범위) */
  zeroBased?: boolean;
  /** 시간축 구간 — 요청한 범위. 없으면 데이터 범위로 대체한다 */
  from?: number;
  to?: number;
  height?: number;
  /** 값 포맷 (기본: 소수 1자리까지) */
  fmt?: (n: number) => string;
};

const PAD = { top: 12, right: 66, bottom: 22, left: 44 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const timeLabel = (t: number) =>
  new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

export default function TimeSeries({
  points,
  series,
  unit,
  zeroBased = false,
  from,
  to,
  height = 200,
  fmt = (n) => (Math.abs(n) >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10)),
}: Props) {
  const W = 720;
  const H = height;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const colored = series.map((s, i) => ({ ...s, color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }));

  const { xOf, yOf, ticks, t0, t1, hasData } = useMemo(() => {
    const vals: number[] = [];
    for (const p of points) for (const s of series) if (typeof p.v[s.key] === "number") vals.push(p.v[s.key]);
    // 요청 구간을 우선 — 표본이 한 개여도 축이 무너지지 않고, 데이터가 구간의
    // 일부만 덮으면 그 사실이 그대로 보인다
    const t0 = from ?? (points.length ? points[0].t : 0);
    const t1 = to ?? (points.length ? points[points.length - 1].t : t0 + 1);
    let lo = vals.length ? Math.min(...vals) : 0;
    let hi = vals.length ? Math.max(...vals) : 1;
    if (zeroBased) lo = Math.min(0, lo);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    return {
      hasData: vals.length > 0,
      t0,
      t1,
      ticks: niceTicks(lo, hi),
      xOf: (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right),
      yOf: (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom),
    };
  }, [points, series, zeroBased, H, from, to]);

  /** 결측에서 끊긴 선분들 */
  const paths = colored.map((s) => {
    const segs: string[] = [];
    let cur: string[] = [];
    for (const p of points) {
      const v = p.v[s.key];
      if (typeof v !== "number") {
        if (cur.length > 1) segs.push(cur.join(" "));
        cur = [];
        continue;
      }
      cur.push(`${cur.length ? "L" : "M"}${xOf(p.t).toFixed(1)},${yOf(v).toFixed(1)}`);
    }
    if (cur.length > 1) segs.push(cur.join(" "));
    // 점 하나짜리 구간은 선이 안 보이므로 마커로 남긴다
    const lone = points
      .map((p) => p.v[s.key])
      .map((v, i) => (typeof v === "number" ? i : -1))
      .filter((i) => i >= 0);
    const last = lone.length ? points[lone[lone.length - 1]] : null;
    return { ...s, d: segs.join(" "), last, lastVal: last ? last.v[s.key] : null };
  });

  // 마지막 값 라벨은 값이 비슷하면 겹친다 — 위에서부터 최소 간격을 확보해 밀어낸다
  const labelY = (() => {
    const items = paths
      .filter((s) => s.last && typeof s.lastVal === "number")
      .map((s) => ({ key: s.key, y: yOf(s.lastVal as number) }))
      .sort((a, b) => a.y - b.y);
    const out: Record<string, number> = {};
    let prev = -Infinity;
    for (const it of items) {
      const y = Math.max(it.y, prev + 12);
      out[it.key] = y;
      prev = y;
    }
    return out;
  })();

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const t = t0 + ((x - PAD.left) / (W - PAD.left - PAD.right)) * (t1 - t0);
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.t - t);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHoverIdx(best);
  };

  if (!hasData) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">
        아직 기록된 값이 없습니다 — 수집은 1분 간격입니다.
      </div>
    );
  }

  const hp = hoverIdx != null ? points[hoverIdx] : null;

  return (
    <div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          onPointerMove={onMove}
          onPointerLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={`${colored.map((s) => s.label).join(", ")} 시간 추이`}
        >
          {/* 격자 — 실선 헤어라인, 뒤로 물러나 있게 */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} y1={yOf(v)} x2={W - PAD.right} y2={yOf(v)} stroke="#eef2f7" strokeWidth={1} />
              <text x={PAD.left - 6} y={yOf(v) + 4} textAnchor="end" fontSize={11} fill="#94a3b8" className="tabular-nums">
                {fmt(v)}
              </text>
            </g>
          ))}
          {/* 시간축 — 양 끝과 가운데만 */}
          {[t0, (t0 + t1) / 2, t1].map((t, i) => (
            <text
              key={i}
              x={xOf(t)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
              fontSize={11}
              fill="#94a3b8"
            >
              {timeLabel(t)}
            </text>
          ))}

          {/* 호버 십자선 */}
          {hp && (
            <line x1={xOf(hp.t)} y1={PAD.top} x2={xOf(hp.t)} y2={H - PAD.bottom} stroke="#cbd5e1" strokeWidth={1} />
          )}

          {paths.map((s) => (
            <g key={s.key}>
              <path d={s.d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {/* 마지막 점 + 직접 라벨 — 색 대비가 낮은 계열도 글자로 읽히게 */}
              {s.last && typeof s.lastVal === "number" && (
                <>
                  <circle cx={xOf(s.last.t)} cy={yOf(s.lastVal)} r={4} fill={s.color} stroke="#ffffff" strokeWidth={2} />
                  <text x={xOf(s.last.t) + 8} y={(labelY[s.key] ?? yOf(s.lastVal)) + 4} fontSize={11} fill="#475569" className="tabular-nums">
                    {fmt(s.lastVal)}
                  </text>
                </>
              )}
              {/* 호버 지점 마커 */}
              {hp && typeof hp.v[s.key] === "number" && (
                <circle cx={xOf(hp.t)} cy={yOf(hp.v[s.key])} r={4.5} fill={s.color} stroke="#ffffff" strokeWidth={2} />
              )}
            </g>
          ))}
        </svg>

        {/* 툴팁 — 그래프 위에 겹치지 않게 상단 고정 */}
        {hp && (
          <div className="pointer-events-none absolute right-2 top-1 rounded-lg bg-white/95 px-2 py-1.5 text-[11px] shadow ring-1 ring-black/5">
            <div className="text-slate-400">{timeLabel(hp.t)}</div>
            {colored.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="text-slate-500">{s.label}</span>
                <span className="ml-auto font-medium tabular-nums text-slate-700">
                  {typeof hp.v[s.key] === "number" ? `${fmt(hp.v[s.key])} ${unit}` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 범례 — 계열이 2개 이상이면 항상 (색 하나만으로 구분하지 않는다) */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {colored.length > 1 &&
          colored.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        <button
          onClick={() => setShowTable((v) => !v)}
          className="ml-auto text-[11px] text-slate-400 hover:text-slate-600"
        >
          {showTable ? "표 닫기" : "표로 보기"}
        </button>
      </div>

      {showTable && (
        <div className="mt-2 max-h-48 overflow-auto rounded-lg ring-1 ring-slate-100">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-1 text-left font-medium">시각</th>
                {colored.map((s) => (
                  <th key={s.key} className="px-2 py-1 text-right font-medium">
                    {s.label} ({unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.t} className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-500">{timeLabel(p.t)}</td>
                  {colored.map((s) => (
                    <td key={s.key} className="px-2 py-1 text-right tabular-nums text-slate-700">
                      {typeof p.v[s.key] === "number" ? fmt(p.v[s.key]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
