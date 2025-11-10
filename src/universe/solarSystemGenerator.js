import * as THREE from "three";
import { SeededRNG } from "../app/utils.js";
import { createStar } from "./starFactory.js";
import { createPlanet, getPlanetRadiusFromParams } from "./planetFactory.js";
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

  const systemOrientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    rng.nextFloat(-Math.PI * 0.25, Math.PI * 0.25),
    rng.nextFloat(0, Math.PI * 2),
    rng.nextFloat(-Math.PI * 0.25, Math.PI * 0.25)
  ));
  group.quaternion.copy(systemOrientation);

  const star = createStar(rng.fork?.() ?? rng, options.star ?? {});
  group.add(star.group);

  const planetCount = options.planetCount ?? Math.floor(rng.nextFloat(2, 7));
  const planets = [];

  const baseOrbit = options.startingOrbit ?? star.radius * rng.nextFloat(4.5, 6.5);
  const starOffset = new THREE.Vector3(
    (rng.next() - 0.5) * baseOrbit * 0.25,
    (rng.next() - 0.5) * baseOrbit * 0.12,
    (rng.next() - 0.5) * baseOrbit * 0.25
  );
  star.group.position.copy(starOffset);

  let currentOrbit = baseOrbit;
  let systemTime = 0;
  let systemMaxExtent = starOffset.length();
  const visibilityOptions = options.visibility ?? {};
  const systemCullDistance = visibilityOptions.systemCullDistance ?? 35000;
  const systemCullDistanceSq = systemCullDistance * systemCullDistance;
  const planetCullDistance = visibilityOptions.planetCullDistance ?? 25000;
  const planetCullDistanceSq = planetCullDistance * planetCullDistance;
  const orbitUpdateDistance = visibilityOptions.orbitUpdateDistance ?? 18000;
  const orbitUpdateDistanceSq = orbitUpdateDistance * orbitUpdateDistance;
  const fullDetailDistance = visibilityOptions.fullDetailDistance ?? 1500;
  const fullDetailDistanceSq = fullDetailDistance * fullDetailDistance;
  const unloadDetailDistance = visibilityOptions.unloadDetailDistance ?? 2800;
  const unloadDetailDistanceSq = unloadDetailDistance * unloadDetailDistance;
  const placeholderSegments = visibilityOptions.placeholderSegments ?? 16;
  for (let i = 0; i < planetCount; i += 1) {
    if (i > 0) {
      currentOrbit *= rng.nextFloat(1.6, 2.4);
    }

    const orbitalPlaneRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(rng.nextFloat(-15, 15)),
      rng.nextFloat(0, Math.PI * 2),
      THREE.MathUtils.degToRad(rng.nextFloat(-15, 15))
    ));
    const verticalOffset = rng.nextFloat(-0.08, 0.08) * currentOrbit;
    const orbitalInclination = THREE.MathUtils.degToRad(rng.nextFloat(-7, 7));
    const orbitalTiltAxis = new THREE.Vector3(0, 1, 0).applyAxisAngle(
      new THREE.Vector3(1, 0, 0),
      orbitalInclination
    );
    const eccentricity = rng.nextFloat(0, 0.25);
    const periapsis = rng.nextFloat(0, Math.PI * 2);

    const params = generatePlanetParams(rng.fork?.() ?? rng, {
      seed: `${options.name ?? "SYS"}-P${i}`,
      starLuminosity: star.luminosity,
      orbitalDistance: currentOrbit
    });

    const initialAngle = rng.nextFloat(0, Math.PI * 2);
    const radius = getPlanetRadiusFromParams(params);
    const placeholderGeometry = new THREE.SphereGeometry(radius, placeholderSegments, placeholderSegments);
    const placeholderColorSource =
      params.planetType === "gas"
        ? params.gasColor3 ?? params.gasColor2 ?? params.gasColor1
        : params.colorGrass ?? params.colorForest ?? params.colorBeach;
    const placeholderMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(placeholderColorSource ?? "#667c99"),
      emissive: 0x000000,
      roughness: 0.9,
      metalness: 0.0
    });
    const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
    placeholder.name = `Planet Placeholder ${i + 1}`;
    const initialRadius = currentOrbit * (1 - eccentricity * Math.cos(initialAngle - periapsis));
    const baseInitial = new THREE.Vector3(
      initialRadius * Math.cos(initialAngle),
      verticalOffset,
      initialRadius * Math.sin(initialAngle)
    );
    baseInitial.applyQuaternion(orbitalPlaneRotation);
    placeholder.position.copy(baseInitial).add(starOffset);
    group.add(placeholder);

    const orbitSpeed = options.orbitSpeedFactor
      ? options.orbitSpeedFactor * rng.nextFloat(0.6, 1.4) / Math.pow(currentOrbit / baseOrbit, 1.5)
      : rng.nextFloat(0.0025, 0.0085) / Math.pow(currentOrbit / baseOrbit, 1.4);

    const orbitExtent = currentOrbit * (1 + eccentricity) + Math.abs(verticalOffset);
    systemMaxExtent = Math.max(systemMaxExtent, orbitExtent + starOffset.length());

    planets.push({
      fullPlanet: null,
      placeholder,
      placeholderGeometry,
      placeholderMaterial,
      planet: null,
      params,
      orbitRadius: currentOrbit,
      orbitSpeed,
      orbitAngle: initialAngle,
      orbitalInclination,
      orbitalTiltAxis,
      worldPosition: new THREE.Vector3().copy(placeholder.position),
      orbitCenter: starOffset.clone(),
      planeRotation: orbitalPlaneRotation,
      verticalOffset,
      eccentricity,
      periapsis,
      tempPosition: new THREE.Vector3(),
      loadFull(parentGroup) {
        if (this.fullPlanet) return;
        this.fullPlanet = createPlanet(parentGroup, this.params, {
          position: this.placeholder.position.clone(),
          name: this.placeholder.name.replace("Placeholder ", "")
        });
        this.fullPlanet.planetRoot.visible = true;
        this.placeholder.visible = false;
        this.planet = this.fullPlanet;
      },
      unloadFull(parentGroup) {
        if (!this.fullPlanet) return;
        this.fullPlanet.dispose?.();
        parentGroup?.remove(this.fullPlanet.planetRoot);
        this.fullPlanet = null;
        this.placeholder.visible = true;
        this.planet = null;
      },
      update(delta, observerPosition, systemPosition) {
        const radiusValue = this.orbitRadius * (1 - this.eccentricity * Math.cos(this.orbitAngle - this.periapsis));
        if (!observerPosition || this.worldPosition.distanceToSquared(observerPosition) <= orbitUpdateDistanceSq) {
          this.orbitAngle += orbitSpeed * delta;
        } else {
          this.orbitAngle += orbitSpeed * delta * 0.2;
        }

        this.tempPosition.set(
          radiusValue * Math.cos(this.orbitAngle),
          this.verticalOffset,
          radiusValue * Math.sin(this.orbitAngle)
        );
        this.tempPosition.applyQuaternion(this.planeRotation);
        this.tempPosition.add(this.orbitCenter);
        this.placeholder.position.copy(this.tempPosition);
        if (this.fullPlanet) {
          this.fullPlanet.planetRoot.position.copy(this.tempPosition);
        }

        if (observerPosition) {
          this.worldPosition.copy(systemPosition).add(this.placeholder.position);
          const distanceSq = this.worldPosition.distanceToSquared(observerPosition);
          const withinCull = distanceSq <= planetCullDistanceSq;

          if (!withinCull) {
            this.placeholder.visible = false;
            if (this.fullPlanet) this.fullPlanet.planetRoot.visible = false;
            if (this.fullPlanet && distanceSq > unloadDetailDistanceSq) {
              this.unloadFull(group);
            }
            return;
          }

          const shouldLoadFull = distanceSq <= fullDetailDistanceSq;
          const shouldUnloadFull = distanceSq > unloadDetailDistanceSq;

          if (shouldLoadFull && !this.fullPlanet) {
            this.loadFull(group);
          } else if (shouldUnloadFull && this.fullPlanet) {
            this.unloadFull(group);
          }

          // Ensure correct visibility state
          if (this.fullPlanet) {
            this.fullPlanet.planetRoot.visible = true;
            this.placeholder.visible = false;
            this.fullPlanet.update?.(delta, systemTime);
          } else {
            this.placeholder.visible = true;
          }
        } else {
          this.worldPosition.copy(systemPosition).add(this.placeholder.position);
          if (this.fullPlanet) {
            this.fullPlanet.planetRoot.visible = true;
            this.fullPlanet.update?.(delta, systemTime);
            this.placeholder.visible = false;
          } else {
            this.placeholder.visible = true;
          }
        }
      },
      dispose() {
        this.unloadFull(group);
        group.remove(this.placeholder);
        this.placeholderGeometry.dispose();
        this.placeholderMaterial.dispose();
      }
    });
  }

  return {
    group,
    star,
    planets,
    update(delta, observerPosition) {
      systemTime += delta;
      const systemPosition = this.group.position;
      
      if (observerPosition) {
        const systemDistanceSq = systemPosition.distanceToSquared(observerPosition);
        const effectiveSystemCull = systemCullDistance + (this.boundingRadius ?? 0);
        const effectivePlanetCull = planetCullDistance + (this.boundingRadius ?? 0);
        const effectiveSystemCullSq = effectiveSystemCull * effectiveSystemCull;
        const effectivePlanetCullSq = effectivePlanetCull * effectivePlanetCull;
        
        if (systemDistanceSq > effectiveSystemCullSq) {
          this.group.visible = false;
          return;
        }
        
        this.group.visible = true;
        
        const starDistanceVisible = systemDistanceSq <= effectivePlanetCullSq;
        this.star.group.visible = starDistanceVisible;
      } else {
        this.group.visible = true;
        this.star.group.visible = true;
      }

      for (let i = 0; i < planets.length; i += 1) {
    planets[i].update(delta, observerPosition, systemPosition);
      }
    },
    boundingRadius: systemMaxExtent,
    dispose() {
      star.dispose?.();
      for (let i = 0; i < planets.length; i += 1) {
        planets[i].dispose();
      }
      parentGroup?.remove(group);
    }
  };
}

