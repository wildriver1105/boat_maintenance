// 엔진 패널 (Yanmar 4JH3-TE) — 모달.
// 이 배는 NMEA 2000 엔진 게이트웨이가 없어 RPM·유온 같은 실시간 계측이 없다.
// 그래서 "사양 + 운전시간 + 정비 주기" 를 관리한다. 값은 /api/engine.
"use client";

import { useCallback, useEffect, useState } from "react";
import type { EngineRecord, MaintenanceDue } from "@/lib/engine/types";
import { Meter, RadialGauge, type Severity } from "./gauges/Gauges";

type Payload = EngineRecord & { due: MaintenanceDue[] };

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
              사양 · 운전시간 · 정비 주기 (실시간 계측 없음 — NMEA 2000 엔진 게이트웨이 미설치)
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
          {err && <p className="py-8 text-center text-sm text-red-500">불러오기 실패: {err}</p>}
          {!data && !err && <p className="py-10 text-center text-sm text-slate-400">불러오는 중…</p>}

          {data && spec && (
            <>
              {/* 운전시간 + 정비 상태 요약 */}
              <div className="flex flex-col items-center gap-4 rounded-xl bg-white/70 p-4 ring-1 ring-black/5 sm:flex-row">
                <RadialGauge
                  value={(() => {
                    const known = data.due.filter((d) => d.hoursLeft != null || d.monthsLeft != null);
                    // 주기가 입력된 항목 중 정상 비율. 하나도 없으면 알 수 없음.
                    return known.length === 0 ? null : (known.filter((d) => !d.overdue).length / known.length) * 100;
                  })()}
                  label="정비 준수율"
                  severity={(() => {
                    const known = data.due.filter((d) => d.hoursLeft != null || d.monthsLeft != null);
                    if (known.length === 0) return "unknown";
                    if (known.some((d) => d.overdue)) return "crit";
                    if (known.some((d) => d.soon)) return "warn";
                    return "ok";
                  })()}
                  sub={(() => {
                    const known = data.due.filter((d) => d.hoursLeft != null || d.monthsLeft != null);
                    if (known.length === 0) return `주기 미입력 ${data.maintenance.length}건`;
                    const over = known.filter((d) => d.overdue).length;
                    const soon = known.filter((d) => d.soon).length;
                    return over ? `초과 ${over}건` : soon ? `임박 ${soon}건` : `${known.length}건 정상`;
                  })()}
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
