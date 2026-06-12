/**
 * Minimap (bottom-left): a fixed north-up map of the whole world with live
 * pins for you and your partner. The static layer (roads, buildings, water,
 * trees) renders once; only the player pins redraw each frame.
 */

import { WORLD_RADIUS } from './world/terrain.js';

export class Minimap {
  constructor(canvas, features) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.scale = this.size / (WORLD_RADIUS * 2);
    this.time = 0;

    // pre-render the static world once
    this.staticLayer = document.createElement('canvas');
    this.staticLayer.width = this.staticLayer.height = this.size;
    this._renderStatic(this.staticLayer.getContext('2d'), features);
  }

  _mx(x) { return (x + WORLD_RADIUS) * this.scale; }
  _mz(z) { return (z + WORLD_RADIUS) * this.scale; }

  _renderStatic(g, features) {
    // grass base, rounded like the world
    g.fillStyle = '#2c5234';
    g.fillRect(0, 0, this.size, this.size);
    g.fillStyle = '#3f7d46';
    g.beginPath();
    g.arc(this.size / 2, this.size / 2, this.size / 2 - 1, 0, Math.PI * 2);
    g.fill();

    for (const f of features) {
      if (f.type === 'rect') {
        g.fillStyle = f.color;
        g.fillRect(this._mx(f.x - f.w / 2), this._mz(f.z - f.d / 2), f.w * this.scale, f.d * this.scale);
      } else if (f.type === 'circle') {
        g.fillStyle = f.color;
        g.beginPath();
        g.arc(this._mx(f.x), this._mz(f.z), Math.max(1.2, f.r * this.scale), 0, Math.PI * 2);
        g.fill();
      } else if (f.type === 'line') {
        g.strokeStyle = f.color;
        g.lineWidth = Math.max(1, f.w * this.scale);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(this._mx(f.x1), this._mz(f.z1));
        g.lineTo(this._mx(f.x2), this._mz(f.z2));
        g.stroke();
      } else if (f.type === 'emoji') {
        g.font = `${f.size || 11}px "Segoe UI Emoji", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(f.text, this._mx(f.x), this._mz(f.z));
      }
    }
  }

  /**
   * self: {x, z, ry, role} — partner: {x, z, role} | null — car: {x, z} | null
   */
  update(dt, self, partner, car) {
    this.time += dt;
    const g = this.ctx;
    g.clearRect(0, 0, this.size, this.size);
    g.drawImage(this.staticLayer, 0, 0);

    const colorOf = (role) => (role === 'female' ? '#ff7eb6' : '#6aa5ff');

    if (car) {
      g.font = '10px "Segoe UI Emoji", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🚗', this._mx(car.x), this._mz(car.z));
    }

    // partner pin: pulsing ring + heart so they're easy to find
    if (partner) {
      const px = this._mx(partner.x), pz = this._mz(partner.z);
      const pulse = 4 + Math.sin(this.time * 4) * 1.6;
      g.strokeStyle = colorOf(partner.role);
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(px, pz, pulse, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = colorOf(partner.role);
      g.beginPath();
      g.arc(px, pz, 3, 0, Math.PI * 2);
      g.fill();
      g.font = '9px "Segoe UI Emoji", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('❤', px, pz - 7);
    }

    // self pin: dot + heading wedge
    if (self) {
      const sx = this._mx(self.x), sz = this._mz(self.z);
      const fx = Math.sin(self.ry), fz = Math.cos(self.ry); // facing, world space
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(sx + fx * 8, sz + fz * 8);
      g.lineTo(sx + fz * 3.2, sz - fx * 3.2);
      g.lineTo(sx - fz * 3.2, sz + fx * 3.2);
      g.closePath();
      g.globalAlpha = 0.6;
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = colorOf(self.role);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(sx, sz, 3.6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
}
