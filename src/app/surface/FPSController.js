import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export class FPSController {
  constructor(camera, options) {
    this.camera = camera;
    this.domElement = options.domElement;
    this.getHeightAt = options.getHeightAt;
    this.onLockChange = options.onLockChange;
    this.onFlyModeChange = options.onFlyModeChange;

    const gravityG = clamp(options.gravityG ?? 1, 0.3, 3);
    const earthGravity = 9.81;
    this.gravity = earthGravity * gravityG;

    const baseWalkSpeed = options.baseWalkSpeed ?? 6.5;
    const gravityFactor = clamp(1.3 - Math.log2(gravityG + 1), 0.65, 1.4);
    this.walkSpeed = baseWalkSpeed * gravityFactor;

    this.playerHeight = options.playerHeight ?? 1.74;
    // Reduced jump height by 3
    this.jumpVelocity = Math.sqrt(2 * this.gravity * 1.1 * gravityFactor) / 3.0;

    this.sprintMultiplier = 1.85;
    // Slightly faster fly speeds
    this.flySpeedMultiplier = 2.2;
    this.flySprintMultiplier = 3.2;
    this.flyVerticalMultiplier = 0.95;

    this.velocity = new THREE.Vector3();
    this.targetVelocity = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.horizontal = new THREE.Vector2();
    this.up = new THREE.Vector3(0, 1, 0);

    this.movement = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      flying: false,
      ascend: false,
      descend: false
    };

    this.isOnGround = false;
    this.isLocked = false;

    this.controls = new PointerLockControls(this.camera, this.domElement);
    this.controlObject = new THREE.Object3D();
    this.controlObject.position.copy(this.camera.position);

    this.domElement.addEventListener("click", this.handleMouseClick);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  handleMouseClick = () => {
    if (!this.isLocked) {
      this.controls.lock();
    }
  };

  handlePointerLockChange = () => {
    this.isLocked = document.pointerLockElement === this.domElement;
    if (!this.isLocked) {
      this.velocity.set(0, 0, 0);
      this.movement.ascend = false;
      this.movement.descend = false;
    }
    if (typeof this.onLockChange === "function") {
      this.onLockChange(this.isLocked);
    }
  };

  handleKeyDown = (event) => {
    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        this.movement.forward = true;
        break;
      case "KeyS":
      case "ArrowDown":
        this.movement.backward = true;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.movement.left = true;
        break;
      case "KeyD":
      case "ArrowRight":
        this.movement.right = true;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.movement.sprint = true;
        break;
      case "Space":
        if (this.movement.flying) {
          this.movement.ascend = true;
        } else if (this.isOnGround) {
          this.velocity.y = this.jumpVelocity;
          this.isOnGround = false;
        }
        event.preventDefault();
        break;
      case "KeyE":
        if (this.movement.flying) {
          this.movement.ascend = true;
        }
        break;
      case "KeyQ":
      case "KeyC":
      case "ControlLeft":
      case "ControlRight":
      case "MetaLeft":
      case "MetaRight":
        if (this.movement.flying) {
          this.movement.descend = true;
          event.preventDefault();
        }
        break;
      case "KeyF":
        this.setFlying(!this.movement.flying);
        break;
      default:
        break;
    }
  };

  handleKeyUp = (event) => {
    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        this.movement.forward = false;
        break;
      case "KeyS":
      case "ArrowDown":
        this.movement.backward = false;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.movement.left = false;
        break;
      case "KeyD":
      case "ArrowRight":
        this.movement.right = false;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.movement.sprint = false;
        break;
      case "Space":
      case "KeyE":
        this.movement.ascend = false;
        break;
      case "KeyQ":
      case "KeyC":
      case "ControlLeft":
      case "ControlRight":
      case "MetaLeft":
      case "MetaRight":
        this.movement.descend = false;
        break;
      default:
        break;
    }
  };

  damp(value, target, lambda, delta) {
    return THREE.MathUtils.damp(value, target, lambda, delta);
  }

  setFlying(enabled) {
    const next = Boolean(enabled);
    if (this.movement.flying === next) {
      return;
    }

    this.movement.flying = next;
    if (!next) {
      this.movement.ascend = false;
      this.movement.descend = false;
      this.velocity.y = 0;
    }

    if (typeof this.onFlyModeChange === "function") {
      this.onFlyModeChange(next);
    }
  }

  isFlying() {
    return this.movement.flying;
  }

  update(delta) {
    if (!this.isLocked) {
      return;
    }

    const moveInput = new THREE.Vector2(
      (this.movement.right ? 1 : 0) - (this.movement.left ? 1 : 0),
      (this.movement.forward ? 1 : 0) - (this.movement.backward ? 1 : 0)
    );

    if (moveInput.lengthSq() > 0.0001) {
      moveInput.normalize();
    } else {
      moveInput.set(0, 0);
    }

    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    if (!this.movement.flying) {
      this.forward.y = 0;
    }
    if (this.forward.lengthSq() > 1e-6) {
      this.forward.normalize();
    } else {
      this.forward.set(0, 0, -1);
    }

    this.right.crossVectors(this.forward, this.up);
    if (this.right.lengthSq() > 1e-6) {
      this.right.normalize();
    }

    this.targetVelocity.set(0, 0, 0);
    this.targetVelocity.addScaledVector(this.right, moveInput.x);
    this.targetVelocity.addScaledVector(this.forward, moveInput.y);
    if (this.targetVelocity.lengthSq() > 1e-6) {
      this.targetVelocity.normalize();
    }

    let speedMultiplier = this.movement.sprint ? this.sprintMultiplier : 1;
    if (this.movement.flying) {
      speedMultiplier = this.movement.sprint ? this.flySprintMultiplier : this.flySpeedMultiplier;
    }
    const maxSpeed = this.walkSpeed * speedMultiplier;
    this.targetVelocity.multiplyScalar(maxSpeed);

    const horizontalSmooth = this.movement.flying
      ? 20
      : (this.isOnGround ? 42 : 16);

    this.velocity.x = this.damp(this.velocity.x, this.targetVelocity.x, horizontalSmooth, delta);
    this.velocity.z = this.damp(this.velocity.z, this.targetVelocity.z, horizontalSmooth, delta);

    this.horizontal.set(this.velocity.x, this.velocity.z);
    if (this.horizontal.lengthSq() < 1e-6) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    if (this.movement.flying) {
      const verticalInput = (this.movement.ascend ? 1 : 0) - (this.movement.descend ? 1 : 0);
      const verticalTarget = verticalInput * maxSpeed * this.flyVerticalMultiplier;
      this.velocity.y = this.damp(this.velocity.y, verticalTarget, 18, delta);
      if (Math.abs(this.velocity.y) < 1e-4) {
        this.velocity.y = 0;
      }
      this.isOnGround = false;
    } else {
      this.velocity.y -= this.gravity * delta;
    }

    this.controlObject.position.x += this.velocity.x * delta;
    this.controlObject.position.y += this.velocity.y * delta;
    this.controlObject.position.z += this.velocity.z * delta;

    if (!this.movement.flying && typeof this.getHeightAt === "function") {
      const groundHeight = this.getHeightAt(this.controlObject.position.x, this.controlObject.position.z) + this.playerHeight;
      if (this.controlObject.position.y <= groundHeight) {
        this.controlObject.position.y = groundHeight;
        this.velocity.y = 0;
        this.isOnGround = true;
      } else {
        this.isOnGround = false;
      }
    }

    this.camera.position.copy(this.controlObject.position);
  }

  getObject() {
    return this.controlObject;
  }

  dispose() {
    this.controls.unlock();
    const dispose = this.controls.dispose;
    if (typeof dispose === "function") {
      dispose.call(this.controls);
    }
    this.domElement.removeEventListener("click", this.handleMouseClick);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
  }
}

