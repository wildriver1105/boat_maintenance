// 실측 단위 변환 — 도면(viewBox px) ↔ 미터.
//
// 캘리브레이션: Oceanis Clipper 473 실측 (선체 길이 14.30 m, 빔 4.46 m)
//   도면 선체 길이 = 1785 px (x 150→1935)  → 1785/14.30 ≈ 124.8
//   도면 빔        =  550 px (y 150→700)   →  550/4.46  ≈ 123.3
// → 125 px = 1 m 로 통일 (길이·빔 모두 ±1% 이내)

export const PX_PER_M = 125;

export const pxToM = (px: number): number => px / PX_PER_M;
export const mToPx = (m: number): number => m * PX_PER_M;

/** 사람이 읽는 길이 문자열: 1 m 이상은 m(소수 2자리), 미만은 cm */
export function fmtM(px: number): string {
  const m = Math.abs(px) / PX_PER_M;
  return m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 100)} cm`;
}

/** 두 점 사이 거리(px) */
export function distPx(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
