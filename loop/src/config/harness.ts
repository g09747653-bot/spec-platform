/**
 * Whether the end-to-end harness route exists in this process (task 153).
 *
 * Read directly rather than through `getEnv()`, and deliberately so: this is not configuration of
 * the loop, it is a property of *how this process was started for a test*. Putting it in the
 * validated schema would make it a documented deployment option, which is the opposite of what it
 * is — a real deployment never sets it, and `.env.example` does not mention it.
 */
/* eslint-disable no-restricted-properties -- the one reader of the harness flags; see above. */
export function harnessEnabled(): boolean {
  return process.env.LOOP_E2E === '1';
}

/**
 * Whether this process runs a **scripted** executor instead of the real one.
 *
 * Set only by the gate walk's rehearsal (`GATE_STUB=1`), and for the reason the M14а gate wrote
 * down: the bookkeeping of a walk is untested code, and rehearsing the whole of it — intake, cycle,
 * the kill, the restart, the artifacts, the verdict — with a shell script where the model goes
 * catches its defects before an hour of live run is spent on them.
 *
 * A real deployment never sets it, and `.env.example` does not mention it.
 */
export function executorStubEnabled(): boolean {
  return process.env.LOOP_EXECUTOR_STUB === '1';
}
/* eslint-enable no-restricted-properties */

/**
 * How long the scripted executor pretends to work, in seconds — **and not the same for every task**.
 *
 * Three by default, which keeps an ordinary rehearsal quick. Two things the gate rehearsal taught,
 * both of them about being representative rather than convenient:
 *
 * - it has to be **long** enough that executors are still running when the first acceptance returns
 *   a verdict, because «красный CI замораживает работающих исполнителей» cannot be rehearsed against
 *   a container that has already exited;
 * - it has to be **uneven**, because a wave of identical stubs starts together, finishes together
 *   and reaches acceptance together — so there is never a moment with one task red and others still
 *   working, which is precisely the moment the freeze exists for. Real executors differ by minutes;
 *   a uniform stub was the unrealistic part, not the timing of the walk.
 *
 * The spread is derived from the task id, so it is deterministic: the same plan rehearses the same
 * way twice.
 */
export function executorStubSeconds(taskId = ''): number {
  /* eslint-disable-next-line no-restricted-properties -- see the note on this module. */
  const raw = Number(process.env.LOOP_EXECUTOR_STUB_SLEEP ?? '3');
  const base = Number.isFinite(raw) && raw >= 0 ? raw : 3;

  const spread = [...taskId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4;

  return Math.round(base * (0.4 + 0.3 * spread));
}

/**
 * What the scripted executor does: exactly what a real one must — touch the workspace, then leave a
 * report where the orchestrator will look for it.
 */
export function executorStubCommand(taskId: string, projectId: string): string[] {
  const report = {
    reportId: `r-stub-${taskId}`,
    taskId,
    projectId,
    executorId: 'executor_stub',
    status: 'SUCCESS',
    testsRun: { total: 1, passed: 1, failed: 0 },
    decisionTitle: 'Репетиция: содержательной правки не требуется',
    rationale: 'Стабовый исполнитель проверяет бухгалтерию прогулки, а не саму задачу.',
  };

  return [
    'sh',
    '-c',
    [
      'echo "стаб-исполнитель начал"',
      `sleep ${String(executorStubSeconds(taskId))}`,
      "printf '%s\\n' '// отметка стабового исполнителя гейта M15а' >> /workspace/README.md",
      `mkdir -p /workspace/handoff/reports`,
      `cat > "/workspace/handoff/reports/report_${taskId}.json" <<'JSON'`,
      JSON.stringify(report, null, 2),
      'JSON',
      'echo "стаб-исполнитель закончил"',
    ].join('\n'),
  ];
}
