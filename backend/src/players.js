/** In-memory player registry: who is in the world right now. */
const { MAX_PLAYERS, LIMITS } = require('./config');

class PlayerManager {
  constructor() {
    /** @type {Map<string, object>} socket.id -> player record */
    this.players = new Map();
  }

  get size() { return this.players.size; }
  get isFull() { return this.players.size >= MAX_PLAYERS; }

  has(id) { return this.players.has(id); }
  get(id) { return this.players.get(id); }
  list() { return [...this.players.values()]; }
  othersOf(id) { return this.list().filter((p) => p.id !== id); }
  takenRoles() { return this.list().map((p) => p.role); }

  /**
   * Create and register a player. Many players may share a character style
   * (role) — identity comes from the account, not the slot. Returns null
   * only when the world is at MAX_PLAYERS.
   */
  add(id, { role, name, x, z, pubkey }) {
    if (this.isFull) return null;
    const cleanName = String(name || '').trim().slice(0, LIMITS.name);
    const player = {
      id,
      role: role === 'female' ? 'female' : 'male',
      name: cleanName || (resolved === 'male' ? 'Him' : 'Her'),
      // E2E chat public key — opaque to the server, just relayed to the partner
      pubkey: typeof pubkey === 'string' && pubkey.length <= 64 ? pubkey : null,
      outfit: 0,
      x: typeof x === 'number' ? x : 0,
      y: 0,
      z: typeof z === 'number' ? z : 3,
      ry: Math.PI,
      anim: 'idle',
      speed: 0,
      hy: 0, // head look yaw (relative to the body)
      hp: 0, // head look pitch
    };
    this.players.set(id, player);
    return player;
  }

  /** Apply a movement/animation state update. */
  updateState(id, s) {
    const p = this.players.get(id);
    if (!p || !s) return null;
    if (typeof s.x === 'number') p.x = s.x;
    if (typeof s.y === 'number') p.y = s.y;
    if (typeof s.z === 'number') p.z = s.z;
    if (typeof s.ry === 'number') p.ry = s.ry;
    if (typeof s.anim === 'string') p.anim = s.anim.slice(0, LIMITS.anim);
    if (typeof s.speed === 'number') p.speed = s.speed;
    if (typeof s.hy === 'number') p.hy = Math.max(-1.6, Math.min(1.6, s.hy));
    if (typeof s.hp === 'number') p.hp = Math.max(-1, Math.min(1, s.hp));
    return p;
  }

  remove(id) {
    const p = this.players.get(id);
    this.players.delete(id);
    return p;
  }
}

module.exports = { PlayerManager };
