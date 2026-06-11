/** Central server configuration. */
module.exports = {
  PORT: process.env.PORT || 3000,
  /** one full in-game day = 2 real minutes */
  DAY_LENGTH_MS: 120000,
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
