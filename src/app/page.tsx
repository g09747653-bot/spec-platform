import { serverT } from '@/modules/web/i18n/server-locale';

export default async function HomePage() {
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
