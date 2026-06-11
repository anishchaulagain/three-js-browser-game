/** Canvas-based sprites: name tags, chat bubbles, emote emojis. */
import * as THREE from 'three';

export function makeCanvasTexture(draw, w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function textSprite(text, { font = 'bold 56px "Segoe UI", sans-serif', color = '#fff' } = {}) {
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

export function bubbleSprite(text) {
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

export function emojiSprite(emoji) {
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
