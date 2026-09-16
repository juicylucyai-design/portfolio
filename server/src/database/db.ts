import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResultRow, types } from 'pg';

// Postgres returns BIGINT, NUMERIC and DATE as strings by default.
// Ids fit safely in a JS number, amounts are NUMERIC(20,2), and dates stay as plain 'YYYY-MM-DD' strings
// so they never shift with the server's time zone.
types.setTypeParser(types.builtins.INT8, (value) => Number(value));
types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));
types.setTypeParser(types.builtins.DATE, (value) => value);

export interface Queryable {
  query<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
}

@Injectable()
export class Db implements Queryable, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Point it at a PostgreSQL database (on Railway: ${{Postgres.DATABASE_URL}}).');
    }
    this.pool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  }

  async query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  /** Runs `work` in one transaction; rolls back if it throws. */
  async transaction<R>(work: (tx: Queryable) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    const tx: Queryable = {
      query: async <T extends QueryResultRow>(sql: string, params: unknown[] = []) => (await client.query<T>(sql, params)).rows,
    };
    try {
      await client.query('BEGIN');
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
