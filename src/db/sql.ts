import type { SQL } from 'drizzle-orm';
import { z, type ZodType } from 'zod';

import type { SchemaDatabase } from './index';

/**
 * The shape every driver returns from `execute`. Typed as `unknown` by Drizzle when the database
 * handle is driver-agnostic, so it is parsed rather than assumed.
 */
const ResultSet = z.object({ rows: z.array(z.unknown()) });

/**
 * Runs a raw SQL statement and validates every returned row with Zod.
 *
 * Raw SQL is needed where the query builder cannot express the statement — chaining several inserts
 * through CTEs so they are atomic without an interactive transaction, which the production driver
 * does not offer (D-16). That is a legitimate need; trusting the shape of what comes back is not.
 * Every caller declares the row schema, so an unexpected result fails here at the boundary instead of
 * surfacing as an `undefined` three layers deeper (constitution — Coding Standards: runtime validation
 * at every boundary).
 */
export async function queryRows<T>(
  db: SchemaDatabase,
  statement: SQL,
  row: ZodType<T>,
): Promise<T[]> {
  const result = await db.execute(statement);
  const { rows } = ResultSet.parse(result);

  return z.array(row).parse(rows);
}

/** As `queryRows`, for a statement that must return exactly one row. */
export async function queryOneRow<T>(
  db: SchemaDatabase,
  statement: SQL,
  row: ZodType<T>,
): Promise<T> {
  const rows = await queryRows(db, statement, row);
  const first = rows[0];

  if (first === undefined || rows.length !== 1) {
    throw new Error(`expected exactly one row, received ${String(rows.length)}`);
  }

  return first;
}
