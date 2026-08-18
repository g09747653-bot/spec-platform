import { describe, expect, it } from 'vitest';

import { INTERVIEW_CONDITIONS, REASON_CODES } from '@/modules/workflow/reason-codes';

import { ERROR_STATUS, type ErrorCode } from '../api/responses';
import { LOCALES } from '../i18n/phrase';
import { translator } from '../i18n/translate';

import {
  API_EXPLANATION,
  CONDITION_COPY,
  REASON_EXPLANATION,
  rejectionNotice,
  STILL_NEEDED,
} from './gate-copy';

/**
 * Round 5, Р-3 item 4 — **no reason code is ever shown to a person.**
 *
 * The page translated four of the nine reasons and fell through to the raw code for the rest, so a
 * session whose question budget ran out reported `still needed: ROUND_LIMIT_REACHED`. The maps are
 * keyed by the whole union, which makes an unworded reason a type error; these tests are the other
 * half — that the wording is wording, and not the identifier spelled differently.
 *
 * Since task 143 the maps hold keys and the words are resolved through a translator, so every check
 * below runs in **both languages**. That is deliberate and it is where the value moved: a key with no
 * Russian half is a type error, but a Russian half that quietly copied the identifier across is not,
 * and the second language is exactly where a hurried translation reaches for the token.
 */
const TRANSLATORS = LOCALES.map((locale) => [locale, translator(locale)] as const);

describe('gate copy', () => {
  it('words every reason code, in both registers and both languages', () => {
    for (const [locale, t] of TRANSLATORS) {
      for (const reason of REASON_CODES) {
        expect(t(STILL_NEEDED[reason]).trim(), `${reason} in ${locale}`).not.toBe('');
        expect(t(REASON_EXPLANATION[reason]).trim(), `${reason} in ${locale}`).not.toBe('');
      }
    }
  });

  it('never shows the code itself', () => {
    for (const [locale, t] of TRANSLATORS) {
      for (const reason of REASON_CODES) {
        expect(t(STILL_NEEDED[reason]), `${reason} in ${locale}`).not.toContain(reason);
        expect(t(REASON_EXPLANATION[reason]), `${reason} in ${locale}`).not.toContain(reason);
        // Nor the shape of a code: SCREAMING_SNAKE is an identifier, not a sentence in any language.
        expect(t(STILL_NEEDED[reason]), `${reason} in ${locale}`).not.toMatch(/[A-Z]{3,}_[A-Z]/);
        expect(t(REASON_EXPLANATION[reason]), `${reason} in ${locale}`).not.toMatch(
          /[A-Z]{3,}_[A-Z]/,
        );
      }
    }
  });

  /*
   * A weaker assertion than the one above, deliberately: two of the three condition identifiers are
   * ordinary English words, so "does not contain the identifier" would forbid the natural wording.
   * What matters is that the identifier is not passed through as the sentence.
   */
  it('words every interview condition', () => {
    for (const [locale, t] of TRANSLATORS) {
      for (const condition of INTERVIEW_CONDITIONS) {
        expect(t(CONDITION_COPY[condition]).trim(), `${condition} in ${locale}`).not.toBe('');
        expect(t(CONDITION_COPY[condition]), `${condition} in ${locale}`).not.toBe(condition);
      }
    }
  });

  it('tells an exhausted budget what is exhausted and what to do about it', () => {
    const english = translator('en')(REASON_EXPLANATION.ROUND_LIMIT_REACHED);

    expect(english).toContain('question round');
    expect(english).toContain('next step');

    // The Russian says the same two things, in the two words the standard fixes for them (§2.2).
    const russian = translator('ru')(REASON_EXPLANATION.ROUND_LIMIT_REACHED);

    expect(russian).toContain('раунд');
    expect(russian).toContain('шагу');
  });

  /**
   * The Russian half of the original complaint (task 143).
   *
   * The customer's browser auto-translated the English chrome and produced «врата» for *gate* — a
   * translation worse than leaving it in English. The whole standard exists because of that word, and
   * this is the surface it would have appeared on, so the ban is a test rather than a note: refusal
   * copy says «условие перехода», never a gate, a portal or a transliteration.
   */
  it('never calls a gate a gate in Russian', () => {
    const ru = translator('ru');
    const forbidden = ['врат', 'ворот', 'шлюз', 'барьер', 'гейт'];

    for (const reason of REASON_CODES) {
      for (const text of [ru(STILL_NEEDED[reason]), ru(REASON_EXPLANATION[reason])]) {
        for (const word of forbidden) {
          expect(text.toLowerCase(), `${reason} says "${word}"`).not.toContain(word);
        }
      }
    }
  });

  /**
   * Task 143 — the browser's own words for an API error code.
   *
   * `web/api/responses.ts` answers in English by design, and this map is what turns a code into a
   * sentence the reader can have in their own language. Keyed by the whole `ErrorCode` union, so a
   * handler added in a later milestone cannot slip past without somebody deciding what it says.
   */
  describe('API_EXPLANATION', () => {
    it('has an answer for every error code the API can send', () => {
      const codes = Object.keys(ERROR_STATUS) as ErrorCode[];

      for (const code of codes) {
        expect(Object.hasOwn(API_EXPLANATION, code), code).toBe(true);
      }
    });

    it('leaves the codes whose own message knows more', () => {
      // FR-004 AC-4: the rejection names the limit or the supported types, and only the guard knows.
      expect(API_EXPLANATION.UPLOAD_REJECTED).toBeNull();
    });
  });

  describe('rejectionNotice', () => {
    const t = translator('en');

    it('prefers the reason over a message that names nothing', () => {
      expect(
        rejectionNotice(t, 'That step is not available yet.', 'SPEC_NOT_APPROVED', 'GATE_REJECTED'),
      ).toBe(t(REASON_EXPLANATION.SPEC_NOT_APPROVED));
    });

    it('prefers the error code over the server’s message when there is no reason', () => {
      expect(rejectionNotice(t, 'The session moved on.', null, 'CONFLICT')).toBe(
        t('errors.api.conflict'),
      );
    });

    it("falls back to the handler's message where the code has no phrase of its own", () => {
      expect(rejectionNotice(t, 'That file is larger than 10 MB.', null, 'UPLOAD_REJECTED')).toBe(
        'That file is larger than 10 MB.',
      );
    });

    it('ignores a reason it does not recognise rather than printing it', () => {
      expect(rejectionNotice(t, 'A message.', 'SOMETHING_NEW')).toBe('A message.');
      expect(rejectionNotice(t, null, 'SOMETHING_NEW')).toBeNull();
    });

    it('ignores an error code it does not recognise rather than printing it', () => {
      expect(rejectionNotice(t, 'A message.', null, 'FROM_A_LATER_MILESTONE')).toBe('A message.');
      expect(rejectionNotice(t, null, null, 'FROM_A_LATER_MILESTONE')).toBeNull();
    });
  });
});
