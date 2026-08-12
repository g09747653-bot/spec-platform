import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/web';

/**
 * Empty state of the authenticated area.
 *
 * Static on purpose: task 15 replaces this with the real project list backed by
 * `GET /api/projects` and the create-from-prompt flow (FR-002 AC-1; FR-003).
 */
export default function ProjectsPage() {
  return (
    <section className="flex flex-col gap-6" data-testid="app-shell">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-ink-muted text-sm">
          Each project holds one specification bundle and the session that produced it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>No projects yet</CardTitle>
          <CardDescription>
            Starting a project from a prompt arrives with the walking skeleton in Milestone 1.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>New project</Button>
        </CardContent>
      </Card>
    </section>
  );
}
