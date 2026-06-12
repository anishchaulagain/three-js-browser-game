/**
 * Terrain — the single source of truth for the shape of the expanded world.
 *
 * heightAt(x, z) is pure, deterministic math (integer-hash value noise +
 * gaussian mountains + flat "pads"), so the renderer, the player physics,
 * the car and BOTH clients all agree on the ground without ever raycasting.
 *
 * The original hand-built world (house, city, secrets…) sits on a flat core
 * pad of radius 200, so everything that existed before the expansion is
 * untouched at y = 0. Hills fade in beyond it.
 */
import { WORLD_SEED } from './rng.js';

export const WORLD_RADIUS = 400;

/* ---- named places in the expansion ring (used by landmarks + minimap) ---- */
export const PARK = { x: 240, z: 70, r: 46 };                 // Sunset Park
export const LAKE = { x: -255, z: 115, r: 44 };               // Crystal Lake (water radius)
export const JETTY = { x: -224, z: 113 };                     // stone causeway into the lake
export const WINDMILL = { x: -225, z: -95, h: 7 };            // tulip windmill on its hill
export const PONDS = [
  { x: 170, z: 215, r: 10 },                                  // duck pond
  { x: -95, z: 265, r: 8 },                                   // quiet pond
];
export const SUMMIT = { x: -200, z: -265 };                   // Whisper Peak marker

export const MOUNTAINS = [
  { x: -70, z: -310, h: 75, s: 55 },
  { x: 95, z: -330, h: 60, s: 48 },
  { x: -200, z: -265, h: 48, s: 42 },                         // Whisper Peak (climbable)
  { x: 230, z: -240, h: 42, s: 40 },
  { x: -310, z: -130, h: 34, s: 36 },
  { x: 315, z: -60, h: 30, s: 34 },
];

/** flat pads: inside r the ground is exactly h; it blends back to wild terrain
    over the next `blend` metres. Order matters — later pads win locally. */
const PADS = [
  { x: 0, z: 0, r: 200, blend: 70, h: 0 },                    // original world core
  { x: PARK.x, z: PARK.z, r: 52, blend: 36, h: 0 },
  { x: LAKE.x, z: LAKE.z, r: 46, blend: 20, h: -1.4 },        // lake bed (water sits at −0.28)
  { x: JETTY.x, z: JETTY.z, r: 8, blend: 7, h: 0.35 },        // walkable causeway over the bed
  { x: WINDMILL.x, z: WINDMILL.z, r: 16, blend: 34, h: WINDMILL.h },
  { x: PONDS[0].x, z: PONDS[0].z, r: 13, blend: 14, h: -0.9 },
  { x: PONDS[1].x, z: PONDS[1].z, r: 11, blend: 14, h: -0.9 },
];

/** walking trails (terrain-following stone plates, built by landmarks.js) */
export const TRAILS = [
  [{ x: 58, z: 70 }, { x: 196, z: 70 }],                            // city → park promenade
  [{ x: -58, z: 70 }, { x: -140, z: 88 }, { x: -210, z: 110 }],     // city → lake shore
  [{ x: -140, z: 88 }, { x: -212, z: -82 }],                        // fork → windmill hill
  [{ x: 8, z: -45 }, { x: -36, z: -150 }, { x: -188, z: -252 }],    // house → Whisper Peak
];

/* ---- deterministic noise (identical on every browser/client) ---- */
function hash(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) ^ WORLD_SEED;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** value noise ∈ [0,1), feature size ≈ `scale` metres */
export function noise2(x, z, scale) {
  const gx = x / scale, gz = z / scale;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = smooth(gx - ix), fz = smooth(gz - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** ground height at any world position */
export function heightAt(x, z) {
  // rolling hills: one broad octave + one detail octave
  let h = (noise2(x, z, 95) - 0.5) * 14 + (noise2(x + 53, z - 71, 34) - 0.5) * 4.5;
  for (const m of MOUNTAINS) {
    const dx = x - m.x, dz = z - m.z;
    h += m.h * Math.exp(-(dx * dx + dz * dz) / (2 * m.s * m.s));
  }
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d >= p.r + p.blend) continue;
    const t = d <= p.r ? 0 : smooth((d - p.r) / p.blend);
    h = p.h + (h - p.h) * t;
  }
  return h;
}

/** terrain gradient (∂h/∂x, ∂h/∂z) — for normals, ground tint and slope rules */
export function gradientAt(x, z) {
  const e = 1.2;
  return {
    dx: (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e),
    dz: (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e),
  };
}

function distToSeg(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

/** keep the wild chunk scatter (trees, rocks…) out of the designed places */
export function scatterClear(x, z) {
  if (x > 192 && x < 290 && z > 32 && z < 108) return false;          // Sunset Park
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < 56) return false;          // lake + beach
  if (Math.hypot(x - WINDMILL.x, z - WINDMILL.z) < 20) return false;  // windmill hill
  for (const p of PONDS) if (Math.hypot(x - p.x, z - p.z) < p.r + 8) return false;
  if (Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < 9) return false;       // summit cairn
  for (const trail of TRAILS) {
    for (let i = 0; i < trail.length - 1; i++) {
      if (distToSeg(x, z, trail[i], trail[i + 1]) < 3.2) return false;
    }
  }
  return true;
}
