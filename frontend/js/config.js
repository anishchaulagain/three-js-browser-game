/** Client-side game constants. */

export const SPAWNS = {
  male: { x: -1.2, z: 3 },
  female: { x: 1.2, z: 3 },
};

/** how often (ms) to send our state to the server, at most */
export const STATE_SEND_MS = 60;

/** keyboard emotes — add more here and they just work */
export const EMOTE_KEYS = {
  KeyH: '❤️',
  KeyG: '👋',
  KeyK: '😘',
};

/** snacks the fridge can hand out */
export const SNACKS = ['🧃', '🍎', '🍰', '🍓', '🍫'];

/** couple proximity (m) for ambient floating hearts */
export const HEART_DISTANCE = 2.4;
export const KISS_DISTANCE = 2.5;
