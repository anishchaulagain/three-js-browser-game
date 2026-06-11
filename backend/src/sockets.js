/** All realtime game traffic: join flow, state relay, outfits, emotes, chat. */
const { MAX_PLAYERS, LIMITS } = require('./config');
const { timeInfo } = require('./worldclock');
const { authenticateSocket } = require('./auth');

function registerSockets(io, players) {
  const broadcastRoles = () =>
    io.emit('roles', { taken: players.takenRoles(), count: players.size });

  io.on('connection', async (socket) => {
    const auth = await authenticateSocket(socket);
    if (!auth.ok) {
      socket.emit('auth_failed', { reason: auth.reason || 'unauthorized' });
      socket.disconnect(true);
      return;
    }

    // Hard cap: if two players already live in the world, turn the visitor away.
    if (players.isFull) {
      socket.emit('world_full');
      socket.disconnect(true);
      return;
    }

    socket.emit('welcome', {
      ...timeInfo(),
      taken: players.takenRoles(),
      count: players.size,
    });

    socket.on('join', (data) => {
      if (players.has(socket.id)) return;
      if (players.isFull) {
        socket.emit('world_full');
        socket.disconnect(true);
        return;
      }
      const player = players.add(socket.id, data || {});
      if (!player) {
        socket.emit('world_full');
        socket.disconnect(true);
        return;
      }
      socket.emit('joined', {
        self: player,
        others: players.othersOf(socket.id),
        ...timeInfo(),
      });
      socket.broadcast.emit('player_joined', player);
      broadcastRoles();
      console.log(`[join] ${player.name} (${player.role}) — ${players.size}/${MAX_PLAYERS} in world`);
    });

    socket.on('state', (s) => {
      const p = players.updateState(socket.id, s);
      if (!p) return;
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
      if (!players.has(socket.id) || typeof emoji !== 'string') return;
      socket.broadcast.emit('emote', { id: socket.id, emoji: emoji.slice(0, LIMITS.emoji) });
    });

    socket.on('chat', (text) => {
      const p = players.get(socket.id);
      if (!p || typeof text !== 'string') return;
      const msg = text.trim().slice(0, LIMITS.chat);
      if (!msg) return;
      io.emit('chat', { id: socket.id, name: p.name, text: msg });
    });

    socket.on('disconnect', () => {
      const p = players.remove(socket.id);
      if (p) {
        socket.broadcast.emit('player_left', { id: socket.id, name: p.name });
        broadcastRoles();
        console.log(`[leave] ${p.name} — ${players.size}/${MAX_PLAYERS} in world`);
      }
    });
  });
}

module.exports = { registerSockets };
