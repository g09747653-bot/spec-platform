'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { type PhraseKey } from '../i18n/dictionary';
import { useT } from '../i18n/locale-context';
import { type Translate } from '../i18n/translate';
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
 *
 * The translator is a parameter rather than a hook call (task 143), which keeps the function what it
 * was — a pure choice between four phrases — and testable against a locale of the caller's choosing.
 * The choice itself is the part worth testing; Russian needs three forms of each unit where English
 * needs none, and a bracket picked one step wrong is a plural picked wrong in three languages at
 * once.
 */
export function lastMessageLabel(t: Translate, ageSeconds: number): string {
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 1) return t('projects.chat-list.last-message-now');
  if (minutes < 60) return t('projects.chat-list.last-message-minutes', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('projects.chat-list.last-message-hours', { count: hours });

  const days = Math.floor(hours / 24);
  return t('projects.chat-list.last-message-days', { count: days });
}

function ArchiveButton({ chat }: { chat: ChatListItem }) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PhraseKey | null>(null);

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
        setError('projects.chat-list.failed');
        showToast(t('projects.chat-list.archive-failed'), 'danger', 'chat-archive-failed');
        return;
      }

      // Task 125: the row itself is about to be filtered out of the list by the refresh, so the
      // confirmation has to live somewhere the row does not — otherwise the only feedback for a
      // successful archive is a chat disappearing.
      showToast(
        t(chat.archived ? 'projects.chat-list.restored' : 'projects.chat-list.archived'),
        'success',
        chat.archived ? 'chat-restored' : 'chat-archived',
      );
      router.refresh();
    } catch {
      setError('projects.chat-list.failed');
      showToast(t('projects.chat-list.archive-failed'), 'danger', 'chat-archive-failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error !== null && (
        <span role="alert" className="text-xs text-danger-ink" data-testid="chat-error">
          {t(error)}
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
        {busy
          ? t('projects.chat-list.busy')
          : chat.archived
            ? t('projects.chat-list.restore')
            : t('projects.chat-list.archive')}
      </Button>
    </span>
  );
}

export function ChatList({ chats }: { chats: readonly ChatListItem[] }) {
  const t = useT();

  if (chats.length === 0) {
    return (
      <Card data-testid="chats-empty">
        <CardHeader>
          <CardTitle>{t('projects.chat-list.empty-title')}</CardTitle>
          <CardDescription>{t('projects.chat-list.empty-body')}</CardDescription>
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
                    {chat.completed ? t('projects.chat-list.status-completed') : chat.stageLabel}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                {/*
                  Task 143: the number the label was formatted from travels beside it, because the
                  words are about to become translatable and «Last message 3d ago» is the only thing
                  a test could read today.
                */}
                <span
                  className="text-foreground-muted text-xs"
                  data-testid="chat-age"
                  data-age-seconds={String(chat.ageSeconds)}
                >
                  {lastMessageLabel(t, chat.ageSeconds)}
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
