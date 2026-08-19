import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { RU } from '../ui/strings.ts';

import './globals.css';

/**
 * The dashboard's document shell (task 153).
 *
 * `lang="ru"` is static because the surface is (see `ui/strings.ts`): one operator, one language,
 * no locale machinery. No authentication surface exists anywhere in this tree — the loop binds to
 * the loopback address and there is nobody else on it.
 */
export const metadata: Metadata = {
  title: RU.title,
  description: RU.subtitle,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
