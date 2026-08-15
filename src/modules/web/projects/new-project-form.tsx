'use client';

import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, type SubmitEvent } from 'react';

import {
  AUDIENCE_PROFILES,
  DEFAULT_AUDIENCE_PROFILE,
  type AudienceProfile,
} from '@/modules/projects/audience';

import { Button } from '../ui/button';
import { Label, Textarea } from '../ui/field';

/**
 * The form that starts a session from a prompt (FR-003; task 15).
 *
 * Validation is client-side *as well as* server-side. Both are the same rule — an empty or
 * whitespace-only prompt is refused (FR-003 AC-2) — but the browser check exists to answer instantly,
 * and the API check is the one that is authoritative. The client never decides anything the server
 * does not re-decide.
 *
 * The submit state is visible throughout, so the request never looks frozen (NFR-002).
 */

const EMPTY_MESSAGE = 'Describe your idea in a sentence or two before starting.';

/**
 * How each profile reads to the person choosing it (У-5; task 106).
 *
 * The question is about *them*, not about the product: a founder who cannot tell a data model from a
 * deployment target should be able to answer it, and the wording has to make that possible.
 */
const AUDIENCE_COPY: Record<AudienceProfile, { label: string; description: string }> = {
  'non-technical': {
    label: 'In plain language',
    description: 'Questions in everyday words, with no engineering vocabulary.',
  },
  technical: {
    label: 'In technical terms',
    description:
      'Questions that name the engineering choices directly, with the trade-offs stated.',
  },
};

interface CreatedProject {
  projectId: string;
}

function isCreatedProject(value: unknown): value is CreatedProject {
  return (
    typeof value === 'object' &&
    value !== null &&
    'projectId' in value &&
    typeof value.projectId === 'string'
  );
}

export function NewProjectForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [audience, setAudience] = useState<AudienceProfile>(DEFAULT_AUDIENCE_PROFILE);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /*
   * The form is JavaScript-driven: it posts with `fetch` and navigates on the response. Before
   * hydration a click would do nothing at all, so the control is disabled until then — an honest
   * "not ready yet" rather than a dead click.
   *
   * `useSyncExternalStore` with a server snapshot of `false` and a client snapshot of `true` is the
   * hydration signal itself; the store never changes, so nothing re-subscribes and no state is set
   * from an effect.
   */
  const ready = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  async function createProject(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (prompt.trim() === '') {
      setError(EMPTY_MESSAGE);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, audience }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok || !isCreatedProject(payload)) {
        setError('The project could not be created. Please try again.');
        return;
      }

      router.push(`/projects/${payload.projectId}`);
    } catch {
      setError('The project could not be created. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void createProject(event);
      }}
      className="flex flex-col gap-3"
      noValidate
    >
      <Label htmlFor="prompt">What do you want to build?</Label>
      <Textarea
        id="prompt"
        name="prompt"
        data-testid="prompt-input"
        value={prompt}
        onChange={(event) => {
          setPrompt(event.target.value);
          if (error !== null) setError(null);
        }}
        placeholder="A recipe app for cooks who hate scrolling past life stories."
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : 'prompt-error'}
        disabled={submitting}
      />

      {error !== null && (
        <p
          id="prompt-error"
          role="alert"
          data-testid="prompt-error"
          className="text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {/*
        У-5: asked once, here, and never again. The interview's register is a property of the
        session (`sessions.audience_profile`), so a round asked in stage four is worded the same way
        as the first — an interviewer who changed voice halfway through would read as two people.
      */}
      <fieldset className="flex flex-col gap-2" data-testid="audience-profile">
        <legend className="text-sm font-medium">How should the questions be worded?</legend>
        {AUDIENCE_PROFILES.map((profile) => (
          <label
            key={profile}
            className="border-border-subtle hover:bg-canvas flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <input
              type="radio"
              name="audience"
              value={profile}
              checked={audience === profile}
              onChange={() => {
                setAudience(profile);
              }}
              data-testid={`audience-${profile}`}
              disabled={submitting}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{AUDIENCE_COPY[profile].label}</span>
              <span className="text-ink-muted block text-xs">
                {AUDIENCE_COPY[profile].description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <Button
        type="submit"
        data-testid="create-project"
        disabled={!ready || submitting}
        className="self-start"
      >
        {submitting ? 'Starting…' : 'Start a session'}
      </Button>
    </form>
  );
}
