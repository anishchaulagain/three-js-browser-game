/** Central server configuration. Loads backend/.env (and repo-root .env). */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

module.exports = {
  PORT: process.env.PORT || 3000,
  /** tokens are signed with this — set a real secret in .env for production */
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  TOKEN_TTL: '7d',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin1234',
  /** one full in-game day (morning → night → morning) = 2 real hours */
  DAY_LENGTH_MS: 2 * 60 * 60 * 1000,
  /** the whole point of this world */
  MAX_PLAYERS: 2,
  /** max lengths for user-provided strings */
  LIMITS: {
    name: 16,
    chat: 120,
    emoji: 8,
    anim: 12,
  },
};
