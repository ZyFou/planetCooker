import * as THREE from "three";

/**
 * Planet walk controller (desktop only).
 * - Enter via enter({ bodyMesh, centerObject, startPoint })
 * - Update per-frame via update(delta)
 * - Exit via exit()
 *
 * It handles:
 * - Pointer-lock mouselook when left mouse is held (Esc to release)
 * - WASD/arrow keys for movement, Space to jump
 * - Gravity toward the current body's center and ground snapping
 * - Being carried by the planet's spin when grounded
 */
export function createPlanetWalkController({
  renderer,
  camera,
  controls,
  planetMesh,
  planetRoot,
  spinGroup,
  moonsGroup,
  params
}) {
  const state = {
    active: false,
    pointerLocked: false,
    looking: false,
    onGround: false,
    bodyMesh: null,
    centerObject: null, // function: () => THREE.Vector3
    height: 0.05,
    velocity: new THREE.Vector3(),
    wishMove: { forward: false, back: false, left: false, right: false, jump: false },
    yaw: 0,
    pitch: 0,
    forward: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    tmpA: new THREE.Vector3(),
    tmpB: new THREE.Vector3(),
    tmpC: new THREE.Vector3(),
    tmpQ: new THREE.Quaternion(),
    raycaster: new THREE.Raycaster(),
    lastMoveX: 0,
    lastMoveY: 0,
    cameraNearOriginal: camera.near
  };

  function isDesktop() {
    return window.innerWidth > 960; // mirrors isMobileLayout() logic
  }

  function getPlanetCenter(out) {
    return planetRoot.getWorldPosition(out);
  }

  function getMeshCenter(mesh, out) {
    return mesh.getWorldPosition(out);
  }

  function computeBodyRadius(mesh) {
    const sphere = mesh.geometry?.boundingSphere;
    const scale = mesh.scale?.x || 1;
    if (sphere) return Math.max(0.01, sphere.radius * scale);
    return Math.max(0.5, params?.radius || 1);
  }

  function pointerLockChange() {
    state.pointerLocked = document.pointerLockElement === renderer.domElement;
    if (!state.pointerLocked) state.looking = false;
  }

  function onMouseDown(e) {
    if (!state.active) return;
    if (e.button !== 0) return;
    if (!isDesktop()) return;
    try {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    } catch {}
    state.looking = true;
  }

  function onMouseUp(e) {
    if (!state.active) return;
    if (e.button !== 0) return;
    state.looking = false;
  }

  function onMouseMove(e) {
    if (!state.active || !state.looking) return;
    const sens = 0.0025; // radians per pixel
    const dx = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
    const dy = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
    state.yaw -= dx * sens;
    state.pitch -= dy * sens;
    const maxPitch = Math.PI / 2 - 0.1;
    state.pitch = Math.max(-maxPitch, Math.min(maxPitch, state.pitch));
  }

  function onKeyDown(e) {
    if (!state.active) return;
    switch (e.key) {
      case "w":
      case "ArrowUp":
        state.wishMove.forward = true; break;
      case "s":
      case "ArrowDown":
        state.wishMove.back = true; break;
      case "a":
      case "ArrowLeft":
        state.wishMove.left = true; break;
      case "d":
      case "ArrowRight":
        state.wishMove.right = true; break;
      case " ":
        state.wishMove.jump = true; break;
      default: break;
    }
  }

  function onKeyUp(e) {
    if (!state.active) return;
    switch (e.key) {
      case "w":
      case "ArrowUp":
        state.wishMove.forward = false; break;
      case "s":
      case "ArrowDown":
        state.wishMove.back = false; break;
      case "a":
      case "ArrowLeft":
        state.wishMove.left = false; break;
      case "d":
      case "ArrowRight":
        state.wishMove.right = false; break;
      case " ":
        state.wishMove.jump = false; break;
      default: break;
    }
  }

  function addListeners() {
    document.addEventListener("pointerlockchange", pointerLockChange);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
  }

  function removeListeners() {
    document.removeEventListener("pointerlockchange", pointerLockChange);
    renderer.domElement.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
  }

  function setInitialOrientation(up) {
    // Align forward with current camera direction projected onto tangent plane
    const dir = state.tmpA.copy(camera.getWorldDirection(state.tmpA)).normalize();
    dir.projectOnPlane(up).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1).projectOnPlane(up).normalize();
    state.forward.copy(dir);
    state.right.copy(state.tmpB.copy(up).cross(state.forward).normalize());
    // Derive yaw/pitch relative to this basis
    // Yaw rotates around up; pitch rotates around right
    // Approximate by zeroing initial yaw/pitch; forward bases already aligned
    state.yaw = 0;
    state.pitch = 0;
  }

  function updateOrientation(up) {
    // Recompute right from current forward/up basis
    state.forward.projectOnPlane(up).normalize();
    state.right.copy(state.tmpB.copy(up).cross(state.forward).normalize());
    // Apply yaw around up, then pitch around right
    if (state.yaw !== 0) state.forward.applyAxisAngle(up, state.yaw);
    if (state.pitch !== 0) state.forward.applyAxisAngle(state.right, state.pitch);
    // Reset incremental deltas (we apply them each frame)
    state.yaw = 0;
    state.pitch = 0;
    state.forward.projectOnPlane(up).normalize();
    state.right.copy(state.tmpB.copy(up).cross(state.forward).normalize());
  }

  function getSpinAngularVelocity() {
    // radians per second
    const w = Math.max(0, (params?.rotationSpeed || 0) * (params?.simulationSpeed || 1) * Math.PI * 2);
    // Axis in world (spin around local Y of spinGroup under tilt)
    const tilt = spinGroup?.parent; // tiltGroup
    const q = tilt ? tilt.getWorldQuaternion(state.tmpQ) : planetRoot.getWorldQuaternion(state.tmpQ);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
    return { axis, w };
  }

  function applySpinCarry(pos, center, up, dt) {
    if (!state.onGround) return;
    const { axis, w } = getSpinAngularVelocity();
    if (w <= 1e-6) return;
    const r = state.tmpA.copy(pos).sub(center);
    const omega = axis.multiplyScalar(w);
    const carry = state.tmpB.copy(omega).cross(r); // v = ω × r
    pos.addScaledVector(carry, dt);
  }

  function snapToGround(pos, up) {
    // Cast slightly above the head down towards center to find the surface
    const origin = state.tmpA.copy(pos).addScaledVector(up, state.height * 0.5);
    const dir = state.tmpB.copy(up).multiplyScalar(-1);
    state.raycaster.set(origin, dir);
    state.raycaster.far = state.height * 3 + 2;
    const hits = state.raycaster.intersectObject(state.bodyMesh, false);
    if (hits.length > 0) {
      const ground = hits[0].point;
      const toGround = origin.distanceTo(ground) - state.height * 0.5;
      if (toGround <= state.height * 0.6) {
        // Considered grounded
        state.onGround = true;
        // Cancel downward velocity
        const vDown = state.velocity.dot(up) < 0 ? state.velocity.dot(up) : 0;
        if (vDown < 0) state.velocity.addScaledVector(up, -vDown);
        pos.copy(ground).addScaledVector(up, state.height);
        return;
      }
    }
    state.onGround = false;
  }

  function applyMovement(pos, up, dt) {
    // Movement along tangent plane
    const move = state.tmpA.set(0, 0, 0);
    if (state.wishMove.forward) move.add(state.forward);
    if (state.wishMove.back) move.addScaledVector(state.forward, -1);
    if (state.wishMove.left) move.addScaledVector(state.right, -1);
    if (state.wishMove.right) move.add(state.right);
    move.projectOnPlane(up);
    if (move.lengthSq() > 1e-6) move.normalize();

    const baseSpeed = Math.max(0.2, (params?.radius || 1) * 0.35);
    const accel = baseSpeed * 6; // quick responsiveness
    const friction = state.onGround ? 6.5 : 0.8;

    // Accelerate toward desired velocity on tangent plane
    const desiredVel = state.tmpB.copy(move).multiplyScalar(baseSpeed);
    const currentTangential = state.tmpC.copy(state.velocity).projectOnPlane(up);
    const toAdd = desiredVel.addScaledVector(currentTangential, -1);
    state.velocity.addScaledVector(toAdd, Math.min(1, accel * dt));

    // Jump
    if (state.onGround && state.wishMove.jump) {
      const jumpSpeed = Math.max(0.6, (params?.radius || 1) * 0.45);
      state.velocity.addScaledVector(up, jumpSpeed);
      state.onGround = false;
    }

    // Gravity toward center
    const gravity = Math.max(2.5, (params?.gravity || 9.81) * 0.4);
    state.velocity.addScaledVector(up, -gravity * dt);

    // Friction (damp overall velocity when grounded)
    if (state.onGround) state.velocity.multiplyScalar(Math.max(0, 1 - friction * dt));

    // Integrate
    pos.addScaledVector(state.velocity, dt);
  }

  function updateCamera(pos, up) {
    camera.position.copy(pos);
    const lookTarget = state.tmpA.copy(pos).add(state.forward);
    camera.lookAt(lookTarget);
  }

  function enter({ bodyMesh, centerObject, startPoint }) {
    if (!isDesktop()) return false;
    state.bodyMesh = bodyMesh || planetMesh;
    state.centerObject = centerObject || (() => getPlanetCenter(state.tmpA));

    const center = state.centerObject(state.tmpA);
    const up = state.up.copy(startPoint).sub(center).normalize();
    const baseRadius = computeBodyRadius(state.bodyMesh);
    state.height = Math.max(0.06, Math.max(camera.near * 2.5, baseRadius * 0.06));

    // Place camera slightly above the surface along normal (use hit point as surface)
    const startPos = state.tmpB.copy(startPoint).addScaledVector(up, state.height);
    camera.position.copy(startPos);
    setInitialOrientation(up);
    state.velocity.set(0, 0, 0);
    state.onGround = true;
    state.active = true;

    // Reduce near plane to avoid ground clipping
    state.cameraNearOriginal = camera.near;
    camera.near = Math.min(camera.near, 0.02);
    camera.updateProjectionMatrix();

    if (controls) controls.enabled = false;
    addListeners();
    return true;
  }

  function exit() {
    if (!state.active) return;
    state.active = false;
    state.looking = false;
    try {
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    } catch {}
    removeListeners();
    // Restore camera near
    if (state.cameraNearOriginal != null) {
      camera.near = state.cameraNearOriginal;
      camera.updateProjectionMatrix();
    }
    if (controls) controls.enabled = true;
  }

  function update(delta) {
    if (!state.active) return;
    const dt = Math.min(0.033, Math.max(0.0001, delta));

    // Recompute frame-space basis
    const center = state.centerObject(state.tmpA);
    const pos = state.tmpB.copy(camera.position);
    const up = state.up.copy(pos).sub(center).normalize();

    updateOrientation(up);
    applySpinCarry(pos, center, up, dt);
    applyMovement(pos, up, dt);
    snapToGround(pos, up);
    updateCamera(pos, up);
  }

  return { enter, exit, update, get active() { return state.active; } };
}

