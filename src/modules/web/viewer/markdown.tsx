import type { ReactNode } from 'react';

import { outlineOf } from './outline';

/**
 * A small markdown renderer for the Preview pane (task 122).
 *
 * **Written rather than installed**, and the reason is the same one that vendored the UI primitives
 * (D-10): a renderer is a runtime dependency that reads model output, and the subset our documents
 * actually use is small enough to write in one file — headings, paragraphs, lists, block quotes,
 * fenced code, tables, and inline emphasis, code and links. Anything outside that subset renders as
 * the plain text it is, which is the honest failure: a document is never blank because one construct
 * was unsupported.
 *
 * **Nothing here can inject markup.** There is no `dangerouslySetInnerHTML` anywhere in this file:
 * every node is a React element built from parsed text, so raw HTML in a document is displayed
 * rather than executed. Model output and uploaded documents are untrusted input (constitution S3),
 * and a Preview pane is exactly where that stops being theoretical.
 *
 * Headings carry the anchors `outlineOf` computes, from the same function — so the Outline's links
 * and the Preview's ids cannot disagree, including about which «Acceptance Criteria» is the second.
 */

/** Inline emphasis, code and links, in one pass over the text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)|(\[[^\]]+\]\([^)\s]+\))/g;

  let last = 0;
  let index = 0;

  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    if (at > last) nodes.push(text.slice(last, at));

    const token = match[0];
    const key = `${keyPrefix}-${String(index)}`;
    index += 1;

    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="bg-background rounded px-1 py-0.5 text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('[')) {
      const split = token.indexOf('](');
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);

      /*
       * `rel="noreferrer"` and no `target`: a link in a generated document is third-party content,
       * and opening it in place keeps the referrer and the tab under the reader's control.
       */
      nodes.push(
        <a key={key} href={href} rel="noreferrer nofollow" className="underline">
          {label}
        </a>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    last = at + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));

  return nodes;
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-h1',
  2: 'text-h2',
  3: 'text-h3',
  4: 'text-base font-semibold',
  5: 'text-sm font-semibold',
  6: 'text-sm font-medium',
};

interface Block {
  key: string;
  node: ReactNode;
}

export function Markdown({ content }: { content: string }) {
  const anchors = new Map(outlineOf(content).map((heading) => [heading.line, heading.anchor]));
  const lines = content.split('\n');
  const blocks: Block[] = [];

  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    // A fenced code block, verbatim to its closing fence (or to the end of the document).
    const fence = /^\s{0,3}(```|~~~)(.*)$/.exec(line);
    if (fence !== null) {
      const marker = fence[1] ?? '```';
      const body: string[] = [];
      index += 1;

      while (index < lines.length && !(lines[index] ?? '').trimStart().startsWith(marker)) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      index += 1;

      blocks.push({
        key: `code-${String(blocks.length)}`,
        node: (
          <pre className="bg-background border-border-subtle overflow-x-auto rounded-md border p-3 text-xs">
            <code>{body.join('\n')}</code>
          </pre>
        ),
      });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading !== null) {
      const level = (heading[1] ?? '').length;
      const text = (heading[2] ?? '').trim();
      const anchor = anchors.get(index) ?? '';
      const Tag = `h${String(Math.min(level, 6))}` as 'h1';

      blocks.push({
        key: `heading-${String(blocks.length)}`,
        node: (
          <Tag
            id={anchor}
            data-anchor={anchor}
            className={`${HEADING_CLASS[level] ?? ''} scroll-mt-4`}
          >
            {renderInline(text, `h${String(blocks.length)}`)}
          </Tag>
        ),
      });
      index += 1;
      continue;
    }

    // A list: consecutive bullet or numbered items, with anything indented under them kept inline.
    const bullet = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet !== null) {
      const ordered = /\d/.test(bullet[1] ?? '');
      const items: string[] = [];

      while (index < lines.length) {
        const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(lines[index] ?? '');
        if (item === null) break;

        items.push(item[1] ?? '');
        index += 1;
      }

      const ListTag = ordered ? 'ol' : 'ul';

      blocks.push({
        key: `list-${String(blocks.length)}`,
        node: (
          <ListTag className={`ml-5 flex flex-col gap-1 ${ordered ? 'list-decimal' : 'list-disc'}`}>
            {items.map((item, position) => (
              <li key={`${String(position)}-${item.slice(0, 24)}`}>
                {renderInline(item, `li${String(blocks.length)}-${String(position)}`)}
              </li>
            ))}
          </ListTag>
        ),
      });
      continue;
    }

    if (line.trimStart().startsWith('>')) {
      const quoted: string[] = [];

      while (index < lines.length && (lines[index] ?? '').trimStart().startsWith('>')) {
        quoted.push((lines[index] ?? '').replace(/^\s*>\s?/, ''));
        index += 1;
      }

      blocks.push({
        key: `quote-${String(blocks.length)}`,
        node: (
          <blockquote className="border-border text-foreground-muted border-l-2 pl-3">
            {renderInline(quoted.join(' '), `q${String(blocks.length)}`)}
          </blockquote>
        ),
      });
      continue;
    }

    // A table: a header row, a delimiter row, then body rows until the block ends.
    if (line.includes('|') && /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(lines[index + 1] ?? '')) {
      const cells = (row: string) =>
        row
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          .split('|')
          .map((cell) => cell.trim());

      const header = cells(line);
      index += 2;
      const rows: string[][] = [];

      while (index < lines.length && (lines[index] ?? '').includes('|')) {
        rows.push(cells(lines[index] ?? ''));
        index += 1;
      }

      blocks.push({
        key: `table-${String(blocks.length)}`,
        node: (
          <div className="overflow-x-auto">
            <table className="border-border-subtle w-full border-collapse border text-sm">
              <thead>
                <tr>
                  {header.map((cell, position) => (
                    <th
                      key={`${String(position)}-${cell}`}
                      className="border-border-subtle border px-2 py-1 text-left font-medium"
                    >
                      {renderInline(cell, `th${String(position)}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`row-${String(rowIndex)}`}>
                    {row.map((cell, position) => (
                      <td
                        key={`${String(position)}-${cell}`}
                        className="border-border-subtle border px-2 py-1 align-top"
                      >
                        {renderInline(cell, `td${String(rowIndex)}-${String(position)}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      });
      continue;
    }

    // Anything else is a paragraph, running to the next blank line.
    const paragraph: string[] = [];

    while (index < lines.length && (lines[index] ?? '').trim() !== '') {
      const next = lines[index] ?? '';
      if (/^(#{1,6})\s/.test(next) && paragraph.length > 0) break;

      paragraph.push(next);
      index += 1;
    }

    blocks.push({
      key: `p-${String(blocks.length)}`,
      node: <p>{renderInline(paragraph.join(' '), `p${String(blocks.length)}`)}</p>,
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed" data-testid="viewer-preview">
      {blocks.map((block) => (
        <div key={block.key} className="contents">
          {block.node}
        </div>
      ))}
    </div>
  );
}
