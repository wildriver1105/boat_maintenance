// 단일 소스 선체 모델 — data/hull.json 의 스테이션 데이터에서
// 평면 외곽 / 측면 프로파일 / 3D 로프트를 모두 생성한다.
// 여기 수치를 고치면 세 뷰가 함께 바뀐다. 단위: 미터 (125px = 1m).

import hullData from "../../data/hull.json";
import { PX_PER_M } from "./units";

export interface HullStation {
  x: number; // 종방향 (m, 선수 +)
  hb: number; // 반폭 (m)
  sheer: number; // 셰어 높이 (m, 수선=0)
  bottom: number; // 선저 깊이 (m, 음수)
}

export interface HullModel {
  sternX: number;
  bowX: number;
  mastX: number;
  stations: HullStation[];
  keel: { profile: { x: number; y: number }[]; thickness: number };
  rudder: { profile: { x: number; y: number }[]; thickness: number };
}

export const HULL: HullModel = hullData as unknown as HullModel;

/* ---- 좌표 변환 (m → viewBox px) ---- */
export const xPx = (x: number) => 1000 + x * PX_PER_M;
export const zPx = (z: number) => 425 + z * PX_PER_M; // 평면 횡방향
export const yPx = (y: number) => 470 - y * PX_PER_M; // 측면 수직 (수선=470)

type Pt = { x: number; y: number };

/** Catmull-Rom 스플라인 → 큐빅 베지어 path (부드러운 곡선) */
function smoothPath(pts: Pt[], closed: boolean): string {
  if (pts.length < 2) return "";
  const P = (i: number) => {
    if (closed) return pts[(i + pts.length) % pts.length];
    return pts[Math.min(pts.length - 1, Math.max(0, i))];
  };
  const n = closed ? pts.length : pts.length - 1;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return closed ? d + " Z" : d;
}

/* ---- 평면 외곽 (top view) ---- */
export function hullTopPath(inset = 0): string {
  const st = HULL.stations;
  const upper: Pt[] = st.map((s) => ({ x: xPx(s.x), y: zPx(-(Math.max(0.02, s.hb - inset))) }));
  const lower: Pt[] = [...st].reverse().map((s) => ({ x: xPx(s.x), y: zPx(Math.max(0.02, s.hb - inset)) }));
  const stern: Pt = { x: xPx(HULL.sternX + inset), y: zPx(0) };
  const bow: Pt = { x: xPx(HULL.bowX - inset), y: zPx(0) };
  return smoothPath([stern, ...upper, bow, ...lower], true);
}

/**
 * 평면 뷰에서 주어진 x(px)의 선체 가장자리 y(px) — 위쪽/아래쪽.
 * 라벨을 선 밖에 놓을 때 쓴다. 선체 폭은 x 마다 다르므로 고정 밴드를 쓰면
 * 중앙부(가장 넓은 곳)에서 라벨이 배 안으로 들어간다.
 * 범위를 벗어난 x 는 가장 가까운 스테이션으로 갈음한다.
 */
export function hullEdgeYPx(xPixels: number): { top: number; bottom: number } {
  const st = HULL.stations;
  const xm = (xPixels - 1000) / PX_PER_M; // px → m
  let hb = st[0].hb;
  if (xm <= st[0].x) hb = st[0].hb;
  else if (xm >= st[st.length - 1].x) hb = st[st.length - 1].hb;
  else {
    for (let i = 1; i < st.length; i++) {
      if (xm <= st[i].x) {
        const a = st[i - 1], b = st[i];
        const t = (xm - a.x) / Math.max(1e-6, b.x - a.x);
        hb = a.hb + (b.hb - a.hb) * t;
        break;
      }
    }
  }
  return { top: zPx(-hb), bottom: zPx(hb) };
}

/* ---- 측면 프로파일 (side view) ---- */
export function hullSidePath(): string {
  const st = HULL.stations;
  const sheer: Pt[] = st.map((s) => ({ x: xPx(s.x), y: yPx(s.sheer) }));
  const stemMid: Pt = { x: xPx(HULL.bowX - 0.06), y: yPx(0.72) };
  // 선저는 실측 범위(x ≥ -6.1)만 — 그 뒤는 경사 트랜섬(Z 클로즈)으로 잇는다
  const bottomBack: Pt[] = [...st]
    .filter((s) => s.x >= -6.12)
    .reverse()
    .map((s) => ({ x: xPx(s.x), y: yPx(s.bottom) }));
  return smoothPath([...sheer, stemMid, ...bottomBack], true);
}

/** 킬/러더 프로파일 — 급한 코너가 있어 스무딩 없이 직선 폴리곤으로 */
function profilePath(profile: { x: number; y: number }[]): string {
  const pts = profile.map((p) => `${xPx(p.x).toFixed(1)},${yPx(p.y).toFixed(1)}`);
  return `M${pts.join(" L")} Z`;
}
export const keelSidePath = () => profilePath(HULL.keel.profile);
export const rudderSidePath = () => profilePath(HULL.rudder.profile);
