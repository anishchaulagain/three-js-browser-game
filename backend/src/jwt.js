/** JWT helpers — sign/verify tokens and an Express auth middleware. */
const jwt = require('jsonwebtoken');
const { JWT_SECRET, TOKEN_TTL } = require('./config');

// starts from env (or a per-boot random); db.init() swaps in the DB-persisted
// secret when the environment doesn't provide one, so sessions survive
// restarts in production even without JWT_SECRET configured
let secret = JWT_SECRET;

function setSecret(s) {
  if (typeof s === 'string' && s.length >= 16) secret = s;
}

function sign(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    secret,
    { expiresIn: TOKEN_TTL }
  );
}

/** returns the payload {sub, username, role} or null */
function verify(token) {
  try {
    return jwt.verify(token, secret);
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

module.exports = { sign, verify, setSecret, requireAuth, requireAdmin };
