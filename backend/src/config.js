/** Central server configuration. */
module.exports = {
  PORT: process.env.PORT || 3000,
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
