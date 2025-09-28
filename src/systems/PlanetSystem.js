import * as THREE from "three";
import { PlanetFactory } from "../entities/PlanetFactory.js";

function cloneParams(params) {
  return JSON.parse(JSON.stringify(params));
}

function ensureId(id) {
  if (id) return id;
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `planet-${Math.random().toString(36).slice(2, 10)}`;
}

export class PlanetSystem {
  constructor(options) {
    const {
      root = new THREE.Group(),
      sun = root,
      viewControls = null,
    } = options ?? {};
    this.root = root;
    this.sun = sun;
    this.items = [];
    this.timeScale = 1;
    this.viewMode = "close";
    this.viewControls = viewControls;
    this.orbitGizmosVisible = false;
  }

  addPlanet(params) {
    const id = ensureId(params?.id);
    const defaults = {
      id,
      seed: Math.floor(Math.random() * 0xffffffff),
      type: "rocky",
      radius: 0.8,
      semiMajorAxis: 6,
      orbitalSpeed: 0.25,
      phase: 0,
      inclination: 0,
      spinSpeed: 0.2,
      materialPreset: null,
    };
    const fullParams = Object.assign({}, defaults, params, { id });
    const mesh = PlanetFactory.create(fullParams);
    mesh.position.set(fullParams.semiMajorAxis, 0, 0);
    const node = new THREE.Object3D();
    node.rotation.x = fullParams.inclination ?? 0;
    node.add(mesh);
    this.sun.add(node);

    const item = {
      id,
      params: cloneParams(fullParams),
      theta: fullParams.phase ?? 0,
      node,
      mesh,
      gizmo: null,
    };
    if (this.orbitGizmosVisible) {
      item.gizmo = this.createOrbitGizmo(fullParams);
      node.add(item.gizmo);
    }
    this.items.push(item);
    return id;
  }

  update(dt) {
    const scaledDt = dt * this.timeScale;
    for (const item of this.items) {
      const p = item.params;
      const speed = p.orbitalSpeed ?? 0;
      const a = p.semiMajorAxis ?? 0;
      if (speed !== 0 && a !== 0) {
        item.theta += speed * scaledDt;
      }
      const theta = item.theta;
      item.mesh.position.set(
        a * Math.cos(theta),
        0,
        a * Math.sin(theta),
      );
      const spinSpeed = p.spinSpeed ?? 0;
      if (spinSpeed !== 0) {
        item.mesh.rotation.y += spinSpeed * scaledDt;
      }
    }
    if (this.viewControls) {
      this.viewControls.update(dt);
    }
  }

  updatePlanet(id, patch) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return;
    Object.assign(item.params, patch);
    if (patch.phase !== undefined) {
      item.theta = item.params.phase ?? 0;
      const a = item.params.semiMajorAxis ?? 0;
      item.mesh.position.set(a * Math.cos(item.theta), 0, a * Math.sin(item.theta));
    }
    if (patch.inclination !== undefined) {
      item.node.rotation.x = item.params.inclination ?? 0;
    }
    if (patch.semiMajorAxis !== undefined) {
      const a = item.params.semiMajorAxis ?? 0;
      const theta = item.theta;
      item.mesh.position.set(a * Math.cos(theta), 0, a * Math.sin(theta));
      if (item.gizmo) {
        item.node.remove(item.gizmo);
        item.gizmo = this.orbitGizmosVisible ? this.createOrbitGizmo(item.params) : null;
        if (item.gizmo) item.node.add(item.gizmo);
      }
    }
    if (patch.radius !== undefined) {
      item.mesh.scale.setScalar(Math.max(0.1, item.params.radius ?? 0.1));
    }
    const requiresRebuild = ["type", "materialPreset", "seed"].some((key) => patch[key] !== undefined);
    if (requiresRebuild) {
      this.rebuildMesh(item);
    }
    if (this.viewControls && (patch.semiMajorAxis !== undefined || patch.radius !== undefined) && this.viewMode === "system") {
      this.viewControls.fitCameraToSystem(this.getPlanets());
    }
  }

  rebuildMesh(item) {
    const newMesh = PlanetFactory.create(item.params);
    newMesh.position.copy(item.mesh.position);
    newMesh.rotation.copy(item.mesh.rotation);
    item.node.remove(item.mesh);
    item.mesh = newMesh;
    item.node.add(newMesh);
    if (item.gizmo) {
      item.node.remove(item.gizmo);
      item.gizmo = this.orbitGizmosVisible ? this.createOrbitGizmo(item.params) : null;
      if (item.gizmo) item.node.add(item.gizmo);
    }
  }

  removePlanet(id) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    const [item] = this.items.splice(index, 1);
    if (item.gizmo) {
      item.node.remove(item.gizmo);
      item.gizmo.geometry.dispose();
      if (Array.isArray(item.gizmo.material)) {
        item.gizmo.material.forEach((m) => m.dispose());
      } else if (item.gizmo.material) {
        item.gizmo.material.dispose?.();
      }
    }
    item.node.remove(item.mesh);
    item.mesh.geometry.dispose();
    if (Array.isArray(item.mesh.material)) {
      item.mesh.material.forEach((m) => m.dispose?.());
    } else {
      item.mesh.material.dispose?.();
    }
    this.sun.remove(item.node);
  }

  getPlanets() {
    return this.items.map((item) => cloneParams(item.params));
  }

  setSystemTimeScale(scale) {
    this.timeScale = Math.max(0, scale ?? 0);
  }

  getTimeScale() {
    return this.timeScale;
  }

  setViewMode(mode) {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    if (this.root) {
      this.root.visible = mode === "system";
    }
    if (this.viewControls) {
      this.viewControls.setMode(mode, this.getPlanets());
    }
  }

  getViewMode() {
    return this.viewMode;
  }

  toggleOrbitGizmos(visible) {
    this.orbitGizmosVisible = !!visible;
    for (const item of this.items) {
      if (item.gizmo) {
        item.node.remove(item.gizmo);
        item.gizmo.geometry.dispose();
        if (Array.isArray(item.gizmo.material)) {
          item.gizmo.material.forEach((m) => m.dispose());
        } else {
          item.gizmo.material.dispose?.();
        }
        item.gizmo = null;
      }
      if (this.orbitGizmosVisible) {
        item.gizmo = this.createOrbitGizmo(item.params);
        item.node.add(item.gizmo);
      }
    }
  }

  areOrbitGizmosVisible() {
    return this.orbitGizmosVisible;
  }

  createOrbitGizmo(params) {
    const segments = 128;
    const radius = Math.max(0.1, params.semiMajorAxis ?? 1);
    const positions = new Float32Array(segments * 3);
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      positions[i * 3 + 0] = radius * Math.cos(angle);
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = radius * Math.sin(angle);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0x3f7fff, transparent: true, opacity: 0.35 });
    const loop = new THREE.LineLoop(geometry, material);
    loop.rotation.x = Math.PI / 2;
    return loop;
  }
}
