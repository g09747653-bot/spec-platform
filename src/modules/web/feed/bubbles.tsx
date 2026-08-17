'use client';

import { methodologyConfig } from '@/modules/methodologies';

import { stageLabel } from '../session/stage-display';

import { FeedItem } from './feed-item';
import { positionLabel } from './labels';
import { useMethodologyId } from './methodology-naming';
import type { BundleBlock, MessageBlock, SeedBlock, TransitionBlock } from './model';

/**
 * The prose blocks of the conversation (task 105; Эталон §1.1, block types 1 and 3).
 *
 * Presentational: nothing here fetches, decides or holds state, so these blocks are part of the
 * first paint rather than something that appears once the page's JavaScript has run. That matters
 * for the invariant round 5 established — a page that has not hydrated yet still shows where the
 * session is and what it has been told.
 *
 * The one thing they read from outside their props is the methodology in scope (task 132), which
 * decides what a position is *called*: a chip and a caption in a SpecKit session say «Specify» where
 * ours say «Requirements». It arrives by context because this is the only file that needs it.
 */

/**
 * The fill that tells a user's bubble apart from the page it sits on (task 133; row `1.1-2`).
 *
 * `bg-background` was byte-identical to the canvas: the reference calls for a *muted* fill, the
 * token for it existed, and the bubble was readable only by its border. Written once and shared by
 * both bubbles, so the seed and a chat turn cannot drift apart.
 */
const BUBBLE =
  'bg-surface-muted border-border-subtle max-w-[34rem] rounded-2xl rounded-tr-sm border px-4 py-3 text-sm';

/**
 * The seed, rendered as the user's own opening message.
 *
 * The wording is the reference product's template (Эталон §1.2), and it is composed here rather than
 * stored: `sessions.initial_prompt` holds what the user actually typed, and wrapping it in a
 * sentence at write time would have made the stored grounding input a presentation decision.
 *
 * **The name is printed only when it is a second fact** (task 133; row `1.2-1`). The reference's
 * two-slot sentence assumes a short generated bundle name beside a longer description; our name is
 * derived from the prompt's first line (D-20, one field instead of two at creation), so on most
 * sessions both slots carried the same text — «I want to build A tool that tracks which of a small
 * charity's grant…. My project description is: A tool that tracks which of a small charity's grant
 * applications are due». A project the user has renamed still gets the full sentence, because then
 * the name really is something the description does not say.
 *
 * An Edit chat gets neither: its `initial_prompt` **is** a sentence already — «I want to update spec
 * constitution.md … to» — and wrapping it produced two glued templates in one bubble (row `1.4-4`).
 */
export function SeedBubble({ block }: { block: SeedBlock }) {
  const methodologyId = useMethodologyId();
  const prefilled = methodologyId !== null && methodologyConfig(methodologyId).chatClass === 'edit';
  const namesMore = !block.prompt.startsWith(block.projectName.replace(/…$/, ''));

  return (
    <FeedItem block={block} align="right">
      <div className={BUBBLE}>
        <p className="whitespace-pre-wrap" data-testid="session-prompt-line">
          {prefilled ? null : namesMore ? (
            <>I want to build {block.projectName}. My project description is: </>
          ) : (
            <>I want to build: </>
          )}
          <span data-testid="session-prompt">{block.prompt}</span>
        </p>
      </div>
    </FeedItem>
  );
}

export function MessageBubble({ block }: { block: MessageBlock }) {
  if (block.role === 'user') {
    return (
      <FeedItem block={block} align="right">
        <div className={`${BUBBLE} whitespace-pre-wrap`} data-testid="chat-turn-user">
          {block.text}
        </div>
      </FeedItem>
    );
  }

  /*
   * A revision note is prose like any other assistant turn, and reads as one on purpose (task 113;
   * Эталон §1.3): the writer saying what it is folding in and what it decided for itself is a turn
   * of the conversation, not a system notice. Only its test id differs, so a walk can find it.
   *
   * The same is true of the analytical bridge (task 132): the interviewer noticing that two answers
   * disagree is the interviewer talking, not the system reporting.
   */
  const testId =
    block.origin === 'chat'
      ? 'chat-turn-assistant'
      : block.origin === 'revision-note'
        ? 'revision-note'
        : block.origin === 'bridge'
          ? 'interview-bridge'
          : 'session-summary';

  return (
    <FeedItem block={block}>
      {/* `chat-prose` is the typographic wrapper the reference gives AI prose (task 134; `1.5-11`). */}
      <div className="chat-prose whitespace-pre-wrap" data-testid={testId}>
        {block.text}
        {block.streaming && <span className="text-foreground-muted"> ▌</span>}
      </div>
    </FeedItem>
  );
}

/**
 * The stage chip: where the session moved, and where it moved to (Эталон §1.1, block type 3).
 *
 * Derived, never stored — see `build-feed.ts`. All four of the reference's traits are here now
 * (task 134; row `1.1-10`): the order and the arrow, the **target in primary**, a **gradient
 * border** in primary, and dashes that **flow**.
 *
 * The animation was previously left out on the grounds that "a chip that animates for ever looks
 * like a page still working". That worry belongs to the drafting surface, not here: every chip in
 * the feed animates identically, including the ones from stages finished an hour ago, so nothing
 * about the motion singles out a step as in progress — and `prefers-reduced-motion` turns it off
 * for anyone who asked, which the previous version had no way to honour either way.
 *
 * The gradient border is a one-pixel gradient behind an opaque pill rather than a `border-image`:
 * it is the only way to get a gradient stroke on a fully-rounded shape that every engine draws the
 * same, and the inner fill is the canvas token, so the chip still reads as sitting on the feed.
 */
export function StageChip({ block }: { block: TransitionBlock }) {
  const methodologyId = useMethodologyId();

  return (
    <FeedItem block={block} align="center">
      <span
        className="from-primary/20 via-brand/20 to-primary/20 inline-flex rounded-full bg-gradient-to-r p-px"
        data-testid="stage-chip"
        data-from={`${block.from.stage}${block.from.substage === null ? '' : `.${block.from.substage}`}`}
        data-to={`${block.to.stage}${block.to.substage === null ? '' : `.${block.to.substage}`}`}
      >
        <span className="bg-background text-foreground-muted inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs">
          <span>{positionLabel(block.from, methodologyId)}</span>
          <span aria-hidden className="dash-flow opacity-60">
            ──▶
          </span>
          <span className="text-primary-ink font-medium">
            {positionLabel(block.to, methodologyId)}
          </span>
        </span>
      </span>
    </FeedItem>
  );
}

/**
 * «Project bundle created» (task 133; row `1.2-5`; Эталон §1.2).
 *
 * A system line rather than a card: the reference marks the moment the interview turns into a
 * bundle, and what a reader needs from it is the name the document cards are about to print in
 * their paths and the files that are coming. Derived — see `build-feed.ts`.
 */
export function BundleCreated({ block }: { block: BundleBlock }) {
  return (
    <FeedItem block={block} align="center">
      <p
        className="border-border-subtle text-foreground-muted rounded-full border px-3 py-1 text-xs"
        data-testid="bundle-created"
      >
        Project bundle created: <span className="font-mono">{block.bundleName}</span> —{' '}
        {block.fileNames.length} spec {block.fileNames.length === 1 ? 'file' : 'files'} to write
      </p>
    </FeedItem>
  );
}

/**
 * The small caption above a card, naming the stage it belongs to — in its methodology's words.
 *
 * `tone="primary"` is the document card's (task 134; row `1.1-11`; Эталон §1.1): the reference gives
 * a document card exactly one colour accent and puts it on the stage name, and ours was the same
 * muted grey as everything else on an otherwise achromatic card. `primary-ink` rather than
 * `primary` because this is small text and the ink token is the one contrast-checked for it.
 */
export function BlockCaption({
  stage,
  trailing,
  tone = 'muted',
}: {
  stage: string;
  trailing?: string;
  tone?: 'muted' | 'primary';
}) {
  const methodologyId = useMethodologyId();

  return (
    <p
      className={`text-label uppercase ${tone === 'primary' ? 'text-primary-ink' : 'text-foreground-muted'}`}
    >
      {stageLabel(stage, methodologyId)}
      {trailing !== undefined && ` · ${trailing}`}
    </p>
  );
}
