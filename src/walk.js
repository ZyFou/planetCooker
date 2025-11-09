console.log('=== WALK.JS LOADING ===');

import "./walk.css";
import * as THREE from "three";
import { decodeShare as decodeShareExt } from "./app/shareCore.js";
import {
  clamp,
  smoothstep,
  sphericalToCartesian,
  TerrainSampler
} from "./universe/planetSampler.js";

console.log('=== WALK.JS IMPORTS LOADED ===');

const WORLD_UP = new THREE.Vector3(0, 1, 0);

const tempForward = new THREE.Vector3();
const tempRight = new THREE.Vector3();
const tempMovement = new THREE.Vector3();
const tempEye = new THREE.Vector3();
const tempLookTarget = new THREE.Vector3();

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

