/**
 * Couple World — server entry point.
 * Wires together the HTTP routes and the realtime socket layer.
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { PORT } = require('./src/config');
const { PlayerManager } = require('./src/players');
const { registerRoutes } = require('./src/routes');
const { registerSockets } = require('./src/sockets');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const players = new PlayerManager();

registerRoutes(app, players);
registerSockets(io, players);

server.listen(PORT, () => {
  console.log('────────────────────────────────────────────');
  console.log('  Couple World is running');
  console.log(`  Open http://localhost:${PORT} on two devices`);
  console.log('  (only two hearts may enter)');
  console.log('────────────────────────────────────────────');
});
