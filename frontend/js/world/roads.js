/**
 * Country roads — drivable asphalt out to the landmark places.
 *
 * Each road in terrain.ROADS becomes a terrain-conforming ribbon mesh
 * (heightAt already flattens the ground laterally under the corridor, so the
 * surface is level across its width), with dashed center lines packed into a
 * single InstancedMesh, a turnaround circle at every dead end, and little
 * wooden signposts at the junctions.
 *
 *   East Drive    city → Sunset Park 🌳
 *   Duck Pond Ln  East Drive → the duck pond 🦆
 *   West Drive    city → Crystal Lake 🌊
 *   Windmill Way  West Drive → the windmill 🌷
 */
import * as THREE from 'three';
import { mat, box } from './helpers.js';
import { heightAt, ROADS } from './terrain.js';

const WIDTH = 6;          // matches the city streets
const STEP = 3;           // ribbon sample spacing along the centerline
const LIFT = 0.07;        // sits just above the terrain (city road tops are 0.05)

export function buildRoads(ctx) {
  const { scene, mapFeatures } = ctx;
  const roadMat = mat(0x3b3b42);
  const dashMat = mat(0xd8c94f);

  /* resample a polyline every STEP metres */
  function samplePath(points) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.ceil(len / STEP);
      for (let s = (i === 0 ? 0 : 1); s <= n; s++) {
        const t = s / n;
        out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    return out;
  }

  /* one terrain-conforming ribbon per road */
  function buildRibbon(points) {
    const path = samplePath(points);
    const pos = new Float32Array(path.length * 2 * 3);
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const prev = path[Math.max(0, i - 1)], next = path[Math.min(path.length - 1, i + 1)];
      const dl = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
      const nx = -(next.z - prev.z) / dl, nz = (next.x - prev.x) / dl; // lateral normal
      for (const side of [0, 1]) {
        const sgn = side === 0 ? -1 : 1;
        const wx = p.x + nx * sgn * (WIDTH / 2), wz = p.z + nz * sgn * (WIDTH / 2);
        const o = (i * 2 + side) * 3;
        pos[o] = wx; pos[o + 1] = heightAt(wx, wz) + LIFT; pos[o + 2] = wz;
      }
    }
    const idx = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c, c, b, d); // CCW seen from above — faces point up
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, roadMat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return path;
  }

  /* dashed center line for every road, one InstancedMesh total */
  const dashes = [];
  function collectDashes(path) {
    let travelled = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      travelled += Math.hypot(b.x - a.x, b.z - a.z);
      if (travelled < 4.5) continue;
      travelled = 0;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      dashes.push({ x: mx, y: heightAt(mx, mz) + LIFT + 0.012, z: mz, ry: Math.atan2(b.x - a.x, b.z - a.z) });
    }
  }

  function turnaround(p) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(6.5, 24), roadMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(p.x, heightAt(p.x, p.z) + LIFT - 0.005, p.z);
    disc.receiveShadow = true;
    scene.add(disc);
  }

  function signpost(x, z, lines) {
    const y = heightAt(x, z);
    const pole = box(0.14, 2.4, 0.14, mat(0x6f4e37));
    pole.position.set(x, y + 1.2, z);
    scene.add(pole);
    lines.forEach((line, i) => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 48;
      const g = c.getContext('2d');
      g.fillStyle = '#7a5230';
      g.fillRect(0, 0, 256, 48);
      g.font = 'bold 26px "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#fdf6ec';
      g.fillText(line.text, 128, 26);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.42, 0.08),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
      board.position.set(x, y + 2.1 - i * 0.55, z);
      board.rotation.y = line.face;
      scene.add(board);
    });
    ctx.colliders.push({ type: 'circle', x, z, r: 0.22 });
  }

  for (const road of ROADS) {
    const path = buildRibbon(road);
    collectDashes(path);
    for (let i = 0; i < road.length - 1; i++) {
      mapFeatures.push({
        type: 'line',
        x1: road[i].x, z1: road[i].z, x2: road[i + 1].x, z2: road[i + 1].z,
        w: WIDTH, color: '#4c4c55',
      });
    }
  }

  // dead ends get a loop to swing the car around
  turnaround({ x: 150, z: 200 });   // Duck Pond Lane / Tower Road junction
  turnaround({ x: -192, z: 100 });  // West Drive (lake gate)
  turnaround({ x: -212, z: -78 });  // Windmill Way
  turnaround({ x: 66, z: 288 });    // Tower of Love gate

  // junction signposts
  signpost(160, 64.5, [
    { text: 'Sunset Park 🌳 →', face: Math.PI / 2 },
    { text: '← Duck Pond 🦆', face: -Math.PI / 2 },
  ]);
  signpost(143, 207, [
    { text: 'Tower of Love 🗼 →', face: Math.PI / 4 },
  ]);
  signpost(-134, 82, [
    { text: '← Crystal Lake 🌊', face: Math.PI / 2 },
    { text: 'Windmill 🌷 →', face: Math.PI },
  ]);

  {
    const geo = new THREE.BoxGeometry(0.18, 0.025, 1.6);
    const mesh = new THREE.InstancedMesh(geo, dashMat, dashes.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    dashes.forEach((d, i) => {
      e.set(0, d.ry, 0);
      q.setFromEuler(e);
      p.set(d.x, d.y, d.z);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
    });
    scene.add(mesh);
  }
}
