/**
 * The city: road grid, heart-fountain plaza, and all the date-spot buildings
 * (café, bakery, flower shop, cinema, chapel, restaurant, bookstore, townhouses).
 */
import * as THREE from 'three';
import { mat, box, addFlower } from './helpers.js';

/** car loop corners (rectangle of the city ring road) */
export const CITY = {
  ring: { minX: -52, maxX: 52, minZ: 44, maxZ: 96 },
  plaza: { x: 0, z: 70, r: 13 },
};

function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 34px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(30,20,30,0.9)';
  ctx.strokeText(text, 128, 34);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(ctx) {
  const { scene, cameraBlockers, interactables, addBoxCollider, mapFeatures } = ctx;
  const glowMats = [];   // window panes / lamp globes that light up at night
  const nightLights = []; // actual PointLights (plaza only, for perf)

  /* ============ roads ============ */
  const roadMat = mat(0x3b3b42);
  const dashMat = mat(0xd8c94f);
  function road(cx, cz, w, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), roadMat);
    m.position.set(cx, 0.025, cz);
    m.receiveShadow = true;
    scene.add(m);
    mapFeatures.push({ type: 'rect', x: cx, z: cz, w, d, color: '#4c4c55' });
    // center dashes along the long axis
    const along = w > d ? 'x' : 'z';
    const len = Math.max(w, d);
    for (let o = -len / 2 + 2; o < len / 2 - 2; o += 4.5) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(
        along === 'x' ? 1.6 : 0.18, 0.02, along === 'x' ? 0.18 : 1.6), dashMat);
      dash.position.set(along === 'x' ? cx + o : cx, 0.06, along === 'x' ? cz : cz + o);
      scene.add(dash);
    }
  }
  road(0, 25, 6, 38);     // connector: spawn → city
  road(0, 44, 116, 6);    // north avenue
  road(0, 96, 116, 6);    // south avenue
  road(-52, 70, 6, 58);   // west street
  road(52, 70, 6, 58);    // east street

  /* ============ plaza with heart fountain ============ */
  {
    const { x: px, z: pz, r } = CITY.plaza;
    const paving = new THREE.Mesh(new THREE.CircleGeometry(r, 36), mat(0xbfb39e));
    paving.rotation.x = -Math.PI / 2;
    paving.position.set(px, 0.03, pz);
    paving.receiveShadow = true;
    scene.add(paving);
    const rim = new THREE.Mesh(new THREE.RingGeometry(r - 0.6, r, 36), mat(0x9a8f7c));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(px, 0.04, pz);
    scene.add(rim);
    mapFeatures.push({ type: 'circle', x: px, z: pz, r, color: '#bfb39e' });
    mapFeatures.push({ type: 'emoji', x: px, z: pz, text: '⛲', size: 13 });

    // fountain
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.7, 20), mat(0xa39a88));
    basin.position.set(px, 0.35, pz);
    basin.castShadow = true;
    scene.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.5, 20),
      new THREE.MeshStandardMaterial({ color: 0x4aa3df, transparent: true, opacity: 0.8, roughness: 0.15 }));
    water.position.set(px, 0.5, pz);
    scene.add(water);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 12), mat(0x9a8f7c));
    pedestal.position.set(px, 1.3, pz);
    scene.add(pedestal);
    // heart sculpture: two spheres + a 45°-rotated cube
    const heartMat = new THREE.MeshStandardMaterial({ color: 0xff5c8a, roughness: 0.4, emissive: 0xff5c8a, emissiveIntensity: 0.15 });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.4), heartMat);
    cube.rotation.z = Math.PI / 4;
    cube.position.set(px, 2.25, pz);
    scene.add(cube);
    for (const side of [-1, 1]) {
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 10), heartMat);
      lobe.position.set(px + side * 0.22, 2.55, pz);
      scene.add(lobe);
    }
    ctx.colliders.push({ type: 'circle', x: px, z: pz, r: 3.4 });
    interactables.push({
      x: px + 3.8, z: pz, radius: 1.6,
      label: 'toss a coin in the fountain 🪙', type: 'moment',
      data: { emoji: '🪙', toast: 'You made a wish together… 💫' },
    });

    // benches facing the fountain + lamp posts
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const bx = px + Math.cos(a) * 9.5, bz = pz + Math.sin(a) * 9.5;
      const facing = Math.atan2(px - bx, pz - bz);
      bench(bx, bz, facing);
      const la = i * Math.PI / 2;
      lampPost(px + Math.cos(la) * 11, pz + Math.sin(la) * 11);
    }
    // flowers ringing the plaza
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      addFlower(scene, px + Math.cos(a) * (r - 1.6), pz + Math.sin(a) * (r - 1.6),
        i % 2 ? 0xff4d79 : 0xfff04d);
    }
    // two soft plaza lights at night
    for (const ox of [-6, 6]) {
      const l = new THREE.PointLight(0xffc97a, 0, 18, 1.6);
      l.position.set(px + ox, 3.4, pz);
      scene.add(l);
      nightLights.push(l);
    }
  }

  /* ============ helpers ============ */
  function bench(x, z, ry) {
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
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);
    addBoxCollider(x, z, 1.0, 1.0);
    for (const side of [-0.5, 0.5]) {
      const sx = x + Math.cos(ry) * side, sz = z - Math.sin(ry) * side;
      interactables.push({
        x: sx, z: sz, radius: 1.3,
        label: 'sit together 💑', type: 'seat',
        data: {
          x: sx, z: sz, y: -0.21, ry,
          exit: { x: x + Math.sin(ry) * 1.2, z: z + Math.cos(ry) * 1.2 },
        },
      });
    }
  }

  function lampPost(x, z) {
    const pole = box(0.14, 3.4, 0.14, mat(0x3a3a42));
    pole.position.set(x, 1.7, z);
    scene.add(pole);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 0 }));
    globe.position.set(x, 3.5, z);
    scene.add(globe);
    glowMats.push(globe.material);
  }

  /**
   * Generic blocky building. face: 0 door→+z, π door→−z, π/2 door→+x, −π/2 door→−x.
   */
  function building({ x, z, w = 8, d = 8, h = 6, color, roofColor = 0x8a8a92, roofStyle = 'flat', face = 0, sign, awningColor }) {
    const g = new THREE.Group();
    const body = box(w, h, d, mat(color));
    body.position.y = h / 2;
    g.add(body);
    cameraBlockers.push(body);

    const door = box(1.4, 2.2, 0.16, mat(0x4a3526));
    door.position.set(0, 1.1, d / 2 + 0.06);
    g.add(door);

    // windows: front grid + one per side
    const floors = Math.max(1, Math.floor((h - 2.2) / 2));
    const cols = Math.max(2, Math.floor(w / 3));
    for (let f = 0; f < floors; f++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const wx = -w / 2 + (cIdx + 0.5) * (w / cols);
        if (f === 0 && Math.abs(wx) < 1.3) continue; // don't overlap the door
        const pane = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 0.12),
          new THREE.MeshStandardMaterial({ color: 0xbcd8e8, emissive: 0xffe9a8, emissiveIntensity: 0, roughness: 0.3 }));
        pane.position.set(wx, 2.0 + f * 2, d / 2 + 0.04);
        g.add(pane);
        glowMats.push(pane.material);
      }
    }

    if (roofStyle === 'flat') {
      const slab = box(w + 0.6, 0.35, d + 0.6, mat(roofColor));
      slab.position.y = h + 0.17;
      g.add(slab);
    } else {
      const geo = new THREE.ConeGeometry(Math.max(w, d) * 0.72, 2.4, 4);
      geo.rotateY(Math.PI / 4);
      const roof = new THREE.Mesh(geo, mat(roofColor));
      roof.scale.set(w / (Math.max(w, d) * 1.02), 1, d / (Math.max(w, d) * 1.02));
      roof.position.y = h + 1.2;
      roof.castShadow = true;
      g.add(roof);
    }

    if (sign) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 6), 1.2),
        new THREE.MeshBasicMaterial({ map: signTexture(sign), transparent: true }));
      plane.position.set(0, 2.9, d / 2 + 0.1);
      g.add(plane);
    }

    if (awningColor) {
      const awning = box(w * 0.7, 0.12, 1.6, mat(awningColor));
      awning.position.set(0, 2.45, d / 2 + 0.8);
      awning.rotation.x = 0.25;
      g.add(awning);
    }

    g.position.set(x, 0, z);
    g.rotation.y = face;
    scene.add(g);

    // axis-aligned collider (faces are multiples of 90°)
    const swapped = Math.abs(Math.sin(face)) > 0.5;
    const fw = swapped ? d : w, fd = swapped ? w : d;
    addBoxCollider(x, z, fw, fd);
    mapFeatures.push({ type: 'rect', x, z, w: fw, d: fd, color: '#' + color.toString(16).padStart(6, '0') });
    return g;
  }

  /* ============ north avenue shops (doors face the road at z=44) ============ */
  building({ x: -32, z: 34, w: 10, d: 9, h: 5, color: 0xd9825f, roofStyle: 'pyramid', roofColor: 0x8c4a3a, sign: 'Love Brew ☕', awningColor: 0xc94f6d });
  // café terrace: two little tables with chairs
  for (const tx of [-36, -28]) {
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 12), mat(0xf4ead8));
    table.position.set(tx, 0.75, 41);
    scene.add(table);
    const tLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.75, 8), mat(0x5e5e5e));
    tLeg.position.set(tx, 0.37, 41);
    scene.add(tLeg);
    addBoxCollider(tx, 41, 1.0, 1.0);
    for (const side of [-1, 1]) {
      const chx = tx + side * 1.1;
      const seat = box(0.5, 0.08, 0.5, mat(0x8a5a36));
      seat.position.set(chx, 0.45, 41);
      scene.add(seat);
      interactables.push({
        x: chx, z: 41, radius: 1.2,
        label: 'sit at the café ☕', type: 'seat',
        data: { x: chx, z: 41, y: -0.26, ry: side < 0 ? Math.PI / 2 : -Math.PI / 2, exit: { x: chx, z: 42.5 } },
      });
    }
  }
  building({ x: -16, z: 34, w: 8, d: 8, h: 4.5, color: 0xe8a9c9, roofStyle: 'pyramid', roofColor: 0xb86b8f, sign: 'Petals 🌷' });
  for (let i = 0; i < 5; i++) addFlower(scene, -19.5 + i * 1.7, 39.2, [0xff4d79, 0xfff04d, 0xc77dff, 0xff8fb3, 0xffffff][i]);
  building({ x: 16, z: 34, w: 9, d: 8, h: 5, color: 0xf0d9b5, roofStyle: 'pyramid', roofColor: 0xa8762e, sign: 'Sugar & Co 🥐' });
  interactables.push({
    x: 16, z: 39.5, radius: 1.8,
    label: 'buy fresh pastries 🥐', type: 'moment',
    data: { emoji: '🥐', toast: 'Warm croissants for two 🥐❤️' },
  });
  building({ x: 36, z: 33, w: 14, d: 11, h: 8, color: 0x4a4e69, roofColor: 0x2e3148, sign: 'Starlight Cinema 🎬' });
  interactables.push({
    x: 36, z: 39.5, radius: 2.0,
    label: 'catch a movie 🎬', type: 'moment',
    data: { emoji: '🍿', toast: 'Date night at the movies 🎬🍿' },
  });

  /* ============ west street: wedding chapel + cottages ============ */
  building({ x: -62, z: 70, w: 10, d: 12, h: 7, color: 0xf5f0e6, roofStyle: 'pyramid', roofColor: 0x8fa3b8, face: Math.PI / 2, sign: 'Chapel 💒' });
  {
    // steeple
    const tower = box(2.2, 4, 2.2, mat(0xf5f0e6));
    tower.position.set(-62, 9, 70);
    scene.add(tower);
    const spireGeo = new THREE.ConeGeometry(1.8, 2.6, 4);
    spireGeo.rotateY(Math.PI / 4);
    const spire = new THREE.Mesh(spireGeo, mat(0x8fa3b8));
    spire.position.set(-62, 12.3, 70);
    scene.add(spire);
    interactables.push({
      x: -55.5, z: 70, radius: 2.0,
      label: 'ring the chapel bell 🔔', type: 'moment',
      data: { emoji: '🔔', toast: 'The bells ring just for you two 🔔💕' },
    });
  }
  building({ x: -62, z: 52, w: 8, d: 8, h: 5, color: 0xa9c5a0, roofStyle: 'pyramid', roofColor: 0x5f7a55, face: Math.PI / 2 });
  building({ x: -62, z: 88, w: 8, d: 8, h: 5, color: 0xc9b8e8, roofStyle: 'pyramid', roofColor: 0x7a6a9a, face: Math.PI / 2 });

  /* ============ east street: restaurant + bookstore ============ */
  building({ x: 62, z: 62, w: 11, d: 10, h: 6, color: 0x9c3848, roofStyle: 'pyramid', roofColor: 0x5e1f2a, face: -Math.PI / 2, sign: 'Bella Notte 🍝' });
  interactables.push({
    x: 55.5, z: 62, radius: 2.0,
    label: 'have a candlelit dinner 🍝', type: 'moment',
    data: { emoji: '🍝', toast: 'A candlelit dinner for two 🍝🕯️' },
  });
  building({ x: 62, z: 84, w: 9, d: 8, h: 5, color: 0x5f7470, roofStyle: 'pyramid', roofColor: 0x36514c, face: -Math.PI / 2, sign: 'Two Tales 📚' });
  interactables.push({
    x: 56.5, z: 84, radius: 1.8,
    label: 'browse books together 📚', type: 'moment',
    data: { emoji: '📖', toast: 'Reading the same page 📖💞' },
  });

  /* ============ south avenue townhouses (doors face the road at z=96) ============ */
  const pastels = [0xf2b5a0, 0xa0c8f2, 0xf2e3a0, 0xb5e8c8, 0xe8b5d8];
  pastels.forEach((c, i) => {
    building({
      x: -48 + i * 24, z: 106, w: 9, d: 8, h: 6 + (i % 2), color: c,
      roofStyle: 'pyramid', roofColor: 0x7a5a4a, face: Math.PI,
    });
  });

  /* ============ street lamps along the avenues ============ */
  for (const lz of [47.8, 92.2]) {
    for (const lx of [-44, -22, 22, 44]) lampPost(lx, lz); // none at x=0 — that's the plaza walkway
  }
  for (const lx of [-48.2, 48.2]) {
    for (let lz = 58; lz <= 84; lz += 26) lampPost(lx, lz);
  }
  lampPost(3.8, 12); lampPost(-3.8, 30); // connector road

  function update(night) {
    const lampOn = Math.max(0, (night - 0.2) / 0.8);
    for (const m of glowMats) m.emissiveIntensity = lampOn * 1.3;
    for (const l of nightLights) l.intensity = lampOn * 16;
  }

  return { update };
}
