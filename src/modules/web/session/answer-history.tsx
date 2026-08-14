import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

import { stageLabel } from './stage-display';

/**
 * What the owner already told this session (task 75; FR-017 AC-2).
 *
 * A resumed session restores the answers whether or not they are displayed — they are rows, and every
 * later stage is grounded on them. Showing them turns that from a claim about the database into
 * something the owner can check, and it is what makes "already-answered questions are not re-asked"
 * (AC-5) visible rather than merely true: the questions are right there, with their answers, and the
 * panel above is asking about something else.
 *
 * Every string here originates in a model's question text or a person's own words — untrusted content
 * either way (S3). It is rendered as text through JSX, never as markup (NFR-009 AC-3).
 */
export interface AnsweredQuestionModel {
  /** The question as asked. A direct fallback answer has no question, only the need it satisfied. */
  question: string;
  /** The chosen option labels, or the free text, already resolved by the server. */
  answer: string;
}

export interface AnsweredRoundModel {
  roundId: string;
  stage: string;
  roundNumber: number;
  entries: readonly AnsweredQuestionModel[];
}

export function AnswerHistory({ rounds }: { rounds: readonly AnsweredRoundModel[] }) {
  if (rounds.length === 0) return null;

  return (
    <Card data-testid="answer-history">
      <CardHeader>
        <CardTitle>What you have answered</CardTitle>
        <CardDescription>
          Every answered round of this session, in order. Reopening restores all of it, and nothing
          here is asked again (FR-017 AC-2/AC-5).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rounds.map((round) => (
          <div key={round.roundId} className="flex flex-col gap-2" data-testid="answered-round">
            <p className="text-ink-muted text-xs font-medium tracking-wide uppercase">
              {stageLabel(round.stage)} · round {round.roundNumber}
            </p>
            <dl className="flex flex-col gap-2">
              {round.entries.map((entry, index) => (
                <div key={`${round.roundId}-${String(index)}`} className="flex flex-col">
                  <dt className="text-sm">{entry.question}</dt>
                  <dd className="text-ink-muted text-sm" data-testid="answered-value">
                    {entry.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
