/**
 * Couple World — server entry point.
 * Wires together the HTTP routes and the realtime socket layer.
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { PORT, FRONTEND_ORIGIN } = require('./src/config');
const db = require('./src/db');
const { PlayerManager } = require('./src/players');
const { registerRoutes } = require('./src/routes');
const { registerSockets } = require('./src/sockets');

const app = express();
const server = http.createServer(app);
const io = new Server(server, FRONTEND_ORIGIN
  ? { cors: { origin: FRONTEND_ORIGIN.split(',').map((o) => o.trim().replace(/\/+$/, '')) } }
  : {});

const players = new PlayerManager();

registerRoutes(app, players);
registerSockets(io, players);

db.init()
  .then(() => {
    server.listen(PORT, () => {
      console.log('────────────────────────────────────────────');
      console.log('  Couple World is running');
      console.log(`  Open http://localhost:${PORT}`);
      console.log(`  accounts: ${db.mode === 'disabled' ? 'OFF — open mode (configure Postgres in .env)' : `ON (${db.mode})`}`);
      console.log('────────────────────────────────────────────');
    });
  })
  .catch((err) => {
    console.error('────────────────────────────────────────────');
    console.error('[db] failed to initialize:', err.message);
    if (/ENOTFOUND|ECONNREFUSED/.test(err.message)) {
      console.error('[db] the database host is unreachable — the service may be');
      console.error('[db] deleted/paused, or DATABASE_URL is wrong. In production');
      console.error('[db] set DATABASE_URL in the host dashboard (Render → Environment),');
      console.error('[db] then run: npm run db:migrate');
    }
    console.error('────────────────────────────────────────────');
    process.exit(1);
  });
