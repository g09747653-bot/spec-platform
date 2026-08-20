/**
 * The one credential an executor container is handed (task 155; амендмент А-23).
 *
 * Two are possible and exactly one is configured. They are not interchangeable spellings of the
 * same thing — they authenticate against different things and buy different isolation:
 *
 * - **`ANTHROPIC_API_KEY`** — a funded Console key, billed per token. This is the credential
 *   `--bare` mode reads, and `--bare` is the strongest isolation the CLI offers.
 * - **`CLAUDE_CODE_OAUTH_TOKEN`** — the long-lived token `claude setup-token` issues against the
 *   customer's subscription, billed against the plan's own budget. Measured: `--bare` never reads
 *   it (the mode's own help says OAuth and keychain are never read), so the isolation `--bare`
 *   gave has to be re-established flag by flag — see `claudeCommand`.
 *
 * The kind travels with the value because everything downstream needs both: the wrapper names the
 * variable it sets inside the container, and the command builder chooses its isolation flags.
 */

export const EXECUTOR_CREDENTIAL_KINDS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'] as const;

export type ExecutorCredentialKind = (typeof EXECUTOR_CREDENTIAL_KINDS)[number];

export interface ExecutorCredential {
  /** Which variable this is — and, inside the container, the name it is set under. */
  kind: ExecutorCredentialKind;
  value: string;
}
