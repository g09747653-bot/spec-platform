'use client';

import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, type SubmitEvent } from 'react';

import { methodologiesForChatClass, type MethodologyConfig } from '@/modules/methodologies';
import {
  AUDIENCE_PROFILES,
  DEFAULT_AUDIENCE_PROFILE,
  type AudienceProfile,
} from '@/modules/projects/audience';
import { AUTO_METHODOLOGY } from '@/modules/projects/create-project';

import { type PhraseKey } from '../i18n/dictionary';
import { methodologySummaryKey, stagePhraseKey } from '../i18n/dictionary/methodology';
import { useT } from '../i18n/locale-context';
import { type Translate } from '../i18n/translate';
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

const EMPTY_MESSAGE: PhraseKey = 'projects.new-project.prompt-empty';

/**
 * How each profile reads to the person choosing it (У-5; task 106).
 *
 * The question is about *them*, not about the product: a founder who cannot tell a data model from a
 * deployment target should be able to answer it, and the wording has to make that possible.
 *
 * The table holds phrase keys rather than words (task 143), which keeps both properties it was built
 * for: the `Record` still makes a profile without copy a compile error — task 144 adds a third — and
 * the wording it points at is now the same object in both languages.
 */
const AUDIENCE_COPY: Record<AudienceProfile, { label: PhraseKey; description: PhraseKey }> = {
  'non-technical': {
    label: 'projects.new-project.audience-plain',
    description: 'projects.new-project.audience-plain-hint',
  },
  technical: {
    label: 'projects.new-project.audience-technical',
    description: 'projects.new-project.audience-technical-hint',
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

/**
 * The two fields of a configuration this surface prints as prose (task 143).
 *
 * Neither is translated in `methodologies/configs/*.ts`, and neither may be: the summary is rendered
 * into the classifier's prompt, and a step label into the prompt that writes the document. The
 * Russian lives in `i18n/dictionary/methodology.ts`, addressed by the configuration's id and — for a
 * step — its index, because «Proposal» and «Tasks» each name a step in more than one workflow.
 *
 * A configuration the dictionary does not name falls back to its own English rather than to a gap:
 * the picker must still be able to offer a workflow this build ships.
 */
function summaryOf(t: Translate, config: MethodologyConfig): string {
  const key = methodologySummaryKey(config.id);

  return key === null ? config.summary : t(key);
}

/** The step chain under an option, in the words the session's rail will use. */
function stepChain(t: Translate, config: MethodologyConfig): string {
  return config.steps
    .map((step, index) => {
      const key = stagePhraseKey(config.id, index);

      return key === null ? step.label : t(key);
    })
    .join(' → ');
}

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
  const t = useT();
  const [prompt, setPrompt] = useState('');
  const [audience, setAudience] = useState<AudienceProfile>(DEFAULT_AUDIENCE_PROFILE);
  const [methodology, setMethodology] = useState<string>(AUTO_METHODOLOGY);
  const [error, setError] = useState<PhraseKey | null>(null);
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
        setError('projects.new-project.failed');
        return;
      }

      // Straight into the chat, not to the project's list of one (А-6): a project that has just
      // been created has exactly one conversation, and it is the one the user came here to have.
      router.push(`/sessions/${payload.sessionId}`);
    } catch {
      setError('projects.new-project.failed');
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
      <Label htmlFor="prompt">{t('projects.new-project.prompt-label')}</Label>
      <Textarea
        id="prompt"
        name="prompt"
        data-testid="prompt-input"
        value={prompt}
        onChange={(event) => {
          setPrompt(event.target.value);
          if (error !== null) setError(null);
        }}
        placeholder={t('projects.new-project.prompt-placeholder')}
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
          {t(error)}
        </p>
      )}

      {/*
        У-5: asked once, here, and never again. The interview's register is a property of the
        session (`sessions.audience_profile`), so a round asked in stage four is worded the same way
        as the first — an interviewer who changed voice halfway through would read as two people.
      */}
      <fieldset className="flex flex-col gap-2" data-testid="audience-profile">
        <legend className="text-sm font-medium">{t('projects.new-project.audience-legend')}</legend>
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
              <span className="font-medium">{t(AUDIENCE_COPY[profile].label)}</span>
              <span className="text-foreground-muted block text-xs">
                {t(AUDIENCE_COPY[profile].description)}
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
        <legend className="text-sm font-medium">
          {t('projects.new-project.methodology-legend')}
        </legend>

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
            <span className="font-medium">{t('projects.new-project.methodology-auto')}</span>
            <span className="text-foreground-muted block text-xs">
              {t('projects.new-project.methodology-auto-hint')}
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
              {/*
                Identity, not copy (task 143). A methodology is named by its vendor, its flavour and
                its version, and those three are the same three words in every language — the
                voice standard keeps product names in Latin for the same reason it keeps
                `constitution.md` in Latin. `data-identity` says so out loud, so the locale walk can
                tell a name it must not translate from a label somebody forgot to.
              */}
              <span className="font-medium" data-identity>
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
                data-identity
              >
                {config.name}
              </span>
              <span className="text-foreground-muted block text-xs">{summaryOf(t, config)}</span>
              <span className="text-foreground-muted mt-1 block font-mono text-[11px]">
                {stepChain(t, config)}
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
        {submitting ? t('projects.new-project.submitting') : t('projects.new-project.submit')}
      </Button>
    </form>
  );
}
