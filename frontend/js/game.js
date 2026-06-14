/**
 * Game orchestrator: owns the renderer, scene, loop, and the wiring between
 * network ⇄ avatars ⇄ controls ⇄ UI. Feature logic lives in the modules it ties
 * together (world/, avatar/, interactions.js, effects.js).
 */
import * as THREE from 'three';
import { createWorld } from './world/index.js';
import { heightAt, LAKE, PONDS, ROADS } from './world/terrain.js';
import { Ambience } from './audio.js';
import { Avatar } from './avatar/avatar.js';
import { PlayerController } from './controls.js';
import { Network } from './network.js';
import { UI } from './ui.js';
import { HeartEffects } from './effects.js';
import { Minimap } from './minimap.js';
import { interactionHandlers } from './interactions.js';
import { CHEATS } from './cheats.js';
import { SecureChannel } from './crypto.js';
import { Theater } from './theater.js';
import {
  SPAWNS, STATE_SEND_MS, CAR_SEND_MS, EMOTE_KEYS, NUM_EMOJI, HEART_DISTANCE, KISS_DISTANCE,
  FLOWERS, POCKET_MAX, GIVE_DISTANCE,
} from './config.js';

export class Game {
  /** auth = { token, profile } when accounts are on, or null in open mode */
  constructor(auth = null) {
    this.auth = auth;
    /* renderer / scene / camera — alpha so the theater screen can punch a
       hole through to the YouTube layer behind the canvas */
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.style.position = 'relative';
    this.renderer.domElement.style.zIndex = '1'; // above the CSS3D video layer
    document.body.prepend(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(20, 10, 8);
    window.addEventListener('resize', () => this._onResize());

    /* subsystems */
    this.world = createWorld(this.scene);
    this.ui = new UI();
    this.net = new Network(auth ? auth.token : null);
    this.hearts = new HeartEffects(this.scene);
    this.secure = new SecureChannel(); // end-to-end chat encryption
    this.theater = new Theater({
      scene: this.scene, screen: this.world.theaterScreen, net: this.net, ui: this.ui,
      canvas: this.renderer.domElement,
    });
    this.ambience = new Ambience({
      water: [{ x: LAKE.x, z: LAKE.z, r: LAKE.r }, ...PONDS.map((p) => ({ x: p.x, z: p.z, r: p.r }))],
      roads: ROADS,
      paved: [{ x: 0, z: 70, r: 13 }], // city plaza
    });
    this.minimap = new Minimap(document.getElementById('minimap'), this.world.mapFeatures);
    this.controller = new PlayerController(this.camera, this.renderer.domElement, {
      colliders: this.world.colliders,
      cameraBlockers: this.world.cameraBlockers,
      isTyping: () => this.ui.isTyping(),
      lockAllowed: () => !this.ui.closetOpen && !this.theater.dialogOpen && !this.theater.browsing,
    });
    // leaving the sofa pauses the movie for both of you
    this.controller.onStandUp = (meta) => {
      if (meta.theater) this.theater.userStood();
    };

    /* state */
    this.joined = false;
    this.pocket = [];          // flower keys you're carrying (see config.FLOWERS)
    this.carSeat = null;       // null | 'driver' | 'passenger'
    this._lastCarSent = 0;
    this._night = 0;
    this.self = null;          // {id, role, name, outfit}
    this.selfAvatar = null;
    /** id → {id, role, name, outfit, avatar, target, anim, speed, look, carSeat} */
    this.remotes = new Map();
    this.currentInteractable = null;
    this._lastSent = 0;
    this._lastSentSig = '';
    this._heartTimer = 0;
    this._sweetDreamsShown = false;
    this._introAngle = 0;
    this._introTarget = new THREE.Vector3(0, 2, -25);
    this._clock = new THREE.Clock();

    this._wireNetwork();
    this._wireKeys();

    // sign out (accounts mode only): drop the session and return to sign-in
    if (this.auth) {
      const btn = document.getElementById('logout-btn');
      btn.classList.remove('hidden');
      btn.addEventListener('click', () => {
        if (!confirm('Sign out of the game?')) return;
        localStorage.removeItem('cw_token');
        this.net.socket.disconnect();
        location.reload();
      });
    }

    // Tower of Love: celebrate reaching the heart beam at the top
    this.world.tower.setOnWin((sec) => {
      const m = Math.floor(sec / 60), s = String(Math.floor(sec % 60)).padStart(2, '0');
      this.ui.toast(`🗼 You reached the top in ${m}:${s}! 🏆💕`, 4200);
      this.selfAvatar.emote('🏆');
      this.net.sendEmote('🏆');
      for (let i = 0; i < 10; i++) {
        this.hearts.spawn(
          this.controller.pos.x + (Math.random() - 0.5) * 3,
          this.controller.pos.y + 1.5 + Math.random() * 2,
          this.controller.pos.z + (Math.random() - 0.5) * 3
        );
      }
    });
  }

  start() {
    this._animate();
  }

  /** the closest other player, or null */
  nearestRemote() {
    let best = null, bestD = Infinity;
    const p = this.controller.pos;
    for (const r of this.remotes.values()) {
      const g = r.avatar.group.position;
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      if (d < bestD) { best = r; bestD = d; }
    }
    return best && { remote: best, dist: bestD };
  }

  /** distance to the closest other player (kept for interactions.js) */
  distanceToPartner() {
    const n = this.nearestRemote();
    return n ? n.dist : Infinity;
  }

  /* ============ flower pocket ============ */
  addToPocket(flowerKey) {
    this.pocket.push(flowerKey);
    this.ui.setPocket(this._pocketView());
  }

  _pocketView() {
    const counts = {};
    for (const key of this.pocket) counts[key] = (counts[key] || 0) + 1;
    return Object.entries(counts).map(([key, count]) => ({ emoji: FLOWERS[key].emoji, count }));
  }

  /* ============ couple car ============ */
  enterCar() {
    const occupied = new Set([...this.remotes.values()].map((r) => r.carSeat).filter(Boolean));
    const seat = !occupied.has('driver') ? 'driver' : !occupied.has('passenger') ? 'passenger' : null;
    if (!seat) {
      this.ui.toast('The car is full 🚗💨', 2200);
      return;
    }
    this.carSeat = seat;
    this.controller.seated = null;
    this.controller.vehicle = { car: this.world.car, seat };
    this.net.sendCarSeat(seat);
    this.ui.toast(seat === 'driver'
      ? "You're driving! WASD to cruise, Space to brake 🚗"
      : 'Enjoy the ride 💕', 2800);
  }

  exitCar() {
    const e = this.world.car.exitWorld(this.carSeat);
    this.controller.vehicle = null;
    this.controller.pos.set(e.x, heightAt(e.x, e.z), e.z);
    this.controller.anim = 'idle';
    this.carSeat = null;
    this.net.sendCarSeat(null);
  }

  _giveFlower() {
    if (!this.pocket.length) {
      this.ui.toast('Your pocket is empty — visit the Pick-a-Bloom garden 🌷', 2600);
      return;
    }
    const n = this.nearestRemote();
    if (!n || n.dist > GIVE_DISTANCE) {
      this.ui.toast('Walk up to someone to give a flower 💐', 2400);
      return;
    }
    const key = this.pocket.pop();
    this.ui.setPocket(this._pocketView());
    const f = FLOWERS[key];
    this.net.sendGift({ to: n.remote.id, flower: key });
    this.selfAvatar.emote(f.emoji);
    const g = n.remote.avatar.group.position;
    this.hearts.burst(this.controller.pos.x, this.controller.pos.z, g.x, g.z, 4, this.controller.pos.y);
    this.ui.toast(`You gave ${n.remote.name} a ${f.name} ${f.emoji}`, 2800);
  }

  /* ============ network ============ */
  _wireNetwork() {
    const { net, ui } = this;

    // spawn with a little scatter so players don't stack on one tile
    const spawnAt = (role) => {
      const sp = SPAWNS[role];
      return { x: sp.x + (Math.random() - 0.5) * 3, z: sp.z + (Math.random() - 0.5) * 2 };
    };

    net.onWelcome = (d) => {
      if (this.auth) {
        // accounts mode: your character is your account — join straight in
        const g = this.auth.profile.gender || 'male';
        const sp = spawnAt(g);
        net.join(g, this.auth.profile.displayName || '', sp.x, sp.z, this.secure.publicKeyB64);
        return;
      }
      // open mode: pick a character style — many players may share one
      ui.showSelect([], (role, name) => {
        const sp = spawnAt(role);
        net.join(role, name, sp.x, sp.z, this.secure.publicKeyB64);
      });
    };

    net.onRoles = () => {};
    net.onFull = () => ui.showFull();
    net.onDenied = (d) => ui.showFull(d && d.reason);
    net.onReplaced = () => {
      // we signed in somewhere else — that session takes over, this one ends
      ui.showFull('You signed in from another device or tab — this session was disconnected. 💌');
    };
    net.onAuthFailed = () => {
      // stale/revoked token — sign in again
      localStorage.removeItem('cw_token');
      location.reload();
    };

    net.onJoined = (d) => {
      this.self = d.self;
      this.selfAvatar = new Avatar(this.self.role);
      this.selfAvatar.applyOutfit(this.self.outfit);
      this.scene.add(this.selfAvatar.group);

      this.controller.setSpawn(this.self.x, this.self.z, Math.PI);
      this.controller.enabled = true;

      if (d.carState) this.world.car.snapTo(d.carState); // car is where it was left
      if (d.theaterState) this.theater.apply(d.theaterState, true); // movie mid-play? sync in
      for (const p of d.others) this._addRemote(p, true);

      this.joined = true;
      this.ambience.start(); // the join click is a valid audio-unlock gesture
      ui.hideSelect();
      ui.setupChat((text) => this._sendChat(text));
      ui.setupCheat((code) => {
        const cheat = CHEATS[code];
        if (cheat) cheat(this);
        else ui.toast('Nothing happened… 🤔', 2000);
      });
      ui.setPocket(this._pocketView());
      this._refreshStatus();
      if (!this.remotes.size) {
        ui.toast(`Welcome home, ${this.self.name} 💕 Share this address with your people!`, 4200);
      }
    };

    net.onPlayerJoined = (p) => {
      this._addRemote(p);
      ui.toast(`${p.name} entered your world ❤️`, 3000);
    };

    net.onState = (s) => {
      const r = this.remotes.get(s.id);
      if (!r) return;
      r.target = { x: s.x, y: s.y, z: s.z, ry: s.ry };
      r.anim = s.anim;
      r.speed = s.speed;
      r.look = { hy: s.hy || 0, hp: s.hp || 0 };
    };

    net.onOutfit = (d) => {
      const r = this.remotes.get(d.id);
      if (!r) return;
      r.outfit = d.outfit;
      r.avatar.applyOutfit(d.outfit);
      ui.toast(`${r.name} changed outfits ✨`, 1800);
    };

    net.onEmote = (d) => {
      const r = this.remotes.get(d.id);
      if (!r) return;
      r.avatar.emote(d.emoji);
      if (d.emoji === '🏆') ui.toast(`🗼 ${r.name} reached the top of the tower! 🏆`, 3600);
    };

    net.onCarState = (s) => {
      if (this.carSeat !== 'driver') this.world.car.setNetState(s);
    };

    net.onTheater = (s) => this.theater.apply(s, true);

    net.onCarSeat = (d) => {
      const r = this.remotes.get(d.id);
      if (!r) return;
      r.carSeat = d.seat;
      // both grabbed the wheel at once — lower socket id keeps it
      if (d.seat === 'driver' && this.carSeat === 'driver' && d.id < net.socket.id) {
        this.carSeat = 'passenger';
        this.controller.vehicle = { car: this.world.car, seat: 'passenger' };
        net.sendCarSeat('passenger');
        ui.toast('You slid over to the passenger seat 💺', 2400);
      }
    };

    net.onGift = (d) => {
      const r = this.remotes.get(d.id);
      if (!r) return;
      const key = d.flower in FLOWERS ? d.flower : 'rose';
      const f = FLOWERS[key];
      if (this.pocket.length < POCKET_MAX) this.addToPocket(key);
      r.avatar.emote(f.emoji);
      const g = r.avatar.group.position;
      this.hearts.burst(this.controller.pos.x, this.controller.pos.z, g.x, g.z, 4, this.controller.pos.y);
      ui.toast(`${r.name} gave you a ${f.name} ${f.emoji}!`, 3200);
    };

    net.onChat = (d) => {
      // messages arrive encrypted per recipient — ours show locally at send time
      const r = this.remotes.get(d.id);
      if (!r) return;
      const text = this.secure.decryptFrom(d.id, d.e);
      if (text === null) {
        ui.addChatMessage(d.name, '🔒 (message could not be decrypted)');
        return;
      }
      ui.addChatMessage(d.name, text);
      r.avatar.say(text);
    };

    net.onLeft = (d) => {
      const r = this.remotes.get(d.id);
      if (!r) return;
      r.avatar.dispose(this.scene);
      this.remotes.delete(d.id);
      this.secure.removePeer(d.id);
      this._refreshStatus();
      ui.toast(`💔 ${d.name} left the world`, 3000);
    };
  }

  _sendChat(text) {
    // always show our own message locally, then send ciphertext per recipient
    this.ui.addChatMessage(this.self.name, text);
    this.selfAvatar.say(text);
    for (const r of this.remotes.values()) {
      const e = this.secure.encryptFor(r.id, text);
      if (e) this.net.sendChat({ to: r.id, e });
    }
  }

  _refreshStatus() {
    if (!this.remotes.size) {
      this.ui.setPartnerStatus('💌 Waiting for your people to join…');
      return;
    }
    const names = [...this.remotes.values()].map((r) => r.name);
    this.ui.setPartnerStatus(`❤️ ${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} here`);
  }

  _addRemote(p, quiet = false) {
    const avatar = new Avatar(p.role);
    avatar.applyOutfit(p.outfit);
    avatar.setName(p.name);
    avatar.group.position.set(p.x, p.y, p.z);
    avatar.group.rotation.y = p.ry;
    this.scene.add(avatar.group);
    this.remotes.set(p.id, {
      id: p.id, role: p.role, name: p.name, outfit: p.outfit, avatar,
      target: { x: p.x, y: p.y, z: p.z, ry: p.ry },
      anim: p.anim || 'idle', speed: p.speed || 0,
      look: { hy: p.hy || 0, hp: p.hp || 0 },
      carSeat: p.carSeat || null,
    });
    this._refreshStatus();
    // establish a pairwise end-to-end encrypted chat channel
    if (p.pubkey && this.secure.setPeerKey(p.id, p.pubkey) && !quiet) {
      this.ui.toast(`🔒 Private chat with ${p.name} secured — seal: ${this.secure.fingerprintOf(p.id)}`, 4200);
    }
  }

  /* ============ input ============ */
  _wireKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.joined || this.ui.isTyping()) return;

      if (e.code === 'KeyE') this._interact();
      else if (e.code === 'KeyF') this._giveFlower();
      else if (e.code === 'Backquote') { e.preventDefault(); this.ui.openCheat(); }
      else if (e.code === 'Enter' || e.code === 'KeyT') { e.preventDefault(); this.ui.openChat(); }
      else if (e.code === 'Escape' && this.ui.closetOpen) this.ui.closeCloset();
      else if (e.code === 'KeyM') {
        this.ui.toast(this.ambience.toggle() ? '🔊 Sound on' : '🔇 Sound off', 1600);
      }
      else if (e.code === 'KeyY' && this.controller.seated && this.controller.seated.theater) {
        this.theater.openDialog();
      }
      else if (e.code === 'KeyP' && this.controller.seated && this.controller.seated.theater) {
        this.theater.togglePlay();
      }
      else if (e.code === 'KeyU' && this.controller.seated && this.controller.seated.theater) {
        this.theater.toggleBrowse();
      }
      else if (EMOTE_KEYS[e.code]) this._emote(EMOTE_KEYS[e.code]);
      else if (e.shiftKey && NUM_EMOJI[e.code]) {
        e.preventDefault();
        this._emote(NUM_EMOJI[e.code]);
      }
    });
  }

  _emote(emoji) {
    this.selfAvatar.emote(emoji);
    this.net.sendEmote(emoji);
    const n = this.nearestRemote();
    if (emoji === '😘' && n && n.dist < KISS_DISTANCE) {
      const g = n.remote.avatar.group.position;
      this.hearts.burst(this.controller.pos.x, this.controller.pos.z, g.x, g.z, 5, this.controller.pos.y);
    }
  }

  _interact() {
    if (this.ui.closetOpen) { this.ui.closeCloset(); return; }
    if (this.carSeat) { this.exitCar(); return; }
    if (this.controller.seated) { this.controller.standUp(); return; }
    const it = this.currentInteractable;
    if (!it) return;
    const handler = interactionHandlers[it.type];
    if (handler) handler(this, it);
  }

  /* ============ per-frame ============ */
  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _updateClockUI(t) {
    const hrs = (6 + t * 24) % 24;
    const h = Math.floor(hrs);
    const m = Math.floor((hrs % 1) * 60);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    let phase, emoji;
    if (h >= 5 && h < 12) { phase = 'Morning'; emoji = '🌅'; }
    else if (h >= 12 && h < 17) { phase = 'Afternoon'; emoji = '☀️'; }
    else if (h >= 17 && h < 20) { phase = 'Evening'; emoji = '🌇'; }
    else { phase = 'Night'; emoji = '🌙'; }
    this.ui.setClock(
      `${h12}:${String(m).padStart(2, '0')} ${ampm}`,
      phase, emoji, `Day ${this.net.dayNumber()}`, t
    );
  }

  _updateRemotes(dt, selfState) {
    const k = 1 - Math.exp(-12 * dt);
    for (const r of this.remotes.values()) {
      const g = r.avatar.group;
      if (r.carSeat) {
        // riders glue to the seat of OUR car instance — chaining their
        // networked position on top of the car sync looks laggy
        const car = this.world.car;
        g.position.copy(car.seatWorld(r.carSeat));
        g.rotation.y = car.state.ry;
        r.avatar.setLook(r.look.hy, r.look.hp); // passengers look around too
        r.avatar.setAnim('sit', 0);
        r.avatar.update(dt);
      } else {
        g.position.x += (r.target.x - g.position.x) * k;
        g.position.y += (r.target.y - g.position.y) * k;
        g.position.z += (r.target.z - g.position.z) * k;
        const d = ((r.target.ry - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        g.rotation.y += d * k;
        r.avatar.setLook(r.look.hy, r.look.hp);
        r.avatar.setAnim(r.anim, r.speed);
        r.avatar.update(dt);
      }
    }

    const n = this.nearestRemote();
    if (!n) {
      this._sweetDreamsShown = false;
      return;
    }

    // ambient hearts when you're close to someone
    this._heartTimer += dt;
    if (n.dist < HEART_DISTANCE && this._heartTimer > 1.6) {
      this._heartTimer = 0;
      const g = n.remote.avatar.group.position;
      this.hearts.spawn(
        (this.controller.pos.x + g.x) / 2,
        (this.controller.pos.y + g.y) / 2 + 2.2,
        (this.controller.pos.z + g.z) / 2
      );
    }

    // sleeping next to someone sleeping → sweet dreams
    if (selfState.anim === 'sleep' && n.remote.anim === 'sleep') {
      if (!this._sweetDreamsShown) {
        this._sweetDreamsShown = true;
        this.ui.toast('Sweet dreams, lovebirds 💤💕', 3600);
      }
    } else {
      this._sweetDreamsShown = false;
    }
  }

  _updateInteractablePrompt(selfState) {
    if (this.carSeat) {
      this.currentInteractable = null;
      this.ui.showPrompt(this.carSeat === 'driver'
        ? '<b>WASD</b> drive · <b>Space</b> brake · <b>E</b> hop out'
        : 'Enjoying the ride 💕 · <b>E</b> hop out');
      return;
    }
    if (this.controller.seated) {
      this.currentInteractable = null;
      this.ui.showPrompt(this.controller.seated.theater
        ? '🍿 <b>Y</b> — screen · <b>P</b> — play/pause · <b>U</b> — surf · <b>E</b> — get up'
        : 'Press <b>E</b> or move to get up');
      return;
    }
    let best = null, bestD = Infinity;
    for (const it of this.world.interactables) {
      if (it.available && !it.available()) continue; // e.g. a flower that's still regrowing
      const p = it.getPos ? it.getPos() : it;       // e.g. the car moves around
      const d = Math.hypot(p.x - selfState.x, p.z - selfState.z);
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
    this.currentInteractable = best;
    if (best) this.ui.showPrompt(`Press <b>E</b> to ${best.label}`);
    else this.ui.hidePrompt();
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this._clock.getDelta(), 0.05);
    const t = this.net.worldStart ? this.net.timeOfDay() : 0.12;

    if (!this.joined) {
      // cinematic orbit around the house while picking a character
      this._introAngle += dt * 0.08;
      this.camera.position.set(
        Math.sin(this._introAngle) * 26,
        9 + Math.sin(this._introAngle * 0.7) * 2,
        -25 + Math.cos(this._introAngle) * 26
      );
      this.camera.lookAt(this._introTarget);
      this.world.update(t, dt, this._introTarget);
      this.renderer.render(this.scene, this.camera);
      this.theater.render(this.camera);
      return;
    }

    /* couple car — before the controller so seat positions are current */
    this.world.car.update(dt, this.carSeat === 'driver' ? this.controller.keys : null, this._night);
    if (this.carSeat === 'driver') {
      const nowMs = performance.now();
      if (nowMs - this._lastCarSent > CAR_SEND_MS) {
        const c = this.world.car.state;
        this.net.sendCarState({ x: c.x, z: c.z, ry: c.ry, v: c.v });
        this._lastCarSent = nowMs;
      }
    }

    /* self */
    const state = this.controller.update(dt);
    this.selfAvatar.group.position.set(state.x, state.y, state.z);
    this.selfAvatar.group.rotation.y = state.ry;
    this.selfAvatar.setLook(state.hy, state.hp);
    this.selfAvatar.setAnim(state.anim, state.speed);
    this.selfAvatar.update(dt);
    // hide your own body in first person (your partner still sees you normally)
    this.selfAvatar.group.visible = !this.controller.firstPerson;

    // throttled state sync (only when something changed)
    const now = performance.now();
    if (now - this._lastSent > STATE_SEND_MS) {
      const sig = `${state.x.toFixed(2)},${state.y.toFixed(2)},${state.z.toFixed(2)},${state.ry.toFixed(2)},${state.anim},${state.hy.toFixed(1)},${state.hp.toFixed(1)}`;
      if (sig !== this._lastSentSig) {
        this.net.sendState(state);
        this._lastSentSig = sig;
        this._lastSent = now;
      }
    }

    this._updateRemotes(dt, state);
    this.hearts.update(dt);
    this._updateInteractablePrompt(state);

    this._night = this.world.update(t, dt, this.controller.pos, this.net.worldStart ? this.net.elapsed() : 0);
    this.theater.update(dt, this.controller.pos);
    {
      const car = this.world.car.state;
      const p = this.controller.pos;
      this.ambience.update(dt, {
        x: p.x, y: p.y, z: p.z,
        night: this._night,
        speed: this.controller.speed,
        grounded: this.controller.grounded,
        seated: !!this.controller.seated,
        inHouse: this.world.isInsideHouse(p),
        inCar: !!this.carSeat,
        carV: car.v,
        carDist: Math.hypot(p.x - car.x, p.z - car.z),
      });
    }
    this._updateClockUI(t);

    this.minimap.update(dt,
      { x: state.x, z: state.z, ry: state.ry, role: this.self.role },
      [...this.remotes.values()].map((r) => ({
        x: r.avatar.group.position.x, z: r.avatar.group.position.z, role: r.role,
      })),
      { x: this.world.car.state.x, z: this.world.car.state.z });

    this.renderer.render(this.scene, this.camera);
    this.theater.render(this.camera);
  }
}
