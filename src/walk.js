console.log('=== WALK.JS LOADING ===');

import "./walk.css";
import * as THREE from "three";
import { decodeShare as decodeShareExt } from "./app/shareCore.js";

console.log('=== WALK.JS IMPORTS LOADED ===');

const WORLD_UP = new THREE.Vector3(0, 1, 0);

const tempForward = new THREE.Vector3();
const tempRight = new THREE.Vector3();
const tempMovement = new THREE.Vector3();
const tempEye = new THREE.Vector3();
const tempLookTarget = new THREE.Vector3();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

const ROCKY_NOISE_TYPES = {
  classic: 0,
  ridged: 1,
  billowy: 2,
  warped: 3
};

function resolveRockyNoiseType(value) {
  if (typeof value === "number") {
    return clamp(value, 0, 3);
  }
  if (typeof value === "string") {
    const key = value.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ROCKY_NOISE_TYPES, key)) {
      return ROCKY_NOISE_TYPES[key];
    }
  }
  return ROCKY_NOISE_TYPES.classic;
}

function parseLandingParameters() {
  const search = new URLSearchParams(window.location.search);
  const shareCode = search.get("share");
  if (!shareCode) {
    throw new Error("Missing planet configuration share code");
  }

  let decoded;
  try {
    decoded = decodeShareExt(shareCode);
  } catch (error) {
    throw new Error("Failed to decode planet share code");
  }

  const data = decoded?.data ?? decoded;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid planet configuration payload");
  }

  const lat = parseFloat(search.get("lat") ?? "0");
  const lon = parseFloat(search.get("lon") ?? "0");

  return {
    params: { ...data },
    spawnLat: isFinite(lat) ? lat : 0,
    spawnLon: isFinite(lon) ? lon : 0
  };
}

function getEffectiveRadius(params) {
  if (params.planetType === "gas") {
    if (typeof params.gasPlanetSize === "number" && !Number.isNaN(params.gasPlanetSize)) {
      return params.gasPlanetSize;
    }
  }
  if (typeof params.radius === "number" && !Number.isNaN(params.radius)) {
    return params.radius;
  }
  if (typeof params.planetSize === "number" && !Number.isNaN(params.planetSize)) {
    return params.planetSize;
  }
  return 1.0;
}

function sphericalToCartesian(lat, lon) {
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    cosLat * Math.cos(lon),
    Math.sin(lat),
    cosLat * Math.sin(lon)
  ).normalize();
}

function permuteScalar(x) {
  return ((x * 34.0 + 1.0) * x) % 289.0;
}

function taylorInvSqrt(r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function snoise(v) {
  const Cx = 1.0 / 6.0;
  const Cy = 1.0 / 3.0;

  const i = [
    Math.floor(v[0] + (v[0] + v[1] + v[2]) * Cy),
    Math.floor(v[1] + (v[0] + v[1] + v[2]) * Cy),
    Math.floor(v[2] + (v[0] + v[1] + v[2]) * Cy)
  ];

  const x0 = [
    v[0] - i[0] + (i[0] + i[1] + i[2]) * Cx,
    v[1] - i[1] + (i[0] + i[1] + i[2]) * Cx,
    v[2] - i[2] + (i[0] + i[1] + i[2]) * Cx
  ];

  const g = [
    x0[1] >= x0[0] ? 1 : 0,
    x0[2] >= x0[1] ? 1 : 0,
    x0[0] >= x0[2] ? 1 : 0
  ];
  const l = [1 - g[0], 1 - g[1], 1 - g[2]];

  const i1 = [
    Math.min(g[0], l[2]),
    Math.min(g[1], l[0]),
    Math.min(g[2], l[1])
  ];
  const i2 = [
    Math.max(g[0], l[2]),
    Math.max(g[1], l[0]),
    Math.max(g[2], l[1])
  ];

  const x1 = [x0[0] - i1[0] + Cx, x0[1] - i1[1] + Cx, x0[2] - i1[2] + Cx];
  const x2 = [x0[0] - i2[0] + 2.0 * Cx, x0[1] - i2[1] + 2.0 * Cx, x0[2] - i2[2] + 2.0 * Cx];
  const x3 = [x0[0] - 1.0 + 3.0 * Cx, x0[1] - 1.0 + 3.0 * Cx, x0[2] - 1.0 + 3.0 * Cx];

  const iMod = [i[0] % 289.0, i[1] % 289.0, i[2] % 289.0];

  const perm1 = [
    permuteScalar(iMod[2]),
    permuteScalar(iMod[2] + i1[2]),
    permuteScalar(iMod[2] + i2[2]),
    permuteScalar(iMod[2] + 1.0)
  ];

  const perm2 = [
    permuteScalar(perm1[0] + iMod[1]),
    permuteScalar(perm1[1] + iMod[1] + i1[1]),
    permuteScalar(perm1[2] + iMod[1] + i2[1]),
    permuteScalar(perm1[3] + iMod[1] + 1.0)
  ];

  const p = [
    permuteScalar(perm2[0] + iMod[0]),
    permuteScalar(perm2[1] + iMod[0] + i1[0]),
    permuteScalar(perm2[2] + iMod[0] + i2[0]),
    permuteScalar(perm2[3] + iMod[0] + 1.0)
  ];

  const n_ = 1.0 / 7.0;
  const ns = [n_ * 2.0 - 0.0, n_ * 1.0 - 0.5, n_ * 0.0 - 1.0];

  const j = [
    p[0] - 49.0 * Math.floor(p[0] * ns[2] * ns[2]),
    p[1] - 49.0 * Math.floor(p[1] * ns[2] * ns[2]),
    p[2] - 49.0 * Math.floor(p[2] * ns[2] * ns[2]),
    p[3] - 49.0 * Math.floor(p[3] * ns[2] * ns[2])
  ];

  const x_ = [Math.floor(j[0] * ns[2]), Math.floor(j[1] * ns[2]), Math.floor(j[2] * ns[2]), Math.floor(j[3] * ns[2])];
  const y_ = [
    Math.floor(j[0] - 7.0 * x_[0]),
    Math.floor(j[1] - 7.0 * x_[1]),
    Math.floor(j[2] - 7.0 * x_[2]),
    Math.floor(j[3] - 7.0 * x_[3])
  ];

  const x = [
    x_[0] * ns[0] + ns[1],
    x_[1] * ns[0] + ns[1],
    x_[2] * ns[0] + ns[1],
    x_[3] * ns[0] + ns[1]
  ];
  const y = [
    y_[0] * ns[0] + ns[1],
    y_[1] * ns[0] + ns[1],
    y_[2] * ns[0] + ns[1],
    y_[3] * ns[0] + ns[1]
  ];

  const h = [1.0 - Math.abs(x[0]) - Math.abs(y[0]), 1.0 - Math.abs(x[1]) - Math.abs(y[1]), 1.0 - Math.abs(x[2]) - Math.abs(y[2]), 1.0 - Math.abs(x[3]) - Math.abs(y[3])];

  const b0 = [x[0], x[1], y[0], y[1]];
  const b1 = [x[2], x[3], y[2], y[3]];

  const s0 = [Math.floor(b0[0]) * 2.0 + 1.0, Math.floor(b0[1]) * 2.0 + 1.0, Math.floor(b0[2]) * 2.0 + 1.0, Math.floor(b0[3]) * 2.0 + 1.0];
  const s1 = [Math.floor(b1[0]) * 2.0 + 1.0, Math.floor(b1[1]) * 2.0 + 1.0, Math.floor(b1[2]) * 2.0 + 1.0, Math.floor(b1[3]) * 2.0 + 1.0];
  const sh = [h[0] < 0 ? -1 : 0, h[1] < 0 ? -1 : 0, h[2] < 0 ? -1 : 0, h[3] < 0 ? -1 : 0];

  const a0 = [
    b0[0] + s0[0] * sh[0],
    b0[2] + s0[2] * sh[0],
    b0[1] + s0[1] * sh[1],
    b0[3] + s0[3] * sh[1]
  ];
  const a1 = [
    b1[0] + s1[0] * sh[2],
    b1[2] + s1[2] * sh[2],
    b1[1] + s1[1] * sh[3],
    b1[3] + s1[3] * sh[3]
  ];

  const grad = [
    [a0[0], a0[1], h[0]],
    [a0[2], a0[3], h[1]],
    [a1[0], a1[1], h[2]],
    [a1[2], a1[3], h[3]]
  ];

  const norm = [
    taylorInvSqrt(dot3(grad[0], grad[0])),
    taylorInvSqrt(dot3(grad[1], grad[1])),
    taylorInvSqrt(dot3(grad[2], grad[2])),
    taylorInvSqrt(dot3(grad[3], grad[3]))
  ];
  for (let idx = 0; idx < 4; idx += 1) {
    grad[idx][0] *= norm[idx];
    grad[idx][1] *= norm[idx];
    grad[idx][2] *= norm[idx];
  }

  const m = [
    Math.max(0.6 - dot3(x0, x0), 0.0),
    Math.max(0.6 - dot3(x1, x1), 0.0),
    Math.max(0.6 - dot3(x2, x2), 0.0),
    Math.max(0.6 - dot3(x3, x3), 0.0)
  ];

  const m2 = [m[0] * m[0], m[1] * m[1], m[2] * m[2], m[3] * m[3]];
  const dotProducts = [
    dot3(grad[0], x0),
    dot3(grad[1], x1),
    dot3(grad[2], x2),
    dot3(grad[3], x3)
  ];

  return 42.0 * (m2[0] * m2[0] * dotProducts[0] + m2[1] * m2[1] * dotProducts[1] + m2[2] * m2[2] * dotProducts[2] + m2[3] * m2[3] * dotProducts[3]);
}

function fbm(p, octaves, persistence, lacunarity) {
  let amplitude = 1.0;
  let frequency = 1.0;
  let total = 0.0;
  let normalization = 0.0;

  for (let i = 0; i < octaves; i += 1) {
    const scaled = [p[0] * frequency, p[1] * frequency, p[2] * frequency];
    total += amplitude * snoise(scaled);
    normalization += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return normalization > 0 ? total / normalization : 0;
}

function fbmBillow(p, octaves, persistence, lacunarity) {
  let amplitude = 1.0;
  let frequency = 1.0;
  let total = 0.0;
  let normalization = 0.0;

  for (let i = 0; i < octaves; i += 1) {
    const scaled = [p[0] * frequency, p[1] * frequency, p[2] * frequency];
    let n = snoise(scaled);
    n = Math.abs(n);
    total += n * amplitude;
    normalization += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return normalization > 0 ? total / normalization : 0;
}

function fbmRidged(p, octaves, persistence, lacunarity) {
  let amplitude = 0.5;
  let frequency = 1.0;
  let total = 0.0;
  let weight = 1.0;

  for (let i = 0; i < 8; i += 1) {
    if (i >= octaves) break;
    const scaled = [p[0] * frequency, p[1] * frequency, p[2] * frequency];
    let n = snoise(scaled);
    n = 1.0 - Math.abs(n);
    n *= n;
    n *= weight;
    total += n * amplitude;
    weight = clamp(n * 4.0, 0.0, 1.0);
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return total * 2.0;
}

function domainWarp(p, warpStrength, warpFrequency, variant) {
  const q = [
    snoise([p[0] * warpFrequency, p[1] * warpFrequency, p[2] * warpFrequency]),
    snoise([p[0] * warpFrequency + 43.0, p[1] * warpFrequency + 17.0, p[2] * warpFrequency + 29.0]),
    snoise([p[0] * warpFrequency + 23.0, p[1] * warpFrequency + 71.0, p[2] * warpFrequency + 11.0])
  ];

  const r = [
    snoise([
      p[0] * warpFrequency * 2.0 + q[0] * (0.5 + variant) + 19.0,
      p[1] * warpFrequency * 2.0 + q[1] * (0.5 + variant) + 39.0,
      p[2] * warpFrequency * 2.0 + q[2] * (0.5 + variant) + 57.0
    ]),
    snoise([
      p[0] * warpFrequency * 2.0 + q[0] * (0.5 + variant) + 59.0,
      p[1] * warpFrequency * 2.0 + q[1] * (0.5 + variant) + 11.0,
      p[2] * warpFrequency * 2.0 + q[2] * (0.5 + variant) + 83.0
    ]),
    snoise([
      p[0] * warpFrequency * 2.0 + q[0] * (0.5 + variant) + 17.0,
      p[1] * warpFrequency * 2.0 + q[1] * (0.5 + variant) + 93.0,
      p[2] * warpFrequency * 2.0 + q[2] * (0.5 + variant) + 41.0
    ])
  ];

  return [
    (q[0] + r[0]) * warpStrength,
    (q[1] + r[1]) * warpStrength,
    (q[2] + r[2]) * warpStrength
  ];
}

class TerrainSampler {
  constructor(params, baseLatitude, baseLongitude, radius) {
    this.params = params;
    this.baseLatitude = baseLatitude;
    this.baseLongitude = baseLongitude;
    this.radius = radius;
    this.planetScale = radius;

    this.tempDir = new THREE.Vector3();
    this.tempArray = [0, 0, 0];

    this.seaLevel = typeof params.seaLevel === "number" ? params.seaLevel : 0.52;
    this.mountainHeight = typeof params.mountainHeight === "number" ? params.mountainHeight : 0.4;
    this.continentSize = typeof params.continentSize === "number" ? params.continentSize : 1.5;
    this.roughness = typeof params.roughness === "number" ? params.roughness : 0.55;
    this.detail = typeof params.detail === "number" ? params.detail : 6.0;
    this.noiseVariant = clamp(typeof params.noiseVariant === "number" ? params.noiseVariant : 0.5, 0, 1);
    this.noiseType = resolveRockyNoiseType(params.noiseType);
    this.iceCapThreshold = typeof params.iceCapThreshold === "number" ? params.iceCapThreshold : 0.9;

    this.colors = {
      deepWater: new THREE.Color(params.colorDeepWater ?? "#002b4d"),
      shallowWater: new THREE.Color(params.colorShallowWater ?? "#006994"),
      beach: new THREE.Color(params.colorBeach ?? "#d4c6a3"),
      grass: new THREE.Color(params.colorGrass ?? "#2a602a"),
      forest: new THREE.Color(params.colorForest ?? "#1a381a"),
      mountain: new THREE.Color(params.colorMountain ?? "#666666"),
      mountainHigh: new THREE.Color(params.colorMountainHigh ?? "#888888"),
      snow: new THREE.Color(params.colorSnow ?? "#ffffff")
    };

    this.tempColor = new THREE.Color();
    this.tempColorB = new THREE.Color();

    this.minLatitude = -Math.PI / 2 + 0.001;
    this.maxLatitude = Math.PI / 2 - 0.001;
  }

  computeFinalHeight(dir) {
    const p = this.tempArray;
    p[0] = dir.x * this.continentSize;
    p[1] = dir.y * this.continentSize;
    p[2] = dir.z * this.continentSize;

    const h = fbm(p, 8, this.roughness, this.detail);

    const hmCoord = [
      p[0] * (3.0 + this.noiseVariant),
      p[1] * (3.0 + this.noiseVariant),
      p[2] * (3.0 + this.noiseVariant)
    ];
    let hm = fbm(hmCoord, 4, this.roughness, this.detail * (1.4 + this.noiseVariant * 0.3));
    hm = 1.0 - Math.abs(hm);
    hm = Math.pow(hm, 3.0);

    const ridged = fbmRidged([
      p[0] * (2.0 + this.noiseVariant),
      p[1] * (2.0 + this.noiseVariant),
      p[2] * (2.0 + this.noiseVariant)
    ], 6, THREE.MathUtils.lerp(0.35, this.roughness, 0.6), this.detail + 0.5);

    const billow = fbmBillow([
      p[0] * (1.2 + this.noiseVariant * 0.6),
      p[1] * (1.2 + this.noiseVariant * 0.6),
      p[2] * (1.2 + this.noiseVariant * 0.6)
    ], 6, THREE.MathUtils.lerp(0.5, this.roughness, 0.5), this.detail * (0.9 + this.noiseVariant * 0.4));

    const warpedCoord = domainWarp(p, THREE.MathUtils.lerp(0.18, 0.55, this.noiseVariant), 1.3 + this.noiseVariant * 2.2, this.noiseVariant);
    const warped = fbm(warpedCoord, 6, this.roughness, this.detail * (1.1 + this.noiseVariant * 0.3));

    let finalHeight;
    if (this.noiseType < 0.5) {
      finalHeight = (h * 0.55 + hm * 0.45) + 0.5;
    } else if (this.noiseType < 1.5) {
      finalHeight = THREE.MathUtils.lerp(h + 0.5, h * 0.35 + ridged * 0.65 + 0.5, 0.75);
    } else if (this.noiseType < 2.5) {
      finalHeight = THREE.MathUtils.lerp(h + 0.5, billow * 0.75 + 0.25, 0.7);
    } else {
      const blend = THREE.MathUtils.lerp(0.6, 0.85, this.noiseVariant);
      finalHeight = THREE.MathUtils.lerp(h + 0.5, warped * blend + 0.5 * (1.0 - blend), blend);
    }

    return clamp(finalHeight, 0.0, 1.4);
  }

  writeColor(target, vertexIndex, finalHeight, latitude) {
    const seaLevel = this.seaLevel;
    const colors = this.colors;
    const color = this.tempColor;

    if (finalHeight <= seaLevel) {
      const waterDepth = smoothstep(seaLevel - 0.2, seaLevel, finalHeight);
      color.copy(colors.deepWater).lerp(colors.shallowWater, waterDepth);
    } else {
      const alt = smoothstep(seaLevel, 1.0, finalHeight);
      color.copy(colors.beach);
      color.lerp(colors.grass, smoothstep(0.0, 0.05, alt));
      color.lerp(colors.forest, smoothstep(0.05, 0.3, alt));
      color.lerp(colors.mountain, smoothstep(0.3, 0.5, alt));
      color.lerp(colors.mountainHigh, smoothstep(0.5, 0.7, alt));
    }

    const ice = smoothstep(this.iceCapThreshold - 0.1, this.iceCapThreshold, latitude);
    if (ice > 0) {
      if (finalHeight <= seaLevel) {
        this.tempColorB.copy(colors.snow).multiplyScalar(0.9);
        color.lerp(this.tempColorB, ice);
      } else {
        color.lerp(colors.snow, ice);
      }
    }

    const baseIndex = vertexIndex * 3;
    target[baseIndex] = color.r;
    target[baseIndex + 1] = color.g;
    target[baseIndex + 2] = color.b;
  }

  sampleAtPlane(x, z) {
    const lat = THREE.MathUtils.clamp(
      this.baseLatitude + z / this.radius,
      this.minLatitude,
      this.maxLatitude
    );
    const avgLat = (this.baseLatitude + lat) * 0.5;
    const cosLat = Math.max(0.0001, Math.cos(avgLat));
    let lon = this.baseLongitude + x / (this.radius * cosLat);
    lon = ((lon + Math.PI) % (2 * Math.PI)) - Math.PI;

    const dir = sphericalToCartesian(lat, lon);
    const finalHeight = this.computeFinalHeight(dir);
    const relief = finalHeight - this.seaLevel;
    const displacement = relief > 0
      ? relief * this.mountainHeight * 0.3 * this.planetScale
      : 0;
    const latitude = Math.abs(dir.y);
    return { finalHeight, displacement, latitude };
  }
}

const rebuildQueue = [];

function scheduleChunkRebuild(chunk) {
  if (chunk.isQueued) return;
  chunk.isQueued = true;
  rebuildQueue.push(chunk);
}

class TerrainChunk {
  constructor(size, resolution, sampler) {
    this.size = size;
    this.resolution = resolution;
    this.sampler = sampler;
    this.coordX = Number.NaN;
    this.coordZ = Number.NaN;
    this.pendingWorldX = 0;
    this.pendingWorldZ = 0;
    this.isQueued = false;

    this.geometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
    this.geometry.rotateX(-Math.PI / 2);

    const vertexCount = this.geometry.attributes.position.count;
    this.colorArray = new Float32Array(vertexCount * 3);
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colorArray, 3));

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: false,
      roughness: 0.95,
      metalness: 0.0
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
  }

  setCoordinate(chunkX, chunkZ) {
    if (this.coordX === chunkX && this.coordZ === chunkZ) return;
    this.coordX = chunkX;
    this.coordZ = chunkZ;

    const worldX = chunkX * this.size;
    const worldZ = chunkZ * this.size;
    this.mesh.position.set(worldX, 0, worldZ);
    this.pendingWorldX = worldX;
    this.pendingWorldZ = worldZ;
    scheduleChunkRebuild(this);
  }

  rebuild(worldX, worldZ) {
    const positions = this.geometry.attributes.position;
    const vertexCount = positions.count;

    for (let i = 0; i < vertexCount; i += 1) {
      const localX = positions.getX(i);
      const localZ = positions.getZ(i);
      const planeX = worldX + localX;
      const planeZ = worldZ + localZ;
      const sample = this.sampler.sampleAtPlane(planeX, planeZ);
      positions.setY(i, sample.displacement);
      this.sampler.writeColor(this.colorArray, i, sample.finalHeight, sample.latitude);
    }

    positions.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.attributes.normal.needsUpdate = true;
  }
}

function showFatal(message) {
  const loading = document.getElementById("loading-screen");
  if (loading) {
    loading.textContent = message;
  } else {
    alert(message); // eslint-disable-line no-alert
  }
  throw new Error(message);
}

let landingConfig;
try {
  landingConfig = parseLandingParameters();
  console.log('Landing config parsed:', { spawnLat: landingConfig.spawnLat, spawnLon: landingConfig.spawnLon });
} catch (error) {
  console.error('Failed to parse landing parameters:', error);
  showFatal(error.message);
}

const planetParams = landingConfig.params;
const spawnLat = landingConfig.spawnLat;
const spawnLon = landingConfig.spawnLon;

const radius = getEffectiveRadius(planetParams);
const spawnNormal = sphericalToCartesian(spawnLat, spawnLon);

const east = new THREE.Vector3().crossVectors(WORLD_UP, spawnNormal);
if (east.lengthSq() < 1e-6) {
  east.set(0, 0, 1);
}
east.normalize();
const north = new THREE.Vector3().crossVectors(spawnNormal, east).normalize();

const sampler = new TerrainSampler(planetParams, spawnLat, spawnLon, radius);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060f);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.01, radius * 80);

const ambient = new THREE.AmbientLight(0x60718f, 0.45);
scene.add(ambient);

const sunDir = new THREE.Vector3(1, 0.5, 0.75).normalize();
const sunLight = new THREE.DirectionalLight(0xf7f0d2, 1.1);
sunLight.position.copy(sunDir).multiplyScalar(radius * 40);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 0.1;
sunLight.shadow.camera.far = radius * 80;
scene.add(sunLight);

const CHUNK_SIZE = Math.max(radius * 1.05, 1.25);
const CHUNK_RESOLUTION = 48;
const CHUNK_RANGE = 16;

const chunkOffsets = [];
for (let dz = -CHUNK_RANGE; dz <= CHUNK_RANGE; dz += 1) {
  for (let dx = -CHUNK_RANGE; dx <= CHUNK_RANGE; dx += 1) {
    chunkOffsets.push([dx, dz]);
  }
}
chunkOffsets.sort((a, b) => (Math.abs(a[0]) + Math.abs(a[1])) - (Math.abs(b[0]) + Math.abs(b[1])));

const chunks = chunkOffsets.map(() => new TerrainChunk(CHUNK_SIZE, CHUNK_RESOLUTION, sampler));
chunks.forEach((chunk) => scene.add(chunk.mesh));

const eyeHeight = Math.max(radius * 0.04, 0.06 * radius + 0.04);

const player = {
  position: new THREE.Vector3(0, 0, 0),
  yaw: spawnLon,
  pitch: 0,
  height: eyeHeight,
  speed: Math.max(radius * 0.05, 0.08),
  sprintMultiplier: 1.8
};

const keys = new Set();
let pointerLocked = false;

const hud = document.getElementById("hud");
const hudFps = document.getElementById("hud-fps");
const hudExit = document.getElementById("hud-exit");
const loadingScreen = document.getElementById("loading-screen");
const crosshair = document.getElementById("crosshair");
const pointerInstructions = document.getElementById("pointer-instructions");

console.log('DOM elements:', {
  hud: !!hud,
  hudFps: !!hudFps,
  hudExit: !!hudExit,
  loadingScreen: !!loadingScreen,
  crosshair: !!crosshair,
  pointerInstructions: !!pointerInstructions
});

hudExit?.addEventListener("click", () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    const fallback = new URL("studio.html", window.location.href);
    window.location.href = fallback.toString();
  }
});

function requestPointerLock() {
  if (document.pointerLockElement === renderer.domElement) return;
  renderer.domElement.requestPointerLock?.();
}

renderer.domElement.addEventListener("click", () => {
  requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (pointerLocked) {
    if (pointerInstructions) pointerInstructions.hidden = true;
    if (crosshair) crosshair.hidden = false;
  } else {
    if (pointerInstructions) pointerInstructions.hidden = false;
    if (crosshair) crosshair.hidden = true;
  }
});

document.addEventListener("mousemove", (event) => {
  if (!pointerLocked) return;
  const sensitivity = 0.0012;
  player.yaw -= event.movementX * sensitivity;
  player.pitch -= event.movementY * sensitivity;
  const maxPitch = THREE.MathUtils.degToRad(85);
  player.pitch = clamp(player.pitch, -maxPitch, maxPitch);
});

document.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space") {
    event.preventDefault();
  }
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

let hudRevealed = false;

function revealHudOnce() {
  if (hudRevealed) return;
  hudRevealed = true;
  if (loadingScreen) {
    loadingScreen.hidden = true;
    loadingScreen.style.display = "none";
  }
  if (hud) hud.hidden = false;
  if (!pointerLocked && pointerInstructions) pointerInstructions.hidden = false;
}

function processChunkQueue(timeBudgetMs = 8) {
  const start = performance.now();
  let processed = 0;
  
  while (rebuildQueue.length > 0 && performance.now() - start < timeBudgetMs) {
    const chunk = rebuildQueue.shift();
    if (!chunk) break;
    try {
      chunk.isQueued = false;
      chunk.rebuild(chunk.pendingWorldX, chunk.pendingWorldZ);
      processed += 1;
    } catch (error) {
      console.error('Chunk rebuild error:', error);
    }
  }
  
  if (!hudRevealed && processed > 0) {
    revealHudOnce();
  }
  
  if (rebuildQueue.length === 0 && !hudRevealed) {
    revealHudOnce();
  }
}

function updatePlayerHeight() {
  try {
    const sample = sampler.sampleAtPlane(player.position.x, player.position.z);
    player.position.y = sample.displacement + player.height;
  } catch (error) {
    console.error('Height update error:', error);
    player.position.y = player.height;
  }
}

function updateChunks() {
  const baseChunkX = Math.round(player.position.x / CHUNK_SIZE);
  const baseChunkZ = Math.round(player.position.z / CHUNK_SIZE);

  for (let i = 0; i < chunks.length; i += 1) {
    const offset = chunkOffsets[i];
    const targetX = baseChunkX + offset[0];
    const targetZ = baseChunkZ + offset[1];
    chunks[i].setCoordinate(targetX, targetZ);
  }
}

function updateMovement(delta) {
  tempForward.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)).normalize();
  tempRight.set(tempForward.z, 0, -tempForward.x);

  let moveX = 0;
  let moveZ = 0;
  if (keys.has("KeyW") || keys.has("KeyZ") || keys.has("ArrowUp")) moveZ += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) moveZ -= 1;
  if (keys.has("KeyA") || keys.has("KeyQ") || keys.has("ArrowLeft")) moveX += 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) moveX -= 1;

  if (moveX === 0 && moveZ === 0) {
    updatePlayerHeight();
    return;
  }

  tempMovement.copy(tempForward).multiplyScalar(moveZ);
  tempMovement.addScaledVector(tempRight, -moveX);
  tempMovement.normalize();

  const speedMultiplier = keys.has("ShiftLeft") || keys.has("ShiftRight") ? player.sprintMultiplier : 1.0;
  const distance = player.speed * speedMultiplier * delta;

  player.position.addScaledVector(tempMovement, distance);
  updatePlayerHeight();
}

function updateCamera() {
  tempEye.copy(player.position);
  tempEye.y += player.height;
  camera.position.copy(tempEye);

  tempLookTarget.set(
    Math.sin(player.yaw) * Math.cos(player.pitch),
    Math.sin(player.pitch),
    Math.cos(player.yaw) * Math.cos(player.pitch)
  );
  tempLookTarget.add(tempEye);
  camera.lookAt(tempLookTarget);
}

let lastTime = performance.now();
let fpsAccumulator = 0;
let fpsFrames = 0;
let displayedFps = 0;

let firstFrame = true;

function animate(now) {
  try {
    const delta = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    // Reveal HUD on first frame
    if (firstFrame) {
      firstFrame = false;
      revealHudOnce();
    }

    updateMovement(delta);
    updateCamera();
    updateChunks();
    processChunkQueue(10);

    renderer.render(scene, camera);

    fpsAccumulator += delta;
    fpsFrames += 1;
    if (fpsAccumulator >= 0.5) {
      displayedFps = Math.round(fpsFrames / fpsAccumulator);
      fpsAccumulator = 0;
      fpsFrames = 0;
      if (hudFps) hudFps.textContent = `FPS: ${displayedFps}`;
    }

    requestAnimationFrame(animate);
  } catch (error) {
    console.error('Animation loop error:', error);
    revealHudOnce();
    requestAnimationFrame(animate);
  }
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", onResize);

function initializeLanding() {
  try {
    console.log('Initializing landing zone...');
    
    // Set initial player position and camera - do this first
    try {
      updatePlayerHeight();
    } catch (error) {
      console.error('Player height update error:', error);
      player.position.y = player.height * 0.2;
    }
    
    updateCamera();
    
    // Initialize chunks - but don't block on building them
    console.log('Setting up chunks...');
    try {
      updateChunks();
    } catch (error) {
      console.error('Chunk setup error:', error);
    }
    
    // Don't build chunks synchronously - let the animation loop handle it
    console.log('Rendering initial frame...');
    renderer.render(scene, camera);
    
    // Start animation loop immediately - chunks will build incrementally
    requestAnimationFrame(animate);
    console.log('Animation loop started');
  } catch (error) {
    console.error('Initialization error:', error);
    console.error(error.stack);
    revealHudOnce();
    // Always start animation loop even on error
    requestAnimationFrame(animate);
  }
}

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  revealHudOnce();
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  revealHudOnce();
});

// Reveal HUD immediately - don't wait for anything
setTimeout(() => {
  console.log('Force revealing HUD...');
  revealHudOnce();
}, 50);

// Start immediately
console.log('Walk mode initializing...');
try {
  initializeLanding();
  console.log('Walk mode initialized');
} catch (error) {
  console.error('Fatal initialization error:', error);
  console.error(error.stack);
  if (loadingScreen) {
    loadingScreen.textContent = `Error: ${error.message}`;
  }
  revealHudOnce();
  // Try to start animation loop anyway
  try {
    requestAnimationFrame(animate);
  } catch (e) {
    console.error('Failed to start animation loop:', e);
  }
}

