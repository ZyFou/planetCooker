import * as THREE from "three";

const MOBILE_REGEX = /Mobi|Android|iPhone|iPad|iPod/i;

function clampPitch(value) {
  const limit = THREE.MathUtils.degToRad(85);
  return THREE.MathUtils.clamp(value, -limit, limit);
}

function getReferenceAxes(up) {
  const fallback = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, fallback);
  if (right.lengthSq() < 1e-6) {
    fallback.set(0, 0, 1);
    right.crossVectors(up, fallback);
  }
  right.normalize();
  const forward = new THREE.Vector3().crossVectors(right, up).normalize();
  return { forward, right };
}

export function createPlanetWalkController(options) {
  const {
    camera,
    renderer,
    planetMesh,
    planetRoot,
    spinGroup,
    getPlanetInfo
  } = options;

  const player = new THREE.Object3D();
  player.name = "PlanetWalkPlayer";

  const velocity = new THREE.Vector3();
  const tmpVec1 = new THREE.Vector3();
  const tmpVec2 = new THREE.Vector3();
  const tmpVec3 = new THREE.Vector3();
  const tmpVec4 = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();

  const surfaceRaycaster = new THREE.Raycaster();
  surfaceRaycaster.firstHitOnly = true;

  let active = false;
  let pointerLocked = false;
  let lookActive = false;
  let yaw = 0;
  let pitch = 0;
  let grounded = false;
  let jumpQueued = false;
  let exitCallback = null;
  let storedCameraNear = camera.near;

  const inputState = {
    forward: false,
    backward: false,
    left: false,
    right: false
  };

  const cameraCache = {
    position: new THREE.Vector3(),
    up: new THREE.Vector3(),
    look: new THREE.Vector3()
  };

  function isMobile() {
    return MOBILE_REGEX.test(window.navigator?.userAgent || "");
  }

  function currentPlanetInfo() {
    if (typeof getPlanetInfo === "function") return getPlanetInfo();
    return { radius: 1, gravity: 9.81 };
  }

  function resetInput() {
    inputState.forward = false;
    inputState.backward = false;
    inputState.left = false;
    inputState.right = false;
    jumpQueued = false;
  }

  function detachListeners() {
    const canvas = renderer?.domElement;
    if (!canvas) return;
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("mouseup", handleMouseUp);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("pointerlockchange", handlePointerLockChange);
    document.removeEventListener("pointerlockerror", handlePointerLockError);
  }

  function attachListeners() {
    const canvas = renderer?.domElement;
    if (!canvas) return;
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("pointerlockerror", handlePointerLockError);
  }

  function handlePointerLockChange() {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    if (!pointerLocked) lookActive = false;
  }

  function handlePointerLockError() {
    pointerLocked = false;
    lookActive = false;
  }

  function handleMouseDown(event) {
    if (!active) return;
    if (event.button !== 0) return;
    lookActive = true;
    renderer.domElement.requestPointerLock?.();
    event.preventDefault();
  }

  function handleMouseUp(event) {
    if (!active) return;
    if (event.button !== 0) return;
    lookActive = false;
    if (pointerLocked) {
      document.exitPointerLock?.();
    }
    event.preventDefault();
  }

  function handleMouseMove(event) {
    if (!active || !lookActive || !pointerLocked) return;
    const sensitivity = 0.0024;
    yaw -= event.movementX * sensitivity;
    pitch -= event.movementY * sensitivity;
    pitch = clampPitch(pitch);
  }

  function queueJump() {
    if (!grounded) return;
    jumpQueued = true;
  }

  function handleKeyDown(event) {
    if (!active) return false;
    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        inputState.forward = true;
        event.preventDefault();
        return true;
      case "KeyS":
      case "ArrowDown":
        inputState.backward = true;
        event.preventDefault();
        return true;
      case "KeyA":
      case "ArrowLeft":
        inputState.left = true;
        event.preventDefault();
        return true;
      case "KeyD":
      case "ArrowRight":
        inputState.right = true;
        event.preventDefault();
        return true;
      case "Space":
        queueJump();
        event.preventDefault();
        return true;
      case "Escape":
        event.preventDefault();
        exit();
        return true;
      default:
        break;
    }
    return false;
  }

  function handleKeyUp(event) {
    if (!active) return false;
    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        inputState.forward = false;
        event.preventDefault();
        return true;
      case "KeyS":
      case "ArrowDown":
        inputState.backward = false;
        event.preventDefault();
        return true;
      case "KeyA":
      case "ArrowLeft":
        inputState.left = false;
        event.preventDefault();
        return true;
      case "KeyD":
      case "ArrowRight":
        inputState.right = false;
        event.preventDefault();
        return true;
      default:
        break;
    }
    return false;
  }

  function computeSurfacePoint(center, direction) {
    planetMesh.updateMatrixWorld(true);
    surfaceRaycaster.ray.origin.copy(center);
    surfaceRaycaster.ray.direction.copy(direction).normalize();
    surfaceRaycaster.near = 0;
    surfaceRaycaster.far = 1e4;
    const hits = surfaceRaycaster.intersectObject(planetMesh, false);
    if (hits.length > 0) {
      return hits[0].point.clone();
    }
    const { radius } = currentPlanetInfo();
    const fallbackRadius = planetMesh.geometry?.boundingSphere?.radius || 1;
    const r = Math.max(0.1, radius || fallbackRadius);
    return center.clone().addScaledVector(direction, r);
  }

  function syncCameraToPlayer() {
    if (!active) return;
    player.updateMatrixWorld(true);
    const worldPos = player.getWorldPosition(tmpVec1);
    const center = planetRoot.getWorldPosition(tmpVec2);
    const up = tmpVec3.copy(worldPos).sub(center).normalize();
    const { forward: refForward, right: refRight } = getReferenceAxes(up);

    const yawQuat = tmpQuat.setFromAxisAngle(up, yaw);
    const rotatedForward = refForward.clone().applyQuaternion(yawQuat).normalize();
    const right = new THREE.Vector3().crossVectors(rotatedForward, up).normalize();
    const pitchQuat = tmpQuat.setFromAxisAngle(right, pitch);
    const lookDir = rotatedForward.applyQuaternion(pitchQuat).normalize();

    cameraCache.position.copy(worldPos);
    cameraCache.up.copy(up);
    cameraCache.look.copy(lookDir);

    camera.position.copy(cameraCache.position);
    camera.up.copy(cameraCache.up);
    camera.lookAt(tmpVec4.copy(cameraCache.position).add(cameraCache.look));
  }

  function enter({ onExit } = {}) {
    if (active) return false;
    if (!renderer || !camera || !planetMesh || !planetRoot || !spinGroup) return false;
    if (isMobile()) return false;

    spinGroup.updateMatrixWorld(true);
    planetMesh.updateMatrixWorld(true);
    planetRoot.updateMatrixWorld(true);

    const { radius } = currentPlanetInfo();
    const origin = camera.getWorldPosition(tmpVec1);
    const forward = camera.getWorldDirection(tmpVec2).normalize();
    const center = planetRoot.getWorldPosition(tmpVec3);

    const pickRay = new THREE.Raycaster(origin, forward, 0, 1e4);
    const intersections = pickRay.intersectObject(planetMesh, false);
    let surfacePoint;
    if (intersections.length > 0) {
      surfacePoint = intersections[0].point.clone();
    } else {
      const towardCenter = center.clone().sub(origin).normalize();
      surfacePoint = computeSurfacePoint(center, towardCenter);
    }

    const up = tmpVec4.copy(surfacePoint).sub(center).normalize();
    const walkHeight = Math.max(0.02, (radius || 1) * 0.025);
    const startPos = surfacePoint.clone().addScaledVector(up, walkHeight);

    player.position.copy(spinGroup.worldToLocal(startPos.clone()));
    if (!spinGroup.children.includes(player)) {
      spinGroup.add(player);
    }

    const { forward: refForward, right: refRight } = getReferenceAxes(up);
    const fwdProjected = forward.clone().sub(up.clone().multiplyScalar(forward.dot(up)));
    if (fwdProjected.lengthSq() < 1e-6) {
      fwdProjected.copy(refForward);
    } else {
      fwdProjected.normalize();
    }
    const dotForward = THREE.MathUtils.clamp(fwdProjected.dot(refForward), -1, 1);
    const dotRight = THREE.MathUtils.clamp(fwdProjected.dot(refRight), -1, 1);
    yaw = Math.atan2(dotRight, dotForward);
    pitch = clampPitch(Math.asin(THREE.MathUtils.clamp(forward.dot(up), -0.99, 0.99)));

    velocity.set(0, 0, 0);
    grounded = false;
    jumpQueued = false;
    resetInput();

    storedCameraNear = camera.near;
    camera.near = Math.min(0.08, Math.max(0.01, (radius || 1) * 0.01));
    camera.updateProjectionMatrix();

    attachListeners();
    active = true;
    exitCallback = typeof onExit === "function" ? onExit : null;
    syncCameraToPlayer();

    return true;
  }

  function exit() {
    if (!active) return;
    detachListeners();
    document.exitPointerLock?.();
    pointerLocked = false;
    lookActive = false;
    resetInput();
    velocity.set(0, 0, 0);
    grounded = false;
    jumpQueued = false;
    camera.near = storedCameraNear;
    camera.updateProjectionMatrix();
    exitCallback?.();
    exitCallback = null;
    active = false;
  }

  function update(delta) {
    if (!active) return;
    spinGroup.updateMatrixWorld(true);
    planetMesh.updateMatrixWorld(true);
    planetRoot.updateMatrixWorld(true);

    player.updateMatrixWorld(true);
    const worldPos = player.getWorldPosition(tmpVec1);
    const center = planetRoot.getWorldPosition(tmpVec2);
    const up = tmpVec3.copy(worldPos).sub(center);
    const distance = up.length();
    if (distance < 1e-5) {
      up.set(0, 1, 0);
    } else {
      up.divideScalar(distance);
    }

    const { forward: refForward, right: refRight } = getReferenceAxes(up);
    const yawQuat = tmpQuat.setFromAxisAngle(up, yaw);
    const rotatedForward = refForward.clone().applyQuaternion(yawQuat).normalize();
    const right = new THREE.Vector3().crossVectors(rotatedForward, up).normalize();
    const pitchQuat = tmpQuat.setFromAxisAngle(right, pitch);
    const lookDir = rotatedForward.clone().applyQuaternion(pitchQuat).normalize();

    const tangentForward = lookDir.clone().sub(up.clone().multiplyScalar(lookDir.dot(up)));
    if (tangentForward.lengthSq() < 1e-6) {
      tangentForward.copy(refForward);
    } else {
      tangentForward.normalize();
    }
    const tangentRight = new THREE.Vector3().crossVectors(tangentForward, up).normalize();

    const moveDir = new THREE.Vector3();
    if (inputState.forward) moveDir.add(tangentForward);
    if (inputState.backward) moveDir.addScaledVector(tangentForward, -1);
    if (inputState.left) moveDir.addScaledVector(tangentRight, -1);
    if (inputState.right) moveDir.add(tangentRight);
    if (moveDir.lengthSq() > 1e-6) moveDir.normalize();

    const planetInfo = currentPlanetInfo();
    const gravityScale = Math.max(0.5, (planetInfo.gravity || 9.81) / 9.81);

    const acceleration = 2.4 * gravityScale;
    const maxSpeed = 1.2 * gravityScale;
    const jumpSpeed = 2.6 * gravityScale;
    const gravityStrength = 8.5 * gravityScale;
    const damping = Math.exp(-4.5 * delta);

    velocity.addScaledVector(moveDir, acceleration * delta);

    const tangential = velocity.clone().sub(up.clone().multiplyScalar(velocity.dot(up)));
    const tangentialSpeed = tangential.length();
    if (tangentialSpeed > maxSpeed) {
      tangential.multiplyScalar(maxSpeed / tangentialSpeed);
    }

    let vertical = up.clone().multiplyScalar(velocity.dot(up));
    if (jumpQueued) {
      vertical = up.clone().multiplyScalar(jumpSpeed);
      jumpQueued = false;
      grounded = false;
    } else {
      vertical.addScaledVector(up, -gravityStrength * delta);
    }

    tangential.multiplyScalar(Math.exp(-2.2 * delta));
    vertical.multiplyScalar(damping);

    velocity.copy(tangential.add(vertical));

    const newWorldPos = worldPos.clone().addScaledVector(velocity, delta);
    const newDir = newWorldPos.clone().sub(center);
    const newDistance = newDir.length();
    if (newDistance > 1e-5) {
      newDir.divideScalar(newDistance);
    } else {
      newDir.copy(up);
    }

    const surfacePoint = computeSurfacePoint(center, newDir);
    const surfaceDistance = surfacePoint.clone().sub(center).length();
    const headHeight = Math.max(0.02, (planetInfo.radius || 1) * 0.025);
    const minDistance = surfaceDistance + headHeight;
    if (newDistance < minDistance) {
      grounded = true;
      const correction = minDistance - newDistance;
      newWorldPos.addScaledVector(newDir, correction);
      const vDot = velocity.dot(newDir);
      if (vDot < 0) {
        velocity.addScaledVector(newDir, -vDot);
      }
    } else {
      grounded = false;
    }

    const localPos = spinGroup.worldToLocal(newWorldPos.clone());
    player.position.copy(localPos);

    syncCameraToPlayer();
  }

  return {
    enter,
    exit,
    update,
    syncCamera: syncCameraToPlayer,
    handleKeyDown,
    handleKeyUp,
    isActive: () => active
  };
}
