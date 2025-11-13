import * as THREE from "three";
import { SeededRNG, hashString } from "../app/utils.js";
import { createSolarSystem } from "./solarSystemGenerator.js";

function sectorKey(sector) {
  return `${sector.x}:${sector.y}:${sector.z}`;
}

export class UniverseManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.sectorSize = options.sectorSize ?? 6000;
    this.loadRadius = options.loadRadius ?? 1;
    this.maxSystems = options.maxSystems ?? 64;
    this.systemOptions = options.systemOptions ?? {};
    this.visibility = options.visibility ?? {};
    this.systems = new Map();

    this.root = new THREE.Group();
    this.root.name = "UniverseRoot";

    this._frustum = new THREE.Frustum();
    this._cameraViewProjection = new THREE.Matrix4();
    this._cullSphere = new THREE.Sphere();
    this._tempWorld = new THREE.Vector3();

    // Star direction indicators - always visible particles showing star positions
    this._starIndicators = this._createStarIndicators();
    if (this.scene) {
      this.scene.add(this.root);
      this.scene.add(this._starIndicators);
    }
  }

  dispose() {
    for (const system of this.systems.values()) {
      system.instance.dispose?.();
    }
    this.systems.clear();
    if (this.scene) {
      this.scene.remove(this.root);
      if (this._starIndicators) {
        this.scene.remove(this._starIndicators);
        this._starIndicators.geometry.dispose();
        this._starIndicators.material.dispose();
      }
    }
  }

  update(delta, position, camera) {
    if (!position) return;
    const frustum = this._updateFrustum(camera);
    const sector = this._computeSector(position);
    this._ensureSectorsAround(sector);
    this._pruneFarSectors(sector);

    for (const system of this.systems.values()) {
      const { instance } = system;
      let isVisible = true;
      if (frustum && instance?.group) {
        const boundingRadius =
          instance.boundingRadius ??
          this.visibility.systemCullDistance ??
          this.sectorSize;
        const sphere = this._cullSphere;
        instance.group.getWorldPosition(this._tempWorld);
        sphere.center.copy(this._tempWorld);
        const starRadius = instance.star?.radius ?? 0;
        sphere.radius = Math.max(1, boundingRadius + starRadius);
        isVisible = frustum.intersectsSphere(sphere);
      }

      instance.setVisible?.(isVisible);

      if (!isVisible) {
        continue;
      }

      instance.update?.(delta, position, { frustum, camera });
    }

    // Update star indicators with all star positions
    this._updateStarIndicators(position);
  }

  getNearestPlanet(position) {
    let nearest = null;
    let minDistanceSq = Infinity;

    for (const { instance } of this.systems.values()) {
      const systemPos = instance.group.position;
      for (const planetEntry of instance.planets) {
        const worldPos = planetEntry.worldPosition.clone();
        const distanceSq = worldPos.distanceToSquared(position);
        if (distanceSq < minDistanceSq) {
          minDistanceSq = distanceSq;
          nearest = {
            system: instance,
            planet: planetEntry,
            worldPosition: worldPos.clone(),
            distance: Math.sqrt(distanceSq)
          };
        }
      }
    }

    return nearest;
  }

  getAllSystems() {
    const systems = [];
    for (const [key, entry] of this.systems.entries()) {
      const { instance, sector } = entry;
      systems.push({
        key,
        sector,
        system: instance,
        position: instance.group.position.clone(),
        name: instance.group.name,
        star: instance.star,
        planetCount: instance.planets.length
      });
    }
    return systems;
  }

  _computeSector(position) {
    return {
      x: Math.floor(position.x / this.sectorSize),
      y: Math.floor(position.y / this.sectorSize),
      z: Math.floor(position.z / this.sectorSize)
    };
  }

  _ensureSectorsAround(centerSector) {
    for (let dx = -this.loadRadius; dx <= this.loadRadius; dx += 1) {
      for (let dy = -this.loadRadius; dy <= this.loadRadius; dy += 1) {
        for (let dz = -this.loadRadius; dz <= this.loadRadius; dz += 1) {
          const sector = {
            x: centerSector.x + dx,
            y: centerSector.y + dy,
            z: centerSector.z + dz
          };
          const key = sectorKey(sector);
          if (this.systems.has(key)) continue;
          this._loadSector(sector);
          if (this.systems.size >= this.maxSystems) {
            return;
          }
        }
      }
    }
  }

  _pruneFarSectors(centerSector) {
    const keysToRemove = [];
    for (const [key, entry] of this.systems.entries()) {
      const { sector } = entry;
      if (
        Math.abs(sector.x - centerSector.x) > this.loadRadius + 1 ||
        Math.abs(sector.y - centerSector.y) > this.loadRadius + 1 ||
        Math.abs(sector.z - centerSector.z) > this.loadRadius + 1
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      const entry = this.systems.get(key);
      entry.instance.dispose?.();
      this.root.remove(entry.instance.group);
      this.systems.delete(key);
    }
  }

  _loadSector(sector) {
    const key = sectorKey(sector);
    const seed = hashString(key);
    const rng = new SeededRNG(seed);
    const system = createSolarSystem(this.root, rng, {
      name: `System ${key}`,
      ...this.systemOptions,
      visibility: this.visibility
    });
    const jitterStrength = this.sectorSize * 0.4;
    const jitter = new THREE.Vector3(
      (rng.next() - 0.5) * jitterStrength,
      (rng.next() - 0.5) * jitterStrength * 0.45,
      (rng.next() - 0.5) * jitterStrength
    );
    const basePosition = new THREE.Vector3(
      (sector.x + 0.5) * this.sectorSize,
      (sector.y + 0.5) * this.sectorSize,
      (sector.z + 0.5) * this.sectorSize
    );
    basePosition.add(jitter);
    system.group.position.copy(basePosition);
    this.systems.set(key, {
      sector,
      instance: system,
      jitter
    });
  }

  _updateFrustum(camera) {
    if (!camera) return null;
    camera.updateMatrixWorld();
    this._cameraViewProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this._frustum.setFromProjectionMatrix(this._cameraViewProjection);
    return this._frustum;
  }

  _createStarIndicators() {
    // Create a texture for the star indicator particles
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.1,
      size / 2,
      size / 2,
      size * 0.5
    );
    gradient.addColorStop(0, "rgba(255,255,255,1.0)");
    gradient.addColorStop(0.3, "rgba(255,255,200,0.8)");
    gradient.addColorStop(0.7, "rgba(200,220,255,0.4)");
    gradient.addColorStop(1, "rgba(0,0,0,0.0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    // Create geometry and material for star indicators
    const geometry = new THREE.BufferGeometry();
    const maxStars = 1000; // Maximum number of star indicators
    const positions = new Float32Array(maxStars * 3);
    const colors = new Float32Array(maxStars * 3);
    
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      map: texture,
      size: 6, // Fixed pixel size
      sizeAttenuation: false, // Always same size regardless of distance
      transparent: true,
      opacity: 0.9,
      vertexColors: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });

    const points = new THREE.Points(geometry, material);
    points.name = "StarDirectionIndicators";
    points.renderOrder = -500; // Render before most objects
    points.frustumCulled = false;
    
    // Store reference to update later
    points._maxStars = maxStars;
    points._starCount = 0;
    
    return points;
  }

  _updateStarIndicators(observerPosition) {
    if (!this._starIndicators || !observerPosition) return;

    const positions = this._starIndicators.geometry.attributes.position.array;
    const colors = this._starIndicators.geometry.attributes.color.array;
    let starCount = 0;
    const maxStars = this._starIndicators._maxStars;

    // Collect all star positions from all systems
    for (const { instance } of this.systems.values()) {
      if (!instance.star || !instance.group) continue;
      
      if (starCount >= maxStars) break;

      // Get star world position
      instance.star.group.getWorldPosition(this._tempWorld);
      
      // Store position
      positions[starCount * 3 + 0] = this._tempWorld.x;
      positions[starCount * 3 + 1] = this._tempWorld.y;
      positions[starCount * 3 + 2] = this._tempWorld.z;

      // Use star color for the indicator
      const starColor = instance.star.color || new THREE.Color(1, 1, 0.8);
      colors[starCount * 3 + 0] = starColor.r;
      colors[starCount * 3 + 1] = starColor.g;
      colors[starCount * 3 + 2] = starColor.b;

      starCount++;
    }

    // Update geometry
    this._starIndicators.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this._starIndicators.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this._starIndicators.geometry.setDrawRange(0, starCount);
    this._starIndicators.geometry.attributes.position.needsUpdate = true;
    this._starIndicators.geometry.attributes.color.needsUpdate = true;
    this._starIndicators._starCount = starCount;
  }
}

