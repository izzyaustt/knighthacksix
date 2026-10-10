import './env.mjs';
import { createPool } from './database.mjs';

const pool = createPool();
await pool.query('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT');
const { rows } = await pool.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position",
);
console.log('users columns:', rows.map((r) => r.column_name).join(', '));
await pool.end();