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

/** flowers that can be picked in the garden and gifted with F */
export const FLOWERS = {
  rose:      { emoji: '🌹', name: 'rose',      color: 0xd90429 },
  tulip:     { emoji: '🌷', name: 'tulip',     color: 0xff7eb6 },
  sunflower: { emoji: '🌻', name: 'sunflower', color: 0xffd000 },
  daisy:     { emoji: '🌼', name: 'daisy',     color: 0xfff8e8 },
  blossom:   { emoji: '🌸', name: 'blossom',   color: 0xffb7d5 },
};
export const POCKET_MAX = 8;
export const GIVE_DISTANCE = 2.5;
/** seconds until a picked plant grows back */
export const FLOWER_RESPAWN_S = 45;
