// 푸시 알림 관리 — 알림 규칙(생성/수정/삭제) · 수신자 · 테스트 발송.
// 각 구획은 아코디언이다. 규칙이 늘어나면 한 화면에 다 펴놓기 어렵고, 평소에는
// 하나만 열어놓고 쓰게 된다.
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

type MetricDef = {
  key: string;
  label: string;
  scope: "device" | "system";
  unit?: string;
  states?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
};

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  scope: "device" | "system";
  deviceId?: string;
  metric: string;
  op: "above" | "below" | "becomes";
  value: number | string;
  priority: "normal" | "high" | "emergency";
  note?: string;
  recipientIds?: string[];
};

type DeviceLite = { id: string; name: string };

const PRIORITY_META: Record<Rule["priority"], { label: string; cls: string }> = {
  emergency: { label: "긴급 · 반복", cls: "bg-red-50 text-red-700" },
  high: { label: "높음 · 소리", cls: "bg-amber-50 text-amber-700" },
  normal: { label: "보통", cls: "bg-slate-100 text-slate-600" },
};

const BLANK: Partial<Rule> = {
  name: "",
  scope: "device",
  deviceId: "*",
  metric: "status",
  op: "becomes",
  value: "alert",
  priority: "high",
  note: "",
  recipientIds: [],
};

export default function NotificationsAdmin() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [devices, setDevices] = useState<DeviceLite[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [testTargets, setTestTargets] = useState<string[] | null>(null);
  // 규칙 편집 — id 를 편집 중이거나 "new"(추가 폼)
  const [ruleDraft, setRuleDraft] = useState<{ id: string | "new"; data: Partial<Rule> } | null>(null);
  const [ruleErr, setRuleErr] = useState<string | null>(null);
  // 열려 있는 구획 (기본: 규칙만)
  const [open, setOpen] = useState<Record<string, boolean>>({ rules: true });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const load = useCallback(async () => {
    const [s, rec, rl, dev] = await Promise.all([
      fetch("/api/notify/test"),
      fetch("/api/notify/recipients"),
      fetch("/api/notify/rules"),
      fetch("/api/devices"),
    ]);
    if (s.ok) setStatus(await s.json());
    if (rec.ok) setRecipients(await rec.json());
    if (rl.ok) {
      const d = (await rl.json()) as { rules: Rule[]; metrics: MetricDef[] };
      setRules(d.rules);
      setMetrics(d.metrics);
    }
    if (dev.ok) {
      const ds = (await dev.json()) as { id: string; name: string; sensorId?: string }[];
      setDevices(ds.filter((x) => x.sensorId).map((x) => ({ id: x.id, name: x.name })));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- 규칙 ---------- */

  const toggleRule = async (r: Rule, enabled: boolean) => {
    setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, enabled } : x)));
    await fetch("/api/notify/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...r, enabled }),
    });
    await load();
  };

  const saveRule = async () => {
    if (!ruleDraft) return;
    setRuleErr(null);
    const creating = ruleDraft.id === "new";
    const res = await fetch("/api/notify/rules", {
      method: creating ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creating ? ruleDraft.data : { ...ruleDraft.data, id: ruleDraft.id }),
    });
    if (!res.ok) {
      setRuleErr((await res.json().catch(() => ({}))).error ?? "저장 실패");
      return;
    }
    setRuleDraft(null);
    await load();
  };

  const removeRule = async (r: Rule) => {
    if (!confirm(`'${r.name}' 규칙을 삭제할까요?`)) return;
    await fetch(`/api/notify/rules?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
    if (ruleDraft?.id === r.id) setRuleDraft(null);
    await load();
  };

  /* ---------- 수신자 ---------- */

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

  /* ---------- 테스트 발송 ---------- */

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
      body: JSON.stringify({ message: message.trim() || undefined, priority, recipientIds: targets }),
    });
    setResult(await r.json());
    setSending(false);
  };

  const activeRules = rules.filter((r) => r.enabled).length;
  const deviceName = (id?: string) =>
    id === "*" || !id ? "모든 장비" : (devices.find((d) => d.id === id)?.name ?? "삭제된 장비");

  const describe = (r: Rule) => {
    const m = metrics.find((x) => x.key === r.metric && x.scope === r.scope);
    const who = r.scope === "system" ? "Victron 시스템" : deviceName(r.deviceId);
    const label = m?.label ?? r.metric;
    if (r.op === "becomes") {
      const st = m?.states?.find((s) => s.value === String(r.value))?.label ?? String(r.value);
      return `${who} · ${label} → '${st}' 로 바뀔 때`;
    }
    return `${who} · ${label} ${r.value}${m?.unit ? ` ${m.unit}` : ""} ${r.op === "above" ? "이상" : "미만"}이 될 때`;
  };

  return (
    <div className="mt-6 space-y-3">
      {/* 연결 상태 */}
      <Section
        title="연결 상태"
        summary={status ? (status.configured ? "설정됨" : "키 미설정") : "…"}
        open={!!open.status}
        onToggle={() => toggle("status")}
      >
        <dl className="space-y-1.5 text-sm">
          <Row k="채널" v={status?.channel ?? "…"} />
          <Row
            k="키 설정"
            v={
              status ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    status.configured ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
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
            <code>.env.local</code> 에 <code>PUSHOVER_APP_TOKEN</code> 을 넣고 서버를 재시작하세요.
          </p>
        )}
      </Section>

      {/* 알림 규칙 */}
      <Section
        title="알림 규칙"
        summary={`${activeRules} / ${rules.length} 활성`}
        open={!!open.rules}
        onToggle={() => toggle("rules")}
      >
        <p className="text-xs text-slate-400">
          켠 규칙만 발송됩니다. 조건이 <b>바뀌는 순간</b>에만 1회 보내며, 상태가 유지되는 동안
          반복하지 않습니다.
        </p>
        {activeRules === 0 && rules.length > 0 && (
          <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
            지금은 모든 규칙이 꺼져 있어 <b>어떤 알림도 발송되지 않습니다</b>.
          </p>
        )}

        <ul className="mt-3 divide-y divide-slate-100">
          {rules.map((r) => (
            <li key={r.id} className="py-2.5">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => void toggleRule(r, e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600"
                  aria-label={r.name}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-sm font-medium ${r.enabled ? "text-slate-800" : "text-slate-500"}`}>
                      {r.name}
                    </span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_META[r.priority].cls}`}>
                      {PRIORITY_META[r.priority].label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{describe(r)}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    받는 사람:{" "}
                    {r.recipientIds?.length
                      ? r.recipientIds
                          .map((id) => recipients.find((x) => x.id === id)?.label ?? "(삭제됨)")
                          .join(", ")
                      : "활성 수신자 전원"}
                  </p>
                  {r.note && <p className="mt-0.5 text-[11px] text-slate-400">{r.note}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => {
                      setRuleErr(null);
                      setRuleDraft({ id: r.id, data: { ...r } });
                    }}
                    className="text-xs font-medium text-sky-600 hover:underline"
                  >
                    수정
                  </button>
                  <button onClick={() => void removeRule(r)} className="text-xs font-medium text-red-600 hover:underline">
                    삭제
                  </button>
                </div>
              </div>

              {ruleDraft?.id === r.id && (
                <RuleForm
                  data={ruleDraft.data}
                  metrics={metrics}
                  devices={devices}
                  recipients={recipients}
                  error={ruleErr}
                  onChange={(d) => setRuleDraft({ id: r.id, data: d })}
                  onCancel={() => setRuleDraft(null)}
                  onSave={saveRule}
                />
              )}
            </li>
          ))}
          {rules.length === 0 && (
            <li className="py-3 text-center text-sm text-slate-400">규칙이 없습니다.</li>
          )}
        </ul>

        {ruleDraft?.id === "new" ? (
          <RuleForm
            data={ruleDraft.data}
            metrics={metrics}
            devices={devices}
            recipients={recipients}
            error={ruleErr}
            onChange={(d) => setRuleDraft({ id: "new", data: d })}
            onCancel={() => setRuleDraft(null)}
            onSave={saveRule}
          />
        ) : (
          <button
            onClick={() => {
              setRuleErr(null);
              setRuleDraft({ id: "new", data: { ...BLANK } });
            }}
            className="mt-3 w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-500 hover:border-sky-400 hover:text-sky-600"
          >
            + 규칙 추가
          </button>
        )}
      </Section>

      {/* 수신자 */}
      <Section
        title="수신자 (User Key)"
        summary={`${recipients.filter((r) => r.enabled).length} / ${recipients.length} 활성`}
        open={!!open.recipients}
        onToggle={() => toggle("recipients")}
      >
        <p className="text-xs text-slate-400">
          받는 사람마다 Pushover User Key 를 등록합니다. 규칙에서 대상을 지정하지 않으면 여기서
          활성인 사람 전원에게 발송됩니다.
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
              <button onClick={() => removeRecipient(r.id)} className="text-xs font-medium text-red-600 hover:underline">
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
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-500 sm:w-32"
          />
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Pushover User Key"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-500"
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
      </Section>

      {/* 테스트 발송 */}
      <Section
        title="테스트 발송"
        summary={`${targets.length}명 선택`}
        open={!!open.test}
        onToggle={() => toggle("test")}
      >
        <p className="text-xs text-slate-400">받을 사람을 선택하세요. (기본: 활성 수신자 전원)</p>

        {recipients.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {recipients.map((r) => {
              const on = targets.includes(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => toggleTarget(r.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                    on ? "bg-sky-600 text-white ring-sky-600" : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="테스트 메시지 (비우면 기본 문구)"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-500"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
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
            {sending ? "발송 중…" : targets.length === 0 ? "받을 사람을 선택하세요" : `테스트 알림 보내기 (${targets.length}명)`}
          </button>
        </div>

        {result && (
          <div className={`mt-3 rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
            {result.ok ? "✓ 발송 성공" : "✗ 발송 실패"}
            <span className="ml-2 text-xs opacity-80">
              (HTTP {result.status}) {result.detail}
            </span>
          </div>
        )}
      </Section>
    </div>
  );
}

/** 아코디언 구획 */
function Section({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <span className="flex items-center gap-2">
          {summary && <span className="text-xs text-slate-400">{summary}</span>}
          <span className="text-xs text-slate-400">{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open && <div className="border-t border-slate-100 p-4">{children}</div>}
    </div>
  );
}

/** 규칙 편집 폼 — 추가와 수정이 같은 폼을 쓴다 */
function RuleForm({
  data,
  metrics,
  devices,
  recipients,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  data: Partial<Rule>;
  metrics: MetricDef[];
  devices: DeviceLite[];
  recipients: Recipient[];
  error: string | null;
  onChange: (d: Partial<Rule>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const scope = data.scope ?? "device";
  const scoped = metrics.filter((m) => m.scope === scope);
  const metric = scoped.find((m) => m.key === data.metric);
  const set = (patch: Partial<Rule>) => onChange({ ...data, ...patch });

  /** 지표를 바꾸면 조건과 값도 그 지표가 허용하는 것으로 맞춘다 */
  const pickMetric = (key: string) => {
    const m = metrics.find((x) => x.key === key && x.scope === scope);
    if (!m) return;
    set({
      metric: key,
      op: m.states ? "becomes" : "above",
      value: m.states ? m.states[0].value : (m.min ?? 0),
    });
  };

  const toggleRecipient = (id: string) => {
    const cur = data.recipientIds ?? [];
    set({ recipientIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <input
        value={data.name ?? ""}
        onChange={(e) => set({ name: e.target.value })}
        placeholder="규칙 이름 (예: 빌지 펌프 기동)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-500"
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="대상">
          <select
            value={scope === "system" ? "system" : (data.deviceId ?? "*")}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "system") {
                const first = metrics.find((m) => m.scope === "system")!;
                set({
                  scope: "system",
                  deviceId: undefined,
                  metric: first.key,
                  op: first.states ? "becomes" : "below",
                  value: first.states ? first.states[0].value : (first.min ?? 0),
                });
              } else {
                const keep = metrics.find((m) => m.scope === "device" && m.key === data.metric);
                const m = keep ?? metrics.find((x) => x.scope === "device")!;
                set({
                  scope: "device",
                  deviceId: v,
                  metric: m.key,
                  op: m.states ? "becomes" : "above",
                  value: m.states ? m.states[0].value : (m.min ?? 0),
                });
              }
            }}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
          >
            <option value="system">Victron 시스템</option>
            <option value="*">모든 장비</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="지표">
          <select
            value={data.metric ?? ""}
            onChange={(e) => pickMetric(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
          >
            {scoped.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="조건">
          {metric?.states ? (
            <div className="px-2 py-1.5 text-sm text-slate-500">…로 바뀔 때</div>
          ) : (
            <select
              value={data.op ?? "above"}
              onChange={(e) => set({ op: e.target.value as Rule["op"] })}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
            >
              <option value="above">이상이 될 때</option>
              <option value="below">미만이 될 때</option>
            </select>
          )}
        </Field>

        <Field label={metric?.states ? "값" : `임계값${metric?.unit ? ` (${metric.unit})` : ""}`}>
          {metric?.states ? (
            <select
              value={String(data.value ?? "")}
              onChange={(e) => set({ value: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
            >
              {metric.states.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              value={Number(data.value ?? 0)}
              min={metric?.min}
              max={metric?.max}
              step={metric?.step}
              onChange={(e) => set({ value: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
            />
          )}
        </Field>
      </div>
      {metric?.hint && <p className="mt-1 text-[11px] text-slate-400">{metric.hint}</p>}

      <div className="mt-2">
        <Field label="중요도">
          <select
            value={data.priority ?? "normal"}
            onChange={(e) => set({ priority: e.target.value as Rule["priority"] })}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
          >
            <option value="normal">보통</option>
            <option value="high">높음 · 소리</option>
            <option value="emergency">긴급 · 확인할 때까지 반복</option>
          </select>
        </Field>
      </div>

      <div className="mt-2">
        <span className="text-[11px] font-medium text-slate-500">받는 사람</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            onClick={() => set({ recipientIds: [] })}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
              (data.recipientIds ?? []).length === 0
                ? "bg-sky-600 text-white ring-sky-600"
                : "bg-white text-slate-500 ring-slate-200"
            }`}
          >
            활성 수신자 전원
          </button>
          {recipients.map((r) => {
            const on = (data.recipientIds ?? []).includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => toggleRecipient(r.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                  on ? "bg-sky-600 text-white ring-sky-600" : "bg-white text-slate-500 ring-slate-200"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <input
        value={data.note ?? ""}
        onChange={(e) => set({ note: e.target.value })}
        placeholder="메모 (알림 본문에 함께 표시)"
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-500"
      />

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
          취소
        </button>
        <button onClick={onSave} className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700">
          저장
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
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
