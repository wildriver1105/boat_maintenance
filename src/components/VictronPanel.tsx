// 전기 시스템 패널 (Victron) — 모달.
// /api/victron 를 2초마다 폴링해 배터리/솔라/얼터네이터/인버터 상태를 읽어 보여준다.
// 지금은 읽기 전용. 이후 제어(모드 변경 등)를 여기에 붙인다.
"use client";

import { useEffect, useRef, useState } from "react";
import type { VictronSnapshot } from "@/lib/victron/types";
import { Bars, FlowRow, Meter, RadialGauge, type Severity } from "./gauges/Gauges";
import VictronControls from "./VictronControls";

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

/* ---- 계기판용 심각도 판정 (마커/패널의 기존 임계값과 동일하게 맞춘다) ---- */

function socSeverity(soc: number | null): Severity {
  if (soc == null) return "unknown";
  if (soc < 20) return "crit";
  if (soc < 50) return "warn";
  return "ok";
}

/** 12V 납축/리튬 공통 실사용 범위 11.6~14.6V 를 0..1 로 */
const V_MIN = 11.6;
const V_MAX = 14.6;
function voltRatio(v: number | null): number | null {
  if (v == null) return null;
  return (v - V_MIN) / (V_MAX - V_MIN);
}
function voltSeverity(v: number | null): Severity {
  if (v == null) return "unknown";
  if (v < 11.6) return "crit";
  if (v < 12.1) return "warn";
  return "ok";
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

/** 물리 연결 방식별 색 — 연결 체계를 한눈에 구분하기 위한 것 */
const LINK_COLOR: Record<string, string> = {
  "VE.Bus": "bg-indigo-50 text-indigo-700 ring-indigo-200",
  "VE.Can": "bg-sky-50 text-sky-700 ring-sky-200",
  "VE.Direct": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  USB: "bg-amber-50 text-amber-700 ring-amber-200",
};

function LinkBadge({ connection }: { connection: string | null }) {
  if (!connection) return null;
  const cls = LINK_COLOR[connection] ?? "bg-slate-100 text-slate-500 ring-slate-200";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${cls}`}>
      {connection}
    </span>
  );
}

function DeviceRow({
  name,
  product,
  connected,
  metrics,
  badge,
  connection,
  errorCode,
}: {
  name: string;
  product: string | null;
  connected: boolean;
  metrics: [string, string][];
  badge?: string | null;
  connection?: string | null;
  errorCode?: number | null;
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
          <LinkBadge connection={connection ?? null} />
          {errorCode != null && errorCode !== 0 && (
            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600 ring-1 ring-red-200">
              오류 {errorCode}
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

/** 스마트플러그 목록 (/api/zigbee) — Victron 이 못 보는 개별 AC 부하 */
type PlugRow = {
  id: string;
  name: string;
  live: boolean;
  values: Record<string, unknown>;
};

export default function VictronPanel({ onClose }: { onClose: () => void }) {
  const [snap, setSnap] = useState<VictronSnapshot | null>(null);
  const [plugs, setPlugs] = useState<PlugRow[]>([]);
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
      // 플러그는 실패해도 Victron 표시를 막지 않는다 (별개 계통)
      try {
        const r = await fetch("/api/zigbee", { cache: "no-store" });
        if (r.ok) {
          const d = (await r.json()) as { plugs?: PlugRow[] };
          if (alive) setPlugs(d.plugs ?? []);
        }
      } catch {
        /* 무시 */
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
              {/* 배터리 — SoC 는 이 패널의 히어로 수치라 반원 게이지 하나로 */}
              <div className="flex flex-col items-center gap-4 rounded-xl bg-white/70 p-4 ring-1 ring-black/5 sm:flex-row sm:items-center">
                <RadialGauge
                  value={sys.soc}
                  label="배터리 SoC"
                  severity={socSeverity(sys.soc)}
                  sub={sys.batteryState ?? undefined}
                />
                <div className="w-full flex-1 space-y-3">
                  <Meter
                    label="전압 (12V 계통)"
                    valueText={volts(sys.voltage)}
                    ratio={voltRatio(sys.voltage)}
                    severity={voltSeverity(sys.voltage)}
                    marker={voltRatio(12.1)}
                    note={
                      sys.voltage == null
                        ? "값 없음"
                        : `범위 11.6–14.6V · 세로선은 주의 임계(12.1V) · 배터리 ${degc(sys.temperature)}`
                    }
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">배터리 전력</div>
                      <div className="text-xl font-semibold" style={{ color: powerColor(sys.power) }}>
                        {watts(sys.power)}
                      </div>
                      <div className="text-[11px] text-slate-400">{amps(sys.current)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">잔여 시간</div>
                      <div className="text-xl font-semibold text-slate-800">{ttg(sys.timeToGoS)}</div>
                      <div className="text-[11px] text-slate-400">현재 부하 기준</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 전력 흐름 — 유입(발전) vs 유출(부하) */}
              <div className="mt-3">
                <FlowRow
                  items={[
                    { id: "pv", label: "솔라 발전", watts: sys.pvPower, dir: "in" },
                    {
                      id: "ac-in",
                      label: "육상 전원",
                      watts: sys.acInputConnected ? sys.acInputPower : 0,
                      dir: "in",
                    },
                    { id: "ac-load", label: "AC 부하", watts: sys.acLoadPower, dir: "out" },
                    { id: "dc-load", label: "DC 부하", watts: sys.dcLoadPower, dir: "out" },
                  ]}
                />
              </div>

              <Section title="충전 설정 (쓰기)">
                <VictronControls />
              </Section>

              {/* AC 콘센트별 소비 — Victron 은 AC 부하 총합만 보므로 내역은 여기서만 보인다 */}
              {plugs.length > 0 && (
                <Section title="콘센트별 소비 (스마트플러그)">
                  <div className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
                    <Bars
                      items={plugs.map((p) => {
                        const w = typeof p.values.power === "number" ? (p.values.power as number) : null;
                        const on = p.values.state === "ON";
                        return {
                          id: p.id,
                          label: p.name,
                          // 꺼졌거나 미연결이면 0 이 아니라 "값 없음"으로 둔다
                          value: !p.live ? null : on ? (w ?? 0) : 0,
                          sub: !p.live ? "미연결" : on ? undefined : "꺼짐",
                        };
                      })}
                    />
                    <div className="mt-2 flex items-baseline justify-between border-t border-slate-100 pt-2">
                      <span className="text-xs text-slate-500">플러그 합계</span>
                      <span className="text-sm font-semibold tabular-nums text-slate-700">
                        {plugs.some((p) => p.live)
                          ? `${Math.round(
                              plugs.reduce(
                                (t, p) =>
                                  t +
                                  (p.live && p.values.state === "ON" && typeof p.values.power === "number"
                                    ? (p.values.power as number)
                                    : 0),
                                0,
                              ),
                            )} W`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </Section>
              )}

              {/* 솔라 4대 상대 발전량 — 크기 비교라 단일 색상 농도만 사용 */}
              {snap.solarChargers.length > 0 && (
                <Section title="솔라 발전량 비교">
                  <div className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
                    <Bars
                      items={snap.solarChargers.map((s) => ({
                        id: String(s.instance),
                        label: s.name,
                        value: s.power,
                      }))}
                    />
                  </div>
                </Section>
              )}

              {/* 인버터/충전기 */}
              {snap.inverter && (
                <Section title="인버터 / 충전기">
                  <DeviceRow
                    name={snap.inverter.name}
                    product={snap.inverter.product}
                    connection={snap.inverter.connection}
                    errorCode={snap.inverter.errorCode}
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
                      connection={b.connection}
                      errorCode={b.errorCode}
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
                      connection={s.connection}
                      errorCode={s.errorCode}
                      connected={s.connected}
                      badge={s.state}
                      metrics={[
                        ["발전", watts(s.power)],
                        ["PV 전압", volts0(s.pvVoltage)],
                        ["출력", `${volts(s.voltage)} · ${amps(s.current)}`],
                        ["누적", s.yieldSystemKwh != null ? `${s.yieldSystemKwh} kWh` : "—"],
                        ...(s.mppMode ? ([["추적", s.mppMode]] as [string, string][]) : []),
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
                      connection={a.connection}
                      errorCode={a.errorCode}
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

              {/* 온도 센서 */}
              {snap.temperatures.length > 0 && (
                <Section title={`온도 센서 (${snap.temperatures.length})`}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {snap.temperatures.map((t) => (
                      <Stat key={t.instance} label={t.name} value={degc(t.celsius)} />
                    ))}
                  </div>
                </Section>
              )}

              {/* 연결 체계 — 어떤 장비가 어떤 물리 인터페이스로 GX 에 붙어 있는지 */}
              <Section title="연결 체계">
                <div className="overflow-x-auto rounded-xl bg-white/70 ring-1 ring-black/5">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200/70 text-left text-slate-400">
                        <th className="px-3 py-2 font-medium">장비</th>
                        <th className="px-3 py-2 font-medium">연결</th>
                        <th className="px-3 py-2 font-medium">dbus 경로</th>
                        <th className="px-3 py-2 font-medium">펌웨어</th>
                        <th className="px-3 py-2 font-medium">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...(snap.inverter ? [snap.inverter] : []),
                        ...snap.batteries,
                        ...snap.solarChargers,
                        ...snap.alternators,
                      ].map((d) => {
                        const ok = "connected" in d ? d.connected : true;
                        const err = d.errorCode != null && d.errorCode !== 0;
                        return (
                          <tr key={d.service} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-2 text-slate-700">{d.name}</td>
                            <td className="px-3 py-2">
                              <LinkBadge connection={d.connection} />
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                              {d.service}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-slate-500">
                              {d.firmware ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={
                                  err
                                    ? "text-red-600"
                                    : ok
                                      ? "text-emerald-600"
                                      : "text-slate-400"
                                }
                              >
                                {err ? `오류 ${d.errorCode}` : ok ? "정상" : "미연결"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="px-1 text-[11px] text-slate-400">
                  MQTT {snap.host}:1883 · Portal {snap.portalId ?? "—"} · Modbus TCP {snap.host}:502
                </p>
              </Section>

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
