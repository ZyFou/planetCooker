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

const hasWindow = typeof window !== "undefined";

function scheduleBackgroundTask(callback) {
  if (hasWindow && typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback, { timeout: 32 });
  }
  return setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => 16
    });
  }, 16);
}

function cancelBackgroundTask(id) {
  if (id == null) return;
  if (hasWindow && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(id);
    return;
  }
  clearTimeout(id);
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
  const starBillboardDistance =
    visibilityOptions.starBillboardDistance ??
    Math.min(systemCullDistance * 0.9, planetCullDistance * 2.5);
  const starBillboardDistanceSq = starBillboardDistance * starBillboardDistance;
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
    if (params.axisTilt == null) {
      params.axisTilt = rng.nextFloat(-28, 28);
    }

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
    const localInitial = new THREE.Vector3(
      initialRadius * Math.cos(initialAngle),
      verticalOffset,
      initialRadius * Math.sin(initialAngle)
    );

    const orbitGroup = new THREE.Group();
    orbitGroup.name = `Planet Orbit ${i + 1}`;
    orbitGroup.position.copy(starOffset);
    orbitGroup.quaternion.copy(orbitalPlaneRotation);
    group.add(orbitGroup);

    const lod = new THREE.LOD();
    lod.name = `Planet LOD ${i + 1}`;
    lod.position.copy(localInitial);
    lod.addLevel(placeholder, fullDetailDistance);
    placeholder.position.set(0, 0, 0);
    placeholder.rotation.z = THREE.MathUtils.degToRad(params.axisTilt ?? 0);
    placeholder.rotation.y = rng.nextFloat(0, Math.PI * 2);
    orbitGroup.add(lod);

    const initialWorldPosition = localInitial.clone().applyQuaternion(orbitalPlaneRotation).add(starOffset);

    const orbitSpeed = options.orbitSpeedFactor
      ? options.orbitSpeedFactor * rng.nextFloat(0.6, 1.4) / Math.pow(currentOrbit / baseOrbit, 1.5)
      : rng.nextFloat(0.0025, 0.0085) / Math.pow(currentOrbit / baseOrbit, 1.4);

    const orbitExtent = currentOrbit * (1 + eccentricity) + Math.abs(verticalOffset);
    systemMaxExtent = Math.max(systemMaxExtent, orbitExtent + starOffset.length());

    planets.push({
      fullPlanet: null,
      lod,
      orbitGroup,
      placeholder,
      placeholderGeometry,
      placeholderMaterial,
      planet: null,
      params,
      radius,
      orbitRadius: currentOrbit,
      orbitSpeed,
      orbitAngle: initialAngle,
      orbitalInclination,
      orbitalTiltAxis,
      worldPosition: new THREE.Vector3().copy(initialWorldPosition),
      verticalOffset,
      eccentricity,
      periapsis,
      tempPosition: new THREE.Vector3(),
      cullSphere: new THREE.Sphere(new THREE.Vector3(), Math.max(radius * 1.5, 1)),
      pendingLoadId: null,
      pendingUnload: false,
      loadFull() {
        if (this.fullPlanet || this.pendingLoadId) {
          this.pendingUnload = false;
          return;
        }
        this.pendingUnload = false;
        const executeLoad = () => {
          this.pendingLoadId = null;
          if (this.pendingUnload) {
            this.pendingUnload = false;
            return;
          }
          this.fullPlanet = createPlanet(this.lod, this.params, {
            position: [0, 0, 0],
            name: this.placeholder.name.replace("Placeholder ", "")
          });
          this.fullPlanet.planetRoot.visible = true;
          this.fullPlanet.planetRoot.position.set(0, 0, 0);
          this.fullPlanet.planetRoot.rotation.y = this.placeholder.rotation.y;
          if (typeof this.fullPlanet.updateTilt === "function") {
            this.fullPlanet.updateTilt();
          }
          this.lod.addLevel(this.fullPlanet.planetRoot, 0);
          this.lod.levels.sort((a, b) => a.distance - b.distance);
          this.lod.needsUpdate = true;
          this.planet = this.fullPlanet;
        };
        this.pendingLoadId = scheduleBackgroundTask(() => {
          executeLoad();
        });
      },
      unloadFull() {
        if (this.pendingLoadId != null) {
          this.pendingUnload = true;
          cancelBackgroundTask(this.pendingLoadId);
          this.pendingLoadId = null;
        }
        if (!this.fullPlanet) {
          return;
        }
        const planetRoot = this.fullPlanet.planetRoot;
        this.fullPlanet.dispose?.();
        this.lod.remove(planetRoot);
        this.lod.levels = this.lod.levels.filter(level => level.object !== planetRoot);
        this.fullPlanet = null;
        this.planet = null;
        this.lod.needsUpdate = true;
        this.pendingUnload = false;
      },
      update(delta, observerPosition, systemPosition, visibilityContext = {}) {
        const { frustum, camera } = visibilityContext ?? {};
        const orbitDistanceSq = observerPosition
          ? this.worldPosition.distanceToSquared(observerPosition)
          : 0;

        if (!observerPosition || orbitDistanceSq <= orbitUpdateDistanceSq) {
          this.orbitAngle += orbitSpeed * delta;
        } else {
          this.orbitAngle += orbitSpeed * delta * 0.2;
        }

        const radiusValue = this.orbitRadius * (1 - this.eccentricity * Math.cos(this.orbitAngle - this.periapsis));
        this.tempPosition.set(
          radiusValue * Math.cos(this.orbitAngle),
          this.verticalOffset,
          radiusValue * Math.sin(this.orbitAngle)
        );
        this.lod.position.copy(this.tempPosition);
        this.orbitGroup.updateMatrixWorld(true);
        this.lod.updateMatrixWorld(true);
        this.lod.getWorldPosition(this.worldPosition);

        let inFrustum = true;
        if (frustum) {
          this.cullSphere.center.copy(this.worldPosition);
          inFrustum = frustum.intersectsSphere(this.cullSphere);
        }

        if (!observerPosition) {
          this.lod.visible = inFrustum;
          if (this.fullPlanet) {
            this.fullPlanet.update?.(delta, systemTime);
          }
          if (camera && this.lod.visible && this.lod.levels.length > 0) {
            this.lod.update(camera);
          }
          return;
        }

        const distanceSq = this.worldPosition.distanceToSquared(observerPosition);
        const withinCull = distanceSq <= planetCullDistanceSq;
        const shouldUnloadFull = distanceSq > unloadDetailDistanceSq;
        const shouldLoadFull = distanceSq <= fullDetailDistanceSq;

        if (!withinCull || !inFrustum) {
          this.lod.visible = false;
          if (this.fullPlanet && shouldUnloadFull) {
            this.unloadFull();
          } else if (this.pendingLoadId != null) {
            this.unloadFull();
          }
          return;
        }

        this.lod.visible = true;

        if (shouldLoadFull && !this.fullPlanet) {
          this.loadFull();
        } else if (shouldUnloadFull) {
          this.unloadFull();
        }

        if (this.fullPlanet) {
          this.fullPlanet.update?.(delta, systemTime);
        }

        if (camera && this.lod.levels.length > 1) {
          this.lod.update(camera);
        }
      },
      dispose() {
        if (this.pendingLoadId != null) {
          cancelBackgroundTask(this.pendingLoadId);
          this.pendingLoadId = null;
        }
        this.pendingUnload = false;
        this.unloadFull();
        this.orbitGroup?.remove(this.lod);
        group.remove(this.orbitGroup);
        this.placeholderGeometry.dispose();
        this.placeholderMaterial.dispose();
      }
    });
  }

  return {
    group,
    star,
    planets,
    setVisible(isVisible) {
      const visible = Boolean(isVisible);
      this.group.visible = visible;
      this.star.setVisible?.(visible);
    },
    update(delta, observerPosition, visibilityContext = {}) {
      const { frustum, camera } = visibilityContext ?? {};
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
          this.star.setVisible?.(false);
          return;
        }
        
        this.group.visible = true;
        
        const starDistanceVisible = systemDistanceSq <= effectivePlanetCullSq;
        this.star.updateBillboard?.(systemDistanceSq, starBillboardDistanceSq);
        this.star.setVisible?.(true);
      } else {
        this.group.visible = true;
        this.star.updateBillboard?.(Infinity, starBillboardDistanceSq);
        this.star.setVisible?.(true);
      }

      this.star.update?.(systemTime);

      for (let i = 0; i < planets.length; i += 1) {
        planets[i].update(delta, observerPosition, systemPosition, { frustum, camera });
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

