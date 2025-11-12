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

    if (this.scene) {
      this.scene.add(this.root);
    }
  }

  dispose() {
    for (const system of this.systems.values()) {
      system.instance.dispose?.();
    }
    this.systems.clear();
    if (this.scene) {
      this.scene.remove(this.root);
    }
  }

  update(delta, position) {
    if (!position) return;
    const sector = this._computeSector(position);
    this._ensureSectorsAround(sector);
    this._pruneFarSectors(sector);

    for (const system of this.systems.values()) {
      system.instance.update?.(delta, position);
    }
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
}

