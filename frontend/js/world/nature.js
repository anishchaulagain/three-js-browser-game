/**
 * The outdoors: ground, hills, path, pond + bench, picnic + heart garden,
 * trees, flowers, rocks and night fireflies.
 */
import * as THREE from 'three';
import { mat, box, addFlower } from './helpers.js';
import { HOUSE_BOUNDS as H } from './house.js';

const POND = { x: 19, z: 13, r: 7 };
const PICNIC = { x: -15, z: 10 };
const GARDEN = { x: -16, z: 17 };

export function buildNature(ctx) {
  const { scene, rng, colliders, interactables, addBoxCollider, mapFeatures } = ctx;

  /* ---- ground + horizon hills ---- */
  const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 48), mat(0x57a55a));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.4;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(55 + rng() * 35, 16, 12), mat(0x3f6b46));
    hill.scale.y = 0.28;
    hill.position.set(Math.cos(a) * 200, -4, Math.sin(a) * 200);
    scene.add(hill);
  }

  /* ---- stone path from spawn to the front door ---- */
  for (let z = -2; z >= -19; z -= 1.7) {
    const stone = box(1.5, 0.06, 1.2, mat(0xc2b8a3));
    stone.position.set((rng() - 0.5) * 0.3, 0.03, z);
    stone.rotation.y = (rng() - 0.5) * 0.3;
    stone.receiveShadow = true;
    scene.add(stone);
  }

  /* ---- pond + bench ---- */
  {
    const bed = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 0.6, 28), mat(0x4a6b43));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(POND.x, 0.02, POND.z);
    scene.add(bed);
    const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 28), new THREE.MeshStandardMaterial({
      color: 0x4aa3df, transparent: true, opacity: 0.75, roughness: 0.15, metalness: 0.1,
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(POND.x, 0.16, POND.z);
    scene.add(water);
    mapFeatures.push({ type: 'circle', x: POND.x, z: POND.z, r: POND.r, color: '#4aa3df' });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rng() * 0.3), mat(0x8d8d8d));
      rock.position.set(POND.x + Math.cos(a) * (POND.r + 0.5), 0.2, POND.z + Math.sin(a) * (POND.r + 0.5));
      rock.castShadow = true;
      scene.add(rock);
    }
    // bench facing the pond
    const bx = POND.x - POND.r - 2.4, bz = POND.z;
    const bSeat = box(0.55, 0.1, 1.9, mat(0x8a5a36));
    bSeat.position.set(bx, 0.5, bz);
    scene.add(bSeat);
    const bBack = box(0.1, 0.6, 1.9, mat(0x8a5a36));
    bBack.position.set(bx - 0.26, 0.9, bz);
    scene.add(bBack);
    for (const side of [-1, 1]) {
      const leg = box(0.4, 0.5, 0.12, mat(0x5e5e5e));
      leg.position.set(bx, 0.25, bz + side * 0.8);
      scene.add(leg);
    }
    addBoxCollider(bx, bz, 0.7, 2.0);
    for (const side of [-1, 1]) {
      interactables.push({
        x: bx + 0.5, z: bz + side * 0.55, radius: 1.3,
        label: 'sit by the pond 🌊', type: 'seat',
        data: { x: bx, z: bz + side * 0.55, y: -0.21, ry: Math.PI / 2, exit: { x: bx + 1.1, z: bz + side * 0.55 } },
      });
    }
  }

  /* ---- picnic spot + heart garden ---- */
  {
    const { x: px, z: pz } = PICNIC;
    const blanket = box(2.6, 0.04, 2.6, mat(0xe2536a));
    blanket.position.set(px, 0.04, pz);
    blanket.receiveShadow = true;
    scene.add(blanket);
    for (let i = 0; i < 5; i++) {
      const stripe = box(2.6, 0.045, 0.18, mat(0xfdf6ec));
      stripe.position.set(px, 0.045, pz - 1.1 + i * 0.55);
      scene.add(stripe);
    }
    const basket = box(0.5, 0.32, 0.36, mat(0xa9743c));
    basket.position.set(px, 0.2, pz - 0.9);
    scene.add(basket);
    const bread = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 4, 8), mat(0xdfae6b));
    bread.rotation.z = Math.PI / 2;
    bread.position.set(px + 0.05, 0.42, pz - 0.9);
    scene.add(bread);
    for (const side of [-1, 1]) {
      interactables.push({
        x: px + side * 0.7, z: pz + 0.3, radius: 1.4,
        label: 'sit on the picnic blanket 🧺', type: 'seat',
        data: {
          x: px + side * 0.7, z: pz + 0.3, y: -0.42,
          ry: side < 0 ? Math.PI / 2 : -Math.PI / 2,
          exit: { x: px + side * 1.8, z: pz + 0.3 },
        },
      });
    }

    // heart-shaped flower garden
    for (let u = 0; u < Math.PI * 2; u += 0.33) {
      const hx = 16 * Math.pow(Math.sin(u), 3);
      const hz = 13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u);
      addFlower(scene, GARDEN.x + hx * 0.16, GARDEN.z - hz * 0.16, u % 0.66 < 0.33 ? 0xff4d79 : 0xff8fb3);
    }
  }

  /* ---- scatter: trees, wild flowers, rocks ---- */
  function spotIsClear(x, z) {
    if (x > H.minX - 4 && x < H.maxX + 4 && z > H.minZ - 5 && z < H.maxZ + 6) return false; // house + yard
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 3) return false;
    if (Math.abs(x) < 6 && z > -21 && z < 120) return false;                // path + road to the city
    if (Math.hypot(x - PICNIC.x, z - PICNIC.z) < 6) return false;
    if (x > -52 && x < -32 && z > 11 && z < 25) return false;               // picking garden
    if (Math.hypot(x - GARDEN.x, z - GARDEN.z) < 6) return false;
    if (Math.hypot(x, z) < 5) return false;                                 // spawn
    if (x > -82 && x < 82 && z > 26 && z < 118) return false;               // the city
    if (Math.hypot(x + 130, z + 110) < 18) return false;                    // secret grotto
    if (Math.hypot(x - 142, z + 62) < 14) return false;                     // lovers' lookout
    if (Math.hypot(x - 92, z - 128) < 16) return false;                     // secret rose garden
    return true;
  }

  const treeMats = {
    trunk: mat(0x6f4e37),
    leaf1: mat(0x2e8b57),
    leaf2: mat(0x3cb371),
    pine: mat(0x1e6e46),
  };
  let placed = 0, tries = 0;
  while (placed < 70 && tries < 900) {
    tries++;
    const x = (rng() * 2 - 1) * 165;
    const z = (rng() * 2 - 1) * 165;
    if (Math.hypot(x, z) > 175 || !spotIsClear(x, z)) continue;
    const g = new THREE.Group();
    if (rng() < 0.35) {
      // pine
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 8), treeMats.trunk);
      trunk.position.y = 0.8; trunk.castShadow = true;
      g.add(trunk);
      for (let l = 0; l < 3; l++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6 - l * 0.42, 1.5, 8), treeMats.pine);
        cone.position.y = 1.8 + l * 1.0;
        cone.castShadow = true;
        g.add(cone);
      }
    } else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.0, 8), treeMats.trunk);
      trunk.position.y = 1.0; trunk.castShadow = true;
      g.add(trunk);
      const blob = new THREE.Mesh(new THREE.SphereGeometry(1.5 + rng() * 0.6, 10, 8), rng() < 0.5 ? treeMats.leaf1 : treeMats.leaf2);
      blob.position.y = 2.9;
      blob.castShadow = true;
      g.add(blob);
    }
    const s = 0.8 + rng() * 0.7;
    g.scale.setScalar(s);
    g.position.set(x, 0, z);
    scene.add(g);
    colliders.push({ type: 'circle', x, z, r: 0.45 * s });
    mapFeatures.push({ type: 'circle', x, z, r: 2.2, color: '#2e6b3e' });
    placed++;
  }

  for (let i = 0; i < 70; i++) {
    const x = (rng() * 2 - 1) * 90;
    const z = (rng() * 2 - 1) * 90;
    if (!spotIsClear(x, z)) continue;
    addFlower(scene, x, z, [0xfff04d, 0xff8fb3, 0xc77dff, 0xffffff][Math.floor(rng() * 4)]);
  }
  for (let i = 0; i < 16; i++) {
    const x = (rng() * 2 - 1) * 120;
    const z = (rng() * 2 - 1) * 120;
    if (!spotIsClear(x, z)) continue;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + rng() * 0.7), mat(0x8d8d8d));
    rock.position.set(x, 0.25, z);
    rock.castShadow = true;
    scene.add(rock);
    colliders.push({ type: 'circle', x, z, r: 0.7 });
  }

  /* ---- fireflies (visible at night, near the pond and garden) ---- */
  let fireflies, fireflyMat;
  {
    const n = 40, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const nearPond = i % 2 === 0;
      const cx = nearPond ? POND.x : GARDEN.x, cz = nearPond ? POND.z : GARDEN.z - 3;
      const a = rng() * Math.PI * 2, r = 3 + rng() * 7;
      pos[i * 3] = cx + Math.cos(a) * r;
      pos[i * 3 + 1] = 0.5 + rng() * 1.6;
      pos[i * 3 + 2] = cz + Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fireflyMat = new THREE.PointsMaterial({
      color: 0xffee88, size: 0.16, transparent: true, opacity: 0, depthWrite: false,
    });
    fireflies = new THREE.Points(geo, fireflyMat);
    scene.add(fireflies);
  }

  let elapsed = 0;
  function update(night, dt) {
    elapsed += dt;
    fireflyMat.opacity = Math.max(0, (night - 0.5) / 0.5) * 0.95;
    fireflies.position.y = Math.sin(elapsed * 1.3) * 0.18;
  }

  return { update };
}
