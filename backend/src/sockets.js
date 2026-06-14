/** All realtime game traffic: join flow, state relay, outfits, emotes, chat. */
const { MAX_PLAYERS, LIMITS } = require('./config');
const { timeInfo } = require('./worldclock');
const { authenticateSocket } = require('./auth');
const db = require('./db');

function registerSockets(io, players) {
  /** last known couple-car state, so a late joiner finds the car where it was left */
  let carState = null;
  /** shared home-theater state: {v, playing, t, at} — late joiners sync right in */
  let theaterState = null;
  /** shared kitchen-radio state: {v, playing, t, at} */
  let radioState = null;

  const broadcastRoles = () =>
    io.emit('roles', { taken: players.takenRoles(), count: players.size });

  io.on('connection', async (socket) => {
    const auth = await authenticateSocket(socket);
    if (!auth.ok) {
      socket.emit('auth_failed', { reason: auth.reason || 'unauthorized' });
      socket.disconnect(true);
      return;
    }
    socket.user = auth.user; // null in open mode; a DB row with accounts on

    // Hard cap: if two players already live in the world, turn the visitor
    // away — unless it's one of THEM reconnecting (their join evicts the
    // old session, so a "full" world never locks out its own couple).
    const isReturning = auth.user && players.list().some((p) => p.userId === auth.user.id);
    if (players.isFull && !isReturning) {
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
      const u = socket.user;
      if (u) {
        // accounts on: the DB decides who you are — not the client
        if (!u.gender) {
          socket.emit('join_denied', { reason: 'Your account has no character yet — ask your admin 💌' });
          return;
        }
        // one live session per ACCOUNT: evict our own ghost/old session first,
        // so a reload never bounces off a world we're still occupying
        const existing = players.list().find((p) => p.userId === u.id);
        if (existing) {
          players.remove(existing.id);
          const old = io.sockets.sockets.get(existing.id);
          if (old) {
            old.emit('session_replaced');
            old.disconnect(true);
          }
          socket.broadcast.emit('player_left', { id: existing.id, name: existing.name });
          console.log(`[join] ${u.username} reconnected — replaced their old session`);
        }
        data = {
          ...(data || {}),
          role: u.gender,
          name: u.displayName || u.username,
        };
      }
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
      if (u) {
        player.userId = u.id;
        player.outfit = Math.max(0, Math.min(11, u.outfit | 0));
      }
      socket.emit('joined', {
        self: player,
        others: players.othersOf(socket.id),
        carState,
        theaterState,
        radioState,
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
      // remember the look for the next session
      if (socket.user && db.enabled) {
        db.updateUser(socket.user.id, { outfit: p.outfit }).catch(() => {});
      }
    });

    socket.on('emote', (emoji) => {
      if (!players.has(socket.id) || typeof emoji !== 'string') return;
      socket.broadcast.emit('emote', { id: socket.id, emoji: emoji.slice(0, LIMITS.emoji) });
    });

    socket.on('gift', (msg) => {
      // targeted: {to: socketId, flower} — only the recipient gets it
      if (!players.has(socket.id) || !msg || typeof msg.flower !== 'string') return;
      const target = typeof msg.to === 'string' && players.has(msg.to) && io.sockets.sockets.get(msg.to);
      if (!target) return;
      target.emit('gift', { id: socket.id, flower: msg.flower.slice(0, 16) });
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

    socket.on('theater', (s) => {
      // home-theater sync: a YouTube movie or a shared website
      //   {mode:'yt', v: 11-char id, playing, t}  |  {mode:'web', url}
      const p = players.get(socket.id);
      if (!p || !s) return;
      if (s.mode === 'web') {
        if (typeof s.url !== 'string' || s.url.length > 500 || !/^https?:\/\//i.test(s.url)) return;
        theaterState = { mode: 'web', url: s.url, at: Date.now() };
      } else {
        if (typeof s.v !== 'string' || !/^[\w-]{11}$/.test(s.v)) return;
        theaterState = {
          mode: 'yt',
          v: s.v,
          playing: !!s.playing,
          t: Math.max(0, Math.min(86400, +s.t || 0)),
          at: Date.now(),
        };
      }
      socket.broadcast.emit('theater', theaterState);
    });

    socket.on('radio', (s) => {
      // kitchen radio sync: {v: 11-char id, playing, t seconds}
      const p = players.get(socket.id);
      if (!p || !s || typeof s.v !== 'string' || !/^[\w-]{11}$/.test(s.v)) return;
      radioState = {
        v: s.v,
        playing: !!s.playing,
        t: Math.max(0, Math.min(86400, +s.t || 0)),
        at: Date.now(),
      };
      socket.broadcast.emit('radio', radioState);
    });

    socket.on('car_seat', (seat) => {
      const p = players.get(socket.id);
      if (!p) return;
      p.carSeat = seat === 'driver' || seat === 'passenger' ? seat : null;
      socket.broadcast.emit('car_seat', { id: socket.id, seat: p.carSeat });
    });

    socket.on('hands', (msg) => {
      // hold/let-go hands: {to: socketId, holding} — only the partner is told
      if (!players.has(socket.id) || !msg) return;
      const target = typeof msg.to === 'string' && players.has(msg.to) && io.sockets.sockets.get(msg.to);
      if (!target) return;
      target.emit('hands', { id: socket.id, holding: !!msg.holding });
    });

    socket.on('chat', (msg) => {
      // E2E encrypted per recipient: {to: socketId, e: {n, c}} — the sender
      // encrypts separately for every peer; the server just routes blindly.
      const p = players.get(socket.id);
      if (!p || !msg || !msg.e || typeof msg.e.n !== 'string' || typeof msg.e.c !== 'string') return;
      if (msg.e.n.length > 48 || msg.e.c.length > 800) return;
      const target = typeof msg.to === 'string' && players.has(msg.to) && io.sockets.sockets.get(msg.to);
      if (!target) return;
      target.emit('chat', { id: socket.id, name: p.name, e: { n: msg.e.n, c: msg.e.c } });
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
