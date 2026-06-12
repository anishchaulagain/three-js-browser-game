/**
 * Landmark destinations in the expansion ring, all reachable by stone trails:
 *
 *   🌳 Sunset Park — gazebo, benches, flower beds, swings & seesaw
 *   🌊 Crystal Lake — beach, stone jetty, rowboat, reeds and lilies
 *   🌷 Windmill hill — turning windmill above a tulip ring
 *   🦆 Two ponds — ducks paddle the bigger one
 *   🏔️ Whisper Peak — a heart flag where the mountain trail tops out
 *
 * Everything sits on the analytic terrain (heightAt), so it lines up with the
 * streamed ground chunks without any raycasting.
 */
import * as THREE from 'three';
import { mat, box, addFlower } from './helpers.js';
import {
  heightAt, TRAILS, PARK, LAKE, JETTY, WINDMILL, PONDS, SUMMIT, MOUNTAINS,
} from './terrain.js';

const waterMat = (opacity = 0.78) => new THREE.MeshStandardMaterial({
  color: 0x4aa3df, transparent: true, opacity, roughness: 0.15, metalness: 0.1,
});

export function buildLandmarks(ctx) {
  const { scene, rng, colliders, interactables, addBoxCollider, mapFeatures } = ctx;
  const glowMats = [];

  /* small builders shared by the landmarks */
  function bench(x, z, ry, groundY = 0) {
    const g = new THREE.Group();
    const seat = box(1.9, 0.1, 0.55, mat(0x8a5a36));
    seat.position.y = 0.5;
    const back = box(1.9, 0.6, 0.1, mat(0x8a5a36));
    back.position.set(0, 0.9, -0.26);
    g.add(seat, back);
    for (const side of [-1, 1]) {
      const leg = box(0.12, 0.5, 0.4, mat(0x5e5e5e));
      leg.position.set(side * 0.8, 0.25, 0);
      g.add(leg);
    }
    g.position.set(x, groundY, z);
    g.rotation.y = ry;
    scene.add(g);
    addBoxCollider(x, z, 1.0, 1.0);
    for (const side of [-0.5, 0.5]) {
      const sx = x + Math.cos(ry) * side, sz = z - Math.sin(ry) * side;
      interactables.push({
        x: sx, z: sz, radius: 1.3,
        label: 'sit together 💑', type: 'seat',
        data: {
          x: sx, z: sz, y: groundY - 0.21, ry,
          exit: { x: x + Math.sin(ry) * 1.2, z: z + Math.cos(ry) * 1.2 },
        },
      });
    }
  }

  function lampPost(x, z, groundY = 0) {
    const pole = box(0.14, 3.4, 0.14, mat(0x3a3a42));
    pole.position.set(x, groundY + 1.7, z);
    scene.add(pole);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 0 }));
    globe.position.set(x, groundY + 3.5, z);
    scene.add(globe);
    glowMats.push(globe.material);
  }

  function roundTree(x, z, s = 1) {
    const y = heightAt(x, z);
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.0, 8), mat(0x6f4e37));
    trunk.position.y = 1;
    trunk.castShadow = true;
    g.add(trunk);
    const blob = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), mat(0x2e8b57));
    blob.position.y = 3;
    blob.castShadow = true;
    g.add(blob);
    g.scale.setScalar(s);
    g.position.set(x, y, z);
    scene.add(g);
    colliders.push({ type: 'circle', x, z, r: 0.45 * s });
  }

  function reed(x, z) {
    const y = heightAt(x, z);
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 1.1 + rng() * 0.5, 4), mat(0x3f7d3f));
      blade.position.set(x + (rng() - 0.5) * 0.5, y + 0.55, z + (rng() - 0.5) * 0.5);
      scene.add(blade);
    }
  }

  function lilyPads(cx, cz, ringR, count, waterY) {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, r = ringR * (0.75 + rng() * 0.22);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.32 + rng() * 0.22, 8), mat(0x3a8a4d));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(cx + Math.cos(a) * r, waterY + 0.015, cz + Math.sin(a) * r);
      scene.add(pad);
    }
  }

  /* ============ stone trails (one InstancedMesh for every plate) ============ */
  {
    const steps = [];
    for (const trail of TRAILS) {
      for (let i = 0; i < trail.length - 1; i++) {
        const a = trail[i], b = trail[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const ry = Math.atan2(b.x - a.x, b.z - a.z);
        for (let d = 0; d <= len; d += 2.2) {
          const t = d / len;
          const x = a.x + (b.x - a.x) * t + (rng() - 0.5) * 0.4;
          const z = a.z + (b.z - a.z) * t + (rng() - 0.5) * 0.4;
          steps.push({ x, y: heightAt(x, z) + 0.04, z, ry: ry + (rng() - 0.5) * 0.3 });
        }
      }
    }
    const geo = new THREE.BoxGeometry(1.4, 0.07, 1.1);
    const mesh = new THREE.InstancedMesh(geo, mat(0xc2b8a3), steps.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    steps.forEach((st, i) => {
      e.set(0, st.ry, 0);
      q.setFromEuler(e);
      p.set(st.x, st.y, st.z);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
    });
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  /* ============ 🌳 Sunset Park ============ */
  {
    const { x: px, z: pz } = PARK;
    // lawn + walking ring
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(42, 40), mat(0x5cab60));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(px, 0.02, pz);
    lawn.receiveShadow = true;
    scene.add(lawn);
    const ring = new THREE.Mesh(new THREE.RingGeometry(28, 31, 48), mat(0xc2b8a3));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(px, 0.04, pz);
    scene.add(ring);
    // entrance walk from the promenade to the gazebo
    const walk = box(34, 0.05, 3.2, mat(0xc2b8a3));
    walk.position.set(px - 26, 0.03, pz);
    scene.add(walk);
    mapFeatures.push({ type: 'circle', x: px, z: pz, r: 42, color: '#3f8d4a' });
    mapFeatures.push({ type: 'emoji', x: px, z: pz, text: '🌳', size: 12 });

    // gazebo — paved floor, six posts, pointed roof, two benches inside
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.1, 8), mat(0xbfb39e));
    floor.position.set(px, 0.05, pz);
    floor.receiveShadow = true;
    scene.add(floor);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const post = box(0.22, 3.1, 0.22, mat(0xf5f0e6));
      post.position.set(px + Math.cos(a) * 3.7, 1.55, pz + Math.sin(a) * 3.7);
      scene.add(post);
      colliders.push({ type: 'circle', x: post.position.x, z: post.position.z, r: 0.25 });
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.2, 8), mat(0x8fa3b8));
    roof.position.set(px, 4.2, pz);
    roof.castShadow = true;
    scene.add(roof);
    // string of warm lights under the eave
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd980, emissiveIntensity: 0.3 }));
      bulb.position.set(px + Math.cos(a) * 3.6, 3.0, pz + Math.sin(a) * 3.6);
      scene.add(bulb);
      glowMats.push(bulb.material);
    }
    bench(px - 1.6, pz, Math.PI / 2);
    bench(px + 1.6, pz, -Math.PI / 2);
    interactables.push({
      x: px, z: pz + 3.2, radius: 1.8,
      label: 'dance in the gazebo 💃', type: 'moment',
      data: { emoji: '💃', toast: 'A slow dance in Sunset Park 💃🕺💕' },
    });

    // benches + lamps around the walking ring
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const bx = px + Math.cos(a) * 29.5, bz = pz + Math.sin(a) * 29.5;
      bench(bx, bz, Math.atan2(px - bx, pz - bz));
      const la = (i / 4) * Math.PI * 2;
      lampPost(px + Math.cos(la) * 29.5, pz + Math.sin(la) * 29.5);
    }

    // four flower beds between gazebo and ring
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const bx = px + Math.cos(a) * 14, bz = pz + Math.sin(a) * 14;
      const bed = new THREE.Mesh(new THREE.CircleGeometry(3.4, 16), mat(0x4a6b43));
      bed.rotation.x = -Math.PI / 2;
      bed.position.set(bx, 0.035, bz);
      scene.add(bed);
      for (let f = 0; f < 10; f++) {
        const fa = rng() * Math.PI * 2, fr = rng() * 2.6;
        addFlower(scene, bx + Math.cos(fa) * fr, bz + Math.sin(fa) * fr,
          [0xff4d79, 0xfff04d, 0xc77dff, 0xff8fb3, 0xffffff][f % 5]);
      }
    }

    // playground corner: two swings + a seesaw
    {
      const sx = px + 22, sz = pz + 16;
      const frameMat = mat(0xc94f6d);
      for (const side of [-1.9, 1.9]) {
        const legA = box(0.14, 2.9, 0.14, frameMat);
        legA.position.set(sx + side, 1.45, sz - 0.6);
        legA.rotation.x = 0.22;
        scene.add(legA);
        const legB = box(0.14, 2.9, 0.14, frameMat);
        legB.position.set(sx + side, 1.45, sz + 0.6);
        legB.rotation.x = -0.22;
        scene.add(legB);
      }
      const beam = box(4.4, 0.14, 0.14, frameMat);
      beam.position.set(sx, 2.8, sz);
      scene.add(beam);
      addBoxCollider(sx, sz, 4.4, 1.4);
      for (const side of [-1, 1]) {
        for (const rs of [-0.35, 0.35]) {
          const rope = box(0.04, 1.9, 0.04, mat(0xc2b8a3));
          rope.position.set(sx + side + rs, 1.85, sz);
          scene.add(rope);
        }
        const seat = box(0.85, 0.07, 0.4, mat(0x8a5a36));
        seat.position.set(sx + side, 0.85, sz);
        scene.add(seat);
        interactables.push({
          x: sx + side, z: sz + 0.9, radius: 1.3,
          label: 'swing together 🛝', type: 'seat',
          data: { x: sx + side, z: sz, y: 0.18, ry: Math.PI, exit: { x: sx + side, z: sz + 1.4 } },
        });
      }
      // seesaw
      const pivot = box(0.5, 0.5, 0.3, mat(0x5e5e5e));
      pivot.position.set(sx + 6, 0.25, sz + 1);
      scene.add(pivot);
      const plank = box(4.2, 0.12, 0.5, mat(0xf0c84f));
      plank.position.set(sx + 6, 0.55, sz + 1);
      plank.rotation.z = 0.16;
      scene.add(plank);
      addBoxCollider(sx + 6, sz + 1, 4.2, 0.7);
    }

    // shade trees just outside the walking ring
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      roundTree(px + Math.cos(a) * 38, pz + Math.sin(a) * 38, 0.9 + rng() * 0.5);
    }
  }

  /* ============ 🌊 Crystal Lake ============ */
  let lakeBoat;
  {
    const { x: lx, z: lz, r } = LAKE;
    const water = new THREE.Mesh(new THREE.CircleGeometry(r, 48), waterMat());
    water.rotation.x = -Math.PI / 2;
    water.position.set(lx, -0.28, lz);
    scene.add(water);
    mapFeatures.push({ type: 'circle', x: lx, z: lz, r, color: '#4aa3df' });
    mapFeatures.push({ type: 'emoji', x: lx, z: lz, text: '🌊', size: 12 });

    // stone jetty: plank deck on the raised causeway pad
    const deckY = heightAt(JETTY.x, JETTY.z);
    for (let i = 0; i < 7; i++) {
      const plank = box(1.9, 0.08, 1.05, mat(0x9c6644));
      plank.position.set(JETTY.x - 6.3 + i * 1.12 + 3, deckY + 0.1, JETTY.z + (i - 3) * 0.02);
      plank.rotation.y = Math.PI / 2 + (rng() - 0.5) * 0.04;
      plank.receiveShadow = true;
      scene.add(plank);
    }
    for (const side of [-1, 1]) {                       // low rail posts
      for (let i = 0; i < 4; i++) {
        const post = box(0.1, 0.7, 0.1, mat(0x7a4a2b));
        post.position.set(JETTY.x - 3 + i * 2.2, deckY + 0.45, JETTY.z + side * 0.95);
        scene.add(post);
      }
    }
    bench(JETTY.x - 4.6, JETTY.z, -Math.PI / 2, deckY); // bench at the end, facing open water
    interactables.push({
      x: JETTY.x - 6.2, z: JETTY.z, radius: 1.8,
      label: 'skip stones across the lake 🪨', type: 'moment',
      data: { emoji: '🪨', toast: 'Four skips! The lake keeps your secrets 🌊💙' },
    });

    // rowboat swaying near the jetty
    const boat = new THREE.Group();
    const hull = box(1.4, 0.5, 3.2, mat(0x9c6644));
    hull.position.y = 0.1;
    boat.add(hull);
    const rim = box(1.6, 0.12, 3.4, mat(0x7a4a2b));
    rim.position.y = 0.38;
    boat.add(rim);
    boat.position.set(lx + 24, -0.18, lz - 10);
    boat.rotation.y = 0.7;
    scene.add(boat);

    // reeds + lilies around the shore
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2;
      reed(lx + Math.cos(a) * (r + 2.5 + rng() * 4), lz + Math.sin(a) * (r + 2.5 + rng() * 4));
    }
    lilyPads(lx, lz, r, 10, -0.28);
    lakeBoat = boat; // animated below
  }

  /* ============ 🌷 windmill hill ============ */
  let windmillHub;
  {
    const { x: wx, z: wz, h: wy } = WINDMILL;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.6, 10, 10), mat(0xf5f0e6));
    tower.position.set(wx, wy + 5, wz);
    tower.castShadow = true;
    scene.add(tower);
    ctx.cameraBlockers.push(tower);
    colliders.push({ type: 'circle', x: wx, z: wz, r: 2.8 });
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.4, 10), mat(0x8c4a3a));
    cap.position.set(wx, wy + 11.2, wz);
    scene.add(cap);
    const door = box(1.1, 1.8, 0.15, mat(0x4a3526));
    const face = Math.atan2(-wx, -wz);                 // door looks back toward the world
    door.position.set(wx + Math.sin(face) * 2.5, wy + 0.9, wz + Math.cos(face) * 2.5);
    door.rotation.y = face;
    scene.add(door);

    // blades on a hub that spins in update()
    windmillHub = new THREE.Group();
    windmillHub.position.set(wx + Math.sin(face) * 2.2, wy + 9.4, wz + Math.cos(face) * 2.2);
    windmillHub.rotation.y = face;
    for (let i = 0; i < 4; i++) {
      const blade = box(0.6, 4.6, 0.1, mat(0xd9825f));
      blade.position.y = 2.6;
      const arm = new THREE.Group();
      arm.add(blade);
      arm.rotation.z = (i / 4) * Math.PI * 2;
      windmillHub.add(arm);
    }
    scene.add(windmillHub);

    // tulip ring + a bench with the long view
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const fx = wx + Math.cos(a) * (6 + (i % 2) * 2.4), fz = wz + Math.sin(a) * (6 + (i % 2) * 2.4);
      addFlower(scene, fx, fz, [0xff4d79, 0xfff04d, 0xff8fb3][i % 3], heightAt(fx, fz));
    }
    bench(wx + Math.sin(face) * 7, wz + Math.cos(face) * 7, face + Math.PI, wy);
    interactables.push({
      x: wx + Math.sin(face) * 4, z: wz + Math.cos(face) * 4, radius: 2.2,
      label: 'watch the windmill turn 🌷', type: 'moment',
      data: { emoji: '🌷', toast: 'The windmill turns, the world is quiet, you two are here 🌷' },
    });
    mapFeatures.push({ type: 'emoji', x: wx, z: wz, text: '🌷', size: 12 });
  }

  /* ============ 🦆 the two ponds ============ */
  const ducks = [];
  PONDS.forEach((pond, pi) => {
    const water = new THREE.Mesh(new THREE.CircleGeometry(pond.r, 28), waterMat(0.75));
    water.rotation.x = -Math.PI / 2;
    water.position.set(pond.x, -0.25, pond.z);
    scene.add(water);
    mapFeatures.push({ type: 'circle', x: pond.x, z: pond.z, r: pond.r, color: '#4aa3df' });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng();
      const rx = pond.x + Math.cos(a) * (pond.r + 2 + rng() * 2);
      const rz = pond.z + Math.sin(a) * (pond.r + 2 + rng() * 2);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rng() * 0.35), mat(0x8d8d8d));
      rock.position.set(rx, heightAt(rx, rz) + 0.2, rz);
      scene.add(rock);
    }
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      reed(pond.x + Math.cos(a) * (pond.r + 1.5), pond.z + Math.sin(a) * (pond.r + 1.5));
    }
    lilyPads(pond.x, pond.z, pond.r, 5, -0.25);

    if (pi === 0) {
      // a duck couple paddles slow circles
      for (const phase of [0, Math.PI]) {
        const duck = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), mat(0xfdf6ec));
        body.scale.set(1, 0.75, 1.25);
        duck.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat(0xfdf6ec));
        head.position.set(0, 0.32, 0.32);
        duck.add(head);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 6), mat(0xf2a23c));
        beak.rotation.x = Math.PI / 2;
        beak.position.set(0, 0.3, 0.52);
        duck.add(beak);
        scene.add(duck);
        ducks.push({ g: duck, cx: pond.x, cz: pond.z, phase, r: pond.r * 0.45 });
      }
      interactables.push({
        x: pond.x, z: pond.z + pond.r + 2, radius: 2.2,
        label: 'watch the ducks 🦆', type: 'moment',
        data: { emoji: '🦆', toast: 'Even the ducks here swim in pairs 🦆🦆💕' },
      });
    }
  });

  /* ============ 🏔️ Whisper Peak summit ============ */
  {
    const sy = heightAt(SUMMIT.x, SUMMIT.z);
    const pole = box(0.12, 2.8, 0.12, mat(0x5e4a36));
    pole.position.set(SUMMIT.x, sy + 1.4, SUMMIT.z);
    scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.85),
      new THREE.MeshStandardMaterial({ color: 0xff5c8a, side: THREE.DoubleSide, roughness: 0.6 }));
    flag.position.set(SUMMIT.x + 0.7, sy + 2.4, SUMMIT.z);
    scene.add(flag);
    for (let i = 0; i < 5; i++) {                        // cairn
      const a = (i / 5) * Math.PI * 2;
      const cx = SUMMIT.x + Math.cos(a) * 1.4, cz = SUMMIT.z + Math.sin(a) * 1.4;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rng() * 0.25), mat(0x8e8b90));
      stone.position.set(cx, heightAt(cx, cz) + 0.2, cz);
      scene.add(stone);
    }
    interactables.push({
      x: SUMMIT.x, z: SUMMIT.z, radius: 5,
      label: 'plant your hearts on Whisper Peak 🏔️', type: 'moment',
      data: { emoji: '🏔️', toast: 'Top of the world — and it belongs to you two 🏔️💕' },
    });
    for (const m of MOUNTAINS) {
      mapFeatures.push({ type: 'circle', x: m.x, z: m.z, r: m.s * 1.1, color: '#7c8089' });
    }
    mapFeatures.push({ type: 'emoji', x: SUMMIT.x, z: SUMMIT.z, text: '🏔️', size: 13 });
  }

  /* ============ per-frame ============ */
  let elapsed = 0;
  function update(dt, night) {
    elapsed += dt;
    windmillHub.rotation.z += dt * 0.55;
    lakeBoat.rotation.z = Math.sin(elapsed * 0.9) * 0.04;
    lakeBoat.position.y = -0.18 + Math.sin(elapsed * 1.2) * 0.03;
    for (const d of ducks) {
      const a = elapsed * 0.22 + d.phase;
      d.g.position.set(d.cx + Math.cos(a) * d.r, -0.18 + Math.sin(elapsed * 2 + d.phase) * 0.03, d.cz + Math.sin(a) * d.r);
      d.g.rotation.y = -a;                                // face along the swim circle
    }
    const lampOn = Math.max(0, (night - 0.2) / 0.8);
    for (const m of glowMats) m.emissiveIntensity = 0.25 + lampOn * 1.2;
  }

  return { update };
}
