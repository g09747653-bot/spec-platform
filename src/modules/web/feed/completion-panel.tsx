'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

import { BUNDLE_DIRECTORY, buildHandoffPrompt } from '@/modules/specs/handoff/handoff-prompt';

import { useT } from '../i18n/locale-context';
import { Button } from '../ui/button';
import { showToast } from '../ui/toast';
import { downloadBundle, modePhrase } from '../session/download-bundle';

import { FeedItem } from './feed-item';
import type { CompletionBlock } from './model';

/**
 * The end of the feed (task 126; Эталон §1.1 «Session completed», §5.1 handoff).
 *
 * Two panels, in the order the reference product puts them: what the session produced, and what to
 * do with it.
 *
 * **Nothing here pretends to be an integration.** We cannot push a bundle into Lovable, Bolt or
 * Replit — there is no such API to call, and inventing a deeplink that looks like one would be the
 * single most dishonest thing this product could ship. So the platform buttons do exactly what they
 * say: copy the prompt, open the platform in a new tab, and leave the paste to the person. The copy
 * above the buttons states that in words before anyone clicks.
 *
 * **The prompt is not decorative either.** It is built from this bundle's approved revisions and its
 * methodology's own file names (`buildHandoffPrompt`), so an agent given it is told to read files
 * that exist, at the revisions that were approved.
 */
const CreatedChat = z.object({ sessionId: z.string().min(1) });

export interface CompletionFileModel {
  specFileId: string;
  fileName: string;
  revisionNumber: number;
}

export interface CompletionModel {
  projectId: string;
  bundleName: string;
  /** «MySpec · Greenfield · V1», joined from the config's parts by the page. */
  methodologyLabel: string;
  /** The bundle's approved files, in the methodology's own order. */
  files: readonly CompletionFileModel[];
  /** Files the methodology promises that have no approved revision. */
  omittedFiles: readonly string[];
  /** The export mode the download will resolve against (A6). */
  exportMode: string;
}

/** Where each button goes. No parameters, because there is nothing honest to put in them. */
const PLATFORMS = [
  { id: 'lovable', label: 'Lovable', url: 'https://lovable.dev' },
  { id: 'bolt', label: 'Bolt', url: 'https://bolt.new' },
  { id: 'replit', label: 'Replit', url: 'https://replit.com' },
] as const;

export function CompletionPanel({
  block,
  completion,
}: {
  block: CompletionBlock;
  completion: CompletionModel;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'download' | 'edit' | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const t = useT();

  const fileCount = completion.files.length;

  async function download(): Promise<void> {
    setBusy('download');

    const outcome = await downloadBundle(completion.projectId, completion.exportMode, t);
    /*
       The export panel's own toast, said by this button too (task 143). One archive, one
       implementation, and now one sentence about it — the two used to be two dictionary entries
       with one English sentence and two different Russian ones between them.
    */
    showToast(
      outcome.ok
        ? t('session.export.downloaded-toast', {
            count: outcome.manifest.included.length,
            mode: t(modePhrase(outcome.manifest.mode)),
          })
        : outcome.message,
      outcome.ok ? 'success' : 'danger',
      outcome.ok ? 'bundle-downloaded' : 'bundle-download-failed',
    );

    setBusy(null);
  }

  /**
   * Opens an Edit chat over the whole bundle.
   *
   * The same endpoint the project page's Reference step posts to, with every approved file selected
   * — «Edit» on the completion panel means this bundle, not a subset the user has not been asked
   * about yet. The chat itself is where the subset gets chosen.
   */
  async function edit(): Promise<void> {
    setBusy('edit');

    try {
      const response = await fetch(`/api/projects/${completion.projectId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specFileIds: completion.files.map((file) => file.specFileId) }),
      });
      const parsed = CreatedChat.safeParse(await response.json().catch(() => null));

      if (!response.ok || !parsed.success) {
        showToast(t('feed.completion.edit-failed'), 'danger', 'edit-chat-failed');
        return;
      }

      router.push(`/sessions/${parsed.data.sessionId}`);
    } catch {
      showToast(t('feed.completion.edit-failed'), 'danger', 'edit-chat-failed');
    } finally {
      setBusy(null);
    }
  }

  function generatePrompt(): string {
    const text = buildHandoffPrompt({
      bundleName: completion.bundleName,
      methodologyLabel: completion.methodologyLabel,
      files: completion.files,
      omittedFiles: completion.omittedFiles,
    });

    setPrompt(text);
    return text;
  }

  async function copyPrompt(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // A clipboard write fails for reasons the page cannot fix — an insecure origin, a permissions
      // policy, a browser wanting a fresher gesture. The text stays on screen to be selected.
      return false;
    }
  }

  async function openWith(platform: (typeof PLATFORMS)[number]): Promise<void> {
    const text = prompt ?? generatePrompt();

    /*
     * **The tab opens first, inside the gesture that asked for it** (found by the M12п bug hunt).
     *
     * A popup that arrives after an `await` is no longer attributable to a click, and a browser is
     * entitled to block it — WebKit does, and did: the button copied the prompt and then opened
     * nothing. Ordering it this way also puts the two outcomes the right way round. Opening the
     * platform is the thing the button promises and it cannot fail; reaching the clipboard is the
     * thing that can, and the toast is where that is reported (the text stays on screen either way).
     */
    window.open(platform.url, '_blank', 'noopener,noreferrer');

    const copied = await copyPrompt(text);

    showToast(
      copied
        ? t('feed.completion.prompt-copied-open', { platform: platform.label })
        : t('feed.completion.prompt-copy-failed-open', { platform: platform.label }),
      copied ? 'success' : 'danger',
      copied ? 'handoff-prompt-copied' : 'handoff-prompt-copy-failed',
    );
  }

  return (
    <FeedItem block={block}>
      <div className="flex w-full flex-col gap-3">
        <div
          className="border-border-subtle bg-surface rounded-xl border p-4"
          data-testid="session-complete"
        >
          <p className="text-h3">{t('feed.completion.title')}</p>
          {/*
            Task 133, row `1.1-13`. This paragraph used to print requirement identifiers at the
            person reading it — «no stage reopens (FR-020 AC-9)» — and the paraphrase was wrong
            besides: AC-9 forbids every re-entry *except* the Quality one, which is the button
            immediately below. The identifiers were the only ones anywhere in user-facing JSX, so
            this was a leak rather than a house style. Said plainly, and true.
          */}
          {/*
            Three phrases rather than one (task 143). The bundle name and the file count each sit in
            an element a suite reads by test id, so the sentence cannot become a single phrase
            without taking those away — and both languages happen to want the same five slots, which
            is what makes the split a translation rather than an English word order in JSX.
          */}
          <p className="text-foreground-muted mt-1 text-sm">
            {t('feed.completion.bundle-lead')}
            <span data-testid="completion-bundle">{completion.bundleName}</span>
            {t('feed.completion.bundle-mid', { count: fileCount })}
            <span data-testid="completion-file-count">{fileCount}</span>
            {t('feed.completion.bundle-tail', { count: fileCount })}
          </p>

          {block.completionCount > 1 && (
            <p className="text-foreground-muted mt-1 text-xs">
              {t('feed.completion.sealed-count', { count: block.completionCount })}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              data-testid="completion-edit"
              disabled={busy !== null || fileCount === 0}
              onClick={() => {
                void edit();
              }}
            >
              {busy === 'edit' ? t('feed.completion.editing') : t('feed.completion.edit')}
            </Button>
            <Button
              data-testid="completion-download"
              disabled={busy !== null}
              onClick={() => {
                void download();
              }}
            >
              {busy === 'download' ? t('feed.completion.preparing') : t('common.download')}
            </Button>
          </div>
        </div>

        <div
          className="border-border-subtle bg-surface rounded-xl border p-4"
          data-testid="build-with"
        >
          <p className="text-h3">{t('feed.completion.build-with-title')}</p>
          {/*
            Task 143: the two clauses a walk checks — what the buttons do, and what we do not do
            with the bundle — are the honesty of this panel, so each is addressable on its own
            element. The suite asserts the promise is present rather than that this sentence is
            still worded in English; the `<span>` adds nothing visible, only somewhere to point.
          */}
          <p className="text-foreground-muted mt-1 text-sm">
            {t('feed.completion.build-with-lead')}
            <strong className="font-medium" data-testid="build-with-copy-open">
              {t('feed.completion.build-with-buttons')}
            </strong>
            {t('feed.completion.build-with-dash')}
            <span data-testid="build-with-no-upload">
              {t('feed.completion.build-with-no-upload')}
            </span>
            {t('feed.completion.build-with-unpack')}
            {/*
              The folder name comes from the prompt's own constant rather than from this sentence: it
              is a path, so it is the same in every language, and it is the same path the prompt tells
              the agent to read from. Two spellings of it would be a defect no translation caused.
            */}
            <code className="font-mono text-xs">{BUNDLE_DIRECTORY}</code>
            {t('feed.completion.build-with-paste')}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              data-testid="generate-ai-prompt"
              onClick={() => {
                generatePrompt();
              }}
            >
              {t('feed.completion.generate-prompt')}
            </Button>

            {PLATFORMS.map((platform) => (
              <Button
                key={platform.id}
                variant="ghost"
                data-testid={`build-with-${platform.id}`}
                onClick={() => {
                  void openWith(platform);
                }}
              >
                {t('feed.completion.copy-open', { platform: platform.label })}
              </Button>
            ))}
          </div>

          {prompt !== null && (
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                readOnly
                rows={12}
                value={prompt}
                data-testid="handoff-prompt"
                className="border-border-subtle bg-background w-full rounded-md border p-3 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                data-testid="copy-handoff-prompt"
                onClick={() => {
                  void copyPrompt(prompt).then((copied) => {
                    showToast(
                      copied
                        ? t('feed.completion.prompt-copied')
                        : t('feed.completion.prompt-copy-failed'),
                      copied ? 'success' : 'danger',
                      copied ? 'handoff-prompt-copied' : 'handoff-prompt-copy-failed',
                    );
                  });
                }}
              >
                {t('feed.completion.copy-prompt')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </FeedItem>
  );
}
