import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Db } from './db';

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'db', 'migrations');
const MIGRATION_LOCK_ID = 4_815_162_342;

/** Applies every db/migrations/*.sql file that hasn't run yet, in file-name order. */
export async function runMigrations(db: Db, log: (message: string) => void = console.log): Promise<void> {
  await db.transaction(async (tx) => {
    // Serialises migrations if two instances start at the same moment.
    await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    await tx.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const applied = new Set((await tx.query<{ name: string }>('SELECT name FROM schema_migrations')).map((row) => row.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      log(`Applied migration ${file}`);
    }
  });
}
