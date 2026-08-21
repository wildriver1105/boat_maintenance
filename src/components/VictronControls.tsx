// Victron 충전 설정 제어 — 전기 패널 안의 한 구획.
//
// 읽기 전용이던 화면에서 유일하게 **쓰기**를 하는 곳이라, 세 가지를 지킨다.
//  1. 화이트리스트 밖은 아예 못 보낸다 (서버에서도 한 번 더 막는다)
//  2. 위험한 항목은 누르기 전에 무엇이 벌어지는지 글로 알린다
//  3. 보낸 뒤에는 Venus 가 되돌려준 값으로 확인한다 — 보냈다고 성공이 아니다
"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_MS = 4000;

type Setting = {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  disabledValue?: number;
  hint?: string;
  caution?: string;
  value: number | null;
};

type Goal = {
  enabled: boolean;
  targetSoc: number;
  resumeBelow: number;
  holding: boolean;
};

type Data = {
  connected: boolean;
  settings: Setting[];
  modes: { value: number; label: string; caution?: string }[];
  mode: number | null;
  soc: number | null;
  goal: Goal;
};

export default function VictronControls() {
  const [d, setD] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/victron/control", { cache: "no-store" });
    if (r.ok) setD(await r.json());
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const put = async (body: Record<string, unknown>, tag: string) => {
    setBusy(tag);
    setErr(null);
    try {
      const r = await fetch("/api/victron/control", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!d) return <p className="text-xs text-slate-400">설정을 불러오는 중…</p>;

  if (!d.connected)
    return (
      <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
        Victron 에 연결되어 있지 않아 설정을 바꿀 수 없습니다.
      </p>
    );

  const g = d.goal;

  return (
    <div className="space-y-3">
      {/* 목표 SoC — Victron 기능이 아니라 이 앱이 만드는 동작이라 따로 떼어 설명한다 */}
      <div className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={g.enabled}
            onChange={(e) => void put({ goal: { enabled: e.target.checked } }, "goal")}
            className="mt-0.5 h-4 w-4 accent-sky-600"
          />
          <span className="text-[11px] leading-snug text-slate-500">
            <span className="text-sm font-medium text-slate-700">목표 SoC 까지만 충전</span>
            <br />
            Victron 에는 없는 기능입니다. 이 앱이 SoC 를 보고 <b>DVCC 최대 충전 전류</b>를
            0 으로 내렸다 되돌리는 방식으로 만듭니다.
          </span>
        </label>

        {g.enabled && (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <NumField
                label="목표"
                unit="%"
                value={g.targetSoc}
                min={20}
                max={100}
                step={5}
                onCommit={(v) => void put({ goal: { targetSoc: v } }, "goal")}
              />
              <NumField
                label="재개 기준"
                unit="%"
                value={g.resumeBelow}
                min={10}
                max={98}
                step={5}
                onCommit={(v) => void put({ goal: { resumeBelow: v } }, "goal")}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              현재 {d.soc != null ? `${Math.round(d.soc)}%` : "—"} ·{" "}
              {g.holding ? (
                <span className="font-medium text-amber-700">목표 도달 — 충전 멈춤</span>
              ) : (
                "충전 허용"
              )}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              이 앱이 꺼져 있는 동안에는 동작하지 않습니다. 끄면 원래 상한으로 되돌립니다.
            </p>
          </>
        )}
      </div>

      {/* Victron 자체 설정 */}
      {d.settings.map((s) => {
        const shown = draft[s.key] ?? s.value ?? s.min;
        const off = s.disabledValue !== undefined && s.value === s.disabledValue;
        return (
          <div key={s.key} className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">{s.label}</span>
              <span className="text-xs tabular-nums text-slate-500">
                {s.value == null ? "—" : off ? "제한 없음" : `${s.value} ${s.unit}`}
              </span>
            </div>
            {s.hint && <p className="mt-0.5 text-[11px] text-slate-400">{s.hint}</p>}
            {s.caution && (
              <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                ▲ {s.caution}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                value={shown}
                min={s.min}
                max={s.max}
                step={s.step}
                onChange={(e) => setDraft((x) => ({ ...x, [s.key]: Number(e.target.value) }))}
                className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-800 outline-none focus:border-sky-500"
              />
              <span className="text-[11px] text-slate-400">{s.unit}</span>
              <button
                onClick={() => void put({ key: s.key, value: shown }, s.key)}
                disabled={busy === s.key || shown === s.value}
                className="ml-auto rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-40"
              >
                {busy === s.key ? "적용 중…" : "적용"}
              </button>
              {s.disabledValue !== undefined && (
                <button
                  onClick={() => void put({ key: s.key, value: s.disabledValue as number }, s.key)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
                >
                  제한 해제
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* 인버터/충전기 모드 */}
      <div className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
        <span className="text-sm font-medium text-slate-700">인버터 / 충전기 모드</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.modes.map((m) => (
            <button
              key={m.value}
              onClick={() => {
                if (m.caution && !confirm(`${m.label}\n\n${m.caution}\n\n계속할까요?`)) return;
                void put({ mode: m.value }, `mode${m.value}`);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ${
                d.mode === m.value
                  ? "bg-sky-600 text-white ring-sky-600"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

function NumField({
  label,
  unit,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <label className="block">
      <span className="text-[11px] text-slate-500">{label}</span>
      <div className="mt-0.5 flex items-center gap-1">
        <input
          type="number"
          value={v}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => Number(v) !== value && onCommit(Number(v))}
          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-800 outline-none focus:border-sky-500"
        />
        <span className="text-[11px] text-slate-400">{unit}</span>
      </div>
    </label>
  );
}
