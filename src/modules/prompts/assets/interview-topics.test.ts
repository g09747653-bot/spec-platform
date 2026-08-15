import { describe, expect, it } from 'vitest';

import { interviewQuestionsPrompt } from './interview';
import { topicBlock, topicsForStage } from './interview-topics';

/**
 * Round 2, Д-3 — the interview asks about the product, never about our documents.
 *
 * The M6 gate produced "What should the constitution document emphasise?". The user is described in
 * the constitution as possibly a non-technical founder; that question is unanswerable by them, and it
 * is the wrong question for anyone — the document is our concern, the product is theirs.
 *
 * The fix moves the stage out of the prompt and a topic list in. What can be tested here is the
 * assembled prompt: the topics are product questions, and the vocabulary that produced the bad round
 * cannot reach the model except in the one place it is explicitly marked as a record-keeping label.
 */
const JARGON = [
  'constitution',
  'requirements document',
  'specification',
  'acceptance criteria',
  'milestone',
  'artifact',
  'substage',
  'EARS',
];

const STAGES = ['interview', 'constitution', 'requirements', 'solution', 'tasks', 'quality'];

describe('interview topics (round 2, Д-3)', () => {
  describe('every stage has product topics, in plain words', () => {
    for (const stage of STAGES) {
      it(`${stage} asks about the product`, () => {
        const topics = topicsForStage(stage);

        expect(topics.length).toBeGreaterThan(0);

        for (const topic of topics) {
          for (const word of JARGON) {
            expect(topic.toLowerCase(), `"${topic}" mentions ${word}`).not.toContain(word);
          }
          // A topic is a thing to ask about, not a document to describe.
          expect(topic.toLowerCase()).not.toContain('document');
          expect(topic.toLowerCase()).not.toContain('section');
        }
      });
    }
  });

  it('falls back to the grounding topics for a stage it does not know', () => {
    // A round of sensible questions beats a round of none.
    expect(topicsForStage('nonsense')).toEqual(topicsForStage('interview'));
  });

  it('gives different stages different topics', () => {
    const seen = new Set(STAGES.map((stage) => topicBlock(stage)));

    // `quality` and the rest each bring their own; only the fallback repeats, and it is not here.
    expect(seen.size).toBe(STAGES.length);
  });

  describe('the assembled prompt', () => {
    const prompt = (stage: string) =>
      interviewQuestionsPrompt({
        stage,
        audience: 'non-technical',
        roundNumber: 1,
        initialPrompt: 'An app for tracking what my family spends',
        summary: null,
        satisfiedNeeds: [],
        unmetNeeds: [],
      });

    it('carries the topics, not the stage, as the subject of the round', () => {
      const assembled = prompt('constitution');

      expect(assembled.user).toContain('what this product must never do');
      expect(assembled.user).toContain('An app for tracking what my family spends');
    });

    /*
     * The stage name does still appear once — the JSON must echo it back for our records — and that
     * one occurrence is immediately followed by the instruction not to put it in a question. The
     * test pins both halves: removing the guardrail while leaving the label is the regression.
     */
    it('names the stage only as a record-keeping label, with the prohibition attached', () => {
      const assembled = prompt('constitution');
      const occurrences = assembled.user.match(/constitution/gi) ?? [];

      expect(occurrences).toHaveLength(1);
      expect(assembled.user).toContain('must not appear in');
    });

    it('tells the model, in the system prompt, which words are forbidden in a question', () => {
      const assembled = prompt('requirements');

      expect(assembled.system).toContain('Never ask about documents');
      for (const word of ['constitution', 'specification', 'acceptance', 'milestone']) {
        expect(assembled.system.toLowerCase()).toContain(word);
      }
    });

    it('speaks plainly to a non-technical audience, and in engineering terms to a technical one', () => {
      expect(prompt('solution').system).toContain('They are not technical');

      const technical = interviewQuestionsPrompt({
        stage: 'solution',
        audience: 'technical',
        roundNumber: 1,
        initialPrompt: 'An app for tracking what my family spends',
        summary: null,
        satisfiedNeeds: [],
        unmetNeeds: [],
      });

      // У-5: the profile provably changes the prompt, and only its register.
      expect(technical.system).not.toContain('They are not technical');
      expect(technical.system).toContain('comfortable with engineering vocabulary');
      // The prohibition on asking about *our* artifacts is above the register and survives both.
      expect(technical.system).toContain('Never ask about documents');
    });

    it('falls back to the plain register for a profile it does not recognise', () => {
      const unknown = interviewQuestionsPrompt({
        stage: 'solution',
        audience: 'martian',
        roundNumber: 1,
        initialPrompt: 'An app for tracking what my family spends',
        summary: null,
        satisfiedNeeds: [],
        unmetNeeds: [],
      });

      expect(unknown.system).toContain('They are not technical');
    });

    it('still carries the needs bookkeeping the gates depend on', () => {
      const assembled = interviewQuestionsPrompt({
        stage: 'requirements',
        audience: 'non-technical',
        roundNumber: 2,
        initialPrompt: 'An app for tracking what my family spends',
        summary: 'A household budget tool for two adults.',
        satisfiedNeeds: ['audience'],
        unmetNeeds: ['integrations'],
      });

      expect(assembled.user).toContain('A household budget tool for two adults.');
      expect(assembled.user).toContain('audience');
      expect(assembled.user).toContain('integrations');
    });
  });
});
