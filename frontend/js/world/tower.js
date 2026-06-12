/**
 * 🗼 Tower of Love — a Tower-of-Hell-style vertical obby for two.
 *
 * Faithful to the original formula:
 *   · a tower of randomly-picked obstacle sections, stacked 8 high
 *   · regenerates every 8-minute round (mid-climb too — that's the drama)
 *   · NO checkpoints: fall and you catch what you can on the way down
 *   · touch the glowing heart beam at the top to win
 *
 * The section layout is seeded from the round number, which both clients
 * derive from the server-synced world clock — so the couple always races
 * the exact same tower with zero extra netcode. Platforms use the 3D
 * 'platform' collider type (stand on top, pass underneath, sides push).
 *
 * Every section enters at local corner (-5,-5) and exits at (5,-5) one
 * storey (7 m) up; stacking rotates each section 90° more than the last,
 * which makes the exits line up with the next entry by construction.
 */
import * as THREE from 'three';
import { mat, box } from './helpers.js';
import { mulberry32, WORLD_SEED } from './rng.js';
import { TOWER } from './terrain.js';

export const ROUND_MS = 8 * 60 * 1000;
const STOREYS = 8;
const STOREY_H = 7;
const TOP_Y = STOREYS * STOREY_H;        // 56 — the summit deck
const THICK = 0.35;                      // platform slab thickness

const jit = (rng) => (rng() - 0.5) * 0.5;
const P = (x, z, y, w = 2.2, d = 2.2) => ({ x, z, y, w, d });

/* ---- section library: each climbs 0 → ~6 m; the builder appends the
       shared exit pad at (5,-5,6.85). Max rise/step ≤ 1.2, gaps walkable. */
const SECTIONS = [
  function perimeterSpiral(rng) {
    const route = [[-5, -2.5], [-5, 0], [-5, 2.5], [-5, 5], [-2.5, 5], [0, 5], [2.5, 5], [5, 5], [5, 2.5], [5, 0], [5, -2.5]];
    return route.map(([x, z], i) => P(x + jit(rng), z + jit(rng), 0.6 + i * 0.58));
  },
  function zigzagBeams(rng) {
    const pads = [];
    for (let i = 0; i < 4; i++) {
      pads.push(P((i % 2 ? 1 : -1) + jit(rng), -3.5 + i * 2.3, 1.0 + i * 0.95, 8, 1.1));
    }
    pads.push(P(5, 2.5, 4.8, 2, 2), P(5, -0.3, 5.7, 2, 2), P(5, -3, 6.4, 2, 2));
    return pads;
  },
  function pillarHop(rng) {
    const route = [[-5, -2], [-4.6, 0.8], [-2.6, 2.8], [-0.2, 4.2], [2.2, 3.8], [4, 2], [4.7, -0.4], [5, -2.8]];
    return route.map(([x, z], i) => P(x + jit(rng) * 0.6, z + jit(rng) * 0.6, 1 + i * 0.78, 1.7, 1.7));
  },
  function centerClimb(rng) {
    return [
      P(-3.2 + jit(rng), -4.2, 0.9), P(-1 + jit(rng), -3.6, 1.8),
      P(0, 0, 2.7, 4.5, 4.5),                        // the big center slab
      P(3 + jit(rng), 1.5, 3.6), P(4.6, 3.5, 4.5, 1.8, 1.8),
      P(4.8, 0.5, 5.4, 1.8, 1.8), P(5, -2.2, 6.2, 1.8, 1.8),
    ];
  },
  function gapLedges(rng) {
    // the long-jump section — gaps stay walk-jumpable, runs make them trivial
    return [
      P(-5, -0.8 + jit(rng), 0.95, 2.6, 3.2),
      P(-4.6, 3.5 + jit(rng), 1.9, 3, 2.6),
      P(-0.4 + jit(rng), 4.4, 2.85, 3.4, 2.4),
      P(3.9, 4.2 + jit(rng), 3.8, 3, 2.6),
      P(4.7, 0.2 + jit(rng), 4.75, 2.4, 3.2),
      P(5, -3.3, 5.7, 2, 2.6),
      P(2.6, -4.7, 6.35, 2.4, 2.4),
    ];
  },
  function checkerHop(rng) {
    const route = [[-5, -2.3], [-3.2, -0.8], [-4.6, 1.2], [-2.6, 2.8], [-0.4, 1.6], [1.4, 3.2], [3.2, 2], [4.6, 3.4], [5, 0.8], [4.4, -1.6]];
    return route.map(([x, z], i) => P(x + jit(rng) * 0.5, z + jit(rng) * 0.5, 0.7 + i * 0.6, 1.7, 1.7));
  },
];

/** rotate a pad (and its footprint) by s × 90° around the tower axis */
function rot(pad, s) {
  let { x, z, w, d } = pad;
  for (let i = 0; i < (s & 3); i++) {
    const nx = -z, nz = x;
    x = nx; z = nz;
    const nw = d; d = w; w = nw;
  }
  return { ...pad, x, z, w, d };
}

/** all world-space pads for one round */
export function towerPads(round) {
  const rng = mulberry32((WORLD_SEED ^ Math.imul(round + 1, 0x9e3779b9)) | 0);
  const pads = [rot(P(-5, -5, 0.2, 3, 3), 0)]; // ground entry step
  for (let s = 0; s < STOREYS; s++) {
    const gen = SECTIONS[Math.floor(rng() * SECTIONS.length)];
    for (const pad of gen(rng)) pads.push({ ...rot(pad, s), y: rot(pad, s).y + s * STOREY_H });
    pads.push({ ...rot(P(5, -5, 7, 2.8, 2.8), s), y: 7 + s * STOREY_H }); // shared exit, flush with the next storey
  }
  return pads;
}

export function buildTower(ctx) {
  const { scene, colliders, interactables, mapFeatures } = ctx;
  const root = new THREE.Group();
  root.position.set(TOWER.x, 0, TOWER.z);
  scene.add(root);

  /* ---- static shell: base, corner pillars, summit deck, win beam ---- */
  const base = new THREE.Mesh(new THREE.CylinderGeometry(16, 16.6, 0.5, 36), mat(0xbfb39e));
  base.position.y = 0.05;
  base.receiveShadow = true;
  root.add(base);

  for (const [px, pz] of [[-6.6, -6.6], [6.6, -6.6], [-6.6, 6.6], [6.6, 6.6]]) {
    const pillar = box(0.9, TOP_Y + 2.5, 0.9, mat(0xf5f0e6));
    pillar.position.set(px, (TOP_Y + 2.5) / 2, pz);
    root.add(pillar);
    ctx.addBoxCollider(TOWER.x + px, TOWER.z + pz, 0.9, 0.9);
  }

  const deck = box(14, 0.5, 14, mat(0xf2d4e0));
  deck.position.y = TOP_Y + 0.15;
  root.add(deck);
  colliders.push({
    type: 'platform',
    minX: TOWER.x - 7, maxX: TOWER.x + 7, minZ: TOWER.z - 7, maxZ: TOWER.z + 7,
    y0: TOP_Y - 0.1, y1: TOP_Y + 0.4,
  });

  const beamMat = new THREE.MeshStandardMaterial({
    color: 0xff5c8a, emissive: 0xff5c8a, emissiveIntensity: 1.4, transparent: true, opacity: 0.85,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 16, 1, true), beamMat);
  beam.position.y = TOP_Y + 3.4;
  root.add(beam);
  const beamLight = new THREE.PointLight(0xff5c8a, 10, 30, 1.6);
  beamLight.position.y = TOP_Y + 2;
  root.add(beamLight);

  /* ---- live countdown sign at the base ---- */
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512; signCanvas.height = 128;
  const sg = signCanvas.getContext('2d');
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  function drawSign(msLeft) {
    sg.fillStyle = '#241a30';
    sg.fillRect(0, 0, 512, 128);
    sg.fillStyle = '#ff9ecb';
    sg.font = 'bold 44px "Segoe UI", sans-serif';
    sg.textAlign = 'center';
    sg.fillText('🗼 TOWER OF LOVE', 256, 50);
    const s = Math.max(0, Math.ceil(msLeft / 1000));
    sg.fillStyle = '#fff';
    sg.font = '30px "Segoe UI", sans-serif';
    sg.fillText(`no checkpoints · new tower in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 256, 98);
    signTex.needsUpdate = true;
  }
  drawSign(ROUND_MS);
  for (const sx of [-2.1, 2.1]) {
    const post = box(0.16, 2.6, 0.16, mat(0x6f4e37));
    post.position.set(8.5 + sx, 1.3, 11.5);
    root.add(post);
  }
  const board = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: false }));
  board.position.set(8.5, 2.2, 11.55);
  board.rotation.y = Math.PI; // faces the road gate to the south-east
  root.add(board);
  ctx.addBoxCollider(TOWER.x + 8.5, TOWER.z + 11.5, 4.6, 0.3);

  mapFeatures.push({ type: 'circle', x: TOWER.x, z: TOWER.z, r: 16, color: '#bfb39e' });
  mapFeatures.push({ type: 'emoji', x: TOWER.x, z: TOWER.z, text: '🗼', size: 13 });
  interactables.push({
    x: TOWER.x - 5 + 0, z: TOWER.z - 5, radius: 2.5,
    label: 'start climbing — no checkpoints! 🗼', type: 'moment',
    data: { emoji: '🧗', toast: 'Race you to the heart at the top! 🗼💕' },
  });

  /* ---- per-round platforms (one InstancedMesh, per-section colors) ---- */
  const padGeo = new THREE.BoxGeometry(1, 1, 1);
  const padMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  let padMesh = null;
  let roundColliders = [];
  let currentRound = -1;
  let won = false;

  function rebuild(round) {
    currentRound = round;
    won = false;
    if (padMesh) { root.remove(padMesh); padMesh.dispose(); }
    if (roundColliders.length) {
      const dead = new Set(roundColliders);
      let w = 0;
      for (let i = 0; i < colliders.length; i++) if (!dead.has(colliders[i])) colliders[w++] = colliders[i];
      colliders.length = w;
    }
    roundColliders = [];

    const pads = towerPads(round);
    padMesh = new THREE.InstancedMesh(padGeo, padMat, pads.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const p = new THREE.Vector3(), s = new THREE.Vector3();
    const color = new THREE.Color();
    const colRng = mulberry32((round * 7919 + 13) | 0);
    let sectionHue = colRng();
    pads.forEach((pad, i) => {
      p.set(pad.x, pad.y - THICK / 2, pad.z);
      s.set(pad.w, THICK, pad.d);
      m4.compose(p, q, s);
      padMesh.setMatrixAt(i, m4);
      if (i % 12 === 0) sectionHue = colRng(); // fresh candy color every so often
      padMesh.setColorAt(i, color.setHSL((sectionHue + (i % 12) * 0.004) % 1, 0.65, 0.56));
      roundColliders.push({
        type: 'platform',
        minX: TOWER.x + pad.x - pad.w / 2, maxX: TOWER.x + pad.x + pad.w / 2,
        minZ: TOWER.z + pad.z - pad.d / 2, maxZ: TOWER.z + pad.z + pad.d / 2,
        y0: pad.y - THICK, y1: pad.y,
      });
    });
    padMesh.castShadow = true;
    root.add(padMesh);
    colliders.push(...roundColliders);
  }
  rebuild(0);

  /* ---- per-frame: round clock, countdown sign, win beam ---- */
  let signAccum = 0;
  let onWin = null;
  function update(dt, playerPos, elapsedMs, night) {
    const round = Math.floor(Math.max(0, elapsedMs) / ROUND_MS);
    if (round !== currentRound) rebuild(round);

    signAccum += dt;
    if (signAccum > 1) {
      signAccum = 0;
      drawSign(ROUND_MS - (Math.max(0, elapsedMs) % ROUND_MS));
    }

    beamMat.emissiveIntensity = 1.1 + Math.sin(elapsedMs / 300) * 0.4;
    beamLight.intensity = 8 + night * 8;

    if (!won && playerPos &&
        Math.abs(playerPos.x - TOWER.x) < 1.6 && Math.abs(playerPos.z - TOWER.z) < 1.6 &&
        playerPos.y > TOP_Y - 0.5) {
      won = true;
      if (onWin) onWin((Math.max(0, elapsedMs) % ROUND_MS) / 1000);
    }
  }

  return { update, setOnWin: (fn) => { onWin = fn; } };
}
