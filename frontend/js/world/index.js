/**
 * World composition root — builds sky + house + nature and exposes
 * one shared context (colliders, camera blockers, interactables).
 *
 * To add a new area (garden shed, beach, …): create a module like house.js,
 * give it the ctx, and call its update() below if it needs per-frame work.
 */
import { mulberry32, WORLD_SEED } from './rng.js';
import { createSky } from './sky.js';
import { buildHouse } from './house.js';
import { buildNature } from './nature.js';

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
    addBoxCollider(cx, cz, w, d) {
      ctx.colliders.push({ type: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    },
  };

  const sky = createSky(scene, rng);
  const house = buildHouse(ctx);
  const nature = buildNature(ctx);

  /** Advance the whole environment; returns night ∈ [0,1]. */
  function update(t, dt, playerPos) {
    const night = sky.update(t, dt, playerPos);
    house.update(night, playerPos);
    nature.update(night, dt);
    return night;
  }

  return {
    colliders: ctx.colliders,
    cameraBlockers: ctx.cameraBlockers,
    interactables: ctx.interactables,
    update,
    isInsideHouse: house.isInsideHouse,
  };
}
