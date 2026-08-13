/**
 * Deliberate violation (task 46 AC-2; D-8): `EventSource` anywhere in the codebase.
 *
 * It is the obvious thing to reach for with a server-sent stream, and it is wrong here for three
 * concrete reasons: it cannot issue the `POST` the generation stream needs, it cannot set headers, and it
 * reconnects on a policy of its own that resume has no way to steer. One fetch-based reader serves
 * both the `POST` and the `GET` path instead.
 *
 * Linted only by `pnpm test:boundaries`.
 */
export function subscribe(runId: string): unknown {
  return new EventSource(`/api/generations/${runId}/stream`);
}
