/** Small shared builders for world geometry. */
import * as THREE from 'three';

export const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

export function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Build a flower (stem + blocky head) at x,z. `y` is the ground height there. */
export function addFlower(scene, x, z, color, y = 0) {
  const stem = box(0.05, 0.32, 0.05, mat(0x3f7d3f));
  stem.position.set(x, y + 0.16, z);
  stem.castShadow = false;
  scene.add(stem);
  const head = box(0.14, 0.14, 0.14, mat(color));
  head.position.set(x, y + 0.36, z);
  head.castShadow = false;
  scene.add(head);
}
