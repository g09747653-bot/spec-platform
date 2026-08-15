import type { SpecType } from '@/modules/specs/model/spec-files';
import type { SectionList } from '@/modules/specs/validate-structure';
import type { Stage, Substage } from '@/modules/workflow/model/stages';

import type { VendoredTemplateId } from '../templates/vendored';

/**
 * A methodology is a *configuration* of the workflow graph (task 116; Эталон §1.4; А-2).
 *
 * **What a methodology may change, and what it may not.** The seven canonical states of constitution
 * A2 — `interview`, the four spec stages, `quality`, `complete` — are the machine's alphabet, and no
 * configuration adds a letter to it. The database stores those names, the gates are written over
 * them, and the exhaustive matrix of task 30 enumerates them. What a configuration supplies is
 * everything *around* the alphabet: which of those positions its graph visits, what each one is
 * called to the user, which document it produces and under what file name, which vendored template
 * scaffolds it, and what its round and revision budgets are.
 *
 * That division is the whole reason five methodologies cost one snapshot test rather than a
 * migration. SpecKit's «Specify» and OpenSpec's «Specs» are both the third position of a five-step
 * graph that ends in a terminal; they differ in name, in template and in exported file name, and in
 * nothing the state machine can observe. Modelling them as new stage names would have bought a
 * larger `STAGES` union, a wider CHECK constraint, and a stage→spec-type map anyway — because the
 * file vocabulary stays closed at five either way (constitution P3, DR-4).
 *
 * **Steps are not stages.** The reference product's header renders numbered steps, and the Edit
 * workflow's three steps (Reference → Describe → Review) live inside two canonical positions: the
 * grounding pick, then one stage whose `collect` is «Describe» and whose `generate`/`review` are
 * «Review». So a config declares steps, each covering a position or a named part of one, and the
 * graph is derived from the stages those steps land on.
 */

/** Which surface a methodology belongs to — the reference product's two chat classes (Эталон §1.4). */
export const CHAT_CLASSES = ['generate', 'edit'] as const;

export type ChatClass = (typeof CHAT_CLASSES)[number];

/**
 * The three parts of the badge, kept apart so the surface renders «MySpec · Greenfield · V1» from
 * data rather than from a string a component happens to hold (task 117 AC-4).
 */
export interface MethodologyBadge {
  vendor: string;
  flavour: string;
  version: string;
}

/**
 * How a document's structure is decided.
 *
 * `parity` means "the section schema decides" — the single source of structural truth of
 * constitution P3, reached through its two sanctioned consumers and never restated here. The MySpec
 * methodologies use it, so the parity path is not merely preserved but is literally the same code.
 *
 * `declared` carries the stable headings of a vendored upstream template. Those are different
 * strings from the baseline's, which is why declaring them is not the duplication P3 forbids — and
 * why the lint rule that guards the baseline still fires if anyone copies a baseline heading here.
 *
 * `free` is the honest answer where an upstream template prescribes no fixed headings at all —
 * OpenSpec's `tasks.md` is a numbered list of task groups whose names are the change's, not the
 * methodology's. Inventing a heading list for it would be exactly the "пересказ по памяти" task 116
 * forbids, so the document gets the template as its shape and no structural assertion.
 */
export type DocumentStructure =
  { kind: 'parity' } | { kind: 'declared'; sections: SectionList } | { kind: 'free' };

export interface StageDocument {
  /**
   * The storage slot (DR-4). Closed at five names by database constraint, and deliberately not
   * widened: what the user downloads is `fileName`, and the column is an internal address.
   */
  specType: SpecType;
  /** What the file is called in the export. `plan.md` for SpecKit's Plan, `spec.md` for its Specify. */
  fileName: string;
  structure: DocumentStructure;
  /** The vendored scaffold shown to the writer, or `null` for the MySpec methodologies. */
  templateId: VendoredTemplateId | null;
}

export interface MethodologyStage {
  /** The canonical position this stage occupies. */
  position: Stage;
  /** The document it produces, or `null` for a stage that only collects (interview) or edits. */
  document: StageDocument | null;
  /**
   * Question rounds this stage may ask, or `null` to take the configured default
   * (`MAX_ROUNDS_PER_STAGE`). A per-stage number is how a short brownfield graph asks less without
   * changing the environment for every session (FR-005 AC-10).
   */
  roundBudget: number | null;
  /** `request_changes` decisions this stage's review may take, or `null` for the configured default. */
  revisionBudget: number | null;
  /**
   * Whether the session may reach its terminal without visiting this stage.
   *
   * Optionality is a property of the graph, not of a flag: an optional stage's predecessor carries
   * both a row into it and a row to the terminal, and the user picks at the review gate like every
   * other advance (constitution P2). The Quality stage keeps its own composite gates, because its
   * optionality also involves a registered capability (A6) — which no other optional stage has.
   */
  optional: boolean;
}

/**
 * One numbered step in the header.
 *
 * `substages` narrows a step to part of a stage; `null` means the whole stage. Only the Edit
 * workflow needs the narrowing, and it needs it because its three steps are the reference product's
 * three steps.
 */
export interface MethodologyStep {
  label: string;
  stage: Stage;
  substages: readonly Substage[] | null;
}

export interface MethodologyConfig {
  id: string;
  /** The full name, as the picker lists it: «SpecKit generate-greenfield v1». */
  name: string;
  badge: MethodologyBadge;
  chatClass: ChatClass;
  /** One-line description for the picker. */
  summary: string;
  /** The stages of the graph, in forward order, terminal last. */
  stages: readonly MethodologyStage[];
  /** The numbered steps of the header, in order. */
  steps: readonly MethodologyStep[];
}

/** The stage entry for `position`, or `undefined` when the graph does not visit it. */
export function stageOf(config: MethodologyConfig, position: Stage): MethodologyStage | undefined {
  return config.stages.find((stage) => stage.position === position);
}

/** The documents a session must have approved before its terminal is reachable. */
export function requiredDocumentStages(config: MethodologyConfig): Stage[] {
  return config.stages
    .filter((stage) => !stage.optional && stage.document !== null)
    .map((stage) => stage.position);
}

/** Every file name this methodology's bundle may contain, in graph order (task 117). */
export function bundleFileNames(config: MethodologyConfig): string[] {
  return config.stages.flatMap((stage) =>
    stage.document === null ? [] : [stage.document.fileName],
  );
}

/** The document produced at `position`, or `null`. */
export function documentAt(config: MethodologyConfig, position: Stage): StageDocument | null {
  return stageOf(config, position)?.document ?? null;
}
