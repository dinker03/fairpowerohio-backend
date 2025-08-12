// lib/db.ts
import { Pool } from "pg";

// Use pooled URL for serverless (Neon -pooler host)
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Keep pool small for serverless functions
const pool = new Pool({
  connectionString,
  // SSL is handled by `sslmode=require` in the URL
  max: 3,
});

export async function dbQuery<T = any>(sql: string, params: any[] = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}
