import './env.mjs';
import pg from 'pg';
import { readFileSync } from 'node:fs';

export function createPool() {
  const raw = process.env.DATABASE_URL || process.env.TIGER_DATA_CONNECTION_STRING;
  if (!raw) throw new Error('DATABASE_URL or TIGER_DATA_CONNECTION_STRING is required');
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password) {
    throw new Error('Database configuration is incomplete');
  }
  const caFile = url.searchParams.get('sslrootcert') || process.env.PGSSLROOTCERT;
  const pool = new pg.Pool({
    host: url.hostname, port: Number(url.port) || 5432,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: { rejectUnauthorized: true, ...(caFile ? { ca: readFileSync(caFile, 'utf8') } : {}) },
    max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
    statement_timeout: 15000, application_name: 'language-learning-backend',
  });
  pool.on('error', () => console.error('[database] Idle connection error'));
  return pool;
}

export async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
