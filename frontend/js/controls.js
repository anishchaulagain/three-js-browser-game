import * as THREE from 'three';
import { heightAt, WORLD_RADIUS } from './world/terrain.js';

const PLAYER_RADIUS = 0.38;
const WALK_SPEED = 4.2;
const RUN_SPEED = 8;
const CROUCH_SPEED = 1.9;
const GRAVITY = 22;
const JUMP_VELOCITY = 8;
const BOW_TIME = 1.3;

export class PlayerController {
  constructor(camera, dom, { colliders, cameraBlockers, isTyping, lockAllowed }) {
    this.camera = camera;
    this.colliders = colliders;
    this.blockers = cameraBlockers;
    this.isTyping = isTyping || (() => false);

    this.pos = new THREE.Vector3(0, 0, 3);
    this.ry = Math.PI;
    this.vy = 0;
    this.grounded = true;
    this.anim = 'idle';
    this.speed = 0;
    this.seated = null; // {exit:{x,z}, anim}
    this.vehicle = null; // {car, seat} — riding the couple car
    this.enabled = false;
    this.dancing = false;
    this.bowTimer = 0;

    this.yaw = Math.PI;
    this.pitch = 0.34;
    this.dist = 6;
    this.firstPerson = false;
    this._camPos = new THREE.Vector3(0, 4, 9);
    this._ray = new THREE.Raycaster();

    this.keys = {};
    window.addEventListener('keydown', (e) => {
      if (this.isTyping()) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyV' && this.enabled) this.firstPerson = !this.firstPerson;
      if (this.enabled && !this.seated && !this.vehicle) {
        if (e.code === 'KeyX') { this.dancing = !this.dancing; this.bowTimer = 0; }
        if (e.code === 'KeyB' && this.grounded) { this.bowTimer = BOW_TIME; this.dancing = false; }
      }
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });

    // --- free look via pointer lock: click the world once, then just move
    // the mouse; Esc (or opening any UI) releases the cursor ---
    this.lockAllowed = lockAllowed || (() => true);
    dom.addEventListener('click', () => {
      if (!this.enabled || this.isTyping() || !this.lockAllowed()) return;
      if (document.pointerLockElement !== dom) {
        try { dom.requestPointerLock(); } catch { /* not available — drag still works */ }
      }
    });

    // drag-look stays as a fallback when the pointer isn't locked
    let dragging = false, lx = 0, ly = 0;
    dom.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', () => { dragging = false; });
    // first person allows looking much further up
    const clampPitch = (p) => THREE.MathUtils.clamp(p, this.firstPerson ? -1.25 : -0.5, 1.25);
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === dom) {
        this.yaw -= e.movementX * 0.0032;
        this.pitch = clampPitch(this.pitch + e.movementY * 0.0028);
      } else if (dragging) {
        this.yaw -= (e.clientX - lx) * 0.0055;
        this.pitch = clampPitch(this.pitch + (e.clientY - ly) * 0.0045);
        lx = e.clientX; ly = e.clientY;
      }
    });
    // scrolling all the way in enters first person; scrolling out leaves it
    dom.addEventListener('wheel', (e) => {
      if (this.firstPerson) {
        if (e.deltaY > 0) { this.firstPerson = false; this.dist = 3; }
      } else {
        this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.004, 1.8, 12);
        if (this.dist < 2.1) { this.firstPerson = true; this.dist = 3; }
      }
    }, { passive: true });
  }

  setSpawn(x, z, ry) {
    this.pos.set(x, heightAt(x, z), z);
    this.ry = ry;
    this.yaw = ry;
  }

  /** Sit or lie at a fixed spot. y is the absolute root height for the pose. */
  sitAt({ x, z, y, ry, exit }, anim = 'sit') {
    this.dancing = false;
    this.bowTimer = 0;
    this.seated = { exit: exit || { x, z: z + 1 }, anim };
    this.pos.set(x, y, z);
    this.ry = ry || 0;
    this.vy = 0;
    this.anim = anim;
    this.speed = 0;
  }

  standUp() {
    if (!this.seated) return;
    const e = this.seated.exit;
    this.pos.set(e.x, heightAt(e.x, e.z), e.z);
    this.seated = null;
    this.anim = 'idle';
  }

  _moveInput() {
    const k = this.keys;
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const r = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    return { f, r };
  }

  update(dt) {
    if (this.enabled && this.vehicle) {
      // riding the car: position comes from the seat; WASD belongs to driving
      const sw = this.vehicle.car.seatWorld(this.vehicle.seat);
      this.pos.copy(sw);
      this.ry = this.vehicle.car.state.ry;
      this.dancing = false;
      this.bowTimer = 0;
      this.anim = 'sit';
      this.speed = 0;
      this.vy = 0;
      this.grounded = true;
      this._updateCamera(dt);
      return this.state();
    }

    if (this.enabled) {
      const { f, r } = this._moveInput();

      if (this.seated) {
        // any movement input stands you back up
        if (f || r || this.keys.Space) this.standUp();
      }

      if (!this.seated) {
        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const move = new THREE.Vector3()
          .addScaledVector(fwd, f)
          .addScaledVector(right, r);

        const crouching = this.keys.KeyC && this.grounded;
        if (move.lengthSq() > 0 || this.keys.Space) { this.dancing = false; this.bowTimer = 0; }
        if (this.bowTimer > 0) this.bowTimer -= dt;

        const running = (this.keys.ShiftLeft || this.keys.ShiftRight) && !crouching;
        const target = move.lengthSq() > 0 ? (crouching ? CROUCH_SPEED : running ? RUN_SPEED : WALK_SPEED) : 0;
        this.speed += (target - this.speed) * Math.min(1, dt * 10);
        if (this.speed < 0.05) this.speed = 0;

        if (move.lengthSq() > 0) {
          move.normalize();
          this.pos.addScaledVector(move, this.speed * dt);
        }
        if (this.firstPerson) {
          // in first person the body faces where you LOOK — the look direction
          // is opposite the camera-orbit yaw (which points behind the player)
          this.ry = this.yaw + Math.PI;
        } else if (move.lengthSq() > 0) {
          // face the direction of travel (shortest-arc lerp)
          const targetRy = Math.atan2(move.x, move.z);
          let d = ((targetRy - this.ry + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          this.ry += d * Math.min(1, dt * 12);
        }

        if (this.keys.Space && this.grounded) {
          this.vy = JUMP_VELOCITY;
          this.grounded = false;
        }

        this._collide();

        // world bounds
        const d2 = Math.hypot(this.pos.x, this.pos.z);
        if (d2 > WORLD_RADIUS) {
          this.pos.x *= WORLD_RADIUS / d2;
          this.pos.z *= WORLD_RADIUS / d2;
        }

        // gravity on rolling terrain
        const groundY = heightAt(this.pos.x, this.pos.z);
        if (this.grounded) {
          if (groundY >= this.pos.y - 0.65) this.pos.y = groundY; // stick to slopes
          else { this.grounded = false; this.vy = 0; }            // stepped off a ledge
        }
        if (!this.grounded) {
          this.vy -= GRAVITY * dt;
          this.pos.y += this.vy * dt;
          if (this.pos.y <= groundY) { this.pos.y = groundY; this.vy = 0; this.grounded = true; }
        }

        this.anim = !this.grounded ? 'jump'
          : this.bowTimer > 0 ? 'bow'
          : crouching ? 'crouch'
          : this.dancing ? 'dance'
          : this.speed > 0.2 ? (running && this.speed > WALK_SPEED + 0.5 ? 'run' : 'walk')
          : 'idle';
      }
    }

    this._updateCamera(dt);
    return this.state();
  }

  _collide() {
    const p = this.pos, r = PLAYER_RADIUS;
    for (const c of this.colliders) {
      if (c.type === 'box') {
        // skip if clearly outside the expanded box
        if (p.x < c.minX - r || p.x > c.maxX + r || p.z < c.minZ - r || p.z > c.maxZ + r) continue;
        // push out along the axis of least penetration
        const pushLeft = p.x - (c.minX - r);
        const pushRight = (c.maxX + r) - p.x;
        const pushBack = p.z - (c.minZ - r);
        const pushFront = (c.maxZ + r) - p.z;
        const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
        if (min === pushLeft) p.x = c.minX - r;
        else if (min === pushRight) p.x = c.maxX + r;
        else if (min === pushBack) p.z = c.minZ - r;
        else p.z = c.maxZ + r;
      } else {
        const dx = p.x - c.x, dz = p.z - c.z;
        const dist = Math.hypot(dx, dz), minDist = c.r + r;
        if (dist < minDist && dist > 0.0001) {
          p.x = c.x + (dx / dist) * minDist;
          p.z = c.z + (dz / dist) * minDist;
        }
      }
    }
  }

  _updateCamera(dt) {
    if (this.firstPerson) {
      if (this.anim === 'sleep') {
        // lying on your back: the sleep pose folds the body backward, so the
        // head rests behind the root, just above the pillow — gaze upward
        const fwd = new THREE.Vector3(Math.sin(this.ry), 0, Math.cos(this.ry));
        const eyes = new THREE.Vector3(this.pos.x, this.pos.y + 0.55, this.pos.z).addScaledVector(fwd, -1.55);
        this.camera.position.copy(eyes);
        this._camPos.copy(eyes);
        // tipped slightly toward the feet (a dead-vertical gaze has no 'up')
        this.camera.lookAt(eyes.x + fwd.x * 0.45, eyes.y + 1, eyes.z + fwd.z * 0.45);
        return;
      }
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const look = new THREE.Vector3(-Math.sin(this.yaw) * cp, -sp, -Math.cos(this.yaw) * cp);
      // eyes drop while crouched
      this._fpHead = (this._fpHead ?? 1.78) + ((this.anim === 'crouch' ? 1.32 : 1.78) - (this._fpHead ?? 1.78)) * Math.min(1, dt * 8);
      const head = new THREE.Vector3(this.pos.x, this.pos.y + this._fpHead, this.pos.z);
      this.camera.position.copy(head);
      this._camPos.copy(head); // keep the lerp state in sync for a smooth exit
      this.camera.lookAt(head.add(look));
      return;
    }
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const offset = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);

    // keep the camera out of walls and the roof (raycast hits both faces so
    // it also works from inside the house, where the camera pulls in close)
    let dist = this.dist;
    this._ray.set(target, offset.clone().normalize());
    this._ray.far = this.dist;
    const prevSides = [];
    const solid = this.blockers.filter((b) => b.visible);
    for (const b of solid) { prevSides.push(b.material.side); b.material.side = THREE.DoubleSide; }
    const hits = this._ray.intersectObjects(solid, false);
    solid.forEach((b, i) => { b.material.side = prevSides[i]; });
    if (hits.length) dist = Math.max(1.2, hits[0].distance - 0.3);

    const desired = target.clone().addScaledVector(offset, dist);
    // never sink below the terrain — the world isn't visible from underneath
    desired.y = Math.max(desired.y, heightAt(desired.x, desired.z) + 0.35);
    this._camPos.lerp(desired, Math.min(1, dt * 10));
    this._camPos.y = Math.max(this._camPos.y, heightAt(this._camPos.x, this._camPos.z) + 0.35);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(target);
  }

  state() {
    return {
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
      ry: this.ry, anim: this.anim, speed: this.speed,
    };
  }
}
