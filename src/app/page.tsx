import { redirect } from 'next/navigation';

import { isLocalSingleUser } from '@/modules/projects/auth/local-owner';
import { serverT } from '@/modules/web/i18n/server-locale';

export default async function HomePage() {
  // In local single-user mode the deployment is one person's workbench: opening it IS opening their
  // projects, with no marketing page and no sign-in step in between (task 148 AC-1).
  if (isLocalSingleUser()) redirect('/projects');

  const t = await serverT();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 data-testid="app-heading" className="text-h1">
        {t('shell.brand.name')}
      </h1>
      <p className="text-foreground-muted">{t('page.home.placeholder')}</p>
    </main>
  );
}
