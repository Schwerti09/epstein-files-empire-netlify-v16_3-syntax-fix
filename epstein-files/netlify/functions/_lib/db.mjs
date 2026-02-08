import pg from "pg";
const { Pool } = pg;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

let pool;
export function getPool() {
  if (!pool) {
    const connectionString = requireEnv("DATABASE_URL");
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query(text, params = []) {
  const p = getPool();
  const client = await p.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}
