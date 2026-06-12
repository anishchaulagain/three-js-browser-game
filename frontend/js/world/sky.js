/** Day/night cycle: sun, moon, sky colors, fog, stars and drifting clouds. */
import * as THREE from 'three';
import { mat } from './helpers.js';

/* sky color keyframes over the day (t: 0 = 6AM sunrise, 0.5 = 6PM sunset) */
const SKY_STOPS = [
  [0.00, 0xff9e7d], [0.05, 0xaee2ff], [0.25, 0x87cefa], [0.42, 0x9bd0f5],
  [0.48, 0xffb27a], [0.52, 0xff7857], [0.58, 0x53397a], [0.65, 0x16204d],
  [0.85, 0x101a40], [0.95, 0x3a2c5e], [1.00, 0xff9e7d],
];
const _cA = new THREE.Color(), _cB = new THREE.Color();
function skyColorAt(t, out) {
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const [t0, c0] = SKY_STOPS[i];
    const [t1, c1] = SKY_STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      _cA.setHex(c0); _cB.setHex(c1);
      out.copy(_cA).lerp(_cB, (t - t0) / (t1 - t0));
      return out;
    }
  }
  return out.setHex(SKY_STOPS[0][1]);
}

export function createSky(scene, rng) {
  const hemi = new THREE.HemisphereLight(0x87cefa, 0x3a5f3a, 0.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false }));
  const moonBall = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xdfe7ff, fog: false }));
  scene.add(sunBall, moonBall);

  // far value reaches past the chunk-streaming radius; the coarse far-terrain
  // mesh fills everything between, so mountains silhouette through the haze
  scene.fog = new THREE.Fog(0x87cefa, 60, 480);

  /* stars */
  let starMat;
  {
    const n = 350, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, e = rng() * Math.PI * 0.46 + 0.06, r = 540;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 3.2, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false,
    });
    scene.add(new THREE.Points(starGeo, starMat));
  }

  /* clouds */
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
    const n = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2 + rng() * 2.4, 10, 8), cm);
      puff.position.set(j * 2.6 - n * 1.3, rng() * 0.8, rng() * 1.6 - 0.8);
      puff.scale.y = 0.55;
      g.add(puff);
    }
    g.position.set(rng() * 640 - 320, 52 + rng() * 28, rng() * 640 - 320);
    scene.add(g);
    clouds.push(g);
  }

  const skyColor = new THREE.Color();

  /**
   * Advance the sky. t ∈ [0,1) through the day (0 = 6 AM).
   * Returns `night` ∈ [0,1] — 0 in bright daylight, 1 in deep night.
   */
  function update(t, dt, playerPos) {
    // sun / moon path: t ∈ [0, 0.5] is daytime, [0.5, 1] is night
    const isDay = t < 0.5;
    const segT = isDay ? t / 0.5 : (t - 0.5) / 0.5;
    const ang = segT * Math.PI;
    const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    const elev = Math.max(0, Math.sin(ang));

    sun.position.copy(playerPos).addScaledVector(dir, 130);
    sun.target.position.copy(playerPos);
    if (isDay) {
      sun.color.setHex(elev > 0.25 ? 0xfff4e0 : 0xffb27a);
      sun.intensity = 0.15 + elev * 2.6;
    } else {
      sun.color.setHex(0x9eb4ff);
      sun.intensity = 0.3 + elev * 0.5;
    }

    sunBall.position.copy(playerPos).addScaledVector(dir, 200);
    sunBall.visible = isDay && elev > 0.02;
    moonBall.position.copy(playerPos).addScaledVector(dir, 200);
    moonBall.visible = !isDay && elev > 0.02;

    skyColorAt(t, skyColor);
    scene.background = skyColor;
    scene.fog.color.copy(skyColor);
    hemi.color.copy(skyColor);
    hemi.intensity = 0.22 + (isDay ? elev * 0.5 : 0.1);

    // 0 at bright day → 1 at deep night
    const night = isDay ? 1 - Math.min(1, elev * 2.2) : 1;

    starMat.opacity = Math.max(0, (night - 0.45) / 0.55) * (isDay ? 0.25 : 1);

    for (const c of clouds) {
      c.position.x += dt * 0.6;
      if (c.position.x > 360) c.position.x = -360;
    }

    return night;
  }

  return { update };
}
