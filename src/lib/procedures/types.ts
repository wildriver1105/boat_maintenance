// 프로시저(체크리스트) 모드 도메인 타입.
// 항해 전/중/후 절차를 크루가 수행하고, 각 항목을 누가 언제 체크했는지 기록해
// 책임 추적(감사)이 가능하게 한다.

export type ProcedurePhase = "pre" | "during" | "post";

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
  phase: ProcedurePhase;
  title: string;
  items: ChecklistItem[];
}

/** 한 항목의 체크 기록 — checkedBy/At 는 서버가 세션 기준으로 기록(위조 불가) */
export interface CheckRecord {
  itemId: string;
  checkedBy: string;
  checkedByName: string;
  checkedAt: string; // ISO
  note?: string;
}

/** 절차 1회 수행 인스턴스 */
export interface ProcedureRun {
  id: string;
  phase: ProcedurePhase;
  title: string;
  startedBy: string;
  startedByName: string;
  startedAt: string; // ISO
  completedAt?: string; // ISO
  checks: CheckRecord[];
}

export const PHASE_META: Record<
  ProcedurePhase,
  { label: string; short: string; icon: string; color: string }
> = {
  pre: { label: "항해 전", short: "출항 준비", icon: "⚓", color: "#0ea5e9" },
  during: { label: "항해 중", short: "운항 점검", icon: "🧭", color: "#6366f1" },
  post: { label: "항해 후", short: "입항 정리", icon: "🏁", color: "#10b981" },
};

export const PHASE_ORDER: ProcedurePhase[] = ["pre", "during", "post"];
