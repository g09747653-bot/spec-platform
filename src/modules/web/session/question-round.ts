/**
 * The view model an MCQ card renders (task 34).
 *
 * `web` may not import `agents` (constitution A1 — the allowed-edge table), so the card does not
 * consume `QuestionSetSchema` directly: the server page projects the validated set into this
 * shape and hands it over as props. One canonical schema on the write side, one view model on the
 * render side, and an explicit mapping between them in the page — layering, not duplication.
 */
export interface RoundOptionModel {
  id: string;
  label: string;
  description?: string | undefined;
}

export interface RoundQuestionModel {
  id: string;
  text: string;
  type: 'single' | 'multiple';
  options: readonly RoundOptionModel[];
  /** Always true on a validated set (FR-005 AC-3); carried so the card renders from data. */
  allowOther: boolean;
}

export interface QuestionRoundModel {
  roundId: string;
  roundNumber: number;
  stage: string;
  questions: readonly RoundQuestionModel[];
}
