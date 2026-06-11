import * as THREE from 'three';

/* Seeded RNG so both players generate the exact same world */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

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

export function createWorld(scene) {
  const rng = mulberry32(20240214);
  const colliders = [];       // {type:'box',minX,maxX,minZ,maxZ} | {type:'circle',x,z,r}
  const cameraBlockers = [];  // meshes the camera should not clip through
  const interactables = [];   // {x,z,radius,label,type,data}

  const addBoxCollider = (cx, cz, w, d) =>
    colliders.push({ type: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

  /* ============ lights ============ */
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

  scene.fog = new THREE.Fog(0x87cefa, 60, 240);

  /* ============ ground ============ */
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(220, 48),
    mat(0x57a55a)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // distant rolling hills on the horizon
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.4;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(55 + rng() * 35, 16, 12), mat(0x3f6b46));
    hill.scale.y = 0.28;
    hill.position.set(Math.cos(a) * 200, -4, Math.sin(a) * 200);
    scene.add(hill);
  }

  /* ============ stars ============ */
  {
    const n = 350, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, e = rng() * Math.PI * 0.46 + 0.06, r = 230;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false,
    });
    scene.add(new THREE.Points(starGeo, starMat));
  }

  /* ============ clouds ============ */
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
    const n = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2 + rng() * 2.4, 10, 8), cm);
      puff.position.set(j * 2.6 - n * 1.3, rng() * 0.8, rng() * 1.6 - 0.8);
      puff.scale.y = 0.55;
      g.add(puff);
    }
    g.position.set(rng() * 280 - 140, 38 + rng() * 16, rng() * 280 - 140);
    scene.add(g);
    clouds.push(g);
  }

  /* ============ the house (door faces +z, toward spawn) ============ */
  // footprint: x ∈ [-7, 7], z ∈ [-30, -20]; bedroom on the left (x<0), kitchen on the right
  const H = { minX: -7, maxX: 7, minZ: -30, maxZ: -20, wallH: 3.2, t: 0.3 };
  const wallMat = mat(0xf5e6cf);
  const wallInMat = mat(0xefdcc3);
  const trimMat = mat(0x8a5a36);

  function wallSeg(cx, cz, w, d, h = H.wallH, y = 0) {
    const m = box(w, h, d, wallMat);
    m.position.set(cx, y + h / 2, cz);
    scene.add(m);
    cameraBlockers.push(m);
    addBoxCollider(cx, cz, w, d);
    return m;
  }

  // floor
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.12, 10.6), mat(0xb08158));
  floor.position.set(0, 0.06, -25);
  floor.receiveShadow = true;
  scene.add(floor);

  // back wall (z = -30)
  wallSeg(0, H.minZ, 14 + H.t, H.t);
  // left + right walls
  wallSeg(H.minX, -25, H.t, 10);
  wallSeg(H.maxX, -25, H.t, 10);
  // front wall (z = -20) with a door gap x ∈ [-0.9, 0.9]
  wallSeg((-7 + -0.9) / 2, H.maxZ, (-0.9 - -7), H.t);
  wallSeg((0.9 + 7) / 2, H.maxZ, (7 - 0.9), H.t);
  // lintel above the door — no collider, players walk underneath it
  {
    const lintel = box(1.8, H.wallH - 2.25, H.t, wallMat);
    lintel.position.set(0, 2.25 + (H.wallH - 2.25) / 2, H.maxZ);
    scene.add(lintel);
    cameraBlockers.push(lintel);
  }
  // interior dividing wall (x = 0) with a doorway gap z ∈ [-25.8, -24.2]
  {
    // spans only the back of the house (z ∈ [-30, -24]) so the front door
    // opens into a little entry hall — bedroom to the left, kitchen to the right
    const divider = box(H.t, H.wallH, 6, wallInMat);
    divider.position.set(0, H.wallH / 2, -27);
    scene.add(divider);
    cameraBlockers.push(divider);
    addBoxCollider(0, -27, H.t, 6);
  }

  // roof: 4-sided pyramid trick + chimney
  const roof = new THREE.Mesh(new THREE.ConeGeometry(10.2, 3.4, 4), mat(0xc14953));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.05, 1, 0.78); // edge apothem ≈ 7.6 × 5.6 — covers the 14×10 footprint with a small eave
  roof.position.set(0, H.wallH + 1.7, -25);
  roof.castShadow = true;
  scene.add(roof);
  cameraBlockers.push(roof);
  const chimney = box(0.8, 1.6, 0.8, mat(0x9a5b4f));
  chimney.position.set(4, H.wallH + 2.2, -27);
  scene.add(chimney);

  // door frame + porch
  const frameL = box(0.16, 2.3, 0.36, trimMat); frameL.position.set(-0.98, 1.15, H.maxZ); scene.add(frameL);
  const frameR = box(0.16, 2.3, 0.36, trimMat); frameR.position.set(0.98, 1.15, H.maxZ); scene.add(frameR);
  const frameT = box(2.12, 0.16, 0.36, trimMat); frameT.position.set(0, 2.32, H.maxZ); scene.add(frameT);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.8), mat(0xc99767));
  porch.position.set(0, 0.05, -19.1);
  porch.receiveShadow = true;
  scene.add(porch);
  const porchLamp = box(0.18, 0.3, 0.18, new THREE.MeshStandardMaterial({
    color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0,
  }));
  porchLamp.position.set(1.3, 2.5, -19.85);
  scene.add(porchLamp);
  const porchLight = new THREE.PointLight(0xffc97a, 0, 9, 1.8);
  porchLight.position.set(1.3, 2.4, -19.2);
  scene.add(porchLight);

  // windows (decorative panes that glow at night)
  const windowMats = [];
  function addWindow(x, z, ry) {
    const g = new THREE.Group();
    // deeper than the 0.3 wall so frame and pane show on both faces
    const frame = box(1.5, 1.3, 0.38, trimMat);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.26, 1.06, 0.4), new THREE.MeshStandardMaterial({
      color: 0xbcd8e8, emissive: 0xffe9a8, emissiveIntensity: 0, roughness: 0.3,
    }));
    windowMats.push(pane.material);
    const barH = box(1.26, 0.06, 0.42, trimMat);
    const barV = box(0.06, 1.06, 0.42, trimMat);
    g.add(frame, pane, barH, barV);
    g.position.set(x, 1.7, z);
    g.rotation.y = ry;
    scene.add(g);
  }
  addWindow(-3.8, H.maxZ, 0);          // front, bedroom side
  addWindow(3.8, H.maxZ, 0);           // front, kitchen side
  addWindow(H.minX, -26.5, Math.PI / 2);  // bedroom side wall
  addWindow(H.maxX, -23.5, Math.PI / 2);  // kitchen side wall
  addWindow(-3.5, H.minZ, 0);          // back, bedroom

  /* ============ bedroom (x ∈ [-7, 0]) ============ */
  // double bed against the back wall
  {
    const bx = -3.6, bz = -28.3; // bed center
    const frame = box(2.7, 0.3, 2.3, mat(0x7a4a2b));
    frame.position.set(bx, 0.15, bz);
    scene.add(frame);
    const mattress = box(2.5, 0.22, 2.1, mat(0xfdf6ec));
    mattress.position.set(bx, 0.41, bz);
    scene.add(mattress);
    const blanket = box(2.5, 0.1, 1.3, mat(0xe87fa8));
    blanket.position.set(bx, 0.56, bz + 0.35);
    scene.add(blanket);
    const headboard = box(2.7, 1.1, 0.16, mat(0x6b3f24));
    headboard.position.set(bx, 0.55, bz - 1.2);
    scene.add(headboard);
    for (const side of [-1, 1]) {
      const pillow = box(0.85, 0.16, 0.5, mat(side < 0 ? 0xcfe3ff : 0xffd1e8));
      pillow.position.set(bx + side * 0.62, 0.58, bz - 0.72);
      scene.add(pillow);
    }
    addBoxCollider(bx, bz, 2.7, 2.3);
    interactables.push({
      x: bx, z: bz + 1.6, radius: 1.7,
      label: 'lie down together 🛏️', type: 'bed',
      data: {
        y: 0.52,
        slots: [
          { x: bx - 0.62, z: bz + 0.9, ry: 0, exit: { x: bx - 1.9, z: bz + 1.2 } }, // him, left
          { x: bx + 0.62, z: bz + 0.9, ry: 0, exit: { x: bx + 1.7, z: bz + 1.2 } }, // her, right
        ],
      },
    });
  }

  // wardrobe / closet against the left wall
  {
    const wx = -6.25, wz = -22.6;
    const body = box(0.75, 2.25, 1.9, mat(0x9c6644));
    body.position.set(wx, 1.125, wz);
    scene.add(body);
    for (const side of [-1, 1]) {
      const door = box(0.08, 2.0, 0.85, mat(0xb07d4f));
      door.position.set(wx + 0.42, 1.1, wz + side * 0.47);
      scene.add(door);
      const handle = box(0.06, 0.3, 0.06, mat(0xd9b26a));
      handle.position.set(wx + 0.5, 1.1, wz + side * 0.12);
      scene.add(handle);
    }
    addBoxCollider(wx, wz, 0.95, 2.0);
    interactables.push({
      x: wx + 0.9, z: wz, radius: 1.6,
      label: 'open the closet 👗', type: 'closet',
    });
  }

  // nightstand + lamp
  {
    const nx = -5.4, nz = -29.3;
    const stand = box(0.6, 0.55, 0.6, mat(0x8a5a36));
    stand.position.set(nx, 0.275, nz);
    scene.add(stand);
    const lampBase = box(0.12, 0.3, 0.12, mat(0x555566));
    lampBase.position.set(nx, 0.7, nz);
    scene.add(lampBase);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.26, 10),
      new THREE.MeshStandardMaterial({ color: 0xffe2b8, emissive: 0xffce7a, emissiveIntensity: 0 }));
    shade.position.set(nx, 0.95, nz);
    scene.add(shade);
    var bedroomLamp = new THREE.PointLight(0xffba6b, 0, 10, 1.6);
    bedroomLamp.position.set(nx, 1.3, nz + 0.4);
    scene.add(bedroomLamp);
    var lampShadeMat = shade.material;
    addBoxCollider(nx, nz, 0.6, 0.6);
  }

  // soft round rug
  {
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), mat(0xf3c5d8));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-3.2, 0.13, -25.6);
    rug.receiveShadow = true;
    scene.add(rug);
  }

  /* ============ kitchen (x ∈ [0, 7]) ============ */
  const counterMat = mat(0xe8e3d8);
  const counterTopMat = mat(0x756a5d);

  // counter run along the right wall
  {
    const cx = 6.35;
    const counter = box(0.95, 0.92, 4.4, counterMat);
    counter.position.set(cx, 0.46, -27.4);
    scene.add(counter);
    const top = box(1.05, 0.08, 4.5, counterTopMat);
    top.position.set(cx, 0.96, -27.4);
    scene.add(top);
    addBoxCollider(cx, -27.4, 1.1, 4.5);

    // sink
    const sink = box(0.6, 0.1, 0.6, mat(0xc9cdd3));
    sink.position.set(cx, 1.02, -26.2);
    scene.add(sink);
    const faucet = box(0.07, 0.35, 0.07, mat(0x9fa6ad));
    faucet.position.set(cx + 0.3, 1.2, -26.2);
    scene.add(faucet);
  }

  // stove
  {
    const sx = 6.35, sz = -24.4;
    const stove = box(0.95, 0.92, 1.1, mat(0xf4f4f4));
    stove.position.set(sx, 0.46, sz);
    scene.add(stove);
    const stoveTop = box(1.0, 0.06, 1.15, mat(0x2e2e34));
    stoveTop.position.set(sx, 0.95, sz);
    scene.add(stoveTop);
    for (const [ox, oz] of [[-0.22, -0.25], [0.22, -0.25], [-0.22, 0.25], [0.22, 0.25]]) {
      const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 14), mat(0x111114));
      burner.position.set(sx + ox, 0.99, sz + oz);
      scene.add(burner);
    }
    const ovenDoor = box(0.08, 0.5, 0.8, mat(0x3a3a42));
    ovenDoor.position.set(sx - 0.5, 0.45, sz);
    scene.add(ovenDoor);
    // a little pot
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.18, 14), mat(0xc0392b));
    pot.position.set(sx - 0.22, 1.08, sz - 0.25);
    scene.add(pot);
    addBoxCollider(sx, sz, 1.1, 1.2);
    interactables.push({
      x: sx - 0.9, z: sz, radius: 1.5,
      label: 'cook something 🍳', type: 'cook',
    });
  }

  // fridge in the corner
  {
    const fx = 6.3, fz = -20.9;
    const fridge = box(1.0, 2.2, 1.0, mat(0xd7dde3));
    fridge.position.set(fx, 1.1, fz);
    scene.add(fridge);
    const fdoorLine = box(1.04, 0.03, 1.0, mat(0xaab2ba));
    fdoorLine.position.set(fx, 1.45, fz);
    scene.add(fdoorLine);
    for (const hy of [1.65, 1.1]) {
      const handle = box(0.08, 0.35, 0.08, mat(0x8d959d));
      handle.position.set(fx - 0.55, hy, fz - 0.32);
      scene.add(handle);
    }
    addBoxCollider(fx, fz, 1.1, 1.1);
    interactables.push({
      x: fx - 0.95, z: fz, radius: 1.5,
      label: 'grab a snack 🧃', type: 'fridge',
    });
  }

  // dinner table for two + chairs
  {
    const tx = 3.2, tz = -23.2;
    const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 18), mat(0x9c6644));
    tableTop.position.set(tx, 0.78, tz);
    tableTop.castShadow = true;
    scene.add(tableTop);
    const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.78, 10), mat(0x7a4a2b));
    tableLeg.position.set(tx, 0.39, tz);
    scene.add(tableLeg);
    addBoxCollider(tx, tz, 1.5, 1.5);

    // vase + flower
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.18, 10), mat(0x7ec8e3));
    vase.position.set(tx, 0.91, tz);
    scene.add(vase);
    const stem = box(0.025, 0.2, 0.025, mat(0x3f7d3f));
    stem.position.set(tx, 1.06, tz);
    scene.add(stem);
    const bloom = box(0.1, 0.1, 0.1, mat(0xff5c8a));
    bloom.position.set(tx, 1.18, tz);
    scene.add(bloom);

    // plates + mugs
    for (const side of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.025, 16), mat(0xfafafa));
      plate.position.set(tx + side * 0.42, 0.84, tz);
      scene.add(plate);
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), mat(side < 0 ? 0x6aa5e0 : 0xe87fa8));
      mug.position.set(tx + side * 0.42, 0.87, tz + 0.3);
      scene.add(mug);
    }

    // two chairs facing each other
    for (const side of [-1, 1]) {
      const chx = tx + side * 1.35;
      const seat = box(0.55, 0.1, 0.55, mat(0x8a5a36));
      seat.position.set(chx, 0.45, tz);
      scene.add(seat);
      const back = box(0.1, 0.7, 0.55, mat(0x8a5a36));
      back.position.set(chx + side * 0.24, 0.85, tz);
      scene.add(back);
      for (const [lx, lz] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) {
        const leg = box(0.07, 0.45, 0.07, mat(0x6b3f24));
        leg.position.set(chx + lx, 0.22, tz + lz);
        scene.add(leg);
      }
      interactables.push({
        x: chx, z: tz, radius: 1.3,
        label: 'sit at the table 🪑', type: 'seat',
        data: { x: chx, z: tz, y: -0.24, ry: side < 0 ? Math.PI / 2 : -Math.PI / 2, exit: { x: chx, z: tz + 1.1 } },
      });
    }

    // pendant light above the table
    const cord = box(0.04, 0.9, 0.04, mat(0x444444));
    cord.position.set(tx, 2.75, tz);
    scene.add(cord);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0xd9a05b, emissive: 0xffd27a, emissiveIntensity: 0 }));
    lampShade.position.set(tx, 2.3, tz);
    scene.add(lampShade);
    var kitchenLamp = new THREE.PointLight(0xffc27a, 0, 11, 1.6);
    kitchenLamp.position.set(tx, 2.0, tz);
    scene.add(kitchenLamp);
    var kitchenShadeMat = lampShade.material;
  }

  /* ============ path from spawn to the front door ============ */
  for (let z = -2; z >= -19; z -= 1.7) {
    const stone = box(1.5, 0.06, 1.2, mat(0xc2b8a3));
    stone.position.set((rng() - 0.5) * 0.3, 0.03, z);
    stone.rotation.y = (rng() - 0.5) * 0.3;
    stone.receiveShadow = true;
    scene.add(stone);
  }

  /* ============ pond + bench ============ */
  const pond = { x: 19, z: 13, r: 7 };
  {
    const bed = new THREE.Mesh(new THREE.CircleGeometry(pond.r + 0.6, 28), mat(0x4a6b43));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(pond.x, 0.02, pond.z);
    scene.add(bed);
    const water = new THREE.Mesh(new THREE.CircleGeometry(pond.r, 28), new THREE.MeshStandardMaterial({
      color: 0x4aa3df, transparent: true, opacity: 0.75, roughness: 0.15, metalness: 0.1,
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(pond.x, 0.16, pond.z);
    scene.add(water);
    // ring of rocks
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rng() * 0.3), mat(0x8d8d8d));
      rock.position.set(pond.x + Math.cos(a) * (pond.r + 0.5), 0.2, pond.z + Math.sin(a) * (pond.r + 0.5));
      rock.castShadow = true;
      scene.add(rock);
    }
    // bench facing the pond
    const bx = pond.x - pond.r - 2.4, bz = pond.z;
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

  /* ============ picnic spot + heart garden ============ */
  {
    const px = -15, pz = 10;
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
    interactables.push({
      x: px - 0.7, z: pz + 0.3, radius: 1.4,
      label: 'sit on the picnic blanket 🧺', type: 'seat',
      data: { x: px - 0.7, z: pz + 0.3, y: -0.42, ry: Math.PI / 2, exit: { x: px - 1.8, z: pz + 0.3 } },
    });
    interactables.push({
      x: px + 0.7, z: pz + 0.3, radius: 1.4,
      label: 'sit on the picnic blanket 🧺', type: 'seat',
      data: { x: px + 0.7, z: pz + 0.3, y: -0.42, ry: -Math.PI / 2, exit: { x: px + 1.8, z: pz + 0.3 } },
    });

    // heart-shaped flower garden
    const gx = -16, gz = 17;
    for (let u = 0; u < Math.PI * 2; u += 0.33) {
      const hx = 16 * Math.pow(Math.sin(u), 3);
      const hz = 13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u);
      addFlower(gx + hx * 0.16, gz - hz * 0.16, u % 0.66 < 0.33 ? 0xff4d79 : 0xff8fb3);
    }
  }

  function addFlower(x, z, color) {
    const stem = box(0.05, 0.32, 0.05, mat(0x3f7d3f));
    stem.position.set(x, 0.16, z);
    stem.castShadow = false;
    scene.add(stem);
    const head = box(0.14, 0.14, 0.14, mat(color));
    head.position.set(x, 0.36, z);
    head.castShadow = false;
    scene.add(head);
  }

  /* ============ trees, flowers, rocks ============ */
  function spotIsClear(x, z) {
    if (x > H.minX - 4 && x < H.maxX + 4 && z > H.minZ - 5 && z < H.maxZ + 6) return false; // house + yard
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r + 3) return false;
    if (Math.abs(x) < 3 && z > -21 && z < 4) return false;            // path
    if (Math.hypot(x + 15, z - 10) < 6) return false;                 // picnic
    if (Math.hypot(x + 16, z - 17) < 6) return false;                 // heart garden
    if (Math.hypot(x, z) < 5) return false;                           // spawn
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
    placed++;
  }

  // wild flowers + rocks
  for (let i = 0; i < 70; i++) {
    const x = (rng() * 2 - 1) * 90;
    const z = (rng() * 2 - 1) * 90;
    if (!spotIsClear(x, z)) continue;
    addFlower(x, z, [0xfff04d, 0xff8fb3, 0xc77dff, 0xffffff][Math.floor(rng() * 4)]);
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

  /* ============ fireflies (visible at night) ============ */
  const fireflyBase = [];
  let fireflies, fireflyMat;
  {
    const n = 40, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const nearPond = i % 2 === 0;
      const cx = nearPond ? pond.x : -16, cz = nearPond ? pond.z : 14;
      const a = rng() * Math.PI * 2, r = 3 + rng() * 7;
      pos[i * 3] = cx + Math.cos(a) * r;
      pos[i * 3 + 1] = 0.5 + rng() * 1.6;
      pos[i * 3 + 2] = cz + Math.sin(a) * r;
      fireflyBase.push(pos[i * 3 + 1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fireflyMat = new THREE.PointsMaterial({
      color: 0xffee88, size: 0.16, transparent: true, opacity: 0, depthWrite: false,
    });
    fireflies = new THREE.Points(geo, fireflyMat);
    scene.add(fireflies);
  }

  /* ============ per-frame environment update ============ */
  const skyColor = new THREE.Color();
  let elapsed = 0;

  function isInsideHouse(p) {
    return p.x > H.minX && p.x < H.maxX && p.z > H.minZ && p.z < H.maxZ;
  }

  function update(t, dt, playerPos) {
    elapsed += dt;

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

    // sky, fog, ambient
    skyColorAt(t, skyColor);
    scene.background = skyColor;
    scene.fog.color.copy(skyColor);
    hemi.color.copy(skyColor);
    hemi.intensity = 0.22 + (isDay ? elev * 0.5 : 0.1);

    // 0 at bright day → 1 at deep night
    const night = isDay ? 1 - Math.min(1, elev * 2.2) : 1;

    starMat.opacity = Math.max(0, (night - 0.45) / 0.55) * (isDay ? 0.25 : 1);
    fireflyMat.opacity = Math.max(0, (night - 0.5) / 0.5) * 0.95;
    fireflies.position.y = Math.sin(elapsed * 1.3) * 0.18;

    // house lights come on in the evening
    const lampOn = Math.max(0, (night - 0.25) / 0.75);
    bedroomLamp.intensity = lampOn * 14;
    kitchenLamp.intensity = lampOn * 18;
    porchLight.intensity = lampOn * 14;
    lampShadeMat.emissiveIntensity = lampOn * 1.4;
    kitchenShadeMat.emissiveIntensity = lampOn * 1.4;
    porchLamp.material.emissiveIntensity = lampOn * 1.6;
    for (const wm of windowMats) wm.emissiveIntensity = lampOn * 0.9;

    // clouds drift
    for (const c of clouds) {
      c.position.x += dt * 0.6;
      if (c.position.x > 160) c.position.x = -160;
    }

    // hide the roof when someone is inside so the camera can see in
    roof.visible = !isInsideHouse(playerPos);
    chimney.visible = roof.visible;

    return night;
  }

  return { colliders, cameraBlockers, interactables, update, isInsideHouse };
}
