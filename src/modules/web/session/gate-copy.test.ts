import { describe, expect, it } from 'vitest';

import { INTERVIEW_CONDITIONS, REASON_CODES } from '@/modules/workflow/reason-codes';

import { CONDITION_COPY, REASON_EXPLANATION, rejectionNotice, STILL_NEEDED } from './gate-copy';

/**
 * Round 5, Р-3 item 4 — **no reason code is ever shown to a person.**
 *
 * The page translated four of the nine reasons and fell through to the raw code for the rest, so a
 * session whose question budget ran out reported `still needed: ROUND_LIMIT_REACHED`. The maps are
 * keyed by the whole union, which makes an unworded reason a type error; these tests are the other
 * half — that the wording is wording, and not the identifier spelled differently.
 */
describe('gate copy', () => {
  it('words every reason code, in both registers', () => {
    for (const reason of REASON_CODES) {
      expect(STILL_NEEDED[reason], reason).not.toBe('');
      expect(REASON_EXPLANATION[reason], reason).not.toBe('');
    }
  });

  it('never shows the code itself', () => {
    for (const reason of REASON_CODES) {
      expect(STILL_NEEDED[reason], reason).not.toContain(reason);
      expect(REASON_EXPLANATION[reason], reason).not.toContain(reason);
      // Nor the shape of a code: SCREAMING_SNAKE is an identifier, not English.
      expect(STILL_NEEDED[reason], reason).not.toMatch(/[A-Z]{3,}_[A-Z]/);
      expect(REASON_EXPLANATION[reason], reason).not.toMatch(/[A-Z]{3,}_[A-Z]/);
    }
  });

  /*
   * A weaker assertion than the one above, deliberately: two of the three condition identifiers are
   * ordinary English words, so "does not contain the identifier" would forbid the natural wording.
   * What matters is that the identifier is not passed through as the sentence.
   */
  it('words every interview condition', () => {
    for (const condition of INTERVIEW_CONDITIONS) {
      expect(CONDITION_COPY[condition], condition).not.toBe('');
      expect(CONDITION_COPY[condition], condition).not.toBe(condition);
    }
  });

  it('tells an exhausted budget what is exhausted and what to do about it', () => {
    const copy = REASON_EXPLANATION.ROUND_LIMIT_REACHED;

    expect(copy).toContain('question round');
    expect(copy).toContain('next step');
  });

  describe('rejectionNotice', () => {
    it('prefers the reason over a message that names nothing', () => {
      expect(rejectionNotice('That step is not available yet.', 'SPEC_NOT_APPROVED')).toBe(
        REASON_EXPLANATION.SPEC_NOT_APPROVED,
      );
    });

    it("falls back to the handler's message when there is no reason", () => {
      expect(rejectionNotice('That file could not be accepted.', null)).toBe(
        'That file could not be accepted.',
      );
    });

    it('ignores a reason it does not recognise rather than printing it', () => {
      expect(rejectionNotice('A message.', 'SOMETHING_NEW')).toBe('A message.');
      expect(rejectionNotice(null, 'SOMETHING_NEW')).toBeNull();
    });
  });
});
