/** Central server configuration. Loads backend/.env (and repo-root .env). */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

module.exports = {
  PORT: process.env.PORT || 3000,
  /** tokens are signed with this — set a real secret in .env (without one, a
      random per-boot secret is used and all sessions reset on restart) */
  JWT_SECRET: process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex'),
  JWT_SECRET_IS_EPHEMERAL: !process.env.JWT_SECRET,
  TOKEN_TTL: '7d',
  /** origin(s) allowed to call the API/socket from another host (comma-separated).
      Only needed when the frontend is deployed separately from this server. */
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || '',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  /** no default — if unset, a random password is generated at seed time */
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || null,
  /** one full in-game day (morning → night → morning) = 2 real hours */
  DAY_LENGTH_MS: 2 * 60 * 60 * 1000,
  /** the whole point of this world — two. (override with MAX_PLAYERS in .env) */
  MAX_PLAYERS: Math.max(2, parseInt(process.env.MAX_PLAYERS, 10) || 2),
  /** max lengths for user-provided strings */
  LIMITS: {
    name: 16,
    chat: 120,
    emoji: 8,
    anim: 12,
  },
};
