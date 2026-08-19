# M13п gate — RESULT

Walked 2026-08-19T09:29:16.114Z against `http://127.0.0.1:3000`, live providers, throwaway database.

**Verdict: GREEN** — 0 problem(s), 6 state(s) captured, 0 console record(s) of which 0 unexpected.

## Problems

_None._

## Walk A — «Конкретный», три живых раунда

- **раунд 1** — вопросов 4, опций со справкой 0, внешних ссылок 0
  · `screens/02-concrete-round-1.png`
- **раунд 2** — вопросов 4, опций со справкой 2, внешних ссылок 1
  · `screens/03-concrete-round-2.png`
  · справка раскрылась: да
- **раунд 3** — вопросов 3, опций со справкой 0, внешних ссылок 0
  · `screens/04-concrete-round-3.png`

The rubric's own verdict on the same register is in `preflight/ROUND.md`, written by
`pnpm test:preflight`: it scores the **raw** draft, because the schema drops a hallucinated link and
an unknown logo slug in silence (D-221) and a rubric reading the rendered round would report a clean
one every time.

## Walk B — автономный прогон

Clicks after the session was created: **8** total for the whole script, of which the
autonomous half contributed **0** by construction (the count is asserted above).

_None._

## Measured

_None._

## Prompt truncation (round 4 — the red condition)

`truncating input prompt` records: **0**. One is a red run, whatever else
went well: what a local runtime drops is the head of the prompt — the instruction and the
required-section list (D-146; А-8).

_None._

## Structural rejections (M10п — the second red condition)

`generated document rejected on structure` records: **0**.

_None._

## Context packing (А-8)

0 packing record(s).

_None._

## Console

_None._

## Transcript

- `1s` walk A — «Конкретный», вручную, русский интерфейс
- `2s` alive at a new concrete session: ask-round, proceed, download-export
- `24s` alive at concrete round 1: mcq-reply-toggle, download-export
- `35s` alive at after round 1: ask-round, proceed, download-export
- `91s` alive at concrete round 2: mcq-reply-toggle, download-export
- `102s` alive at after round 2: ask-round, proceed, download-export
- `115s` alive at concrete round 3: mcq-reply-toggle, download-export
- `118s` alive at after round 3: proceed, download-export
