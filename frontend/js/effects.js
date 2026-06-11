/** Visual effects layered on top of the world — currently floating hearts. */
import * as THREE from 'three';

function makeHeartTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = '72px "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('❤️', 48, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class HeartEffects {
  constructor(scene) {
    this.scene = scene;
    this.tex = makeHeartTexture();
    this.hearts = [];
  }

  spawn(x, y, z) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false }));
    sp.position.set(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8);
    const s = 0.25 + Math.random() * 0.25;
    sp.scale.set(s, s, 1);
    this.scene.add(sp);
    this.hearts.push({ sp, life: 0 });
  }

  /** A little burst between two points (used for kisses). */
  burst(ax, az, bx, bz, count = 5) {
    for (let i = 0; i < count; i++) {
      this.spawn((ax + bx) / 2, 1.6 + Math.random(), (az + bz) / 2);
    }
  }

  update(dt) {
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.life += dt;
      h.sp.position.y += dt * 0.7;
      h.sp.position.x += Math.sin(h.life * 4) * dt * 0.3;
      h.sp.material.opacity = Math.max(0, 1 - h.life / 2);
      if (h.life > 2) {
        this.scene.remove(h.sp);
        h.sp.material.dispose();
        this.hearts.splice(i, 1);
      }
    }
  }
}
