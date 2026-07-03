/**
 * Socket authentication.
 *
 * With accounts enabled (Postgres configured), every socket must present a
 * valid JWT in `io({ auth: { token } })`; the matching user row is attached
 * to the socket and later drives the authoritative join (gender → character,
 * display name, saved outfit).
 *
 * With accounts disabled (no DB in .env) everyone is allowed in, exactly as
 * before — the 2-player cap still applies either way.
 */
const db = require('./db');
const { verify } = require('./jwt');

async function authenticateSocket(socket) {
  if (!db.enabled) return { ok: true, user: null };

  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const payload = token && verify(token);
    if (!payload) return { ok: false, reason: 'invalid or missing token' };

    const user = await db.findById(payload.sub);
    if (!user) return { ok: false, reason: 'account no longer exists' };
    return { ok: true, user };
  } catch (err) {
    // a DB hiccup must reject THIS connection cleanly — never crash the server
    console.error('[auth] socket auth error (recovered):', err.message);
    return { ok: false, reason: 'server hiccup — please try again' };
  }
}

module.exports = { authenticateSocket };
