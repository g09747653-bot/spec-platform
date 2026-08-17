'use client';

import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, type SubmitEvent } from 'react';

import { methodologiesForChatClass } from '@/modules/methodologies';
import {
  AUDIENCE_PROFILES,
  DEFAULT_AUDIENCE_PROFILE,
  type AudienceProfile,
} from '@/modules/projects/audience';
import { AUTO_METHODOLOGY } from '@/modules/projects/create-project';

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

/**
 * The workflows on offer, read from the registry (task 117; Эталон §1.4).
 *
 * `Auto` leads and is selected by default: the reference product recommends a workflow rather than
 * making the user learn four of them, and a person who has just typed one sentence about an idea has
 * no basis for choosing between SpecKit and OpenSpec. Each option shows its badge and its step list,
 * so choosing deliberately is possible for the person who does have a basis.
 */
const GENERATE_METHODOLOGIES = methodologiesForChatClass('generate');

interface CreatedProject {
  projectId: string;
  /** The chat the endpoint opened along with the project — where this form navigates (А-6). */
  sessionId: string;
}

function isCreatedProject(value: unknown): value is CreatedProject {
  return (
    typeof value === 'object' &&
    value !== null &&
    'projectId' in value &&
    typeof value.projectId === 'string' &&
    'sessionId' in value &&
    typeof value.sessionId === 'string'
  );
}

export function NewProjectForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [audience, setAudience] = useState<AudienceProfile>(DEFAULT_AUDIENCE_PROFILE);
  const [methodology, setMethodology] = useState<string>(AUTO_METHODOLOGY);
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
        body: JSON.stringify({ prompt, audience, methodology }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok || !isCreatedProject(payload)) {
        setError('The project could not be created. Please try again.');
        return;
      }

      // Straight into the chat, not to the project's list of one (А-6): a project that has just
      // been created has exactly one conversation, and it is the one the user came here to have.
      router.push(`/sessions/${payload.sessionId}`);
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
          className="text-sm text-danger-ink"
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
            className="border-border-subtle hover:bg-background flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm"
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
              <span className="text-foreground-muted block text-xs">
                {AUDIENCE_COPY[profile].description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {/*
        The workflow picker (task 117). `Auto` is a real value the API understands, not the absence
        of a choice: the server classifies the description once and falls back to the default
        workflow on any failure, silently — the user asked for a recommendation, not a report.
      */}
      <fieldset className="flex flex-col gap-2" data-testid="methodology-picker">
        <legend className="text-sm font-medium">Which workflow?</legend>

        <label className="border-border-subtle hover:bg-background flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm">
          <input
            type="radio"
            name="methodology"
            value={AUTO_METHODOLOGY}
            checked={methodology === AUTO_METHODOLOGY}
            onChange={() => {
              setMethodology(AUTO_METHODOLOGY);
            }}
            data-testid="methodology-auto"
            disabled={submitting}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Auto</span>
            <span className="text-foreground-muted block text-xs">
              Pick the workflow that fits the description.
            </span>
          </span>
        </label>

        {GENERATE_METHODOLOGIES.map((config) => (
          <label
            key={config.id}
            className="border-border-subtle hover:bg-background flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <input
              type="radio"
              name="methodology"
              value={config.id}
              checked={methodology === config.id}
              onChange={() => {
                setMethodology(config.id);
              }}
              data-testid={`methodology-${config.id}`}
              disabled={submitting}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">
                {config.badge.vendor} · {config.badge.flavour} · {config.badge.version}
              </span>
              {/*
                The methodology's full name, on the surface where it is chosen (task 134; row
                `1.4-1`; Эталон §1.4). `config.name` existed in the data and reached a screen by
                exactly one route — the `title` of a badge, i.e. a tooltip, which a person choosing
                between «SpecKit · Greenfield · V1» and «OpenSpec · Brownfield · V1» has no reason
                to hover for. Эталон lists these workflows by their full names.
              */}
              <span
                className="text-foreground-muted block text-xs"
                data-testid={`methodology-name-${config.id}`}
              >
                {config.name}
              </span>
              <span className="text-foreground-muted block text-xs">{config.summary}</span>
              <span className="text-foreground-muted mt-1 block font-mono text-[11px]">
                {config.steps.map((step) => step.label).join(' → ')}
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
