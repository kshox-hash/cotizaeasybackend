import { Pool, PoolClient } from "pg";
import { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT, PGSSL } from "../config/env";

type TxFn<T> = (client: PoolClient) => Promise<T>;

export default class DB {
  private static pool: Pool | null = null;

  static getPool(): Pool {
    if (!DB.pool) {
      DB.pool = new Pool({
        host:     PGHOST,
        port:     PGPORT,
        user:     PGUSER,
        password: PGPASSWORD,
        database: PGDATABASE,
        max: 10,
        idleTimeoutMillis:       30_000,
        connectionTimeoutMillis:  5_000,
        statement_timeout:       10_000,
        ssl: PGSSL ? { rejectUnauthorized: false } : false,
      });

      DB.pool.on("error", (err) => {
        console.error("[db] Pool error:", err);
      });
    }

    return DB.pool;
  }

  static async testConnection(): Promise<void> {
    const pool = DB.getPool();
    const result = await pool.query("SELECT NOW() AS now");
    console.log("[db] PostgreSQL conectado:", result.rows[0].now);
  }

  static async withTransaction<T>(fn: TxFn<T>): Promise<T> {
    const pool = DB.getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch { /* ignorar fallo de rollback */ }
      throw err;
    } finally {
      client.release();
    }
  }
}
