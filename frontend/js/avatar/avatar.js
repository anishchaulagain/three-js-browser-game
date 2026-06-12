/** Roblox-style blocky avatar: body build, outfit application, animation. */
import * as THREE from 'three';
import { OUTFITS, SKIN, HAIR } from './outfits.js';
import { textSprite, bubbleSprite, emojiSprite } from './sprites.js';

function box(w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );
  m.castShadow = true;
  return m;
}

export class Avatar {
  constructor(role) {
    this.role = role;
    this.anim = 'idle';
    this.speed = 0;
    this.phase = 0;
    this.lookYaw = 0;   // head-tracking targets (relative to the body)
    this.lookPitch = 0;
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
    this._bubbleTimer = setTimeout(() => this.bubbleAnchor.clear(), 7500);
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

  /** Point the head: yaw relative to the body, pitch up(−)/down(+). */
  setLook(hy = 0, hp = 0) {
    this.lookYaw = hy || 0;
    this.lookPitch = hp || 0;
  }

  update(dt) {
    this.time += dt;
    const a = this.anim;

    // pose targets
    let hl = 0, hr = 0, kl = 0, kr = 0, sl = 0, sr = 0;
    let zl = 0, zr = 0; // shoulder z (arms raised sideways — dancing)
    let bodyY = 0, bodyRX = 0, bodyRY = 0, bodyRZ = 0;

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
    } else if (a === 'crouch') {
      // low squat; shuffles the legs when moving while crouched
      const shuffle = this.speed > 0.3 ? Math.sin((this.phase += dt * 8)) * 0.28 : 0;
      hl = -1.0 + shuffle;
      hr = -1.0 - shuffle;
      kl = kr = 1.55;
      sl = sr = -0.35;
      bodyY = -0.24;
    } else if (a === 'bow') {
      // courteous bow: torso bends forward, legs counter-rotate to stay planted
      bodyRX = 0.6;
      hl = hr = -0.6;
      kl = kr = 0.15;
      sl = sr = 0.4;
      bodyY = 0.12;
    } else if (a === 'dance') {
      // disco loop: alternating arm raises, stepping feet, hip sway and a twist
      this.phase += dt * 6.2;
      const p = Math.sin(this.phase), q = Math.cos(this.phase);
      zl = -0.9 + p * 0.7;
      zr = 0.9 + p * 0.7;
      sl = -0.5 + q * 0.3;
      sr = -0.5 - q * 0.3;
      hl = Math.max(0, p) * 0.5;
      hr = Math.max(0, -p) * 0.5;
      kl = Math.max(0, p) * 0.8;
      kr = Math.max(0, -p) * 0.8;
      bodyY = Math.abs(q) * 0.06;
      bodyRY = p * 0.18;
      bodyRZ = p * 0.06;
    }

    const k = Math.min(1, dt * 12);
    const L = (cur, tgt) => cur + (tgt - cur) * k;
    this.legs[0].hip.rotation.x = L(this.legs[0].hip.rotation.x, hl);
    this.legs[1].hip.rotation.x = L(this.legs[1].hip.rotation.x, hr);
    this.legs[0].knee.rotation.x = L(this.legs[0].knee.rotation.x, kl);
    this.legs[1].knee.rotation.x = L(this.legs[1].knee.rotation.x, kr);
    this.arms[0].shoulder.rotation.x = L(this.arms[0].shoulder.rotation.x, sl);
    this.arms[1].shoulder.rotation.x = L(this.arms[1].shoulder.rotation.x, sr);
    this.arms[0].shoulder.rotation.z = L(this.arms[0].shoulder.rotation.z, zl);
    this.arms[1].shoulder.rotation.z = L(this.arms[1].shoulder.rotation.z, zr);
    this.body.position.y = L(this.body.position.y, bodyY);
    this.body.rotation.x = L(this.body.rotation.x, bodyRX);
    this.body.rotation.y = L(this.body.rotation.y, bodyRY);
    this.body.rotation.z = L(this.body.rotation.z, bodyRZ);

    // head tracks the look direction, plus a little wandering glance at rest
    const sway = a === 'idle' ? Math.sin(this.time * 0.6) * 0.08 : 0;
    this.headGroup.rotation.y = L(this.headGroup.rotation.y, a === 'sleep' ? 0 : this.lookYaw + sway);
    this.headGroup.rotation.x = L(this.headGroup.rotation.x, a === 'sleep' ? 0 : this.lookPitch);

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
