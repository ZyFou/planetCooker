import * as THREE from "three";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const FALLBACK_COLOR = new THREE.Color("#475569");
const FALLBACK_ATMOSPHERE = new THREE.Color("#1d4ed8");

const getEffectiveRadius = (params = {}) => {
  if (typeof params.radius === "number" && !Number.isNaN(params.radius)) {
    return params.radius;
  }
  if (typeof params.planetSize === "number" && !Number.isNaN(params.planetSize)) {
    return params.planetSize;
  }
  if (typeof params.gasPlanetSize === "number" && !Number.isNaN(params.gasPlanetSize)) {
    return params.gasPlanetSize;
  }
  return 1;
};

const buildChunkOffsets = (range) => {
  const offsets = [];
  for (let dz = -range; dz <= range; dz += 1) {
    for (let dx = -range; dx <= range; dx += 1) {
      offsets.push([dx, dz]);
    }
  }
  offsets.sort((a, b) => (Math.abs(a[0]) + Math.abs(a[1])) - (Math.abs(b[0]) + Math.abs(b[1])));
  return offsets;
};

const isHexColor = (value) => typeof value === "string" && /^#?[0-9a-fA-F]{6}$/.test(value);

const toColor = (value, fallback = FALLBACK_COLOR) => {
  if (value instanceof THREE.Color) {
    return value.clone();
  }
  if (typeof value === "string") {
    try {
      const hex = value.startsWith("#") ? value : `#${value}`;
      return new THREE.Color(hex);
    } catch {
      return fallback.clone();
    }
  }
  return fallback.clone();
};

const averageColors = (colors) => {
  if (!colors.length) {
    return FALLBACK_COLOR.clone();
  }
  const sum = colors.reduce(
    (acc, color) => {
      acc.r += color.r;
      acc.g += color.g;
      acc.b += color.b;
      return acc;
    },
    new THREE.Color(0, 0, 0)
  );
  sum.r /= colors.length;
  sum.g /= colors.length;
  sum.b /= colors.length;
  return sum;
};

const buildPlanetPalette = (params) => {
  const colorKeys = Object.keys(params || {}).filter((key) => key.toLowerCase().includes("color"));
  const palette = colorKeys
    .map((key) => params[key])
    .filter((value) => isHexColor(value))
    .map((value) => toColor(value));

  if (!palette.length) {
    palette.push(FALLBACK_COLOR.clone());
  }

  const primary = palette[0] ?? FALLBACK_COLOR.clone();
  const average = averageColors(palette);
  const accent = palette[Math.floor(palette.length / 2)] ?? primary.clone();
  const atmosphere = toColor(params?.atmosphereColor, FALLBACK_ATMOSPHERE);
  const ocean = toColor(params?.colorDeepWater ?? params?.oceanColor ?? params?.waterColor, "#0ea5e9");

  return {
    palette,
    primary,
    average,
    accent,
    atmosphere,
    horizon: average.clone().lerp(new THREE.Color("#0f172a"), 0.45),
    ocean
  };
};

const createSkyGradientTexture = (topColor, horizonColor) => {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, `#${topColor.getHexString()}`);
  gradient.addColorStop(1, `#${horizonColor.getHexString()}`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  return texture;
};

class TerrainChunk {
  constructor(size, resolution, sampler, onRebuildRequested, material) {
    this.size = size;
    this.resolution = resolution;
    this.sampler = sampler;
    this.onRebuildRequested = onRebuildRequested;

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

    this.material = material;
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
  }

  setCoordinate(chunkX, chunkZ) {
    if (this.coordX === chunkX && this.coordZ === chunkZ) {
      return;
    }
    this.coordX = chunkX;
    this.coordZ = chunkZ;

    const worldX = chunkX * this.size;
       const worldZ = chunkZ * this.size;
    this.mesh.position.set(worldX, 0, worldZ);
    this.pendingWorldX = worldX;
    this.pendingWorldZ = worldZ;

    if (typeof this.onRebuildRequested === "function") {
      this.onRebuildRequested(this);
    }
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

  dispose() {
    this.geometry.dispose();
  }
}

export class SurfaceSceneManager {
  constructor({ planetParams, sampler, scene, renderer }) {
    this.params = planetParams;
    this.sampler = sampler;
    this.scene = scene;
    this.renderer = renderer;

    this.radius = getEffectiveRadius(planetParams);
    this.chunkSize = Math.max(this.radius * 1.05, 1.25);
    this.chunkResolution = 48;
    this.chunkRange = 12;
    this.chunkOffsets = buildChunkOffsets(this.chunkRange);
    this.palette = buildPlanetPalette(planetParams);

    this.terrainGroup = new THREE.Group();
    this.scene.add(this.terrainGroup);

    this.activeChunks = new Map();
    this.rebuildQueue = [];

    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: this.palette.average.clone().multiplyScalar(0.9),
      roughness: 0.65,
      metalness: 0.12,
      envMapIntensity: 0.05
    });

    this.ambientLight = new THREE.AmbientLight(this.palette.average.clone().lerp(new THREE.Color("#94a3b8"), 0.3), 0.35);
    this.sunLight = new THREE.DirectionalLight(this.palette.accent.clone().lerp(new THREE.Color("#ffffff"), 0.4), 1.25);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 0.1;
    this.sunLight.shadow.camera.far = 2000;
    this.sunLight.shadow.normalBias = 0.05;

    this.scene.add(this.ambientLight);
    this.scene.add(this.sunLight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const fogColor = this.palette.horizon.clone();
    this.scene.fog = new THREE.Fog(fogColor, this.chunkSize * 4, this.chunkSize * 12);

    this.skyDome = null;
    this.oceanMesh = null;

    this.setupSky();
    this.setupOcean();
  }

  scheduleRebuild(chunk) {
    if (chunk.isQueued) return;
    chunk.isQueued = true;
    this.rebuildQueue.push(chunk);
  }

  processRebuildQueue(timeBudgetMs = 8) {
    const start = performance.now();
    while (this.rebuildQueue.length > 0 && performance.now() - start < timeBudgetMs) {
      const chunk = this.rebuildQueue.shift();
      if (!chunk) break;
      chunk.isQueued = false;
      chunk.rebuild(chunk.pendingWorldX, chunk.pendingWorldZ);
    }
  }

  ensureChunks(position) {
    const baseChunkX = Math.round(position.x / this.chunkSize);
    const baseChunkZ = Math.round(position.z / this.chunkSize);

    const required = new Set();

    for (let i = 0; i < this.chunkOffsets.length; i += 1) {
      const offset = this.chunkOffsets[i];
      const targetX = baseChunkX + offset[0];
      const targetZ = baseChunkZ + offset[1];
      const key = `${targetX}:${targetZ}`;
      required.add(key);

      if (!this.activeChunks.has(key)) {
        const chunk = new TerrainChunk(
          this.chunkSize,
          this.chunkResolution,
          this.sampler,
          (entry) => this.scheduleRebuild(entry),
          this.terrainMaterial
        );
        chunk.setCoordinate(targetX, targetZ);
        this.terrainGroup.add(chunk.mesh);
        this.activeChunks.set(key, chunk);
      }
    }

    for (const [key, chunk] of this.activeChunks.entries()) {
      if (!required.has(key)) {
        this.terrainGroup.remove(chunk.mesh);
        chunk.dispose();
        this.activeChunks.delete(key);
      }
    }
  }

  updateLighting(cameraPosition) {
    const sunOffset = new THREE.Vector3(120, 220, -140);
    this.sunLight.position.copy(cameraPosition).add(sunOffset);
    this.sunLight.target.position.copy(cameraPosition);
    this.sunLight.target.updateMatrixWorld();
    this.ambientLight.position.copy(cameraPosition);
  }

  setupSky() {
    const horizon = this.palette.horizon.clone();
    const top = this.palette.atmosphere.clone().lerp(new THREE.Color("#38bdf8"), 0.2);
    const gradientTexture = createSkyGradientTexture(top, horizon);

    const geometry = new THREE.SphereGeometry(this.chunkSize * 40, 48, 32);
    const material = new THREE.MeshBasicMaterial({
      map: gradientTexture ?? undefined,
      color: gradientTexture ? new THREE.Color(0xffffff) : top,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    });

    this.skyDome = new THREE.Mesh(geometry, material);
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);
  }

  setupOcean() {
    const seaLevel = typeof this.params.seaLevel === "number" ? this.params.seaLevel : null;
    const waterCoverage = typeof this.params.waterCoverage === "number" ? this.params.waterCoverage : seaLevel;

    if (!waterCoverage || waterCoverage <= 0.05) {
      return;
    }

    const radius = this.chunkSize * 32;
    const material = new THREE.MeshPhysicalMaterial({
      color: this.palette.ocean.clone().lerp(new THREE.Color("#ffffff"), 0.1),
      roughness: 0.4,
      metalness: 0.05,
      transmission: 0.55,
      thickness: 0.35,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });

    const geometry = new THREE.CircleGeometry(radius, 64);
    geometry.rotateX(-Math.PI / 2);

    this.oceanMesh = new THREE.Mesh(geometry, material);
    this.oceanMesh.receiveShadow = true;
    this.oceanMesh.castShadow = false;
    this.oceanMesh.position.y = (seaLevel ?? 0.5) * 2.5;
    this.scene.add(this.oceanMesh);
  }

  updateSky(cameraPosition) {
    if (!this.skyDome) {
      return;
    }
    this.skyDome.position.copy(cameraPosition);
    this.skyDome.updateMatrix();
    if (this.oceanMesh) {
      this.oceanMesh.position.x = cameraPosition.x;
      this.oceanMesh.position.z = cameraPosition.z;
    }
  }

  initialize(startPosition) {
    this.ensureChunks(startPosition);
    this.processRebuildQueue(32);
    this.updateLighting(startPosition);
    this.updateSky(startPosition);
  }

  update(delta, cameraPosition) {
    this.ensureChunks(cameraPosition);
    this.processRebuildQueue();
    this.updateLighting(cameraPosition);
    this.updateSky(cameraPosition);
  }

  getHeightAt(x, z) {
    const sample = this.sampler.sampleAtPlane(x, z);
    return sample?.displacement ?? 0;
  }

  dispose() {
    for (const chunk of this.activeChunks.values()) {
      this.terrainGroup.remove(chunk.mesh);
      chunk.dispose();
    }
    this.activeChunks.clear();

    this.scene.remove(this.terrainGroup);
    this.scene.remove(this.ambientLight);
    this.scene.remove(this.sunLight);

    this.renderer.shadowMap.enabled = false;
    this.terrainMaterial.dispose();

    if (this.skyDome) {
      this.scene.remove(this.skyDome);
      this.skyDome.geometry.dispose();
      this.skyDome.material.dispose();
      this.skyDome = null;
    }

    if (this.oceanMesh) {
      this.scene.remove(this.oceanMesh);
      this.oceanMesh.geometry.dispose();
      this.oceanMesh.material.dispose();
      this.oceanMesh = null;
    }
  }
}

