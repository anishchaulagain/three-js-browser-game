/** JWT helpers — sign/verify tokens and an Express auth middleware. */
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_SECRET_IS_EPHEMERAL, TOKEN_TTL } = require('./config');

if (JWT_SECRET_IS_EPHEMERAL) {
  console.warn('[auth] WARNING: no JWT_SECRET in .env — using a random per-boot secret (sessions reset on every restart)');
}

function sign(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/** returns the payload {sub, username, role} or null */
function verify(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** Express middleware: requires a valid Bearer token; sets req.auth */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verify(token);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.auth = payload;
  next();
}

/** Express middleware: requireAuth + admin role */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.auth.role !== 'admin') return res.status(403).json({ error: 'admin only' });
    next();
  });
}

module.exports = { sign, verify, requireAuth, requireAdmin };
