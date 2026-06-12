/**
 * Game orchestrator: owns the renderer, scene, loop, and the wiring between
 * network ⇄ avatars ⇄ controls ⇄ UI. Feature logic lives in the modules it ties
 * together (world/, avatar/, interactions.js, effects.js).
 */
import * as THREE from 'three';
import { createWorld } from './world/index.js';
import { heightAt } from './world/terrain.js';
import { Avatar } from './avatar/avatar.js';
import { PlayerController } from './controls.js';
import { Network } from './network.js';
import { UI } from './ui.js';
import { HeartEffects } from './effects.js';
import { Minimap } from './minimap.js';
import { interactionHandlers } from './interactions.js';
import { CHEATS } from './cheats.js';
import { SecureChannel } from './crypto.js';
import {
  SPAWNS, STATE_SEND_MS, CAR_SEND_MS, EMOTE_KEYS, NUM_EMOJI, HEART_DISTANCE, KISS_DISTANCE,
  FLOWERS, POCKET_MAX, GIVE_DISTANCE,
} from './config.js';

export class Game {
  constructor() {
    /* renderer / scene / camera */
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.prepend(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(20, 10, 8);
    window.addEventListener('resize', () => this._onResize());

    /* subsystems */
    this.world = createWorld(this.scene);
    this.ui = new UI();
    this.net = new Network();
    this.hearts = new HeartEffects(this.scene);
    this.secure = new SecureChannel(); // end-to-end chat encryption
    this.minimap = new Minimap(document.getElementById('minimap'), this.world.mapFeatures);
    this.controller = new PlayerController(this.camera, this.renderer.domElement, {
      colliders: this.world.colliders,
      cameraBlockers: this.world.cameraBlockers,
      isTyping: () => this.ui.isTyping(),
      lockAllowed: () => !this.ui.closetOpen,
    });

    /* state */
    this.joined = false;
    this.pocket = [];          // flower keys you're carrying (see config.FLOWERS)
    this.carSeat = null;       // null | 'driver' | 'passenger'
    this.partnerCarSeat = null;
    this._lastCarSent = 0;
    this._night = 0;
    this.self = null;          // {id, role, name, outfit}
    this.selfAvatar = null;
    this.partner = null;       // {id, role, name, outfit, avatar, target, anim, speed}
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

  distanceToPartner() {
    if (!this.partner) return Infinity;
    const g = this.partner.avatar.group.position;
    const p = this.controller.pos;
    return Math.hypot(g.x - p.x, g.z - p.z);
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
    const seat = this.partnerCarSeat === 'driver' ? 'passenger' : 'driver';
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
    if (!this.partner || this.distanceToPartner() > GIVE_DISTANCE) {
      this.ui.toast('Walk up to your love to give a flower 💐', 2400);
      return;
    }
    const key = this.pocket.pop();
    this.ui.setPocket(this._pocketView());
    const f = FLOWERS[key];
    this.net.sendGift(key);
    this.selfAvatar.emote(f.emoji);
    const g = this.partner.avatar.group.position;
    this.hearts.burst(this.controller.pos.x, this.controller.pos.z, g.x, g.z, 4, this.controller.pos.y);
    this.ui.toast(`You gave ${this.partner.name} a ${f.name} ${f.emoji}`, 2800);
  }

  /* ============ network ============ */
  _wireNetwork() {
    const { net, ui } = this;

    net.onWelcome = (d) => {
      ui.showSelect(d.taken, (role, name) => {
        const sp = SPAWNS[role];
        net.join(role, name, sp.x, sp.z, this.secure.publicKeyB64);
      });
    };

    net.onRoles = (d) => ui.updateTaken(d.taken);
    net.onFull = () => ui.showFull();

    net.onJoined = (d) => {
      this.self = d.self;
      this.selfAvatar = new Avatar(this.self.role);
      this.selfAvatar.applyOutfit(this.self.outfit);
      this.scene.add(this.selfAvatar.group);

      this.controller.setSpawn(this.self.x, this.self.z, Math.PI);
      this.controller.enabled = true;

      if (d.carState) this.world.car.snapTo(d.carState); // car is where it was left
      for (const p of d.others) this._addPartner(p);

      this.joined = true;
      ui.hideSelect();
      ui.setupChat((text) => this._sendChat(text));
      ui.setupCheat((code) => {
        const cheat = CHEATS[code];
        if (cheat) cheat(this);
        else ui.toast('Nothing happened… 🤔', 2000);
      });
      ui.setPocket(this._pocketView());
      if (!this.partner) {
        ui.setPartnerStatus('💌 Waiting for your love to join…');
        ui.toast(`Welcome home, ${this.self.name} 💕 Share this address with your partner!`, 4200);
      }
    };

    net.onPlayerJoined = (p) => {
      this._addPartner(p);
      ui.toast(`${p.name} entered your world ❤️`, 3000);
    };

    net.onState = (s) => {
      if (!this.partner || s.id !== this.partner.id) return;
      this.partner.target = { x: s.x, y: s.y, z: s.z, ry: s.ry };
      this.partner.anim = s.anim;
      this.partner.speed = s.speed;
      this.partner.look = { hy: s.hy || 0, hp: s.hp || 0 };
    };

    net.onOutfit = (d) => {
      if (!this.partner || d.id !== this.partner.id) return;
      this.partner.outfit = d.outfit;
      this.partner.avatar.applyOutfit(d.outfit);
      ui.toast(`${this.partner.name} changed outfits ✨`, 1800);
    };

    net.onEmote = (d) => {
      if (this.partner && d.id === this.partner.id) {
        this.partner.avatar.emote(d.emoji);
        if (d.emoji === '🏆') ui.toast(`🗼 ${this.partner.name} reached the top of the tower! 🏆`, 3600);
      }
    };

    net.onCarState = (s) => {
      if (this.carSeat !== 'driver') this.world.car.setNetState(s);
    };

    net.onCarSeat = (d) => {
      if (!this.partner || d.id !== this.partner.id) return;
      this.partnerCarSeat = d.seat;
      // both grabbed the wheel at once — lower socket id keeps it
      if (d.seat === 'driver' && this.carSeat === 'driver' && d.id < net.socket.id) {
        this.carSeat = 'passenger';
        this.controller.vehicle = { car: this.world.car, seat: 'passenger' };
        net.sendCarSeat('passenger');
        ui.toast('You slid over to the passenger seat 💺', 2400);
      }
    };

    net.onGift = (d) => {
      if (!this.partner || d.id !== this.partner.id) return;
      const key = d.flower in FLOWERS ? d.flower : 'rose';
      const f = FLOWERS[key];
      if (this.pocket.length < POCKET_MAX) this.addToPocket(key);
      this.partner.avatar.emote(f.emoji);
      const g = this.partner.avatar.group.position;
      this.hearts.burst(this.controller.pos.x, this.controller.pos.z, g.x, g.z, 4, this.controller.pos.y);
      ui.toast(`${this.partner.name} gave you a ${f.name} ${f.emoji}!`, 3200);
    };

    net.onChat = (d) => {
      // only the partner's (encrypted) messages arrive — our own show locally at send time
      if (!this.partner || d.id !== this.partner.id) return;
      const text = this.secure.decrypt(d.e);
      if (text === null) {
        ui.addChatMessage(d.name, '🔒 (message could not be decrypted)');
        return;
      }
      ui.addChatMessage(d.name, text);
      this.partner.avatar.say(text);
    };

    net.onLeft = (d) => {
      if (this.partner && d.id === this.partner.id) {
        this.partner.avatar.dispose(this.scene);
        this.partner = null;
        this.partnerCarSeat = null;
        ui.setPartnerStatus('💌 Waiting for your love to join…');
        ui.toast(`💔 ${d.name} left the world`, 3000);
      }
    };
  }

  _sendChat(text) {
    // always show our own message locally, then send only ciphertext
    this.ui.addChatMessage(this.self.name, text);
    this.selfAvatar.say(text);
    if (this.partner && this.secure.ready) {
      this.net.sendChat(this.secure.encrypt(text));
    }
  }

  _addPartner(p) {
    const avatar = new Avatar(p.role);
    avatar.applyOutfit(p.outfit);
    avatar.setName(p.name);
    avatar.group.position.set(p.x, p.y, p.z);
    avatar.group.rotation.y = p.ry;
    this.scene.add(avatar.group);
    this.partner = {
      id: p.id, role: p.role, name: p.name, outfit: p.outfit, avatar,
      target: { x: p.x, y: p.y, z: p.z, ry: p.ry },
      anim: p.anim || 'idle', speed: p.speed || 0,
      look: { hy: p.hy || 0, hp: p.hp || 0 },
    };
    this.partnerCarSeat = p.carSeat || null;
    this.ui.setPartnerStatus(`❤️ ${p.name} is here`);
    // establish the end-to-end encrypted chat channel
    if (p.pubkey && this.secure.setPartnerKey(p.pubkey)) {
      this.ui.toast(`🔒 Private chat secured — your love seal: ${this.secure.fingerprint}`, 4200);
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
    if (emoji === '😘' && this.partner && this.distanceToPartner() < KISS_DISTANCE) {
      const g = this.partner.avatar.group.position;
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

  _updatePartner(dt, selfState) {
    const p = this.partner;
    const g = p.avatar.group;
    if (this.partnerCarSeat) {
      // partner is in the car: glue them to the seat of OUR car instance —
      // chaining their networked position on top of the car sync looks laggy
      const car = this.world.car;
      g.position.copy(car.seatWorld(this.partnerCarSeat));
      g.rotation.y = car.state.ry;
      p.avatar.setLook(p.look.hy, p.look.hp); // passengers look around too
      p.avatar.setAnim('sit', 0);
      p.avatar.update(dt);
    } else {
      const k = 1 - Math.exp(-12 * dt);
      g.position.x += (p.target.x - g.position.x) * k;
      g.position.y += (p.target.y - g.position.y) * k;
      g.position.z += (p.target.z - g.position.z) * k;
      let d = ((p.target.ry - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      g.rotation.y += d * k;
      p.avatar.setLook(p.look.hy, p.look.hp);
      p.avatar.setAnim(p.anim, p.speed);
      p.avatar.update(dt);
    }

    // ambient hearts when the couple is close
    this._heartTimer += dt;
    if (this.distanceToPartner() < HEART_DISTANCE && this._heartTimer > 1.6) {
      this._heartTimer = 0;
      this.hearts.spawn(
        (this.controller.pos.x + g.position.x) / 2,
        (this.controller.pos.y + g.position.y) / 2 + 2.2,
        (this.controller.pos.z + g.position.z) / 2
      );
    }

    // both asleep → sweet dreams
    if (selfState.anim === 'sleep' && p.anim === 'sleep') {
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
      this.ui.showPrompt('Press <b>E</b> or move to get up');
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

    if (this.partner) this._updatePartner(dt, state);
    this.hearts.update(dt);
    this._updateInteractablePrompt(state);

    this._night = this.world.update(t, dt, this.controller.pos, this.net.worldStart ? this.net.elapsed() : 0);
    this._updateClockUI(t);

    this.minimap.update(dt,
      { x: state.x, z: state.z, ry: state.ry, role: this.self.role },
      this.partner
        ? { x: this.partner.avatar.group.position.x, z: this.partner.avatar.group.position.z, role: this.partner.role }
        : null,
      { x: this.world.car.state.x, z: this.world.car.state.z });

    this.renderer.render(this.scene, this.camera);
  }
}
