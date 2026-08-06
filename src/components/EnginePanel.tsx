// 엔진 패널 (Yanmar 4JH3-TE) — 모달.
// 이 배는 NMEA 2000 엔진 게이트웨이가 없어 RPM·유온 같은 실시간 계측이 없다.
// 그래서 "사양 + 운전시간 + 정비 주기" 를 관리한다. 값은 /api/engine.
"use client";

import { useCallback, useEffect, useState } from "react";
import type { EngineLive, EngineRecord, MaintenanceDue } from "@/lib/engine/types";
import { Meter, RadialGauge, SEVERITY, type Severity } from "./gauges/Gauges";

type Payload = EngineRecord & { due: MaintenanceDue[]; live: EngineLive };

/**
 * 정비 주기 소진율 — 0(방금 정비) → 1(주기 도달). 1 초과면 초과.
 * 시간·개월 두 기준 중 더 많이 소진된 쪽을 쓴다(먼저 도달하는 쪽이 기준이므로).
 */
function usedRatio(
  m: { intervalHours?: number | null; intervalMonths?: number | null },
  due: MaintenanceDue | undefined,
): number | null {
  if (!due) return null;
  const r: number[] = [];
  if (m.intervalHours && due.hoursLeft != null) r.push(1 - due.hoursLeft / m.intervalHours);
  if (m.intervalMonths && due.monthsLeft != null) r.push(1 - due.monthsLeft / m.intervalMonths);
  return r.length ? Math.max(...r) : null;
}

function dueSeverity(due: MaintenanceDue | undefined, ratio: number | null): Severity {
  if (!due || ratio == null) return "unknown";
  if (due.overdue) return "crit";
  if (due.soon) return "warn";
  return "ok";
}

/**
 * 데모용 가짜 계기값. 센서를 붙이기 전에 UI 를 눈으로 확인하려고 만든 것이며,
 * 실측(EngineLive)과 섞이지 않도록 완전히 분리해 둔다. 화면에도 "데모" 라고 명시한다.
 */
function demoLive(t: number): EngineLive {
  const wave = (period: number, phase = 0) => Math.sin((t / period) * Math.PI * 2 + phase);
  const rpm = Math.round(1850 + 420 * wave(9));
  return {
    rpm,
    coolantC: +(78 + 9 * wave(17, 1)).toFixed(1),
    oilBar: +(3.6 + 0.5 * wave(6, 2)).toFixed(2),
    fuelRatio: +(0.62 + 0.03 * wave(120)).toFixed(3),
    batteryV: +(13.9 + 0.15 * wave(11)).toFixed(2),
    batterySoc: 98,
    batteryTempC: +(33 + 2 * wave(40)).toFixed(1),
    sources: {
      rpm: "데모", coolantC: "데모", oilBar: "데모", fuelRatio: "데모", battery: "데모",
    },
  };
}

function Instrument({
  label, value, ratio, severity, source, sub,
}: {
  label: string;
  value: string | null;
  ratio: number | null;
  severity: Severity;
  source?: string | null;
  sub?: string;
}) {
  const s = SEVERITY[value == null ? "unknown" : severity];
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div
        className="mt-0.5 text-xl font-semibold"
        style={{ color: value == null ? "#94a3b8" : "#1e293b" }}
      >
        {value ?? "—"}
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: s.track }}>
        {ratio != null && (
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, background: s.fill }}
          />
        )}
      </div>
      <div className={`mt-1 text-[10px] ${value == null ? s.text : "text-slate-400"}`}>
        {value == null ? `${s.icon} 센서 미연결` : (sub ?? source ?? "")}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium tabular-nums text-slate-800">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

export default function EnginePanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hoursInput, setHoursInput] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [demo, setDemo] = useState(false);
  const [tick, setTick] = useState(0);

  // 데모 모드일 때만 값을 흔들어 계기가 움직이는 걸 보여준다
  useEffect(() => {
    if (!demo) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [demo]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/engine", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const saveHours = async () => {
    const h = Number(hoursInput);
    if (!Number.isFinite(h) || h < 0) return;
    await fetch("/api/engine", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours: h }),
    });
    setHoursInput("");
    await load();
  };

  const saveItem = async (id: string) => {
    const num = (k: string) => (form[k] === "" || form[k] == null ? null : Number(form[k]));
    await fetch("/api/engine", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: id,
        spec: form.spec?.trim() || null,
        intervalHours: num("intervalHours"),
        intervalMonths: num("intervalMonths"),
        lastHours: num("lastHours"),
        lastDate: form.lastDate?.trim() || null,
      }),
    });
    setEditing(null);
    await load();
  };

  const spec = data?.spec;
  const live = demo ? demoLive(tick) : data?.live;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-3xl rounded-2xl bg-white/90 shadow-2xl ring-1 ring-black/5 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              ⚙️ 엔진 · {spec ? `${spec.maker} ${spec.model}` : "…"}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              계기 · 운전시간 · 정비
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDemo((v) => !v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
                demo
                  ? "bg-violet-50 text-violet-700 ring-violet-300"
                  : "text-slate-500 ring-slate-200 hover:bg-slate-50"
              }`}
              title="센서 없이 계기 UI 를 확인하는 모드"
            >
              {demo ? "데모 켜짐" : "데모"}
            </button>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
          {err && <p className="py-8 text-center text-sm text-red-500">불러오기 실패: {err}</p>}
          {!data && !err && <p className="py-10 text-center text-sm text-slate-400">불러오는 중…</p>}

          {data && spec && live && (
            <>
              {/* ── 계기판 ── 타코미터 + 엔진 아워 */}
              <div className="flex flex-col items-center gap-4 rounded-xl bg-white/70 p-4 ring-1 ring-black/5 sm:flex-row">
                <RadialGauge
                  value={live.rpm}
                  max={spec.ratedRpm ?? 4000}
                  unit=""
                  label="RPM"
                  severity={
                    live.rpm == null
                      ? "unknown"
                      : spec.ratedRpm && live.rpm > spec.ratedRpm
                        ? "crit"
                        : spec.continuousRpm && live.rpm > spec.continuousRpm
                          ? "warn"
                          : "ok"
                  }
                  ticks={8}
                  redlineFrom={spec.continuousRpm ?? null}
                  sub={live.rpm == null ? "센서 미연결" : `연속정격 ${spec.continuousRpm} rpm`}
                />
                <div className="flex w-full flex-1 flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      운전시간
                    </div>
                    <div className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-800">
                      {data.hours != null ? `${data.hours.toLocaleString()} h` : "미입력"}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {data.hoursUpdated ? `${data.hoursUpdated} 기준` : "시간계를 읽어 입력하세요"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={hoursInput}
                      onChange={(e) => setHoursInput(e.target.value)}
                      placeholder="예: 1250"
                      className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                    />
                    <button
                      onClick={saveHours}
                      disabled={!hoursInput}
                      className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-40"
                    >
                      갱신
                    </button>
                  </div>
                </div>
              </div>

              {/* ── 계기 ── 연료·냉각수·유압·배터리 */}
              <Section title="계기">
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-white/70 p-4 ring-1 ring-black/5 sm:grid-cols-4">
                  <Instrument
                    label="연료"
                    value={live.fuelRatio == null ? null : `${Math.round(live.fuelRatio * 100)}%`}
                    ratio={live.fuelRatio}
                    severity={
                      live.fuelRatio == null
                        ? "unknown"
                        : live.fuelRatio < 0.1
                          ? "crit"
                          : live.fuelRatio < 0.25
                            ? "warn"
                            : "ok"
                    }
                    source={live.sources.fuelRatio}
                  />
                  <Instrument
                    label="냉각수 온도"
                    value={live.coolantC == null ? null : `${live.coolantC.toFixed(0)}°C`}
                    ratio={live.coolantC == null ? null : live.coolantC / 110}
                    severity={
                      live.coolantC == null
                        ? "unknown"
                        : live.coolantC > 95
                          ? "crit"
                          : live.coolantC > 88
                            ? "warn"
                            : "ok"
                    }
                    source={live.sources.coolantC}
                  />
                  <Instrument
                    label="유압"
                    value={live.oilBar == null ? null : `${live.oilBar.toFixed(1)} bar`}
                    ratio={live.oilBar == null ? null : live.oilBar / 6}
                    severity={
                      live.oilBar == null ? "unknown" : live.oilBar < 1.0 ? "crit" : "ok"
                    }
                    source={live.sources.oilBar}
                  />
                  <Instrument
                    label="시동 배터리"
                    value={live.batteryV == null ? null : `${live.batteryV.toFixed(2)} V`}
                    ratio={live.batteryV == null ? null : (live.batteryV - 11.6) / 3}
                    severity={
                      live.batteryV == null
                        ? "unknown"
                        : live.batteryV < 11.8
                          ? "crit"
                          : live.batteryV < 12.2
                            ? "warn"
                            : "ok"
                    }
                    source={live.sources.battery}
                    sub={
                      live.batterySoc != null
                        ? `SoC ${live.batterySoc.toFixed(0)}%${
                            live.batteryTempC != null ? ` · ${live.batteryTempC.toFixed(1)}°C` : ""
                          }`
                        : undefined
                    }
                  />
                </div>
                <p className={`mt-1 rounded-lg px-3 py-2 text-[11px] ${
                  demo
                    ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200"
                    : "px-1 text-slate-400"
                }`}>
                  {demo
                    ? "데모 모드 — 아래 값은 실제 계측이 아니라 UI 확인용 가짜 값입니다."
                    : "RPM·연료·냉각수·유압은 아직 센서가 연결되지 않았습니다. 센서가 붙으면 이 계기들이 그대로 살아납니다."}
                </p>
              </Section>

              {/* 정비 */}
              <Section title={`정비 항목 (${data.maintenance.length})`}>
                <div className="space-y-2">
                  {data.maintenance.map((m) => {
                    const due = data.due.find((d) => d.itemId === m.id);
                    const known = due && (due.hoursLeft != null || due.monthsLeft != null);
                    const ratio = usedRatio(m, due);
                    const sev = dueSeverity(due, ratio);
                    const label = !known
                      ? "주기 미입력"
                      : due!.overdue
                        ? "교체 시기 초과"
                        : [
                            due!.hoursLeft != null ? `${due!.hoursLeft} h 남음` : null,
                            due!.monthsLeft != null ? `${due!.monthsLeft} 개월 남음` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ");

                    return (
                      <div key={m.id} className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
                        <Meter
                          label={m.name}
                          valueText={label}
                          ratio={ratio}
                          severity={sev}
                          note={
                            ratio == null
                              ? "주기·최근 정비를 입력하면 소진율이 표시됩니다"
                              : `주기의 ${Math.round(Math.min(1, ratio) * 100)}% 소진`
                          }
                        />

                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>규격 {m.spec ?? "—"}</span>
                          <span>
                            주기{" "}
                            {m.intervalHours != null ? `${m.intervalHours}h` : "—"}
                            {m.intervalMonths != null ? ` / ${m.intervalMonths}개월` : ""}
                          </span>
                          <span>
                            최근 {m.lastHours != null ? `${m.lastHours}h` : "—"}
                            {m.lastDate ? ` (${m.lastDate})` : ""}
                          </span>
                          <button
                            onClick={() => {
                              setEditing(editing === m.id ? null : m.id);
                              setForm({
                                spec: m.spec ?? "",
                                intervalHours: m.intervalHours?.toString() ?? "",
                                intervalMonths: m.intervalMonths?.toString() ?? "",
                                lastHours: m.lastHours?.toString() ?? "",
                                lastDate: m.lastDate ?? "",
                              });
                            }}
                            className="text-sky-600 hover:underline"
                          >
                            {editing === m.id ? "닫기" : "편집"}
                          </button>
                        </div>

                        {m.notes && (
                          <p className="mt-1 text-[11px] text-slate-400">{m.notes}</p>
                        )}

                        {editing === m.id && (
                          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-5">
                            {[
                              ["spec", "규격", "text", "예: 15W-40"],
                              ["intervalHours", "주기(h)", "number", "250"],
                              ["intervalMonths", "주기(개월)", "number", "12"],
                              ["lastHours", "최근 정비(h)", "number", "1000"],
                              ["lastDate", "최근 날짜", "date", ""],
                            ].map(([k, lab, type, ph]) => (
                              <label key={k} className="text-[11px] text-slate-500">
                                {lab}
                                <input
                                  type={type}
                                  value={form[k] ?? ""}
                                  placeholder={ph}
                                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-sky-500"
                                />
                              </label>
                            ))}
                            <div className="col-span-2 sm:col-span-5">
                              <button
                                onClick={() => saveItem(m.id)}
                                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
                              >
                                저장
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>

              {/* 사양 */}
              <Section title="제원">
                <div className="rounded-xl bg-white/70 px-4 py-2 ring-1 ring-black/5">
                  <Row label="제조사 · 모델" value={`${spec.maker} ${spec.model}`} />
                  <Row
                    label="정격 출력"
                    value={spec.ratedHp ? `${spec.ratedHp} hp @ ${spec.ratedRpm} rpm` : "—"}
                  />
                  <Row
                    label="연속 정격"
                    value={
                      spec.continuousHp ? `${spec.continuousHp} hp @ ${spec.continuousRpm} rpm` : "—"
                    }
                  />
                  <Row
                    label="배기량 · 기통"
                    value={`${spec.displacementL ?? "—"} L · ${spec.cylinders ?? "—"}기통`}
                  />
                  <Row label="보어 × 스트로크" value={`${spec.boreMm} × ${spec.strokeMm} mm`} />
                  <Row label="흡기" value={spec.aspiration ?? "—"} />
                  <Row label="냉각" value={spec.cooling ?? "—"} />
                  <Row label="건조 중량" value={spec.weightKg ? `${spec.weightKg} kg` : "—"} />
                  <Row
                    label="연료 소비 (최대출력)"
                    value={spec.fuelLph ? `${spec.fuelLph} L/h` : "—"}
                  />
                </div>
                {spec.specSource && (
                  <p className="mt-1 px-1 text-[11px] text-slate-400">출처: {spec.specSource}</p>
                )}
              </Section>

              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 ring-1 ring-amber-200">
                정비 주기·오일 등급·용량은 <strong>지어내지 않았습니다</strong>. 엔진 매뉴얼(또는
                Yanmar 대리점) 값을 확인해 각 항목의 「편집」에서 입력하세요.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
