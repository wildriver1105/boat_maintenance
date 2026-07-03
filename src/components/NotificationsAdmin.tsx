// 알림 상태 표시 + 테스트 발송 UI.
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

type Status = {
  channel: string;
  configured: boolean;
  recipientCount: number;
  monitor: boolean;
  monitorLevel: string;
};

type SendResult = { ok: boolean; status: number; detail?: string };

type Recipient = { id: string; label: string; keyMasked: string; enabled: boolean };

export default function NotificationsAdmin() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, rec] = await Promise.all([
      fetch("/api/notify/test"),
      fetch("/api/notify/recipients"),
    ]);
    if (s.ok) setStatus(await s.json());
    if (rec.ok) setRecipients(await rec.json());
  }, []);
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
    await load();
  };

  const sendTest = async () => {
    setSending(true);
    setResult(null);
    const r = await fetch("/api/notify/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message.trim() || undefined,
        priority,
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
            k="자동 경고 알림"
            v={
              status
                ? status.monitor
                  ? `켜짐 (${status.monitorLevel} 이상)`
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
                <span className="block text-sm font-medium text-slate-700">{r.label}</span>
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
        <p className="mt-0.5 text-xs text-slate-400">활성 수신자 전원에게 발송됩니다.</p>
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
            disabled={sending}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {sending ? "발송 중…" : "테스트 알림 보내기"}
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
