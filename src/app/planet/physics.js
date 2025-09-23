import * as THREE from "three";

// A collection of temporary objects to avoid creating new ones on each frame.
const tmpVecA = new THREE.Vector3();
const tmpVecB = new THREE.Vector3();
const tmpVecC = new THREE.Vector3();

/**
 * Calculates the mass of the planet based on its radius and gravity.
 * @param {object} params - The planet's parameters.
 * @returns {number} The mass of the planet.
 */
export function getPlanetMass(params) {
  const radius = Math.max(0.1, params.radius);
  return params.gravity * radius * radius;
}

/**
 * Calculates the mass of a moon based on its size and a mass scale factor.
 * @param {object} moon - The moon's parameters.
 * @param {object} params - The global parameters, containing moonMassScale.
 * @returns {number} The mass of the moon.
 */
export function getMoonMass(moon, params) {
  const moonRadius = Math.max(0.05, moon.size || 0.15);
  const density = Math.max(0.05, params.moonMassScale);
  return Math.pow(moonRadius, 3) * density;
}

/**
 * Calculates the gravitational parameter (μ) for a two-body system.
 * @param {number} planetMass - The mass of the planet.
 * @param {number} [moonMass=0] - The mass of the moon.
 * @returns {number} The gravitational parameter.
 */
export function getGravParameter(planetMass, moonMass = 0) {
  return planetMass + moonMass;
}

/**
 * Computes the position of a body in a Keplerian orbit.
 * @param {number} semiMajor - The semi-major axis of the orbit.
 * @param {number} eccentricity - The eccentricity of the orbit.
 * @param {number} trueAnomaly - The true anomaly of the body.
 * @param {THREE.Vector3} [target=new THREE.Vector3()] - The vector to store the result in.
 * @returns {THREE.Vector3} The position vector of the body.
 */
export function computeOrbitPosition(semiMajor, eccentricity, trueAnomaly, target = new THREE.Vector3()) {
  const cosT = Math.cos(trueAnomaly);
  const sinT = Math.sin(trueAnomaly);
  const denom = Math.max(1e-6, 1 + eccentricity * cosT);
  const r = (semiMajor * (1 - eccentricity * eccentricity)) / denom;
  target.set(r * cosT, 0, r * sinT);
  return target;
}

/**
 * Computes the velocity of a body in a Keplerian orbit.
 * @param {number} semiMajor - The semi-major axis of the orbit.
 * @param {number} eccentricity - The eccentricity of the orbit.
 * @param {number} trueAnomaly - The true anomaly of the body.
 * @param {number} mu - The gravitational parameter of the system.
 * @param {THREE.Vector3} [target=new THREE.Vector3()] - The vector to store the result in.
 * @returns {THREE.Vector3} The velocity vector of the body.
 */
export function computeOrbitVelocity(semiMajor, eccentricity, trueAnomaly, mu, target = new THREE.Vector3()) {
  const sinT = Math.sin(trueAnomaly);
  const cosT = Math.cos(trueAnomaly);
  const safeA = Math.max(1e-6, semiMajor);
  const sqrtMuOverA = Math.sqrt(Math.max(1e-6, mu / safeA));
  const denom = Math.sqrt(Math.max(1e-6, 1 - eccentricity * eccentricity));
  const radial = sqrtMuOverA * eccentricity * sinT / denom;
  const transverse = sqrtMuOverA * (1 + eccentricity * cosT) / denom;
  const vx = radial * cosT - transverse * sinT;
  const vz = radial * sinT + transverse * cosT;
  target.set(vx, 0, vz);
  return target;
}

/**
 * Computes the acceleration of a body towards a central source.
 * @param {THREE.Vector3} targetPosition - The position of the body being accelerated.
 * @param {THREE.Vector3} sourcePosition - The position of the central source.
 * @param {number} mu - The gravitational parameter of the source.
 * @param {THREE.Vector3} [out=tmpVecA] - The vector to store the result in.
 * @returns {THREE.Vector3} The acceleration vector.
 */
export function computeAccelerationTowards(targetPosition, sourcePosition, mu, out = tmpVecA) {
  out.copy(sourcePosition).sub(targetPosition);
  const distSq = Math.max(1e-6, out.lengthSq());
  const dist = Math.sqrt(distSq);
  return out.multiplyScalar(-mu / (distSq * dist));
}

/**
 * Initializes the physics simulation for the moons.
 * This function is designed to be part of a larger class or module that manages the planet and its moons.
 * @param {object} context - The context containing all necessary objects and parameters.
 * Expected properties: params, planetRoot, moonsGroup, moonSettings, updateStabilityDisplay, updateOrbitMaterial, alignOrbitLineWithPivot.
 */
export function initMoonPhysics(context) {
  const { params, planetRoot, moonsGroup, moonSettings, updateStabilityDisplay, updateOrbitMaterial, alignOrbitLineWithPivot } = context;

  if (!params.physicsEnabled) {
    planetRoot.position.set(0, 0, 0);
    const planetVel = planetRoot.userData.planetVel || new THREE.Vector3();
    planetVel.set(0, 0, 0);
    planetRoot.userData.planetVel = planetVel;
    moonsGroup.children.forEach((pivot, index) => {
      const moon = moonSettings[index];
      const mesh = pivot.userData.mesh;
      if (!moon || !mesh) return;
      const semiMajor = Math.max(0.5, moon.distance || 3.5);
      const eccentricity = THREE.MathUtils.clamp(moon.eccentricity ?? 0, 0, 0.95);
      const phase = (moon.phase ?? 0) % (Math.PI * 2);
      computeOrbitPosition(semiMajor, eccentricity, phase, mesh.position);
      pivot.userData.physics = null;
      pivot.userData.trueAnomaly = phase;
      updateOrbitMaterial(pivot, true);
      alignOrbitLineWithPivot(pivot);
    });
    updateStabilityDisplay(moonSettings.length, moonSettings.length);
    return;
  }

  const planetMass = getPlanetMass(params);
  const planetVel = planetRoot.userData.planetVel || new THREE.Vector3();
  planetVel.set(0, 0, 0);
  planetRoot.userData.planetVel = planetVel;
  planetRoot.position.set(0, 0, 0);

  const totalMomentum = new THREE.Vector3(0, 0, 0);
  let totalMoonMass = 0;

  moonsGroup.children.forEach((pivot, index) => {
    const moon = moonSettings[index];
    const mesh = pivot.userData.mesh;
    if (!moon || !mesh) return;

    const semiMajor = Math.max(0.5, moon.distance || 3.5);
    const eccentricity = THREE.MathUtils.clamp(moon.eccentricity ?? 0, 0, 0.95);
    const phase = (moon.phase ?? 0) % (Math.PI * 2);

    computeOrbitPosition(semiMajor, eccentricity, phase, mesh.position);

    pivot.updateMatrixWorld(true);
    const posWorld = pivot.localToWorld(mesh.position.clone());
    const rotMatrix = new THREE.Matrix3().setFromMatrix4(pivot.matrixWorld);
    const moonMass = getMoonMass(moon, params);
    const mu = getGravParameter(planetMass, params.physicsTwoWay ? moonMass : 0);
    const velLocal = computeOrbitVelocity(semiMajor, eccentricity, phase, mu, new THREE.Vector3());
    const rawSpeedSetting = moon.orbitSpeed ?? 0.4;
    const speedMultiplier = (Math.sign(rawSpeedSetting) || 1) * Math.max(0.2, Math.abs(rawSpeedSetting));
    velLocal.multiplyScalar(speedMultiplier);
    const velWorld = velLocal.clone().applyMatrix3(rotMatrix);
    if (params.physicsTwoWay) {
      totalMomentum.add(new THREE.Vector3().copy(velWorld).multiplyScalar(moonMass));
      totalMoonMass += moonMass;
    }

    pivot.userData.physics = {
      posWorld,
      velWorld,
      mass: moonMass,
      mu,
      bound: true,
      energy: 0
    };
    pivot.userData.trueAnomaly = phase;
    updateOrbitMaterial(pivot, true);
    alignOrbitLineWithPivot(pivot);
  });

  if (params.physicsTwoWay && totalMoonMass > 0) {
    planetVel.copy(totalMomentum).multiplyScalar(-1 / Math.max(1e-6, planetMass));
  }

  updateStabilityDisplay(moonSettings.length, moonSettings.length);
}

/**
 * Resets the physics simulation for the moons.
 * @param {object} context - The context containing all necessary objects and parameters.
 */
export function resetMoonPhysics(context) {
    context.moonsGroup.children.forEach((pivot) => {
    if (pivot.userData.trajectoryHistory) {
      pivot.userData.trajectoryHistory = [];
    }
  });
  initMoonPhysics(context);
}

/**
 * Steps the physics simulation forward by a time step `dt`.
 * @param {number} dt - The time step.
 * @param {object} context - The context containing all necessary objects and parameters.
 */
export function stepMoonPhysics(dt, context) {
    const {
        params, planetRoot, moonsGroup, moonSettings, coreMesh,
        updateStabilityDisplay, updateOrbitMaterial, updateTrajectoryHistory,
        spawnExplosion, applyImpactDeformation,
        syncDebugMoonArtifacts, rebuildMoonControls, guiControllers
    } = context;

  if (!params.physicsEnabled) return;

  const substeps = Math.max(1, Math.round(params.physicsSubsteps || 1));
  const h = dt / substeps;
  const planetMass = getPlanetMass(params);
  const planetVel = planetRoot.userData.planetVel || new THREE.Vector3();
  const damping = Math.max(0, 1 - params.physicsDamping);
  const collidedIndices = new Set();

  for (let s = 0; s < substeps; s += 1) {
    const planetWorld = planetRoot.getWorldPosition(tmpVecB);

    moonsGroup.children.forEach((pivot, index) => {
      const phys = pivot.userData.physics;
      const mesh = pivot.userData.mesh;
      const moon = moonSettings[index];
      if (!phys || !mesh || !moon) return;
      if (pivot.userData._collided) return;

      phys.mu = getGravParameter(planetMass, params.physicsTwoWay ? phys.mass : 0);

      const acc = computeAccelerationTowards(planetWorld, phys.posWorld, phys.mu, tmpVecA);
      phys.posWorld.addScaledVector(phys.velWorld, h).addScaledVector(acc, 0.5 * h * h);

      const nextAcc = computeAccelerationTowards(planetWorld, phys.posWorld, phys.mu, tmpVecC);
      phys.velWorld.add(acc.add(nextAcc).multiplyScalar(0.5 * h));
      if (params.physicsDamping > 0) {
        phys.velWorld.multiplyScalar(damping);
      }

      if (params.physicsTwoWay) {
        const planetAcc = nextAcc.multiplyScalar(-phys.mass / Math.max(1e-6, planetMass));
        planetVel.addScaledVector(planetAcc, h);
      }

      pivot.updateMatrixWorld(true);
      mesh.position.copy(pivot.worldToLocal(phys.posWorld.clone()));

      updateTrajectoryHistory(pivot, phys.posWorld.clone());

      const rVec = tmpVecA.copy(phys.posWorld).sub(planetWorld);
      const dist = Math.max(1e-5, rVec.length());
      const speedSq = phys.velWorld.lengthSq();
      phys.energy = 0.5 * speedSq - phys.mu / dist;
      phys.bound = phys.energy < 0 && dist < params.radius * 140;
      updateOrbitMaterial(pivot, phys.bound);

      const moonRadius = mesh.scale.x;
      const collisionRadius = Math.max(0.1, params.radius) + moonRadius * 0.95;
      if (dist <= collisionRadius) {
        pivot.userData._collided = true;
        collidedIndices.add(index);
      }

      if (params.coreEnabled && coreMesh) {
        const coreRadius = params.radius * params.coreSize;
        const coreDist = Math.max(1e-5, phys.posWorld.length());
        if (coreDist <= coreRadius + moonRadius * 0.8) {
          pivot.userData._collided = true;
          collidedIndices.add(index);
          pivot.userData._hitCore = true;
        }
      }
    });
  }

  planetRoot.position.set(0, 0, 0);
  planetRoot.updateMatrixWorld(true);
  planetRoot.userData.planetVel = planetVel;

  let boundCount = 0;
  moonsGroup.children.forEach((pivot) => {
    if (pivot.userData.physics?.bound !== false) {
      boundCount += 1;
    }
  });
  updateStabilityDisplay(boundCount, moonSettings.length);

  if (collidedIndices.size > 0) {
    const indices = Array.from(collidedIndices).sort((a, b) => b - a);
    indices.forEach((idx) => {
      const pivot = moonsGroup.children[idx];
      if (!pivot) return;
      const mesh = pivot.userData.mesh;
      const phys = pivot.userData.physics;
      const color = mesh?.material?.color || new THREE.Color(0xffaa66);
      const pos = phys?.posWorld || pivot.getWorldPosition(new THREE.Vector3());
      const strength = Math.max(0.3, (mesh?.scale?.x || 0.2) / Math.max(0.1, params.radius));
      const isCoreCollision = pivot.userData._hitCore;

      if (params.planetType === 'gas_giant') {
        params.radius = Math.max(0.1, params.radius * 0.995);
        guiControllers.radius?.setValue?.(params.radius);
        spawnExplosion(pos, color, strength * 0.2);
      } else {
        if (params.impactDeformation && mesh && !isCoreCollision) {
            const moonRadius = mesh.scale.x;
            const planetWorldPos = planetRoot.getWorldPosition(new THREE.Vector3());
            const surfaceNormal = new THREE.Vector3().copy(pos).sub(planetWorldPos).normalize();
            const impactPoint = new THREE.Vector3().copy(planetWorldPos).addScaledVector(surfaceNormal, Math.max(0.01, params.radius));
            const velocity = phys?.velWorld ? phys.velWorld.clone() : new THREE.Vector3();
            const speed = velocity.length();
            const mass = phys?.mass ?? 1;
            const travelAlongSurface = velocity.clone().projectOnPlane(surfaceNormal);
            const hasTangent = travelAlongSurface.lengthSq() > 1e-8;
            const tangentDir = hasTangent ? travelAlongSurface.normalize() : new THREE.Vector3(1, 0, 0);
            const incidence = Math.acos(THREE.MathUtils.clamp(velocity.clone().normalize().negate().dot(surfaceNormal), -1, 1));
            const radiusScale = 0.9 + (params.impactSpeedMul || 0.55) * Math.min(3, speed);
            const impactRadius = moonRadius * radiusScale;
            const momentumScale = Math.pow(Math.max(1e-6, mass), 0.45) * (0.6 + (params.impactSpeedMul || 0.55) * Math.min(3, speed));
            const sizeFactor = THREE.MathUtils.clamp(0.8 + Math.pow(Math.max(0.05, moonRadius), 0.92) * 3.6, 0.9, 5.2);
            const normalHitScale = 0.5 + 0.5 * Math.max(0, Math.cos(incidence));
            const impactStrength = THREE.MathUtils.clamp((params.impactStrengthMul || 1) * strength * (params.impactMassMul || 1) * momentumScale * normalHitScale * sizeFactor, 0.3, 5.5);

            applyImpactDeformation(impactPoint, impactRadius, {
              strength: impactStrength,
              directionWorld: tangentDir,
              obliquity: incidence
            });
        }
        if (isCoreCollision) {
          const coreColor = new THREE.Color(params.colorCore);
          spawnExplosion(pos, coreColor, 3 * strength);
        } else {
          spawnExplosion(pos, color, 2 * strength);
        }
      }

      if (pivot.userData.orbit) {
        context.orbitLinesGroup.remove(pivot.userData.orbit);
        if (pivot.userData.orbit.geometry) pivot.userData.orbit.geometry.dispose();
        if (pivot.userData.orbit.material) pivot.userData.orbit.material.dispose();
        pivot.userData.orbit = null;
      }
      if (mesh && mesh.parent) {
        mesh.parent.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      }
      moonsGroup.remove(pivot);
      moonSettings.splice(idx, 1);
    });
    params.moonCount = moonSettings.length;
    try { guiControllers.moonCount?.updateDisplay?.(); } catch {}
    syncDebugMoonArtifacts();
    rebuildMoonControls();
    updateStabilityDisplay(moonSettings.length, moonSettings.length);
  }
}
