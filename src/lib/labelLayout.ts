// 라벨 자동 배치 — 레퍼런스 도면처럼 라벨을 상/하단 여백에 두고 리더 라인으로 연결.
// 상반부(y<425) 항목은 상단 라벨, 하반부는 하단 라벨. x 순 정렬 후 최소 간격 확보.
// labelOffset 이 있으면 수동 위치를 우선 사용.
// 평면/측면 뷰 모두에서 재사용할 수 있도록 (id, x, y) 항목을 받는다.
//
// 평면 뷰에서는 밴드 y 를 그대로 쓰지 않고 **그 x 에서의 선체 가장자리 밖으로**
// 밀어낸다. 선체 폭이 x 마다 다르기 때문에 고정 밴드는 선수·중앙부에서 배 안으로
// 들어간다(실제로 중앙부 라벨이 선체선 위에 겹쳐 그려졌다).

export type LabelAnchor = { x: number; y: number };

export type LabelItem = {
  id: string;
  x: number;
  y: number;
  labelOffset?: { dx: number; dy: number };
};

/** 선체 가장자리에서 라벨까지 띄울 여백 (viewBox 단위) */
const HULL_CLEARANCE = 26;

const MIN_GAP = 110; // 라벨 간 최소 가로 간격 (viewBox 단위, 레벨 교차 기준)
const X_MIN = 60;
const X_MAX = 1940;

function placeRow(
  list: LabelItem[],
  yLevels: number[],
  out: Record<string, LabelAnchor>,
  /** 선체 밖으로 밀어내는 보정 (평면 뷰에서만 준다) */
  clampToHull?: (x: number, y: number) => number,
) {
  const sorted = [...list].sort((a, b) => a.x - b.x);
  const xs: number[] = [];
  // 전진 패스: 왼쪽부터 최소 간격 확보
  let lastX = -Infinity;
  for (const d of sorted) {
    const x = Math.min(Math.max(Math.max(d.x, lastX + MIN_GAP), X_MIN), X_MAX);
    xs.push(x);
    lastX = x;
  }
  // 후진 패스: 오른쪽 경계에 몰린 라벨을 왼쪽으로 재분배
  for (let i = xs.length - 2; i >= 0; i--) {
    xs[i] = Math.max(Math.min(xs[i], xs[i + 1] - MIN_GAP), X_MIN);
  }
  sorted.forEach((d, i) => {
    const y = yLevels[i % yLevels.length];
    out[d.id] = { x: xs[i], y: clampToHull ? clampToHull(xs[i], y) : y };
  });
}

export function layoutLabels(
  items: LabelItem[],
  /** 평면 뷰의 선체 가장자리 — 주면 라벨을 그 밖으로 밀어낸다 */
  hullEdge?: (x: number) => { top: number; bottom: number },
): Record<string, LabelAnchor> {
  const out: Record<string, LabelAnchor> = {};

  const explicit = items.filter((d) => d.labelOffset);
  const auto = items.filter((d) => !d.labelOffset);

  // 위쪽: 선체 상단보다 위(작은 y)로. 아래쪽: 선체 하단보다 아래(큰 y)로.
  const above = hullEdge
    ? (x: number, y: number) => Math.min(y, hullEdge(x).top - HULL_CLEARANCE)
    : undefined;
  const below = hullEdge
    ? (x: number, y: number) => Math.max(y, hullEdge(x).bottom + HULL_CLEARANCE)
    : undefined;

  placeRow(
    auto.filter((d) => d.y < 425),
    [56, 96, 136, 176], // 4레벨 교차 배치 — 장비가 많아도 겹치지 않게
    out,
    above,
  );
  placeRow(
    auto.filter((d) => d.y >= 425),
    [712, 756, 800], // 하단 여백: status 라인(+40)이 viewBox(850) 안에 들어오도록
    out,
    below,
  );

  for (const d of explicit) {
    out[d.id] = { x: d.x + d.labelOffset!.dx, y: d.y + d.labelOffset!.dy };
  }
  return out;
}
