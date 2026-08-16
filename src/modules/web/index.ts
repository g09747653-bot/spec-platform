/**
 * `web` — UI, routes, presentation.
 *
 * The browser holds no secrets and makes no model calls. Presentation code reaches the domain
 * only through server actions and route handlers.
 *
 * Must not import: `agents`, `quality`, `adapters`, or any repository.
 */
export const MODULE_ID = 'web';

export { AppShell } from './layouts/app-shell';
export { NewProjectForm } from './projects/new-project-form';
export { ProjectList, type ProjectListItem } from './projects/project-list';
export { Button, buttonVariants, type ButtonProps } from './ui/button';
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
export { Input, Label, Textarea } from './ui/field';
export { showToast, type ToastTone } from './ui/toast';
export { ToastViewport } from './ui/toast-viewport';
export { BrandLoader } from './theme/brand-loader';
export { BrandMark } from './theme/brand-mark';
export { ThemeScript } from './theme/theme-script';
export { ThemeToggle } from './theme/theme-toggle';
export { SERVER_DEFAULT_THEME, THEME_ATTRIBUTE, THEME_STORAGE_KEY } from './theme/theme';
export { ConnectionBanner } from './session/connection-banner';
export { cn } from './lib/cn';
