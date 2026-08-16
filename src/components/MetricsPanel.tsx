// 계측 메트릭 패널 — 지금 값이 아니라 **추이**를 본다.
//
// 단위가 다른 값은 한 그래프에 겹치지 않고 그래프를 나눈다. 배터리 잔량과
// 전력을 한 축에 그리면 둘 다 못 읽는다.
"use client";

import { useCallback, useEffect, useState } from "react";
import TimeSeries, { type Point, type Series } from "./charts/TimeSeries";
import type { Device } from "@/lib/types";
import { zigbeeBindingOf } from "@/lib/zigbee/binding";

const RANGES = [
  { label: "1시간", hours: 1 },
  { label: "6시간", hours: 6 },
  { label: "24시간", hours: 24 },
  { label: "7일", hours: 168 },
];

const POLL_MS = 60_000;

export default function MetricsPanel({
  devices,
  onClose,
}: {
  devices: Device[];
  onClose: () => void;
}) {
  const [hours, setHours] = useState(24);
  const [points, setPoints] = useState<Point[]>([]);
  const [span, setSpan] = useState<{ from: number; to: number } | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // 콘센트는 도면에 등록된 Zigbee 장비에서 가져온다 (최대 4개 — 팔레트 상한)
  const plugs = devices.filter((d) => zigbeeBindingOf(d) && d.enabled !== false).slice(0, 4);

  const keys = [
    "sys.soc",
    "sys.voltage",
    "sys.power",
    "sys.pvPower",
    "sys.acLoadPower",
    "sys.dcLoadPower",
    "sys.acInputPower",
    ...plugs.map((d) => `dev.${d.id}.watts`),
  ];

  const load = useCallback(async () => {
    const res = await fetch(`/api/history?hours=${hours}&keys=${encodeURIComponent(keys.join(","))}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const d = (await res.json()) as { points: Point[]; sampleCount: number; from: number; to: number };
      setPoints(d.points);
      setSampleCount(d.sampleCount);
      setSpan({ from: d.from, to: d.to });
    }
    setLoading(false);
    // keys 는 devices 에서 파생 — devices 가 바뀌지 않으면 동일하다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, devices]);

  useEffect(() => {
    setLoading(true);
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const plugSeries: Series[] = plugs.map((d) => ({ key: `dev.${d.id}.watts`, label: d.name }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-6 w-full max-w-3xl rounded-2xl bg-white/95 p-5 shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">📈 계측 추이</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              1분 간격 기록 · 14일 보관 · 이 구간 표본 {sampleCount.toLocaleString()}개
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 기간 선택 — 필터는 그래프 위 한 줄에 */}
        <div className="mt-3 flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.hours}
              onClick={() => setHours(r.hours)}
              className={`rounded-lg px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                hours === r.hours
                  ? "bg-sky-600 text-white ring-sky-600"
                  : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="mt-6 text-center text-sm text-slate-400">불러오는 중…</p>
        ) : (
          <div className="mt-4 space-y-5">
            <Chart title="배터리 잔량 (SoC)" sub="하우스 뱅크 · Lynx Shunt">
              <TimeSeries from={span?.from} to={span?.to} points={points} unit="%" series={[{ key: "sys.soc", label: "SoC" }]} />
            </Chart>

            <Chart title="전력 흐름" sub="발전과 소비 — 같은 단위(W)라 한 축에 겹쳐 본다">
              <TimeSeries
                from={span?.from}
                to={span?.to}
                points={points}
                unit="W"
                zeroBased
                series={[
                  { key: "sys.pvPower", label: "솔라 발전" },
                  { key: "sys.acLoadPower", label: "AC 부하" },
                  { key: "sys.dcLoadPower", label: "DC 부하" },
                  { key: "sys.acInputPower", label: "육상 전원" },
                ]}
              />
            </Chart>

            <Chart title="배터리 전압" sub="하우스 뱅크">
              <TimeSeries
                from={span?.from}
                to={span?.to}
                points={points}
                unit="V"
                series={[{ key: "sys.voltage", label: "전압" }]}
                fmt={(n) => n.toFixed(2)}
              />
            </Chart>

            <Chart title="배터리 순전력" sub="+ 충전 / − 방전">
              <TimeSeries from={span?.from} to={span?.to} points={points} unit="W" series={[{ key: "sys.power", label: "순전력" }]} />
            </Chart>

            {plugSeries.length > 0 && (
              <Chart title="콘센트별 소비" sub="스마트플러그 — Victron 은 AC 총합만 본다">
                <TimeSeries from={span?.from} to={span?.to} points={points} unit="W" zeroBased series={plugSeries} />
              </Chart>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Chart({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {sub && <p className="mb-1 text-[11px] text-slate-400">{sub}</p>}
      {children}
    </section>
  );
}
