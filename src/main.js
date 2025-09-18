import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "lil-gui";
import { createNoise3D } from "simplex-noise";
import { exportFBX } from "./export/fbx-exporter.js";
import { debounce, SeededRNG } from "./app/utils.js";
import { initControlSearch } from "./app/gui/controlSearch.js";
import { setupPlanetControls } from "./app/gui/planetControls.js";
import { setupMoonControls } from "./app/gui/moonControls.js";

// API configuration - defined early to avoid initialization issues
const API_BASE_URL = 'http://localhost:3001/api';

const debounceShare = debounce(() => {
  if (!shareDirty) return;
  updateShareCode();
  shareDirty = false;
}, 180);

//#region Scene and renderer setup
const sceneContainer = document.getElementById("scene");
const controlsContainer = document.getElementById("controls");
const controlSearchInput = document.getElementById("control-search");
const controlSearchClear = document.getElementById("control-search-clear");
const controlSearchEmpty = document.getElementById("control-search-empty");
const controlSearchBar = document.getElementById("control-search-bar");
const infoPanel = document.getElementById("info");
const debugPanel = document.getElementById("debug-panel");
const importShareButton = document.getElementById("import-share");
const importShareContainer = document.getElementById("import-share-container");
const importShareInput = document.getElementById("import-share-input");
const importShareLoad = document.getElementById("import-share-load");
const importShareCancel = document.getElementById("import-share-cancel");
const debugPlanetToggle = document.getElementById("debug-planet-vector");
const debugMoonToggle = document.getElementById("debug-moon-vectors");
const debugPlanetSpeedDisplay = document.getElementById("debug-planet-speed");
const debugFpsDisplay = document.getElementById("debug-fps");
const debugMoonSpeedList = document.getElementById("debug-moon-speed-list");
const loadingOverlay = document.getElementById("loading");
if (!sceneContainer) {
  throw new Error("Missing scene container element");
}
if (!controlsContainer) {
  throw new Error("Missing controls container element");
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneContainer.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);

const camera = new THREE.PerspectiveCamera(55, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.1, 500);
camera.position.set(0, 2.4, 8.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.rotateSpeed = 0.7;
controls.minDistance = 2;
controls.maxDistance = 80;

const ambientLight = new THREE.AmbientLight(0x6f87b6, 0.35);
scene.add(ambientLight);

const planetSystem = new THREE.Group();
scene.add(planetSystem);

const planetRoot = new THREE.Group();
planetSystem.add(planetRoot);

const tiltGroup = new THREE.Group();
planetRoot.add(tiltGroup);

const spinGroup = new THREE.Group();
tiltGroup.add(spinGroup);

const planetMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.82,
  metalness: 0.12,
  flatShading: false
});

const initialGeometry = new THREE.IcosahedronGeometry(1, 5);
const planetMesh = new THREE.Mesh(initialGeometry, planetMaterial);
planetMesh.castShadow = true;
planetMesh.receiveShadow = true;
spinGroup.add(planetMesh);

const cloudsMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.38,
  roughness: 0.4,
  metalness: 0,
  depthWrite: false
});
const cloudsMesh = new THREE.Mesh(new THREE.SphereGeometry(1.03, 96, 96), cloudsMaterial);
cloudsMesh.castShadow = false;
cloudsMesh.receiveShadow = false;
spinGroup.add(cloudsMesh);

const atmosphereMaterial = new THREE.MeshPhongMaterial({
  color: 0x88c7ff,
  transparent: true,
  opacity: 0.28,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: true
});
const atmosphereMesh = new THREE.Mesh(new THREE.SphereGeometry(1.08, 64, 64), atmosphereMaterial);
atmosphereMesh.castShadow = false;
atmosphereMesh.receiveShadow = false;
spinGroup.add(atmosphereMesh);

const moonsGroup = new THREE.Group();
planetRoot.add(moonsGroup);

const orbitLinesGroup = new THREE.Group();
planetRoot.add(orbitLinesGroup);

const debugVectorScale = 0.45;
const debugState = { showPlanetVelocity: false, showMoonVelocity: false };
const debugPlanetArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xff7d7d);
debugPlanetArrow.visible = false;
scene.add(debugPlanetArrow);
const debugMoonArrows = [];
const debugMoonSpeedRows = [];
const debugVec = new THREE.Vector3();
const debugVec2 = new THREE.Vector3();
const debugVec3 = new THREE.Vector3();
const debugMatrix = new THREE.Matrix3();

const sunGroup = new THREE.Group();
sunGroup.name = "SunGroup";
scene.add(sunGroup);

const sunLight = new THREE.DirectionalLight(0xfff0ce, 1.65);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 160;
sunLight.shadow.camera.left = -35;
sunLight.shadow.camera.right = 35;
sunLight.shadow.camera.top = 35;
sunLight.shadow.camera.bottom = -35;
sunLight.position.set(0, 0, 0);
sunLight.target = planetRoot;
sunGroup.add(sunLight);

const sunCoreGeometry = new THREE.SphereGeometry(1.2, 48, 48);
const sunCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xffd27f, toneMapped: false });
const sunVisual = new THREE.Mesh(sunCoreGeometry, sunCoreMaterial);
sunVisual.layers.set(1);
sunVisual.frustumCulled = false;
sunGroup.add(sunVisual);

const sunGlowTexture = createSunTexture({ inner: 0.08, outer: 0.52, innerAlpha: 1, outerAlpha: 0 });
const sunGlowMaterial = new THREE.SpriteMaterial({
  map: sunGlowTexture,
  color: new THREE.Color(0xffd27f),
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
  depthTest: true
});
const sunGlow = new THREE.Sprite(sunGlowMaterial);
sunGlow.renderOrder = 2;
sunGroup.add(sunGlow);

const sunHaloTexture = createSunTexture({ inner: 0.35, outer: 1, innerAlpha: 0.4, outerAlpha: 0 });
const sunHaloMaterial = new THREE.SpriteMaterial({
  map: sunHaloTexture,
  color: new THREE.Color(0xffd27f),
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
  depthTest: true
});
const sunHalo = new THREE.Sprite(sunHaloMaterial);
sunHalo.renderOrder = 1;
sunGroup.add(sunHalo);

let starField = null;
// Active particle explosions
const activeExplosions = [];
//#endregion

//#region UI bindings
const seedDisplay = document.getElementById("seed-display");
const gravityDisplay = document.getElementById("gravity-display");
const timeDisplay = document.getElementById("time-display");
const stabilityDisplay = document.getElementById("orbit-stability");
const shareDisplay = document.getElementById("share-display");

const randomizeSeedButton = document.getElementById("randomize-seed");
const exportButton = document.getElementById("export-fbx");
const copyShareButton = document.getElementById("copy-share");
const copyShareInlineButton = document.getElementById("copy-share-inline");
const surpriseMeButton = document.getElementById("surprise-me");
//#endregion

//#region Parameters and presets
const params = {
  preset: "Earth-like",
  seed: "BLUEHOME",
  radius: 1.32,
  subdivisions: 6,
  noiseLayers: 5,
  noiseFrequency: 2.8,
  noiseAmplitude: 0.52,
  persistence: 0.48,
  lacunarity: 2.25,
  oceanLevel: 0.46,
  colorOcean: "#1b3c6d",
  colorShallow: "#2f7fb6",
  colorLow: "#305a33",
  colorMid: "#b49e74",
  colorHigh: "#f2f6f5",
  atmosphereColor: "#7baeff",
  cloudsOpacity: 0.4,
  cloudHeight: 0.03,
  cloudDensity: 0.55,
  cloudNoiseScale: 3.2,
  cloudDriftSpeed: 0.02,
  axisTilt: 23,
  rotationSpeed: 0.12,
  simulationSpeed: 0.12,
  gravity: 9.81,
  sunColor: "#ffd27f",
  sunIntensity: 1.6,
  sunDistance: 48,
  sunSize: 1,
  sunHaloSize: 6.5,
  sunGlowStrength: 1.4,
  sunPulseSpeed: 0.5,
  moonCount: 1,
  moonMassScale: 1,
  starCount: 2200,
  starBrightness: 0.85,
  starTwinkleSpeed: 0.6,
  physicsEnabled: true,
  physicsTwoWay: true,
  physicsDamping: 0.0005,
  physicsSubsteps: 2,
  showOrbitLines: true,
  // Effects: explosion customization
  explosionEnabled: true,
  explosionColor: "#ffaa66",
  explosionStrength: 1,
  explosionParticleBase: 90,
  explosionSize: 0.8,
  explosionGravity: 0, // Removed gravity effect
  explosionDamping: 0.9,
  explosionLifetime: 1.6,
  // Additional explosion variations
  explosionColorVariation: 0.5,
  explosionSpeedVariation: 1.0,
  explosionSizeVariation: 1.0
};

const presets = {
  "Earth-like": {
    seed: "BLUEHOME",
    radius: 1.32,
    subdivisions: 6,
    noiseLayers: 5,
    noiseFrequency: 2.8,
    noiseAmplitude: 0.52,
    persistence: 0.48,
    lacunarity: 2.25,
    oceanLevel: 0.46,
    colorOcean: "#1b3c6d",
    colorShallow: "#2f7fb6",
    colorLow: "#305a33",
    colorMid: "#b49e74",
    colorHigh: "#f2f6f5",
    atmosphereColor: "#7baeff",
    cloudsOpacity: 0.42,
    axisTilt: 23,
    rotationSpeed: 0.12,
    simulationSpeed: 0.12,
    gravity: 9.81,
    sunColor: "#ffd27f",
    sunIntensity: 1.6,
    sunDistance: 48,
    sunSize: 1,
    sunHaloSize: 6.5,
    sunGlowStrength: 1.4,
    sunPulseSpeed: 0.45,
    moonMassScale: 1,
    starCount: 2200,
    starBrightness: 0.92,
    starTwinkleSpeed: 0.6,
    moons: [
      { size: 0.27, distance: 4.2, orbitSpeed: 0.38, inclination: 6, color: "#cfd0d4", phase: 1.1, eccentricity: 0.055 }
    ]
  },
  "Desert World": {
    seed: "DUNERIDR",
    radius: 1.08,
    subdivisions: 5,
    noiseLayers: 4,
    noiseFrequency: 3.6,
    noiseAmplitude: 0.35,
    persistence: 0.42,
    lacunarity: 2.5,
    oceanLevel: 0.15,
    colorOcean: "#422412",
    colorShallow: "#6d3a1a",
    colorLow: "#a56d32",
    colorMid: "#d8b06b",
    colorHigh: "#f6e5c8",
    atmosphereColor: "#f4aa5a",
    cloudsOpacity: 0.1,
    axisTilt: 12,
    rotationSpeed: 0.2,
    simulationSpeed: 0.18,
    gravity: 6.4,
    sunColor: "#ffbf66",
    sunIntensity: 1.9,
    sunDistance: 35,
    sunSize: 0.9,
    sunHaloSize: 5.2,
    sunGlowStrength: 1.2,
    sunPulseSpeed: 0.75,
    moonMassScale: 0.8,
    starCount: 1800,
    starBrightness: 0.7,
    starTwinkleSpeed: 0.8,
    moons: [
      { size: 0.18, distance: 3.2, orbitSpeed: 0.54, inclination: -4, color: "#c7a27d", phase: 2.8, eccentricity: 0.16 },
      { size: 0.1, distance: 5.7, orbitSpeed: 0.32, inclination: 11, color: "#7f6448", phase: 0.9, eccentricity: 0.08 }
    ]
  },
  "Ice Giant": {
    seed: "GLACIER",
    radius: 2.8,
    subdivisions: 5,
    noiseLayers: 3,
    noiseFrequency: 1.2,
    noiseAmplitude: 0.25,
    persistence: 0.52,
    lacunarity: 1.8,
    oceanLevel: 0.7,
    colorOcean: "#0a2356",
    colorShallow: "#19427a",
    colorLow: "#2e5e9c",
    colorMid: "#88b5ff",
    colorHigh: "#f6fbff",
    atmosphereColor: "#9ed7ff",
    cloudsOpacity: 0.6,
    axisTilt: 28,
    rotationSpeed: 0.28,
    simulationSpeed: 0.2,
    gravity: 17.2,
    sunColor: "#b9dcff",
    sunIntensity: 2.6,
    sunDistance: 120,
    sunSize: 1.4,
    sunHaloSize: 9.2,
    sunGlowStrength: 1.8,
    sunPulseSpeed: 0.35,
    moonMassScale: 1.8,
    starCount: 3000,
    starBrightness: 1.05,
    starTwinkleSpeed: 0.5,
    moons: [
      { size: 0.24, distance: 5.4, orbitSpeed: 0.3, inclination: 8, color: "#d8e8ff", phase: 0.6, eccentricity: 0.12 },
      { size: 0.32, distance: 8.2, orbitSpeed: 0.24, inclination: -14, color: "#9eb6ff", phase: 3.1, eccentricity: 0.2 },
      { size: 0.18, distance: 12.5, orbitSpeed: 0.18, inclination: 21, color: "#f0f8ff", phase: 4.4, eccentricity: 0.32 }
    ]
  },
  "Volcanic": {
    seed: "FIRECORE",
    radius: 0.92,
    subdivisions: 6,
    noiseLayers: 6,
    noiseFrequency: 4.6,
    noiseAmplitude: 0.66,
    persistence: 0.55,
    lacunarity: 2.6,
    oceanLevel: 0.25,
    colorOcean: "#240909",
    colorShallow: "#5d1911",
    colorLow: "#8a3217",
    colorMid: "#d55c27",
    colorHigh: "#ffd79c",
    atmosphereColor: "#ff7a3a",
    cloudsOpacity: 0.18,
    axisTilt: 8,
    rotationSpeed: 0.35,
    simulationSpeed: 0.3,
    gravity: 11.1,
    sunColor: "#ff9440",
    sunIntensity: 2.1,
    sunDistance: 40,
    sunSize: 1.1,
    sunHaloSize: 4.6,
    sunGlowStrength: 1.65,
    sunPulseSpeed: 1.1,
    moonMassScale: 1.2,
    starCount: 2000,
    starBrightness: 0.88,
    starTwinkleSpeed: 0.9,
    moons: [
      { size: 0.13, distance: 2.7, orbitSpeed: 0.66, inclination: 17, color: "#f9b14d", phase: 1.8, eccentricity: 0.22 }
    ]
  },
  "Gas Giant": {
    seed: "AEROX",
    radius: 3.6,
    subdivisions: 4,
    noiseLayers: 4,
    noiseFrequency: 1.6,
    noiseAmplitude: 0.3,
    persistence: 0.4,
    lacunarity: 1.7,
    oceanLevel: 0.55,
    colorOcean: "#14203b",
    colorShallow: "#253a66",
    colorLow: "#34527f",
    colorMid: "#8f9ec8",
    colorHigh: "#dcdff7",
    atmosphereColor: "#c1d6ff",
    cloudsOpacity: 0.7,
    axisTilt: 12,
    rotationSpeed: 0.45,
    simulationSpeed: 0.4,
    gravity: 24.8,
    sunColor: "#ffe8b2",
    sunIntensity: 2.8,
    sunDistance: 90,
    sunSize: 1.8,
    sunHaloSize: 11.5,
    sunGlowStrength: 2.2,
    sunPulseSpeed: 0.25,
    moonMassScale: 2.6,
    starCount: 3400,
    starBrightness: 1.1,
    starTwinkleSpeed: 0.45,
    moons: [
      { size: 0.32, distance: 5.6, orbitSpeed: 0.5, inclination: 3, color: "#d1d1dd", phase: 0.4, eccentricity: 0.1 },
      { size: 0.26, distance: 7.9, orbitSpeed: 0.35, inclination: 12, color: "#f3deb3", phase: 1.2, eccentricity: 0.18 },
      { size: 0.18, distance: 11.5, orbitSpeed: 0.28, inclination: -9, color: "#c0d6ff", phase: 2.6, eccentricity: 0.3 },
      { size: 0.12, distance: 16.5, orbitSpeed: 0.22, inclination: 25, color: "#e6f2ff", phase: 3.4, eccentricity: 0.4 }
    ]
  }
};

const shareKeys = [
  "seed",
  "radius",
  "subdivisions",
  "noiseLayers",
  "noiseFrequency",
  "noiseAmplitude",
  "persistence",
  "lacunarity",
  "oceanLevel",
  "colorOcean",
  "colorShallow",
  "colorLow",
  "colorMid",
  "colorHigh",
  "atmosphereColor",
  "cloudsOpacity",
  "cloudHeight",
  "cloudDensity",
  "cloudNoiseScale",
  "cloudDriftSpeed",
  "axisTilt",
  "rotationSpeed",
  "simulationSpeed",
  "gravity",
  "sunColor",
  "sunIntensity",
  "sunDistance",
  "sunSize",
  "sunHaloSize",
  "sunGlowStrength",
  "sunPulseSpeed",
  "moonCount",
  "moonMassScale",
  "starCount",
  "starBrightness",
  "starTwinkleSpeed",
  "physicsEnabled",
  "physicsTwoWay",
  "physicsDamping",
  "physicsSubsteps",
  "showOrbitLines",
  // Explosion customization
  "explosionEnabled",
  "explosionColor",
  "explosionStrength",
  "explosionParticleBase",
  "explosionSize",
  "explosionGravity",
  "explosionDamping",
  "explosionLifetime",
  "explosionColorVariation",
  "explosionSpeedVariation",
  "explosionSizeVariation"
];
//#endregion

//#region State tracking
const palette = {
  ocean: new THREE.Color(params.colorOcean),
  shallow: new THREE.Color(params.colorShallow),
  low: new THREE.Color(params.colorLow),
  mid: new THREE.Color(params.colorMid),
  high: new THREE.Color(params.colorHigh),
  atmosphere: new THREE.Color(params.atmosphereColor)
};

let cloudTexture = null;
let cloudTextureDirty = true;

const guiControllers = {};

let planetDirty = true;
let moonsDirty = true;
let shareDirty = true;
let simulationYears = 0;
let lastFrameTime = performance.now();
let fps = 0;
let fpsUpdateTime = performance.now();
let frameCount = 0;
let isApplyingPreset = false;
let guiVisible = true;
let sunPulsePhase = 0;
let cloudTexOffsetX = 0;

const { registerFolder, unregisterFolder, applyControlSearch } = initControlSearch({
  controlsContainer,
  searchInput: controlSearchInput,
  clearButton: controlSearchClear,
  emptyState: controlSearchEmpty,
  searchBar: controlSearchBar,
  infoPanel
});

const gui = registerFolder(new GUI({ title: "Planet Controls", width: 320, container: controlsContainer || undefined }));

setupPlanetControls({
  gui,
  params,
  presets,
  guiControllers,
  registerFolder,
  scheduleShareUpdate,
  markPlanetDirty,
  markMoonsDirty,
  handleSeedChanged,
  updatePalette,
  updateClouds,
  updateTilt,
  updateSun,
  updateStarfieldUniforms,
  regenerateStarfield,
  updateGravityDisplay,
  initMoonPhysics,
  getIsApplyingPreset: () => isApplyingPreset,
  onPresetChange: (value) => applyPreset(value)
});

const {
  moonSettings,
  createDefaultMoon,
  normalizeMoonSettings,
  rebuildMoonControls,
  syncMoonSettings
} = setupMoonControls({
  gui,
  params,
  guiControllers,
  registerFolder,
  unregisterFolder,
  applyControlSearch,
  scheduleShareUpdate,
  markMoonsDirty,
  updateOrbitLinesVisibility,
  initMoonPhysics,
  resetMoonPhysics,
  getIsApplyingPreset: () => isApplyingPreset
});

if (debugPlanetSpeedDisplay) {
  debugPlanetSpeedDisplay.textContent = "0.000";
}

if (debugFpsDisplay) {
  debugFpsDisplay.textContent = "0";
}

if (debugPlanetToggle) {
  debugPlanetToggle.checked = false;
  debugPlanetToggle.addEventListener("change", () => {
    debugState.showPlanetVelocity = !!debugPlanetToggle.checked;
    if (!debugState.showPlanetVelocity) {
      debugPlanetArrow.visible = false;
    }
    updateDebugVectors();
  });
}

if (debugMoonToggle) {
  debugMoonToggle.checked = false;
  debugMoonToggle.addEventListener("change", () => {
    debugState.showMoonVelocity = !!debugMoonToggle.checked;
    if (!debugState.showMoonVelocity) {
      debugMoonArrows.forEach((arrow) => {
        if (arrow) arrow.visible = false;
      });
    }
    updateDebugVectors();
  });
}

if (debugPanel) {
  syncDebugMoonArtifacts();
  updateDebugVectors();
}

//#endregion

randomizeSeedButton?.addEventListener("click", () => {
  const nextSeed = generateSeed();
  params.seed = nextSeed;
  guiControllers.seed?.setValue?.(nextSeed);
  handleSeedChanged();
});

function getCurrentShareCode() {
  const fromDataset = shareDisplay?.dataset?.code;
  if (fromDataset && fromDataset.length) return fromDataset;
  // Fallback: compute on-demand
  try {
    return encodeShare(buildSharePayload());
  } catch {
    return "";
  }
}

// Load configuration from URL hash (supports both API IDs and legacy codes)
async function loadConfigurationFromHash() {
  const hash = window.location.hash.substring(1);
  if (!hash) return;

  try {
    // Try to load from API first (short ID)
    if (hash.length <= 12 && /^[a-zA-Z0-9_-]+$/.test(hash)) {
      console.log(`🔄 Loading configuration from API: ${hash}`);
      const result = await loadConfigurationFromAPI(hash);
      
      if (result && result.data) {
        console.log(`✅ Loaded configuration: ${result.id}`);
        await applyConfigurationFromAPI(result);
        return;
      }
    }
  } catch (error) {
    console.warn('Failed to load from API, trying legacy format:', error.message);
  }

  // Fallback to legacy base64 decoding
  try {
    const payload = decodeShare(hash);
    if (payload && payload.data) {
      console.log('✅ Loaded legacy configuration');
      applyConfiguration(payload);
    }
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
}

// Apply configuration loaded from API
async function applyConfigurationFromAPI(apiResult) {
  console.log("🔄 Applying configuration from API...");
  const { data, metadata } = apiResult;
  
  console.log("📦 API Data received:", {
    hasData: !!data,
    hasMoons: !!(data.moons && Array.isArray(data.moons)),
    moonCount: data.moons ? data.moons.length : 0,
    seed: data.seed,
    preset: data.preset
  });
  
  // Update parameters from data.data (the actual planet parameters)
  let updatedParams = 0;
  if (data.data) {
    console.log("🔄 Updating planet parameters from data.data...");
    Object.keys(data.data).forEach(key => {
      if (params[key] !== undefined) {
        const oldValue = params[key];
        params[key] = data.data[key];
        if (oldValue !== data.data[key]) {
          updatedParams++;
          console.log(`🔄 Updated param ${key}: ${oldValue} → ${data.data[key]}`);
        }
      }
    });
  } else {
    console.log("⚠️ No data.data found, trying direct data...");
    Object.keys(data).forEach(key => {
      if (params[key] !== undefined) {
        const oldValue = params[key];
        params[key] = data[key];
        if (oldValue !== data[key]) {
          updatedParams++;
          console.log(`🔄 Updated param ${key}: ${oldValue} → ${data[key]}`);
        }
      }
    });
  }
  console.log(`📊 Updated ${updatedParams} parameters`);

  // Update moon settings
  if (data.moons && Array.isArray(data.moons)) {
    console.log(`🔄 Updating ${data.moons.length} moons...`);
    moonSettings.splice(0, moonSettings.length);
    data.moons.forEach((moon, index) => {
      const moonData = {
        size: moon.size || 0.15,
        distance: moon.distance || 3.5,
        orbitSpeed: moon.orbitSpeed || 0.4,
        inclination: moon.inclination || 0,
        color: moon.color || "#d0d0d0",
        phase: moon.phase || 0,
        eccentricity: moon.eccentricity || 0
      };
      moonSettings.push(moonData);
      console.log(`🌙 Moon ${index + 1}:`, moonData);
    });
  } else {
    console.log("🔄 No moons to update");
  }

  // Update GUI controllers
  let updatedControllers = 0;
  Object.keys(guiControllers).forEach(key => {
    if (params[key] !== undefined && guiControllers[key]?.setValue) {
      guiControllers[key].setValue(params[key]);
      updatedControllers++;
    }
  });
  console.log(`🎛️ Updated ${updatedControllers} GUI controllers`);

  // Rebuild moon controls
  if (typeof rebuildMoonControls === 'function') {
    console.log("🔄 Rebuilding moon controls...");
    rebuildMoonControls();
  }

  // Update all systems
  console.log("🔄 Updating all systems...");
  updatePalette();
  updateClouds();
  updateSun();
  updateTilt();
  updateGravityDisplay();
  
  // Force planet reconstruction
  console.log("🔄 Forcing planet reconstruction...");
  markPlanetDirty();
  markMoonsDirty();
  
  // Force immediate planet rebuild
  if (typeof rebuildPlanet === 'function') {
    console.log("🔄 Calling rebuildPlanet()...");
    rebuildPlanet();
  }
  
  if (params.physicsEnabled) {
    console.log("🔄 Initializing moon physics...");
    initMoonPhysics();
  }
  
  updateStarfieldUniforms();
  updateStabilityDisplay(moonSettings.length, moonSettings.length);
  
  // Force a render update
  console.log("🔄 Forcing render update...");
  if (typeof animate === 'function') {
    requestAnimationFrame(animate);
  }
  
  // Update share display
  if (shareDisplay) {
    shareDisplay.textContent = chunkCode(apiResult.id, 4).join(" ");
    shareDisplay.dataset.code = apiResult.id;
    shareDisplay.title = `Loaded: ${apiResult.id}\nClick to copy`;
    console.log(`📋 Updated share display with ID: ${apiResult.id}`);
  }

  console.log(`🎉 Configuration applied successfully: ${metadata?.name || 'Unnamed Planet'}`);
}

function flashButtonCopied(btn) {
  if (!btn) return;
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Copied!";
  setTimeout(() => {
    // Restore to original button text, not the "Saving..." state
    btn.textContent = "Copy Share Code";
    btn.disabled = false;
  }, 700);
}

copyShareButton?.addEventListener("click", async () => {
  const originalText = copyShareButton.textContent;
  
  try {
    // Show loading state
    copyShareButton.textContent = "Saving...";
    copyShareButton.disabled = true;
    
    console.log("🚀 Starting share process...");
    
    // Get current configuration
    const payload = buildSharePayload();
    console.log("📦 Built share payload:", {
      seed: payload.data.seed,
      moonCount: payload.data.moonCount,
      preset: payload.preset,
      moons: payload.moons.length
    });
    
    // Try to save to API first
    try {
      const result = await saveConfigurationToAPI(payload, {
        name: `Planet ${payload.data.seed}`,
        description: `A ${payload.preset} planet with ${payload.data.moonCount} moon(s)`,
        preset: payload.preset,
        moonCount: payload.data.moonCount
      });
      
      console.log("✅ Configuration saved to API:", result);
      
      // Copy the short ID to clipboard
      await copyToClipboard(result.id);
      
      // Update share display
      if (shareDisplay) {
        shareDisplay.textContent = chunkCode(result.id, 4).join(" ");
        shareDisplay.dataset.code = result.id;
        shareDisplay.title = `Short ID: ${result.id}\nClick to copy\nAPI: ${result.url}`;
      }
      
      // Show success feedback
      flashShareFeedback(`✅ Saved! ID: ${result.id}`);
      flashButtonCopied(copyShareButton);
      
      console.log(`🎉 Share successful! ID: ${result.id}`);
      console.log(`🔗 Share URL: ${result.shortUrl}`);
      
    } catch (apiError) {
      console.warn("⚠️ API not available, using fallback:", apiError.message);
      
      // Fallback to local encoding
      const code = getCurrentShareCode();
      if (!code) {
        throw new Error("No share code available");
      }
      
      await copyToClipboard(code);
      flashShareFeedback("📋 Copied (offline mode)");
      flashButtonCopied(copyShareButton);
      
      console.log("📋 Fallback: Local code copied to clipboard");
    }
    
  } catch (error) {
    console.error("❌ Share failed:", error);
    flashShareFeedback("❌ Share failed");
  } finally {
    // Restore button state
    copyShareButton.textContent = originalText;
    copyShareButton.disabled = false;
  }
});

copyShareInlineButton?.addEventListener("click", async () => {
  const originalText = copyShareInlineButton.textContent;
  
  try {
    // Show loading state
    copyShareInlineButton.textContent = "Saving...";
    copyShareInlineButton.disabled = true;
    
    console.log("🚀 Starting inline share process...");
    
    // Get current configuration
    const payload = buildSharePayload();
    
    // Try to save to API first
    try {
      const result = await saveConfigurationToAPI(payload, {
        name: `Planet ${payload.data.seed}`,
        description: `A ${payload.preset} planet with ${payload.data.moonCount} moon(s)`
      });
      
      console.log("✅ Inline configuration saved to API:", result);
      
      // Copy the short ID to clipboard
      await copyToClipboard(result.id);
      flashShareFeedback(`✅ Saved! ID: ${result.id}`);
      
    } catch (apiError) {
      console.warn("⚠️ API not available for inline share, using fallback:", apiError.message);
      
      // Fallback to local encoding
      const code = getCurrentShareCode();
      if (!code) {
        throw new Error("No share code available");
      }
      
      await copyToClipboard(code);
      flashShareFeedback("📋 Copied (offline mode)");
    }
    
  } catch (error) {
    console.error("❌ Inline share failed:", error);
    flashShareFeedback("❌ Share failed");
  } finally {
    // Restore button state
    copyShareInlineButton.textContent = originalText;
    copyShareInlineButton.disabled = false;
  }
});

// Import share code UI
importShareButton?.addEventListener("click", () => {
  if (!importShareContainer || !importShareInput) return;
  importShareContainer.hidden = false;
  const suggested = (window.location.hash ? window.location.hash.slice(1).trim() : "") || (shareDisplay?.dataset?.code || "");
  importShareInput.value = suggested;
  setTimeout(() => {
    importShareInput.focus();
    importShareInput.select();
  }, 0);
});

async function tryImportShare(code) {
  const trimmed = (code || "").trim();
  if (!trimmed) return;
  
  // console.log("🔄 Attempting to import share code:", trimmed);
  
  try {
    // Try to load from API first (short ID)
    if (trimmed.length <= 12 && /^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      console.log("🔄 Loading from API...");
      const result = await loadConfigurationFromAPI(trimmed);
      
      if (result && result.data) {
        console.log("✅ Loaded from API:", result.id);
        await applyConfigurationFromAPI(result);
        history.replaceState(null, "", `#${trimmed}`);
        
        if (importShareContainer && importShareInput) {
          importShareContainer.hidden = true;
          importShareInput.value = "";
        }
        
        flashShareFeedback(`✅ Loaded: ${result.id}`);
        return;
      }
    }
  } catch (apiError) {
    console.warn("⚠️ API load failed, trying legacy format:", apiError.message);
  }

  // Fallback to legacy base64 decoding
  try {
    console.log("🔄 Loading legacy format...");
    const payload = decodeShare(trimmed);
    if (payload && payload.data) {
      console.log("✅ Loaded legacy configuration");
      applySharePayload(payload);
      history.replaceState(null, "", `#${trimmed}`);
      
      if (importShareContainer && importShareInput) {
        importShareContainer.hidden = true;
        importShareInput.value = "";
      }
      
      flashShareFeedback("✅ Loaded (legacy)");
      return;
    }
  } catch (err) {
    console.warn("❌ Invalid share code", err);
  }
  
  // If we get here, both methods failed
  if (importShareInput) {
    importShareInput.focus();
    importShareInput.select();
  }
  alert("Invalid share code. Please check and try again.");
}

importShareLoad?.addEventListener("click", async () => {
  const code = importShareInput?.value || "";
  if (!code.trim()) return;
  
  // Show loading state
  const originalText = importShareLoad.textContent;
  importShareLoad.textContent = "Loading...";
  importShareLoad.disabled = true;
  
  try {
    await tryImportShare(code);
  } catch (error) {
    console.error("❌ Import failed:", error);
    flashShareFeedback("❌ Import failed");
  } finally {
    // Restore button state
    importShareLoad.textContent = originalText;
    importShareLoad.disabled = false;
  }
});

importShareInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const code = importShareInput.value;
    if (!code.trim()) return;
    
    // Show loading state
    const originalText = importShareLoad.textContent;
    importShareLoad.textContent = "Loading...";
    importShareLoad.disabled = true;
    
    try {
      await tryImportShare(code);
    } catch (error) {
      console.error("❌ Import failed:", error);
      flashShareFeedback("❌ Import failed");
    } finally {
      // Restore button state
      importShareLoad.textContent = originalText;
      importShareLoad.disabled = false;
    }
  } else if (e.key === "Escape") {
    if (importShareContainer && importShareInput) {
      importShareContainer.hidden = true;
      importShareInput.value = "";
    }
  }
});

importShareCancel?.addEventListener("click", () => {
  if (importShareContainer && importShareInput) {
    importShareContainer.hidden = true;
    importShareInput.value = "";
  }
});

surpriseMeButton?.addEventListener("click", () => {
  surpriseMe();
});

exportButton?.addEventListener("click", () => {
  exportPlanetAsFBX();
});

window.addEventListener("resize", onWindowResize);

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "h") {
    guiVisible = !guiVisible;
    if (guiVisible) {
      gui.show();
    } else {
      gui.hide();
    }
  }
});
//#endregion

const tmpVecA = new THREE.Vector3();
const tmpVecB = new THREE.Vector3();
const tmpVecC = new THREE.Vector3();
const tmpVecD = new THREE.Vector3();
const tmpVecE = new THREE.Vector3();
const tmpVecF = new THREE.Vector3();
const tmpMatrix3 = new THREE.Matrix3();
const tmpQuatA = new THREE.Quaternion();
const tmpQuatB = new THREE.Quaternion();

//#region Initialization
async function initializeApp() {
  const loadedFromHash = await initFromHash();
  if (!loadedFromHash) {
    updatePalette();
    updateClouds();
    updateSun();
    updateTilt();
    updateSeedDisplay();
    updateGravityDisplay();
    applyPreset(params.preset, { skipShareUpdate: true, keepSeed: true });
    syncMoonSettings();
  } else {
    updateSeedDisplay();
    updateGravityDisplay();
  }
}

// Start the app
initializeApp().then(() => {
  normalizeMoonSettings();
  regenerateStarfield();
  updateStarfieldUniforms();
  markPlanetDirty();
  markMoonsDirty();
});
initMoonPhysics();
updateOrbitLinesVisibility();
applyControlSearch({ scrollToFirst: false });
updateShareCode();
requestAnimationFrame(animate);
//#endregion

//#region Animation loop
function animate(timestamp) {
  const delta = Math.min(1 / 15, (timestamp - lastFrameTime) / 1000 || 0);
  lastFrameTime = timestamp;
  const simulationDelta = delta * params.simulationSpeed;
  simulationYears += simulationDelta * 0.08;

  // Calculate FPS
  frameCount++;
  if (timestamp - fpsUpdateTime >= 1000) {
    fps = Math.round((frameCount * 1000) / (timestamp - fpsUpdateTime));
    frameCount = 0;
    fpsUpdateTime = timestamp;
    if (debugFpsDisplay) {
      debugFpsDisplay.textContent = fps;
    }
  }

  controls.update();

  if (planetDirty) {
    showLoading();
    rebuildPlanet();
    planetDirty = false;
    hideLoadingSoon();
  }

  if (moonsDirty) {
    updateMoons();
    moonsDirty = false;
  }

  const rotationDelta = params.rotationSpeed * simulationDelta * Math.PI * 2;
  spinGroup.rotation.y += rotationDelta;
  cloudsMesh.rotation.y += rotationDelta * 1.12;
  // Additional independent cloud drift
  cloudsMesh.rotation.y += delta * params.cloudDriftSpeed;

  const gravityFactor = Math.sqrt(params.gravity / 9.81);
  if (params.physicsEnabled) {
    stepMoonPhysics(simulationDelta);
  } else {
    const planetMass = getPlanetMass();
    const mu = getGravParameter(planetMass);
    moonsGroup.children.forEach((pivot, index) => {
      const moon = moonSettings[index];
      const mesh = pivot.userData.mesh;
      if (!moon || !mesh) return;
      const semiMajor = Math.max(0.5, params.radius * (moon.distance || 3.5));
      const eccentricity = THREE.MathUtils.clamp(moon.eccentricity ?? 0, 0, 0.95);
      const data = pivot.userData;
      const baseSpeed = Math.sqrt(Math.max(1e-6, mu / Math.pow(semiMajor, 3)));
      const rawSpeed = moon.orbitSpeed ?? 0.4;
      const speedMultiplier = (Math.sign(rawSpeed) || 1) * Math.max(0.2, Math.abs(rawSpeed));
      data.trueAnomaly = (data.trueAnomaly ?? (moon.phase ?? 0)) + baseSpeed * speedMultiplier * simulationDelta * gravityFactor;
      const angle = data.trueAnomaly;
      computeOrbitPosition(semiMajor, eccentricity, angle, mesh.position);
      
      // Track trajectory for non-physics mode too
      pivot.updateMatrixWorld(true);
      const worldPos = pivot.localToWorld(mesh.position.clone());
      updateTrajectoryHistory(pivot, worldPos);
    });
    updateStabilityDisplay(moonSettings.length, moonSettings.length);
  }

  // Update explosion particles after physics
  updateExplosions(simulationDelta);

  syncOrbitLinesWithPivots();

  if (params.sunPulseSpeed > 0.001) {
    sunPulsePhase += delta * params.sunPulseSpeed * 2.4;
    const pulse = Math.sin(sunPulsePhase) * 0.5 + 0.5;
    if (sunGlow.userData) {
      sunGlow.scale.setScalar(sunGlow.userData.baseScale * (0.9 + pulse * 0.3));
      sunGlow.material.opacity = sunGlow.userData.baseOpacity * (0.8 + pulse * 0.5);
    }
    if (sunHalo.userData) {
      sunHalo.scale.setScalar(sunHalo.userData.baseScale * (0.95 + pulse * 0.25));
      sunHalo.material.opacity = sunHalo.userData.baseOpacity * (0.7 + pulse * 0.35);
    }
    if (sunVisual.userData?.baseScale) {
      sunVisual.scale.setScalar(sunVisual.userData.baseScale * (0.98 + pulse * 0.05));
    }
  } else {
    if (sunGlow.userData) {
      sunGlow.scale.setScalar(sunGlow.userData.baseScale);
      sunGlow.material.opacity = sunGlow.userData.baseOpacity;
    }
    if (sunHalo.userData) {
      sunHalo.scale.setScalar(sunHalo.userData.baseScale);
      sunHalo.material.opacity = sunHalo.userData.baseOpacity;
    }
    if (sunVisual.userData?.baseScale) {
      sunVisual.scale.setScalar(sunVisual.userData.baseScale);
    }
  }

  if (starField && starField.material && starField.material.uniforms) {
    starField.rotation.y += delta * 0.002;
    const uniforms = starField.material.uniforms;
    uniforms.uTime.value = timestamp * 0.001;
    uniforms.uBrightness.value = params.starBrightness;
    uniforms.uTwinkleSpeed.value = params.starTwinkleSpeed;
  }

  updateDebugVectors();

  renderer.render(scene, camera);
  updateTimeDisplay(simulationYears);
  requestAnimationFrame(animate);
}
//#endregion
//#region Planet generation
const scratchColor = new THREE.Color();

function rebuildPlanet() {
  updatePalette();

  const rng = new SeededRNG(params.seed);
  const noiseRng = rng.fork();

  const baseNoise = createNoise3D(() => noiseRng.next());
  const ridgeNoise = createNoise3D(() => noiseRng.next());
  const warpNoiseX = createNoise3D(() => noiseRng.next());
  const warpNoiseY = createNoise3D(() => noiseRng.next());
  const warpNoiseZ = createNoise3D(() => noiseRng.next());
  const craterNoise = createNoise3D(() => noiseRng.next());

  const offsets = [];
  for (let i = 0; i < params.noiseLayers; i += 1) {
    const fork = noiseRng.fork();
    offsets.push(new THREE.Vector3(
      fork.nextFloat(-128, 128),
      fork.nextFloat(-128, 128),
      fork.nextFloat(-128, 128)
    ));
  }

  const profile = deriveTerrainProfile(params.seed);

  const detail = Math.round(params.subdivisions);
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const sampleDir = new THREE.Vector3();
  const warpVec = new THREE.Vector3();

  for (let i = 0; i < positions.count; i += 1) {
    vertex.fromBufferAttribute(positions, i);
    normal.copy(vertex).normalize();
    sampleDir.copy(normal);

    if (profile.warpStrength > 0) {
      const warpAmount = profile.warpStrength * 0.35;
      const fx = profile.warpFrequency;
      const offset = profile.warpOffset;
      warpVec.set(
        warpNoiseX(normal.x * fx + offset.x, normal.y * fx + offset.y, normal.z * fx + offset.z),
        warpNoiseY(normal.x * fx + offset.y, normal.y * fx + offset.z, normal.z * fx + offset.x),
        warpNoiseZ(normal.x * fx + offset.z, normal.y * fx + offset.x, normal.z * fx + offset.y)
      );
      sampleDir.addScaledVector(warpVec, warpAmount).normalize();
    }

    let amplitude = 1;
    let frequency = params.noiseFrequency;
    let totalAmplitude = 0;
    let sum = 0;
    let ridgeSum = 0;
    let billowSum = 0;

    for (let layer = 0; layer < params.noiseLayers; layer += 1) {
      const offset = offsets[layer];
      const sx = sampleDir.x * frequency + offset.x;
      const sy = sampleDir.y * frequency + offset.y;
      const sz = sampleDir.z * frequency + offset.z;

      const sample = baseNoise(sx, sy, sz);
      sum += sample * amplitude;

      const ridgeSample = ridgeNoise(
        sx * profile.ridgeFrequency,
        sy * profile.ridgeFrequency,
        sz * profile.ridgeFrequency
      );
      ridgeSum += (1 - Math.abs(ridgeSample)) * amplitude;

      billowSum += Math.pow(Math.abs(sample), profile.ruggedPower) * amplitude;

      totalAmplitude += amplitude;
      amplitude *= params.persistence;
      frequency *= params.lacunarity;
    }

    if (totalAmplitude > 0) {
      sum /= totalAmplitude;
      ridgeSum /= totalAmplitude;
      billowSum /= totalAmplitude;
    }

    let elevation = sum;
    elevation = THREE.MathUtils.lerp(elevation, ridgeSum * 2 - 1, profile.ridgeWeight);
    elevation = THREE.MathUtils.lerp(elevation, billowSum * 2 - 1, profile.billowWeight);
    elevation = Math.sign(elevation) * Math.pow(Math.abs(elevation), profile.sharpness);

    let normalized = elevation * 0.5 + 0.5;
    normalized = Math.pow(THREE.MathUtils.clamp(normalized, 0, 1), profile.plateauPower);

    if (profile.striationStrength > 0) {
      const striation = Math.sin((sampleDir.x + sampleDir.z) * profile.striationFrequency + profile.striationPhase);
      normalized += striation * profile.striationStrength;
    }

    if (profile.equatorLift || profile.poleDrop) {
      const latitude = Math.abs(sampleDir.y);
      normalized += (1 - latitude) * profile.equatorLift;
      normalized -= latitude * profile.poleDrop;
    }

    const craterSample = craterNoise(
      sampleDir.x * profile.craterFrequency + profile.craterOffset.x,
      sampleDir.y * profile.craterFrequency + profile.craterOffset.y,
      sampleDir.z * profile.craterFrequency + profile.craterOffset.z
    );
    const craterValue = (craterSample + 1) * 0.5;
    if (craterValue > profile.craterThreshold) {
      const craterT = (craterValue - profile.craterThreshold) / Math.max(1e-6, 1 - profile.craterThreshold);
      normalized -= Math.pow(craterT, profile.craterSharpness) * profile.craterDepth;
    }

    normalized = THREE.MathUtils.clamp(normalized, 0, 1);

    const displacement = (normalized - params.oceanLevel) * params.noiseAmplitude;
    const finalRadius = params.radius + displacement;
    vertex.copy(normal).multiplyScalar(finalRadius);
    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);

    const color = sampleColor(normalized);
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  planetMesh.geometry.dispose();
  planetMesh.geometry = geometry;

  const cloudScale = params.radius * (1 + Math.max(0.0, params.cloudHeight || 0.03));
  const atmosphereScale = params.radius * (1.06 + Math.max(0.0, (params.cloudHeight || 0.03)) * 0.8);
  cloudsMesh.scale.setScalar(cloudScale);
  atmosphereMesh.scale.setScalar(atmosphereScale);

  scheduleShareUpdate();
}

function deriveTerrainProfile(seed) {
  const rng = new SeededRNG(`${seed || "default"}-terrain`);
  return {
    warpStrength: THREE.MathUtils.lerp(0.0, 0.45, rng.next()),
    warpFrequency: THREE.MathUtils.lerp(0.6, 1.8, rng.next()),
    ridgeFrequency: THREE.MathUtils.lerp(0.5, 1.3, rng.next()),
    ridgeWeight: THREE.MathUtils.lerp(0.1, 0.65, rng.next()),
    billowWeight: THREE.MathUtils.lerp(0.05, 0.35, rng.next()),
    plateauPower: THREE.MathUtils.lerp(0.75, 1.45, rng.next()),
    sharpness: THREE.MathUtils.lerp(0.8, 1.45, rng.next()),
    ruggedPower: THREE.MathUtils.lerp(1.1, 2.4, rng.next()),
    craterFrequency: THREE.MathUtils.lerp(1.4, 4.6, rng.next()),
    craterThreshold: THREE.MathUtils.lerp(0.78, 0.94, rng.next()),
    craterDepth: THREE.MathUtils.lerp(0.015, 0.12, rng.next()),
    craterSharpness: THREE.MathUtils.lerp(1.6, 3.4, rng.next()),
    equatorLift: THREE.MathUtils.lerp(0, 0.12, rng.next()),
    poleDrop: THREE.MathUtils.lerp(0, 0.08, rng.next()),
    striationStrength: THREE.MathUtils.lerp(0, 0.09, rng.next()),
    striationFrequency: THREE.MathUtils.lerp(2.8, 8.5, rng.next()),
    striationPhase: rng.next() * Math.PI * 2,
    warpOffset: new THREE.Vector3(
      rng.nextFloat(-64, 64),
      rng.nextFloat(-64, 64),
      rng.nextFloat(-64, 64)
    ),
    craterOffset: new THREE.Vector3(
      rng.nextFloat(-128, 128),
      rng.nextFloat(-128, 128),
      rng.nextFloat(-128, 128)
    ),
    cloudLift: THREE.MathUtils.lerp(0.0, 0.07, rng.next())
  };
}

function sampleColor(elevation) {
  if (elevation <= params.oceanLevel) {
    const oceanT = params.oceanLevel <= 0 ? 0 : THREE.MathUtils.clamp(elevation / Math.max(params.oceanLevel, 1e-6), 0, 1);
    scratchColor.copy(palette.ocean).lerp(palette.shallow, Math.pow(oceanT, 0.65));
    return scratchColor;
  }

  const landT = THREE.MathUtils.clamp((elevation - params.oceanLevel) / Math.max(1 - params.oceanLevel, 1e-6), 0, 1);

  if (landT < 0.5) {
    const t = Math.pow(landT / 0.5, 1.1);
    scratchColor.copy(palette.low).lerp(palette.mid, t);
    return scratchColor;
  }

  const highT = Math.pow((landT - 0.5) / 0.5, 1.3);
  scratchColor.copy(palette.mid).lerp(palette.high, highT);
  return scratchColor;
}

function updatePalette() {
  palette.ocean.set(params.colorOcean);
  palette.shallow.set(params.colorShallow);
  palette.low.set(params.colorLow);
  palette.mid.set(params.colorMid);
  palette.high.set(params.colorHigh);
  palette.atmosphere.set(params.atmosphereColor);
  atmosphereMaterial.color.copy(palette.atmosphere);
}

function updateClouds() {
  cloudsMaterial.opacity = params.cloudsOpacity;
  atmosphereMaterial.opacity = THREE.MathUtils.clamp(params.cloudsOpacity * 0.55, 0.05, 0.6);
  // Update cloud layer height/scale
  const cloudScale = Math.max(0.1, params.radius * (1 + Math.max(0, params.cloudHeight || 0.03)));
  cloudsMesh.scale.setScalar(cloudScale);
  // Regenerate texture when any cloud parameter changes
  cloudTextureDirty = true;
  if (cloudTextureDirty || !cloudTexture) {
    regenerateCloudTexture();
  }
  if (cloudTexture) {
    cloudTexture.needsUpdate = true;
    cloudsMaterial.map = cloudTexture;
    cloudsMaterial.alphaMap = cloudTexture;
    cloudsMaterial.needsUpdate = true;
  }
}

function updateTilt() {
  const radians = THREE.MathUtils.degToRad(params.axisTilt);
  tiltGroup.rotation.z = radians;
  moonsGroup.rotation.z = radians;
  orbitLinesGroup.rotation.z = radians;
}

function updateSun() {
  const color = new THREE.Color(params.sunColor);
  sunLight.color.copy(color);
  sunLight.intensity = params.sunIntensity;
  const distance = params.sunDistance;
  sunGroup.position.set(distance, distance * 0.35, distance);
  sunLight.target = planetRoot;
  sunLight.target.updateMatrixWorld();

  sunVisual.material.color.copy(color);
  const coreScale = Math.max(0.1, params.sunSize);
  sunVisual.userData = sunVisual.userData || {};
  sunVisual.userData.baseScale = coreScale;
  sunVisual.scale.setScalar(coreScale);

  sunGlow.material.color.copy(color);
  sunHalo.material.color.copy(color);
  sunGlow.userData = sunGlow.userData || {};
  sunHalo.userData = sunHalo.userData || {};

  const haloRadius = Math.max(0.5, params.sunHaloSize);
  const glowStrength = Math.max(0.1, params.sunGlowStrength);
  sunGlow.userData.baseScale = haloRadius * glowStrength;
  sunHalo.userData.baseScale = haloRadius * (1.2 + glowStrength * 0.4);
  sunGlow.scale.setScalar(sunGlow.userData.baseScale);
  sunHalo.scale.setScalar(sunHalo.userData.baseScale);

  sunGlow.userData.baseOpacity = THREE.MathUtils.clamp(glowStrength * 0.4, 0.05, 1.0);
  sunHalo.userData.baseOpacity = THREE.MathUtils.clamp(glowStrength * 0.25, 0.03, 0.9);
  sunGlow.material.opacity = sunGlow.userData.baseOpacity;
  sunHalo.material.opacity = sunHalo.userData.baseOpacity;
  sunPulsePhase = 0;
}

function updateMoons() {
  normalizeMoonSettings();

  // Clear trajectory history when updating moons
  moonsGroup.children.forEach((pivot) => {
    if (pivot.userData.trajectoryHistory) {
      pivot.userData.trajectoryHistory = [];
    }
  });

  while (moonsGroup.children.length > moonSettings.length) {
    const child = moonsGroup.children.pop();
    moonsGroup.remove(child);
  }

  while (moonsGroup.children.length < moonSettings.length) {
    const pivot = new THREE.Group();
    pivot.userData = { 
      mesh: null, 
      orbit: null, 
      physics: null, 
      trueAnomaly: 0,
      trajectoryHistory: [], // Store recent positions for trajectory visualization
      maxTrajectoryPoints: 200 // Maximum number of points to keep in trajectory
    };
    moonsGroup.add(pivot);
  }

  while (orbitLinesGroup.children.length > moonSettings.length) {
    const orbit = orbitLinesGroup.children.pop();
    orbit.geometry.dispose();
    orbit.material.dispose();
  }

  syncDebugMoonArtifacts();

  moonSettings.forEach((moon, index) => {
    const pivot = moonsGroup.children[index];
    pivot.rotation.x = THREE.MathUtils.degToRad(moon.inclination || 0);

    let mesh = pivot.userData.mesh;
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 48),
        new THREE.MeshStandardMaterial({ color: moon.color || "#d0d0d0", roughness: 0.85, metalness: 0.18 })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pivot.add(mesh);
      pivot.userData.mesh = mesh;
    }

    mesh.material.color.set(moon.color || "#d0d0d0");
    mesh.scale.setScalar(Math.max(0.02, moon.size || 0.15) * params.radius);

    const semiMajor = Math.max(0.5, params.radius * (moon.distance || 3.5));
    const eccentricity = THREE.MathUtils.clamp(moon.eccentricity ?? 0, 0, 0.95);
    const phase = (moon.phase ?? 0) % (Math.PI * 2);

    if (!params.physicsEnabled) {
      computeOrbitPosition(semiMajor, eccentricity, phase, mesh.position);
      pivot.userData.physics = null;
      pivot.userData.trueAnomaly = phase;
    } else if (!pivot.userData.physics) {
      pivot.userData.physics = { posWorld: new THREE.Vector3(), velWorld: new THREE.Vector3(), mass: 0, mu: 0, bound: true, energy: 0 };
    }

    if (!pivot.userData.orbit) {
      const orbit = createOrbitLine();
      pivot.userData.orbit = orbit;
      orbitLinesGroup.add(orbit);
    }

    // Initialize trajectory history if it doesn't exist
    if (!pivot.userData.trajectoryHistory) {
      pivot.userData.trajectoryHistory = [];
      pivot.userData.maxTrajectoryPoints = 200;
    }

    // For non-physics mode, use the old elliptical orbit method
    if (!params.physicsEnabled) {
      updateOrbitLine(pivot.userData.orbit.geometry, moon);
      updateOrbitMaterial(pivot, true);
    // Keep classic alignment for non-physics (ellipse preview)
    alignOrbitLineWithPivot(pivot);
    } else {
      // For physics mode, we'll build the trajectory over time
      updateOrbitMaterial(pivot, true);
    // Ensure the trajectory line starts with identity transform in physics mode
    const orbit = pivot.userData.orbit;
    if (orbit) {
      orbit.position.set(0, 0, 0);
      orbit.quaternion.identity();
      orbit.scale.set(1, 1, 1);
      orbit.updateMatrixWorld(true);
    }
    }
  });

  if (params.physicsEnabled) {
    initMoonPhysics();
  } else {
    updateStabilityDisplay(moonSettings.length, moonSettings.length);
  }
}

function createOrbitLine() {
  const segments = 200; // Increased for better trajectory visualization
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(segments * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0x88a1ff, transparent: true, opacity: 0.3, depthWrite: false });
  material.userData = { stableColor: new THREE.Color(0x88a1ff), unstableColor: new THREE.Color(0xff7666) };
  const line = new THREE.Line(geometry, material); // Changed from LineLoop to Line for trajectory
  line.frustumCulled = false;
  return line;
}

function updateTrajectoryHistory(pivot, worldPosition) {
  if (!pivot.userData.trajectoryHistory) {
    pivot.userData.trajectoryHistory = [];
    pivot.userData.maxTrajectoryPoints = 200;
  }
  
  const history = pivot.userData.trajectoryHistory;
  const maxPoints = pivot.userData.maxTrajectoryPoints;
  
  // Add current position to history
  history.push(worldPosition.clone());
  
  // Keep only the most recent points
  if (history.length > maxPoints) {
    history.shift(); // Remove oldest point
  }
}

function updateTrajectoryLine(pivot) {
  if (!pivot.userData.orbit || !pivot.userData.trajectoryHistory) return;
  
  const orbit = pivot.userData.orbit;
  // Ensure the trajectory line has identity transform in the orbit group space
  orbit.position.set(0, 0, 0);
  orbit.quaternion.identity();
  orbit.scale.set(1, 1, 1);
  orbit.updateMatrixWorld(true);
  const history = pivot.userData.trajectoryHistory;
  const geometry = orbit.geometry;
  const positions = geometry.attributes.position.array;
  
  // Clear the positions array
  positions.fill(0);
  
  if (history.length < 2) {
    geometry.attributes.position.needsUpdate = true;
    return;
  }
  
  // Convert world positions to local positions relative to the orbit line group
  const localPos = new THREE.Vector3();
  for (let i = 0; i < history.length && i < positions.length / 3; i++) {
    const worldPos = history[i];
    orbitLinesGroup.worldToLocal(localPos.copy(worldPos));
    positions[i * 3 + 0] = localPos.x;
    positions[i * 3 + 1] = localPos.y;
    positions[i * 3 + 2] = localPos.z;
  }
  
  // Set the count to the actual number of points we have
  geometry.setDrawRange(0, Math.min(history.length, positions.length / 3));
  geometry.attributes.position.needsUpdate = true;
  geometry.computeBoundingSphere();
}

function updateOrbitLine(geometry, moon) {
  const positions = geometry.attributes.position.array;
  const segments = geometry.attributes.position.count;
  const semiMajor = Math.max(0.5, params.radius * (moon.distance || 3.5));
  const eccentricity = THREE.MathUtils.clamp(moon.eccentricity ?? 0, 0, 0.95);
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const r = (semiMajor * (1 - eccentricity * eccentricity)) / Math.max(1e-6, 1 + eccentricity * Math.cos(angle));
    positions[i * 3 + 0] = Math.cos(angle) * r;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = Math.sin(angle) * r;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.computeBoundingSphere();
}

function alignOrbitLineWithPivot(pivot) {
  if (!pivot?.userData?.orbit) return;
  const orbit = pivot.userData.orbit;
  pivot.updateMatrixWorld(true);
  const pivotWorldQuat = pivot.getWorldQuaternion(tmpQuatA);
  const parentWorldQuat = orbitLinesGroup.getWorldQuaternion(tmpQuatB);
  parentWorldQuat.invert();
  orbit.quaternion.copy(parentWorldQuat.multiply(pivotWorldQuat));
  const pivotWorldPos = pivot.getWorldPosition(tmpVecF);
  orbitLinesGroup.worldToLocal(pivotWorldPos);
  orbit.position.copy(pivotWorldPos);
  orbit.updateMatrixWorld(true);
}

function syncOrbitLinesWithPivots() {
  if (!params.showOrbitLines) return;
  moonsGroup.children.forEach((pivot) => {
    if (!pivot?.userData?.orbit) return;
    
    // Update trajectory line based on actual moon movement
    if (params.physicsEnabled && pivot.userData.trajectoryHistory && pivot.userData.trajectoryHistory.length > 1) {
      updateTrajectoryLine(pivot);
    } else {
      // For non-physics mode or when no trajectory history exists, use the old method
      alignOrbitLineWithPivot(pivot);
    }
  });
}

function getPlanetMass() {
  const radius = Math.max(0.1, params.radius);
  return params.gravity * radius * radius;
}

function getMoonMass(moon) {
  const moonRadius = Math.max(0.05, moon.size || 0.15) * params.radius;
  const density = Math.max(0.05, params.moonMassScale);
  return Math.pow(moonRadius, 3) * density;
}

function getGravParameter(planetMass, moonMass = 0) {
  return planetMass + moonMass;
}

function computeOrbitPosition(semiMajor, eccentricity, trueAnomaly, target = new THREE.Vector3()) {
  const cosT = Math.cos(trueAnomaly);
  const sinT = Math.sin(trueAnomaly);
  const denom = Math.max(1e-6, 1 + eccentricity * cosT);
  const r = (semiMajor * (1 - eccentricity * eccentricity)) / denom;
  target.set(r * cosT, 0, r * sinT);
  return target;
}

function computeOrbitVelocity(semiMajor, eccentricity, trueAnomaly, mu, target = new THREE.Vector3()) {
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

function computeAccelerationTowards(targetPosition, sourcePosition, mu, out = tmpVecA) {
  out.copy(sourcePosition).sub(targetPosition);
  const distSq = Math.max(1e-6, out.lengthSq());
  const dist = Math.sqrt(distSq);
  return out.multiplyScalar(-mu / (distSq * dist));
}

//#region Debug helpers
function syncDebugMoonArtifacts() {
  while (debugMoonArrows.length > moonSettings.length) {
    const arrow = debugMoonArrows.pop();
    scene.remove(arrow);
    if (arrow.cone) {
      arrow.cone.geometry.dispose();
      arrow.cone.material.dispose();
    }
    if (arrow.line) {
      arrow.line.geometry.dispose();
      arrow.line.material.dispose();
    }
  }
  while (debugMoonArrows.length < moonSettings.length) {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x61b8ff);
    arrow.visible = debugState.showMoonVelocity;
    scene.add(arrow);
    debugMoonArrows.push(arrow);
  }

  if (debugMoonSpeedList) {
    while (debugMoonSpeedRows.length > moonSettings.length) {
      const row = debugMoonSpeedRows.pop();
      if (row && row.parentElement) {
        row.parentElement.removeChild(row);
      }
    }
    while (debugMoonSpeedRows.length < moonSettings.length) {
      const index = debugMoonSpeedRows.length;
      const row = document.createElement("li");
      row.className = "debug-moon-entry";
      row.textContent = `Moon ${index + 1}: -`;
      debugMoonSpeedList.appendChild(row);
      debugMoonSpeedRows.push(row);
    }
  }
}

function updateDebugVectors() {
  const planetVel = params.physicsEnabled ? planetRoot.userData.planetVel : null;
  const planetSpeed = planetVel ? planetVel.length() : 0;
  if (debugPlanetSpeedDisplay) {
    debugPlanetSpeedDisplay.textContent = planetSpeed.toFixed(3);
  }

  if (debugState.showPlanetVelocity && planetVel && planetSpeed > 1e-4) {
    const origin = planetRoot.getWorldPosition(debugVec2);
    debugPlanetArrow.position.copy(origin);
    debugPlanetArrow.setDirection(debugVec.copy(planetVel).normalize());
    const length = THREE.MathUtils.clamp(planetSpeed * debugVectorScale, 0.2, 10);
    debugPlanetArrow.setLength(length, length * 0.6, length * 0.35);
    debugPlanetArrow.visible = true;
  } else {
    debugPlanetArrow.visible = false;
  }

  moonSettings.forEach((moon, index) => {
    const pivot = moonsGroup.children[index];
    const arrow = debugMoonArrows[index];
    const row = debugMoonSpeedRows[index];
    if (!pivot || !moon) {
      if (row) row.textContent = `Moon ${index + 1}: -`;
      if (arrow) arrow.visible = false;
      return;
    }

    const mesh = pivot.userData.mesh;
    if (!mesh) {
      if (row) row.textContent = `Moon ${index + 1}: -`;
      if (arrow) arrow.visible = false;
      return;
    }

    pivot.updateMatrixWorld(true);
    const posWorld = mesh.getWorldPosition(debugVec2);

    let velWorld = debugVec3.set(0, 0, 0);
    if (params.physicsEnabled && pivot.userData.physics?.velWorld) {
      velWorld = debugVec3.copy(pivot.userData.physics.velWorld);
      if (planetVel) {
        velWorld.sub(planetVel);
      }
    } else {
      const semiMajor = Math.max(0.5, params.radius * (moon.distance || 3.5));
      const eccentricity = THREE.MathUtils.clamp(moon.eccentricity ?? 0, 0, 0.95);
      const anomaly = pivot.userData.trueAnomaly ?? (moon.phase ?? 0);
      const mu = getGravParameter(getPlanetMass());
      const velLocal = computeOrbitVelocity(semiMajor, eccentricity, anomaly, mu, debugVec);
      const rawSpeed = moon.orbitSpeed ?? 0.4;
      const speedMultiplier = (Math.sign(rawSpeed) || 1) * Math.max(0.2, Math.abs(rawSpeed));
      velLocal.multiplyScalar(speedMultiplier);
      const rotationMatrix = debugMatrix.setFromMatrix4(pivot.matrixWorld);
      velWorld = debugVec3.copy(velLocal).applyMatrix3(rotationMatrix);
    }

    const speed = velWorld.length();
    if (row) {
      row.textContent = `Moon ${index + 1}: ${speed.toFixed(3)} u/s`;
    }

    if (debugState.showMoonVelocity && arrow && speed > 1e-4) {
      arrow.position.copy(posWorld);
      arrow.setDirection(debugVec.copy(velWorld).normalize());
      const length = THREE.MathUtils.clamp(speed * debugVectorScale, 0.15, 8);
      arrow.setLength(length, length * 0.6, length * 0.35);
      arrow.visible = true;
    } else if (arrow) {
      arrow.visible = false;
    }
  });
}
//#endregion

function updateOrbitMaterial(pivot, isBound) {
  const orbit = pivot.userData.orbit;
  if (orbit && orbit.material) {
    const mat = orbit.material;
    const stable = mat.userData?.stableColor || new THREE.Color(0x88a1ff);
    const unstable = mat.userData?.unstableColor || new THREE.Color(0xff7666);
    mat.color.copy(isBound ? stable : unstable);
    mat.opacity = isBound ? 0.32 : 0.5;
  }
  const mesh = pivot.userData.mesh;
  if (mesh?.material?.isMeshStandardMaterial) {
    mesh.material.emissive = mesh.material.emissive || new THREE.Color();
    mesh.material.emissive.setHex(isBound ? 0x1a2d4d : 0x5a1b1b);
    mesh.material.emissiveIntensity = isBound ? 0.25 : 0.55;
  }
}

function updateOrbitLinesVisibility() {
  orbitLinesGroup.visible = params.showOrbitLines;
}

//#endregion
//#region Presets and sharing
function applyPreset(name, { skipShareUpdate = false, keepSeed = false } = {}) {
  const preset = presets[name];
  if (!preset) return;
  isApplyingPreset = true;

  Object.entries(preset).forEach(([key, value]) => {
    if (key === "moons") return;
    if (key === "seed" && keepSeed) return;
    if (!(key in params)) return;
    params[key] = value;
    guiControllers[key]?.setValue?.(value);
  });

  if (!keepSeed && preset.seed) {
    params.seed = preset.seed;
    guiControllers.seed?.setValue?.(params.seed);
    updateSeedDisplay();
  }

  if (Array.isArray(preset.moons)) {
    moonSettings.splice(0, moonSettings.length, ...preset.moons.map((moon, index) => ({ ...createDefaultMoon(index), ...moon })));
    params.moonCount = moonSettings.length;
    guiControllers.moonCount?.setValue?.(params.moonCount);
    rebuildMoonControls();
  } else {
    syncMoonSettings();
  }

  normalizeMoonSettings();

  updatePalette();
  updateClouds();
  updateSun();
  updateTilt();
  updateGravityDisplay();
  regenerateStarfield();
  updateStarfieldUniforms();
  markPlanetDirty();
  markMoonsDirty();
  initMoonPhysics();

  isApplyingPreset = false;
  updateStabilityDisplay(moonSettings.length, moonSettings.length);
  if (!skipShareUpdate) {
    scheduleShareUpdate();
  }
}

async function initFromHash() {
  if (!window.location.hash) {
    console.log("🔍 No hash in URL, skipping load");
    return false;
  }
  
  const code = window.location.hash.slice(1).trim();
  if (!code) {
    console.log("🔍 Empty hash, skipping load");
    return false;
  }
  
  // console.log(`🔍 Attempting to load configuration: ${code}`);
  
  try {
    // Try to load from API first (short ID)
    if (code.length <= 12 && /^[a-zA-Z0-9_-]+$/.test(code)) {
      // console.log(`🔄 Loading configuration from API: ${code}`);
      const result = await loadConfigurationFromAPI(code);
      
      if (result && result.data) {
        // console.log(`✅ Loaded configuration from API: ${result.id}`);
        console.log(`📦 Configuration data:`, {
          seed: result.data.seed,
          moonCount: result.data.moonCount,
          preset: result.data.preset
        });
        
        await applyConfigurationFromAPI(result);
        console.log("🎉 Configuration applied successfully");
        return true;
      } else {
        console.warn("⚠️ API returned empty or invalid data");
      }
    }
  } catch (error) {
    console.warn('⚠️ Failed to load from API, trying legacy format:', error.message);
  }

  // Fallback to legacy base64 decoding
  try {
    // console.log("🔄 Trying legacy base64 format...");
    const payload = decodeShare(code);
    if (!payload) {
      console.warn("⚠️ Legacy decode returned empty payload");
      return false;
    }
    
    // console.log("✅ Legacy payload decoded, applying...");
    applySharePayload(payload);
    // console.log("🎉 Legacy configuration applied successfully");
    return true;
  } catch (err) {
    console.warn("❌ Failed to load share code:", err.message);
  }
  
  console.log("❌ All load methods failed");
  return false;
}

function applySharePayload(payload) {
  if (!payload || typeof payload !== "object") return;
  const data = payload.data || {};
  shareKeys.forEach((key) => {
    if (data[key] === undefined) return;
    params[key] = data[key];
    guiControllers[key]?.setValue?.(data[key]);
  });

  if (data.seed) {
    params.seed = data.seed;
    guiControllers.seed?.setValue?.(params.seed);
    updateSeedDisplay();
  }

  if (Array.isArray(payload.moons)) {
    moonSettings.splice(0, moonSettings.length, ...payload.moons.map((moon, index) => ({ ...createDefaultMoon(index), ...moon })));
    params.moonCount = moonSettings.length;
    guiControllers.moonCount?.setValue?.(params.moonCount);
    rebuildMoonControls();
  }

  if (payload.preset && presets[payload.preset]) {
    params.preset = payload.preset;
    guiControllers.preset?.setValue?.(payload.preset);
  }

  normalizeMoonSettings();

  updatePalette();
  updateClouds();
  updateSun();
  updateTilt();
  updateGravityDisplay();
  regenerateStarfield();
  updateStarfieldUniforms();
  markPlanetDirty();
  markMoonsDirty();
  initMoonPhysics();
  updateStabilityDisplay(moonSettings.length, moonSettings.length);
  scheduleShareUpdate();
}
//#endregion
//#region UI updates
function updateStabilityDisplay(stable, total) {
  if (!stabilityDisplay) return;
  if (!total) {
    stabilityDisplay.textContent = "-";
    stabilityDisplay.removeAttribute("data-escaping");
    return;
  }
  const clampedStable = Math.max(0, Math.min(total, stable));
  const escaping = total - clampedStable;
  stabilityDisplay.textContent = `${clampedStable}/${total}`;
  if (escaping > 0) {
    stabilityDisplay.setAttribute("data-escaping", "1");
  } else {
    stabilityDisplay.removeAttribute("data-escaping");
  }
}

function handleSeedChanged({ skipShareUpdate = false } = {}) {
  updateSeedDisplay();
  regenerateStarfield();
  cloudTextureDirty = true;
  markPlanetDirty();
  if (!skipShareUpdate) {
    scheduleShareUpdate();
  }
}

function updateSeedDisplay() {
  if (seedDisplay) {
    seedDisplay.textContent = params.seed;
  }
}

function updateGravityDisplay() {
  if (gravityDisplay) {
    gravityDisplay.textContent = `${params.gravity.toFixed(2)} m/s^2`;
  }
}

function updateTimeDisplay(years) {
  if (!timeDisplay) return;
  timeDisplay.textContent = formatYears(years);
}

function formatYears(years) {
  if (years < 1 / 12) {
    return `${(years * 365).toFixed(1)} d`;
  }
  if (years < 1) {
    return `${(years * 12).toFixed(1)} mo`;
  }
  if (years < 1000) {
    return `${years.toFixed(1)} y`;
  }
  if (years < 1e6) {
    return `${(years / 1000).toFixed(1)} ky`;
  }
  return `${(years / 1e6).toFixed(2)} My`;
}

function onWindowResize() {
  const width = sceneContainer.clientWidth;
  const height = sceneContainer.clientHeight;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (starField?.material?.uniforms?.uPixelRatio) {
    starField.material.uniforms.uPixelRatio.value = pixelRatio;
  }
}
//#endregion
//#region Dirty flags & share codes
function markPlanetDirty() {
  planetDirty = true;
}

function markMoonsDirty() {
  moonsDirty = true;
}

function scheduleShareUpdate() {
  shareDirty = true;
  debounceShare();
}

function updateShareCode() {
  // Only generate local code for display - don't save to database
  // Database saving only happens when user clicks "Copy Share Code"
  // console.log("🔄 Updating share code display...");
  
  const payload = buildSharePayload();
  const encoded = encodeShare(payload);
  const formatted = chunkCode(encoded, 5).join(" ");
  
  if (shareDisplay) {
    shareDisplay.textContent = formatted;
    shareDisplay.dataset.code = encoded;
    shareDisplay.title = `Local code - Click "Copy Share Code" to save to API\nClick to copy`;
  }
  
  history.replaceState(null, "", `#${encoded}`);
  // console.log("📋 Local share code generated for display");
}

function buildSharePayload() {
  const data = {};
  shareKeys.forEach((key) => {
    data[key] = params[key];
  });
  const moons = moonSettings.slice(0, params.moonCount).map((moon) => ({
    size: moon.size,
    distance: moon.distance,
    orbitSpeed: moon.orbitSpeed,
    inclination: moon.inclination,
    color: moon.color,
    phase: moon.phase,
    eccentricity: moon.eccentricity
  }));
  return {
    version: 1,
    preset: params.preset,
    data,
    moons
  };
}


// Save configuration to API and get short ID
async function saveConfigurationToAPI(configData, metadata = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: configData,
        metadata: {
          ...metadata,
          preset: params.preset,
          moonCount: params.moonCount,
          timestamp: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error saving to API:', error);
    throw error;
  }
}

// Load configuration from API by ID
async function loadConfigurationFromAPI(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/share/${id}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Configuration not found');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error loading from API:', error);
    throw error;
  }
}

function encodeShare(payload) {
  const json = JSON.stringify(payload);
  const base64 = btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return base64;
}

function decodeShare(code) {
  const padded = padBase64(code.replace(/-/g, "+").replace(/_/g, "/"));
  const json = atob(padded);
  return JSON.parse(json);
}

function padBase64(str) {
  const pad = str.length % 4;
  if (pad === 0) return str;
  return `${str}${"=".repeat(4 - pad)}`;
}

function chunkCode(str, size) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}
//#endregion
//#region Helpers
function regenerateCloudTexture() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  const data = img.data;

  const rng = new SeededRNG(`${params.seed || "default"}-clouds`);
  const noise = createNoise3D(() => rng.next());
  const scale = Math.max(0.2, params.cloudNoiseScale || 3.2);
  const density = THREE.MathUtils.clamp(params.cloudDensity ?? 0.5, 0, 1);
  const threshold = THREE.MathUtils.clamp(0.15 + (1 - density) * 0.75, 0.05, 0.9);
  const feather = 0.12; // soft edges

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const yy = (v * 2 - 1) * scale;
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const theta = u * Math.PI * 2;
      const nx = Math.cos(theta) * scale;
      const nz = Math.sin(theta) * scale;

      // 3-layer fBm for richer clouds
      let val = 0;
      let amp = 0.6;
      let freq = 1;
      for (let o = 0; o < 3; o += 1) {
        const n = noise(nx * freq, yy * freq, nz * freq) * 0.5 + 0.5;
        val += n * amp;
        freq *= 2;
        amp *= 0.5;
      }
      val = THREE.MathUtils.clamp(val, 0, 1);
      // Threshold with feather to control coverage via density
      const a = THREE.MathUtils.clamp((val - threshold) / Math.max(1e-6, feather), 0, 1);
      const alpha = Math.pow(a, 1.2) * params.cloudsOpacity;

      const i = (y * width + x) * 4;
      data[i + 0] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cloudTexture = tex;
  cloudTextureDirty = false;
}
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const ok = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (ok) {
        resolve();
      } else {
        reject(new Error("Copy command failed"));
      }
    } catch (err) {
      document.body.removeChild(textArea);
      reject(err);
    }
  });
}

function flashShareFeedback() {
  shareDisplay?.classList.add("copied");
  setTimeout(() => shareDisplay?.classList.remove("copied"), 400);
}


function generateSeed() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const length = 8;
  const array = new Uint32Array(length);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i += 1) {
      array[i] = Math.floor(Math.random() * alphabet.length);
    }
  }
  let seed = "";
  for (let i = 0; i < length; i += 1) {
    seed += alphabet[array[i] % alphabet.length];
  }
  return seed;
}

function regenerateStarfield() {
  if (starField) {
    scene.remove(starField);
    starField.geometry.dispose();
    starField.material.dispose();
    starField = null;
  }
  starField = createStarfield({ seed: params.seed, count: params.starCount });
  scene.add(starField);
  updateStarfieldUniforms();
}

function updateStarfieldUniforms() {
  if (!starField || !starField.material || !starField.material.uniforms) return;
  const uniforms = starField.material.uniforms;
  uniforms.uBrightness.value = params.starBrightness;
  uniforms.uTwinkleSpeed.value = params.starTwinkleSpeed;
  uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
}

function createStarfield({ seed, count }) {
  const starCount = Math.max(100, Math.round(count || 2000));
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);
  const rng = new SeededRNG(`${seed || "default"}-stars`);
  const color = new THREE.Color();

  for (let i = 0; i < starCount; i += 1) {
    const radius = THREE.MathUtils.lerp(90, 280, rng.next());
    const u = rng.next() * 2 - 1;
    const theta = rng.next() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.clamp(u, -1, 1));
    const sinPhi = Math.sin(phi);
    positions[i * 3 + 0] = radius * sinPhi * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * sinPhi * Math.sin(theta);

    const hue = (0.52 + rng.next() * 0.22) % 1;
    const saturation = 0.15 + rng.next() * 0.35;
    const lightness = 0.65 + rng.next() * 0.3;
    color.setHSL(hue, saturation, lightness);
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    sizes[i] = THREE.MathUtils.lerp(0.6, 2.1, rng.next());
    phases[i] = rng.next() * Math.PI * 2;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

  const pointTexture = createSunTexture({ inner: 0.0, outer: 0.5, innerAlpha: 1, outerAlpha: 0 });
  const material = new THREE.PointsMaterial({
    size: 1.6,
    map: pointTexture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
function createSunTexture({ inner = 0.1, outer = 1, innerAlpha = 1, outerAlpha = 0 } = {}) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const innerRadius = Math.max(0, inner) * size * 0.5;
  const outerRadius = Math.max(innerRadius + 1, outer * size * 0.5);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, innerRadius, size / 2, size / 2, outerRadius);
  gradient.addColorStop(0, `rgba(255,255,255,${innerAlpha})`);
  gradient.addColorStop(0.5, `rgba(255,255,255,${innerAlpha * 0.7})`);
  gradient.addColorStop(1, `rgba(255,255,255,${outerAlpha})`);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.anisotropy = 2;
  return texture;
}

// Explosion particles when a moon is destroyed
function spawnExplosion(position, color = new THREE.Color(0xffaa66), strength = 1) {
  if (!params.explosionEnabled) return;
  const effectiveStrength = Math.max(0.05, params.explosionStrength) * Math.max(0.1, strength);
  const baseCount = Math.max(10, Math.round(params.explosionParticleBase || 80));
  const count = Math.max(20, Math.floor(baseCount * THREE.MathUtils.clamp(effectiveStrength, 0.2, 4)));
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  // Create a more diverse color palette based on surprise me parameters
  const baseCol = new THREE.Color();
  baseCol.set(params.explosionColor || 0xffaa66);
  const col = new THREE.Color(color);
  
  // Create multiple color variations for more interesting explosions
  const colorVariations = [
    baseCol.clone(),
    baseCol.clone().lerp(col, 0.3),
    baseCol.clone().lerp(col, 0.6),
    baseCol.clone().lerp(new THREE.Color(1, 0.2, 0.1), 0.4), // Red-orange
    baseCol.clone().lerp(new THREE.Color(1, 0.8, 0.2), 0.3), // Yellow-orange
    baseCol.clone().lerp(new THREE.Color(0.8, 0.2, 1), 0.2), // Purple
    baseCol.clone().lerp(new THREE.Color(0.2, 0.8, 1), 0.2), // Blue
  ];

  for (let i = 0; i < count; i += 1) {
    positions[i * 3 + 0] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;

    // Random radial direction with slight upward bias
    const dir = new THREE.Vector3(
      (Math.random() - 0.5),
      (Math.random() - 0.2),
      (Math.random() - 0.5)
    ).normalize();
    
    // Use speed variation parameter for more dynamic explosions
    const baseSpeed = THREE.MathUtils.lerp(3.5, 10.5, Math.random()) * effectiveStrength;
    const speedVariation = THREE.MathUtils.lerp(0.5, 2.0, Math.random()) * (params.explosionSpeedVariation || 1.0);
    const speed = baseSpeed * speedVariation;
    
    velocities[i * 3 + 0] = dir.x * speed;
    velocities[i * 3 + 1] = dir.y * speed;
    velocities[i * 3 + 2] = dir.z * speed;

    // Pick a random color variation and add some randomness
    const baseColor = colorVariations[Math.floor(Math.random() * colorVariations.length)];
    const colorVariation = params.explosionColorVariation || 0.5;
    const tint = baseColor.clone().lerp(
      new THREE.Color(Math.random(), Math.random(), Math.random()), 
      Math.random() * colorVariation
    );
    
    // Add some brightness variation
    tint.multiplyScalar(THREE.MathUtils.lerp(0.7, 1.3, Math.random()));
    tint.r = THREE.MathUtils.clamp(tint.r, 0, 1);
    tint.g = THREE.MathUtils.clamp(tint.g, 0, 1);
    tint.b = THREE.MathUtils.clamp(tint.b, 0, 1);
    
    colors[i * 3 + 0] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const pointTexture = createSunTexture({ inner: 0.0, outer: 0.55, innerAlpha: 1, outerAlpha: 0 });
  const sizeVariation = params.explosionSizeVariation || 1.0;
  const material = new THREE.PointsMaterial({
    size: Math.max(0.1, (params.explosionSize || 0.8) * Math.max(1, effectiveStrength) * sizeVariation),
    map: pointTexture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    opacity: 1
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  activeExplosions.push({
    object: points,
    velocities,
    life: 0,
    maxLife: Math.max(0.1, params.explosionLifetime || 1.6),
    damping: THREE.MathUtils.clamp(params.explosionDamping ?? 0.9, 0.4, 1)
  });
}

function updateExplosions(dt) {
  if (activeExplosions.length === 0) return;
  for (let i = activeExplosions.length - 1; i >= 0; i -= 1) {
    const e = activeExplosions[i];
    const geom = e.object.geometry;
    const positions = geom.attributes.position.array;
    const vels = e.velocities;

    const drag = Math.pow(e.damping, Math.max(0, dt) * 60);
    for (let p = 0; p < vels.length; p += 3) {
      vels[p + 0] *= drag;
      vels[p + 1] *= drag; // removed gravity effect
      vels[p + 2] *= drag;

      positions[p + 0] += vels[p + 0] * dt;
      positions[p + 1] += vels[p + 1] * dt;
      positions[p + 2] += vels[p + 2] * dt;
    }
    geom.attributes.position.needsUpdate = true;

    e.life += dt;
    const t = THREE.MathUtils.clamp(e.life / e.maxLife, 0, 1);
    const fade = 1 - Math.pow(t, 1.8);
    e.object.material.opacity = fade;
    e.object.material.size = Math.max(0.1, e.object.material.size * (0.995 + 0.002 * Math.random()));

    if (e.life >= e.maxLife) {
      scene.remove(e.object);
      if (geom) geom.dispose();
      if (e.object.material && e.object.material.map) e.object.material.map.dispose();
      if (e.object.material) e.object.material.dispose();
      activeExplosions.splice(i, 1);
    }
  }
}


//#endregion
//#region Export
function exportPlanetAsFBX() {
  // FBX export temporarily disabled
  console.log("FBX export temporarily disabled");
  // const clone = planetRoot.clone(true);
  // const toRemove = [];
  // clone.traverse((node) => {
  //   if (node.isLine || node.isPoints) {
  //     toRemove.push(node);
  //   }
  //   if (node.isMesh) {
  //     node.material = node.material.clone();
  //     node.geometry = node.geometry.clone();
  //   }
  // });
  // toRemove.forEach((node) => {
  //   if (node.parent) {
  //     node.parent.remove(node);
  //   }
  // });
  // const safePreset = params.preset.replace(/\s+/g, "_");
  // const blob = exportFBX(clone, { sceneName: safePreset });
  // saveArrayBuffer(blob, `${safePreset}_${params.seed}.fbx`);
}

//#region Loading overlay
function showLoading() {
  if (loadingOverlay) loadingOverlay.hidden = false;
}

function hideLoading() {
  if (loadingOverlay) loadingOverlay.hidden = true;
}

function hideLoadingSoon() {
  // Give the browser a moment to paint
  setTimeout(() => hideLoading(), 30);
}
//#endregion

//#region Physics simulation
function initMoonPhysics() {
  if (!params.physicsEnabled) {
    planetRoot.position.set(0, 0, 0);
    const planetVel = planetRoot.userData.planetVel || new THREE.Vector3();
    planetVel.set(0, 0, 0);
    planetRoot.userData.planetVel = planetVel;
    moonsGroup.children.forEach((pivot, index) => {
      const moon = moonSettings[index];
      const mesh = pivot.userData.mesh;
      if (!moon || !mesh) return;
      const semiMajor = Math.max(0.5, params.radius * (moon.distance || 3.5));
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

  const planetMass = getPlanetMass();
  const planetVel = planetRoot.userData.planetVel || new THREE.Vector3();
  planetVel.set(0, 0, 0);
  planetRoot.userData.planetVel = planetVel;
  if (!params.physicsTwoWay) {
    planetRoot.position.set(0, 0, 0);
  }

  const totalMomentum = tmpVecD.set(0, 0, 0);
  let totalMoonMass = 0;

  moonsGroup.children.forEach((pivot, index) => {
    const moon = moonSettings[index];
    const mesh = pivot.userData.mesh;
    if (!moon || !mesh) return;

    const semiMajor = Math.max(0.5, params.radius * (moon.distance || 3.5));
    const eccentricity = THREE.MathUtils.clamp(moon.eccentricity ?? 0, 0, 0.95);
    const phase = (moon.phase ?? 0) % (Math.PI * 2);

    computeOrbitPosition(semiMajor, eccentricity, phase, mesh.position);

    pivot.updateMatrixWorld(true);
    const posWorld = pivot.localToWorld(mesh.position.clone());
    const rotMatrix = tmpMatrix3.setFromMatrix4(pivot.matrixWorld);
    const moonMass = getMoonMass(moon);
    const mu = getGravParameter(planetMass, params.physicsTwoWay ? moonMass : 0);
    const velLocal = computeOrbitVelocity(semiMajor, eccentricity, phase, mu, tmpVecA);
    const rawSpeedSetting = moon.orbitSpeed ?? 0.4;
    const speedFactor = (Math.sign(rawSpeedSetting) || 1) * (THREE.MathUtils.clamp(Math.abs(rawSpeedSetting), 0.2, 4) / 0.4);
    velLocal.multiplyScalar(speedFactor);
    const velWorld = velLocal.clone().applyMatrix3(rotMatrix);
    if (params.physicsTwoWay) {
      totalMomentum.add(tmpVecE.copy(velWorld).multiplyScalar(moonMass));
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

function resetMoonPhysics() {
  // Clear trajectory history when resetting physics
  moonsGroup.children.forEach((pivot) => {
    if (pivot.userData.trajectoryHistory) {
      pivot.userData.trajectoryHistory = [];
    }
  });
  initMoonPhysics();
}

function stepMoonPhysics(dt) {
  if (!params.physicsEnabled) return;
  const substeps = Math.max(1, Math.round(params.physicsSubsteps || 1));
  const h = dt / substeps;
  const planetMass = getPlanetMass();
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
      // Velocity Verlet: v += 0.5 * (a + a_next) * h
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

      // Track trajectory for orbit line visualization
      updateTrajectoryHistory(pivot, phys.posWorld.clone());

      const rVec = tmpVecA.copy(phys.posWorld).sub(planetWorld);
      const dist = Math.max(1e-5, rVec.length());
      const speedSq = phys.velWorld.lengthSq();
      phys.energy = 0.5 * speedSq - phys.mu / dist;
      phys.bound = phys.energy < 0 && dist < params.radius * 140;
      updateOrbitMaterial(pivot, phys.bound);

      // Collision detection (approximate)
      const moonRadius = mesh.scale.x; // sphere geometry radius is 1 scaled to size*params.radius
      const collisionRadius = Math.max(0.1, params.radius) + moonRadius * 0.95;
      if (dist <= collisionRadius) {
        pivot.userData._collided = true;
        collidedIndices.add(index);
      }
    });

    if (params.physicsTwoWay) {
      planetRoot.position.addScaledVector(planetVel, h);
    }
  }

  planetRoot.userData.planetVel = planetVel;

  let boundCount = 0;
  moonsGroup.children.forEach((pivot) => {
    if (pivot.userData.physics?.bound !== false) {
      boundCount += 1;
    }
  });
  updateStabilityDisplay(boundCount, moonSettings.length);

  // Resolve collisions after substeps
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
      spawnExplosion(pos, color, 2 * strength);

      // Clean up orbit line for this moon
      if (pivot.userData.orbit) {
        const orbit = pivot.userData.orbit;
        orbitLinesGroup.remove(orbit);
        if (orbit.geometry) orbit.geometry.dispose();
        if (orbit.material) orbit.material.dispose();
        pivot.userData.orbit = null;
      }
      // Remove mesh immediately for visual feedback
      if (mesh && mesh.parent) {
        mesh.parent.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      }
      // Remove pivot from scene graph to keep indices aligned
      moonsGroup.remove(pivot);

      // Remove moon from settings; do not trigger a full rebuild
      moonSettings.splice(idx, 1);
    });
    params.moonCount = moonSettings.length;
    // Avoid firing Moons Count onChange; just refresh UI and debug artifacts
    try { guiControllers.moonCount?.updateDisplay?.(); } catch {}
    syncDebugMoonArtifacts();
    rebuildMoonControls();
    updateStabilityDisplay(moonSettings.length, moonSettings.length);
  }
}

//#endregion

//#region Surprise Me
function surpriseMe() {
  const newSeed = generateSeed();
  const rng = new SeededRNG(newSeed);
  const presetNames = Object.keys(presets);
  const pickPreset = presetNames[Math.floor(rng.next() * presetNames.length)];
  isApplyingPreset = true;
  applyPreset(pickPreset, { skipShareUpdate: true, keepSeed: true });
  isApplyingPreset = false;

  params.seed = newSeed;
  guiControllers.seed?.setValue?.(newSeed);

  // Planet shape
  params.radius = THREE.MathUtils.lerp(0.6, 3.8, rng.next());
  params.subdivisions = Math.round(THREE.MathUtils.lerp(3, 6, rng.next()));
  params.noiseLayers = Math.round(THREE.MathUtils.lerp(3, 7, rng.next()));
  params.noiseFrequency = THREE.MathUtils.lerp(0.8, 5.2, rng.next());
  params.noiseAmplitude = THREE.MathUtils.lerp(0.2, 0.9, rng.next());
  params.persistence = THREE.MathUtils.lerp(0.35, 0.65, rng.next());
  params.lacunarity = THREE.MathUtils.lerp(1.6, 3.2, rng.next());
  params.oceanLevel = THREE.MathUtils.lerp(0.2, 0.7, rng.next());

  // Palette (HSL variations)
  const hue = rng.next();
  const hue2 = (hue + 0.12 + rng.next() * 0.2) % 1;
  const hue3 = (hue + 0.3 + rng.next() * 0.3) % 1;
  params.colorOcean = new THREE.Color().setHSL(hue, 0.6, 0.28).getStyle();
  params.colorShallow = new THREE.Color().setHSL(hue, 0.55, 0.45).getStyle();
  params.colorLow = new THREE.Color().setHSL(hue2, 0.42, 0.3).getStyle();
  params.colorMid = new THREE.Color().setHSL(hue2, 0.36, 0.58).getStyle();
  params.colorHigh = new THREE.Color().setHSL(hue3, 0.15, 0.92).getStyle();
  params.atmosphereColor = new THREE.Color().setHSL(hue2, 0.5, 0.7).getStyle();
  params.cloudsOpacity = THREE.MathUtils.lerp(0.1, 0.8, rng.next());
  params.cloudHeight = THREE.MathUtils.lerp(0.01, 0.12, rng.next());
  params.cloudDensity = THREE.MathUtils.lerp(0.25, 0.85, rng.next());
  params.cloudNoiseScale = THREE.MathUtils.lerp(1.2, 5.0, rng.next());
  params.cloudDriftSpeed = THREE.MathUtils.lerp(0, 0.06, rng.next());

  // Motion & environment
  params.axisTilt = THREE.MathUtils.lerp(0, 35, rng.next());
  params.rotationSpeed = THREE.MathUtils.lerp(0.05, 0.5, rng.next());
  params.simulationSpeed = THREE.MathUtils.lerp(0.05, 1.5, rng.next());
  params.gravity = THREE.MathUtils.lerp(4, 25, rng.next());
  params.sunIntensity = THREE.MathUtils.lerp(0.8, 3.5, rng.next());
  params.sunDistance = THREE.MathUtils.lerp(25, 120, rng.next());
  params.sunColor = new THREE.Color().setHSL((hue + 0.05) % 1, 0.65, 0.7).getStyle();
  params.sunSize = THREE.MathUtils.lerp(0.6, 2.8, rng.next());
  params.sunHaloSize = THREE.MathUtils.lerp(4, 14, rng.next());
  params.sunGlowStrength = THREE.MathUtils.lerp(0.6, 2.6, rng.next());
  params.sunPulseSpeed = THREE.MathUtils.lerp(0, 1.6, rng.next());

  // Space
  params.starCount = Math.round(THREE.MathUtils.lerp(1500, 3600, rng.next()));
  params.starBrightness = THREE.MathUtils.lerp(0.6, 1.4, rng.next());
  params.starTwinkleSpeed = THREE.MathUtils.lerp(0.1, 1.6, rng.next());

  // Explosions (effects)
  params.explosionEnabled = true;
  params.explosionColor = new THREE.Color().setHSL((hue + 0.04 + rng.next() * 0.1) % 1, 0.6, THREE.MathUtils.lerp(0.45, 0.7, rng.next())).getStyle();
  params.explosionStrength = THREE.MathUtils.lerp(0.6, 2.2, rng.next());
  params.explosionParticleBase = Math.round(THREE.MathUtils.lerp(60, 220, rng.next()));
  params.explosionSize = THREE.MathUtils.lerp(0.5, 1.6, rng.next());
  params.explosionGravity = 0; // Always 0 since we removed gravity
  params.explosionDamping = THREE.MathUtils.lerp(0.78, 0.96, rng.next());
  params.explosionLifetime = THREE.MathUtils.lerp(0.8, 2.8, rng.next());
  
  // Additional explosion variations for surprise me
  params.explosionColorVariation = THREE.MathUtils.lerp(0.2, 0.8, rng.next()); // How much color variation
  params.explosionSpeedVariation = THREE.MathUtils.lerp(0.5, 2.0, rng.next()); // Speed variation multiplier
  params.explosionSizeVariation = THREE.MathUtils.lerp(0.3, 1.5, rng.next()); // Size variation multiplier

  // Moons
  params.moonCount = Math.round(THREE.MathUtils.lerp(0, 4, rng.next()));
  params.moonMassScale = THREE.MathUtils.lerp(0.6, 2.5, rng.next());
  moonSettings.splice(0, moonSettings.length);
  for (let i = 0; i < params.moonCount; i += 1) {
    moonSettings.push({
      size: THREE.MathUtils.lerp(0.08, 0.4, rng.next()),
      distance: THREE.MathUtils.lerp(2.4, 12.5, rng.next()),
      orbitSpeed: THREE.MathUtils.lerp(0.15, 0.8, rng.next()),
      inclination: THREE.MathUtils.lerp(-25, 25, rng.next()),
      color: new THREE.Color().setHSL((hue + 0.5 + rng.next() * 0.2) % 1, 0.15 + rng.next() * 0.3, 0.6 + rng.next() * 0.2).getStyle(),
      phase: rng.next() * Math.PI * 2,
      eccentricity: THREE.MathUtils.lerp(0.02, 0.55, rng.next())
    });
  }

  // Push to GUI controllers where available
  Object.keys(guiControllers).forEach((key) => {
    if (params[key] !== undefined && guiControllers[key]?.setValue) {
      guiControllers[key].setValue(params[key]);
    }
  });

  normalizeMoonSettings();
  handleSeedChanged({ skipShareUpdate: true });
  updatePalette();
  updateClouds();
  updateSun();
  updateTilt();
  updateGravityDisplay();
  rebuildMoonControls();
  markMoonsDirty();
  initMoonPhysics();
  updateStarfieldUniforms();
  updateStabilityDisplay(moonSettings.length, moonSettings.length);
  scheduleShareUpdate();
}
//#endregion

function saveArrayBuffer(data, filename) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
//#endregion



