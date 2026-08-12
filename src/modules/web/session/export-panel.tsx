import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

/**
 * The export panel (task 22; FR-015 AC-4/AC-7).
 *
 * Two things are shown *before* the download, not after: which mode the export will use, and which files
 * will be missing from it. A ZIP whose contents are a surprise is the ambiguity A6 forbids.
 *
 * A plain link rather than a fetch: the browser's own download handling is what makes this work
 * identically on every supported engine (SC-12).
 */
export interface ExportPanelProps {
  projectId: string;
  includedFiles: readonly string[];
  omittedFiles: readonly string[];
}

export function ExportPanel({ projectId, includedFiles, omittedFiles }: ExportPanelProps) {
  return (
    <Card data-testid="export-panel">
      <CardHeader>
        <CardTitle>Export the bundle</CardTitle>
        <CardDescription>
          Mode: <span data-testid="export-mode">default</span> — the four parity files, each at its
          latest approved revision.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm" data-testid="export-included">
          {includedFiles.length === 0
            ? 'Nothing is approved yet, so the archive would be empty.'
            : `Included: ${includedFiles.join(', ')}`}
        </p>

        {omittedFiles.length > 0 && (
          <p className="text-ink-muted text-sm" data-testid="export-omitted">
            Omitted for want of an approved revision: {omittedFiles.join(', ')}
          </p>
        )}

        <a
          href={`/api/projects/${projectId}/export`}
          data-testid="download-export"
          className="bg-accent text-accent-ink inline-flex h-9 items-center justify-center self-start rounded-md px-4 text-sm font-medium hover:opacity-90"
          download
        >
          Download ZIP
        </a>
      </CardContent>
    </Card>
  );
}
