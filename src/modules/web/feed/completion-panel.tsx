'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

import { buildHandoffPrompt } from '@/modules/specs/handoff/handoff-prompt';

import { Button } from '../ui/button';
import { showToast } from '../ui/toast';
import { downloadBundle } from '../session/download-bundle';

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

  const fileCount = completion.files.length;

  async function download(): Promise<void> {
    setBusy('download');

    const outcome = await downloadBundle(completion.projectId, completion.exportMode);
    showToast(
      outcome.ok
        ? `Downloaded ${String(outcome.manifest.included.length)} ${outcome.manifest.included.length === 1 ? 'file' : 'files'} in ${outcome.manifest.mode} mode.`
        : outcome.message,
      outcome.ok ? 'success' : 'danger',
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
        showToast('That edit could not be started. Please try again.', 'danger');
        return;
      }

      router.push(`/sessions/${parsed.data.sessionId}`);
    } catch {
      showToast('That edit could not be started. Please try again.', 'danger');
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
    const copied = await copyPrompt(text);

    showToast(
      copied
        ? `Prompt copied. Paste it into ${platform.label} — the tab is open.`
        : `Could not reach the clipboard. Copy the prompt below, then paste it into ${platform.label}.`,
      copied ? 'success' : 'danger',
    );

    window.open(platform.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <FeedItem block={block}>
      <div className="flex w-full max-w-[46rem] flex-col gap-3">
        <div
          className="border-border-subtle bg-surface rounded-xl border p-4"
          data-testid="session-complete"
        >
          <p className="text-h3">Session completed</p>
          {/*
            Task 133, row `1.1-13`. This paragraph used to print requirement identifiers at the
            person reading it — «no stage reopens (FR-020 AC-9)» — and the paraphrase was wrong
            besides: AC-9 forbids every re-entry *except* the Quality one, which is the button
            immediately below. The identifiers were the only ones anywhere in user-facing JSX, so
            this was a leak rather than a house style. Said plainly, and true.
          */}
          <p className="text-foreground-muted mt-1 text-sm">
            Bundle: <span data-testid="completion-bundle">{completion.bundleName}</span> —{' '}
            <span data-testid="completion-file-count">{fileCount}</span> spec{' '}
            {fileCount === 1 ? 'file' : 'files'} generated. Every file has an approved revision, and
            the session is sealed: no stage goes back. You can still refine any file — a refinement
            adds a new revision and leaves the session where it is.
          </p>

          {block.completionCount > 1 && (
            <p className="text-foreground-muted mt-1 text-xs">
              Sealed {block.completionCount} times — the session has been re-opened and completed
              again.
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
              {busy === 'edit' ? 'Opening…' : 'Edit'}
            </Button>
            <Button
              data-testid="completion-download"
              disabled={busy !== null}
              onClick={() => {
                void download();
              }}
            >
              {busy === 'download' ? 'Preparing…' : 'Download'}
            </Button>
          </div>
        </div>

        <div
          className="border-border-subtle bg-surface rounded-xl border p-4"
          data-testid="build-with"
        >
          <p className="text-h3">Build with your favourite tool</p>
          <p className="text-foreground-muted mt-1 text-sm">
            Generate a prompt that hands this bundle to a coding agent. The platform buttons{' '}
            <strong className="font-medium">copy that prompt and open the platform</strong> — we do
            not send your bundle anywhere, and there is no import to click through. Download the
            ZIP, unpack it into <code className="font-mono text-xs">.specs/</code>, and paste the
            prompt.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              data-testid="generate-ai-prompt"
              onClick={() => {
                generatePrompt();
              }}
            >
              Generate AI Prompt
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
                Copy &amp; open {platform.label}
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
                      copied ? 'Prompt copied to the clipboard.' : 'Could not reach the clipboard.',
                      copied ? 'success' : 'danger',
                    );
                  });
                }}
              >
                Copy prompt
              </Button>
            </div>
          )}
        </div>
      </div>
    </FeedItem>
  );
}
