'use client';

import { useState } from 'react';

import { Button } from '../ui/button';
import { showToast } from '../ui/toast';

import { downloadBundle, type ExportManifest } from './download-bundle';
import { SidePanel } from './side-panel';

/**
 * The export panel (tasks 22, 73; FR-015 AC-4/AC-6/AC-7/AC-8).
 *
 * **The manifest belongs to the archive, not to the page.** The panel is rendered from persisted
 * state like everything else, and that list is what a visitor sees before deciding to download. But
 * FR-015 AC-7 is about the moment of download, and a page rendered ten minutes ago cannot honestly
 * describe a ZIP produced now — a file approved in another tab would make it wrong. So the download
 * reads the manifest and the mode out of the response that produced the archive, and replaces the
 * pre-download estimate with them.
 *
 * That is also why the manifest is not inside the archive (AC-8): the archive must hold exactly the
 * bundle's markdown (AC-5), so everything *about* the export travels in headers and is shown here.
 *
 * **An incomplete bundle downloads.** No branch below can refuse one; the omission list is
 * information, never a gate (AC-6). A refusal from the server — the stale-enrichment case of A6 — is
 * displayed as itself, and the panel stays usable.
 */

/** A file the bundle currently contains, addressable for a single-file copy (FR-016). */
export interface ExportFileModel {
  specFileId: string;
  fileName: string;
}

export interface ExportPanelProps {
  projectId: string;
  /** What the current position resolves to, rendered server-side before any download. */
  files: readonly ExportFileModel[];
  omittedFiles: readonly string[];
  mode: string;
  /**
   * How many files this **methodology's** bundle plans to hold (task 133; row `1.4-8`).
   *
   * Included and omitted together — the plan, not the progress — because the sentence describes
   * what a default-mode export *is*, and that does not change as documents are approved.
   */
  planned: number;
}

/**
 * The clipboard copy of one file (task 74; FR-016).
 *
 * `copied` confirms visually (AC-3); `manual` holds the raw markdown when the clipboard refuses, so
 * the user can select it themselves (AC-4). A clipboard write fails for reasons the page cannot fix —
 * a permissions policy, an insecure origin, a browser that requires a fresher user gesture — so
 * "offer the text" is the fallback rather than "try again".
 */
type CopyState =
  | { kind: 'idle' }
  | { kind: 'copying'; specFileId: string }
  | { kind: 'copied'; specFileId: string }
  | { kind: 'manual'; specFileId: string; fileName: string; content: string }
  | { kind: 'failed'; specFileId: string };

export function ExportPanel({ projectId, files, omittedFiles, mode, planned }: ExportPanelProps) {
  const [manifest, setManifest] = useState<ExportManifest | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState<CopyState>({ kind: 'idle' });

  const shown: ExportManifest = manifest ?? {
    mode,
    included: files.map((file) => file.fileName),
    omitted: [...omittedFiles],
  };

  /**
   * Fetches the file's markdown and puts it on the clipboard.
   *
   * The content comes from the endpoint rather than from anything already rendered: the page shows a
   * scrolling preview of the *current* revision, and AC-5 requires the copy to be the revision the
   * export mode resolves to. Copying what is on screen would be right most of the time and wrong
   * exactly when it matters — after enrichment, in default mode.
   */
  async function copyFile(file: ExportFileModel): Promise<void> {
    setCopy({ kind: 'copying', specFileId: file.specFileId });

    let markdown: string;

    try {
      const response = await fetch(`/api/specs/${file.specFileId}/content?mode=${mode}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        setCopy({ kind: 'failed', specFileId: file.specFileId });
        showToast(`${file.fileName} could not be copied.`, 'danger');
        return;
      }

      markdown = await response.text();
    } catch {
      setCopy({ kind: 'failed', specFileId: file.specFileId });
      showToast(`${file.fileName} could not be copied.`, 'danger');
      return;
    }

    try {
      await navigator.clipboard.writeText(markdown);
      setCopy({ kind: 'copied', specFileId: file.specFileId });
      showToast(`${file.fileName} copied — the ${mode}-mode revision.`, 'success');
    } catch {
      // AC-4: the text is offered for manual selection rather than lost with an apology.
      setCopy({
        kind: 'manual',
        specFileId: file.specFileId,
        fileName: file.fileName,
        content: markdown,
      });
    }
  }

  async function download(): Promise<void> {
    setBusy(true);
    setFailure(null);

    const outcome = await downloadBundle(projectId, mode);

    if (!outcome.ok) {
      setFailure(outcome.message);
      showToast(outcome.message, 'danger');
    } else {
      setManifest(outcome.manifest);
      showToast(
        `Downloaded ${String(outcome.manifest.included.length)} ${outcome.manifest.included.length === 1 ? 'file' : 'files'} in ${outcome.manifest.mode} mode.`,
        'success',
      );
    }

    setBusy(false);
  }

  return (
    <SidePanel title="Export the bundle" testId="export-panel">
      <div className="flex flex-col gap-2">
        {/*
          The count comes from the plan, not from a literal (task 133; row `1.4-8`).

          «the four parity files» was printed for every methodology, so a brownfield bundle of three
          announced four of them — and «parity» is our word for our baseline, not something a user
          of this product has any reason to know. The list below was always derived correctly from
          `bundlePlan`; only the sentence above it was guessing.
        */}
        <p className="text-foreground-muted text-xs">
          Mode: <span data-testid="export-mode">{shown.mode}</span> —{' '}
          {shown.mode === 'default'
            ? `this workflow's ${String(planned)} spec ${planned === 1 ? 'file' : 'files'}, each at its most recent pre-enrichment revision.`
            : 'the enriched files plus quality.md.'}
        </p>
        <p className="text-xs" data-testid="export-included">
          {shown.included.length === 0
            ? 'Nothing is approved yet, so the archive would be empty.'
            : `Included: ${shown.included.join(', ')}`}
        </p>

        {/* One file at a time, straight to the clipboard as raw markdown (FR-016). */}
        {files.length > 0 && (
          <ul className="flex flex-col gap-1" data-testid="export-file-list">
            {files.map((file) => (
              <li key={file.specFileId} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs">{file.fileName}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid={`copy-${file.fileName}`}
                  disabled={copy.kind === 'copying'}
                  onClick={() => void copyFile(file)}
                >
                  {copy.kind === 'copying' && copy.specFileId === file.specFileId
                    ? 'Copying…'
                    : copy.kind === 'copied' && copy.specFileId === file.specFileId
                      ? 'Copied ✓'
                      : 'Copy'}
                </Button>
                {copy.kind === 'failed' && copy.specFileId === file.specFileId && (
                  <span className="text-danger text-xs" data-testid="copy-error">
                    That file could not be read. Try again.
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/*
         * AC-4: the clipboard refused, so the raw markdown is put where it can be selected by hand.
         * A `textarea` rather than a `<pre>` because select-all is one keystroke inside one, and
         * because nothing in it can be mistaken for rendered content.
         */}
        {copy.kind === 'manual' && (
          <div className="flex flex-col gap-1" data-testid="copy-manual">
            <label className="text-foreground-muted text-xs" htmlFor="copy-manual-text">
              The clipboard was not available. Here is {copy.fileName} — select and copy it.
            </label>
            <textarea
              id="copy-manual-text"
              data-testid="copy-manual-text"
              readOnly
              value={copy.content}
              rows={8}
              className="bg-background border-border-subtle rounded-md border p-2 font-mono text-xs"
            />
          </div>
        )}

        {shown.omitted.length > 0 && (
          <p className="text-foreground-muted text-xs" data-testid="export-omitted">
            Omitted for want of an approved revision: {shown.omitted.join(', ')}
          </p>
        )}

        {/*
         * The manifest is restated after the fact, in the past tense, because that is the claim
         * FR-015 AC-7 actually makes: this is what the file you just saved contains. Before the
         * download the lists above are an estimate; after it they are a record.
         */}
        {manifest !== null && (
          <p className="text-sm font-medium" data-testid="export-downloaded">
            Downloaded in {manifest.mode} mode:{' '}
            {manifest.included.length === 0 ? 'an empty archive' : manifest.included.join(', ')}
            {manifest.omitted.length > 0 && ` — without ${manifest.omitted.join(', ')}`}.
          </p>
        )}

        {failure !== null && (
          <p className="text-danger text-sm" data-testid="export-error">
            {failure}
          </p>
        )}

        {/*
          Secondary (task 142). The archive is available from the moment there is anything to put in
          it, all session long — it is a standing offer, not a step — and a control that is loud in
          every state cannot be telling anyone what to do next. The one place downloading IS the next
          step is the completion panel at the end of the journey, and that button is primary there.
        */}
        <Button
          type="button"
          variant="secondary"
          onClick={() => void download()}
          disabled={busy}
          data-testid="download-export"
          className="self-start"
        >
          {busy ? 'Preparing…' : 'Download ZIP'}
        </Button>
      </div>
    </SidePanel>
  );
}
