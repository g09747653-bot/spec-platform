import { redirect } from 'next/navigation';

import { auth, signIn } from '@/modules/projects/auth';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/web';
import type { PhraseKey } from '@/modules/web/i18n/dictionary';
import { serverT } from '@/modules/web/i18n/server-locale';

/**
 * The sign-in screen (FR-001 AC-1/AC-4).
 *
 * Both providers are offered side by side and neither depends on the other, so an outage at one
 * leaves the other usable (IR-002-AC-2). A failed or cancelled flow returns here with `?error=`,
 * because Auth.js is configured to use this page as its error page — no account is created on that
 * path, since account creation happens only in the adapter after a successful callback.
 */

const PROVIDERS = [
  { id: 'google', label: 'page.signin.google' },
  { id: 'github', label: 'page.signin.github' },
] as const satisfies readonly { id: string; label: PhraseKey }[];

/**
 * Auth.js error codes, phrased for the person reading them. Anything unrecognised falls back to a
 * generic message: an error string from a provider is untrusted input and is never echoed (S3).
 *
 * The table holds keys rather than sentences since task 143. Keeping the shape means the mapping
 * from a provider's code to the phrasing that answers it stays one table one can read down, and the
 * words move to the dictionary where both languages of each of them live together.
 */
const ERROR_MESSAGES: Record<string, PhraseKey> = {
  OAuthAccountNotLinked: 'page.signin.error-account-not-linked',
  AccessDenied: 'page.signin.error-access-denied',
  Configuration: 'page.signin.error-configuration',
  Verification: 'page.signin.error-verification',
};

const DEFAULT_ERROR: PhraseKey = 'page.signin.error-default';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session?.user) redirect('/projects');

  const t = await serverT();
  const { error } = await searchParams;
  const errorCode = typeof error === 'string' ? error : undefined;
  const errorMessage =
    errorCode === undefined ? undefined : t(ERROR_MESSAGES[errorCode] ?? DEFAULT_ERROR);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('page.signin.title')}</CardTitle>
          <CardDescription>{t('page.signin.tagline')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {errorMessage !== undefined && (
            <p
              role="alert"
              data-testid="signin-error"
              className="rounded-md border border-danger-ink/30 bg-danger-soft px-3 py-2 text-sm text-danger-ink"
            >
              {errorMessage}
            </p>
          )}

          {PROVIDERS.map((provider) => (
            <form
              key={provider.id}
              action={async () => {
                'use server';
                await signIn(provider.id, { redirectTo: '/projects' });
              }}
            >
              <Button type="submit" className="w-full" data-testid={`signin-${provider.id}`}>
                {t(provider.label)}
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
