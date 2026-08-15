import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

import type { FeedBlock } from './model';

/**
 * The wrapper every block of the conversation is rendered inside (task 105; Эталон §1.1).
 *
 * The `data-msg-*` attributes are the reference product's own navigation contract: id, role, stage
 * and substage on every message, so scrolling to a position, anchoring a link, or asking "what was
 * the session doing when this was written?" is a DOM query rather than a guess. Ours carry the same
 * four facts because the projection already computes all four for every block — the attributes are a
 * rendering of `FeedBlockBase`, not a second source of them.
 *
 * A first line of defence for S3 lives here too: every block's text reaches the DOM as a JSX child,
 * never as markup, so model-authored and user-authored content is escaped by construction
 * (NFR-009 AC-3).
 */
export function FeedItem({
  block,
  children,
  align = 'left',
  className,
}: {
  block: FeedBlock;
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string | undefined;
}) {
  return (
    <div
      data-msg-id={block.id}
      data-msg-role={block.role}
      data-msg-stage={block.stage}
      data-msg-substage={block.substage ?? ''}
      data-msg-kind={block.kind}
      data-testid={`feed-block-${block.kind}`}
      className={cn(
        'flex w-full',
        align === 'right' && 'justify-end',
        align === 'center' && 'justify-center',
        className,
      )}
    >
      {children}
    </div>
  );
}
