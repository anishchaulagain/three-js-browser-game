import * as THREE from 'three';
import { createWorld } from './world.js';
import { Avatar, OUTFITS } from './avatar.js';
import { PlayerController } from './controls.js';
import { Network } from './network.js';
import { UI } from './ui.js';

/* ============ renderer / scene ============ */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(20, 10, 8);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const world = createWorld(scene);
const ui = new UI();
const net = new Network();
const controller = new PlayerController(camera, renderer.domElement, {
  colliders: world.colliders,
  cameraBlockers: world.cameraBlockers,
  isTyping: () => ui.isTyping(),
});

/* ============ game state ============ */
let joined = false;
let self = null;            // {id, role, name, outfit}
let selfAvatar = null;
let partner = null;         // {id, role, name, outfit, avatar, target:{x,y,z,ry}, anim, speed}
let lastSent = 0;
let lastSentState = '';
let heartTimer = 0;
let sweetDreamsShown = false;
let currentInteractable = null;

const SPAWNS = { male: { x: -1.2, z: 3 }, female: { x: 1.2, z: 3 } };

/* ============ floating hearts between the couple ============ */
const heartTex = (() => {
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
})();
const hearts = [];
function spawnHeart(x, y, z) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthTest: false }));
  sp.position.set(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8);
  const s = 0.25 + Math.random() * 0.25;
  sp.scale.set(s, s, 1);
  scene.add(sp);
  hearts.push({ sp, life: 0 });
}
function updateHearts(dt) {
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    h.life += dt;
    h.sp.position.y += dt * 0.7;
    h.sp.position.x += Math.sin(h.life * 4) * dt * 0.3;
    h.sp.material.opacity = Math.max(0, 1 - h.life / 2);
    if (h.life > 2) {
      scene.remove(h.sp);
      h.sp.material.dispose();
      hearts.splice(i, 1);
    }
  }
}

/* ============ network wiring ============ */
net.onWelcome = (d) => {
  ui.showSelect(d.taken, (role, name) => {
    const sp = SPAWNS[role];
    net.join(role, name, sp.x, sp.z);
  });
};

net.onRoles = (d) => ui.updateTaken(d.taken);

net.onFull = () => ui.showFull();

net.onJoined = (d) => {
  self = d.self;
  selfAvatar = new Avatar(self.role);
  selfAvatar.applyOutfit(self.outfit);
  // no name tag over your own head — you know who you are; partner sees theirs
  scene.add(selfAvatar.group);

  controller.setSpawn(self.x, self.z, Math.PI);
  controller.enabled = true;

  for (const p of d.others) addPartner(p);

  joined = true;
  ui.hideSelect();
  ui.setupChat((text) => {
    net.sendChat(text);
  });
  if (!partner) {
    ui.setPartnerStatus('💌 Waiting for your love to join…');
    ui.toast(`Welcome home, ${self.name} 💕 Share this address with your partner!`, 4200);
  }
};

function addPartner(p) {
  const avatar = new Avatar(p.role);
  avatar.applyOutfit(p.outfit);
  avatar.setName(p.name);
  avatar.group.position.set(p.x, p.y, p.z);
  avatar.group.rotation.y = p.ry;
  scene.add(avatar.group);
  partner = {
    id: p.id, role: p.role, name: p.name, outfit: p.outfit, avatar,
    target: { x: p.x, y: p.y, z: p.z, ry: p.ry },
    anim: p.anim || 'idle', speed: p.speed || 0,
  };
  ui.setPartnerStatus(`❤️ ${p.name} is here`);
}

net.onPlayerJoined = (p) => {
  addPartner(p);
  ui.toast(`${p.name} entered your world ❤️`, 3000);
};

net.onState = (s) => {
  if (!partner || s.id !== partner.id) return;
  partner.target = { x: s.x, y: s.y, z: s.z, ry: s.ry };
  partner.anim = s.anim;
  partner.speed = s.speed;
};

net.onOutfit = (d) => {
  if (!partner || d.id !== partner.id) return;
  partner.outfit = d.outfit;
  partner.avatar.applyOutfit(d.outfit);
  ui.toast(`${partner.name} changed outfits ✨`, 1800);
};

net.onEmote = (d) => {
  if (partner && d.id === partner.id) partner.avatar.emote(d.emoji);
};

net.onChat = (d) => {
  ui.addChatMessage(d.name, d.text);
  if (self && d.id === net.socket.id) selfAvatar.say(d.text);
  else if (partner && d.id === partner.id) partner.avatar.say(d.text);
};

net.onLeft = (d) => {
  if (partner && d.id === partner.id) {
    partner.avatar.dispose(scene);
    partner = null;
    ui.setPartnerStatus('💌 Waiting for your love to join…');
    ui.toast(`💔 ${d.name} left the world`, 3000);
  }
};

/* ============ interactions ============ */
function handleInteract() {
  if (ui.closetOpen) { ui.closeCloset(); return; }
  if (controller.seated) { controller.standUp(); return; }
  const it = currentInteractable;
  if (!it) return;

  switch (it.type) {
    case 'closet':
      ui.openCloset(OUTFITS[self.role], self.outfit, (i) => {
        self.outfit = i;
        selfAvatar.applyOutfit(i);
        net.sendOutfit(i);
        selfAvatar.emote('✨');
        net.sendEmote('✨');
      });
      break;
    case 'bed': {
      const slot = it.data.slots[self.role === 'male' ? 0 : 1];
      controller.sitAt({ x: slot.x, z: slot.z, y: it.data.y, ry: slot.ry, exit: slot.exit }, 'sleep');
      ui.toast('So cozy… 💤 (move to get up)', 2200);
      break;
    }
    case 'seat':
      controller.sitAt(it.data, 'sit');
      break;
    case 'cook': {
      selfAvatar.emote('🍳');
      net.sendEmote('🍳');
      const together = partner && dist2D(partner.target, controller.pos) < 5;
      ui.toast(together ? 'Dinner for two, coming up 🍝❤️' : 'You cooked a lovely meal 🍝', 2600);
      break;
    }
    case 'fridge': {
      const snack = ['🧃', '🍎', '🍰', '🍓', '🍫'][Math.floor(Math.random() * 5)];
      selfAvatar.emote(snack);
      net.sendEmote(snack);
      ui.toast(`You grabbed a snack ${snack}`, 2000);
      break;
    }
  }
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

window.addEventListener('keydown', (e) => {
  if (!joined) return;
  if (ui.isTyping()) return;

  if (e.code === 'KeyE') handleInteract();
  else if (e.code === 'Enter') { e.preventDefault(); ui.openChat(); }
  else if (e.code === 'Escape' && ui.closetOpen) ui.closeCloset();
  else if (e.code === 'KeyH') { selfAvatar.emote('❤️'); net.sendEmote('❤️'); }
  else if (e.code === 'KeyG') { selfAvatar.emote('👋'); net.sendEmote('👋'); }
  else if (e.code === 'KeyK') {
    selfAvatar.emote('😘');
    net.sendEmote('😘');
    if (partner && dist2D(partner.target, controller.pos) < 2.5) {
      for (let i = 0; i < 5; i++) {
        spawnHeart(
          (controller.pos.x + partner.target.x) / 2,
          1.6 + Math.random(),
          (controller.pos.z + partner.target.z) / 2
        );
      }
    }
  }
});

/* ============ clock ============ */
function updateClockUI(t) {
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
  ui.setClock(
    `${h12}:${String(m).padStart(2, '0')} ${ampm}`,
    phase, emoji, `Day ${net.dayNumber()}`, t
  );
}

/* ============ main loop ============ */
const clock = new THREE.Clock();
const introTarget = new THREE.Vector3(0, 2, -25);
let introAngle = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = net.worldStart ? net.timeOfDay() : 0.12;

  if (!joined) {
    // cinematic orbit around the house while picking a character
    introAngle += dt * 0.08;
    camera.position.set(
      Math.sin(introAngle) * 26,
      9 + Math.sin(introAngle * 0.7) * 2,
      -25 + Math.cos(introAngle) * 26
    );
    camera.lookAt(introTarget);
    world.update(t, dt, introTarget);
    renderer.render(scene, camera);
    return;
  }

  /* --- self --- */
  const state = controller.update(dt);
  selfAvatar.group.position.set(state.x, state.y, state.z);
  selfAvatar.group.rotation.y = state.ry;
  selfAvatar.setAnim(state.anim, state.speed);
  selfAvatar.update(dt);

  // throttled state sync (only when something changed)
  const now = performance.now();
  if (now - lastSent > 60) {
    const sig = `${state.x.toFixed(2)},${state.y.toFixed(2)},${state.z.toFixed(2)},${state.ry.toFixed(2)},${state.anim}`;
    if (sig !== lastSentState) {
      net.sendState(state);
      lastSentState = sig;
      lastSent = now;
    }
  }

  /* --- partner interpolation --- */
  if (partner) {
    const g = partner.avatar.group;
    const k = 1 - Math.exp(-12 * dt);
    g.position.x += (partner.target.x - g.position.x) * k;
    g.position.y += (partner.target.y - g.position.y) * k;
    g.position.z += (partner.target.z - g.position.z) * k;
    let d = ((partner.target.ry - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    g.rotation.y += d * k;
    partner.avatar.setAnim(partner.anim, partner.speed);
    partner.avatar.update(dt);

    // ambient hearts when the couple is close
    heartTimer += dt;
    if (dist2D(g.position, controller.pos) < 2.4 && heartTimer > 1.6) {
      heartTimer = 0;
      spawnHeart(
        (controller.pos.x + g.position.x) / 2,
        2.2,
        (controller.pos.z + g.position.z) / 2
      );
    }

    // both asleep → sweet dreams
    if (state.anim === 'sleep' && partner.anim === 'sleep') {
      if (!sweetDreamsShown) {
        sweetDreamsShown = true;
        ui.toast('Sweet dreams, lovebirds 💤💕', 3600);
      }
    } else {
      sweetDreamsShown = false;
    }
  }

  updateHearts(dt);

  /* --- interactable detection --- */
  if (controller.seated) {
    currentInteractable = null;
    ui.showPrompt('Press <b>E</b> or move to get up');
  } else {
    let best = null, bestD = Infinity;
    for (const it of world.interactables) {
      const d = Math.hypot(it.x - state.x, it.z - state.z);
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
    currentInteractable = best;
    if (best) ui.showPrompt(`Press <b>E</b> to ${best.label}`);
    else ui.hidePrompt();
  }

  /* --- environment + clock --- */
  world.update(t, dt, controller.pos);
  updateClockUI(t);

  renderer.render(scene, camera);
}

animate();

// debug hook (handy for testing/poking around in devtools)
window.__game = { controller, world, net, ui };
