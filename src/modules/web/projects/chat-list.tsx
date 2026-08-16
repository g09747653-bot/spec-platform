'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { showToast } from '../ui/toast';

/**
 * The project's chats (task 120; Эталон §1.5 — the project page).
 *
 * One row per conversation, with what a person needs to tell them apart: what it is called, which
 * methodology it walks, where it has got to, and how long ago anything happened in it. The age is
 * **given** to this component already computed, in seconds, from the database's own clock — a
 * relative time worked out in the browser would drift with the visitor's system clock and would
 * differ between the server render and the hydrated one (task 120 AC-2).
 */
export interface ChatListItem {
  id: string;
  title: string;
  archived: boolean;
  badge: string;
  stageLabel: string;
  completed: boolean;
  bundleLabel: string;
  ageSeconds: number;
}

/**
 * «Last message 3d ago», from a number of seconds.
 *
 * Rendered rather than stored, and the input is a difference the database computed, so this is
 * formatting and nothing else. Deliberately coarse: the reference product says "3d ago", and a
 * minute-accurate label would go stale on the page while nothing had happened.
 */
export function lastMessageLabel(ageSeconds: number): string {
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 1) return 'Last message just now';
  if (minutes < 60) return `Last message ${String(minutes)}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last message ${String(hours)}h ago`;

  const days = Math.floor(hours / 24);
  return `Last message ${String(days)}d ago`;
}

function ArchiveButton({ chat }: { chat: ChatListItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${chat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !chat.archived }),
      });

      if (!response.ok) {
        setError('That did not go through. Please try again.');
        showToast('That chat could not be archived. Nothing changed.', 'danger');
        return;
      }

      // Task 125: the row itself is about to be filtered out of the list by the refresh, so the
      // confirmation has to live somewhere the row does not — otherwise the only feedback for a
      // successful archive is a chat disappearing.
      showToast(
        chat.archived ? 'Chat restored.' : 'Chat archived. Restore it from Archived.',
        'success',
      );
      router.refresh();
    } catch {
      setError('That did not go through. Please try again.');
      showToast('That chat could not be archived. Nothing changed.', 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error !== null && (
        <span role="alert" className="text-xs text-danger-ink" data-testid="chat-error">
          {error}
        </span>
      )}
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        data-testid={chat.archived ? 'restore-chat' : 'archive-chat'}
        onClick={() => {
          void toggle();
        }}
      >
        {busy ? 'Working…' : chat.archived ? 'Restore' : 'Archive'}
      </Button>
    </span>
  );
}

export function ChatList({ chats }: { chats: readonly ChatListItem[] }) {
  if (chats.length === 0) {
    return (
      <Card data-testid="chats-empty">
        <CardHeader>
          <CardTitle>No chats here</CardTitle>
          <CardDescription>
            Nothing matches this tab, filter and search together. Archived chats are still here —
            switch the filter to see them.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-3" data-testid="chats-list">
      {chats.map((chat) => (
        <li key={chat.id}>
          <Card className="hover:border-border-strong transition-colors">
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-4">
                <Link
                  href={`/sessions/${chat.id}`}
                  className="truncate font-medium hover:underline"
                  data-testid="chat-row"
                >
                  <span data-testid="chat-title">{chat.title}</span>
                </Link>
                <span className="text-foreground-muted flex shrink-0 items-center gap-3 text-xs">
                  <span data-testid="chat-methodology">{chat.badge}</span>
                  <span data-testid="chat-bundle">{chat.bundleLabel}</span>
                  <span data-testid="chat-status">
                    {chat.completed ? 'Completed' : chat.stageLabel}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-foreground-muted text-xs" data-testid="chat-age">
                  {lastMessageLabel(chat.ageSeconds)}
                </span>
                <ArchiveButton chat={chat} />
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
