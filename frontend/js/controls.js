import * as THREE from 'three';

const PLAYER_RADIUS = 0.38;
const WALK_SPEED = 4.2;
const RUN_SPEED = 8;
const GRAVITY = 22;
const JUMP_VELOCITY = 8;
const WORLD_RADIUS = 180;

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
    this.enabled = false;

    this.yaw = Math.PI;
    this.pitch = 0.34;
    this.dist = 6;
    this._camPos = new THREE.Vector3(0, 4, 9);
    this._ray = new THREE.Raycaster();

    this.keys = {};
    window.addEventListener('keydown', (e) => {
      if (this.isTyping()) return;
      this.keys[e.code] = true;
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
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === dom) {
        this.yaw -= e.movementX * 0.0032;
        this.pitch = THREE.MathUtils.clamp(this.pitch + e.movementY * 0.0028, -0.5, 1.25);
      } else if (dragging) {
        this.yaw -= (e.clientX - lx) * 0.0055;
        this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - ly) * 0.0045, -0.5, 1.25);
        lx = e.clientX; ly = e.clientY;
      }
    });
    dom.addEventListener('wheel', (e) => {
      this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.004, 2.5, 12);
    }, { passive: true });
  }

  setSpawn(x, z, ry) {
    this.pos.set(x, 0, z);
    this.ry = ry;
    this.yaw = ry;
  }

  /** Sit or lie at a fixed spot. y is the absolute root height for the pose. */
  sitAt({ x, z, y, ry, exit }, anim = 'sit') {
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
    this.pos.set(e.x, 0, e.z);
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

        const running = this.keys.ShiftLeft || this.keys.ShiftRight;
        const target = move.lengthSq() > 0 ? (running ? RUN_SPEED : WALK_SPEED) : 0;
        this.speed += (target - this.speed) * Math.min(1, dt * 10);
        if (this.speed < 0.05) this.speed = 0;

        if (move.lengthSq() > 0) {
          move.normalize();
          this.pos.addScaledVector(move, this.speed * dt);
          // face the direction of travel (shortest-arc lerp)
          const targetRy = Math.atan2(move.x, move.z);
          let d = ((targetRy - this.ry + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          this.ry += d * Math.min(1, dt * 12);
        }

        // jump + gravity
        if (this.keys.Space && this.grounded) {
          this.vy = JUMP_VELOCITY;
          this.grounded = false;
        }
        this.vy -= GRAVITY * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }

        this._collide();

        // world bounds
        const d2 = Math.hypot(this.pos.x, this.pos.z);
        if (d2 > WORLD_RADIUS) {
          this.pos.x *= WORLD_RADIUS / d2;
          this.pos.z *= WORLD_RADIUS / d2;
        }

        this.anim = !this.grounded ? 'jump'
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
    // never sink below the ground plane — the world isn't visible from underneath
    desired.y = Math.max(desired.y, 0.3);
    this._camPos.lerp(desired, Math.min(1, dt * 10));
    this._camPos.y = Math.max(this._camPos.y, 0.3);
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
