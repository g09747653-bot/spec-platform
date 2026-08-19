import { serverT } from '../i18n/server-locale';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

/**
 * The MCP Servers placeholder (task 120; Эталон §1.5).
 *
 * It is a **frame**, and it says so. The reference product's project page splits MCP servers into a
 * per-project list and a User Profile list, and that split is worth showing because it is where the
 * capability will live — but nothing behind it exists yet (А-2 Backlog: the MCP runtime is out of
 * scope), so the count is the true one, the button is disabled, and the copy makes no promise about
 * when.
 *
 * A server component with no client behaviour at all: the acceptance criterion is that this card
 * performs no network call, and the surest way to hold it is to render nothing that could.
 */
export async function McpCard() {
  const t = await serverT();

  return (
    <Card data-testid="mcp-card">
      <CardHeader>
        <CardTitle>{t('projects.mcp.title')}</CardTitle>
        <CardDescription>{t('projects.mcp.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{t('projects.mcp.scope-project')}</span>
          {/*
            Task 143: the count as a number, so a test asserts on it rather than on «0 servers».
            A literal, because the card is a frame and there is no runtime behind it to count yet —
            when one arrives, the attribute and the label take their value from the same place.
          */}
          <span
            className="text-foreground-muted text-xs"
            data-testid="mcp-project-count"
            data-count="0"
          >
            {t('projects.mcp.count-none')}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{t('projects.mcp.scope-profile')}</span>
          <span className="text-foreground-muted text-xs" data-testid="mcp-profile-count">
            {t('projects.mcp.count-none')}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled
          data-testid="mcp-add-server"
          className="self-start"
        >
          {t('projects.mcp.add')}
        </Button>
      </CardContent>
    </Card>
  );
}
