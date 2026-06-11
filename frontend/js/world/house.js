/**
 * The couple's house: walls, roof, windows, bedroom + kitchen furniture,
 * indoor lights, and all house interactables (closet, bed, seats, stove, fridge).
 */
import * as THREE from 'three';
import { mat, box } from './helpers.js';

/** footprint: x ∈ [-7, 7], z ∈ [-30, -20]; door faces +z (toward spawn) */
export const HOUSE_BOUNDS = { minX: -7, maxX: 7, minZ: -30, maxZ: -20, wallH: 3.2, t: 0.3 };

export function buildHouse(ctx) {
  const { scene, cameraBlockers, interactables, addBoxCollider } = ctx;
  const H = HOUSE_BOUNDS;

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

  /* ---- shell ---- */
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
  // interior dividing wall — spans only the back of the house (z ∈ [-30, -24])
  // so the front door opens into an entry hall: bedroom left, kitchen right
  {
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

  /* ---- windows (panes glow at night) ---- */
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
  addWindow(-3.8, H.maxZ, 0);             // front, bedroom side
  addWindow(3.8, H.maxZ, 0);              // front, kitchen side
  addWindow(H.minX, -26.5, Math.PI / 2);  // bedroom side wall
  addWindow(H.maxX, -23.5, Math.PI / 2);  // kitchen side wall
  addWindow(-3.5, H.minZ, 0);             // back, bedroom

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
  let bedroomLamp, lampShadeMat;
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
    bedroomLamp = new THREE.PointLight(0xffba6b, 0, 10, 1.6);
    bedroomLamp.position.set(nx, 1.3, nz + 0.4);
    scene.add(bedroomLamp);
    lampShadeMat = shade.material;
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

  // dinner table for two + chairs + pendant light
  let kitchenLamp, kitchenShadeMat;
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
    kitchenLamp = new THREE.PointLight(0xffc27a, 0, 11, 1.6);
    kitchenLamp.position.set(tx, 2.0, tz);
    scene.add(kitchenLamp);
    kitchenShadeMat = lampShade.material;
  }

  function isInsideHouse(p) {
    return p.x > H.minX && p.x < H.maxX && p.z > H.minZ && p.z < H.maxZ;
  }

  /** night ∈ [0,1] drives the indoor lighting; roof hides when someone is inside */
  function update(night, playerPos) {
    const lampOn = Math.max(0, (night - 0.25) / 0.75);
    bedroomLamp.intensity = lampOn * 14;
    kitchenLamp.intensity = lampOn * 18;
    porchLight.intensity = lampOn * 14;
    lampShadeMat.emissiveIntensity = lampOn * 1.4;
    kitchenShadeMat.emissiveIntensity = lampOn * 1.4;
    porchLamp.material.emissiveIntensity = lampOn * 1.6;
    for (const wm of windowMats) wm.emissiveIntensity = lampOn * 0.9;

    roof.visible = !isInsideHouse(playerPos);
    chimney.visible = roof.visible;
  }

  return { bounds: H, isInsideHouse, update };
}
