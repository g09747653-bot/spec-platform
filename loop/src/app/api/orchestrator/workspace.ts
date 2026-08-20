/**
 * The workspace boundary, in one place (tasks 158, 160).
 *
 * The loop binds to the loopback address and has one operator, but a local API that mounts an
 * arbitrary host directory into a container is a local API that can mount `C:\`. So every endpoint
 * that takes a directory checks it against `WORKSPACE_ROOT_PATH` — and checks it with *this*
 * function, because a second endpoint with its own nearly-identical comparison is how a boundary
 * comes to hold on one route and not on another.
 */

/** `directory` is `root` itself or below it — compared on normalised, separator-agnostic paths. */
export function withinWorkspace(root: string, directory: string): boolean {
  const normalise = (value: string) =>
    value.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();

  const normalisedRoot = normalise(root);
  const normalisedDirectory = normalise(directory);

  return (
    normalisedDirectory === normalisedRoot || normalisedDirectory.startsWith(`${normalisedRoot}/`)
  );
}
