/**
 * World composition root — builds sky + house + nature + city + secrets +
 * traffic, sharing one context (colliders, camera blockers, interactables,
 * minimap features).
 *
 * To add a new area: create a module like city.js, give it the ctx, and call
 * its update() below if it needs per-frame work.
 */
import { mulberry32, WORLD_SEED } from './rng.js';
import { createSky } from './sky.js';
import { buildHouse } from './house.js';
import { buildNature } from './nature.js';
import { buildCity } from './city.js';
import { buildSecrets } from './secrets.js';
import { buildGarden } from './garden.js';
import { createTraffic } from './traffic.js';

export function createWorld(scene) {
  const rng = mulberry32(WORLD_SEED);

  const ctx = {
    scene,
    rng,
    /** {type:'box',minX,maxX,minZ,maxZ} | {type:'circle',x,z,r} */
    colliders: [],
    /** meshes the third-person camera must not clip through */
    cameraBlockers: [],
    /** {x,z,radius,label,type,data} — things the player can press E on */
    interactables: [],
    /** shapes the minimap draws: rect / circle / emoji (secret places stay off it!) */
    mapFeatures: [],
    addBoxCollider(cx, cz, w, d) {
      ctx.colliders.push({ type: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    },
  };

  const sky = createSky(scene, rng);
  const house = buildHouse(ctx);
  const nature = buildNature(ctx);
  const city = buildCity(ctx);
  const secrets = buildSecrets(ctx);
  const garden = buildGarden(ctx);
  const traffic = createTraffic(scene);

  /** Advance the whole environment; returns night ∈ [0,1]. */
  function update(t, dt, playerPos) {
    const night = sky.update(t, dt, playerPos);
    house.update(night, playerPos);
    nature.update(night, dt);
    city.update(night);
    secrets.update(night);
    garden.update(dt);
    traffic.update(dt, night);
    return night;
  }

  return {
    colliders: ctx.colliders,
    cameraBlockers: ctx.cameraBlockers,
    interactables: ctx.interactables,
    mapFeatures: ctx.mapFeatures,
    update,
    isInsideHouse: house.isInsideHouse,
  };
}
