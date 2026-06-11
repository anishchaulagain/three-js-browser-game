import * as THREE from 'three';

/* ===================== Outfits ===================== */

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

const SKIN = { male: 0xf1c27d, female: 0xf7d1a6 };
const HAIR = { male: 0x4a2c12, female: 0x6b3a1f };

function box(w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );
  m.castShadow = true;
  return m;
}

function makeCanvasTexture(draw, w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textSprite(text, { font = 'bold 56px "Segoe UI", sans-serif', color = '#fff' } = {}) {
  const tex = makeCanvasTexture((ctx, w, h) => {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(20,10,30,0.85)';
    ctx.strokeText(text, w / 2, h / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.0, 0.5, 1);
  return sp;
}

function bubbleSprite(text) {
  const tex = makeCanvasTexture((ctx, w, h) => {
    // word-wrap into up to 2 lines
    ctx.font = 'bold 38px "Segoe UI", sans-serif';
    const words = text.split(' ');
    const lines = [''];
    for (const word of words) {
      const t = (lines[lines.length - 1] + ' ' + word).trim();
      if (ctx.measureText(t).width > w - 90 && lines[lines.length - 1]) lines.push(word);
      else lines[lines.length - 1] = t;
    }
    if (lines.length > 2) { lines.length = 2; lines[1] += '…'; }
    const r = 26;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.beginPath();
    ctx.roundRect(14, 8, w - 28, h - 34, r);
    ctx.fill();
    // little tail
    ctx.beginPath();
    ctx.moveTo(w / 2 - 16, h - 28);
    ctx.lineTo(w / 2, h - 4);
    ctx.lineTo(w / 2 + 16, h - 28);
    ctx.fill();
    ctx.fillStyle = '#3a2440';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cy = lines.length === 1 ? (h - 26) / 2 + 8 : 0;
    lines.forEach((ln, i) =>
      ctx.fillText(ln, w / 2, lines.length === 1 ? cy : 34 + i * 44)
    );
  }, 512, 144);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.6, 0.73, 1);
  return sp;
}

function emojiSprite(emoji) {
  const tex = makeCanvasTexture((ctx, w, h) => {
    ctx.font = '96px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, w / 2, h / 2 + 6);
  }, 128, 128);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(0.7, 0.7, 1);
  return sp;
}

/* ===================== Avatar ===================== */

export class Avatar {
  constructor(role) {
    this.role = role;
    this.anim = 'idle';
    this.speed = 0;
    this.phase = 0;
    this.time = Math.random() * 10;
    this.emotes = [];
    this._bubbleTimer = null;

    const skin = SKIN[role];
    const isF = role === 'female';

    this.group = new THREE.Group();      // root, origin at the feet
    this.body = new THREE.Group();       // rotated for lying down
    this.group.add(this.body);

    /* --- legs: hip pivot -> upper leg -> knee pivot -> lower leg + shoe --- */
    const legW = 0.26;
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.2, 0.76, 0);
      const upper = box(legW, 0.36, legW, 0x888888);
      upper.position.y = -0.18;
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.36;
      const lower = box(legW - 0.02, 0.3, legW - 0.02, 0x888888);
      lower.position.y = -0.15;
      const shoe = box(legW + 0.04, 0.12, 0.34, 0x888888);
      shoe.position.set(0, -0.32, 0.05);
      knee.add(lower, shoe);
      hip.add(knee);
      this.body.add(hip);
      this.legs.push({ hip, knee, upper, lower, shoe });
    }

    /* --- torso --- */
    const torsoW = isF ? 0.72 : 0.82;
    this.torso = box(torsoW, 0.78, 0.4, 0x888888);
    this.torso.position.y = 1.15;
    this.body.add(this.torso);

    /* --- skirt (only shown for dress outfits) --- */
    this.skirt = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.52, 8),
      new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.85 })
    );
    this.skirt.castShadow = true;
    this.skirt.position.y = 0.72;
    this.skirt.visible = false;
    this.body.add(this.skirt);

    /* --- arms: shoulder pivot -> upper (sleeve) + lower + hand --- */
    const armW = 0.22;
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * (torsoW / 2 + armW / 2 + 0.02), 1.46, 0);
      const upper = box(armW, 0.32, armW, 0x888888);
      upper.position.y = -0.16;
      const lower = box(armW - 0.02, 0.26, armW - 0.02, 0x888888);
      lower.position.y = -0.44;
      const hand = box(armW - 0.02, 0.12, armW - 0.02, skin);
      hand.position.y = -0.62;
      shoulder.add(upper, lower, hand);
      this.body.add(shoulder);
      this.arms.push({ shoulder, upper, lower, hand });
    }

    /* --- head + face --- */
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 1.58;
    this.head = box(0.56, 0.5, 0.5, skin);
    this.head.position.y = 0.27;
    this.headGroup.add(this.head);

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.02), eyeMat);
      eye.position.set(side * 0.13, 0.31, 0.255);
      this.headGroup.add(eye);
    }
    const smile = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.02), eyeMat);
    smile.position.set(0, 0.15, 0.255);
    this.headGroup.add(smile);
    if (isF) {
      const blushMat = new THREE.MeshStandardMaterial({ color: 0xff9eb5, roughness: 0.9 });
      for (const side of [-1, 1]) {
        const blush = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.02), blushMat);
        blush.position.set(side * 0.21, 0.2, 0.255);
        this.headGroup.add(blush);
      }
    }

    /* --- hair --- */
    const hairColor = HAIR[role];
    const cap = box(0.6, 0.16, 0.54, hairColor);
    cap.position.set(0, 0.5, -0.02);
    this.headGroup.add(cap);
    const fringe = box(0.6, 0.12, 0.08, hairColor);
    fringe.position.set(0, 0.44, 0.24);
    this.headGroup.add(fringe);
    if (isF) {
      const back = box(0.62, 0.62, 0.14, hairColor);
      back.position.set(0, 0.18, -0.27);
      this.headGroup.add(back);
      for (const side of [-1, 1]) {
        const strand = box(0.13, 0.55, 0.16, hairColor);
        strand.position.set(side * 0.3, 0.12, -0.14);
        this.headGroup.add(strand);
      }
      const bowMat = new THREE.MeshStandardMaterial({ color: 0xff5c9e, roughness: 0.8 });
      const bow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.1), bowMat);
      bow.position.set(0.2, 0.58, 0.05);
      bow.rotation.z = 0.4;
      this.headGroup.add(bow);
    }
    this.body.add(this.headGroup);

    /* --- name tag + chat bubble anchors --- */
    this.nameAnchor = new THREE.Group();
    this.nameAnchor.position.y = 2.42;
    this.group.add(this.nameAnchor);
    this.bubbleAnchor = new THREE.Group();
    this.bubbleAnchor.position.y = 2.95;
    this.group.add(this.bubbleAnchor);

    this.applyOutfit(0);
  }

  setName(name) {
    this.nameAnchor.clear();
    if (name) this.nameAnchor.add(textSprite(name, { color: this.role === 'female' ? '#ffd1e8' : '#cfe3ff' }));
  }

  applyOutfit(index) {
    const list = OUTFITS[this.role];
    const o = list[Math.max(0, Math.min(list.length - 1, index | 0))];
    this.outfitIndex = index;
    const skin = SKIN[this.role];
    const bareLegs = o.shorts || o.skirt;

    this.torso.material.color.setHex(o.top);
    this.skirt.visible = !!o.skirt;
    this.skirt.material.color.setHex(o.bottom);

    for (const leg of this.legs) {
      leg.upper.material.color.setHex(o.skirt ? skin : o.bottom);
      leg.lower.material.color.setHex(bareLegs ? skin : o.bottom);
      leg.shoe.material.color.setHex(o.shoes);
    }
    for (const arm of this.arms) {
      arm.upper.material.color.setHex(o.top);
      arm.lower.material.color.setHex(o.sleeves === 'long' ? o.top : skin);
    }
  }

  say(text) {
    this.bubbleAnchor.clear();
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    this.bubbleAnchor.add(bubbleSprite(text));
    this._bubbleTimer = setTimeout(() => this.bubbleAnchor.clear(), 6000);
  }

  emote(emoji) {
    const sp = emojiSprite(emoji);
    sp.position.set((Math.random() - 0.5) * 0.4, 2.3, 0);
    this.group.add(sp);
    this.emotes.push({ sp, life: 0 });
  }

  setAnim(anim, speed = 0) {
    this.anim = anim;
    this.speed = speed;
  }

  update(dt) {
    this.time += dt;
    const a = this.anim;

    // pose targets
    let hl = 0, hr = 0, kl = 0, kr = 0, sl = 0, sr = 0;
    let bodyY = 0, bodyRX = 0;

    if (a === 'walk' || a === 'run') {
      const run = a === 'run';
      this.phase += dt * (run ? 11 : 7.5);
      const s = Math.sin(this.phase);
      const amp = run ? 0.85 : 0.55;
      hl = -s * amp; hr = s * amp;
      sl = s * amp * 0.8; sr = -s * amp * 0.8;
      kl = Math.max(0, s) * (run ? 0.9 : 0.55);
      kr = Math.max(0, -s) * (run ? 0.9 : 0.55);
      bodyY = Math.abs(Math.cos(this.phase)) * (run ? 0.06 : 0.035);
    } else if (a === 'idle') {
      const b = Math.sin(this.time * 1.7);
      sl = sr = b * 0.05;
      bodyY = b * 0.012;
    } else if (a === 'sit') {
      hl = hr = -Math.PI / 2;
      kl = kr = Math.PI / 2 * 0.92;
      sl = sr = -0.25;
    } else if (a === 'sleep') {
      bodyRX = -Math.PI / 2;
      bodyY = 0.14;
      sl = sr = 0.15;
    } else if (a === 'jump') {
      hl = hr = -0.45;
      kl = kr = 0.85;
      sl = sr = -2.6;
    }

    const k = Math.min(1, dt * 12);
    const L = (cur, tgt) => cur + (tgt - cur) * k;
    this.legs[0].hip.rotation.x = L(this.legs[0].hip.rotation.x, hl);
    this.legs[1].hip.rotation.x = L(this.legs[1].hip.rotation.x, hr);
    this.legs[0].knee.rotation.x = L(this.legs[0].knee.rotation.x, kl);
    this.legs[1].knee.rotation.x = L(this.legs[1].knee.rotation.x, kr);
    this.arms[0].shoulder.rotation.x = L(this.arms[0].shoulder.rotation.x, sl);
    this.arms[1].shoulder.rotation.x = L(this.arms[1].shoulder.rotation.x, sr);
    this.body.position.y = L(this.body.position.y, bodyY);
    this.body.rotation.x = L(this.body.rotation.x, bodyRX);

    // little head tilt while idle, looking around
    this.headGroup.rotation.y = a === 'idle' ? Math.sin(this.time * 0.6) * 0.18 : L(this.headGroup.rotation.y, 0);

    // floating emotes
    for (let i = this.emotes.length - 1; i >= 0; i--) {
      const e = this.emotes[i];
      e.life += dt;
      e.sp.position.y += dt * 0.85;
      e.sp.material.opacity = Math.max(0, 1 - Math.max(0, e.life - 1.0) / 1.0);
      if (e.life > 2.1) {
        this.group.remove(e.sp);
        e.sp.material.map.dispose();
        e.sp.material.dispose();
        this.emotes.splice(i, 1);
      }
    }
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}
