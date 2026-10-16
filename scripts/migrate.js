// Uso: DATABASE_URL=... npm run db:migrate
import { readdir, readFile } from 'node:fs/promises';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const dir = new URL('../sql/', import.meta.url);
for (const file of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
  await pool.query(await readFile(new URL(file, dir), 'utf8'));
  console.log(`aplicado ${file}`);
}
await pool.end();
