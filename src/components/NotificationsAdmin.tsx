// 알림 상태 표시 + 테스트 발송 UI.
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

type Status = {
  channel: string;
  configured: boolean;
  monitor: boolean;
  monitorLevel: string;
};

type SendResult = { ok: boolean; status: number; detail?: string };

export default function NotificationsAdmin() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/notify/test");
    if (r.ok) setStatus(await r.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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

      {/* 테스트 발송 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">테스트 발송</h2>
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
