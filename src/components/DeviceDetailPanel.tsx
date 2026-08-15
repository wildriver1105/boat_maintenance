// 선택된 디바이스 상세 패널 — 카테고리별 수치 + 편집/삭제.
// 그룹(시스템) 디바이스는 하위 기기(생태계) 목록을 표시하고, 하위 기기는 상위 시스템 링크를 표시.
"use client";

import {
  CATEGORY_META,
  STATUS_META,
  type Device,
  type DeviceReading,
} from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { detailRows, summarize } from "@/lib/format";
import { childrenOf } from "@/lib/deviceGroups";
import { bindingOf } from "@/lib/victron/binding";
import { zigbeeBindingOf } from "@/lib/zigbee/binding";
import { Meter } from "./gauges/Gauges";

/** 손을 뗀 뒤에도 이만큼은 내 값을 유지한다 (확인이 빨리 와도 깜빡이지 않게) */
const HOLD_MS = 1000;
/** 보드 확인이 끝내 안 와도 이 시간이 지나면 수신값으로 되돌아간다 */
const SETTLE_MS = 6000;
/** 끄는 중에도 계속 보내되, TCP 콘솔이 잠기지 않을 만큼만 솎아낸다 */
const SEND_DEBOUNCE_MS = 120;

/**
 * 조명 디머 — config.lighting 장비 전용.
 * 현재 밝기는 SSE 리딩(values.duty)으로 들어오고, 조절은 /api/lighting PUT.
 *
 * 전송은 끌면서 계속 한다(조명이 손을 따라와야 조절이 편하다). 막아야 하는 건
 * **수신뿐**이다 — SSE 는 최대 2초 늦으므로 조작 중에 도착한 옛 값이 그대로
 * 그려지면 노브가 손 밑에서 제자리로 튕긴다. 그래서
 *
 *   잡는 순간 → 수신 차단(전송은 계속, SEND_DEBOUNCE_MS 로 솎아서)
 *   손 뗌     → 마지막 위치를 한 번 더 확정 전송
 *   그 뒤     → 보드가 그 값을 확인해 주면 수신값에 자리를 넘긴다
 *
 * 손을 뗀 뒤에도 곧장 놓아주지 않는 이유 역시 같은 지연 때문이다. 확인이 끝내
 * 안 오면 SETTLE_MS 뒤에 수신값으로 되돌려, 어긋난 채 굳지 않게 한다.
 */
function DimmerControl({ reading }: { reading?: DeviceReading }) {
  const live = typeof reading?.values.duty === "number" ? (reading.values.duty as number) : null;
  const connected = reading?.status === "ok";
  const [local, setLocal] = useState<number | null>(null);
  const [holding, setHolding] = useState(false); // 슬라이더를 잡고 있는 동안 true
  const [err, setErr] = useState<string | null>(null);
  const localRef = useRef<number | null>(null); // 이벤트 핸들러에서 읽을 최신값
  const releasedAt = useRef(0);
  const shown = local ?? live ?? 0;

  const setBoth = (v: number | null) => {
    localRef.current = v;
    setLocal(v);
  };

  const send = useCallback(async (duty: number) => {
    releasedAt.current = Date.now();
    try {
      const r = await fetch("/api/lighting", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duty }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  // 손 뗌 감지는 창 전체에서 — 슬라이더 밖에서 놓아도 확실히 커밋된다
  useEffect(() => {
    if (!holding) return;
    const end = () => {
      setHolding(false);
      // 솎다가 흘린 마지막 위치가 있을 수 있으므로 여기서 한 번 확정한다
      if (sendTimer.current) clearTimeout(sendTimer.current);
      if (localRef.current != null) void send(localRef.current);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("touchend", end);
    };
  }, [holding, send]);

  // 인계 — 조작이 끝났고 보드가 값을 확인했으면 수신값에 자리를 넘긴다
  useEffect(() => {
    if (local == null || holding) return;
    const elapsed = Date.now() - releasedAt.current;
    const wait = live === local ? HOLD_MS - elapsed : SETTLE_MS - elapsed;
    const t = setTimeout(() => setBoth(null), Math.max(0, wait));
    return () => clearTimeout(t);
  }, [local, live, holding]);

  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 버튼 — 지연 없이 즉시 */
  const putNow = (duty: number) => {
    if (sendTimer.current) clearTimeout(sendTimer.current);
    setBoth(duty);
    void send(duty);
  };

  /** 슬라이더/키보드 — 화면은 즉시, 전송은 솎아서 (끄는 동안에도 계속 보낸다) */
  const onSlide = (duty: number) => {
    setBoth(duty);
    if (sendTimer.current) clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => void send(duty), SEND_DEBOUNCE_MS);
  };

  return (
    <div className="mt-4 rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">밝기</span>
        <span className="text-sm font-semibold tabular-nums text-slate-800">
          {connected ? `${shown}%` : "미연결"}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={shown}
        disabled={!connected}
        onPointerDown={() => setHolding(true)}
        onChange={(e) => onSlide(Number(e.target.value))}
        className="mt-2 w-full accent-amber-500 disabled:opacity-40"
        aria-label="조명 밝기"
      />
      <div className="mt-2 flex gap-2">
        {[
          ["끄기", 0],
          ["은은하게", 20],
          ["보통", 60],
          ["켜기", 100],
        ].map(([label, duty]) => (
          <button
            key={label as string}
            onClick={() => putNow(duty as number)}
            disabled={!connected}
            className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
      {!connected && (
        <p className="mt-2 text-[11px] text-slate-400">
          ESP32 디머가 응답하지 않습니다 — 조명 전원과 WiFi 연결을 확인하세요.
        </p>
      )}
      {err && <p className="mt-2 text-[11px] text-red-500">{err}</p>}
    </div>
  );
}

/**
 * 스마트플러그 스위치 — config.zigbee 장비 전용.
 *
 * 디머와 달리 **낙관적 표시를 하지 않는다.** 콘센트는 무엇이 물려 있는지에 따라
 * 잘못된 표시의 대가가 크다(냉장고가 꺼졌는데 켜졌다고 보이는 상황). 그래서
 * 요청을 보낸 뒤 "전환 중"만 표시하고, 실제 상태는 기기가 되돌려주는 리딩으로만
 * 바꾼다. 응답이 늦으면 TOGGLE_TIMEOUT_MS 뒤 대기 표시를 거둔다.
 */
const TOGGLE_TIMEOUT_MS = 8000;

function OutletSwitch({ device, reading }: { device: Device; reading?: DeviceReading }) {
  const on = typeof reading?.values.on === "boolean" ? (reading.values.on as boolean) : null;
  const live = reading?.status === "ok" || reading?.status === "warning";
  const [pending, setPending] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 기기가 요청한 상태를 확인해 주면 대기 해제
  useEffect(() => {
    if (pending == null) return;
    if (on === pending) {
      setPending(null);
      return;
    }
    const t = setTimeout(() => setPending(null), TOGGLE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pending, on]);

  const send = async (next: boolean) => {
    setPending(next);
    setErr(null);
    try {
      const r = await fetch("/api/zigbee", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: device.id, on: next }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    } catch (e) {
      setErr((e as Error).message);
      setPending(null);
    }
  };

  /** 스위치가 아닌 설정값(계측 전용 모드 등) 변경 */
  const sendOption = async (set: Record<string, unknown>) => {
    setErr(null);
    try {
      const r = await fetch("/api/zigbee", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: device.id, set }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const num = (k: string) =>
    typeof reading?.values[k] === "number" ? (reading.values[k] as number) : null;
  const watts = num("watts");
  const amps = num("amps");
  const kwh = num("kwh");
  const meteringOnly = reading?.values.meteringOnly === true;

  // 이 플러그가 감당하는 한계(3200W)를 기준으로 부하가 어디쯤인지 보여준다.
  // 세 자리 숫자만 보면 100W 가 큰지 작은지 판단이 안 된다.
  const LIMIT_W = 3200;
  const loadSeverity = watts == null ? "unknown" : watts > LIMIT_W * 0.9 ? "crit" : watts > LIMIT_W * 0.7 ? "warn" : "ok";

  return (
    <div className="mt-4 rounded-xl bg-white/70 p-3 ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">콘센트</span>
        <span className="text-sm font-semibold text-slate-800">
          {!live ? "미연결" : on == null ? "미수신" : on ? "켜짐" : "꺼짐"}
        </span>
      </div>

      {/* 지금 얼마나 쓰는가 — 이 패널의 대표 수치 */}
      {live && (
        <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold text-slate-800">
              {watts == null ? "—" : watts < 10 ? watts.toFixed(1) : Math.round(watts)}
            </span>
            <span className="text-sm text-slate-500">W</span>
            {amps != null && (
              <span className="ml-auto text-xs tabular-nums text-slate-400">{amps} A</span>
            )}
          </div>
          <div className="mt-1.5">
            <Meter
              label="부하 (최대 3200W)"
              valueText={watts == null ? "—" : `${Math.round((watts / LIMIT_W) * 100)}%`}
              ratio={watts == null ? null : watts / LIMIT_W}
              severity={loadSeverity}
              note={
                on === false
                  ? "꺼져 있어 전력을 쓰지 않습니다"
                  : watts === 0
                    ? "물려 있는 기기가 대기 중이거나 없습니다"
                    : undefined
              }
            />
          </div>
          {kwh != null && (
            <p className="mt-1.5 text-[11px] text-slate-400">
              누적 사용량 <span className="tabular-nums text-slate-500">{kwh} kWh</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        {[
          ["끄기", false],
          ["켜기", true],
        ].map(([label, next]) => {
          const target = next as boolean;
          const active = on === target;
          return (
            <button
              key={label as string}
              onClick={() => send(target)}
              disabled={!live || pending != null}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
                active
                  ? target
                    ? "bg-lime-600 text-white"
                    : "bg-slate-600 text-white"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {pending != null && (
        <p className="mt-2 text-[11px] text-slate-400">
          {pending ? "켜는" : "끄는"} 중 — 플러그 응답을 기다립니다…
        </p>
      )}

      {/* 계측 전용 모드 — 릴레이를 ON 으로 고정해 실수로 끄지 못하게 한다.
          제습기·냉장고처럼 꺼진 걸 모르고 지나가면 곤란한 부하용. */}
      {live && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-slate-100 pt-2.5">
          <input
            type="checkbox"
            checked={meteringOnly}
            onChange={(e) => void sendOption({ metering_only_mode: e.target.checked ? "ON" : "OFF" })}
            className="mt-0.5 h-4 w-4 accent-lime-600"
          />
          <span className="text-[11px] leading-snug text-slate-500">
            <span className="font-medium text-slate-700">끄기 잠금 (계측 전용)</span>
            <br />
            릴레이가 켜진 채 고정되어 앱·음성으로 꺼지지 않습니다. 계측은 계속됩니다.
          </span>
        </label>
      )}
      {!live && (
        <p className="mt-2 text-[11px] text-slate-400">
          플러그가 응답하지 않습니다 — Zigbee 연결과 콘센트 전원을 확인하세요.
        </p>
      )}
      {err && <p className="mt-2 text-[11px] text-red-500">{err}</p>}
    </div>
  );
}

type Props = {
  device: Device;
  reading?: DeviceReading;
  devices: Device[];
  readings: Record<string, DeviceReading>;
  onSelectDevice: (id: string) => void;
  onEdit: (d: Device) => void;
  onDelete: (id: string) => void;
  onToggleEnabled: (d: Device, enabled: boolean) => void;
  onClose: () => void;
};

export default function DeviceDetailPanel({
  device,
  reading,
  devices,
  readings,
  onSelectDevice,
  onEdit,
  onDelete,
  onToggleEnabled,
  onClose,
}: Props) {
  const cat = CATEGORY_META[device.category];
  const status = reading?.status ?? "offline";
  const children = childrenOf(devices, device.id);
  const parent = device.parentId
    ? devices.find((d) => d.id === device.parentId)
    : undefined;
  const isGroup = children.length > 0;
  const rows = isGroup ? [] : detailRows(device, reading);
  const victron = bindingOf(device);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          {parent && (
            <button
              onClick={() => onSelectDevice(parent.id)}
              className="mb-1 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
              ‹ {parent.name}
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xl">{cat.icon}</span>
            <h2 className="text-base font-semibold text-slate-800">{device.name}</h2>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: `${cat.accent}1a`, color: cat.accent }}
            >
              {cat.label}
            </span>
            {reading?.source === "victron" ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                실측 · Victron
              </span>
            ) : null}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {/* 상태 배지 */}
      <div
        className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
        style={{ background: `${STATUS_META[status].color}18`, color: STATUS_META[status].color }}
      >
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS_META[status].color }} />
        {STATUS_META[status].label}
        {isGroup && <span className="text-xs font-normal opacity-70">· {summarize(device, reading)}</span>}
        {!isGroup && !device.sensorId && (
          <span className="text-xs font-normal opacity-70">· 센서 미연결</span>
        )}
      </div>

      {/* 조명 디머 (config.lighting 장비) */}
      {device.config?.lighting === true && <DimmerControl reading={reading} />}

      {/* 스마트플러그 스위치 (config.zigbee 장비) */}
      {zigbeeBindingOf(device) && <OutletSwitch device={device} reading={reading} />}

      {/* 그룹: 구성 기기(생태계) 목록 */}
      {isGroup ? (
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            구성 기기 {children.length}
          </h3>
          <ul className="space-y-0.5">
            {children.map((c) => {
              const r = c.sensorId ? readings[c.sensorId] : undefined;
              const s = r?.status ?? "offline";
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelectDevice(c.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100/70"
                  >
                    <span className="text-sm">{CATEGORY_META[c.category].icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-700">{c.name}</span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {summarize(c, r)}
                      </span>
                    </span>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: STATUS_META[s].color }}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        /* 단일 기기: 수치 */
        <dl className="mt-4 space-y-1.5">
          {rows.length === 0 && (
            <p className="text-sm text-slate-400">표시할 값이 없습니다.</p>
          )}
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-slate-100 pb-1.5 text-sm">
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4 space-y-1 text-xs text-slate-400">
        <div>ID: {device.id}</div>
        <div>센서: {device.sensorId ?? "—"}</div>
        {victron && (
          <div>
            Victron: {victron.path}
            {victron.gxName && ` · ${victron.gxName}`}
          </div>
        )}
        <div>위치: ({device.position.x}, {device.position.y})</div>
      </div>

      {device.enabled === false && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 ring-1 ring-slate-200">
          데이터 소스가 없어 도면에서 감춰둔 장비입니다. 위치·메모는 그대로 보관 중이며,
          센서를 연결하면 다시 표시할 수 있습니다.
          <button
            onClick={() => onToggleEnabled(device, true)}
            className="mt-2 w-full rounded-lg bg-sky-600 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
          >
            도면에 표시
          </button>
        </div>
      )}

      <div className="mt-auto flex gap-2 pt-4">
        <button
          onClick={() => onEdit(device)}
          className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          편집
        </button>
        {device.enabled !== false && (
          <button
            onClick={() => onToggleEnabled(device, false)}
            title="도면에서 감춤 (삭제 아님)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            감춤
          </button>
        )}
        <button
          onClick={() => onDelete(device.id)}
          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          삭제
        </button>
      </div>
    </div>
  );
}
