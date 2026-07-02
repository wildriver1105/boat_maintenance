// 2D 도면 좌표 → 3D 월드 좌표 매핑 + 섹션(구획) 정의.
//
// 2D viewBox(0 0 2000 850)의 세 축이 3D의 3축이 된다:
//   X(종방향) = (position.x - 1000) / 100      … 선수(+X, 오른쪽) / 선미(-X)
//   Y(수직)   = (470 - sideY) / 100            … 470 = 수선(waterline), 위가 +
//   Z(횡방향) = (position.y - 425) / 100 * 0.85 … 425 = 중심선, 좌현(top)이 -Z
// 단위는 대략 미터 스케일 (선체 길이 ≈ 16).

import type { Device } from "@/lib/types";

export const WATERLINE_2D = 470;
export const SIDE_DEFAULT_Y = 430;

export function toWorld(d: Device): [number, number, number] {
  const x = (d.position.x - 1000) / 100;
  const y = (WATERLINE_2D - (d.sideY ?? SIDE_DEFAULT_Y)) / 100;
  const z = ((d.position.y - 425) / 100) * 0.85;
  return [x, y, z];
}

export type SectionKey =
  | "overview"
  | "bow"
  | "owner"
  | "saloon"
  | "galley"
  | "aft"
  | "cockpit";

export interface Section {
  key: SectionKey;
  label: string;
  /** 카메라 목적지 */
  camera: { position: [number, number, number]; target: [number, number, number] };
  /** true 면 데크/외장을 페이드시켜 내부를 보여준다 */
  interior: boolean;
  /** 종방향 클리핑 범위(월드 X). 있으면 이 구간만 도려내 보여준다(돌하우스 컷) */
  range?: [number, number];
}

export const SECTIONS: Section[] = [
  {
    key: "overview",
    label: "오버뷰",
    camera: { position: [11, 7.5, 13], target: [0.3, 0.4, 0] },
    interior: false,
  },
  {
    key: "bow",
    label: "뱃머리",
    camera: { position: [12.5, 3.4, 5], target: [7.6, 0.6, 0] },
    interior: false,
  },
  {
    key: "owner",
    label: "오너 선실",
    camera: { position: [8.2, 4.2, 5.6], target: [4.6, -0.1, 0] },
    interior: true,
    range: [2.3, 7.9],
  },
  {
    key: "saloon",
    label: "살롱",
    camera: { position: [3.2, 4.6, 5.8], target: [0.7, -0.1, 0] },
    interior: true,
    range: [-1.0, 2.35],
  },
  {
    key: "galley",
    label: "갤리/헤드",
    camera: { position: [-0.6, 4.4, 5.8], target: [-2.7, -0.1, 0] },
    interior: true,
    range: [-4.4, -0.95],
  },
  {
    key: "aft",
    label: "후방 선실",
    camera: { position: [-3.4, 3.8, 5.6], target: [-6.1, -0.1, 0] },
    interior: true,
    range: [-8.5, -4.4],
  },
  {
    key: "cockpit",
    label: "콕핏/스턴",
    camera: { position: [-10.5, 4.2, 5.2], target: [-5.4, 0.7, 0] },
    interior: false,
  },
];
