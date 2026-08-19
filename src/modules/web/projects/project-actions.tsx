'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { type PhraseKey } from '../i18n/dictionary';
import { useT } from '../i18n/locale-context';
import { Button } from '../ui/button';
import { Input } from '../ui/field';

/**
 * Rename, duplicate and delete, for one row of the project list (tasks 76, 77; FR-002 AC-3..AC-7).
 *
 * **The delete dialog is the requirement, not decoration.** FR-002 AC-4 asks for an explicit
 * confirmation that *states deletion is permanent*, so the confirmation says the word: it names the
 * project, says what goes with it, and says it cannot be undone (DR-7). A generic "Are you sure?"
 * would satisfy the letter and none of the point — the user is meant to be able to tell this apart
 * from every other dialog they dismiss without reading.
 *
 * The endpoint refuses an unconfirmed delete too. Two checks for one rule, deliberately: this one is
 * for the person, and the other is so that "confirmed" is a property of the request rather than of
 * the client having behaved.
 */
export interface ProjectActionsProps {
  projectId: string;
  name: string;
}

type Mode = 'idle' | 'renaming' | 'confirming-delete' | 'busy';

export function ProjectActions({ projectId, name }: ProjectActionsProps) {
  const router = useRouter();
  const t = useT();
  const [mode, setMode] = useState<Mode>('idle');
  const [draftName, setDraftName] = useState(name);
  const [error, setError] = useState<PhraseKey | null>(null);

  async function send(request: () => Promise<Response>, failure: PhraseKey): Promise<void> {
    setMode('busy');
    setError(null);

    try {
      const response = await request();

      if (!response.ok) {
        setError(failure);
        setMode('idle');
        return;
      }

      setMode('idle');
      router.refresh();
    } catch {
      setError(failure);
      setMode('idle');
    }
  }

  const rename = () =>
    send(
      () =>
        fetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: draftName }),
        }),
      'projects.actions.rename-failed',
    );

  const duplicate = () =>
    send(
      () => fetch(`/api/projects/${projectId}/duplicate`, { method: 'POST' }),
      'projects.actions.duplicate-failed',
    );

  // The query parameter is the endpoint's half of AC-4; the dialog above it is the user's half.
  const remove = () =>
    send(
      () => fetch(`/api/projects/${projectId}?confirm=permanent`, { method: 'DELETE' }),
      'projects.actions.delete-failed',
    );

  return (
    <div className="flex flex-col gap-2" data-testid="project-actions">
      {mode === 'renaming' ? (
        <div className="flex items-center gap-2">
          {/*
            `min-w-0` (task 136, sibling audit): a field sharing a flex row with buttons that will
            not shrink is the shape the composer failed in. An `<input>` cannot collapse to nothing
            the way a `<textarea>` can — its automatic minimum is its intrinsic width — but without
            this the row overflows instead, which on a narrow window pushes Save off the edge.
          */}
          <Input
            aria-label={t('projects.actions.name-label')}
            className="min-w-0"
            data-testid="rename-input"
            value={draftName}
            onChange={(event) => {
              setDraftName(event.target.value);
            }}
          />
          <Button
            size="sm"
            data-testid="rename-save"
            disabled={draftName.trim() === ''}
            onClick={() => void rename()}
          >
            {t('projects.actions.save')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid="rename-cancel"
            onClick={() => {
              setDraftName(name);
              setMode('idle');
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
      ) : mode === 'confirming-delete' ? (
        <div className="border-danger flex flex-col gap-2 rounded-md border p-3" role="alertdialog">
          {/*
            Task 143: FR-002 AC-4 is about what this paragraph *says*, and until now the only way to
            check it was to search the English for «permanently». The flag is the claim in machine
            form, so the assertion survives translation of the sentence that carries it.
          */}
          <p className="text-sm" data-testid="delete-confirm-text" data-permanent="true">
            {t('projects.actions.delete-confirm', { name })}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              data-testid="delete-confirm"
              onClick={() => void remove()}
            >
              {t('projects.actions.delete-confirmed')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="delete-cancel"
              onClick={() => {
                setMode('idle');
              }}
            >
              {t('projects.actions.delete-cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            data-testid="rename-project"
            disabled={mode === 'busy'}
            onClick={() => {
              setDraftName(name);
              setMode('renaming');
            }}
          >
            {t('projects.actions.rename')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid="duplicate-project"
            disabled={mode === 'busy'}
            onClick={() => void duplicate()}
          >
            {mode === 'busy' ? t('projects.actions.busy') : t('projects.actions.duplicate')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid="delete-project"
            disabled={mode === 'busy'}
            onClick={() => {
              setMode('confirming-delete');
            }}
          >
            {t('projects.actions.delete')}
          </Button>
        </div>
      )}

      {error !== null && (
        <p role="alert" className="text-danger text-xs" data-testid="project-action-error">
          {t(error)}
        </p>
      )}
    </div>
  );
}
