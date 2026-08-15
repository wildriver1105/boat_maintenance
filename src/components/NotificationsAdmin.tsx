// 알림 상태 표시 + 테스트 발송 UI.
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

type Status = {
  channel: string;
  configured: boolean;
  recipientCount: number;
  monitor: boolean;
  rulesEnabled: number;
};

type SendResult = { ok: boolean; status: number; detail?: string };

type Recipient = { id: string; label: string; keyMasked: string; enabled: boolean };

type RuleParam = {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
};

type Rule = {
  key: string;
  group: string;
  label: string;
  description: string;
  why?: string;
  priority: "normal" | "high" | "emergency";
  params?: RuleParam[];
  enabled: boolean;
  values: Record<string, number>;
};

const PRIORITY_META: Record<Rule["priority"], { label: string; cls: string }> = {
  emergency: { label: "긴급 · 반복", cls: "bg-red-50 text-red-700" },
  high: { label: "높음 · 소리", cls: "bg-amber-50 text-amber-700" },
  normal: { label: "보통", cls: "bg-slate-100 text-slate-600" },
};

export default function NotificationsAdmin() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  // 임계값 슬라이더는 드래그 중 서버 값에 밀리지 않도록 로컬 값을 우선한다
  const [paramDraft, setParamDraft] = useState<Record<string, number>>({});
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);
  // 이름 인라인 편집
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  // 테스트 발송 대상 — null 이면 "활성 수신자 전원"(기본값)
  const [testTargets, setTestTargets] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    const [s, rec, rl] = await Promise.all([
      fetch("/api/notify/test"),
      fetch("/api/notify/recipients"),
      fetch("/api/notify/rules"),
    ]);
    if (s.ok) setStatus(await s.json());
    if (rec.ok) setRecipients(await rec.json());
    if (rl.ok) setRules(await rl.json());
  }, []);

  const patchRule = async (key: string, patch: { enabled?: boolean; params?: Record<string, number> }) => {
    // 화면을 먼저 바꾸고 저장한다 — 토글이 한 박자 늦게 움직이면 눌렸는지 헷갈린다.
    // patch.params 는 임계"값"이므로 카탈로그 정의(r.params)가 아니라 r.values 에 얹는다.
    setRules((rs) =>
      rs.map((r) =>
        r.key === key
          ? {
              ...r,
              enabled: patch.enabled ?? r.enabled,
              values: patch.params ? { ...r.values, ...patch.params } : r.values,
            }
          : r,
      ),
    );
    await fetch("/api/notify/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, ...patch }),
    });
    await load();
  };
  useEffect(() => {
    void load();
  }, [load]);

  const addRecipient = async () => {
    setAddErr(null);
    const r = await fetch("/api/notify/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel, userKey: newKey }),
    });
    if (!r.ok) {
      setAddErr((await r.json().catch(() => ({}))).error ?? "추가 실패");
      return;
    }
    setNewLabel("");
    setNewKey("");
    await load();
  };

  const toggleRecipient = async (id: string, enabled: boolean) => {
    await fetch("/api/notify/recipients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    await load();
  };

  const removeRecipient = async (id: string) => {
    await fetch(`/api/notify/recipients?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setTestTargets((t) => (t ? t.filter((x) => x !== id) : t));
    await load();
  };

  const saveLabel = async () => {
    const id = editingId;
    const label = editLabel.trim();
    setEditingId(null);
    if (!id || !label) return;
    await fetch("/api/notify/recipients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, label }),
    });
    await load();
  };

  // 아직 손대지 않았으면 활성 수신자 전원이 기본 대상
  const targets = testTargets ?? recipients.filter((r) => r.enabled).map((r) => r.id);
  const toggleTarget = (id: string) =>
    setTestTargets((t) => {
      const base = t ?? recipients.filter((r) => r.enabled).map((r) => r.id);
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  const sendTest = async () => {
    setSending(true);
    setResult(null);
    const r = await fetch("/api/notify/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message.trim() || undefined,
        priority,
        recipientIds: targets,
      }),
    });
    setResult(await r.json());
    setSending(false);
  };

  return (
    <div className="mt-6 space-y-5">
      {/* 상태 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">연결 상태</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row k="채널" v={status?.channel ?? "…"} />
          <Row
            k="키 설정"
            v={
              status ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    status.configured
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {status.configured ? "설정됨" : "미설정 (.env.local 필요)"}
                </span>
              ) : (
                "…"
              )
            }
          />
          <Row k="수신자" v={status ? `${status.recipientCount}명` : "…"} />
          <Row
            k="자동 알림 모니터"
            v={
              status
                ? status.monitor
                  ? status.rulesEnabled > 0
                    ? `켜짐 · 규칙 ${status.rulesEnabled}개 활성`
                    : "켜짐 · 활성 규칙 없음 (발송 안 됨)"
                  : "꺼짐 (ALERT_MONITOR=on 으로 활성)"
                : "…"
            }
          />
        </dl>
        {status && !status.configured && (
          <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
            <code>.env.local</code> 에 <code>PUSHOVER_APP_TOKEN</code>,{" "}
            <code>PUSHOVER_USER_KEY</code> 를 넣고 서버를 재시작하세요.
          </p>
        )}
      </div>

      {/* 알림 규칙 — 무엇을 보낼 것인가 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">알림 규칙</h2>
          <span className="text-xs text-slate-400">
            {rules.filter((r) => r.enabled).length} / {rules.length} 활성
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">
          켠 규칙만 푸시로 발송됩니다. 조건이 <b>바뀌는 순간</b>에만 1회 보내며, 상태가
          유지되는 동안 반복하지 않습니다.
        </p>

        {rules.filter((r) => r.enabled).length === 0 && (
          <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
            지금은 모든 규칙이 꺼져 있어 <b>어떤 알림도 발송되지 않습니다</b>.
          </p>
        )}

        {[...new Set(rules.map((r) => r.group))].map((group) => (
          <div key={group} className="mt-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {group}
            </h3>
            <ul className="mt-1.5 divide-y divide-slate-100">
              {rules
                .filter((r) => r.group === group)
                .map((r) => (
                  <li key={r.key} className="py-2.5">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={(e) => void patchRule(r.key, { enabled: e.target.checked })}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600"
                        aria-label={r.label}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-sm font-medium ${
                              r.enabled ? "text-slate-800" : "text-slate-500"
                            }`}
                          >
                            {r.label}
                          </span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              PRIORITY_META[r.priority].cls
                            }`}
                          >
                            {PRIORITY_META[r.priority].label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{r.description}</p>
                        {r.why && <p className="mt-0.5 text-[11px] text-slate-400">{r.why}</p>}

                        {/* 임계값 — 규칙을 켰을 때만 조정할 수 있게 한다 */}
                        {r.params?.map((p) => {
                          const draftKey = `${r.key}.${p.key}`;
                          const value = paramDraft[draftKey] ?? r.values[p.key];
                          return (
                            <div key={p.key} className="mt-2 max-w-xs">
                              <div className="flex items-baseline justify-between">
                                <label
                                  htmlFor={draftKey}
                                  className="text-[11px] text-slate-500"
                                >
                                  {p.label}
                                </label>
                                <span className="text-[11px] font-medium tabular-nums text-slate-600">
                                  {value} {p.unit}
                                </span>
                              </div>
                              <input
                                id={draftKey}
                                type="range"
                                min={p.min}
                                max={p.max}
                                step={p.step}
                                value={value}
                                disabled={!r.enabled}
                                onChange={(e) =>
                                  setParamDraft((d) => ({ ...d, [draftKey]: Number(e.target.value) }))
                                }
                                onPointerUp={(e) =>
                                  void patchRule(r.key, {
                                    params: { [p.key]: Number((e.target as HTMLInputElement).value) },
                                  })
                                }
                                onKeyUp={(e) =>
                                  void patchRule(r.key, {
                                    params: { [p.key]: Number((e.target as HTMLInputElement).value) },
                                  })
                                }
                                className="mt-1 w-full accent-sky-600 disabled:opacity-40"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      {/* 수신자 관리 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">수신자 (User Key)</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          받는 사람마다 Pushover User Key 를 등록하면 경고 시 전원에게 발송됩니다.
        </p>

        <ul className="mt-3 divide-y divide-slate-100">
          {recipients.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => toggleRecipient(r.id, e.target.checked)}
                className="h-4 w-4 accent-sky-600"
              />
              <span className="min-w-0 flex-1">
                {editingId === r.id ? (
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onBlur={saveLabel}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveLabel();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="w-full rounded-lg border border-sky-400 px-2 py-1 text-sm text-slate-800 outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(r.id);
                      setEditLabel(r.label);
                    }}
                    title="이름 수정"
                    className="block max-w-full truncate text-left text-sm font-medium text-slate-700 hover:text-sky-600"
                  >
                    {r.label} <span className="text-xs text-slate-300">✎</span>
                  </button>
                )}
                <span className="block font-mono text-xs text-slate-400">{r.keyMasked}</span>
              </span>
              <button
                onClick={() => removeRecipient(r.id)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                삭제
              </button>
            </li>
          ))}
          {recipients.length === 0 && (
            <li className="py-3 text-center text-sm text-slate-400">등록된 수신자가 없습니다.</li>
          )}
        </ul>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="이름 (예: 선장)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 sm:w-32"
          />
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Pushover User Key"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-sky-500"
          />
          <button
            onClick={addRecipient}
            disabled={!newKey.trim()}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-40"
          >
            추가
          </button>
        </div>
        {addErr && <p className="mt-2 text-sm text-red-600">{addErr}</p>}
      </div>

      {/* 테스트 발송 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">테스트 발송</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          받을 사람을 선택하세요. (기본: 활성 수신자 전원)
        </p>

        {recipients.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {recipients.map((r) => {
              const on = targets.includes(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => toggleTarget(r.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                    on
                      ? "bg-sky-50 text-sky-700 ring-sky-300"
                      : "bg-white text-slate-400 ring-slate-200 hover:text-slate-600"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {r.label}
                </button>
              );
            })}
            <button
              onClick={() => setTestTargets(targets.length === recipients.length ? [] : recipients.map((r) => r.id))}
              className="ml-1 text-xs text-slate-400 underline hover:text-slate-600"
            >
              {targets.length === recipients.length ? "전체 해제" : "전체 선택"}
            </button>
          </div>
        )}

        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="메시지 (비우면 기본 테스트 문구)"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />
        <div className="mt-3 flex items-center gap-2">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          >
            <option value="low">낮음</option>
            <option value="normal">보통</option>
            <option value="high">높음</option>
            <option value="emergency">긴급</option>
          </select>
          <button
            onClick={sendTest}
            disabled={sending || targets.length === 0}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {sending
              ? "발송 중…"
              : targets.length === 0
                ? "받을 사람을 선택하세요"
                : `테스트 알림 보내기 (${targets.length}명)`}
          </button>
        </div>

        {result && (
          <div
            className={`mt-3 rounded-lg p-3 text-sm ${
              result.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
            }`}
          >
            {result.ok ? "✓ 발송 성공" : "✗ 발송 실패"}
            <span className="ml-2 text-xs opacity-80">
              (HTTP {result.status}) {result.detail}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium text-slate-800">{v}</dd>
    </div>
  );
}
