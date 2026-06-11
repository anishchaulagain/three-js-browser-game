/**
 * Secret places — tucked into the far corners of the world, deliberately
 * NOT drawn on the minimap. Finding them together is the point. 💞
 *
 *   1. Hidden grotto (NW forest): glowing crystals around a tiny pool
 *   2. Lovers' lookout (E edge): wooden deck, telescope, string lights
 *   3. Secret rose garden (SE, past the city): hedge walls hide a swing bench
 */
import * as THREE from 'three';
import { mat, box, addFlower } from './helpers.js';

export function buildSecrets(ctx) {
  const { scene, rng, colliders, interactables, addBoxCollider } = ctx;
  const glowMats = [];

  /* ============ 1. hidden grotto at (-130, -110) ============ */
  {
    const gx = -130, gz = -110;
    // dense ring of pines with a narrow entrance facing east
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (a < 0.5 || a > Math.PI * 2 - 0.5) continue; // entrance gap at +x
      const tx = gx + Math.cos(a) * 11, tz = gz + Math.sin(a) * 11;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2, 8), mat(0x4a3526));
      trunk.position.y = 1;
      tree.add(trunk);
      for (let l = 0; l < 3; l++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2 - l * 0.55, 2.0, 8), mat(0x14422e));
        cone.position.y = 2.4 + l * 1.4;
        cone.castShadow = true;
        tree.add(cone);
      }
      tree.position.set(tx, 0, tz);
      tree.scale.setScalar(1.2 + rng() * 0.3);
      scene.add(tree);
      colliders.push({ type: 'circle', x: tx, z: tz, r: 0.7 });
    }
    // tiny pool
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20),
      new THREE.MeshStandardMaterial({ color: 0x3fd4c7, transparent: true, opacity: 0.8, roughness: 0.1 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(gx - 2, 0.05, gz);
    scene.add(pool);
    // glowing crystals
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2, r = 4 + rng() * 4;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.4 + rng() * 0.5),
        new THREE.MeshStandardMaterial({ color: 0x7fffd4, emissive: 0x4fe8c4, emissiveIntensity: 0.6, roughness: 0.2 }));
      crystal.position.set(gx + Math.cos(a) * r, 0.45, gz + Math.sin(a) * r);
      crystal.rotation.set(rng(), rng(), rng());
      crystal.castShadow = true;
      scene.add(crystal);
      glowMats.push(crystal.material);
    }
    const glow = new THREE.PointLight(0x4fe8c4, 6, 16, 1.8);
    glow.position.set(gx - 2, 1.5, gz);
    scene.add(glow);
    // bench for two
    const seat = box(1.8, 0.12, 0.55, mat(0x6b4a2b));
    seat.position.set(gx + 4, 0.45, gz + 2);
    scene.add(seat);
    addBoxCollider(gx + 4, gz + 2, 1.0, 0.7);
    interactables.push({
      x: gx + 4, z: gz + 2.8, radius: 1.5,
      label: 'sit in the secret grotto ✨', type: 'seat',
      data: { x: gx + 4, z: gz + 2, y: -0.24, ry: Math.PI, exit: { x: gx + 4, z: gz + 3.4 } },
    });
    interactables.push({
      x: gx - 2, z: gz + 3.8, radius: 2.0,
      label: 'make a secret wish ✨', type: 'moment',
      data: { emoji: '✨', toast: 'You found the hidden grotto… your wish is safe here ✨' },
    });
  }

  /* ============ 2. lovers' lookout at (142, -62) ============ */
  {
    const lx = 142, lz = -62;
    const deck = box(7, 0.35, 6, mat(0x9c6644));
    deck.position.set(lx, 0.17, lz);
    scene.add(deck);
    // railing on the outward side
    for (let i = 0; i < 5; i++) {
      const post = box(0.12, 1, 0.12, mat(0x7a4a2b));
      post.position.set(lx + 3.3, 0.85, lz - 2.6 + i * 1.3);
      scene.add(post);
    }
    const rail = box(0.1, 0.1, 5.6, mat(0x7a4a2b));
    rail.position.set(lx + 3.3, 1.35, lz);
    scene.add(rail);
    // string lights between two posts
    for (const pz of [-3, 3]) {
      const pole = box(0.14, 2.8, 0.14, mat(0x5e4a36));
      pole.position.set(lx, 1.4, lz + pz);
      scene.add(pole);
    }
    for (let i = 0; i < 7; i++) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd980, emissiveIntensity: 0.4 }));
      const t = i / 6;
      bulb.position.set(lx, 2.7 - Math.sin(t * Math.PI) * 0.45, lz - 3 + t * 6);
      scene.add(bulb);
      glowMats.push(bulb.material);
    }
    // bench facing out over the world edge + telescope
    const seat = box(2.0, 0.12, 0.6, mat(0x8a5a36));
    seat.position.set(lx + 1.2, 0.62, lz);
    scene.add(seat);
    for (const side of [-0.5, 0.5]) {
      interactables.push({
        x: lx + 1.2, z: lz + side, radius: 1.4,
        label: "sit at the lovers' lookout 🌄", type: 'seat',
        data: { x: lx + 1.2, z: lz + side, y: -0.08, ry: Math.PI / 2, exit: { x: lx - 0.5, z: lz + side } },
      });
    }
    const scopeLeg = box(0.1, 1.1, 0.1, mat(0x3a3a42));
    scopeLeg.position.set(lx + 2.6, 0.9, lz - 2);
    scene.add(scopeLeg);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 10), mat(0xc9a227));
    scope.rotation.z = Math.PI / 2 - 0.4;
    scope.position.set(lx + 2.9, 1.55, lz - 2);
    scene.add(scope);
    interactables.push({
      x: lx + 2.6, z: lz - 2, radius: 1.5,
      label: 'look through the telescope 🔭', type: 'moment',
      data: { emoji: '🔭', toast: 'From up here the whole world is yours 🌄' },
    });
    // a few guide stones from the meadow
    for (let i = 0; i < 6; i++) {
      const stone = box(0.9, 0.05, 0.7, mat(0xc2b8a3));
      stone.position.set(118 + i * 4, 0.03, -50 - i * 2);
      scene.add(stone);
    }
  }

  /* ============ 3. secret rose garden at (92, 128) ============ */
  {
    const sx = 92, sz = 128;
    const hedgeMat = mat(0x2e6b3e);
    // hedge square with an entrance gap on the north (city) side
    const segs = [
      { x: sx, z: sz + 9, w: 18, d: 1.2 },                  // south wall
      { x: sx - 9, z: sz, w: 1.2, d: 18 },                  // west wall
      { x: sx + 9, z: sz, w: 1.2, d: 18 },                  // east wall
      { x: sx - 5.5, z: sz - 9, w: 7, d: 1.2 },             // north wall (left of gap)
      { x: sx + 5.5, z: sz - 9, w: 7, d: 1.2 },             // north wall (right of gap)
    ];
    for (const s of segs) {
      const hedge = box(s.w, 2.3, s.d, hedgeMat);
      hedge.position.set(s.x, 1.15, s.z);
      scene.add(hedge);
      ctx.cameraBlockers.push(hedge);
      addBoxCollider(s.x, s.z, s.w, s.d);
    }
    // heart of roses in the middle
    for (let u = 0; u < Math.PI * 2; u += 0.45) {
      const hx = 16 * Math.pow(Math.sin(u), 3);
      const hz = 13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u);
      addFlower(scene, sx + hx * 0.12, sz - hz * 0.12 + 1, 0xd90429);
    }
    // swing bench under an arch
    const archMat = mat(0xf5f0e6);
    for (const side of [-1, 1]) {
      const post = box(0.18, 2.6, 0.18, archMat);
      post.position.set(sx + side * 1.4, 1.3, sz - 5);
      scene.add(post);
    }
    const beam = box(3.2, 0.18, 0.18, archMat);
    beam.position.set(sx, 2.6, sz - 5);
    scene.add(beam);
    for (const side of [-1, 1]) {
      const rope = box(0.05, 1.3, 0.05, mat(0xc2b8a3));
      rope.position.set(sx + side * 0.9, 1.85, sz - 5);
      scene.add(rope);
    }
    const swingSeat = box(2.2, 0.1, 0.6, mat(0x8a5a36));
    swingSeat.position.set(sx, 1.15, sz - 5);
    scene.add(swingSeat);
    addBoxCollider(sx, sz - 5, 2.4, 0.8);
    for (const side of [-0.55, 0.55]) {
      interactables.push({
        x: sx + side, z: sz - 4.4, radius: 1.4,
        label: 'sit on the swing 🌹', type: 'seat',
        data: { x: sx + side, z: sz - 5, y: 0.45, ry: Math.PI, exit: { x: sx + side, z: sz - 3.6 } },
      });
    }
    interactables.push({
      x: sx, z: sz + 1, radius: 2.2,
      label: 'smell the roses 🌹', type: 'moment',
      data: { emoji: '🌹', toast: 'A secret rose garden… just for you two 🌹' },
    });
  }

  function update(night) {
    // crystals and string lights shine brighter after dark
    const boost = 0.4 + night * 0.9;
    for (const m of glowMats) m.emissiveIntensity = boost;
  }

  return { update };
}
