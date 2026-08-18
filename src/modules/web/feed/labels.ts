import { methodologyConfig } from '@/modules/methodologies';
import { isSubstage, type StagePosition, type Substage } from '@/modules/workflow/model/stages';

import { type PhraseKey } from '../i18n/dictionary';
import { type Translate } from '../i18n/translate';
import { stageLabel } from '../session/stage-display';

/**
 * How a position reads in a stage chip (Эталон §1.1: `Constitution · Collecting ──▶ Constitution ·
 * Generating`).
 *
 * Wording only. The vocabulary is `workflow`'s and the position is read from persisted state; what
 * is decided here is that `collect` is called *Collecting* to a person. A substage added to the model
 * without a word for it is a type error, which is the same guard `stageLabel` carries for stages.
 *
 * **A key rather than a word** (task 143). This module has no JSX to be linted and no request to read
 * a locale from, so an English string here would be copy living underneath everything that enforces
 * the dictionary. What it answers is *which* phrase names a substage; whoever renders it resolves it,
 * which is what lets the client chip and the server-rendered header pill share one table.
 */
const SUBSTAGE_KEYS: Record<Substage, PhraseKey> = {
  collect: 'feed.substage.collect',
  generate: 'feed.substage.generate',
  review: 'feed.substage.review',
};

/**
 * The phrase naming a substage, or `null` when there is none to name.
 *
 * A value outside the vocabulary answers `null` rather than itself. Echoing the raw token was
 * tolerable while the chrome was English — `collect` at least reads as a word — but in Russian it is
 * a machine value dressed as copy, which the voice standard treats as a defect of presentation
 * rather than as something to translate. The token is still on the element, in `data-substage`.
 */
export function substageKey(substage: string | null): PhraseKey | null {
  if (substage === null || !isSubstage(substage)) return null;

  return SUBSTAGE_KEYS[substage];
}

/**
 * `Constitution · Collecting`, or just `Interview` where a stage has no substages.
 *
 * The stage half is the methodology's own name for the position (task 132; row `1.4-6`), so the
 * chip and the step pill above it print the same word — «Proposal · Collecting» under brownfield,
 * «Specify · Generating» under SpecKit. The substage half stays canonical: `collect` is *Collecting*
 * in every methodology, because it is a property of the machine rather than of the workflow.
 */
export function positionLabel(
  t: Translate,
  position: StagePosition,
  methodologyId?: string | null,
): string {
  const substage = substageKey(position.substage);
  const stage = stageLabel(t, position.stage, methodologyId, position.substage);

  return substage === null ? stage : `${stage}${t('common.separator')}${t(substage)}`;
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
