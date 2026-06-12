/**
 * The couple's car — a little rose convertible parked by the house.
 * Two seats: first one in drives (WASD + Space brake), the other rides along.
 * The driver's client owns the physics and broadcasts car state; the partner's
 * client interpolates toward it.
 */
import * as THREE from 'three';
import { mat, box } from './helpers.js';
import { heightAt, WORLD_RADIUS } from './terrain.js';

const ACCEL = 9;
const MAX_FWD = 16;
const MAX_REV = 6;
const TURN = 1.7;
const DRAG = 0.55;
const BRAKE = 3.5;
const CAR_RADIUS = 1.6;
const CAR_BOUND = WORLD_RADIUS - 2;

export function createCoupleCar(ctx) {
  const { scene, colliders, interactables } = ctx;

  // parked beside the house, nose pointing at the open path south
  const state = { x: 9, z: -15, ry: 0.75, v: 0 };
  let netTarget = null;
  let steerVis = 0;

  /* ============ build (forward is +z, like the avatars) ============ */
  const group = new THREE.Group();
  group.name = 'couple-car';

  const body = box(2.1, 0.5, 4.3, mat(0xe2536a));
  body.position.y = 0.55;
  group.add(body);
  const hood = box(1.9, 0.2, 1.15, mat(0xd23f58));
  hood.position.set(0, 0.9, 1.45);
  group.add(hood);
  const trunk = box(1.9, 0.2, 1.0, mat(0xd23f58));
  trunk.position.set(0, 0.9, -1.55);
  group.add(trunk);
  for (const bz of [2.2, -2.2]) {
    const bumper = box(2.0, 0.22, 0.18, mat(0x9aa0a6));
    bumper.position.set(0, 0.45, bz);
    group.add(bumper);
  }
  // windshield
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.6, 0.06), new THREE.MeshStandardMaterial({
    color: 0xbcd8e8, transparent: true, opacity: 0.35, roughness: 0.1,
  }));
  shield.position.set(0, 1.25, 0.85);
  shield.rotation.x = -0.28;
  group.add(shield);
  // bucket seats
  for (const sx of [-0.5, 0.5]) {
    const cushion = box(0.78, 0.16, 0.72, mat(0x7a3344));
    cushion.position.set(sx, 0.7, 0.25);
    group.add(cushion);
    const backrest = box(0.78, 0.55, 0.16, mat(0x7a3344));
    backrest.position.set(sx, 1.0, -0.18);
    group.add(backrest);
  }
  // steering wheel
  const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 16), mat(0x2a2e38));
  wheelRing.position.set(-0.5, 1.05, 0.78);
  wheelRing.rotation.x = -0.6;
  group.add(wheelRing);
  // wheels — fronts sit in steer pivots
  const wheels = [], steerPivots = [];
  for (const [wx, wz, front] of [[-1.0, 1.35, true], [1.0, 1.35, true], [-1.0, -1.35, false], [1.0, -1.35, false]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12), mat(0x16161a));
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    if (front) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.34, wz);
      wheel.position.set(0, 0, 0);
      pivot.add(wheel);
      group.add(pivot);
      steerPivots.push(pivot);
    } else {
      wheel.position.set(wx, 0.34, wz);
      group.add(wheel);
    }
    wheels.push(wheel);
  }
  // lights
  const lightMats = [];
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0a0, emissiveIntensity: 0 }));
    head.position.set(side * 0.6, 0.7, 2.18);
    group.add(head);
    lightMats.push({ m: head.material, bright: 1.8 });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xb02030, emissive: 0xff2040, emissiveIntensity: 0 }));
    tail.position.set(side * 0.6, 0.7, -2.18);
    group.add(tail);
    lightMats.push({ m: tail.material, bright: 1.0 });
  }
  // tiny heart ornament on the hood
  const heartMat = new THREE.MeshStandardMaterial({ color: 0xff8fb3, roughness: 0.4 });
  const hCube = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.1), heartMat);
  hCube.rotation.z = Math.PI / 4;
  hCube.position.set(0, 1.05, 1.85);
  group.add(hCube);
  for (const side of [-1, 1]) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), heartMat);
    lobe.position.set(side * 0.05, 1.12, 1.85);
    group.add(lobe);
  }
  scene.add(group);

  /* ============ helpers ============ */
  const localToWorld = (lx, lz) => {
    const c = Math.cos(state.ry), s = Math.sin(state.ry);
    return { x: state.x + lx * c + lz * s, z: state.z - lx * s + lz * c };
  };

  function seatWorld(seat) {
    const p = localToWorld(seat === 'driver' ? -0.5 : 0.5, 0.25);
    return new THREE.Vector3(p.x, heightAt(p.x, p.z) + 0.42, p.z);
  }

  function exitWorld(seat) {
    return localToWorld(seat === 'driver' ? -1.9 : 1.9, 0.25);
  }

  function collide() {
    for (const c of colliders) {
      if (c.type === 'platform') continue; // tower slabs live above the car
      if (c.type === 'box') {
        if (state.x < c.minX - CAR_RADIUS || state.x > c.maxX + CAR_RADIUS ||
            state.z < c.minZ - CAR_RADIUS || state.z > c.maxZ + CAR_RADIUS) continue;
        const pushLeft = state.x - (c.minX - CAR_RADIUS);
        const pushRight = (c.maxX + CAR_RADIUS) - state.x;
        const pushBack = state.z - (c.minZ - CAR_RADIUS);
        const pushFront = (c.maxZ + CAR_RADIUS) - state.z;
        const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
        if (min === pushLeft) state.x = c.minX - CAR_RADIUS;
        else if (min === pushRight) state.x = c.maxX + CAR_RADIUS;
        else if (min === pushBack) state.z = c.minZ - CAR_RADIUS;
        else state.z = c.maxZ + CAR_RADIUS;
        state.v *= 0.4; // bump
      } else {
        const dx = state.x - c.x, dz = state.z - c.z;
        const dist = Math.hypot(dx, dz), minDist = c.r + CAR_RADIUS;
        if (dist < minDist && dist > 0.0001) {
          state.x = c.x + (dx / dist) * minDist;
          state.z = c.z + (dz / dist) * minDist;
          state.v *= 0.4;
        }
      }
    }
    const d = Math.hypot(state.x, state.z);
    if (d > CAR_BOUND) {
      state.x *= CAR_BOUND / d;
      state.z *= CAR_BOUND / d;
      state.v *= 0.3;
    }
  }

  /* ============ per-frame ============ */
  /** keys = driver input (we own physics) or null (follow the network / coast) */
  function update(dt, keys, night) {
    let steerInput = 0;
    if (keys) {
      const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      steerInput = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
      state.v += f * ACCEL * dt;
      state.v -= state.v * DRAG * dt;
      if (keys.Space) state.v -= state.v * BRAKE * dt;
      state.v = THREE.MathUtils.clamp(state.v, -MAX_REV, MAX_FWD);
      if (Math.abs(state.v) < 0.03 && !f) state.v = 0;
      if (Math.abs(state.v) > 0.3) {
        state.ry += steerInput * TURN * Math.min(1, Math.abs(state.v) / 5) * Math.sign(state.v) * dt;
      }
      state.x += Math.sin(state.ry) * state.v * dt;
      state.z += Math.cos(state.ry) * state.v * dt;
      collide();
    } else if (netTarget) {
      // dead reckoning: keep the target rolling at its reported speed and
      // heading so the car moves smoothly between network updates, then
      // apply only a small correction toward it
      netTarget.x += Math.sin(netTarget.ry) * netTarget.v * dt;
      netTarget.z += Math.cos(netTarget.ry) * netTarget.v * dt;
      const err = Math.hypot(netTarget.x - state.x, netTarget.z - state.z);
      if (err > 8) {
        // way off (tab was asleep, packet burst) — just snap
        state.x = netTarget.x;
        state.z = netTarget.z;
        state.ry = netTarget.ry;
      } else {
        const k = 1 - Math.exp(-14 * dt);
        state.x += (netTarget.x - state.x) * k;
        state.z += (netTarget.z - state.z) * k;
        let dr = ((netTarget.ry - state.ry + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        state.ry += dr * k;
      }
      state.v = netTarget.v;
    } else {
      state.v *= Math.max(0, 1 - dt * 2);
    }

    group.position.set(state.x, heightAt(state.x, state.z), state.z);
    group.rotation.y = state.ry;
    // lean with the terrain (sample the slope under nose/tail and both sides)
    const tc = Math.cos(state.ry), ts = Math.sin(state.ry);
    const hF = heightAt(state.x + ts * 1.7, state.z + tc * 1.7);
    const hB = heightAt(state.x - ts * 1.7, state.z - tc * 1.7);
    const hL = heightAt(state.x + tc, state.z - ts);
    const hR = heightAt(state.x - tc, state.z + ts);
    const tiltK = Math.min(1, dt * 6);
    group.rotation.x += (Math.atan2(hB - hF, 3.4) - group.rotation.x) * tiltK;
    group.rotation.z += (Math.atan2(hL - hR, 2.0) - group.rotation.z) * tiltK;
    for (const w of wheels) w.rotation.x += (state.v / 0.34) * dt;
    steerVis += ((keys ? steerInput * 0.42 : 0) - steerVis) * Math.min(1, dt * 8);
    for (const p of steerPivots) p.rotation.y = steerVis;

    const lampOn = Math.max(0, (night - 0.15) / 0.85);
    for (const { m, bright } of lightMats) m.emissiveIntensity = lampOn * bright;
  }

  function setNetState(s) {
    if (!s) return;
    netTarget = {
      x: +s.x || 0, z: +s.z || 0,
      ry: +s.ry || 0, v: +s.v || 0,
    };
  }

  /** hard snap (used when joining a world where the car already moved) */
  function snapTo(s) {
    if (!s) return;
    state.x = +s.x || state.x;
    state.z = +s.z || state.z;
    state.ry = +s.ry || state.ry;
    state.v = 0;
    setNetState(s);
    group.position.set(state.x, heightAt(state.x, state.z), state.z);
    group.rotation.y = state.ry;
  }

  interactables.push({
    getPos: () => ({ x: state.x, z: state.z }),
    x: state.x, z: state.z, radius: 3.0,
    label: 'hop into the car 🚗', type: 'car',
  });

  return { state, group, update, seatWorld, exitWorld, setNetState, snapTo };
}
