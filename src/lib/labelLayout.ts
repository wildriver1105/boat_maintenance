// 라벨 자동 배치 — 레퍼런스 도면처럼 라벨을 상/하단 여백에 두고 리더 라인으로 연결.
// 상반부(y<425) 기기는 상단 라벨, 하반부는 하단 라벨. x 순 정렬 후 최소 간격 확보.
// device.labelOffset 이 있으면 수동 위치를 우선 사용.
import type { Device } from "@/lib/types";

export type LabelAnchor = { x: number; y: number };

const MIN_GAP = 150; // 라벨 간 최소 가로 간격 (viewBox 단위)
const X_MIN = 90;
const X_MAX = 1910;

function placeRow(
  list: Device[],
  yLevels: number[],
  out: Record<string, LabelAnchor>,
) {
  const sorted = [...list].sort((a, b) => a.position.x - b.position.x);
  let lastX = -Infinity;
  sorted.forEach((d, i) => {
    let x = Math.max(d.position.x, lastX + MIN_GAP);
    x = Math.min(Math.max(x, X_MIN), X_MAX);
    lastX = x;
    out[d.id] = { x, y: yLevels[i % yLevels.length] };
  });
}

export function layoutLabels(devices: Device[]): Record<string, LabelAnchor> {
  const out: Record<string, LabelAnchor> = {};

  const explicit = devices.filter((d) => d.labelOffset);
  const auto = devices.filter((d) => !d.labelOffset);

  placeRow(
    auto.filter((d) => d.position.y < 425),
    [70, 114],
    out,
  );
  placeRow(
    auto.filter((d) => d.position.y >= 425),
    [742, 790], // 하단 여백: status 라인(+40)이 viewBox(850) 안에 들어오도록
    out,
  );

  for (const d of explicit) {
    out[d.id] = {
      x: d.position.x + d.labelOffset!.dx,
      y: d.position.y + d.labelOffset!.dy,
    };
  }
  return out;
}
