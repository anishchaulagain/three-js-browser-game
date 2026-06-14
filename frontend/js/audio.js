/**
 * Ambient sound — fully procedural via the Web Audio API.
 *
 * No audio files: every sound is synthesized in the browser (filtered noise +
 * oscillators), so there's nothing to host, license, or download. It matches
 * the codebase's "everything from math" approach (terrain, world, tower) and
 * deploys anywhere with zero extra config.
 *
 * Continuous beds (gain-controlled, crossfaded by time of day / place):
 *   · wind            — always, louder up on the mountains
 *   · daytime birds    — scheduled chirps in the open air
 *   · nighttime crickets + the odd owl
 *   · water            — near the lake and ponds
 * Indoors everything ducks to a cozy hush.
 *
 * Events:
 *   · footsteps — surface-aware (grass / stone / wood), paced by speed
 *   · car engine — pitch rises with the car's speed; audible near it
 *
 * Browsers require a user gesture before audio starts, so we lazily create the
 * AudioContext on the first click/keypress.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 1 when d ≤ near, ramps to 0 by d = far */
const distGain = (d, near, far) => clamp01(1 - (d - near) / (far - near));

function distToSegments(x, z, lines) {
  let best = Infinity;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
      if (d < best) best = d;
    }
  }
  return best;
}

export class Ambience {
  /** geometry: { water:[{x,z,r}], roads:[[{x,z}]], paved:[{x,z,r}] } */
  constructor(geometry = {}) {
    this.geo = {
      water: geometry.water || [],
      roads: geometry.roads || [],
      paved: geometry.paved || [],
    };
    this.ctx = null;
    this.started = false;
    this.enabled = localStorage.getItem('cw_sound') !== 'off';

    this._stride = 0;
    this._stepFoot = 0;
    this._elapsed = 0;
    this._birdAt = 0;
    this._owlAt = 0;

    // unlock on the first gesture (autoplay policy)
    this._unlock = () => this.start();
    window.addEventListener('pointerdown', this._unlock);
    window.addEventListener('keydown', this._unlock);
  }

  /* ============ setup ============ */
  start() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.started = true;
    this.ctx = new AC();
    this._build();
    this.ctx.resume();
    window.removeEventListener('pointerdown', this._unlock);
    window.removeEventListener('keydown', this._unlock);
  }

  _noise(seconds, brown = false) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      else d[i] = w;
    }
    return buf;
  }

  _loopSource(buffer) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    return src;
  }

  _build() {
    const ctx = this.ctx;
    this.whiteBuf = this._noise(1.0);
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.0001 : 0.0001; // fades up in update
    this.master.connect(ctx.destination);

    // --- wind: brown noise → lowpass ---
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    const windLP = ctx.createBiquadFilter();
    windLP.type = 'lowpass'; windLP.frequency.value = 440;
    this._loopSource(this._noise(3, true)).connect(windLP);
    windLP.connect(this.windGain).connect(this.master);

    // --- water: white noise → gentle bandpass ---
    this.waterGain = ctx.createGain(); this.waterGain.gain.value = 0;
    const waterBP = ctx.createBiquadFilter();
    waterBP.type = 'bandpass'; waterBP.frequency.value = 720; waterBP.Q.value = 0.7;
    this._loopSource(this._noise(3)).connect(waterBP);
    waterBP.connect(this.waterGain).connect(this.master);

    // --- crickets (night): bandpassed noise, pulsed by an LFO tremolo ---
    this.cricketGain = ctx.createGain(); this.cricketGain.gain.value = 0;
    const cricketBP = ctx.createBiquadFilter();
    cricketBP.type = 'bandpass'; cricketBP.frequency.value = 4600; cricketBP.Q.value = 9;
    const trem = ctx.createGain(); trem.gain.value = 0;
    this._loopSource(this.whiteBuf).connect(cricketBP);
    cricketBP.connect(trem).connect(this.cricketGain).connect(this.master);
    const lfo = ctx.createOscillator();
    lfo.type = 'square'; lfo.frequency.value = 26;
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 1;
    lfo.connect(lfoDepth).connect(trem.gain);
    lfo.start();

    // --- car engine: two detuned saws → lowpass ---
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
    const engineLP = ctx.createBiquadFilter();
    engineLP.type = 'lowpass'; engineLP.frequency.value = 900;
    this.engineOscs = [];
    for (const detune of [0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = 50; o.detune.value = detune;
      o.connect(engineLP); o.start();
      this.engineOscs.push(o);
    }
    engineLP.connect(this.engineGain).connect(this.master);
  }

  /* ============ controls ============ */
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('cw_sound', this.enabled ? 'on' : 'off');
    if (this.enabled) this.start();
    return this.enabled;
  }

  /* ============ one-shots ============ */
  _chirp(level) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const notes = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const s = t0 + i * 0.09;
      const o = ctx.createOscillator(); o.type = 'triangle';
      const g = ctx.createGain();
      const f0 = 2200 + Math.random() * 1500;
      o.frequency.setValueAtTime(f0, s);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.5, s + 0.05);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.92, s + 0.1);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.13 * level, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, s + 0.13);
      o.connect(g).connect(this.master);
      o.start(s); o.stop(s + 0.15);
    }
  }

  _owl() {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 760;
    lp.connect(this.master);
    for (const off of [0, 0.55]) {
      const s = t0 + off;
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain();
      o.frequency.setValueAtTime(370, s);
      o.frequency.linearRampToValueAtTime(335, s + 0.32);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.16, s + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0008, s + 0.36);
      o.connect(g).connect(lp);
      o.start(s); o.stop(s + 0.4);
    }
  }

  _footstep(surface) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.whiteBuf;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let dur = 0.07, peak = 0.09;
    if (surface === 'wood') { f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.3; peak = 0.12; }
    else if (surface === 'stone') { f.type = 'lowpass'; f.frequency.value = 3400; peak = 0.11; dur = 0.05; }
    else { f.type = 'lowpass'; f.frequency.value = 1500; peak = 0.085; } // grass
    // alternate feet for a touch of variation
    this._stepFoot ^= 1;
    peak *= this._stepFoot ? 1 : 0.85;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    const off = Math.random() * (this.whiteBuf.duration - dur - 0.01);
    src.start(t0, off, dur + 0.02);
    if (surface === 'wood') { // a soft knock under the floorboards
      const o = ctx.createOscillator(); o.type = 'sine';
      const kg = ctx.createGain();
      o.frequency.setValueAtTime(150, t0);
      kg.gain.setValueAtTime(0.05, t0);
      kg.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.06);
      o.connect(kg).connect(this.master);
      o.start(t0); o.stop(t0 + 0.07);
    }
  }

  _surfaceAt(x, z, inHouse) {
    if (inHouse) return 'wood';
    if (distToSegments(x, z, this.geo.roads) < 3.6) return 'stone';
    for (const p of this.geo.paved) if (Math.hypot(x - p.x, z - p.z) < p.r) return 'stone';
    return 'grass';
  }

  /* ============ per-frame ============ */
  /** s = {x, y, z, night, speed, grounded, seated, inHouse, inCar, carV, carDist} */
  update(dt, s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this._elapsed += dt;
    const now = this.ctx.currentTime;
    const ramp = (param, target, tau = 0.4) => param.setTargetAtTime(target, now, tau);

    const indoorDuck = s.inHouse ? 0.28 : 1;
    const day = clamp01(1 - s.night);

    // master fades in/out for the mute toggle
    ramp(this.master.gain, this.enabled ? 0.62 : 0.0001, 0.25);

    // wind — a little stronger up high, with slow JS-driven gusts
    const altitude = clamp01((s.y - 6) / 40);
    const gust = 0.7 + 0.3 * Math.sin(this._elapsed * 0.23) + 0.18 * Math.sin(this._elapsed * 0.07);
    ramp(this.windGain.gain, (0.05 + altitude * 0.13) * gust * indoorDuck);

    // water — nearest lake/pond
    let waterClose = Infinity;
    for (const w of this.geo.water) {
      waterClose = Math.min(waterClose, Math.hypot(s.x - w.x, s.z - w.z) - w.r);
    }
    const wob = 0.85 + 0.15 * Math.sin(this._elapsed * 0.6);
    ramp(this.waterGain.gain, distGain(waterClose, 2, 20) * 0.14 * wob * indoorDuck);

    // crickets at night
    ramp(this.cricketGain.gain, clamp01((s.night - 0.35) / 0.5) * 0.05 * indoorDuck);

    // birds (day) + owl (deep night), only out in the open
    if (!s.inHouse) {
      if (day > 0.3 && this._elapsed > this._birdAt) {
        this._chirp(day);
        this._birdAt = this._elapsed + (2.2 + Math.random() * 5) / day;
      }
      if (s.night > 0.55 && this._elapsed > this._owlAt) {
        if (this._owlAt > 0) this._owl();
        this._owlAt = this._elapsed + 14 + Math.random() * 22;
      }
    }

    // footsteps, paced by ground speed
    if (s.grounded && !s.seated && !s.inCar && s.speed > 0.4) {
      this._stride += s.speed * dt;
      if (this._stride >= 1.7) {
        this._stride = 0;
        this._footstep(this._surfaceAt(s.x, s.z, s.inHouse));
      }
    } else {
      this._stride = 1.6; // primed so the next step lands promptly
    }

    // car engine — pitch climbs with speed; loud when you're in or near it
    const speedFreq = 46 + Math.abs(s.carV || 0) * 7;
    for (const o of this.engineOscs) o.frequency.setTargetAtTime(speedFreq, now, 0.12);
    const near = s.inCar ? 1 : distGain(s.carDist, 3, 22);
    const moving = Math.min(1, 0.35 + Math.abs(s.carV || 0) / 10);
    ramp(this.engineGain.gain, near * moving * 0.11, 0.15);
  }
}
