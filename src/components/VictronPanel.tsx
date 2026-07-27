// 전기 시스템 패널 (Victron) — 모달.
// /api/victron 를 2초마다 폴링해 배터리/솔라/얼터네이터/인버터 상태를 읽어 보여준다.
// 지금은 읽기 전용. 이후 제어(모드 변경 등)를 여기에 붙인다.
"use client";

import { useEffect, useRef, useState } from "react";
import type { VictronSnapshot } from "@/lib/victron/types";

const POLL_MS = 2000;

/** W → "1.2 kW" / "120 W" */
function watts(v: number | null): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toFixed(2)} kW`;
  return `${Math.round(v)} W`;
}
function volts(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)} V`;
}
function amps(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)} A`;
}
function pct(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(0)}%`;
}
function degc(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)}°C`;
}
/** 초 → "2일 3시간" / "5시간 12분" / "48분" */
function ttg(sec: number | null): string {
  if (sec == null || sec <= 0) return "∞";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

/** 전력 부호 색: 양(충전/유입)=녹색, 음(방전/유출)=주황 */
function powerColor(v: number | null): string {
  if (v == null || v === 0) return "#64748b";
  return v > 0 ? "#10b981" : "#f97316";
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums" style={{ color: color ?? "#1e293b" }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DeviceRow({
  name,
  product,
  connected,
  metrics,
  badge,
}: {
  name: string;
  product: string | null;
  connected: boolean;
  metrics: [string, string][];
  badge?: string | null;
}) {
  return (
    <div className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`}
          />
          <span className="truncate text-sm font-medium text-slate-700">{name}</span>
          {badge && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {badge}
            </span>
          )}
        </div>
        {product && <span className="shrink-0 truncate text-[11px] text-slate-400">{product}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {metrics.map(([k, v]) => (
          <div key={k} className="text-xs">
            <span className="text-slate-400">{k} </span>
            <span className="font-medium tabular-nums text-slate-700">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VictronPanel({ onClose }: { onClose: () => void }) {
  const [snap, setSnap] = useState<VictronSnapshot | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/victron", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as VictronSnapshot;
        if (alive) {
          setSnap(data);
          setFetchError(null);
        }
      } catch (e) {
        if (alive) setFetchError((e as Error).message);
      }
    };
    void load();
    timer.current = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sys = snap?.system;
  const live = snap?.connected;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-3xl rounded-2xl bg-white/90 shadow-2xl ring-1 ring-black/5 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">⚡ 전기 시스템 · Victron</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <span
                className={`inline-block h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-red-400"}`}
              />
              {live ? "실시간 연결됨" : "연결 대기/끊김"}
              {snap?.host && <span className="text-slate-400">· {snap.host}</span>}
              {sys?.systemState && <span className="text-slate-400">· {sys.systemState}</span>}
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
          {!snap && !fetchError && (
            <p className="py-10 text-center text-sm text-slate-400">불러오는 중…</p>
          )}
          {snap?.error && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
              MQTT: {snap.error}
            </p>
          )}
          {fetchError && !snap && (
            <p className="py-10 text-center text-sm text-red-500">불러오기 실패: {fetchError}</p>
          )}

          {snap && sys && (
            <>
              {/* 배터리 요약 */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="배터리 SoC" value={pct(sys.soc)} sub={sys.batteryState ?? undefined} color="#0ea5e9" />
                <Stat label="전압" value={volts(sys.voltage)} sub={degc(sys.temperature)} />
                <Stat
                  label="배터리 전력"
                  value={watts(sys.power)}
                  sub={amps(sys.current)}
                  color={powerColor(sys.power)}
                />
                <Stat label="잔여 시간" value={ttg(sys.timeToGoS)} sub="현재 부하 기준" />
              </div>

              {/* 발전/부하 흐름 */}
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="솔라 발전" value={watts(sys.pvPower)} color={sys.pvPower ? "#10b981" : undefined} />
                <Stat
                  label="육상 전원(AC IN)"
                  value={sys.acInputConnected ? watts(sys.acInputPower) : "미연결"}
                  color={sys.acInputConnected ? "#10b981" : "#94a3b8"}
                />
                <Stat label="AC 부하" value={watts(sys.acLoadPower)} color={sys.acLoadPower ? "#f97316" : undefined} />
                <Stat label="DC 부하" value={watts(sys.dcLoadPower)} color={sys.dcLoadPower ? "#f97316" : undefined} />
              </div>

              {/* 인버터/충전기 */}
              {snap.inverter && (
                <Section title="인버터 / 충전기">
                  <DeviceRow
                    name={snap.inverter.name}
                    product={snap.inverter.product}
                    connected
                    badge={snap.inverter.mode}
                    metrics={[
                      ["상태", snap.inverter.state ?? "—"],
                      ["DC", `${volts(snap.inverter.dcVoltage)} · ${watts(snap.inverter.dcPower)}`],
                      [
                        "AC 출력",
                        `${volts0(snap.inverter.acOutVoltage)} · ${watts(snap.inverter.acOutPower)}`,
                      ],
                      [
                        "AC 입력",
                        snap.inverter.acInConnected
                          ? `${volts0(snap.inverter.acInVoltage)} · ${watts(snap.inverter.acInPower)}`
                          : "미연결",
                      ],
                      ["입력 제한", snap.inverter.currentLimit != null ? `${snap.inverter.currentLimit} A` : "—"],
                    ]}
                  />
                  {(snap.inverter.alarms.overload ||
                    snap.inverter.alarms.lowBattery ||
                    snap.inverter.alarms.highTemp) && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 ring-1 ring-red-200">
                      경보:
                      {snap.inverter.alarms.overload && " 과부하"}
                      {snap.inverter.alarms.lowBattery && " 저전압"}
                      {snap.inverter.alarms.highTemp && " 고온"}
                    </p>
                  )}
                </Section>
              )}

              {/* 배터리 모니터 */}
              {snap.batteries.length > 0 && (
                <Section title={`배터리 모니터 (${snap.batteries.length})`}>
                  {snap.batteries.map((b) => (
                    <DeviceRow
                      key={b.instance}
                      name={b.name}
                      product={b.product}
                      connected={b.connected}
                      badge={b.soc != null ? pct(b.soc) : null}
                      metrics={[
                        ["전압", volts(b.voltage)],
                        ["전류", amps(b.current)],
                        ["전력", watts(b.power)],
                        ["온도", degc(b.temperature)],
                        ...(b.timeToGoS != null ? ([["잔여", ttg(b.timeToGoS)]] as [string, string][]) : []),
                        ...(b.consumedAh != null
                          ? ([["소비", `${b.consumedAh} Ah`]] as [string, string][])
                          : []),
                      ]}
                    />
                  ))}
                </Section>
              )}

              {/* 솔라 차저 */}
              {snap.solarChargers.length > 0 && (
                <Section title={`솔라 충전기 MPPT (${snap.solarChargers.length})`}>
                  {snap.solarChargers.map((s) => (
                    <DeviceRow
                      key={s.instance}
                      name={s.name}
                      product={s.product}
                      connected={s.connected}
                      badge={s.state}
                      metrics={[
                        ["발전", watts(s.power)],
                        ["PV 전압", volts0(s.pvVoltage)],
                        ["출력", `${volts(s.voltage)} · ${amps(s.current)}`],
                        ["누적", s.yieldTodayKwh != null ? `${s.yieldTodayKwh} kWh` : "—"],
                      ]}
                    />
                  ))}
                </Section>
              )}

              {/* 얼터네이터 / DC-DC */}
              {snap.alternators.length > 0 && (
                <Section title={`DC-DC 충전기 (${snap.alternators.length})`}>
                  {snap.alternators.map((a) => (
                    <DeviceRow
                      key={a.instance}
                      name={a.name}
                      product={a.product}
                      connected={a.connected}
                      badge={a.state}
                      metrics={[
                        ["출력", watts(a.power)],
                        ["전압", volts(a.voltage)],
                        ["전류", amps(a.current)],
                      ]}
                    />
                  ))}
                </Section>
              )}

              <p className="mt-4 text-right text-[10px] text-slate-300">
                {snap.updatedAt
                  ? `갱신 ${new Date(snap.updatedAt).toLocaleTimeString("ko-KR")}`
                  : "데이터 대기 중"}
                {snap.portalId && ` · ${snap.portalId}`}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 정수 볼트 (AC 계통용) */
function volts0(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)} V`;
}
