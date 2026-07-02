// 라벨 자동 배치 — 레퍼런스 도면처럼 라벨을 상/하단 여백에 두고 리더 라인으로 연결.
// 상반부(y<425) 항목은 상단 라벨, 하반부는 하단 라벨. x 순 정렬 후 최소 간격 확보.
// labelOffset 이 있으면 수동 위치를 우선 사용.
// 평면/측면 뷰 모두에서 재사용할 수 있도록 (id, x, y) 항목을 받는다.

export type LabelAnchor = { x: number; y: number };

export type LabelItem = {
  id: string;
  x: number;
  y: number;
  labelOffset?: { dx: number; dy: number };
};

const MIN_GAP = 125; // 라벨 간 최소 가로 간격 (viewBox 단위, 상/하 레벨 교차 기준)
const X_MIN = 90;
const X_MAX = 1910;

function placeRow(
  list: LabelItem[],
  yLevels: number[],
  out: Record<string, LabelAnchor>,
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
    out[d.id] = { x: xs[i], y: yLevels[i % yLevels.length] };
  });
}

export function layoutLabels(items: LabelItem[]): Record<string, LabelAnchor> {
  const out: Record<string, LabelAnchor> = {};

  const explicit = items.filter((d) => d.labelOffset);
  const auto = items.filter((d) => !d.labelOffset);

  placeRow(
    auto.filter((d) => d.y < 425),
    [70, 114],
    out,
  );
  placeRow(
    auto.filter((d) => d.y >= 425),
    [742, 790], // 하단 여백: status 라인(+40)이 viewBox(850) 안에 들어오도록
    out,
  );

  for (const d of explicit) {
    out[d.id] = { x: d.x + d.labelOffset!.dx, y: d.y + d.labelOffset!.dy };
  }
  return out;
}
