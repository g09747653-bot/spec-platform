import { parentPort, workerData } from 'node:worker_threads';

import { openDatabase } from './open.ts';

/**
 * One writer of the concurrency probe (task 152 AC-2).
 *
 * A worker thread rather than a loop in the test process, because that is the only way the claim
 * means anything: `DatabaseSync` is synchronous, so ten "writers" on one thread are ten writes in a
 * row and could not collide if they tried. Each worker opens its **own** connection to the same
 * file, which is what an orchestrator with ten executors, an architect and a dashboard actually
 * does — and it is the connection, not the database, that carries `busy_timeout`.
 */

const Input = workerData as { path: string; projectId: string; rows: number; role: string };

const database = openDatabase(Input.path);

try {
  const insert = database.prepare(
    'INSERT INTO agent_logs (project_id, agent_role, message, log_level) VALUES (?, ?, ?, ?)',
  );

  for (let index = 0; index < Input.rows; index += 1) {
    insert.run(Input.projectId, Input.role, `${Input.role} line ${String(index)}`, 'INFO');
  }

  parentPort?.postMessage({ ok: true, role: Input.role });
} catch (error) {
  parentPort?.postMessage({ ok: false, role: Input.role, message: String(error) });
} finally {
  database.close();
}
