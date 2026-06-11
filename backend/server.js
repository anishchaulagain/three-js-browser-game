/**
 * Couple World — server
 * A tiny open world that allows exactly TWO players, no more.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'frontend')));

const PORT = process.env.PORT || 3000;
const DAY_LENGTH_MS = 120000; // one full in-game day = 2 real minutes
const WORLD_START = Date.now();
const MAX_PLAYERS = 2;

/** socket.id -> player record (only players who have actually joined the world) */
const players = new Map();

function takenRoles() {
  return [...players.values()].map((p) => p.role);
}

function broadcastRoles() {
  io.emit('roles', { taken: takenRoles(), count: players.size });
}

io.on('connection', (socket) => {
  // Hard cap: if two players already live in the world, turn the visitor away.
  if (players.size >= MAX_PLAYERS) {
    socket.emit('world_full');
    socket.disconnect(true);
    return;
  }

  socket.emit('welcome', {
    serverNow: Date.now(),
    worldStart: WORLD_START,
    dayLength: DAY_LENGTH_MS,
    taken: takenRoles(),
    count: players.size,
  });

  socket.on('join', (data) => {
    if (players.has(socket.id)) return;
    if (players.size >= MAX_PLAYERS) {
      socket.emit('world_full');
      socket.disconnect(true);
      return;
    }
    let role = data && data.role === 'female' ? 'female' : 'male';
    // If the chosen character is already taken, hand them the other one.
    if (takenRoles().includes(role)) {
      role = role === 'male' ? 'female' : 'male';
      if (takenRoles().includes(role)) {
        socket.emit('world_full');
        socket.disconnect(true);
        return;
      }
    }
    const name = String((data && data.name) || '').trim().slice(0, 16);
    const player = {
      id: socket.id,
      role,
      name: name || (role === 'male' ? 'Him' : 'Her'),
      outfit: 0,
      x: typeof (data && data.x) === 'number' ? data.x : 0,
      y: 0,
      z: typeof (data && data.z) === 'number' ? data.z : 3,
      ry: Math.PI,
      anim: 'idle',
      speed: 0,
    };
    players.set(socket.id, player);

    socket.emit('joined', {
      self: player,
      others: [...players.values()].filter((p) => p.id !== socket.id),
      serverNow: Date.now(),
      worldStart: WORLD_START,
      dayLength: DAY_LENGTH_MS,
    });
    socket.broadcast.emit('player_joined', player);
    broadcastRoles();
    console.log(`[join] ${player.name} (${player.role}) — ${players.size}/${MAX_PLAYERS} in world`);
  });

  socket.on('state', (s) => {
    const p = players.get(socket.id);
    if (!p || !s) return;
    if (typeof s.x === 'number') p.x = s.x;
    if (typeof s.y === 'number') p.y = s.y;
    if (typeof s.z === 'number') p.z = s.z;
    if (typeof s.ry === 'number') p.ry = s.ry;
    if (typeof s.anim === 'string') p.anim = s.anim.slice(0, 12);
    if (typeof s.speed === 'number') p.speed = s.speed;
    socket.broadcast.emit('player_state', {
      id: socket.id, x: p.x, y: p.y, z: p.z, ry: p.ry, anim: p.anim, speed: p.speed,
    });
  });

  socket.on('outfit', (i) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.outfit = Math.max(0, Math.min(11, i | 0));
    socket.broadcast.emit('outfit', { id: socket.id, outfit: p.outfit });
  });

  socket.on('emote', (emoji) => {
    const p = players.get(socket.id);
    if (!p || typeof emoji !== 'string') return;
    socket.broadcast.emit('emote', { id: socket.id, emoji: emoji.slice(0, 8) });
  });

  socket.on('chat', (text) => {
    const p = players.get(socket.id);
    if (!p || typeof text !== 'string') return;
    const msg = text.trim().slice(0, 120);
    if (!msg) return;
    io.emit('chat', { id: socket.id, name: p.name, text: msg });
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (p) {
      players.delete(socket.id);
      socket.broadcast.emit('player_left', { id: socket.id, name: p.name });
      broadcastRoles();
      console.log(`[leave] ${p.name} — ${players.size}/${MAX_PLAYERS} in world`);
    }
  });
});

server.listen(PORT, () => {
  console.log('────────────────────────────────────────────');
  console.log('  Couple World is running');
  console.log(`  Open http://localhost:${PORT} on two devices`);
  console.log('  (only two hearts may enter)');
  console.log('────────────────────────────────────────────');
});
