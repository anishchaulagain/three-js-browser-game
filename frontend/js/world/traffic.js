/**
 * Mock traffic: blocky cars endlessly looping the city ring road.
 * Purely decorative — no collisions with players.
 */
import * as THREE from 'three';
import { mat, box } from './helpers.js';
import { CITY } from './city.js';

const CAR_COLORS = [0xe05c5c, 0x5c9de0, 0xf0c84f, 0x7fc97f, 0xc77dff, 0xf2f2f2];

function buildCar(color) {
  const g = new THREE.Group();
  const body = box(1.7, 0.5, 3.4, mat(color));
  body.position.y = 0.62;
  g.add(body);
  const cabin = box(1.5, 0.5, 1.7, mat(0x2a2e38));
  cabin.position.set(0, 1.05, -0.25);
  g.add(cabin);
  const wheels = [];
  for (const [wx, wz] of [[-0.85, 1.1], [0.85, 1.1], [-0.85, -1.1], [0.85, -1.1]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12), mat(0x16161a));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.32, wz);
    g.add(wheel);
    wheels.push(wheel);
  }
  const lightMats = [];
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0a0, emissiveIntensity: 0 }));
    head.position.set(side * 0.5, 0.68, 1.74);
    g.add(head);
    lightMats.push(head.material);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xb02030, emissive: 0xff2040, emissiveIntensity: 0 }));
    tail.position.set(side * 0.5, 0.68, -1.74);
    g.add(tail);
    lightMats.push(tail.material);
  }
  return { g, wheels, lightMats };
}

export function createTraffic(scene) {
  const { ring } = CITY;
  const lane = 1.6;
  // clockwise cars drive the inner lane, counter-clockwise the outer lane
  const cwLoop = [
    [ring.minX + lane, ring.minZ + lane], [ring.maxX - lane, ring.minZ + lane],
    [ring.maxX - lane, ring.maxZ - lane], [ring.minX + lane, ring.maxZ - lane],
  ];
  const ccwLoop = [
    [ring.minX - lane, ring.minZ - lane], [ring.minX - lane, ring.maxZ + lane],
    [ring.maxX + lane, ring.maxZ + lane], [ring.maxX + lane, ring.minZ - lane],
  ];

  const cars = [];
  for (let i = 0; i < 6; i++) {
    const cw = i % 2 === 0;
    const wps = cw ? cwLoop : ccwLoop;
    const startCorner = Math.floor(i / 2) % 4;
    const { g, wheels, lightMats } = buildCar(CAR_COLORS[i % CAR_COLORS.length]);
    g.name = `car-${i}`;
    g.position.set(wps[startCorner][0], 0, wps[startCorner][1]);
    scene.add(g);
    cars.push({
      g, wheels, lightMats, wps,
      idx: (startCorner + 1) % 4,
      speed: cw ? 7.5 : 6.2,
    });
  }

  function update(dt, night) {
    const lampOn = Math.max(0, (night - 0.15) / 0.85);
    for (const car of cars) {
      const [tx, tz] = car.wps[car.idx];
      const dx = tx - car.g.position.x;
      const dz = tz - car.g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6) {
        car.idx = (car.idx + 1) % car.wps.length;
        continue;
      }
      car.g.position.x += (dx / dist) * car.speed * dt;
      car.g.position.z += (dz / dist) * car.speed * dt;
      // face travel direction (car forward is +z), turn smoothly at corners
      const targetRy = Math.atan2(dx, dz);
      let dRy = ((targetRy - car.g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      car.g.rotation.y += dRy * Math.min(1, dt * 8);
      // spin the wheels
      for (const w of car.wheels) w.rotation.x += (car.speed / 0.32) * dt;
      // head/tail lights at night
      for (let m = 0; m < car.lightMats.length; m++) {
        car.lightMats[m].emissiveIntensity = lampOn * (m % 2 === 0 ? 1.6 : 1.0);
      }
    }
  }

  return { update };
}
