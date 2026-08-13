/**
 * Deliberate violation (task 42; constitution P7 and Technology Constraints — Disallowed).
 *
 * The agent reaching for a provider SDK directly is the exact shape provider neutrality forbids: it
 * would compile, it would work, and it would quietly make one vendor's response format a dependency
 * of business logic. The module boundary rule does not catch it — `ai` is a package, not a module
 * path — so it needs its own restriction.
 *
 * Linted only by `pnpm test:boundaries`.
 */
import { streamText } from 'ai';

export const forbidden = streamText;
