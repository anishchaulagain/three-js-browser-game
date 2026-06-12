/**
 * Dynamic terrain streaming — how the browser handles the big map.
 *
 * The world is split into 80×80 m chunks. Each chunk owns one heightmapped
 * ground tile (vertex-colored: grass → meadow → rock → snow, sand near water)
 * plus all its vegetation packed into a handful of InstancedMeshes, so a
 * loaded chunk costs ~10 draw calls no matter how many plants it holds.
 * Chunks are created as the player approaches and fully disposed (geometry,
 * instance buffers, colliders) once they fall behind, so memory and draw
 * calls stay flat however far the couple roams.
 *
 * A single coarse "far mesh" of the whole map sits 1.2 m below the detailed
 * tiles and provides the mountain silhouettes beyond chunk range.
 *
 * Everything is seeded per-chunk, so both clients grow identical forests.
 */
import * as THREE from 'three';
import { mulberry32, WORLD_SEED } from './rng.js';
import { heightAt, gradientAt, noise2, scatterClear, WORLD_RADIUS } from './terrain.js';

const CHUNK = 80;          // metres per chunk
const SEG = 40;            // ground quads per side (2 m grid)
const LOAD_R = 280;        // chunks appear inside this radius…
const UNLOAD_R = 330;      // …and are disposed beyond this one (hysteresis)
const BUILD_BUDGET = 1;    // chunks built per frame while streaming
const CORE_R = 192;        // inside this, nature.js already planted everything

/* ---- ground tinting ---- */
const _g1 = new THREE.Color(0x4e9a52), _g2 = new THREE.Color(0x6fb964);
const _dry = new THREE.Color(0x96a857), _sand = new THREE.Color(0xc9bd92);
const _rockA = new THREE.Color(0x77747c), _rockB = new THREE.Color(0x8e8b90);
const _snow = new THREE.Color(0xf3f6fa);
const _col = new THREE.Color(), _rock = new THREE.Color();
const sstep = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));

function groundColor(h, slope, wx, wz, out, o) {
  const n = noise2(wx + 17, wz - 41, 23);
  _col.copy(_g1).lerp(_g2, n);
  if (h > 6) _col.lerp(_dry, sstep(h, 6, 24) * 0.5);                 // sun-dried uplands
  const rockT = Math.max(sstep(slope, 0.5, 0.95), sstep(h, 20, 30)); // cliffs + high ground
  if (rockT > 0) _col.lerp(_rock.copy(_rockA).lerp(_rockB, n), rockT);
  const snowT = sstep(h, 40, 50);
  if (snowT > 0) _col.lerp(_snow, snowT);
  // sandy beaches around lakes/ponds — but deep grassy valleys stay green
  const sandT = sstep(0.05 - h, 0, 0.6) * (1 - sstep(-h, 1.6, 3));
  if (sandT > 0) _col.lerp(_sand, sandT);
  out[o] = _col.r; out[o + 1] = _col.g; out[o + 2] = _col.b;
}

const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

/* ---- shared vegetation geometry/materials (origin at the base of each prop) ---- */
const VEG = {
  trunkGeo: new THREE.CylinderGeometry(0.22, 0.32, 2.0, 7).translate(0, 1, 0),
  leafGeo: new THREE.SphereGeometry(1.5, 9, 7).translate(0, 2.9, 0),
  pineLowGeo: new THREE.ConeGeometry(1.6, 2.2, 7).translate(0, 2.1, 0),
  pineHighGeo: new THREE.ConeGeometry(1.05, 1.9, 7).translate(0, 3.6, 0),
  rockGeo: new THREE.DodecahedronGeometry(0.55).translate(0, 0.3, 0),
  bushGeo: new THREE.SphereGeometry(0.8, 8, 6).scale(1, 0.7, 1).translate(0, 0.5, 0),
  grassGeo: new THREE.ConeGeometry(0.08, 0.55, 4).translate(0, 0.27, 0),
  stemGeo: new THREE.BoxGeometry(0.05, 0.32, 0.05).translate(0, 0.16, 0),
  headGeo: new THREE.BoxGeometry(0.14, 0.14, 0.14).translate(0, 0.36, 0),

  trunkMat: new THREE.MeshStandardMaterial({ color: 0x6f4e37, roughness: 0.9 }),
  leafMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),   // tinted per instance
  pineMat: new THREE.MeshStandardMaterial({ color: 0x1e6e46, roughness: 0.9 }),
  rockMat: new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.95 }),
  bushMat: new THREE.MeshStandardMaterial({ color: 0x3a8a4d, roughness: 0.9 }),
  grassMat: new THREE.MeshStandardMaterial({ color: 0x4f8f4a, roughness: 0.95 }),
  stemMat: new THREE.MeshStandardMaterial({ color: 0x3f7d3f, roughness: 0.9 }),
  headMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),   // tinted per instance
};

const LEAF_TINTS = [0x2e8b57, 0x3cb371, 0x49a14f, 0x6b9e3f].map((c) => new THREE.Color(c));
const FLOWER_TINTS = [0xfff04d, 0xff8fb3, 0xc77dff, 0xffffff, 0xff4d79].map((c) => new THREE.Color(c));

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

function instanced(geo, mtl, transforms, parent, { shadow = false, tints = null } = {}) {
  if (!transforms.length) return;
  const mesh = new THREE.InstancedMesh(geo, mtl, transforms.length);
  transforms.forEach((t, i) => {
    _e.set(0, t.ry || 0, 0);
    _q.setFromEuler(_e);
    _p.set(t.x, t.y, t.z);
    _s.setScalar(t.s || 1);
    _m4.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m4);
    if (tints) mesh.setColorAt(i, tints[i]);
  });
  mesh.castShadow = shadow;
  parent.add(mesh);
}

function buildChunk(ci, cj, colliderSink) {
  const ox = ci * CHUNK, oz = cj * CHUNK;
  const group = new THREE.Group();
  group.name = `chunk:${ci},${cj}`;

  /* ground tile — analytic normals so lighting is seamless across chunks */
  const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const wx = ox + pos.getX(i), wz = oz + pos.getZ(i);
    const h = heightAt(wx, wz);
    pos.setY(i, h);
    const g = gradientAt(wx, wz);
    const inv = 1 / Math.hypot(g.dx, 1, g.dz);
    nrm.setXYZ(i, -g.dx * inv, inv, -g.dz * inv);
    groundColor(h, Math.hypot(g.dx, g.dz), wx, wz, colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, groundMat);
  ground.position.set(ox, 0, oz);
  ground.receiveShadow = true;
  group.add(ground);

  /* deterministic scatter (skips the hand-built core and all designed places) */
  const rng = mulberry32((WORLD_SEED ^ Math.imul(ci, 73856093) ^ Math.imul(cj, 19349663)) | 0);
  const colliders = [];
  const trees = [], pines = [], rocks = [], bushes = [], grass = [], flowers = [];
  const leafTints = [], flowerTints = [];

  const sample = () => {
    const wx = ox + (rng() - 0.5) * CHUNK, wz = oz + (rng() - 0.5) * CHUNK;
    const d0 = Math.hypot(wx, wz);
    if (d0 < CORE_R || d0 > WORLD_RADIUS - 6 || !scatterClear(wx, wz)) return null;
    const g = gradientAt(wx, wz);
    return { wx, wz, h: heightAt(wx, wz), slope: Math.hypot(g.dx, g.dz) };
  };

  for (let n = 0; n < 18; n++) {           // trees thin out with altitude
    const c = sample();
    if (!c || c.h < -0.2 || c.h > 26 || c.slope > 0.75) continue;
    if (rng() < c.h / 30) continue;
    const s = 0.8 + rng() * 0.8;
    const t = { x: c.wx, y: c.h, z: c.wz, ry: rng() * Math.PI * 2, s };
    if (rng() < 0.4) pines.push(t);
    else { trees.push(t); leafTints.push(LEAF_TINTS[Math.floor(rng() * LEAF_TINTS.length)]); }
    colliders.push({ type: 'circle', x: c.wx, z: c.wz, r: 0.5 * s });
  }
  for (let n = 0; n < 8; n++) {            // rocks survive anywhere, even the peaks
    const c = sample();
    if (!c || c.slope > 1.4) continue;
    const s = 0.5 + rng() * 1.1;
    rocks.push({ x: c.wx, y: c.h, z: c.wz, ry: rng() * Math.PI * 2, s });
    if (s > 0.8) colliders.push({ type: 'circle', x: c.wx, z: c.wz, r: 0.55 * s });
  }
  for (let n = 0; n < 10; n++) {
    const c = sample();
    if (!c || c.h < -0.1 || c.h > 22 || c.slope > 0.7) continue;
    bushes.push({ x: c.wx, y: c.h, z: c.wz, ry: rng() * Math.PI * 2, s: 0.7 + rng() * 0.8 });
  }
  for (let n = 0; n < 60; n++) {
    const c = sample();
    if (!c || c.h < -0.1 || c.h > 18 || c.slope > 0.55) continue;
    grass.push({ x: c.wx, y: c.h, z: c.wz, ry: rng() * Math.PI, s: 0.7 + rng() * 0.9 });
  }
  for (let n = 0; n < 14; n++) {
    const c = sample();
    if (!c || c.h < -0.05 || c.h > 14 || c.slope > 0.45) continue;
    flowers.push({ x: c.wx, y: c.h, z: c.wz, ry: rng() * Math.PI, s: 1 });
    flowerTints.push(FLOWER_TINTS[Math.floor(rng() * FLOWER_TINTS.length)]);
  }

  instanced(VEG.trunkGeo, VEG.trunkMat, trees.concat(pines), group, { shadow: true });
  instanced(VEG.leafGeo, VEG.leafMat, trees, group, { shadow: true, tints: leafTints });
  instanced(VEG.pineLowGeo, VEG.pineMat, pines, group, { shadow: true });
  instanced(VEG.pineHighGeo, VEG.pineMat, pines, group);
  instanced(VEG.rockGeo, VEG.rockMat, rocks, group, { shadow: true });
  instanced(VEG.bushGeo, VEG.bushMat, bushes, group);
  instanced(VEG.grassGeo, VEG.grassMat, grass, group);
  instanced(VEG.stemGeo, VEG.stemMat, flowers, group);
  instanced(VEG.headGeo, VEG.headMat, flowers, group, { tints: flowerTints });

  colliderSink.push(...colliders);
  return { group, ground, colliders, cx: ox, cz: oz };
}

/** whole-map silhouette: coarse, sits below the detail tiles, never unloads */
function buildFarMesh() {
  const size = WORLD_RADIUS * 2.2, n = 88;
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i), wz = pos.getZ(i);
    const h = heightAt(wx, wz);
    pos.setY(i, h - 1.2);
    const g = gradientAt(wx, wz);
    const inv = 1 / Math.hypot(g.dx, 1, g.dz);
    nrm.setXYZ(i, -g.dx * inv, inv, -g.dz * inv);
    groundColor(h, Math.hypot(g.dx, g.dz), wx, wz, colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, groundMat);
}

export function createChunks(ctx) {
  const { scene, colliders } = ctx;
  const chunks = new Map();
  const key = (i, j) => `${i},${j}`;

  scene.add(buildFarMesh());

  function load(i, j) {
    const chunk = buildChunk(i, j, colliders);
    chunks.set(key(i, j), chunk);
    scene.add(chunk.group);
  }

  function unload(k, chunk) {
    scene.remove(chunk.group);
    chunk.ground.geometry.dispose();
    chunk.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    if (chunk.colliders.length) {
      const dead = new Set(chunk.colliders);
      let w = 0;
      for (let r = 0; r < colliders.length; r++) {
        if (!dead.has(colliders[r])) colliders[w++] = colliders[r];
      }
      colliders.length = w;
    }
    chunks.delete(k);
  }

  const wanted = [];
  function update(px, pz) {
    // stream in what's coming into range, nearest first
    const ci = Math.round(px / CHUNK), cj = Math.round(pz / CHUNK);
    const range = Math.ceil(LOAD_R / CHUNK);
    wanted.length = 0;
    for (let i = ci - range; i <= ci + range; i++) {
      for (let j = cj - range; j <= cj + range; j++) {
        if (chunks.has(key(i, j))) continue;
        const d = Math.hypot(i * CHUNK - px, j * CHUNK - pz);
        if (d > LOAD_R || Math.hypot(i * CHUNK, j * CHUNK) > WORLD_RADIUS + CHUNK * 0.75) continue;
        wanted.push([d, i, j]);
      }
    }
    wanted.sort((a, b) => a[0] - b[0]);
    for (let n = 0; n < Math.min(BUILD_BUDGET, wanted.length); n++) load(wanted[n][1], wanted[n][2]);

    for (const [k, chunk] of chunks) {
      if (Math.hypot(chunk.cx - px, chunk.cz - pz) > UNLOAD_R) unload(k, chunk);
    }
  }

  /** synchronous warm start so there's ground on the very first frame */
  function prime(px, pz, r) {
    const range = Math.ceil(r / CHUNK);
    const ci = Math.round(px / CHUNK), cj = Math.round(pz / CHUNK);
    for (let i = ci - range; i <= ci + range; i++) {
      for (let j = cj - range; j <= cj + range; j++) {
        if (Math.hypot(i * CHUNK - px, j * CHUNK - pz) <= r && !chunks.has(key(i, j))) load(i, j);
      }
    }
  }

  return { update, prime };
}
