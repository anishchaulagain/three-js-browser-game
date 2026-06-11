/**
 * Game orchestrator: owns the renderer, scene, loop, and the wiring between
 * network ⇄ avatars ⇄ controls ⇄ UI. Feature logic lives in the modules it ties
 * together (world/, avatar/, interactions.js, effects.js).
 */
import * as THREE from 'three';
import { createWorld } from './world/index.js';
import { Avatar } from './avatar/avatar.js';
import { PlayerController } from './controls.js';
import { Network } from './network.js';
import { UI } from './ui.js';
import { HeartEffects } from './effects.js';
import { interactionHandlers } from './interactions.js';
import { SPAWNS, STATE_SEND_MS, EMOTE_KEYS, HEART_DISTANCE, KISS_DISTANCE } from './config.js';

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
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.position.set(20, 10, 8);
    window.addEventListener('resize', () => this._onResize());

    /* subsystems */
    this.world = createWorld(this.scene);
    this.ui = new UI();
    this.net = new Network();
    this.hearts = new HeartEffects(this.scene);
    this.controller = new PlayerController(this.camera, this.renderer.domElement, {
      colliders: this.world.colliders,
      cameraBlockers: this.world.cameraBlockers,
      isTyping: () => this.ui.isTyping(),
    });

    /* state */
    this.joined = false;
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

  /* ============ network ============ */
  _wireNetwork() {
    const { net, ui } = this;

    net.onWelcome = (d) => {
      ui.showSelect(d.taken, (role, name) => {
        const sp = SPAWNS[role];
        net.join(role, name, sp.x, sp.z);
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

      for (const p of d.others) this._addPartner(p);

      this.joined = true;
      ui.hideSelect();
      ui.setupChat((text) => net.sendChat(text));
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
    };

    net.onOutfit = (d) => {
      if (!this.partner || d.id !== this.partner.id) return;
      this.partner.outfit = d.outfit;
      this.partner.avatar.applyOutfit(d.outfit);
      ui.toast(`${this.partner.name} changed outfits ✨`, 1800);
    };

    net.onEmote = (d) => {
      if (this.partner && d.id === this.partner.id) this.partner.avatar.emote(d.emoji);
    };

    net.onChat = (d) => {
      ui.addChatMessage(d.name, d.text);
      if (this.self && d.id === net.socket.id) this.selfAvatar.say(d.text);
      else if (this.partner && d.id === this.partner.id) this.partner.avatar.say(d.text);
    };

    net.onLeft = (d) => {
      if (this.partner && d.id === this.partner.id) {
        this.partner.avatar.dispose(this.scene);
        this.partner = null;
        ui.setPartnerStatus('💌 Waiting for your love to join…');
        ui.toast(`💔 ${d.name} left the world`, 3000);
      }
    };
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
    };
    this.ui.setPartnerStatus(`❤️ ${p.name} is here`);
  }

  /* ============ input ============ */
  _wireKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.joined || this.ui.isTyping()) return;

      if (e.code === 'KeyE') this._interact();
      else if (e.code === 'Enter') { e.preventDefault(); this.ui.openChat(); }
      else if (e.code === 'Escape' && this.ui.closetOpen) this.ui.closeCloset();
      else if (EMOTE_KEYS[e.code]) {
        const emoji = EMOTE_KEYS[e.code];
        this.selfAvatar.emote(emoji);
        this.net.sendEmote(emoji);
        if (emoji === '😘' && this.partner && this.distanceToPartner() < KISS_DISTANCE) {
          const g = this.partner.avatar.group.position;
          this.hearts.burst(this.controller.pos.x, this.controller.pos.z, g.x, g.z);
        }
      }
    });
  }

  _interact() {
    if (this.ui.closetOpen) { this.ui.closeCloset(); return; }
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
    const k = 1 - Math.exp(-12 * dt);
    g.position.x += (p.target.x - g.position.x) * k;
    g.position.y += (p.target.y - g.position.y) * k;
    g.position.z += (p.target.z - g.position.z) * k;
    let d = ((p.target.ry - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    g.rotation.y += d * k;
    p.avatar.setAnim(p.anim, p.speed);
    p.avatar.update(dt);

    // ambient hearts when the couple is close
    this._heartTimer += dt;
    if (this.distanceToPartner() < HEART_DISTANCE && this._heartTimer > 1.6) {
      this._heartTimer = 0;
      this.hearts.spawn(
        (this.controller.pos.x + g.position.x) / 2,
        2.2,
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
    if (this.controller.seated) {
      this.currentInteractable = null;
      this.ui.showPrompt('Press <b>E</b> or move to get up');
      return;
    }
    let best = null, bestD = Infinity;
    for (const it of this.world.interactables) {
      const d = Math.hypot(it.x - selfState.x, it.z - selfState.z);
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

    /* self */
    const state = this.controller.update(dt);
    this.selfAvatar.group.position.set(state.x, state.y, state.z);
    this.selfAvatar.group.rotation.y = state.ry;
    this.selfAvatar.setAnim(state.anim, state.speed);
    this.selfAvatar.update(dt);

    // throttled state sync (only when something changed)
    const now = performance.now();
    if (now - this._lastSent > STATE_SEND_MS) {
      const sig = `${state.x.toFixed(2)},${state.y.toFixed(2)},${state.z.toFixed(2)},${state.ry.toFixed(2)},${state.anim}`;
      if (sig !== this._lastSentSig) {
        this.net.sendState(state);
        this._lastSentSig = sig;
        this._lastSent = now;
      }
    }

    if (this.partner) this._updatePartner(dt, state);
    this.hearts.update(dt);
    this._updateInteractablePrompt(state);

    this.world.update(t, dt, this.controller.pos);
    this._updateClockUI(t);

    this.renderer.render(this.scene, this.camera);
  }
}
