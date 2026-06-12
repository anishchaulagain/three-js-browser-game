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
    console.error('[db] failed to initialize — check your .env Postgres settings:', err.message);
    process.exit(1);
  });
