// 사용자 도형(에셋) 모델 — 편집 도구로 그린 도형을 뷰별로 저장하고,
// 평면(top) 도형은 3D 뷰에서 압출(extrude)되어 함께 표시된다.
//
// 좌표계: 2D viewBox 0 0 2000 850 (선수=오른쪽, 상단=좌현).
// 좌현(port) 뷰에서 그린 도형도 "정규 좌표"(미러 해제된 x)로 저장한다.

export type ShapeView = "top" | "port" | "starboard";
export type ShapeKind = "rect" | "ellipse" | "line" | "polygon" | "path";

export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  /** "none" 이면 채움 없음 */
  fill: string;
  fillOpacity: number;
  dash?: boolean;
}

export interface PlanShape {
  id: string;
  view: ShapeView;
  kind: ShapeKind;
  name?: string;
  /** rect: 좌상단 + 크기 */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** ellipse: 중심 + 반지름 */
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  /** line(2) / polygon / path(자유곡선) */
  points?: { x: number; y: number }[];
  style: ShapeStyle;
  /** ---- 3D (top 뷰 도형만) : 압출 파라미터 ---- */
  /** 3D 뷰 표시 여부 (기본 true) */
  show3d?: boolean;
  /** 압출 높이 (미터, 기본 0.5) */
  height3d?: number;
  /** 바닥 고도 (미터, 수선=0, 솔≈-0.3, 데크≈1.0) */
  elevation3d?: number;
}

export const DEFAULT_STYLE: ShapeStyle = {
  stroke: "#475569",
  strokeWidth: 3,
  fill: "#e2e8f0",
  fillOpacity: 0.6,
};

export const PALETTE = [
  "#475569", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
];
