// 프로시저 모드 — 임의 개수의 체크리스트 수행 + 감사 기록(누가·언제 체크/완료).
// 관리자는 "관리" 모드에서 체크리스트/항목을 CRUD 할 수 있다.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type {
  CheckRecord,
  CheckStatus,
  ChecklistItem,
  ProcedureRun,
  ProcedureTemplate,
} from "@/lib/procedures/types";
import type { Device, DeviceReading } from "@/lib/types";
import DeviceChip from "./DeviceChip";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProceduresView() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [templates, setTemplates] = useState<ProcedureTemplate[]>([]);
  const [runs, setRuns] = useState<ProcedureRun[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Record<string, DeviceReading>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manage, setManage] = useState(false);

  const loadTemplates = useCallback(async () => {
    const t = (await (await fetch("/api/procedures")).json()) as ProcedureTemplate[];
    setTemplates(t);
    setSelectedId((cur) => cur ?? t[0]?.id ?? null);
    return t;
  }, []);
  const loadRuns = useCallback(async () => {
    const r = await fetch("/api/procedures/runs");
    if (r.ok) setRuns(await r.json());
  }, []);

  useEffect(() => {
    void loadTemplates();
    void loadRuns();
    fetch("/api/devices").then((r) => r.json()).then(setDevices);
  }, [loadTemplates, loadRuns]);

  // 실시간 동기화 — 다른 크루의 체크가 반영되도록 실행 상태를 주기적으로 갱신
  useEffect(() => {
    const t = setInterval(() => void loadRuns(), 2500);
    return () => clearInterval(t);
  }, [loadRuns]);

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

  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const activeRun = runs.find((r) => r.templateId === selectedId && !r.completedAt) ?? null;
  const history = runs.filter((r) => r.templateId === selectedId && r.completedAt);
  const deviceById = useMemo(
    () => Object.fromEntries(devices.map((d) => [d.id, d])),
    [devices],
  );

  const start = async () => {
    if (!selectedId) return;
    await fetch("/api/procedures/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: selectedId }),
    });
    await loadRuns();
  };
  const patch = async (runId: string, body: Record<string, unknown>) => {
    await fetch(`/api/procedures/runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await loadRuns();
  };
  const removeRun = async (runId: string) => {
    await fetch(`/api/procedures/runs/${runId}`, { method: "DELETE" });
    await loadRuns();
  };

  // 템플릿 CRUD
  const createTemplate = async () => {
    const t = (await (
      await fetch("/api/procedures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "새 체크리스트", icon: "📋", items: [] }),
      })
    ).json()) as ProcedureTemplate;
    await loadTemplates();
    setSelectedId(t.id);
  };
  const saveTemplate = async (id: string, patchBody: Partial<ProcedureTemplate>) => {
    await fetch(`/api/procedures/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    });
    await loadTemplates();
  };
  const removeTemplate = async (id: string) => {
    await fetch(`/api/procedures/${id}`, { method: "DELETE" });
    const t = await loadTemplates();
    setSelectedId(t[0]?.id ?? null);
    setManage(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">✅ 프로시저 · 체크리스트</h1>
            <p className="text-xs text-slate-400">
              체크·완료 기록은 자동 저장됩니다 (누가·언제)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session?.user && (
              <span className="hidden text-sm text-slate-500 sm:inline">
                {session.user.name}
                <span className="ml-1 text-xs text-slate-400">
                  ({isAdmin ? "관리자" : "크루"})
                </span>
              </span>
            )}
            {isAdmin && (
              <button
                onClick={() => setManage((v) => !v)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  manage
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                관리
              </button>
            )}
            <Link href="/" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              도면으로
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {/* 체크리스트 탭 */}
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => {
            const on = selectedId === t.id;
            const active = runs.some((r) => r.templateId === t.id && !r.completedAt);
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  on ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
                style={on ? { background: t.color ?? "#0ea5e9" } : undefined}
              >
                <span className="text-base">{t.icon ?? "📋"}</span>
                {t.title}
                {active && <span className={`h-2 w-2 rounded-full ${on ? "bg-white" : "bg-emerald-500"}`} />}
              </button>
            );
          })}
          {isAdmin && manage && (
            <button
              onClick={createTemplate}
              className="rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"
            >
              + 새 체크리스트
            </button>
          )}
        </div>

        <div className="mt-5">
          {manage && isAdmin && selected ? (
            <TemplateEditor
              key={selected.id}
              template={selected}
              devices={devices}
              onSave={(patchBody) => saveTemplate(selected.id, patchBody)}
              onDelete={() => removeTemplate(selected.id)}
            />
          ) : activeRun ? (
            <RunCard
              run={activeRun}
              template={selected ?? undefined}
              deviceById={deviceById}
              readings={readings}
              currentUserId={session?.user?.id}
              isAdmin={isAdmin}
              onStatus={(itemId, status) => patch(activeRun.id, { action: "status", itemId, status })}
              onNote={(itemId, note) => patch(activeRun.id, { action: "note", itemId, note })}
              onComplete={() => patch(activeRun.id, { action: "complete" })}
            />
          ) : (
            <StartCard template={selected ?? undefined} onStart={start} />
          )}
        </div>

        {!manage && history.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">지난 실행 기록</h2>
            <div className="space-y-2">
              {history.map((r) => (
                <HistoryRow
                  key={r.id}
                  run={r}
                  template={selected ?? undefined}
                  canDelete={isAdmin}
                  onDelete={() => removeRun(r.id)}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ---------- 시작 카드 ---------- */
function StartCard({ template, onStart }: { template?: ProcedureTemplate; onStart: () => void }) {
  const [busy, setBusy] = useState(false);
  const color = template?.color ?? "#0ea5e9";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <div className="text-3xl">{template?.icon ?? "📋"}</div>
      <h2 className="mt-2 text-base font-semibold text-slate-800">{template?.title ?? "체크리스트"}</h2>
      <p className="mt-1 text-sm text-slate-500">
        점검 항목 {template?.items.length ?? 0}개 · 진행 중인 점검이 없습니다.
      </p>
      <button
        onClick={async () => {
          setBusy(true);
          await onStart();
          setBusy(false);
        }}
        disabled={busy}
        className="mt-4 rounded-xl px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: color }}
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
  currentUserId,
  isAdmin,
  onStatus,
  onNote,
  onComplete,
}: {
  run: ProcedureRun;
  template?: ProcedureTemplate;
  deviceById: Record<string, Device>;
  readings: Record<string, DeviceReading>;
  currentUserId?: string;
  isAdmin: boolean;
  onStatus: (itemId: string, status: CheckStatus | "none") => void;
  onNote: (itemId: string, note: string) => void;
  onComplete: () => void;
}) {
  const items = template?.items ?? [];
  const checkOf = (id: string) => run.checks.find((c) => c.itemId === id);
  const decidedOf = (id: string) => {
    const s = checkOf(id)?.status;
    return s === "ok" || s === "problem";
  };
  const required = items.filter((i) => i.required);
  const reqDecided = required.filter((i) => decidedOf(i.id)).length;
  const decided = items.filter((i) => decidedOf(i.id)).length;
  const problems = items.filter((i) => checkOf(i.id)?.status === "problem").length;
  const pending = items.filter((i) => checkOf(i.id)?.status === "pending").length;
  const allRequiredDone = reqDecided === required.length;
  const color = template?.color ?? "#0ea5e9";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">{run.title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {run.startedByName} 시작 · {fmt(run.startedAt)} ·{" "}
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              실시간
            </span>
          </p>
        </div>
        <div className="text-right">
          <span className="text-sm font-medium" style={{ color }}>
            {decided}/{items.length}
          </span>
          {problems > 0 && (
            <div className="text-xs font-semibold text-red-500">문제 {problems}</div>
          )}
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all" style={{ width: `${items.length ? (decided / items.length) * 100 : 0}%`, background: color }} />
      </div>

      <ul className="mt-4 divide-y divide-slate-100">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            check={checkOf(item.id)}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            device={item.deviceId ? deviceById[item.deviceId] : undefined}
            reading={
              item.deviceId && deviceById[item.deviceId]?.sensorId
                ? readings[deviceById[item.deviceId].sensorId!]
                : undefined
            }
            onStatus={(status) => onStatus(item.id, status)}
            onNote={(note) => onNote(item.id, note)}
          />
        ))}
      </ul>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {pending > 0 && <span className="text-amber-600">점검 중 {pending} · </span>}
          {allRequiredDone ? "필수 항목 결정 완료 — 마칠 수 있습니다." : `필수 ${required.length - reqDecided}개 남음`}
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

/* ---------- 항목 행 (3단계: 회색→노랑 pending→초록/빨강) ---------- */
function ItemRow({
  item,
  check,
  device,
  reading,
  currentUserId,
  isAdmin,
  onStatus,
  onNote,
}: {
  item: ChecklistItem;
  check?: CheckRecord;
  device?: Device;
  reading?: DeviceReading;
  currentUserId?: string;
  isAdmin: boolean;
  onStatus: (status: CheckStatus | "none") => void;
  onNote: (note: string) => void;
}) {
  const status = check?.status;
  const [note, setNote] = useState(check?.note ?? "");
  useEffect(() => setNote(check?.note ?? ""), [check?.note]);
  const canReset = !!check && (check.checkedBy === currentUserId || isAdmin);
  const statusColor =
    status === "ok" ? "#10b981" : status === "problem" ? "#ef4444" : status === "pending" ? "#f59e0b" : undefined;

  return (
    <li className="flex gap-3 py-3">
      {/* 좌측 상태 표시 / 점검 시작 버튼 */}
      {!status ? (
        <button
          onClick={() => onStatus("pending")}
          aria-label="점검 시작"
          className="mt-0.5 h-6 w-6 shrink-0 rounded-md border-2 border-slate-300 transition-colors hover:border-slate-400"
        />
      ) : (
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
          style={{ background: statusColor }}
        >
          {status === "ok" ? "✓" : status === "problem" ? "!" : "⋯"}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-sm font-medium ${
              status === "ok" ? "text-slate-400 line-through" : status === "problem" ? "text-red-600" : "text-slate-800"
            }`}
          >
            {item.label}
          </span>
          {item.required && <span className="text-[10px] font-semibold text-rose-500">필수</span>}
          <DeviceChip device={device} reading={reading} />
        </div>
        {item.detail && <p className="mt-0.5 text-xs text-slate-400">{item.detail}</p>}

        {/* 노랑 pending: 정상/문제 선택 */}
        {status === "pending" && check && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              점검 중 · {check.checkedByName}
            </span>
            <button onClick={() => onStatus("ok")} className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600">
              정상
            </button>
            <button onClick={() => onStatus("problem")} className="rounded-md bg-red-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600">
              문제
            </button>
            {canReset && (
              <button onClick={() => onStatus("none")} className="text-xs text-slate-400 hover:underline">
                취소
              </button>
            )}
          </div>
        )}

        {/* 결정됨: 정상/문제 + 메모 */}
        {(status === "ok" || status === "problem") && check && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                status === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              }`}
            >
              {status === "ok" ? "정상" : "문제"} · {check.checkedByName} · {fmt(check.checkedAt)}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (check.note ?? "") && onNote(note)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder={status === "problem" ? "문제 내용 메모…" : "메모…"}
              className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-sky-400"
            />
            {canReset && (
              <button onClick={() => onStatus("none")} className="text-xs text-slate-400 hover:underline">
                되돌리기
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/* ---------- 지난 실행 기록 ---------- */
function HistoryRow({
  run,
  template,
  canDelete,
  onDelete,
}: {
  run: ProcedureRun;
  template?: ProcedureTemplate;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const items = template?.items ?? [];
  const problems = run.checks.filter((c) => c.status === "problem").length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => setOpen((v) => !v)} className="flex-1 text-left">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            {run.completedAt ? fmt(run.completedAt) : fmt(run.startedAt)} 완료
            {problems > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                문제 {problems}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400">
            완료: {run.completedByName ?? run.startedByName} · 점검 {run.checks.length}개
          </div>
        </button>
        {canDelete && (
          <button onClick={onDelete} className="ml-2 text-xs font-medium text-red-600 hover:underline">
            삭제
          </button>
        )}
        <button onClick={() => setOpen((v) => !v)} className="ml-2 text-slate-400">
          {open ? "▲" : "▼"}
        </button>
      </div>
      {open && (
        <ul className="border-t border-slate-100 px-4 py-2 text-sm">
          {items.map((item) => {
            const c = run.checks.find((x) => x.itemId === item.id);
            const s = c?.status;
            return (
              <li key={item.id} className="flex items-start justify-between gap-3 py-1.5">
                <span className={s === "problem" ? "font-medium text-red-600" : s === "ok" ? "text-slate-700" : "text-slate-300"}>
                  {s === "ok" ? "✓" : s === "problem" ? "⚠" : s === "pending" ? "⋯" : "○"} {item.label}
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

/* ---------- 템플릿 편집 (관리자) ---------- */
let tmpCounter = 0;
function TemplateEditor({
  template,
  devices,
  onSave,
  onDelete,
}: {
  template: ProcedureTemplate;
  devices: Device[];
  onSave: (patch: Partial<ProcedureTemplate>) => Promise<void>;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(template.title);
  const [category, setCategory] = useState(template.category ?? "");
  const [icon, setIcon] = useState(template.icon ?? "📋");
  const [items, setItems] = useState<ChecklistItem[]>(template.items);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const idsRef = useRef<Map<ChecklistItem, string>>(new Map());

  const keyOf = (it: ChecklistItem) => {
    if (it.id) return it.id;
    let k = idsRef.current.get(it);
    if (!k) {
      k = `tmp-${tmpCounter++}`;
      idsRef.current.set(it, k);
    }
    return k;
  };

  const update = (i: number, patch: Partial<ChecklistItem>) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));
  const add = () => setItems((arr) => [...arr, { id: "", label: "" }]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await onSave({
      title,
      category: category || undefined,
      icon,
      items: items
        .filter((it) => it.label.trim())
        .map((it) => ({
          id: it.id && !it.id.startsWith("tmp-") ? it.id : "",
          label: it.label,
          detail: it.detail,
          deviceId: it.deviceId,
          required: it.required,
        })),
    });
    setSaving(false);
    setSaved(true);
  };

  return (
    <div className="rounded-2xl border border-sky-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          className="w-12 rounded-lg border border-slate-300 px-2 py-2 text-center text-lg outline-none focus:border-sky-500"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="체크리스트 이름"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium outline-none focus:border-sky-500"
        />
      </div>
      <input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="분류 (예: 승선 · 정박)"
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
      />

      <ul className="mt-4 space-y-2">
        {items.map((it, i) => (
          <li key={keyOf(it)} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-center gap-2">
              <input
                value={it.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="항목 내용"
                className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-sky-400"
              />
              <button onClick={() => remove(i)} className="px-1.5 text-slate-400 hover:text-red-600" aria-label="삭제">
                ✕
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <input type="checkbox" checked={!!it.required} onChange={(e) => update(i, { required: e.target.checked })} className="accent-rose-500" />
                필수
              </label>
              <select
                value={it.deviceId ?? ""}
                onChange={(e) => update(i, { deviceId: e.target.value || undefined })}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-sky-400"
              >
                <option value="">장비 연결 없음</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ul>

      <button onClick={add} className="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50">
        + 항목 추가
      </button>

      <div className="mt-5 flex items-center justify-between">
        <button onClick={onDelete} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
          체크리스트 삭제
        </button>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-600">저장됨</span>}
          <button onClick={save} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
