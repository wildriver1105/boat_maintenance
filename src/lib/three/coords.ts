// 2D 도면 좌표 → 3D 월드 좌표 매핑 + 섹션(구획) 정의.
//
// ★ 단위 통일: 3D 월드 1 유닛 = 1 미터 (2D 는 125 px = 1 m, src/lib/units.ts)
//   X(종방향) = (position.x - 1000) / 125   … 선수(+X) / 선미(-X), 0 = 도면 x=1000
//   Y(수직)   = (470 - sideY) / 125         … 470 = 수선(waterline), 위가 +
//   Z(횡방향) = (position.y - 425) / 125    … 425 = 중심선, 좌현(top)이 -Z
// 선체 형상도 같은 단위의 data/hull.json 에서 생성되므로 2D·3D·실측이 일치한다.

import { PX_PER_M } from "@/lib/units";
import type { Device } from "@/lib/types";

export const WATERLINE_2D = 470;
export const SIDE_DEFAULT_Y = 430;

export function toWorld(d: Device): [number, number, number] {
  const x = (d.position.x - 1000) / PX_PER_M;
  const y = (WATERLINE_2D - (d.sideY ?? SIDE_DEFAULT_Y)) / PX_PER_M;
  const z = (d.position.y - 425) / PX_PER_M;
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
  /** 종방향 클리핑 범위(월드 X, m). 있으면 이 구간만 도려내 보여준다(돌하우스 컷) */
  range?: [number, number];
}

export const SECTIONS: Section[] = [
  {
    key: "overview",
    label: "오버뷰",
    camera: { position: [9, 6.5, 11], target: [0.3, 0.4, 0] },
    interior: false,
  },
  {
    key: "bow",
    label: "뱃머리",
    camera: { position: [10.4, 3.0, 4.6], target: [6.3, 0.6, 0] },
    interior: false,
  },
  {
    key: "owner",
    label: "오너 선실",
    camera: { position: [6.0, 3.1, 4.2], target: [3.85, -0.15, 0] },
    interior: true,
    range: [1.9, 7.5],
  },
  {
    key: "saloon",
    label: "살롱",
    camera: { position: [2.4, 3.4, 4.3], target: [0.57, -0.15, 0] },
    interior: true,
    range: [-0.82, 1.93],
  },
  {
    key: "galley",
    label: "갤리/헤드",
    camera: { position: [-0.75, 3.3, 4.3], target: [-2.2, -0.15, 0] },
    interior: true,
    range: [-3.61, -0.78],
  },
  {
    key: "aft",
    label: "후방 선실",
    camera: { position: [-3.2, 2.9, 4.2], target: [-5.1, -0.1, 0] },
    interior: true,
    range: [-6.98, -3.61],
  },
  {
    key: "cockpit",
    label: "콕핏/스턴",
    camera: { position: [-8.6, 3.9, 4.9], target: [-4.4, 0.7, 0] },
    interior: false,
  },
];
