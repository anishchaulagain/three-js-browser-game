/**
 * Authentication — extension point.
 *
 * Currently everyone is allowed in (the 2-player cap is enforced separately
 * in sockets.js). To add real authentication later:
 *
 *  1. Issue a token at login (e.g. an /api/auth/login route in routes.js).
 *  2. Have the client pass it when connecting:
 *       io({ auth: { token } })
 *  3. Verify it here — socket.handshake.auth.token — and return
 *       { ok: false, reason: '...' } to reject the connection,
 *       or { ok: true, user: {...} } to attach a user record.
 */
async function authenticateSocket(socket) {
  void socket; // unused until real auth is plugged in
  return { ok: true, user: null };
}

module.exports = { authenticateSocket };
