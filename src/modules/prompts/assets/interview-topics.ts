/**
 * What each round is *about*, in the user's language (round 2, Д-3).
 *
 * The interview used to hand the model the stage name — `Stage: constitution` — and let it work out
 * what to ask. What it worked out was meta: "what should the constitution document emphasise?". That
 * is a question about our artifact, asked of someone who came here to describe their product, and it
 * is unanswerable by the non-technical founders the constitution names as target users.
 *
 * So the stage no longer travels into the prompt at all. It selects a **topic list**, and the topics
 * are things a person knows about their own idea. The spec file being collected for is our business;
 * the questions are theirs.
 *
 * A leaf module: it imports nothing. The stage arrives as a plain string because `prompts` may import
 * only `specs` (constitution A1), and an unknown stage falls back to the grounding topics rather than
 * to nothing — a round of sensible questions beats a round of none.
 */

/** Topics that are always in scope, whatever is being collected. */
const GROUNDING = [
  'who will use this and what they are trying to get done',
  'what those people do today instead, and what is painful about it',
  'what would make this obviously worth using',
] as const;

const TOPICS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  interview: GROUNDING,

  /*
   * The constitution stage collects the *non-negotiables*. Asked as a founder would think of them:
   * what must never happen, who must never see what, what the product will deliberately not do.
   */
  constitution: [
    'what this product must never do, or must always do, no matter what',
    'what kind of information it will hold, and how sensitive that is',
    'anything it should deliberately stay out of, at least at first',
    'what "working well" would look like a few months in',
  ],

  /* Requirements: what people can actually do with it. */
  requirements: [
    'the handful of things a user should be able to do from start to finish',
    'what someone types in, and what they get back',
    'whether different people see different things — for example an owner and a guest',
    'anything that has to happen automatically, without anyone asking',
    'whether money, invitations, reminders or notifications are involved',
  ],

  /* Solution: the shape of the thing, still without asking for a design. */
  solution: [
    'where people will use this — phone, laptop, both',
    'whether it needs to work with anything they already use',
    'roughly how many people will use it, and whether that changes quickly',
    'whether anything needs to keep working without a connection',
    'anything that already exists which this has to fit alongside',
  ],

  /* Tasks: sequencing, in the language of what to build first. */
  tasks: [
    'what would have to work for a first version to be useful at all',
    'what can wait until later without hurting anyone',
    'whether anything has a date attached to it',
    'who will be building this, and what they are comfortable with',
  ],

  /* Quality is optional and additive; its topics are about confidence, not about the file. */
  quality: [
    'what would be most costly to get wrong',
    'where you are least sure the plan is right',
    'what you would want checked before handing this to someone to build',
  ],
});

export function topicsForStage(stage: string): readonly string[] {
  return TOPICS[stage] ?? GROUNDING;
}

/** The topic list as the prompt renders it: one per line, dash-led. */
export function topicBlock(stage: string): string {
  return topicsForStage(stage)
    .map((topic) => `- ${topic}`)
    .join('\n');
}
