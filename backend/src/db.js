/**
 * User storage. Three modes, picked automatically at startup:
 *
 *   postgres — when DATABASE_URL (or PGDATABASE) is set in .env
 *   memory   — when MEMORY_DB=1 (tests; full auth flow, nothing persisted)
 *   disabled — neither configured → the game runs in legacy open mode
 *
 * All drivers expose the same async interface and return plain user rows:
 *   { id, username, passwordHash, role, gender, displayName, outfit,
 *     mustChangePassword, firstLoginDone }
 */
const bcrypt = require('bcryptjs');
const { ADMIN_USERNAME, ADMIN_PASSWORD } = require('./config');

const usePostgres = !!(process.env.DATABASE_URL || process.env.PGDATABASE);
const useMemory = !usePostgres && process.env.MEMORY_DB === '1';

/* ---------- postgres driver ---------- */
/**
 * Build the pg connection config from DATABASE_URL.
 * `sslmode` is stripped from the URL and handled here explicitly: managed
 * Postgres (Aiven, Render, Heroku…) uses provider CAs that fail Node's
 * default verification — we encrypt always and verify against PG_CA_CERT
 * when provided, otherwise accept the provider's certificate.
 */
function pgConfig(rawUrl = process.env.DATABASE_URL) {
  if (!rawUrl) return null;
  const url = new URL(rawUrl);
  const sslmode = url.searchParams.get('sslmode') || process.env.PGSSLMODE || '';
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  const cfg = { connectionString: url.toString() };
  if (sslmode && sslmode !== 'disable') {
    const fs = require('fs');
    const ca = process.env.PG_CA_CERT;
    cfg.ssl = ca && fs.existsSync(ca)
      ? { ca: fs.readFileSync(ca, 'utf8') }
      : { rejectUnauthorized: false };
  }
  return cfg;
}

function postgresDriver() {
  const { Pool } = require('pg');
  const pool = new Pool(pgConfig() || {}); // falls back to standard PG* env vars

  const row = (r) => r && {
    id: r.id,
    username: r.username,
    passwordHash: r.password_hash,
    role: r.role,
    gender: r.gender,
    displayName: r.display_name,
    outfit: r.outfit,
    mustChangePassword: r.must_change_password,
    firstLoginDone: r.first_login_done,
  };

  return {
    mode: 'postgres',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id                   SERIAL PRIMARY KEY,
          username             TEXT UNIQUE NOT NULL,
          password_hash        TEXT NOT NULL,
          role                 TEXT NOT NULL DEFAULT 'player',
          gender               TEXT,
          display_name         TEXT,
          outfit               INT NOT NULL DEFAULT 0,
          must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
          first_login_done     BOOLEAN NOT NULL DEFAULT FALSE,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
    },
    async countUsers() {
      return +(await pool.query('SELECT count(*) FROM users')).rows[0].count;
    },
    async findByUsername(username) {
      const r = await pool.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
      return row(r.rows[0]);
    },
    async findById(id) {
      const r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return row(r.rows[0]);
    },
    async listUsers() {
      const r = await pool.query('SELECT * FROM users ORDER BY id');
      return r.rows.map(row);
    },
    async createUser({ username, passwordHash, role = 'player', gender = null, displayName = null }) {
      const r = await pool.query(
        `INSERT INTO users (username, password_hash, role, gender, display_name)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [username, passwordHash, role, gender, displayName]
      );
      return row(r.rows[0]);
    },
    async updateUser(id, fields) {
      const map = {
        passwordHash: 'password_hash', gender: 'gender', displayName: 'display_name',
        outfit: 'outfit', mustChangePassword: 'must_change_password', firstLoginDone: 'first_login_done',
      };
      const sets = [], vals = [];
      for (const [k, col] of Object.entries(map)) {
        if (fields[k] !== undefined) { vals.push(fields[k]); sets.push(`${col} = $${vals.length}`); }
      }
      if (!sets.length) return this.findById(id);
      vals.push(id);
      const r = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
      return row(r.rows[0]);
    },
    async deleteUser(id) {
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    },
  };
}

/* ---------- in-memory driver (tests) ---------- */
function memoryDriver() {
  const users = new Map();
  let nextId = 1;
  return {
    mode: 'memory',
    async init() {},
    async countUsers() { return users.size; },
    async findByUsername(username) {
      return [...users.values()].find((u) => u.username.toLowerCase() === String(username).toLowerCase()) || null;
    },
    async findById(id) { return users.get(+id) || null; },
    async listUsers() { return [...users.values()]; },
    async createUser({ username, passwordHash, role = 'player', gender = null, displayName = null }) {
      const u = {
        id: nextId++, username, passwordHash, role, gender, displayName,
        outfit: 0, mustChangePassword: true, firstLoginDone: false,
      };
      users.set(u.id, u);
      return u;
    },
    async updateUser(id, fields) {
      const u = users.get(+id);
      if (!u) return null;
      for (const k of ['passwordHash', 'gender', 'displayName', 'outfit', 'mustChangePassword', 'firstLoginDone']) {
        if (fields[k] !== undefined) u[k] = fields[k];
      }
      return u;
    },
    async deleteUser(id) { users.delete(+id); },
  };
}

const driver = usePostgres ? postgresDriver() : useMemory ? memoryDriver() : null;

/** boot the store and seed the first admin account if the table is empty */
async function init() {
  if (!driver) return;
  await driver.init();
  if ((await driver.countUsers()) === 0) {
    await driver.createUser({
      username: ADMIN_USERNAME,
      passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
      role: 'admin',
    });
    console.log(`[auth] seeded admin account "${ADMIN_USERNAME}" (must change password on first sign-in)`);
  }
}

module.exports = {
  ...(driver || {}),
  enabled: !!driver,
  mode: driver ? driver.mode : 'disabled',
  init, // wrapper (table + admin seed) must win over the driver's raw init
  pgConfig,
};
