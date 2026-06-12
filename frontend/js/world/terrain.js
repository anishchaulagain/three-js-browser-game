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
export const TOWER = { x: 40, z: 300 };                       // Tower of Love (obby)

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
  { x: TOWER.x, z: TOWER.z, r: 24, blend: 26, h: 0 },
];

/** drivable country roads (built by roads.js). The terrain flattens laterally
    under each corridor in heightAt(), so the car rides them smoothly. */
export const ROADS = [
  [{ x: 52, z: 70 }, { x: 196, z: 70 }],                            // East Drive: city → Sunset Park
  [{ x: 160, z: 70 }, { x: 170, z: 140 }, { x: 150, z: 200 }],      // Duck Pond Lane
  [{ x: -52, z: 70 }, { x: -140, z: 88 }, { x: -192, z: 100 }],     // West Drive: city → Crystal Lake
  [{ x: -140, z: 88 }, { x: -212, z: -78 }],                        // Windmill Way
  [{ x: 150, z: 200 }, { x: 66, z: 288 }],                          // Tower Road
];
const ROAD_HALF = 4;     // flat half-width of the corridor
const ROAD_BLEND = 5;    // shoulder blend back into the wild

/** walking trails (terrain-following stone plates, built by landmarks.js) */
export const TRAILS = [
  [{ x: 8, z: -45 }, { x: -36, z: -150 }, { x: -188, z: -252 }],    // house → Whisper Peak hike
  [{ x: -192, z: 100 }, { x: -216, z: 112 }],                       // lake gate → jetty
  [{ x: -212, z: -78 }, { x: -220, z: -90 }],                       // windmill gate → tulips
  [{ x: 150, z: 200 }, { x: 162, z: 208 }],                         // pond gate → duck pond
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

/** ground height before road corridors are carved in */
function baseHeightAt(x, z) {
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

/* Each road gets a precomputed, longitudinally-smoothed elevation profile so
   it grades gently over the hills instead of copying every bump. Computed
   once at load from the same deterministic base terrain. */
const PROFILE_STEP = 6;
const ROAD_GEOM = ROADS.map((road) => {
  const segs = [];
  let total = 0;
  for (let i = 0; i < road.length - 1; i++) {
    const a = road[i], b = road[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    segs.push({ ax: a.x, az: a.z, dx, dz, len, len2: dx * dx + dz * dz, startD: total });
    total += len;
  }
  // base heights sampled uniformly along the whole polyline…
  const n = Math.ceil(total / PROFILE_STEP);
  const heights = [];
  for (let s = 0; s <= n; s++) {
    const d = (s / n) * total;
    const seg = segs.find((sg) => d <= sg.startD + sg.len) || segs[segs.length - 1];
    const t = (d - seg.startD) / seg.len;
    heights.push(baseHeightAt(seg.ax + seg.dx * t, seg.az + seg.dz * t));
  }
  // …then smoothed with a few moving-average passes (≈ ±20 m window)
  for (let pass = 0; pass < 3; pass++) {
    const src = heights.slice();
    for (let i = 0; i < heights.length; i++) {
      let sum = 0, cnt = 0;
      for (let k = -2; k <= 2; k++) {
        if (src[i + k] !== undefined) { sum += src[i + k]; cnt++; }
      }
      heights[i] = sum / cnt;
    }
  }
  return { segs, total, heights };
});

function profileHeight(geom, d) {
  const f = Math.min(1, Math.max(0, d / geom.total)) * (geom.heights.length - 1);
  const i = Math.floor(f);
  const a = geom.heights[i], b = geom.heights[Math.min(i + 1, geom.heights.length - 1)];
  return a + (b - a) * (f - i);
}

/** ground height at any world position. Near a road the terrain flattens
    laterally toward the road's smoothed elevation profile, giving a level,
    gently-graded surface across the corridor (rounded caps at dead ends). */
export function heightAt(x, z) {
  let h = baseHeightAt(x, z);
  let best = Infinity, bestGeom = null, bestD = 0;
  for (const geom of ROAD_GEOM) {
    for (const sg of geom.segs) {
      const t = Math.max(0, Math.min(1, ((x - sg.ax) * sg.dx + (z - sg.az) * sg.dz) / sg.len2));
      const d = Math.hypot(x - (sg.ax + sg.dx * t), z - (sg.az + sg.dz * t));
      if (d < best) { best = d; bestGeom = geom; bestD = sg.startD + sg.len * t; }
    }
  }
  if (best < ROAD_HALF + ROAD_BLEND) {
    const target = profileHeight(bestGeom, bestD);
    const t = best <= ROAD_HALF ? 0 : smooth((best - ROAD_HALF) / ROAD_BLEND);
    h = target + (h - target) * t;
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
  if (Math.hypot(x - TOWER.x, z - TOWER.z) < 28) return false;        // Tower of Love
  for (const trail of TRAILS) {
    for (let i = 0; i < trail.length - 1; i++) {
      if (distToSeg(x, z, trail[i], trail[i + 1]) < 3.2) return false;
    }
  }
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      if (distToSeg(x, z, road[i], road[i + 1]) < ROAD_HALF + ROAD_BLEND + 1.5) return false;
    }
  }
  return true;
}
