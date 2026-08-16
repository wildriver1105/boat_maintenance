// 항해 계기 패널 — SeaTalkng/NMEA2000 버스에 무엇이 붙어 있고 무엇을 보내는지.
//
// N2K 는 주소(src)가 곧 기기다. 그래서 기기별로 접어 보여주고, 그 기기가 보내는
// 데이터 종류와 마지막 값을 함께 둔다. "값이 안 보인다"는 상황에서 원인이
// 게이트웨이인지, 버스인지, 특정 계기인지 구분되도록 세 층을 따로 표시한다.
"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_MS = 2000;

type Device = {
  src: number;
  types: string[];
  pgns: number[];
  values: Record<string, Record<string, unknown>>;
  live: boolean;
  lastSeen: number;
  count: number;
};

type Status = {
  connected: boolean;
  gateway: string | null;
  busActive: boolean;
  rxFrames: number | null;
  rxMissed: number | null;
  rxErr: number | null;
  upSec: number | null;
  endpoint: string;
  error: string | null;
  pgnsSeen: number[];
  devices: Device[];
  names: Record<string, string>;
};

/** 데이터 종류 → 사람이 읽는 이름 + 표시 형식 */
const TYPE_META: Record<
  string,
  { label: string; fmt: (v: Record<string, unknown>) => string }
> = {
  heading: { label: "선수방위", fmt: (v) => `${num(v.heading_deg)}° ${v.ref === "Magnetic" ? "(자침)" : ""}` },
  rot: { label: "선회율", fmt: (v) => `${num(v.rot_degmin)}°/분` },
  attitude: { label: "자세", fmt: (v) => `힐 ${num(v.roll_deg)}° · 트림 ${num(v.pitch_deg)}° · 방위 ${num(v.yaw_deg)}°` },
  position: { label: "위치", fmt: (v) => `${num(v.lat, 6)}, ${num(v.lon, 6)}` },
  cogsog: { label: "대지침로/속력", fmt: (v) => `${num(v.cog_deg)}° · ${num(v.sog_kn, 2)} kn` },
  gnss: { label: "GNSS", fmt: (v) => `고도 ${num(v.alt_m, 1)} m · ${v.sys ?? ""}` },
  sats: { label: "위성", fmt: (v) => `${num(v.view, 0)}개 관측` },
  dops: { label: "정밀도", fmt: (v) => `HDOP ${num(v.hdop, 2)}` },
  systime: { label: "시각", fmt: () => "GPS 시각" },
  wind: { label: "바람", fmt: (v) => `${num(v.speed_kn, 1)} kn · ${num(v.angle_deg, 1)}° ${v.ref === "Apparent" ? "(체감)" : "(진)"}` },
  stw: { label: "대수속력", fmt: (v) => `${num(v.stw_kn, 2)} kn` },
  log: { label: "항적거리", fmt: (v) => `${num(Number(v.log_m) / 1852, 1)} NM` },
  env: { label: "수온", fmt: (v) => `${num(v.water_c, 1)} °C` },
  temp: { label: "온도", fmt: (v) => `${num(v.temp_c, 1)} °C` },
};

function num(v: unknown, digits = 1): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";
}

/**
 * 기기 이름은 버스가 알려주지 않는다. 보내는 데이터로 추정할 수는 있지만 추정은
 * 틀릴 수 있어서(같은 heading 을 EV-1 도, ACU 도 보낸다) **추정임을 표시**하고
 * 사람이 지정한 이름이 있으면 그걸 쓴다.
 */
function guessName(d: Device): string {
  const t = new Set(d.types);
  if (t.has("position") || t.has("gnss")) return "GPS 수신기";
  if (t.has("attitude") || t.has("heading")) return "방위·자세 센서";
  if (t.has("wind")) return "풍향풍속계";
  if (t.has("stw") || t.has("log")) return "속도·수온 센서";
  return "미상 기기";
}

export default function SeatalkPanel({ onClose }: { onClose: () => void }) {
  const [st, setSt] = useState<Status | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/seatalk", { cache: "no-store" });
    if (r.ok) setSt(await r.json());
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const saveName = async (src: number) => {
    const name = draft;
    setEditing(null);
    await fetch("/api/seatalk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src, name }),
    });
    await load();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 왜 값이 없는지 — 세 층 중 어디서 끊겼는지 한 줄로 말한다
  const trouble = !st
    ? null
    : !st.connected
      ? "게이트웨이에 접속하지 못했습니다 — ESP32 전원과 WiFi를 확인하세요."
      : !st.busActive
        ? "게이트웨이는 살아 있지만 버스에 프레임이 흐르지 않습니다 — 계기 전원·통신 설정을 확인하세요."
        : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-6 w-full max-w-3xl rounded-2xl bg-white/95 p-5 shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">🧭 항해 계기 (SeaTalkng / NMEA 2000)</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {st?.endpoint ?? "…"} · 게이트웨이가 버스를 수신만 합니다 (제어 불가)
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 3층 상태 — 소켓 / 게이트웨이 / 버스 */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Tile label="게이트웨이 접속" ok={st?.connected ?? false} text={st?.connected ? "연결됨" : "끊김"} />
          <Tile label="CAN 컨트롤러" ok={st?.gateway === "running"} text={st?.gateway ?? "—"} />
          <Tile
            label="버스 트래픽"
            ok={st?.busActive ?? false}
            text={st?.busActive ? "수신 중" : "조용함"}
            sub={st?.rxFrames != null ? `${st.rxFrames.toLocaleString()} 프레임` : undefined}
          />
        </div>

        {trouble && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">▲ {trouble}</p>
        )}
        {st?.error && <p className="mt-2 text-xs text-red-500">{st.error}</p>}

        {/* 기기별 — 어떤 주소가 무엇을 보내는가 */}
        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          버스 기기 {st ? `(${st.devices.length}대)` : ""}
        </h3>
        <div className="mt-2 space-y-2">
          {st?.devices.map((d) => (
            <div key={d.src} className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${d.live ? "bg-emerald-500" : "bg-slate-300"}`}
                  aria-hidden
                />
                {editing === d.src ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void saveName(d.src)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveName(d.src);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    placeholder="예: 오토파일럿 ACU"
                    className="rounded-lg border border-sky-400 px-2 py-0.5 text-sm text-slate-800 outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditing(d.src);
                      setDraft(st?.names?.[String(d.src)] ?? "");
                    }}
                    title="이름 지정"
                    className="text-sm font-medium text-slate-800 hover:text-sky-600"
                  >
                    {st?.names?.[String(d.src)] ?? guessName(d)}{" "}
                    <span className="text-xs text-slate-300">✎</span>
                  </button>
                )}
                {!st?.names?.[String(d.src)] && (
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    추정
                  </span>
                )}
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                  src {d.src}
                </span>
                <span className="text-[11px] text-slate-400">
                  {d.live ? `${d.count.toLocaleString()}건 수신` : "응답 없음"}
                </span>
              </div>

              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {d.types.map((t) => {
                  const meta = TYPE_META[t];
                  return (
                    <div key={t} className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1">
                      <dt className="text-[11px] text-slate-500">{meta?.label ?? t}</dt>
                      <dd className="text-xs font-medium tabular-nums text-slate-700">
                        {meta ? meta.fmt(d.values[t]) : "값 있음"}
                      </dd>
                    </div>
                  );
                })}
              </dl>

              <p className="mt-1.5 font-mono text-[10px] text-slate-300">
                PGN {d.pgns.join(", ")}
              </p>
            </div>
          ))}
          {st && st.devices.length === 0 && (
            <p className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-400">
              아직 어떤 기기도 관측되지 않았습니다.
            </p>
          )}
        </div>

        {/* 디코딩하지 않는 PGN 도 숨기지 않는다 — 버스에 무엇이 더 있는지가 정보다 */}
        {st && st.pgnsSeen.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-600">
              버스에서 관측된 전체 PGN {st.pgnsSeen.length}종 (해석하지 않는 것 포함)
            </summary>
            <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-slate-400">
              {st.pgnsSeen.join(", ")}
            </p>
          </details>
        )}
      </div>
    </div>
  );
}

function Tile({ label, ok, text, sub }: { label: string; ok: boolean; text: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-3 text-center ring-1 ring-black/5">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${ok ? "text-emerald-600" : "text-slate-400"}`}>
        {ok ? "✓" : "–"} {text}
      </div>
      {sub && <div className="text-[10px] tabular-nums text-slate-400">{sub}</div>}
    </div>
  );
}
