/**
 * Database migration — run with:  npm run db:migrate
 *
 * 1. Connects with DATABASE_URL from .env and ensures the dedicated app
 *    database exists (APP_DB_NAME, default "coupleworld") — so the app never
 *    lives in the provider's default database.
 * 2. Runs the schema (users table) and seeds the first admin account there.
 *
 * After it succeeds, point DATABASE_URL at the dedicated database.
 */
require('../src/config'); // loads .env

const TARGET_DB = process.env.APP_DB_NAME || 'coupleworld';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('No DATABASE_URL in .env — nothing to migrate.');
    process.exit(1);
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(TARGET_DB)) {
    console.error(`Bad APP_DB_NAME "${TARGET_DB}" — lowercase letters, digits, _ only.`);
    process.exit(1);
  }

  const { Client } = require('pg');
  const { pgConfig } = require('../src/db');

  /* 1 ─ ensure the dedicated database exists */
  const url = new URL(process.env.DATABASE_URL);
  const currentDb = url.pathname.replace(/^\//, '');
  if (currentDb !== TARGET_DB) {
    const admin = new Client(pgConfig());
    await admin.connect();
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TARGET_DB]);
    if (exists.rowCount) {
      console.log(`[migrate] database "${TARGET_DB}" already exists`);
    } else {
      await admin.query(`CREATE DATABASE ${TARGET_DB}`);
      console.log(`[migrate] created database "${TARGET_DB}"`);
    }
    await admin.end();
    url.pathname = '/' + TARGET_DB;
    process.env.DATABASE_URL = url.toString();
  }

  /* 2 ─ schema + admin seed in the dedicated database (re-require so the
         pool is rebuilt against the retargeted DATABASE_URL) */
  delete require.cache[require.resolve('../src/db')];
  const db = require('../src/db');
  await db.init();
  const users = await db.listUsers();
  console.log(`[migrate] schema ready in "${TARGET_DB}" — ${users.length} user(s):`);
  for (const u of users) {
    console.log(`  · #${u.id} ${u.username} (${u.role}${u.gender ? ', ' + u.gender : ''})` +
      (u.mustChangePassword ? ' — temp password, must change on first sign-in' : ''));
  }
  console.log(`\nDone. Set DATABASE_URL in .env to use /${TARGET_DB} (instead of /${currentDb}).`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[migrate] failed:', e.message);
  process.exit(1);
});
