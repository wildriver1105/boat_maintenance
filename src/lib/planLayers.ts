// 내장 도면 레이어 가시성 — 기존 평면도/측면도/3D 의 구성 요소를 켜고 끌 수 있게 한다.
// (클라이언트 안전: 상수/타입만. 저장은 planLayersStore.ts / API 사용)

export interface PlanLayersConfig {
  top: Record<string, boolean>;
  side: Record<string, boolean>;
  three: Record<string, boolean>;
}

/** 각 뷰의 레이어 키와 한국어 라벨 */
export const LAYER_LABELS: Record<keyof PlanLayersConfig, { key: string; label: string }[]> = {
  top: [
    { key: "sole", label: "바닥(플랭크)" },
    { key: "zones", label: "구역 경계" },
    { key: "bulkheads", label: "격벽·문" },
    { key: "furniture", label: "가구" },
    { key: "portlights", label: "현창" },
  ],
  side: [
    { key: "rigging", label: "리깅(마스트·스테이)" },
    { key: "deck", label: "데크 구조물" },
    { key: "interior", label: "내부 단면" },
    { key: "labels", label: "구획 라벨" },
  ],
  three: [
    { key: "exterior", label: "외장(데크·리깅)" },
    { key: "interior", label: "내부 가구" },
    { key: "water", label: "물" },
  ],
};

export const DEFAULT_LAYERS: PlanLayersConfig = {
  top: { sole: true, zones: true, bulkheads: true, furniture: true, portlights: true },
  side: { rigging: true, deck: true, interior: true, labels: true },
  three: { exterior: true, interior: true, water: true },
};

/** 레이어 값 조회 (미정의시 true) */
export function layerOn(cfg: Record<string, boolean> | undefined, key: string): boolean {
  return cfg?.[key] !== false;
}
