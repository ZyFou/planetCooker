import * as THREE from "three";
import { SeededRNG } from "../app/utils.js";
import { createStar } from "./starFactory.js";
import { createPlanet } from "./planetFactory.js";
import { generatePlanetParams } from "./planetParamGenerator.js";

function ensureRng(seedOrRng) {
  if (seedOrRng && typeof seedOrRng.next === "function") {
    return seedOrRng;
  }
  return new SeededRNG(seedOrRng ?? 0xfeedc0de);
}

export function createSolarSystem(parentGroup, seedOrRng, options = {}) {
  const rng = ensureRng(seedOrRng);
  const group = new THREE.Group();
  group.name = options.name ?? "Solar System";
  parentGroup?.add(group);

  const star = createStar(rng.fork?.() ?? rng, options.star ?? {});
  group.add(star.group);

  const planetCount = options.planetCount ?? Math.floor(rng.nextFloat(2, 7));
  const planets = [];

  const baseOrbit = options.startingOrbit ?? star.radius * rng.nextFloat(4.5, 6.5);
  let currentOrbit = baseOrbit;
  let systemTime = 0;

  for (let i = 0; i < planetCount; i += 1) {
    if (i > 0) {
      currentOrbit *= rng.nextFloat(1.6, 2.4);
    }

    const orbitalInclination = THREE.MathUtils.degToRad(rng.nextFloat(-7, 7));
    const orbitalTiltAxis = new THREE.Vector3(0, 1, 0).applyAxisAngle(
      new THREE.Vector3(1, 0, 0),
      orbitalInclination
    );

    const params = generatePlanetParams(rng.fork?.() ?? rng, {
      seed: `${options.name ?? "SYS"}-P${i}`,
      starLuminosity: star.luminosity,
      orbitalDistance: currentOrbit
    });

    const initialAngle = rng.nextFloat(0, Math.PI * 2);
    const position = new THREE.Vector3(
      Math.cos(initialAngle) * currentOrbit,
      Math.sin(orbitalInclination) * currentOrbit,
      Math.sin(initialAngle) * currentOrbit
    );

    const planet = createPlanet(group, params, {
      position,
      name: `Planet ${i + 1}`
    });

    const orbitSpeed = options.orbitSpeedFactor
      ? options.orbitSpeedFactor * rng.nextFloat(0.6, 1.4) / Math.pow(currentOrbit / baseOrbit, 1.5)
      : rng.nextFloat(0.0025, 0.0085) / Math.pow(currentOrbit / baseOrbit, 1.4);

    planets.push({
      planet,
      params,
      orbitRadius: currentOrbit,
      orbitSpeed,
      orbitAngle: initialAngle,
      orbitalInclination,
      orbitalTiltAxis,
      update(delta) {
        this.orbitAngle += orbitSpeed * delta;
        const radius = this.orbitRadius;
        const x = Math.cos(this.orbitAngle) * radius;
        const z = Math.sin(this.orbitAngle) * radius;
        const y = Math.sin(this.orbitalInclination) * radius;
        planet.planetRoot.position.set(x, y, z);
        planet.update?.(delta, systemTime);
      },
      dispose() {
        planet.dispose?.();
      }
    });
  }

  return {
    group,
    star,
    planets,
    update(delta) {
      systemTime += delta;
      for (let i = 0; i < planets.length; i += 1) {
        planets[i].update(delta);
      }
    },
    dispose() {
      star.dispose?.();
      for (let i = 0; i < planets.length; i += 1) {
        planets[i].dispose();
      }
      parentGroup?.remove(group);
    }
  };
}

