import * as THREE from "three";
import { Planet } from "../app/planet.js";

export const PLANET_WORLD_SCALE = 5;

export function createPlanet(parentGroup, params, options = {}) {
  const {
    guiControllers = null,
    position = null,
    name = null
  } = options;

  const planet = new Planet(parentGroup, params, guiControllers);

  if (position instanceof THREE.Vector3) {
    planet.planetRoot.position.copy(position);
  } else if (Array.isArray(position) && position.length === 3) {
    planet.planetRoot.position.set(position[0], position[1], position[2]);
  }

  if (typeof name === "string" && name.length > 0) {
    planet.planetRoot.name = name;
  }

  return planet;
}

export function getPlanetRadiusFromParams(params = {}) {
  const worldScale = params.worldScale ?? PLANET_WORLD_SCALE;
  if (typeof params.gasPlanetSize === "number" && !Number.isNaN(params.gasPlanetSize)) {
    return params.gasPlanetSize * worldScale;
  }
  if (typeof params.planetSize === "number" && !Number.isNaN(params.planetSize)) {
    return params.planetSize * worldScale;
  }
  if (typeof params.radius === "number" && !Number.isNaN(params.radius)) {
    return params.radius * worldScale;
  }
  return worldScale;
}

export function getEffectivePlanetRadius(planet) {
  if (!planet) return 1.0;
  if (planet.planetMesh?.scale) {
    return planet.planetMesh.scale.x;
  }
  return getPlanetRadiusFromParams(planet.params);
}

