// 프로시저(체크리스트) 모드 도메인 타입.
// 임의 개수의 체크리스트(템플릿)를 id 로 관리하고, 각 실행(run)에서 항목을
// 누가 언제 체크/완료했는지 기록해 책임 추적(감사)이 가능하게 한다.

export interface ChecklistItem {
  id: string;
  label: string;
  detail?: string;
  /** 연결된 장비 id (있으면 실시간 상태를 함께 표시) */
  deviceId?: string;
  /** 완료 처리에 필수인 항목 */
  required?: boolean;
}

export interface ProcedureTemplate {
  id: string;
  title: string;
  /** 분류 라벨 (예: "승선 · 정박") */
  category?: string;
  icon?: string;
  color?: string;
  /** 정렬 순서 */
  order?: number;
  items: ChecklistItem[];
}

/**
 * 항목 체크 상태:
 *  pending = 점검 중(노랑) — 누군가 확인하는 중, 동시 취소 방지
 *  ok      = 정상(초록)
 *  problem = 문제 있음(빨강)
 */
export type CheckStatus = "pending" | "ok" | "problem";

/** 한 항목의 체크 기록 — checkedBy/At 는 서버가 세션 기준으로 기록(위조 불가) */
export interface CheckRecord {
  itemId: string;
  status: CheckStatus;
  checkedBy: string;
  checkedByName: string;
  checkedAt: string; // ISO
  note?: string;
}

/** 절차 1회 수행(실행) 인스턴스 = 실행 완료 로그 */
export interface ProcedureRun {
  id: string;
  templateId: string;
  title: string;
  category?: string;
  startedBy: string;
  startedByName: string;
  startedAt: string; // ISO
  completedAt?: string; // ISO
  completedBy?: string;
  completedByName?: string;
  checks: CheckRecord[];
}

export const DEFAULT_COLOR = "#0ea5e9";
