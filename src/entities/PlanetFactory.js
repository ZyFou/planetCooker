import * as THREE from "three";
import { SeededRNG } from "../app/utils.js";
import { generateRockTexture, generateGasGiantTexture, generateSandTexture } from "../app/textures.js";

function createRockyMaterial(params, rng) {
  const baseColor = new THREE.Color().setHSL(rng.next(), 0.45 + rng.next() * 0.25, 0.35 + rng.next() * 0.25);
  const rockTexture = generateRockTexture({
    seed: `${params.seed || "rocky"}-rock`,
    color: `#${baseColor.getHexString()}`,
    resolution: 512,
    noiseScale: 6 + rng.next() * 4,
    noiseStrength: 0.35 + rng.next() * 0.25,
  });
  const sandTexture = generateSandTexture({
    seed: `${params.seed || "rocky"}-sand`,
    color: rockTexture.image ? `#${baseColor.clone().offsetHSL(0, -0.1, 0.1).getHexString()}` : `#${baseColor.getHexString()}`,
    resolution: 256,
  });

  rockTexture.wrapS = rockTexture.wrapT = THREE.RepeatWrapping;
  sandTexture.wrapS = sandTexture.wrapT = THREE.RepeatWrapping;

  const uniforms = {
    tRock: { value: rockTexture },
    tSand: { value: sandTexture },
    tSplat: { value: sandTexture },
    detailStrength: { value: 0.6 },
    lightDirection: { value: new THREE.Vector3(1, 1, 0.5).normalize() },
    lightColor: { value: new THREE.Color(0xffffff) },
    lightIntensity: { value: 1.0 },
    ambientLightColor: { value: new THREE.Color(0x404040) },
    ambientLightIntensity: { value: 0.35 },
    shadowMap: { value: null },
    shadowMatrix: { value: new THREE.Matrix4() },
  };

  const material = new THREE.MeshStandardMaterial({
    map: rockTexture,
    roughness: 0.85,
    metalness: 0.0,
    color: baseColor,
  });

  material.userData.uniforms = uniforms;
  return material;
}

function createGasGiantMaterial(params, rng) {
  const strataCount = Math.max(2, Math.min(6, Math.round(rng.nextFloat(3, 5))));
  const textureParams = {
    seed: `${params.seed || "gas"}-giant`,
    gasGiantStrataCount: strataCount,
    gasGiantNoiseScale: 2.5 + rng.next() * 2.0,
    gasGiantNoiseStrength: 0.05 + rng.next() * 0.2,
    gasGiantStrataWarp: 0.02 + rng.next() * 0.04,
    gasGiantStrataWarpScale: 3 + rng.next() * 2,
    noiseResolution: 1,
    gasResolution: 1,
  };
  let remaining = 1;
  for (let i = 1; i <= strataCount; i += 1) {
    const segment = i === strataCount ? remaining : THREE.MathUtils.clamp(rng.nextFloat(0.15, 0.35), 0.05, remaining);
    remaining = Math.max(0.05, remaining - segment);
    textureParams[`gasGiantStrataSize${i}`] = segment;
    const color = new THREE.Color().setHSL(rng.next(), 0.4 + rng.next() * 0.2, 0.45 + rng.next() * 0.2);
    textureParams[`gasGiantStrataColor${i}`] = `#${color.getHexString()}`;
  }

  const texture = generateGasGiantTexture(textureParams);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.4,
    metalness: 0.0,
    emissive: new THREE.Color(0x080808),
    emissiveIntensity: 0.2,
  });
  return material;
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `planet-${Math.random().toString(36).slice(2, 10)}`;
}

export class PlanetFactory {
  static create(params) {
    const radius = params.radius ?? 1;
    const seed = params.seed ?? Math.floor(Math.random() * 0xffffffff);
    const rng = new SeededRNG(seed);
    const geometry = new THREE.SphereGeometry(1, 64, 32);
    let material;
    if (params.type === "gas") {
      material = createGasGiantMaterial(params, rng.fork());
    } else {
      material = createRockyMaterial(params, rng.fork());
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = params.id || generateId();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.scale.setScalar(Math.max(0.1, radius));
    mesh.userData.baseRadius = 1;
    mesh.userData.seed = seed;
    return mesh;
  }
}
