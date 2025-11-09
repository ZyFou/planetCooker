import * as THREE from "three";
import { clamp } from "./planetSampler.js";

function colorHexFromHsl(h, s, l) {
  const color = new THREE.Color().setHSL(
    (h % 1 + 1) % 1,
    THREE.MathUtils.clamp(s, 0, 1),
    THREE.MathUtils.clamp(l, 0, 1)
  );
  return `#${color.getHexString()}`;
}

function jitter(rng, base, amplitude) {
  return base + (rng.next() - 0.5) * amplitude * 2;
}

function generateRockyColors(rng, baseHue) {
  const waterHue = (baseHue + 0.55 + rng.nextFloat(-0.05, 0.05)) % 1;
  const landHue = (baseHue + rng.nextFloat(-0.08, 0.08)) % 1;
  const highHue = (baseHue + rng.nextFloat(-0.05, 0.05)) % 1;

  return {
    colorDeepWater: colorHexFromHsl(waterHue, jitter(rng, 0.65, 0.15), jitter(rng, 0.2, 0.08)),
    colorShallowWater: colorHexFromHsl(waterHue, jitter(rng, 0.55, 0.2), jitter(rng, 0.35, 0.1)),
    colorBeach: colorHexFromHsl(landHue, jitter(rng, 0.3, 0.1), jitter(rng, 0.65, 0.1)),
    colorGrass: colorHexFromHsl(landHue, jitter(rng, 0.5, 0.15), jitter(rng, 0.35, 0.1)),
    colorForest: colorHexFromHsl(landHue, jitter(rng, 0.6, 0.1), jitter(rng, 0.25, 0.08)),
    colorMountain: colorHexFromHsl(highHue, jitter(rng, 0.25, 0.1), jitter(rng, 0.45, 0.1)),
    colorMountainHigh: colorHexFromHsl(highHue, jitter(rng, 0.18, 0.08), jitter(rng, 0.55, 0.1)),
    colorSnow: colorHexFromHsl(highHue, jitter(rng, 0.08, 0.05), jitter(rng, 0.82, 0.05))
  };
}

function generateGasColors(rng, baseHue) {
  const primaryHue = (baseHue + rng.nextFloat(-0.05, 0.05)) % 1;
  const secondaryHue = (primaryHue + rng.nextFloat(0.08, 0.18)) % 1;
  const tertiaryHue = (primaryHue + rng.nextFloat(-0.12, 0.12)) % 1;

  return {
    gasColor1: colorHexFromHsl(primaryHue, jitter(rng, 0.45, 0.1), jitter(rng, 0.5, 0.1)),
    gasColor2: colorHexFromHsl(secondaryHue, jitter(rng, 0.35, 0.1), jitter(rng, 0.6, 0.1)),
    gasColor3: colorHexFromHsl(tertiaryHue, jitter(rng, 0.4, 0.1), jitter(rng, 0.65, 0.1)),
    gasColor4: colorHexFromHsl(primaryHue, jitter(rng, 0.3, 0.1), jitter(rng, 0.4, 0.1)),
    gasColor5: colorHexFromHsl(secondaryHue, jitter(rng, 0.25, 0.1), jitter(rng, 0.7, 0.1))
  };
}

function computeTemperatureProxy(starLuminosity, orbitalDistance) {
  const distance = Math.max(orbitalDistance, 0.5);
  return starLuminosity / (distance * distance);
}

export function generatePlanetParams(rng, context = {}) {
  if (!rng || typeof rng.next !== "function") {
    throw new Error("generatePlanetParams requires a SeededRNG-compatible instance");
  }

  const {
    seed = `PLANET-${Math.floor(rng.nextFloat(0, 1e9))}`,
    starLuminosity = 1.0,
    orbitalDistance = 10.0,
    typeBias = null
  } = context;

  const temperature = computeTemperatureProxy(starLuminosity, orbitalDistance);
  const baseHue = (rng.next() + orbitalDistance * 0.02) % 1;

  let planetType;
  if (typeBias === "gas" || typeBias === "rocky") {
    planetType = typeBias === "gas" ? "gas" : "earth";
  } else if (temperature < 0.15 && orbitalDistance > 25) {
    planetType = rng.next() < 0.6 ? "gas" : "earth";
  } else if (temperature > 1.8 && orbitalDistance < 8) {
    planetType = "earth";
  } else {
    planetType = rng.next() < 0.35 ? "gas" : "earth";
  }

  if (planetType === "gas") {
    const size = rng.nextFloat(1.8, 4.8);
    const stripeFrequency = rng.nextFloat(1.6, 4.2);
    const turbulence = rng.nextFloat(0.4, 0.85);
    const colors = generateGasColors(rng, baseHue);

    return {
      seed,
      planetType: "gas",
      gasPlanetSize: size,
      gasStripeSpeed: rng.nextFloat(0.008, 0.022),
      gasStripeFrequency: stripeFrequency,
      gasStripeSharpness: rng.nextFloat(1.5, 3.8),
      gasTurbulence: turbulence,
      atmosphereColor: colorHexFromHsl(baseHue, 0.25, 0.65),
      atmosphereDensity: clamp(0.2 + rng.nextFloat(-0.05, 0.2), 0, 1),
      rotationSpeed: rng.nextFloat(0.02, 0.12),
      axisTilt: rng.nextFloat(-35, 35),
      cloudsOpacity: 0.0,
      ...colors
    };
  }

  // Rocky / terrestrial planet path
  const size = rng.nextFloat(0.55, 1.8);
  const seaLevel = clamp(rng.nextFloat(0.25, 0.75), 0, 1);
  const roughness = rng.nextFloat(0.35, 0.75);
  const continentSize = rng.nextFloat(0.8, 2.8);
  const colors = generateRockyColors(rng, baseHue);

  return {
    seed,
    planetType: "earth",
    planetSize: size,
    seaLevel,
    continentSize,
    mountainHeight: rng.nextFloat(0.25, 0.8),
    roughness,
    detail: rng.nextFloat(4.0, 7.5),
    noiseVariant: clamp(rng.next(), 0, 1),
    noiseType: rng.nextFloat(0, 3),
    iceCapThreshold: clamp(rng.nextFloat(0.75, 0.95), 0, 1),
    atmosphereColor: colorHexFromHsl(baseHue + 0.5, 0.4, 0.6),
    atmosphereDensity: clamp(rng.nextFloat(0.2, 0.6), 0, 1),
    cloudsOpacity: clamp(temperature > 1.2 ? rng.nextFloat(0.05, 0.3) : rng.nextFloat(0.25, 0.65), 0, 1),
    rotationSpeed: rng.nextFloat(0.01, 0.08),
    axisTilt: rng.nextFloat(-40, 40),
    ...colors
  };
}

