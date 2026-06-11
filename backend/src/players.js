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
   * Create and register a player. Resolves role conflicts (if the requested
   * character is taken, hands out the other one). Returns null if no role
   * is free.
   */
  add(id, { role, name, x, z }) {
    let resolved = role === 'female' ? 'female' : 'male';
    const taken = this.takenRoles();
    if (taken.includes(resolved)) {
      resolved = resolved === 'male' ? 'female' : 'male';
      if (taken.includes(resolved)) return null;
    }
    const cleanName = String(name || '').trim().slice(0, LIMITS.name);
    const player = {
      id,
      role: resolved,
      name: cleanName || (resolved === 'male' ? 'Him' : 'Her'),
      outfit: 0,
      x: typeof x === 'number' ? x : 0,
      y: 0,
      z: typeof z === 'number' ? z : 3,
      ry: Math.PI,
      anim: 'idle',
      speed: 0,
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
    return p;
  }

  remove(id) {
    const p = this.players.get(id);
    this.players.delete(id);
    return p;
  }
}

module.exports = { PlayerManager };
