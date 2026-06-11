/**
 * The Pick-a-Bloom garden — a fenced plot west of the path where flowers can
 * be plucked (E) into your pocket and gifted to your partner (F).
 * Picked plants grow back after FLOWER_RESPAWN_S seconds.
 */
import * as THREE from 'three';
import { mat, box } from './helpers.js';
import { FLOWERS, FLOWER_RESPAWN_S } from '../config.js';

const PLOT = { x: -42, z: 18, w: 16, d: 10 }; // x ∈ [-50,-34], z ∈ [13,23]

export function buildGarden(ctx) {
  const { scene, interactables, addBoxCollider, mapFeatures } = ctx;
  const plants = [];

  mapFeatures.push({ type: 'rect', x: PLOT.x, z: PLOT.z, w: PLOT.w, d: PLOT.d, color: '#3f8f4f' });
  mapFeatures.push({ type: 'emoji', x: PLOT.x, z: PLOT.z, text: '🌷', size: 10 });

  /* ---- low wooden fence with a gate gap on the east side ---- */
  const fenceMat = mat(0x9c7a4f);
  function fenceRun(cx, cz, w, d) {
    const rail = box(Math.max(w, 0.12), 0.1, Math.max(d, 0.12), fenceMat);
    rail.position.set(cx, 0.78, cz);
    scene.add(rail);
    const along = w > d ? 'x' : 'z';
    const len = Math.max(w, d);
    for (let o = -len / 2; o <= len / 2; o += 2) {
      const post = box(0.14, 0.85, 0.14, fenceMat);
      post.position.set(along === 'x' ? cx + o : cx, 0.42, along === 'x' ? cz : cz + o);
      scene.add(post);
    }
    addBoxCollider(cx, cz, Math.max(w, 0.3), Math.max(d, 0.3));
  }
  const x0 = PLOT.x - PLOT.w / 2, x1 = PLOT.x + PLOT.w / 2;
  const z0 = PLOT.z - PLOT.d / 2, z1 = PLOT.z + PLOT.d / 2;
  fenceRun(PLOT.x, z0, PLOT.w, 0);            // north
  fenceRun(PLOT.x, z1, PLOT.w, 0);            // south
  fenceRun(x0, PLOT.z, 0, PLOT.d);            // west
  fenceRun(x1, PLOT.z - 3.2, 0, 3.6);         // east, left of gate
  fenceRun(x1, PLOT.z + 3.2, 0, 3.6);         // east, right of gate (gap ≈ 2.8 in the middle)

  /* ---- sign at the gate ---- */
  {
    const post = box(0.14, 1.6, 0.14, fenceMat);
    post.position.set(x1 + 0.8, 0.8, PLOT.z - 1.8);
    scene.add(post);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g2 = c.getContext('2d');
    g2.fillStyle = '#8a5a36';
    g2.fillRect(0, 0, 256, 64);
    g2.font = 'bold 30px "Segoe UI", sans-serif';
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.fillStyle = '#fff4dd';
    g2.fillText('Pick-a-Bloom 🌷', 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set(x1 + 0.8, 1.5, PLOT.z - 1.8);
    board.rotation.y = Math.PI / 2;
    scene.add(board);
  }

  /* ---- soil rows + pickable plants ---- */
  const soilMat = mat(0x4a3526);
  const stemMat = mat(0x3f7d3f);
  const flowerKeys = Object.keys(FLOWERS);
  const rows = [14.8, 17, 19.2, 21.4];

  rows.forEach((rz, row) => {
    const soil = box(13, 0.16, 1.2, soilMat);
    soil.position.set(PLOT.x, 0.08, rz);
    soil.receiveShadow = true;
    scene.add(soil);

    for (let i = 0; i < 6; i++) {
      const px = PLOT.x - 5.5 + i * 2.2;
      const key = flowerKeys[(row + i) % flowerKeys.length];
      const f = FLOWERS[key];

      const group = new THREE.Group();
      const stem = box(0.06, 0.5, 0.06, stemMat);
      stem.position.y = 0.25;
      stem.castShadow = false;
      group.add(stem);
      const head = box(key === 'sunflower' ? 0.3 : 0.22, key === 'sunflower' ? 0.3 : 0.22, 0.22, mat(f.color));
      head.position.y = 0.58;
      head.castShadow = false;
      group.add(head);
      if (key === 'sunflower' || key === 'daisy') {
        const center = box(0.12, 0.12, 0.06, mat(key === 'sunflower' ? 0x5e3a1e : 0xffd000));
        center.position.set(0, 0.58, 0.13);
        group.add(center);
      }
      group.position.set(px, 0.14, rz);
      scene.add(group);

      const plant = {
        flower: key,
        group,
        timer: 0,
        isUp() { return group.visible; },
        pick() { group.visible = false; plant.timer = FLOWER_RESPAWN_S; },
      };
      plants.push(plant);

      interactables.push({
        x: px, z: rz, radius: 1.15,
        label: `pick a ${f.name} ${f.emoji}`, type: 'pick',
        data: { plant },
        available: () => plant.isUp(),
      });
    }
  });

  /** regrow picked plants */
  function update(dt) {
    for (const p of plants) {
      if (!p.group.visible) {
        p.timer -= dt;
        if (p.timer <= 0) p.group.visible = true;
      }
    }
  }

  return { update };
}
