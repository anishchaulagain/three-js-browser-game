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
  const W = 512, FONT = 'bold 38px "Segoe UI", sans-serif', LINE_H = 44, MAX_W = W - 90;

  // word-wrap into as many lines as the message needs; words longer than a
  // whole line (no spaces) get broken character by character
  const scratch = document.createElement('canvas').getContext('2d');
  scratch.font = FONT;
  const lines = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const tryLine = cur ? cur + ' ' + word : word;
    if (scratch.measureText(tryLine).width <= MAX_W) { cur = tryLine; continue; }
    if (cur) { lines.push(cur); cur = ''; }
    let chunk = '';
    for (const ch of word) {
      if (scratch.measureText(chunk + ch).width > MAX_W && chunk) { lines.push(chunk); chunk = ch; }
      else chunk += ch;
    }
    cur = chunk;
  }
  if (cur) lines.push(cur);

  // canvas grows with the text: rounded box + tail underneath
  const rectH = lines.length * LINE_H + 26;
  const H = 8 + rectH + 26;
  const tex = makeCanvasTexture((ctx, w, h) => {
    ctx.font = FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.beginPath();
    ctx.roundRect(14, 8, w - 28, rectH, 26);
    ctx.fill();
    const tailTop = 8 + rectH - 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 16, tailTop);
    ctx.lineTo(w / 2, tailTop + 22);
    ctx.lineTo(w / 2 + 16, tailTop);
    ctx.fill();
    ctx.fillStyle = '#3a2440';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((ln, i) => ctx.fillText(ln, w / 2, 43 + i * LINE_H));
  }, W, H);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.center.set(0.5, 0); // anchor at the tail tip, so tall bubbles grow upward
  sp.scale.set(2.6, 2.6 * H / W, 1);
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
