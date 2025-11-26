// lib/db.ts
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Global variable to hold the pool during hot-reloads (development only)
let pool: Pool;

if (process.env.NODE_ENV === "production") {
  // In production (Vercel), we just create the pool normally
  pool = new Pool({
    connectionString,
    max: 3, // Keep connections low for serverless
    ssl: true, // Enforce SSL for Neon
  });
} else {
  // In development, we attach the pool to the global object
  // so it survives hot-reloads.
  if (!(global as any).postgresPool) {
    (global as any).postgresPool = new Pool({
      connectionString,
      max: 3,
      ssl: true,
    });
  }
  pool = (global as any).postgresPool;
}

export async function dbQuery<T = any>(sql: string, params: any[] = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}