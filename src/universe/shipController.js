import * as THREE from "three";
import { clamp } from "./planetSampler.js";

const FORWARD = new THREE.Vector3(0, 0, -1);
const RIGHT = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

function createShipMesh() {
  const bodyGeometry = new THREE.ConeGeometry(0.6, 1.8, 6);
  bodyGeometry.rotateX(Math.PI / 2);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    emissive: 0x0077ff,
    emissiveIntensity: 1.4,
    metalness: 0.3,
    roughness: 0.25
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.castShadow = true;

  const glowGeometry = new THREE.ConeGeometry(0.8, 2.4, 6);
  glowGeometry.rotateX(Math.PI / 2);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x3fd3ff,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);

  const group = new THREE.Group();
  group.name = "Ship";
  group.add(body);
  group.add(glow);

  return { group, bodyGeometry, glowGeometry };
}

export class ShipController {
  constructor(camera, options = {}) {
    this.camera = camera;
    this.scene = options.scene ?? null;
    this.domElement = options.domElement ?? options.renderer?.domElement ?? null;
    this.pointerLockElement = this.domElement ?? (typeof document !== "undefined" ? document.body : null);

    this.position = options.initialPosition?.clone?.() ?? new THREE.Vector3(0, 0, 50);
    this.velocity = new THREE.Vector3();
    this.yaw = options.initialYaw ?? 0;
    this.pitch = options.initialPitch ?? 0;

    this.settings = {
      minSpeed: options.minSpeed ?? 20,
      baseSpeed: options.baseSpeed ?? 65,
      maxSpeed: options.maxSpeed ?? 320,
      accelerationMultiplier: options.accelerationMultiplier ?? 3.0,
      slowMultiplier: options.slowMultiplier ?? 0.3,
      mouseSensitivity: options.mouseSensitivity ?? 0.0022,
      cameraOffset: options.cameraOffset ?? new THREE.Vector3(0, 1.1, 2.4)
    };

    this.dash = {
      boost: 1.0,
      duration: 0,
      cooldown: 0
    };

    this.keys = new Set();
    this.isPointerLocked = false;
    this.enabled = true;

    const meshData = createShipMesh();
    this.ship = meshData.group;
    this._shipMeshes = meshData;
    this.ship.position.copy(this.position);

    if (this.scene) {
      this.scene.add(this.ship);
    }

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onClick = this._onClick.bind(this);

    if (typeof document !== "undefined") {
      document.addEventListener("keydown", this._onKeyDown);
      document.addEventListener("keyup", this._onKeyUp);
      document.addEventListener("pointerlockchange", this._onPointerLockChange);
      document.addEventListener("mousemove", this._onMouseMove);
      this.pointerLockElement?.addEventListener("click", this._onClick);
    }
  }

  dispose() {
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", this._onKeyDown);
      document.removeEventListener("keyup", this._onKeyUp);
      document.removeEventListener("pointerlockchange", this._onPointerLockChange);
      document.removeEventListener("mousemove", this._onMouseMove);
      this.pointerLockElement?.removeEventListener("click", this._onClick);
    }

    this.scene?.remove(this.ship);
    this._shipMeshes.bodyGeometry.dispose();
    this._shipMeshes.glowGeometry.dispose();
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    this.velocity.set(0, 0, 0);
  }

  setPosition(position) {
    this.position.copy(position);
    this.ship.position.copy(position);
  }

  setOrientation({ yaw, pitch }) {
    if (typeof yaw === "number") this.yaw = yaw;
    if (typeof pitch === "number") this.pitch = clamp(pitch, -Math.PI / 2, Math.PI / 2);
  }

  requestPointerLock() {
    const element = this.pointerLockElement;
    if (!element || !element.requestPointerLock) return;
    if (document.pointerLockElement !== element) {
      element.requestPointerLock();
    }
  }

  update(delta, context = {}) {
    if (!this.enabled) return;

    const { focusDistance = null } = context;

    const speedRange = this._computeDynamicSpeed(focusDistance);
    const targetSpeed = speedRange.current;

    const direction = this._computeMoveDirection();

    let speedMultiplier = 1.0;
    if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) {
      speedMultiplier = this.settings.accelerationMultiplier;
    } else if (this.keys.has("ControlLeft") || this.keys.has("ControlRight")) {
      speedMultiplier = this.settings.slowMultiplier;
    }

    if (this.dash.duration > 0) {
      speedMultiplier *= this.dash.boost;
      this.dash.duration -= delta;
      if (this.dash.duration <= 0) {
        this.dash.boost = 1.0;
      }
    }

    if (this.dash.cooldown > 0) {
      this.dash.cooldown = Math.max(0, this.dash.cooldown - delta);
    }

    const targetVelocity = direction.multiplyScalar(targetSpeed * speedMultiplier);
    this.velocity.lerp(targetVelocity, clamp(delta * 5, 0, 1));
    this.position.addScaledVector(this.velocity, delta);
    this.ship.position.copy(this.position);

    const euler = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    const quaternion = new THREE.Quaternion().setFromEuler(euler);
    const cameraOffset = this.settings.cameraOffset.clone().applyQuaternion(quaternion);

    this.camera.position.copy(this.position).add(cameraOffset);
    this.camera.quaternion.copy(quaternion);

    this.ship.quaternion.copy(quaternion);
  }

  triggerDash() {
    if (this.dash.cooldown > 0) return;
    this.dash.boost = 3.0;
    this.dash.duration = 0.35;
    this.dash.cooldown = 2.0;
  }

  _computeMoveDirection() {
    if (!this.isPointerLocked && this.pointerLockElement) {
      return new THREE.Vector3();
    }

    const euler = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    const quaternion = new THREE.Quaternion().setFromEuler(euler);

    const forward = FORWARD.clone().applyQuaternion(quaternion);
    const right = RIGHT.clone().applyQuaternion(quaternion);
    const up = UP.clone().applyQuaternion(quaternion);

    const direction = new THREE.Vector3();
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) direction.add(forward);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) direction.sub(forward);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) direction.add(right);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) direction.sub(right);
    if (this.keys.has("Space") || this.keys.has("KeyE")) direction.add(up);
    if (this.keys.has("KeyQ")) direction.sub(up);

    if (direction.lengthSq() > 0) {
      direction.normalize();
    }
    return direction;
  }

  _computeDynamicSpeed(focusDistance) {
    const { minSpeed, baseSpeed, maxSpeed } = this.settings;

    if (focusDistance == null) {
      return { current: baseSpeed, min: minSpeed, max: maxSpeed };
    }

    const closeDistance = 500;
    const farDistance = 4000;

    let t;
    if (focusDistance <= closeDistance) {
      t = clamp(focusDistance / closeDistance, 0, 1);
      const speed = THREE.MathUtils.lerp(minSpeed, baseSpeed * 0.5, t);
      return { current: speed, min: minSpeed, max: maxSpeed };
    }

    if (focusDistance >= farDistance) {
      return { current: maxSpeed, min: minSpeed, max: maxSpeed };
    }

    t = (focusDistance - closeDistance) / (farDistance - closeDistance);
    const speed = THREE.MathUtils.lerp(baseSpeed * 0.5, maxSpeed, clamp(t, 0, 1));
    return { current: speed, min: minSpeed, max: maxSpeed };
  }

  _onKeyDown(event) {
    const code = event.code;
    this.keys.add(code);
    if (code === "Space" && !event.repeat) {
      event.preventDefault();
      this.triggerDash();
    }
    if ((code === "KeyV" || code === "Escape") && this.isPointerLocked) {
      document.exitPointerLock?.();
    }
  }

  _onKeyUp(event) {
    this.keys.delete(event.code);
  }

  _onMouseMove(event) {
    if (!this.isPointerLocked) return;
    const { movementX = 0, movementY = 0 } = event;
    this.yaw -= movementX * this.settings.mouseSensitivity;
    this.pitch -= movementY * this.settings.mouseSensitivity;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  }

  _onPointerLockChange() {
    this.isPointerLocked = document.pointerLockElement === this.pointerLockElement;
    if (!this.isPointerLocked) {
      this.velocity.multiplyScalar(0.2);
    }
  }

  _onClick() {
    this.requestPointerLock();
  }
}

