import Link from 'next/link';

/**
 * The generic not-found view (AR-2).
 *
 * Deliberately says nothing about *why*: a project that does not exist and a project belonging to
 * someone else must be indistinguishable, and that promise is only as good as the page that keeps it.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="text-ink-muted text-sm">
        We could not find that page. It may have been deleted, or the link may be wrong.
      </p>
      <Link href="/projects" className="text-sm underline" data-testid="not-found-back">
        Back to your projects
      </Link>
    </main>
  );
}
