// 프로시저 모드 — 항해 전/중/후 체크리스트 수행 + 감사 기록(누가·언제 체크).
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  PHASE_META,
  PHASE_ORDER,
  type ChecklistItem,
  type ProcedurePhase,
  type ProcedureRun,
  type ProcedureTemplate,
} from "@/lib/procedures/types";
import type { Device, DeviceReading } from "@/lib/types";
import DeviceChip from "./DeviceChip";

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProceduresView() {
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<ProcedureTemplate[]>([]);
  const [runs, setRuns] = useState<ProcedureRun[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Record<string, DeviceReading>>({});
  const [phase, setPhase] = useState<ProcedurePhase>("pre");
  const [busy, setBusy] = useState(false);

  const loadRuns = useCallback(async () => {
    const r = await fetch("/api/procedures/runs");
    if (r.ok) setRuns(await r.json());
  }, []);

  useEffect(() => {
    fetch("/api/procedures").then((r) => r.json()).then(setTemplates);
    fetch("/api/devices").then((r) => r.json()).then(setDevices);
    void loadRuns();
  }, [loadRuns]);

  // 연결 장비 실시간 상태
  useEffect(() => {
    const es = new EventSource("/api/telemetry");
    es.addEventListener("telemetry", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { readings: DeviceReading[] };
      setReadings((prev) => {
        const next = { ...prev };
        for (const r of data.readings) next[r.sensorId] = r;
        return next;
      });
    });
    return () => es.close();
  }, []);

  const template = templates.find((t) => t.phase === phase);
  const activeRun = runs.find((r) => r.phase === phase && !r.completedAt) ?? null;
  const history = runs.filter((r) => r.phase === phase && r.completedAt);
  const deviceById = useMemo(
    () => Object.fromEntries(devices.map((d) => [d.id, d])),
    [devices],
  );

  const start = async () => {
    setBusy(true);
    await fetch("/api/procedures/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    });
    await loadRuns();
    setBusy(false);
  };

  const patch = async (runId: string, body: Record<string, unknown>) => {
    await fetch(`/api/procedures/runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await loadRuns();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">✅ 프로시저 · 체크리스트</h1>
            <p className="text-xs text-slate-400">항해 전·중·후 절차 · 체크 기록은 자동 저장됩니다</p>
          </div>
          <div className="flex items-center gap-3">
            {session?.user && (
              <span className="text-sm text-slate-500">
                {session.user.name}
                <span className="ml-1 text-xs text-slate-400">
                  ({session.user.role === "admin" ? "관리자" : "크루"})
                </span>
              </span>
            )}
            <Link href="/" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              도면으로
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {/* 단계 탭 */}
        <div className="flex gap-2">
          {PHASE_ORDER.map((p) => {
            const m = PHASE_META[p];
            const on = phase === p;
            const active = runs.some((r) => r.phase === p && !r.completedAt);
            return (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                  on
                    ? "border-transparent text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
                style={on ? { background: m.color } : undefined}
              >
                <span className="text-base">{m.icon}</span>
                {m.label}
                {active && (
                  <span className={`h-2 w-2 rounded-full ${on ? "bg-white" : "bg-emerald-500"}`} />
                )}
              </button>
            );
          })}
        </div>

        {/* 본문 */}
        <div className="mt-5">
          {activeRun ? (
            <RunCard
              run={activeRun}
              template={template}
              deviceById={deviceById}
              readings={readings}
              onCheck={(itemId, checked) => patch(activeRun.id, { action: "check", itemId, checked })}
              onNote={(itemId, note) => patch(activeRun.id, { action: "note", itemId, note })}
              onComplete={() => patch(activeRun.id, { action: "complete" })}
            />
          ) : (
            <StartCard template={template} phase={phase} busy={busy} onStart={start} />
          )}
        </div>

        {/* 기록 */}
        {history.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">
              지난 기록 · {PHASE_META[phase].label}
            </h2>
            <div className="space-y-2">
              {history.map((r) => (
                <HistoryRow key={r.id} run={r} template={template} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ---------- 시작 카드 ---------- */
function StartCard({
  template,
  phase,
  busy,
  onStart,
}: {
  template?: ProcedureTemplate;
  phase: ProcedurePhase;
  busy: boolean;
  onStart: () => void;
}) {
  const m = PHASE_META[phase];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <div className="text-3xl">{m.icon}</div>
      <h2 className="mt-2 text-base font-semibold text-slate-800">{template?.title ?? m.label}</h2>
      <p className="mt-1 text-sm text-slate-500">
        점검 항목 {template?.items.length ?? 0}개 · 진행 중인 점검이 없습니다.
      </p>
      <button
        onClick={onStart}
        disabled={busy}
        className="mt-4 rounded-xl px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: m.color }}
      >
        {busy ? "시작 중…" : "새 점검 시작"}
      </button>
    </div>
  );
}

/* ---------- 진행 중 체크리스트 ---------- */
function RunCard({
  run,
  template,
  deviceById,
  readings,
  onCheck,
  onNote,
  onComplete,
}: {
  run: ProcedureRun;
  template?: ProcedureTemplate;
  deviceById: Record<string, Device>;
  readings: Record<string, DeviceReading>;
  onCheck: (itemId: string, checked: boolean) => void;
  onNote: (itemId: string, note: string) => void;
  onComplete: () => void;
}) {
  const items = template?.items ?? [];
  const checkOf = (id: string) => run.checks.find((c) => c.itemId === id);
  const required = items.filter((i) => i.required);
  const doneRequired = required.filter((i) => checkOf(i.id)).length;
  const doneAll = items.filter((i) => checkOf(i.id)).length;
  const allRequiredDone = doneRequired === required.length;
  const m = PHASE_META[run.phase];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">{run.title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {run.startedByName} 시작 · {fmt(run.startedAt)}
          </p>
        </div>
        <span className="text-sm font-medium" style={{ color: m.color }}>
          {doneAll}/{items.length}
        </span>
      </div>

      {/* 진행 바 */}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${items.length ? (doneAll / items.length) * 100 : 0}%`, background: m.color }}
        />
      </div>

      <ul className="mt-4 divide-y divide-slate-100">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            check={checkOf(item.id)}
            device={item.deviceId ? deviceById[item.deviceId] : undefined}
            reading={
              item.deviceId && deviceById[item.deviceId]?.sensorId
                ? readings[deviceById[item.deviceId].sensorId!]
                : undefined
            }
            onToggle={(checked) => onCheck(item.id, checked)}
            onNote={(note) => onNote(item.id, note)}
          />
        ))}
      </ul>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {allRequiredDone
            ? "필수 항목 완료 — 점검을 마칠 수 있습니다."
            : `필수 ${required.length - doneRequired}개 남음`}
        </span>
        <button
          onClick={onComplete}
          disabled={!allRequiredDone}
          className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          점검 완료
        </button>
      </div>
    </div>
  );
}

/* ---------- 항목 행 ---------- */
function ItemRow({
  item,
  check,
  device,
  reading,
  onToggle,
  onNote,
}: {
  item: ChecklistItem;
  check?: { checkedByName: string; checkedAt: string; note?: string };
  device?: Device;
  reading?: DeviceReading;
  onToggle: (checked: boolean) => void;
  onNote: (note: string) => void;
}) {
  const checked = !!check;
  const [note, setNote] = useState(check?.note ?? "");
  useEffect(() => setNote(check?.note ?? ""), [check?.note]);

  return (
    <li className="flex gap-3 py-3">
      <button
        onClick={() => onToggle(!checked)}
        aria-label={checked ? "체크 해제" : "체크"}
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm transition-colors ${
          checked
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-slate-300 text-transparent hover:border-slate-400"
        }`}
      >
        ✓
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium ${checked ? "text-slate-400 line-through" : "text-slate-800"}`}>
            {item.label}
          </span>
          {item.required && <span className="text-[10px] font-semibold text-rose-500">필수</span>}
          <DeviceChip device={device} reading={reading} />
        </div>
        {item.detail && <p className="mt-0.5 text-xs text-slate-400">{item.detail}</p>}

        {checked && check && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              ✓ {check.checkedByName} · {fmt(check.checkedAt)}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (check.note ?? "") && onNote(note)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="메모 추가…"
              className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-sky-400"
            />
          </div>
        )}
      </div>
    </li>
  );
}

/* ---------- 지난 기록 행 ---------- */
function HistoryRow({ run, template }: { run: ProcedureRun; template?: ProcedureTemplate }) {
  const [open, setOpen] = useState(false);
  const items = template?.items ?? [];
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <div className="text-sm font-medium text-slate-700">
            {run.completedAt ? fmt(run.completedAt) : fmt(run.startedAt)} 완료
          </div>
          <div className="text-xs text-slate-400">
            {run.startedByName} 시작 · 체크 {run.checks.length}개
          </div>
        </div>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="border-t border-slate-100 px-4 py-2 text-sm">
          {items.map((item) => {
            const c = run.checks.find((x) => x.itemId === item.id);
            return (
              <li key={item.id} className="flex items-start justify-between gap-3 py-1.5">
                <span className={c ? "text-slate-700" : "text-slate-300"}>
                  {c ? "✓" : "○"} {item.label}
                  {c?.note && <span className="ml-1 text-xs text-slate-400">— {c.note}</span>}
                </span>
                {c && (
                  <span className="shrink-0 text-xs text-slate-400">
                    {c.checkedByName} · {fmt(c.checkedAt)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
