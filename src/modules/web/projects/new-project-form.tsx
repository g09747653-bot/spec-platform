'use client';

import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';

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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        body: JSON.stringify({ prompt }),
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

      <Button
        type="submit"
        data-testid="create-project"
        disabled={submitting}
        className="self-start"
      >
        {submitting ? 'Starting…' : 'Start a session'}
      </Button>
    </form>
  );
}
