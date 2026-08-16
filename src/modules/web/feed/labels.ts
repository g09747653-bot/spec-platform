import { methodologyConfig } from '@/modules/methodologies';
import { isSubstage, type StagePosition, type Substage } from '@/modules/workflow/model/stages';

import { stageLabel } from '../session/stage-display';

/**
 * How a position reads in a stage chip (Эталон §1.1: `Constitution · Collecting ──▶ Constitution ·
 * Generating`).
 *
 * Wording only. The vocabulary is `workflow`'s and the position is read from persisted state; what
 * is decided here is that `collect` is called *Collecting* to a person. A substage added to the model
 * without a word for it is a type error, which is the same guard `stageLabel` carries for stages.
 */
const SUBSTAGE_LABELS: Record<Substage, string> = {
  collect: 'Collecting',
  generate: 'Generating',
  review: 'Reviewing',
};

export function substageLabel(substage: string | null): string | null {
  if (substage === null) return null;

  return isSubstage(substage) ? SUBSTAGE_LABELS[substage] : substage;
}

/** `Constitution · Collecting`, or just `Interview` where a stage has no substages. */
export function positionLabel(position: StagePosition): string {
  const substage = substageLabel(position.substage);
  const stage = stageLabel(position.stage);

  return substage === null ? stage : `${stage} · ${substage}`;
}

/**
 * The bundle folder a document card prints under its stage name (task 107).
 *
 * Derived from the project's own name rather than stored: the reference product generates a slug
 * from the description at bundle creation, and inventing a column for it here would be exactly the
 * new write path task 104 forbids. Deterministic, so the same project always prints the same path.
 */
export function bundleSlug(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');

  return slug === '' ? 'bundle' : slug;
}

/** `specs/<bundle>/<file>.md` — the mono path under the stage name on a document card. */
export function specPath(projectName: string, fileName: string): string {
  return `specs/${bundleSlug(projectName)}/${fileName}`;
}

/**
 * «MySpec · Greenfield · V1» as one string (task 126).
 *
 * The badge renders the three parts separately so a test can assert the parts rather than the
 * punctuation; the handoff prompt needs them joined. Both read the same three fields of the same
 * config, and the separator is written down once — here.
 */
export function methodologyLabel(methodologyId: string | null | undefined): string {
  const { vendor, flavour, version } = methodologyConfig(methodologyId).badge;

  return `${vendor} · ${flavour} · ${version}`;
}
