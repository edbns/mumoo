/**
 * Applies db/migrations/*.sql in order, once each, over the DIRECT (unpooled) connection.
 *   npm run db:migrate
 * Reads DATABASE_URL_UNPOOLED from the environment (`neon deploy` writes it to .env.local).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error('DATABASE_URL_UNPOOLED is not set. Run `neon deploy` to pull it into .env.local.');
const sql = neon(url);
const dir = fileURLToPath(new URL('../db/migrations/', import.meta.url));

await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
const done = new Set((await sql`select name from schema_migrations`).map(row => row.name));
for (const name of readdirSync(dir).filter(file => file.endsWith('.sql')).sort()) {
  if (done.has(name)) continue;
  const statements = readFileSync(`${dir}${name}`, 'utf8').split(/;\s*$/m).map(text => text.trim()).filter(Boolean);
  await sql.transaction([...statements.map(text => sql.query(text)), sql`insert into schema_migrations (name) values (${name})`]);
  console.log(`applied ${name}`);
}
console.log('database is up to date');
