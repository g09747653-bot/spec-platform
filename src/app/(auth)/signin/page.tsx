import { redirect } from 'next/navigation';

import { auth, signIn } from '@/modules/projects/auth';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/web';

/**
 * The sign-in screen (FR-001 AC-1/AC-4).
 *
 * Both providers are offered side by side and neither depends on the other, so an outage at one
 * leaves the other usable (IR-002-AC-2). A failed or cancelled flow returns here with `?error=`,
 * because Auth.js is configured to use this page as its error page — no account is created on that
 * path, since account creation happens only in the adapter after a successful callback.
 */

const PROVIDERS = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'github', label: 'Continue with GitHub' },
] as const;

/**
 * Auth.js error codes, phrased for the person reading them. Anything unrecognised falls back to a
 * generic message: an error string from a provider is untrusted input and is never echoed (S3).
 */
const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    'That email address is already registered through the other provider. Sign in with the provider you used first.',
  AccessDenied: 'The sign-in was cancelled, so no account was created. You can try again.',
  Configuration: 'Sign-in is misconfigured on the server. The problem has been logged.',
  Verification: 'That sign-in link has expired. Start again to get a new one.',
};

const DEFAULT_ERROR = 'The sign-in did not complete, so no account was created. Please try again.';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session?.user) redirect('/projects');

  const { error } = await searchParams;
  const errorCode = typeof error === 'string' ? error : undefined;
  const errorMessage =
    errorCode === undefined ? undefined : (ERROR_MESSAGES[errorCode] ?? DEFAULT_ERROR);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to Spec Platform</CardTitle>
          <CardDescription>
            Turn a plain-language prompt into an agent-ready specification bundle.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {errorMessage !== undefined && (
            <p
              role="alert"
              data-testid="signin-error"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
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
                {provider.label}
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
