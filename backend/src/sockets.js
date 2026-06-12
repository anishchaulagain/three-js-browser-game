/** All realtime game traffic: join flow, state relay, outfits, emotes, chat. */
const { MAX_PLAYERS, LIMITS } = require('./config');
const { timeInfo } = require('./worldclock');
const { authenticateSocket } = require('./auth');

function registerSockets(io, players) {
  /** last known couple-car state, so a late joiner finds the car where it was left */
  let carState = null;

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
        carState,
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
        hy: p.hy, hp: p.hp,
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

    socket.on('gift', (flower) => {
      if (!players.has(socket.id) || typeof flower !== 'string') return;
      socket.broadcast.emit('gift', { id: socket.id, flower: flower.slice(0, 16) });
    });

    socket.on('car_state', (s) => {
      // any joined player's car updates are accepted — with two players there's
      // nothing to cheat, and requiring carSeat==='driver' would make the relay
      // depend on message ordering
      const p = players.get(socket.id);
      if (!p || !s) return;
      carState = {
        x: typeof s.x === 'number' ? s.x : 0,
        z: typeof s.z === 'number' ? s.z : 0,
        ry: typeof s.ry === 'number' ? s.ry : 0,
        v: typeof s.v === 'number' ? s.v : 0,
      };
      socket.broadcast.emit('car_state', carState);
    });

    socket.on('car_seat', (seat) => {
      const p = players.get(socket.id);
      if (!p) return;
      p.carSeat = seat === 'driver' || seat === 'passenger' ? seat : null;
      socket.broadcast.emit('car_seat', { id: socket.id, seat: p.carSeat });
    });

    socket.on('chat', (env) => {
      // E2E encrypted: env = {n: nonce, c: ciphertext} (base64). The server
      // cannot read the message — it only checks shape/size and relays it.
      const p = players.get(socket.id);
      if (!p || !env || typeof env.n !== 'string' || typeof env.c !== 'string') return;
      if (env.n.length > 48 || env.c.length > 800) return;
      socket.broadcast.emit('chat', { id: socket.id, name: p.name, e: { n: env.n, c: env.c } });
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
