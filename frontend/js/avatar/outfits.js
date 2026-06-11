/**
 * Character appearance data — pure data, no three.js.
 * This is the place to add outfits, skins and hair colors.
 *
 * Outfit fields:
 *   name / icon  — shown in the closet UI
 *   top          — torso + sleeve color
 *   bottom       — legs (or dress/skirt) color
 *   shoes        — shoe color
 *   sleeves      — 'long' | 'short' (short shows skin on the forearms)
 *   shorts       — true → bare lower legs (beach shorts)
 *   skirt        — true → cone skirt, bare legs (dresses)
 */

export const OUTFITS = {
  male: [
    { name: 'Casual',     icon: '👕', top: 0x4f8ef7, bottom: 0x2f3a4a, shoes: 0xffffff, sleeves: 'short' },
    { name: 'Date Night', icon: '🕴️', top: 0x1f2430, bottom: 0x10131a, shoes: 0x4a3526, sleeves: 'long'  },
    { name: 'Beach Day',  icon: '🏖️', top: 0xffd166, bottom: 0x06d6a0, shoes: 0xf4e1c1, sleeves: 'short', shorts: true },
    { name: 'Cozy',       icon: '🧸', top: 0x9a8c98, bottom: 0x4a4e69, shoes: 0xc9ada7, sleeves: 'long'  },
    { name: 'Adventurer', icon: '🧭', top: 0x386641, bottom: 0x6f4518, shoes: 0x283618, sleeves: 'long'  },
    { name: 'Formal',     icon: '🤵', top: 0xf2f2f2, bottom: 0x14213d, shoes: 0x111111, sleeves: 'long'  },
  ],
  female: [
    { name: 'Casual',     icon: '👚', top: 0xff6b9d, bottom: 0x3a5a8c, shoes: 0xffffff, sleeves: 'short' },
    { name: 'Red Dress',  icon: '💃', top: 0xd90429, bottom: 0xd90429, shoes: 0xb3001b, sleeves: 'short', skirt: true },
    { name: 'Sundress',   icon: '🌼', top: 0xffd6e0, bottom: 0xffd6e0, shoes: 0xfff1e6, sleeves: 'short', skirt: true },
    { name: 'Cozy',       icon: '🧸', top: 0xb8a1e3, bottom: 0x494d7e, shoes: 0xe0c3fc, sleeves: 'long'  },
    { name: 'Adventurer', icon: '🧗', top: 0x52796f, bottom: 0x354f52, shoes: 0x2f3e46, sleeves: 'long'  },
    { name: 'Princess',   icon: '👑', top: 0x9d4edd, bottom: 0x7b2cbf, shoes: 0xe0aaff, sleeves: 'short', skirt: true },
  ],
};

export const SKIN = { male: 0xf1c27d, female: 0xf7d1a6 };
export const HAIR = { male: 0x4a2c12, female: 0x6b3a1f };
