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
export { cn } from './lib/cn';
