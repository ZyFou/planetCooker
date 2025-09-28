import * as THREE from "three";

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export class SystemViewControls {
  constructor(camera, controls, options = {}) {
    this.camera = camera;
    this.controls = controls;
    this.transitionDuration = options.transitionDuration ?? 1.25;
    this.currentMode = "close";
    this.savedClose = {
      position: camera.position.clone(),
      target: controls.target.clone(),
      maxDistance: controls.maxDistance,
      minDistance: controls.minDistance,
    };
    this.transition = null;
    this.systemMaxDistance = options.systemMaxDistance ?? controls.maxDistance * 4;
    this.systemMinDistance = options.systemMinDistance ?? Math.max(controls.minDistance * 0.5, 0.1);
    this.systemCameraElevation = options.systemCameraElevation ?? 0.8;
    this.systemDistanceMultiplier = options.systemDistanceMultiplier ?? 2.4;
    this.cameraFarClose = camera.far;
    this.cameraFarSystem = options.cameraFarSystem ?? Math.max(camera.far, 2000);
  }

  fitCameraToSystem(planets) {
    const maxExtent = planets.length
      ? planets.reduce((acc, planet) => Math.max(acc, (planet.semiMajorAxis ?? 1) + (planet.radius ?? 0)), 1)
      : 1;
    const distance = Math.max(4, maxExtent * this.systemDistanceMultiplier);
    const height = distance * this.systemCameraElevation;
    const endPosition = new THREE.Vector3(distance, height, distance);
    const endTarget = new THREE.Vector3(0, 0, 0);
    this.startTransition(endPosition, endTarget, "system");
  }

  startTransition(endPos, endTarget, mode) {
    this.transition = {
      startPos: this.camera.position.clone(),
      startTarget: this.controls.target.clone(),
      endPos,
      endTarget,
      elapsed: 0,
      duration: this.transitionDuration,
      mode,
    };
  }

  setMode(mode, planets) {
    if (mode === this.currentMode) return;
    if (mode === "system") {
      this.savedClose = {
        position: this.camera.position.clone(),
        target: this.controls.target.clone(),
        maxDistance: this.controls.maxDistance,
        minDistance: this.controls.minDistance,
      };
      this.controls.maxDistance = this.systemMaxDistance;
      this.controls.minDistance = this.systemMinDistance;
      this.camera.far = this.cameraFarSystem;
      this.camera.updateProjectionMatrix();
      this.fitCameraToSystem(planets);
    } else {
      this.controls.maxDistance = this.savedClose.maxDistance;
      this.controls.minDistance = this.savedClose.minDistance;
      this.camera.far = this.cameraFarClose;
      this.camera.updateProjectionMatrix();
      this.startTransition(this.savedClose.position.clone(), this.savedClose.target.clone(), "close");
    }
    this.currentMode = mode;
  }

  update(dt) {
    if (!this.transition) return;
    this.transition.elapsed += dt;
    const t = Math.min(1, this.transition.elapsed / Math.max(0.0001, this.transition.duration));
    const k = smoothstep(t);
    this.camera.position.lerpVectors(this.transition.startPos, this.transition.endPos, k);
    this.controls.target.lerpVectors(this.transition.startTarget, this.transition.endTarget, k);
    this.controls.update();
    if (t >= 1) {
      this.transition = null;
    }
  }
}
