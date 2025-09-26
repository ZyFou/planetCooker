import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "lil-gui";
import { debounce, SeededRNG } from "./app/utils.js";
import { initControlSearch } from "./app/gui/controlSearch.js";
import { setupPlanetControls } from "./app/gui/planetControls.js";
import { setupMoonControls } from "./app/gui/moonControls.js";
import { setupRingControls } from "./app/gui/ringControls.js";
import { createStarfield as createStarfieldExt } from "./app/stars.js";
import { encodeShare as encodeShareExt, decodeShare as decodeShareExt, saveConfigurationToAPI as saveConfigurationToAPIExt, loadConfigurationFromAPI as loadConfigurationFromAPIExt } from "./app/shareCore.js";
import { initOnboarding, showOnboarding } from "./app/onboarding.js";
import { Planet } from "./app/planet.js";
import { Sun } from "./app/sun.js";

let planet;
let sun;

const debounceShare = debounce(() => {
  if (!shareDirty) return;
  updateShareCode();
  shareDirty = false;
}, 100); // Reduced from 180ms to 100ms for better responsiveness

//#region Scene and renderer setup
const sceneContainer = document.getElementById("scene");
const controlsContainer = document.getElementById("controls");
const controlSearchInput = document.getElementById("control-search");
const controlSearchClear = document.getElementById("control-search-clear");
const controlSearchEmpty = document.getElementById("control-search-empty");
const controlSearchBar = document.getElementById("control-search-bar");
const infoPanel = document.getElementById("info");
const debugPanel = document.getElementById("debug-panel");
const mobileToggleButton = document.getElementById("toggle-controls");
const panelScrim = document.getElementById("panel-scrim");
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

// LOD Debug controls
const debugLODEnabled = document.getElementById("debug-lod-enabled");
const debugChunkHighlight = document.getElementById("debug-chunk-highlight");
const debugRaycast = document.getElementById("debug-raycast");
const debugLODMetrics = document.getElementById("debug-lod-metrics");
const loadingOverlay = document.getElementById("loading");
const debugHudFpsToggle = document.getElementById("debug-hud-fps");
const cameraModeButton = document.getElementById("camera-mode");
const returnHomeButton = document.getElementById("return-home");
const mobileHomeButton = document.getElementById("mobile-home");
const helpButton = document.getElementById("help");
const mobileHelpButton = document.getElementById("mobile-help");
const exitOverlay = document.getElementById("exit-overlay");
const visualSettingsPopup = document.getElementById("visual-settings-popup");
const visualSettingsClose = document.getElementById("visual-settings-close");
const visualSettingsReset = document.getElementById("visual-settings-reset");
const visualSettingsApply = document.getElementById("visual-settings-apply");
const frameRateControl = document.getElementById("frame-rate-control");
const resolutionScale = document.getElementById("resolution-scale");
const resolutionScaleValue = document.getElementById("resolution-scale-value");
const lightingScale = document.getElementById("lighting-scale");
const lightingScaleValue = document.getElementById("lighting-scale-value");
const particleMaxInput = document.getElementById("particle-max");
const particleMaxValue = document.getElementById("particle-max-value");
const visualSettingsPresetSelect = document.getElementById("visual-settings-preset");
const starMaxInput = document.getElementById("star-max");
const starMaxValue = document.getElementById("star-max-value");
const noiseResolutionInput = document.getElementById("noise-resolution");
const noiseResolutionValue = document.getElementById("noise-resolution-value");
const gasResolutionInput = document.getElementById("gas-resolution");
const gasResolutionValue = document.getElementById("gas-resolution-value");
const ringDetailInput = document.getElementById("ring-detail");
const ringDetailValue = document.getElementById("ring-detail-value");
const photoToggleButton = document.getElementById("photo-toggle");
const photoShutterButton = document.getElementById("photo-shutter");
const previewMode = new URLSearchParams(window.location.search).get("preview") === "1";
if (previewMode) {
  document.body.classList.add("preview-mode");
}
const loadShareParam = new URLSearchParams(window.location.search).get("load");
if (loadShareParam) {
  try {
    const cleaned = loadShareParam.trim();
    if (cleaned.length) {
      window.location.hash = `#${cleaned}`;
    }
  } catch {}
}
if (!sceneContainer) {
  throw new Error("Missing scene container element");
}
if (!controlsContainer) {
  throw new Error("Missing controls container element");
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
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
if (previewMode) {
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
}

// Photo mode state
let isPhotoMode = false;

function relayoutForMode() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        const canvas = renderer.domElement;
        const usingViewport = isPhotoMode;
        const container = sceneContainer;
        const width = Math.max(1, usingViewport ? window.innerWidth : (container?.clientWidth || window.innerWidth));
        const height = Math.max(1, usingViewport ? window.innerHeight : (container?.clientHeight || window.innerHeight));
        const pixelRatio = Math.min(window.devicePixelRatio * visualSettings.resolutionScale, 2);
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, true);
        if (canvas) {
          if (usingViewport) {
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            canvas.style.maxWidth = `${width}px`;
            canvas.style.maxHeight = `${height}px`;
          } else {
            canvas.style.width = "";
            canvas.style.height = "";
            canvas.style.maxWidth = "";
            canvas.style.maxHeight = "";
          }
          canvas.style.display = "block";
        }
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      } catch {}
      try {
        positionPhotoButtons();
      } catch {}
    });
  });
}

function enterPhotoMode() {
  if (previewMode) return;
  isPhotoMode = true;
  document.body.classList.add("photo-mode");
  if (photoToggleButton) {
    photoToggleButton.setAttribute("aria-pressed", "true");
    photoToggleButton.textContent = "🌍";
    photoToggleButton.title = "Exit photo mode";
  }
  if (photoShutterButton) photoShutterButton.hidden = false;
  relayoutForMode();
}

function exitPhotoMode() {
  isPhotoMode = false;
  document.body.classList.remove("photo-mode");
  if (photoToggleButton) {
    photoToggleButton.setAttribute("aria-pressed", "false");
    photoToggleButton.textContent = "📷";
    photoToggleButton.title = "Photo mode";
  }
  if (photoShutterButton) photoShutterButton.hidden = true;
  
  // Ensure URL is updated before reloading
  if (shareDirty) {
    updateShareCode();
    shareDirty = false;
  }
  
  setTimeout(() => {
    try { window.location.reload(); } catch {}
  }, 0);
}

function dataURLtoBlob(dataurl) {
  const parts = dataurl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

function takeScreenshot() {
  try {
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL("image/png");
    const blob = dataURLtoBlob(dataURL);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `planet-studio-${timestamp}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    console.warn("Screenshot failed", err);
  }
}

photoToggleButton?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (isPhotoMode) {
    exitPhotoMode();
  } else {
    enterPhotoMode();
  }
});

photoShutterButton?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  takeScreenshot();
});

function positionPhotoButtons() {
  if (!renderer || !renderer.domElement) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const isMobile = isMobileLayout();

  if (photoToggleButton) {
    if (isMobile) {
      photoToggleButton.style.position = "";
      photoToggleButton.style.top = "";
      photoToggleButton.style.left = "";
      photoToggleButton.style.right = "";
      photoToggleButton.style.bottom = "";
      photoToggleButton.style.transform = "";
    } else {
      const w = photoToggleButton.offsetWidth || 48;
      const h = photoToggleButton.offsetHeight || 48;
      const top = Math.round(rect.bottom - 16 - h);
      const left = Math.round(rect.right - 16 - w);
      photoToggleButton.style.position = "fixed";
      photoToggleButton.style.top = `${top}px`;
      photoToggleButton.style.left = `${left}px`;
      photoToggleButton.style.right = "";
      photoToggleButton.style.bottom = "";
      photoToggleButton.style.transform = "none";
      photoToggleButton.style.zIndex = "100";
    }
  }
  
  if (photoShutterButton) {
    if (isMobile) {
      photoShutterButton.style.position = "";
      photoShutterButton.style.top = "";
      photoShutterButton.style.left = "";
      photoShutterButton.style.right = "";
      photoShutterButton.style.bottom = "";
      photoShutterButton.style.transform = "";
    } else {
      const h = photoShutterButton.offsetHeight || 60;
      const top = Math.round(rect.bottom - 16 - h);
      const left = Math.round(rect.left + rect.width / 2);
      photoShutterButton.style.position = "fixed";
      photoShutterButton.style.top = `${top}px`;
      photoShutterButton.style.left = `${left}px`;
      photoShutterButton.style.right = "";
      photoShutterButton.style.bottom = "";
      photoShutterButton.style.transform = "translateX(-50%)";
      photoShutterButton.style.zIndex = "100";
    }
  }
}

window.addEventListener("resize", positionPhotoButtons);
requestAnimationFrame(() => positionPhotoButtons());

const ambientLight = new THREE.AmbientLight(0x6f87b6, 0.35);
scene.add(ambientLight);

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

let starField = null;

//#region UI bindings
const seedDisplay = document.getElementById("seed-display");
const gravityDisplay = document.getElementById("gravity-display");
const timeDisplay = document.getElementById("time-display");
const stabilityDisplay = document.getElementById("orbit-stability");
const shareDisplay = document.getElementById("share-display");

const randomizeSeedButton = document.getElementById("randomize-seed");
const resetAllButton = document.getElementById("reset-all");
const exportButton = document.getElementById("export-fbx");
const copyShareButton = document.getElementById("copy-share");
const copyShareInlineButton = document.getElementById("copy-share-inline");
const surpriseMeButton = document.getElementById("surprise-me");
const surpriseMeMobileButton = document.getElementById("surprise-me-mobile");
const desktopMenuToggle = document.getElementById("desktop-menu-toggle");
const desktopMenu = document.getElementById("desktop-menu");
const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
const mobileMenu = document.getElementById("mobile-menu");
const mobileRandomize = document.getElementById("mobile-randomize");
const mobileSurprise = document.getElementById("mobile-surprise");
const mobileCopy = document.getElementById("mobile-copy");
const mobileReset = document.getElementById("mobile-reset");
const mobileVisualSettings = document.getElementById("mobile-visual-settings");
const desktopCopy = document.getElementById("desktop-copy");
const desktopHelp = document.getElementById("desktop-help");
const desktopVisualSettings = document.getElementById("desktop-visual-settings");
const desktopHome = document.getElementById("desktop-home");

const mobileFocusToggle = document.getElementById("mobile-focus-toggle");
const mobileFocusMenu = document.getElementById("mobile-focus-menu");
const focusMoonsContainer = document.getElementById("focus-moons-container");
//#endregion

//#region Visual Settings
const visualSettings = {
  frameRate: "unlimited",
  resolutionScale: 1.0,
  lightingScale: 1.0,
  particleMax: 1000,
  noiseResolution: 1.0,
  gasResolution: 1.0,
  starMax: 4000,
  ringDetail: 1.0
};

const VISUAL_SETTING_PRESETS = {
  ultra: { frameRate: "unlimited", resolutionScale: 2.0, lightingScale: 1.2, particleMax: 2000, noiseResolution: 2.0, gasResolution: 2.0, starMax: 4000, ringDetail: 1.25 },
  high: { frameRate: "unlimited", resolutionScale: 1.5, lightingScale: 1.1, particleMax: 1600, noiseResolution: 1.5, gasResolution: 1.5, starMax: 3600, ringDetail: 1.0 },
  default: { frameRate: "unlimited", resolutionScale: 1.0, lightingScale: 1.0, particleMax: 1000, noiseResolution: 1.0, gasResolution: 1.0, starMax: 4000, ringDetail: 1.0 },
  low: { frameRate: "30", resolutionScale: 0.75, lightingScale: 0.85, particleMax: 800, noiseResolution: 0.75, gasResolution: 0.75, starMax: 2000, ringDetail: 0.75 },
  potato: { frameRate: "24", resolutionScale: 0.5, lightingScale: 0.7, particleMax: 400, noiseResolution: 0.5, gasResolution: 0.5, starMax: 800, ringDetail: 0.5 }
};

let frameCapTargetMs = 0;
let frameCapLastTime = 0;
const TARGET_FRAME_TIMES = { "60": 1000 / 60, "30": 1000 / 30, "24": 1000 / 24, "15": 1000 / 15 };
//#endregion

//#region Parameters and presets
const params = {
  preset: "Earth-like",
  planetType: "rocky",
  gasGiantStrataCount: 3,
  gasGiantStrataColor1: "#d2c8b8",
  gasGiantStrataColor2: "#a08c78",
  gasGiantStrataColor3: "#8c7c6c",
  gasGiantStrataColor4: "#786c5c",
  gasGiantStrataColor5: "#645c4b",
  gasGiantStrataColor6: "#504b3a",
  gasGiantStrataSize1: 0.2,
  gasGiantStrataSize2: 0.2,
  gasGiantStrataSize3: 0.2,
  gasGiantStrataSize4: 0.2,
  gasGiantStrataSize5: 0.1,
  gasGiantStrataSize6: 0.1,
  gasGiantNoiseScale: 2.0,
  gasGiantNoiseStrength: 0.1,
  gasGiantStrataWarp: 0.03,
  gasGiantStrataWarpScale: 4.0,
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
  colorFoam: "#ffffff",
  foamEnabled: false,
  colorLow: "#305a33",
  colorMid: "#b49e74",
  colorHigh: "#f2f6f5",
  colorCore: "#8b4513",
  coreEnabled: true,
  coreSize: 0.4,
  coreVisible: true,
  icePolesEnabled: true,
  icePolesCoverage: 0.15,
  icePolesColor: "#e8f4f8",
  icePolesNoiseScale: 2.5,
  icePolesNoiseStrength: 0.3,
  atmosphereColor: "#7baeff",
  atmosphereOpacity: 0.22,
  atmosphereIntensity: 1.0,
  atmosphereFresnelPower: 2.0,
  atmosphereRimPower: 3.0,
  cloudsOpacity: 0.4,
  cloudHeight: 0.03,
  cloudDensity: 0.55,
  cloudNoiseScale: 3.2,
  cloudDriftSpeed: 0.02,
  axisTilt: 23,
  rotationSpeed: 0.12,
  simulationSpeed: 0.12,
  gravity: 9.81,
  sunPreset: "Sol",
  sunVariant: "Star",
  sunColor: "#ffd27f",
  sunIntensity: 1.6,
  sunDistance: 48,
  sunSize: 1,
  sunHaloSize: 6.5,
  sunGlowStrength: 1.4,
  sunPulseSpeed: 0.5,
  sunNoiseScale: 1.6,
  sunParticleCount: 240,
  sunParticleSpeed: 0.65,
  sunParticleSize: 0.15,
  sunParticleColor: "#ffbf7a",
  sunParticleLifetime: 4.2,
  blackHoleCoreSize: 0.75,
  blackHoleDiskRadius: 2.6,
  blackHoleDiskThickness: 0.32,
  blackHoleDiskIntensity: 1.8,
  blackHoleDiskTilt: 0,
  blackHoleDiskYaw: 0,
  blackHoleDiskTwist: 0,
  blackHoleSpinSpeed: 0.12,
  blackHoleHaloSpinSpeed: 0,
  blackHoleDiskEnabled: true,
  blackHoleHaloEnabled: true,
  blackHoleDiskStyle: "Noise",
  blackHoleHaloStyle: "Noise",
  blackHoleDiskNoiseScale: 1.3,
  blackHoleDiskNoiseStrength: 0.35,
  blackHoleHaloRadius: 3.2,
  blackHoleHaloAngle: 68,
  blackHoleHaloThickness: 0.45,
  blackHoleHaloIntensity: 0.85,
  blackHoleHaloNoiseScale: 1.15,
  blackHoleHaloNoiseStrength: 0.4,
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
  impactDeformation: true,
  impactStrengthMul: 2.5,
  impactSpeedMul: 1.2,
  impactMassMul: 2.0,
  impactElongationMul: 1.6,
  explosionEnabled: true,
  explosionColor: "#ffaa66",
  explosionStrength: 1,
  explosionParticleBase: 90,
  explosionSize: 0.8,
  explosionGravity: 0,
  explosionDamping: 0.9,
  explosionLifetime: 1.6,
  explosionColorVariation: 0.5,
  explosionSpeedVariation: 1.0,
  explosionSizeVariation: 1.0,
  ringEnabled: false,
  ringAngle: 0,
  ringSpinSpeed: 0.05,
  ringAllowRandom: true,
  ringCount: 0,
  rings: [],
  aurora: {
    enabled: false,
    colors: ["#38ff7a", "#3fb4ff"],
    latitudeCenterDeg: 65,
    latitudeWidthDeg: 12,
    height: 0.06,
    intensity: 1.0,
    noiseScale: 2.0,
    banding: 0.8,
    nightBoost: 1.5
  }
};

const presets = {
  "Earth-like": { planetType: "rocky", seed: "BLUEHOME", radius: 1.32, subdivisions: 6, noiseLayers: 5, noiseFrequency: 2.8, noiseAmplitude: 0.52, persistence: 0.48, lacunarity: 2.25, oceanLevel: 0.46, colorOcean: "#1b3c6d", colorShallow: "#2f7fb6", colorLow: "#305a33", colorMid: "#b49e74", colorHigh: "#f2f6f5", atmosphereColor: "#7baeff", atmosphereOpacity: 0.23, atmosphereIntensity: 1.0, atmosphereFresnelPower: 2.0, atmosphereRimPower: 3.0, cloudsOpacity: 0.42, axisTilt: 23, rotationSpeed: 0.12, simulationSpeed: 0.12, gravity: 9.81, sunColor: "#ffd27f", sunIntensity: 1.6, sunDistance: 48, sunSize: 1, sunHaloSize: 6.5, sunGlowStrength: 1.4, sunPulseSpeed: 0.45, moonMassScale: 1, starCount: 2200, starBrightness: 0.92, starTwinkleSpeed: 0.6, moons: [{ size: 0.27, distance: 4.2, orbitSpeed: 0.38, inclination: 6, color: "#cfd0d4", phase: 1.1, eccentricity: 0.055 }], impactDeformation: true, impactStrengthMul: 2.5, impactSpeedMul: 1.2, impactMassMul: 2.0, icePolesEnabled: true, icePolesCoverage: 0.12, icePolesColor: "#e8f4f8", icePolesNoiseScale: 2.5, icePolesNoiseStrength: 0.3, "aurora": { "enabled": true, "colors": ["#38ff7a", "#3fb4ff"], "latitudeCenterDeg": 65, "latitudeWidthDeg": 12, "height": 0.06, "intensity": 1.0, "noiseScale": 2.0, "banding": 0.8, "nightBoost": 1.5 } },
  "Mars": { planetType: "rocky", seed: "MARS", radius: 0.71, subdivisions: 6, noiseLayers: 5, noiseFrequency: 3.1, noiseAmplitude: 0.34, persistence: 0.46, lacunarity: 2.2, oceanLevel: 0.0, colorOcean: "#211b1b", colorShallow: "#3b2a22", colorLow: "#7a3e27", colorMid: "#b25a32", colorHigh: "#e4c7a1", colorCore: "#8b4513", coreEnabled: true, coreSize: 0.4, coreVisible: true, atmosphereColor: "#ffb382", atmosphereOpacity: 0.0, atmosphereIntensity: 0.8, atmosphereFresnelPower: 1.5, atmosphereRimPower: 2.5, cloudsOpacity: 0.0, axisTilt: 25, rotationSpeed: 0.24, simulationSpeed: 0.12, gravity: 3.71, sunColor: "#ffd27f", sunIntensity: 1.8, sunDistance: 60, sunSize: 1, sunHaloSize: 6.5, sunGlowStrength: 1.2, sunPulseSpeed: 0.5, moonMassScale: 0.6, starCount: 2400, starBrightness: 0.9, starTwinkleSpeed: 0.6, moons: [{ size: 0.08, distance: 2.6, orbitSpeed: 0.8, inclination: 1, color: "#9e7a5c", phase: 0.3, eccentricity: 0.015 }, { size: 0.06, distance: 3.8, orbitSpeed: 0.66, inclination: 1.8, color: "#7a5d48", phase: 2.1, eccentricity: 0.025 }], icePolesEnabled: true, icePolesCoverage: 0.18, icePolesColor: "#f0f8ff", icePolesNoiseScale: 3.0, icePolesNoiseStrength: 0.4 },
  "Jupiter": { planetType: "gas_giant", seed: "JUPITER", radius: 3.5, axisTilt: 3, rotationSpeed: 0.48, simulationSpeed: 0.32, gravity: 24.79, gasGiantStrataCount: 5, gasGiantStrataColor1: "#c7b59a", gasGiantStrataColor2: "#efe7dd", gasGiantStrataColor3: "#b3a58b", gasGiantStrataColor4: "#d6c8a7", gasGiantStrataColor5: "#c0b8a8", gasGiantStrataSize1: 0.3, gasGiantStrataSize2: 0.2, gasGiantStrataSize3: 0.2, gasGiantStrataSize4: 0.2, gasGiantStrataSize5: 0.1, gasGiantNoiseScale: 3.0, gasGiantNoiseStrength: 0.15, atmosphereColor: "#d9c7a0", atmosphereOpacity: 0.38, cloudsOpacity: 0.7, sunColor: "#ffd27f", sunIntensity: 2.8, sunDistance: 120, sunSize: 1.6, sunHaloSize: 10.5, sunGlowStrength: 2.2, sunPulseSpeed: 0.25, moonMassScale: 2.2, starCount: 3400, starBrightness: 1.1, starTwinkleSpeed: 0.45, moons: [{ size: 0.35, distance: 5.8, orbitSpeed: 0.52, inclination: 2, color: "#d9d0c0", phase: 0.1, eccentricity: 0.01 }, { size: 0.32, distance: 7.3, orbitSpeed: 0.44, inclination: 0, color: "#b3a58b", phase: 0.7, eccentricity: 0.002 }, { size: 0.3, distance: 9.7, orbitSpeed: 0.36, inclination: 0.1, color: "#d6c8a7", phase: 1.3, eccentricity: 0.004 }, { size: 0.28, distance: 15.7, orbitSpeed: 0.23, inclination: 0.5, color: "#c0b8a8", phase: 2.0, eccentricity: 0.01 }] },
  "Saturn": { planetType: "gas_giant", seed: "SATURN", radius: 3.2, axisTilt: 27, rotationSpeed: 0.42, simulationSpeed: 0.32, gravity: 10.44, gasGiantStrataCount: 5, gasGiantStrataColor1: "#bda77e", gasGiantStrataColor2: "#dccfb0", gasGiantStrataColor3: "#f3ecde", gasGiantStrataColor4: "#cdbb9a", gasGiantStrataColor5: "#bfb39a", gasGiantStrataSize1: 0.4, gasGiantStrataSize2: 0.3, gasGiantStrataSize3: 0.1, gasGiantStrataSize4: 0.1, gasGiantStrataSize5: 0.1, gasGiantNoiseScale: 3.5, gasGiantNoiseStrength: 0.12, atmosphereColor: "#e6d8b5", atmosphereOpacity: 0.33, cloudsOpacity: 0.6, sunColor: "#ffd27f", sunIntensity: 2.6, sunDistance: 140, sunSize: 1.6, sunHaloSize: 12.5, sunGlowStrength: 2.0, sunPulseSpeed: 0.25, moonMassScale: 2.2, starCount: 3300, starBrightness: 1.05, starTwinkleSpeed: 0.45, ringEnabled: true, ringAngle: 0, ringSpinSpeed: 0.03, ringCount: 4, rings: [{ style: "Texture", color: "#bfb39a", start: 1.28, end: 1.35, opacity: 0.5, noiseScale: 2.4, noiseStrength: 0.15, spinSpeed: 0.03, brightness: 0.9 }, { style: "Texture", color: "#e3dccb", start: 1.38, end: 1.80, opacity: 0.95, noiseScale: 2.8, noiseStrength: 0.25, spinSpeed: 0.03, brightness: 1.2 }, { style: "Texture", color: "#d7ccb4", start: 1.88, end: 2.30, opacity: 0.9, noiseScale: 2.6, noiseStrength: 0.22, spinSpeed: 0.03, brightness: 1.1 }, { style: "Texture", color: "#f3eee2", start: 2.35, end: 2.42, opacity: 0.6, noiseScale: 2.0, noiseStrength: 0.10, spinSpeed: 0.035, brightness: 1.1 }], moons: [{ size: 0.3, distance: 10.0, orbitSpeed: 0.3, inclination: 2, color: "#d9d6cf", phase: 0.1, eccentricity: 0.01 }, { size: 0.22, distance: 6.8, orbitSpeed: 0.42, inclination: 1, color: "#cdbb9a", phase: 0.8, eccentricity: 0.02 }] },
  "Uranus": { planetType: "gas_giant", seed: "URANUS", radius: 2.7, axisTilt: 98, rotationSpeed: -0.25, simulationSpeed: 0.22, gravity: 8.69, gasGiantStrataCount: 3, gasGiantStrataColor1: "#54c4d7", gasGiantStrataColor2: "#86dceb", gasGiantStrataColor3: "#d6f4fb", gasGiantStrataSize1: 0.5, gasGiantStrataSize2: 0.3, gasGiantStrataSize3: 0.2, gasGiantNoiseScale: 2.0, gasGiantNoiseStrength: 0.05, atmosphereColor: "#9adbe7", atmosphereOpacity: 0.33, cloudsOpacity: 0.6, sunColor: "#ffd27f", sunIntensity: 2.4, sunDistance: 150, sunSize: 1.4, sunHaloSize: 12.0, sunGlowStrength: 1.9, sunPulseSpeed: 0.3, moonMassScale: 1.6, starCount: 3200, starBrightness: 1.0, starTwinkleSpeed: 0.5, ringEnabled: true, ringAngle: 0, ringSpinSpeed: 0.02, ringCount: 2, rings: [{ style: "Noise", color: "#d5eaf6", start: 1.45, end: 1.48, opacity: 0.35, noiseScale: 1.6, noiseStrength: 0.2, spinSpeed: 0.02, brightness: 0.8 }, { style: "Noise", color: "#d5eaf6", start: 1.58, end: 1.61, opacity: 0.35, noiseScale: 1.6, noiseStrength: 0.2, spinSpeed: 0.02, brightness: 0.8 }], moons: [{ size: 0.18, distance: 6.5, orbitSpeed: 0.4, inclination: 1, color: "#d5eaf6", phase: 0.2, eccentricity: 0.03 }] },
  "Neptune": { planetType: "gas_giant", seed: "NEPTUNE", radius: 2.6, axisTilt: 28, rotationSpeed: 0.26, simulationSpeed: 0.22, gravity: 11.15, gasGiantStrataCount: 4, gasGiantStrataColor1: "#2e60bf", gasGiantStrataColor2: "#5b8ee6", gasGiantStrataColor3: "#b7d0ff", gasGiantStrataColor4: "#7fb0ff", gasGiantStrataSize1: 0.4, gasGiantStrataSize2: 0.3, gasGiantStrataSize3: 0.2, gasGiantStrataSize4: 0.1, gasGiantNoiseScale: 2.5, gasGiantNoiseStrength: 0.1, atmosphereColor: "#7fb0ff", atmosphereOpacity: 0.33, cloudsOpacity: 0.6, sunColor: "#ffd27f", sunIntensity: 2.4, sunDistance: 160, sunSize: 1.4, sunHaloSize: 12.5, sunGlowStrength: 1.9, sunPulseSpeed: 0.3, moonMassScale: 1.7, starCount: 3200, starBrightness: 1.0, starTwinkleSpeed: 0.5, ringEnabled: true, ringAngle: 0, ringSpinSpeed: 0.02, ringCount: 1, rings: [{ style: "Noise", color: "#d1e2ff", start: 1.50, end: 1.53, opacity: 0.25, noiseScale: 1.6, noiseStrength: 0.2, spinSpeed: 0.02, brightness: 0.8 }], moons: [{ size: 0.24, distance: 8.6, orbitSpeed: 0.34, inclination: 0.1, color: "#d1e2ff", phase: 0.8, eccentricity: 0.01 }] },
  "Mercury": { planetType: "rocky", seed: "MERCURY", radius: 0.38, subdivisions: 6, noiseLayers: 5, noiseFrequency: 3.4, noiseAmplitude: 0.42, persistence: 0.5, lacunarity: 2.2, oceanLevel: 0.0, colorOcean: "#2a2623", colorShallow: "#3b322c", colorLow: "#5c4a3e", colorMid: "#8a705d", colorHigh: "#d1c0af", colorCore: "#8b4513", coreEnabled: true, coreSize: 0.4, coreVisible: true, atmosphereColor: "#b9b2a8", atmosphereOpacity: 0.0, cloudsOpacity: 0.0, axisTilt: 0.03, rotationSpeed: 0.02, simulationSpeed: 0.12, gravity: 3.7, sunColor: "#ffd27f", sunIntensity: 2.0, sunDistance: 20, sunSize: 1, sunHaloSize: 6.5, sunGlowStrength: 1.4, sunPulseSpeed: 0.5, moonMassScale: 0.2, starCount: 2200, starBrightness: 0.9, starTwinkleSpeed: 0.6, moons: [] },
  "Venus": { planetType: "rocky", seed: "VENUS", radius: 0.95, subdivisions: 6, noiseLayers: 5, noiseFrequency: 3.0, noiseAmplitude: 0.45, persistence: 0.48, lacunarity: 2.25, oceanLevel: 0.35, colorOcean: "#2d2018", colorShallow: "#4a362a", colorLow: "#6f513f", colorMid: "#b38a6c", colorHigh: "#f0e6d9", colorCore: "#8b4513", coreEnabled: true, coreSize: 0.4, coreVisible: true, atmosphereColor: "#e3c6a2", atmosphereOpacity: 0.47, cloudsOpacity: 0.85, axisTilt: 177, rotationSpeed: -0.01, simulationSpeed: 0.12, gravity: 8.87, sunColor: "#ffd27f", sunIntensity: 2.2, sunDistance: 30, sunSize: 1, sunHaloSize: 6.5, sunGlowStrength: 1.5, sunPulseSpeed: 0.5, moonMassScale: 0.4, starCount: 2500, starBrightness: 0.95, starTwinkleSpeed: 0.6, moons: [] },
  "Desert World": { planetType: "rocky", seed: "DUNERIDR", radius: 1.08, subdivisions: 5, noiseLayers: 4, noiseFrequency: 3.6, noiseAmplitude: 0.35, persistence: 0.42, lacunarity: 2.5, oceanLevel: 0.15, colorOcean: "#422412", colorShallow: "#6d3a1a", colorLow: "#a56d32", colorMid: "#d8b06b", colorHigh: "#f6e5c8", colorCore: "#8b4513", coreEnabled: true, coreSize: 0.4, coreVisible: true, atmosphereColor: "#f4aa5a", atmosphereOpacity: 0.05, cloudsOpacity: 0.1, axisTilt: 12, rotationSpeed: 0.2, simulationSpeed: 0.18, gravity: 6.4, sunColor: "#ffbf66", sunIntensity: 1.9, sunDistance: 35, sunSize: 0.9, sunHaloSize: 5.2, sunGlowStrength: 1.2, sunPulseSpeed: 0.75, moonMassScale: 0.8, starCount: 1800, starBrightness: 0.7, starTwinkleSpeed: 0.8, moons: [{ size: 0.18, distance: 3.2, orbitSpeed: 0.54, inclination: -4, color: "#c7a27d", phase: 2.8, eccentricity: 0.16 }, { size: 0.1, distance: 5.7, orbitSpeed: 0.32, inclination: 11, color: "#7f6448", phase: 0.9, eccentricity: 0.08 }] },
  "Ice Giant": { planetType: "gas_giant", seed: "GLACIER", radius: 2.8, axisTilt: 28, rotationSpeed: 0.28, simulationSpeed: 0.2, gravity: 17.2, gasGiantStrataCount: 4, gasGiantStrataColor1: "#2e5e9c", gasGiantStrataColor2: "#88b5ff", gasGiantStrataColor3: "#f6fbff", gasGiantStrataColor4: "#9ed7ff", gasGiantStrataSize1: 0.5, gasGiantStrataSize2: 0.3, gasGiantStrataSize3: 0.1, gasGiantStrataSize4: 0.1, gasGiantNoiseScale: 2.2, gasGiantNoiseStrength: 0.08, atmosphereColor: "#9ed7ff", atmosphereOpacity: 0.33, cloudsOpacity: 0.6, sunColor: "#b9dcff", sunIntensity: 2.6, sunDistance: 120, sunSize: 1.4, sunHaloSize: 9.2, sunGlowStrength: 1.8, sunPulseSpeed: 0.35, moonMassScale: 1.8, starCount: 3000, starBrightness: 1.05, starTwinkleSpeed: 0.5, moons: [{ size: 0.24, distance: 5.4, orbitSpeed: 0.3, inclination: 8, color: "#d8e8ff", phase: 0.6, eccentricity: 0.12 }, { size: 0.32, distance: 8.2, orbitSpeed: 0.24, inclination: -14, color: "#9eb6ff", phase: 3.1, eccentricity: 0.2 }, { size: 0.18, distance: 12.5, orbitSpeed: 0.18, inclination: 21, color: "#f0f8ff", phase: 4.4, eccentricity: 0.32 }] },
  "Volcanic": { planetType: "rocky", seed: "FIRECORE", radius: 0.92, subdivisions: 6, noiseLayers: 6, noiseFrequency: 4.6, noiseAmplitude: 0.66, persistence: 0.55, lacunarity: 2.6, oceanLevel: 0.25, colorOcean: "#240909", colorShallow: "#5d1911", colorLow: "#8a3217", colorMid: "#d55c27", colorHigh: "#ffd79c", colorCore: "#8b4513", coreEnabled: true, coreSize: 0.4, coreVisible: true, atmosphereColor: "#ff7a3a", atmosphereOpacity: 0.1, cloudsOpacity: 0.18, axisTilt: 8, rotationSpeed: 0.35, simulationSpeed: 0.3, gravity: 11.1, sunColor: "#ff9440", sunIntensity: 2.1, sunDistance: 40, sunSize: 1.1, sunHaloSize: 4.6, sunGlowStrength: 1.65, sunPulseSpeed: 1.1, moonMassScale: 1.2, starCount: 2000, starBrightness: 0.88, starTwinkleSpeed: 0.9, moons: [{ size: 0.13, distance: 2.7, orbitSpeed: 0.66, inclination: 17, color: "#f9b14d", phase: 1.8, eccentricity: 0.22 }] },
  "Gas Giant": { planetType: "gas_giant", seed: "AEROX", radius: 3.6, axisTilt: 12, rotationSpeed: 0.45, simulationSpeed: 0.4, gravity: 24.8, gasGiantStrataCount: 6, gasGiantStrataColor1: "#dcdff7", gasGiantStrataColor2: "#8f9ec8", gasGiantStrataColor3: "#34527f", gasGiantStrataColor4: "#253a66", gasGiantStrataColor5: "#14203b", gasGiantStrataColor6: "#c1d6ff", gasGiantStrataSize1: 0.2, gasGiantStrataSize2: 0.2, gasGiantStrataSize3: 0.2, gasGiantStrataSize4: 0.2, gasGiantStrataSize5: 0.1, gasGiantStrataSize6: 0.1, gasGiantNoiseScale: 4.0, gasGiantNoiseStrength: 0.2, atmosphereColor: "#c1d6ff", atmosphereOpacity: 0.38, cloudsOpacity: 0.7, sunColor: "#ffe8b2", sunIntensity: 2.8, sunDistance: 90, sunSize: 1.8, sunHaloSize: 11.5, sunGlowStrength: 2.2, sunPulseSpeed: 0.25, moonMassScale: 2.6, starCount: 3400, starBrightness: 1.1, starTwinkleSpeed: 0.45, moons: [{ size: 0.32, distance: 5.6, orbitSpeed: 0.5, inclination: 3, color: "#d1d1dd", phase: 0.4, eccentricity: 0.1 }, { size: 0.26, distance: 7.9, orbitSpeed: 0.35, inclination: 12, color: "#f3deb3", phase: 1.2, eccentricity: 0.18 }, { size: 0.18, distance: 11.5, orbitSpeed: 0.28, inclination: -9, color: "#c0d6ff", phase: 2.6, eccentricity: 0.3 }, { size: 0.12, distance: 16.5, orbitSpeed: 0.22, inclination: 25, color: "#e6f2ff", phase: 3.4, eccentricity: 0.4 }] }
};

const starPresets = {
  Sol: { sunColor: "#ffd27f", sunIntensity: 1.6, sunDistance: 48, sunSize: 1.1, sunHaloSize: 5.4, sunGlowStrength: 1.3, sunPulseSpeed: 0.6, sunNoiseScale: 1.45, sunParticleCount: 240, sunParticleSpeed: 0.65, sunParticleSize: 0.14, sunParticleColor: "#ffbf7a", sunParticleLifetime: 4.2 },
  "Red Dwarf": { sunColor: "#ff7750", sunIntensity: 0.9, sunDistance: 36, sunSize: 0.8, sunHaloSize: 4.1, sunGlowStrength: 1.1, sunPulseSpeed: 0.85, sunNoiseScale: 1.9, sunParticleCount: 180, sunParticleSpeed: 0.42, sunParticleSize: 0.12, sunParticleColor: "#ff6242", sunParticleLifetime: 5.0 },
  "Blue Giant": { sunColor: "#9fc4ff", sunIntensity: 2.5, sunDistance: 110, sunSize: 1.6, sunHaloSize: 8.2, sunGlowStrength: 2.0, sunPulseSpeed: 0.4, sunNoiseScale: 1.2, sunParticleCount: 320, sunParticleSpeed: 0.9, sunParticleSize: 0.18, sunParticleColor: "#8abaff", sunParticleLifetime: 3.2 },
  "White Dwarf": { sunColor: "#f2f7ff", sunIntensity: 1.9, sunDistance: 38, sunSize: 0.9, sunHaloSize: 3.6, sunGlowStrength: 0.9, sunPulseSpeed: 1.2, sunNoiseScale: 2.3, sunParticleCount: 140, sunParticleSpeed: 0.5, sunParticleSize: 0.1, sunParticleColor: "#eff6ff", sunParticleLifetime: 2.6 },
  "Neutron Star": { sunColor: "#9ecaff", sunIntensity: 3.2, sunDistance: 65, sunSize: 0.6, sunHaloSize: 5.2, sunGlowStrength: 2.6, sunPulseSpeed: 1.8, sunNoiseScale: 3.0, sunParticleCount: 260, sunParticleSpeed: 1.4, sunParticleSize: 0.09, sunParticleColor: "#96caff", sunParticleLifetime: 1.8 }
};

const shareKeys = [ "seed", "planetType", "gasGiantStrataCount", "gasGiantStrataColor1", "gasGiantStrataColor2", "gasGiantStrataColor3", "gasGiantStrataColor4", "gasGiantStrataColor5", "gasGiantStrataColor6", "gasGiantStrataSize1", "gasGiantStrataSize2", "gasGiantStrataSize3", "gasGiantStrataSize4", "gasGiantStrataSize5", "gasGiantStrataSize6", "gasGiantNoiseScale", "gasGiantNoiseStrength", "gasGiantStrataWarp", "gasGiantStrataWarpScale", "radius", "subdivisions", "noiseLayers", "noiseFrequency", "noiseAmplitude", "persistence", "lacunarity", "oceanLevel", "colorOcean", "colorShallow", "colorFoam", "foamEnabled", "colorLow", "colorMid", "colorHigh", "colorCore", "coreEnabled", "coreSize", "coreVisible", "atmosphereColor", "atmosphereOpacity", "cloudsOpacity", "cloudHeight", "cloudDensity", "cloudNoiseScale", "cloudDriftSpeed", "axisTilt", "rotationSpeed", "simulationSpeed", "gravity", "sunColor", "sunIntensity", "sunDistance", "sunSize", "sunHaloSize", "sunGlowStrength", "sunPulseSpeed", "sunVariant", "sunPreset", "sunNoiseScale", "sunParticleCount", "sunParticleSpeed", "sunParticleSize", "sunParticleColor", "sunParticleLifetime", "blackHoleCoreSize", "blackHoleDiskRadius", "blackHoleDiskThickness", "blackHoleDiskIntensity", "blackHoleDiskTilt", "blackHoleDiskYaw", "blackHoleDiskTwist", "blackHoleSpinSpeed", "blackHoleHaloSpinSpeed", "blackHoleDiskStyle", "blackHoleHaloStyle", "blackHoleDiskNoiseScale", "blackHoleDiskNoiseStrength", "blackHoleHaloRadius", "blackHoleHaloAngle", "blackHoleHaloThickness", "blackHoleHaloIntensity", "blackHoleHaloNoiseScale", "blackHoleHaloNoiseStrength", "moonCount", "moonMassScale", "starCount", "starBrightness", "starTwinkleSpeed", "physicsEnabled", "physicsTwoWay", "physicsDamping", "physicsSubsteps", "showOrbitLines", "impactDeformation", "impactStrengthMul", "impactSpeedMul", "impactMassMul", "impactElongationMul", "explosionEnabled", "explosionColor", "explosionStrength", "explosionParticleBase", "explosionSize", "explosionGravity", "explosionDamping", "explosionLifetime", "explosionColorVariation", "explosionSpeedVariation", "explosionSizeVariation", "ringEnabled", "ringAngle", "ringSpinSpeed", "ringAllowRandom", "ringCount", "aurora" ];
//#endregion

//#region State tracking
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
let isApplyingStarPreset = false;
let currentShareId = null;
let currentHashIsApiId = false;

const { registerFolder, unregisterFolder, applyControlSearch } = initControlSearch({
  controlsContainer,
  searchInput: controlSearchInput,
  clearButton: controlSearchClear,
  emptyState: controlSearchEmpty,
  searchBar: controlSearchBar,
  infoPanel
});

const gui = registerFolder(new GUI({ title: "Planet Controls", width: 320, container: controlsContainer || undefined }));

const guiControllers = {};

// Debug moon artifacts sync function
guiControllers.syncDebugMoonArtifacts = () => {
  const moonCount = params.moonCount || 0;
  
  // Ensure we have enough debug arrows
  while (debugMoonArrows.length < moonCount) {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x7dff7d);
    arrow.visible = false;
    scene.add(arrow);
    debugMoonArrows.push(arrow);
  }
  
  // Remove excess arrows
  while (debugMoonArrows.length > moonCount) {
    const arrow = debugMoonArrows.pop();
    if (arrow) {
      scene.remove(arrow);
      if (arrow.geometry) {
        arrow.geometry.dispose();
      }
      if (arrow.material) {
        arrow.material.dispose();
      }
    }
  }
  
  // Ensure we have enough speed display rows
  while (debugMoonSpeedRows.length < moonCount) {
    const row = document.createElement("div");
    row.className = "debug-moon-speed-row";
    row.textContent = `Moon ${debugMoonSpeedRows.length + 1}: 0.00 m/s`;
    debugMoonSpeedList?.appendChild(row);
    debugMoonSpeedRows.push(row);
  }
  
  // Remove excess speed display rows
  while (debugMoonSpeedRows.length > moonCount) {
    const row = debugMoonSpeedRows.pop();
    if (row && row.parentNode) {
      row.parentNode.removeChild(row);
    }
  }
};

// Stability display update function
guiControllers.updateStabilityDisplay = updateStabilityDisplay;

// Debug vectors update function
function updateDebugVectors() {
  // Update planet velocity arrow
  if (debugState.showPlanetVelocity && planetRoot) {
    debugPlanetArrow.visible = true;
    debugPlanetArrow.position.copy(planetRoot.position);
    
    // Calculate planet velocity (simplified - you might want to get actual velocity from physics)
    const planetVelocity = new THREE.Vector3(0, 0, 0); // Placeholder - would need actual velocity
    if (planetVelocity.length() > 0.001) {
      debugPlanetArrow.setDirection(planetVelocity.clone().normalize());
      debugPlanetArrow.setLength(Math.min(planetVelocity.length() * 0.1, 2));
    } else {
      debugPlanetArrow.visible = false;
    }
  } else {
    debugPlanetArrow.visible = false;
  }
  
  // Update moon velocity arrows
  if (debugState.showMoonVelocity && planet?.moonsGroup) {
    debugMoonArrows.forEach((arrow, index) => {
      if (index < planet.moonsGroup.children.length) {
        const moonPivot = planet.moonsGroup.children[index];
        arrow.visible = true;
        arrow.position.copy(moonPivot.position);
        
        // Calculate moon velocity (simplified - you might want to get actual velocity from physics)
        const moonVelocity = new THREE.Vector3(0, 0, 0); // Placeholder - would need actual velocity
        if (moonVelocity.length() > 0.001) {
          arrow.setDirection(moonVelocity.clone().normalize());
          arrow.setLength(Math.min(moonVelocity.length() * 0.1, 2));
          
          // Update speed display
          if (debugMoonSpeedRows[index]) {
            debugMoonSpeedRows[index].textContent = `Moon ${index + 1}: ${moonVelocity.length().toFixed(2)} m/s`;
          }
        } else {
          arrow.visible = false;
          if (debugMoonSpeedRows[index]) {
            debugMoonSpeedRows[index].textContent = `Moon ${index + 1}: 0.00 m/s`;
          }
        }
      } else {
        arrow.visible = false;
      }
    });
  } else {
    debugMoonArrows.forEach((arrow) => {
      arrow.visible = false;
    });
  }
}

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
  scheduleShareUpdate: () => { shareDirty = true; debounceShare(); },
  markMoonsDirty: () => { moonsDirty = true; },
  updateOrbitLinesVisibility: () => planet?.updateOrbitLinesVisibility(),
  initMoonPhysics: () => planet?.initMoonPhysics(),
  resetMoonPhysics: () => planet?.resetMoonPhysics(),
  getIsApplyingPreset: () => isApplyingPreset
});

// Add moon settings normalization function to guiControllers
guiControllers.normalizeMoonSettings = normalizeMoonSettings;

// Add moon controls rebuild function to guiControllers
guiControllers.rebuildMoonControls = rebuildMoonControls;

const { rebuildRingControls } = setupRingControls({
  gui,
  params,
  guiControllers,
  registerFolder,
  unregisterFolder,
  applyControlSearch,
  scheduleShareUpdate: () => { shareDirty = true; debounceShare(); },
  updateRings: () => planet?.updateRings(),
  getIsApplyingPreset: () => isApplyingPreset,
  getRingsFolder: () => guiControllers?.folders?.ringsFolder
});

setupPlanetControls({
    gui,
    params,
    presets,
    starPresets,
    guiControllers,
    registerFolder,
    scheduleShareUpdate: () => { shareDirty = true; debounceShare(); },
    markPlanetDirty: () => { planetDirty = true; },
    markMoonsDirty: () => { moonsDirty = true; },
    handleSeedChanged,
    updatePalette: () => planet?.updatePalette(),
    updateClouds: () => planet?.updateClouds(),
    updateTilt: () => planet?.updateTilt(),
    updateSun: () => sun?.updateSun(),
    updateRings: () => planet?.updateRings(),
    updateAurora: () => planet?.updateAurora(),
    updateStarfieldUniforms,
    regenerateStarfield,
    updateGravityDisplay,
    initMoonPhysics: () => planet?.initMoonPhysics(),
    resetMoonPhysics: () => planet?.resetMoonPhysics(),
    syncMoonSettings,
    rebuildMoonControls,
    updateOrbitLinesVisibility: () => planet?.updateOrbitLinesVisibility(),
    getIsApplyingPreset: () => isApplyingPreset,
    getIsApplyingStarPreset: () => isApplyingStarPreset,
    onPresetChange: (value) => applyPreset(value),
    onStarPresetChange: (value) => applyStarPreset(value)
});

rebuildRingControls();

if (debugPlanetSpeedDisplay) debugPlanetSpeedDisplay.textContent = "0.000";
if (debugFpsDisplay) debugFpsDisplay.textContent = "0";
const hudFps = document.getElementById("hud-fps");
if (hudFps && debugHudFpsToggle) {
    hudFps.hidden = !debugHudFpsToggle.checked;
    debugHudFpsToggle.addEventListener("change", () => { hudFps.hidden = !debugHudFpsToggle.checked; });
}

if (debugPlanetToggle) {
  debugPlanetToggle.checked = false;
  debugPlanetToggle.addEventListener("change", () => {
    debugState.showPlanetVelocity = !!debugPlanetToggle.checked;
    if (!debugState.showPlanetVelocity) debugPlanetArrow.visible = false;
    updateDebugVectors();
  });
}

if (debugMoonToggle) {
  debugMoonToggle.checked = false;
  debugMoonToggle.addEventListener("change", () => {
    debugState.showMoonVelocity = !!debugMoonToggle.checked;
    if (!debugState.showMoonVelocity) {
      debugMoonArrows.forEach((arrow) => { if (arrow) arrow.visible = false; });
    }
    updateDebugVectors();
  });
}

// LOD Debug event listeners
if (debugLODEnabled) {
  debugLODEnabled.addEventListener("change", () => {
    if (planet) {
      planet.setDebugLODEnabled(debugLODEnabled.checked);
    }
  });
}

if (debugChunkHighlight) {
  debugChunkHighlight.addEventListener("change", () => {
    if (planet) {
      planet.setDebugChunkHighlight(debugChunkHighlight.checked);
    }
  });
}

if (debugRaycast) {
  debugRaycast.addEventListener("change", () => {
    if (planet) {
      planet.setDebugRaycast(debugRaycast.checked);
    }
  });
}

if (debugLODMetrics) {
  debugLODMetrics.addEventListener("change", () => {
    if (planet) {
      planet.setDebugLODMetrics(debugLODMetrics.checked);
    }
  });
}

if (debugPanel) {
  guiControllers.syncDebugMoonArtifacts();
  updateDebugVectors();
}
//#endregion

randomizeSeedButton?.addEventListener("click", () => {
  const nextSeed = generateSeed();
  params.seed = nextSeed;
  guiControllers.seed?.setValue?.(nextSeed);
  handleSeedChanged();
});

resetAllButton?.addEventListener("click", () => {
  try {
    applyPreset("Earth-like", { skipShareUpdate: false, keepSeed: false });
    applyStarPreset("Sol", { skipShareUpdate: true });
  } catch (e) {
    console.warn("Reset All failed:", e);
  }
});

surpriseMeButton?.addEventListener("click", () => {
  try {
    surpriseMe();
    updateSeedDisplay();
    updateGravityDisplay();
    scheduleShareUpdate();
  } catch (e) {
    console.warn("Surprise Me failed:", e);
  }
});

// ... (rest of the UI event listeners remain the same)

//#region Preset Functions
function applyPreset(presetName, options = {}) {
  const { skipShareUpdate = false, keepSeed = false } = options;
  
  if (!presets[presetName]) {
    console.warn(`Preset "${presetName}" not found`);
    return;
  }
  
  isApplyingPreset = true;
  
  try {
    const preset = presets[presetName];
    
    // Apply all preset values to params (deep-merge aurora)
    Object.keys(preset).forEach(key => {
      if (key === 'aurora') {
        mergeAurora(preset[key]);
      } else if (key !== 'moons') { // Handle moons separately
        params[key] = preset[key];
      }
    });
    
    // Handle moons separately
    if (preset.moons) {
      moonSettings.length = 0; // Clear existing moons
      preset.moons.forEach(moonData => {
        moonSettings.push({ ...moonData });
      });
    }
    
    // Update GUI controllers
    Object.keys(guiControllers).forEach(key => {
      if (guiControllers[key] && typeof guiControllers[key].setValue === 'function' && params[key] !== undefined) {
        guiControllers[key].setValue(params[key]);
      }
    });
    
    // Update planet type visibility
    if (guiControllers.refreshPlanetTypeVisibility) {
      guiControllers.refreshPlanetTypeVisibility(params.planetType);
    }
    
    // Update all planet components
    planet.updatePalette();
    planet.updateClouds();
    planet.updateCore();
    sun.updateSun();
    planet.updateRings();
    planet.updateTilt();
    updateSeedDisplay();
    updateGravityDisplay();
    syncMoonSettings();
    
    // Update share if not skipping
    if (!skipShareUpdate) {
      scheduleShareUpdate();
    }
    
  } finally {
    isApplyingPreset = false;
  }
}

function applyStarPreset(presetName, options = {}) {
  const { skipShareUpdate = false } = options;
  
  if (!starPresets[presetName]) {
    console.warn(`Star preset "${presetName}" not found`);
    return;
  }
  
  isApplyingStarPreset = true;
  
  try {
    const preset = starPresets[presetName];
    
    // Apply all star preset values to params
    Object.keys(preset).forEach(key => {
      params[key] = preset[key];
    });
    
    // Update GUI controllers
    Object.keys(guiControllers).forEach(key => {
      if (guiControllers[key] && typeof guiControllers[key].setValue === 'function' && params[key] !== undefined) {
        guiControllers[key].setValue(params[key]);
      }
    });
    
    // Update sun
    sun.updateSun();
    
    // Update share if not skipping
    if (!skipShareUpdate) {
      scheduleShareUpdate();
    }
    
  } finally {
    isApplyingStarPreset = false;
  }
}

//#region Utility Functions
function generateSeed() {
  const words = [
    'ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA', 'ETA', 'THETA',
    'IOTA', 'KAPPA', 'LAMBDA', 'MU', 'NU', 'XI', 'OMICRON', 'PI',
    'RHO', 'SIGMA', 'TAU', 'UPSILON', 'PHI', 'CHI', 'PSI', 'OMEGA',
    'NOVA', 'STAR', 'MOON', 'SUN', 'EARTH', 'MARS', 'VENUS', 'JUPITER',
    'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'COMET', 'ASTEROID', 'GALAXY',
    'COSMOS', 'UNIVERSE', 'SPACE', 'VOID', 'NEBULA', 'QUASAR', 'PULSAR',
    'BLACKHOLE', 'WORMHOLE', 'DIMENSION', 'REALM', 'WORLD', 'PLANET',
    'CRYSTAL', 'GEM', 'STONE', 'ROCK', 'ICE', 'FIRE', 'WATER', 'WIND',
    'STORM', 'LIGHTNING', 'THUNDER', 'RAIN', 'SNOW', 'FOG', 'MIST',
    'FOREST', 'OCEAN', 'MOUNTAIN', 'VALLEY', 'DESERT', 'JUNGLE', 'TUNDRA',
    'SAVANNA', 'PRAIRIE', 'MEADOW', 'GARDEN', 'FLOWER', 'TREE', 'LEAF',
    'WIND', 'BREEZE', 'GALE', 'HURRICANE', 'TORNADO', 'CYCLONE', 'TYPHOON',
    'AURORA', 'DAWN', 'DUSK', 'TWILIGHT', 'SUNRISE', 'SUNSET', 'MIDNIGHT',
    'NOON', 'MORNING', 'EVENING', 'NIGHT', 'DAY', 'YEAR', 'MONTH', 'WEEK',
    'HOUR', 'MINUTE', 'SECOND', 'MOMENT', 'INSTANT', 'ETERNITY', 'INFINITY',
    'ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT',
    'NINE', 'TEN', 'HUNDRED', 'THOUSAND', 'MILLION', 'BILLION', 'TRILLION'
  ];
  
  const rng = Math.random();
  const word1 = words[Math.floor(rng * words.length)];
  const word2 = words[Math.floor(rng * 1000) % words.length];
  
  // Sometimes return single word, sometimes two words
  return Math.random() < 0.7 ? word1 : `${word1}${word2}`;
}

//#region Visual Settings Functions
function applyInitialVisualSettings() {
  // Load visual settings from localStorage if available
  try {
    const saved = localStorage.getItem("planet-visual-settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(visualSettings, parsed);
    }
  } catch (error) {
    console.warn("Failed to load visual settings from localStorage:", error);
  }
  
  // Apply the settings
  applyVisualSettings();
}

function applyVisualSettings() {
  // Apply frame rate cap
  if (visualSettings.frameRate === "unlimited") {
    frameCapTargetMs = 0;
  } else {
    frameCapTargetMs = TARGET_FRAME_TIMES[visualSettings.frameRate] || 0;
  }
  
  // Apply resolution scaling
  const pixelRatio = Math.min(window.devicePixelRatio * visualSettings.resolutionScale, 2);
  renderer.setPixelRatio(pixelRatio);
  
  // Apply lighting scale
  ambientLight.intensity = 0.35 * visualSettings.lightingScale;
  if (sun && sun.sunLight) {
    sun.sunLight.intensity = Math.max(0, params.sunIntensity) * visualSettings.lightingScale;
  }
  
  // Update starfield if it exists
  if (starField?.material?.uniforms?.uPixelRatio) {
    starField.material.uniforms.uPixelRatio.value = pixelRatio;
  }
  
  // Save settings to localStorage
  try {
    localStorage.setItem("planet-visual-settings", JSON.stringify(visualSettings));
  } catch (error) {
    console.warn("Failed to save visual settings to localStorage:", error);
  }
}

//#region Initialization
async function initFromHash() {
  const hash = window.location.hash.slice(1); // Remove the # symbol
  if (!hash) return false;
  
  try {
    // Only try API if hash looks like a short saved ID (nanoid-like)
    const isLikelyApiId = /^[A-Za-z0-9_-]{6,12}$/.test(hash);
    currentHashIsApiId = isLikelyApiId;
    if (isLikelyApiId) {
      // Preserve hash URL and remember id, even if API fails
      currentShareId = hash;
      // Don't change URL format - keep hash for better reload handling
      const configData = await loadConfigurationFromAPIExt(hash);
      if (configData && configData.data) {
        currentShareId = configData.id || hash;
        // Apply the loaded configuration
        const prevType = params.planetType;
        const data = configData.data || {};
        if (data.aurora) mergeAurora(data.aurora);
        Object.keys(data).forEach(k => { if (k !== 'aurora') params[k] = data[k]; });
        // Guard against GUI onChange side-effects while syncing controls
        isApplyingPreset = true;
        try {
          // Update all the UI elements and regenerate the planet
          planet.updatePalette();
          planet.updateClouds();
          planet.updateCore();
          sun.updateSun();
          planet.updateRings();
          planet.updateTilt();
          updateSeedDisplay();
          updateGravityDisplay();
          syncMoonSettings();
          if (prevType !== params.planetType) {
            markPlanetDirty();
          }
          
          // Update GUI controllers
          Object.keys(guiControllers).forEach(key => {
            if (guiControllers[key] && typeof guiControllers[key].setValue === 'function' && params[key] !== undefined) {
              guiControllers[key].setValue(params[key]);
            }
          });
        } finally {
          isApplyingPreset = false;
        }
        // After a successful API load, keep the hash format for better reload handling
        try {
          history.replaceState(null, "", `#${currentShareId}`);
        } catch {}
        return true;
      }
    }
  } catch (error) {
    // Only log API errors if they're not "not found" errors
    if (!error.message.includes('Configuration not found')) {
      console.warn('Failed to load configuration from API:', error);
    }
    
    // Fallback: try to decode as direct share code
    try {
      const decoded = decodeShareExt(hash);
      if (decoded) {
        const loadedData = decoded?.data ?? decoded;
        const prevType = params.planetType;
        // Apply moons if present
        if (Array.isArray(decoded?.moons)) {
          try {
            moonSettings.splice(0, moonSettings.length, ...decoded.moons.map(m => ({ ...m })));
            params.moonCount = decoded.moons.length;
          } catch {}
        }
        if (loadedData?.aurora) mergeAurora(loadedData.aurora);
        Object.keys(loadedData || {}).forEach(k => { if (k !== 'aurora') params[k] = loadedData[k]; });
        
        isApplyingPreset = true;
        try {
          // Update all the UI elements and regenerate the planet
          planet.updatePalette();
          planet.updateClouds();
          planet.updateCore();
          sun.updateSun();
          planet.updateRings();
          planet.updateTilt();
          updateSeedDisplay();
          updateGravityDisplay();
          syncMoonSettings();
          if (prevType !== params.planetType) {
            markPlanetDirty();
          }
          
          // Update GUI controllers
          Object.keys(guiControllers).forEach(key => {
            if (guiControllers[key] && typeof guiControllers[key].setValue === 'function' && params[key] !== undefined) {
              guiControllers[key].setValue(params[key]);
            }
          });
        } finally {
          isApplyingPreset = false;
        }
        // Keep hash format for better reload handling
        try {
          if (currentHashIsApiId && currentShareId) {
            history.replaceState(null, "", `#${currentShareId}`);
          } else {
            const encoded = encodeShare({ version: 1, preset: params.preset, data: loadedData, moons: moonSettings.slice(0, params.moonCount) });
            history.replaceState(null, "", `#${encoded}`);
          }
        } catch {}
        return true;
      }
    } catch (decodeError) {
      console.warn('Failed to decode share code:', decodeError);
    }
    // If we got here and hash looked like an API id, keep short URL and skip default preset
    if (currentHashIsApiId) {
      return true;
    }
  }
  
  return false;
}

async function initializeApp() {
  sun = new Sun(scene, null, params, visualSettings);
  planet = new Planet(scene, params, moonSettings, guiControllers, visualSettings, sun);
  sun.planetRoot = planet.planetRoot; // Circular dependency fix

  const loadedFromHash = await initFromHash();
  if (!loadedFromHash) {
    planet.updatePalette();
    planet.updateClouds();
    planet.updateCore();
    sun.updateSun();
    planet.updateRings();
    planet.updateTilt();
    updateSeedDisplay();
    updateGravityDisplay();
    applyPreset(params.preset, { skipShareUpdate: true, keepSeed: true });
    syncMoonSettings();
  } else {
    updateSeedDisplay();
    updateGravityDisplay();
  }
  setupMobilePanelToggle();
}

initializeApp().then(() => {
  normalizeMoonSettings();
  regenerateStarfield();
  updateStarfieldUniforms();
  markPlanetDirty();
  markMoonsDirty();
  applyInitialVisualSettings();
  if (previewMode) {
    try { applyVisualSettings(); } catch {}
  }
  planet.initMoonPhysics();
  planet.updateOrbitLinesVisibility();
  applyControlSearch({ scrollToFirst: false });
  updateShareCode();

  renderer.domElement.addEventListener('dblclick', (event) => {
    const mouse = new THREE.Vector2();
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const moonMeshes = planet.moonsGroup.children.map(p => p.userData.mesh).filter(m => m);
    const focusableObjects = [planet.planetMesh, sun.sunVisual, ...moonMeshes];
    const intersects = raycaster.intersectObjects(focusableObjects, true);

    if (intersects.length > 0) {
        focusOnObject(intersects[0].object);
    }
  }, false);

  requestAnimationFrame(animate);
});

initOnboarding({ sceneContainer, controlsContainer, previewMode });
helpButton?.addEventListener("click", () => { try { closeMobileMenu?.(); } catch {} showOnboarding(true); });
mobileHelpButton?.addEventListener("click", () => { try { closeMobileMenu?.(); } catch {} showOnboarding(true); });
//#endregion

let activeFocus = null;

function focusOnObject(targetObject) {
  if (!targetObject) {
    // Reset focus to the planet
    activeFocus = {
      object: planet.planetMesh,
      isPlanet: true,
    };
  } else {
    activeFocus = {
      object: targetObject,
      isPlanet: targetObject === planet.planetMesh,
    };
  }
}

//#region Animation loop
function animate(timestamp) {
  if (activeFocus) {
    const targetPosition = new THREE.Vector3();
    activeFocus.object.getWorldPosition(targetPosition);

    const radius = activeFocus.object.geometry.boundingSphere.radius;
    const offset = activeFocus.isPlanet ? params.radius * 2.5 : radius * 4;
    const desiredCameraPosition = targetPosition.clone().add(new THREE.Vector3(offset, offset * 0.5, offset));

    camera.position.lerp(desiredCameraPosition, 0.05);
    controls.target.lerp(targetPosition, 0.05);

    if (camera.position.distanceTo(desiredCameraPosition) < 0.1 && controls.target.distanceTo(targetPosition) < 0.1) {
      activeFocus = null;
    }
  }

  if (frameCapTargetMs && frameCapLastTime) {
    const elapsed = timestamp - frameCapLastTime;
    if (elapsed < frameCapTargetMs) {
      requestAnimationFrame(animate);
      return;
    }
  }
  frameCapLastTime = timestamp;

  const delta = Math.min(1 / 15, (timestamp - lastFrameTime) / 1000 || 0);
  lastFrameTime = timestamp;
  const simulationDelta = delta * params.simulationSpeed;
  simulationYears += simulationDelta * 0.08;

  frameCount++;
  if (timestamp - fpsUpdateTime >= 1000) {
    fps = Math.round((frameCount * 1000) / (timestamp - fpsUpdateTime));
    frameCount = 0;
    fpsUpdateTime = timestamp;
    if (debugFpsDisplay) debugFpsDisplay.textContent = fps;
    if (hudFps) hudFps.textContent = `FPS: ${fps}`;
  }

  controls.update();

  if (planetDirty) {
    showLoading();
    planet.rebuildPlanet();
    planetDirty = false;
    hideLoadingSoon();
  }

  if (moonsDirty) {
    planet.updateMoons();
    moonsDirty = false;
  }

  sun.update(delta, simulationDelta, camera);
  planet.update(delta, simulationDelta, camera);

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

function handleSeedChanged({ skipShareUpdate = false } = {}) {
    updateSeedDisplay();
    regenerateStarfield();
    if (planet) {
        planet.cloudTextureDirty = true;
        markPlanetDirty();
        planet.updateRings();
    }
    if (!skipShareUpdate) {
      scheduleShareUpdate();
    }
}
  
function updateSeedDisplay() {
    if (seedDisplay) seedDisplay.textContent = params.seed;
}
  
function updateGravityDisplay() {
    if (gravityDisplay) gravityDisplay.textContent = `${params.gravity.toFixed(2)} m/s^2`;
}

function updateStabilityDisplay(boundCount, totalCount) {
    if (stabilityDisplay) {
        const stability = totalCount > 0 ? (boundCount / totalCount * 100).toFixed(0) : 100;
        stabilityDisplay.textContent = `${stability}%`;
        stabilityDisplay.className = stability >= 80 ? 'stable' : stability >= 50 ? 'unstable' : 'chaotic';
    }
}
  
function updateTimeDisplay(years) {
    if (!timeDisplay) timeDisplay.textContent = formatYears(years);
}
  
function formatYears(years) {
    if (years < 1 / 12) return `${(years * 365).toFixed(1)} d`;
    if (years < 1) return `${(years * 12).toFixed(1)} mo`;
    if (years < 1000) return `${years.toFixed(1)} y`;
    if (years < 1e6) return `${(years / 1000).toFixed(1)} ky`;
    return `${(years / 1e6).toFixed(2)} My`;
}
  
function onWindowResize() {
    const width = sceneContainer.clientWidth;
    const height = sceneContainer.clientHeight;
    const pixelRatio = Math.min(window.devicePixelRatio * visualSettings.resolutionScale, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (starField?.material?.uniforms?.uPixelRatio) {
      starField.material.uniforms.uPixelRatio.value = pixelRatio;
    }
    if (window.innerWidth > 960) {
      closeMobilePanel(true);
    }
}
window.addEventListener("resize", onWindowResize);

// ... (rest of the file is mostly UI handlers, which can remain)

function isMobileLayout() {
    return window.innerWidth <= 960;
}

function openMobilePanel() {
    if (!isMobileLayout()) return;
    infoPanel?.classList.add("open");
    if (panelScrim) panelScrim.hidden = false;
    if (mobileToggleButton) mobileToggleButton.setAttribute("aria-expanded", "true");
}

function closeMobilePanel(force = false) {
    infoPanel?.classList.remove("open");
    if (panelScrim) panelScrim.hidden = true;
    if (mobileToggleButton) mobileToggleButton.setAttribute("aria-expanded", "false");
}

function populateFocusMenu() {
    if (!focusMoonsContainer) return;
    focusMoonsContainer.innerHTML = ''; // Clear existing moons

    // Add moons
    moonSettings.forEach((moon, index) => {
        const moonButton = document.createElement('button');
        moonButton.className = 'focus-option';
        moonButton.dataset.target = `moon-${index}`;
        moonButton.innerHTML = `🌖 Moon ${index + 1}`;
        focusMoonsContainer.appendChild(moonButton);
    });
}

function setupMobilePanelToggle() {
    mobileFocusToggle?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isHidden = mobileFocusMenu.hasAttribute('hidden');
      if (isHidden) {
          mobileFocusMenu.removeAttribute('hidden');
          mobileFocusToggle.setAttribute('aria-expanded', 'true');
          populateFocusMenu();
      } else {
          mobileFocusMenu.setAttribute('hidden', '');
          mobileFocusToggle.setAttribute('aria-expanded', 'false');
      }
    });

    mobileFocusMenu?.addEventListener('click', (e) => {
      const target = e.target.closest('.focus-option');
      if (!target) return;

      const targetId = target.dataset.target;
      if (!targetId) return;

      if (targetId === 'planet') {
          focusOnObject(planet.planetMesh);
      } else if (targetId === 'sun') {
          focusOnObject(sun.sunVisual);
      } else if (targetId.startsWith('moon-')) {
          const moonIndex = parseInt(targetId.split('-')[1], 10);
          if (!isNaN(moonIndex) && moonIndex < planet.moonsGroup.children.length) {
              const moonMesh = planet.moonsGroup.children[moonIndex].userData.mesh;
              if (moonMesh) {
                  focusOnObject(moonMesh);
              }
          }
      }

      // Close the menu
      mobileFocusMenu.setAttribute('hidden', '');
      mobileFocusToggle.setAttribute('aria-expanded', 'false');
    });

    mobileToggleButton?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (infoPanel?.classList.contains("open")) closeMobilePanel();
      else openMobilePanel();
    });

    mobileMenuToggle?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (mobileMenu?.hasAttribute("hidden")) {
        mobileMenu.removeAttribute("hidden");
        mobileMenuToggle.setAttribute("aria-expanded", "true");
      } else {
        mobileMenu.setAttribute("hidden", "");
        mobileMenuToggle.setAttribute("aria-expanded", "false");
      }
    });

    desktopMenuToggle?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (desktopMenu?.hasAttribute("hidden")) {
        desktopMenu.removeAttribute("hidden");
        desktopMenuToggle.setAttribute("aria-expanded", "true");
      } else {
        desktopMenu.setAttribute("hidden", "");
        desktopMenuToggle.setAttribute("aria-expanded", "false");
      }
    });

    // Close menus when clicking outside
    document.addEventListener("click", (e) => {
      if (mobileMenu && !mobileMenu.contains(e.target) && !mobileMenuToggle?.contains(e.target)) {
        mobileMenu.setAttribute("hidden", "");
        mobileMenuToggle?.setAttribute("aria-expanded", "false");
      }
      if (desktopMenu && !desktopMenu.contains(e.target) && !desktopMenuToggle?.contains(e.target)) {
        desktopMenu.setAttribute("hidden", "");
        desktopMenuToggle?.setAttribute("aria-expanded", "false");
      }
    });

    // Menu item event listeners
    mobileRandomize?.addEventListener("click", () => {
      mobileMenu?.setAttribute("hidden", "");
      mobileMenuToggle?.setAttribute("aria-expanded", "false");
      try {
        surpriseMe();
        updateSeedDisplay();
        updateGravityDisplay();
        scheduleShareUpdate();
      } catch (e) {
        console.warn("Surprise Me failed:", e);
      }
    });

    mobileCopy?.addEventListener("click", () => {
      mobileMenu?.setAttribute("hidden", "");
      mobileMenuToggle?.setAttribute("aria-expanded", "false");
      try {
        copyShareCode();
      } catch (e) {
        console.warn("Copy failed:", e);
      }
    });

    mobileReset?.addEventListener("click", () => {
      mobileMenu?.setAttribute("hidden", "");
      mobileMenuToggle?.setAttribute("aria-expanded", "false");
      try {
        resetAll();
      } catch (e) {
        console.warn("Reset failed:", e);
      }
    });

    mobileVisualSettings?.addEventListener("click", () => {
      mobileMenu?.setAttribute("hidden", "");
      mobileMenuToggle?.setAttribute("aria-expanded", "false");
      try {
        showVisualSettings();
      } catch (e) {
        console.warn("Visual settings failed:", e);
      }
    });

    mobileHelpButton?.addEventListener("click", () => {
      mobileMenu?.setAttribute("hidden", "");
      mobileMenuToggle?.setAttribute("aria-expanded", "false");
      try {
        closeMobileMenu?.();
        showOnboarding(true);
      } catch (e) {
        console.warn("Help failed:", e);
      }
    });

    mobileHomeButton?.addEventListener("click", () => {
      mobileMenu?.setAttribute("hidden", "");
      mobileMenuToggle?.setAttribute("aria-expanded", "false");
      window.location.href = "/";
    });

    desktopCopy?.addEventListener("click", () => {
      desktopMenu?.setAttribute("hidden", "");
      desktopMenuToggle?.setAttribute("aria-expanded", "false");
      try {
        copyShareCode();
      } catch (e) {
        console.warn("Copy failed:", e);
      }
    });

    desktopHelp?.addEventListener("click", () => {
      desktopMenu?.setAttribute("hidden", "");
      desktopMenuToggle?.setAttribute("aria-expanded", "false");
      try {
        showOnboarding(true);
      } catch (e) {
        console.warn("Help failed:", e);
      }
    });

    desktopVisualSettings?.addEventListener("click", () => {
      desktopMenu?.setAttribute("hidden", "");
      desktopMenuToggle?.setAttribute("aria-expanded", "false");
      try {
        showVisualSettings();
      } catch (e) {
        console.warn("Visual settings failed:", e);
      }
    });

    desktopHome?.addEventListener("click", () => {
      desktopMenu?.setAttribute("hidden", "");
      desktopMenuToggle?.setAttribute("aria-expanded", "false");
      window.location.href = "/";
    });

    // Visual settings popup event listeners
    visualSettingsClose?.addEventListener("click", hideVisualSettings);
    visualSettingsReset?.addEventListener("click", () => {
      // Reset visual settings to defaults
      Object.assign(visualSettings, {
        frameRate: "unlimited",
        resolutionScale: 1.0,
        lightingScale: 1.0,
        particleMax: 1000,
        noiseResolution: 1.0,
        gasResolution: 1.0,
        starMax: 4000,
        ringDetail: 1.0
      });
      updateVisualSettingsUI();
      applyVisualSettings();
      showNotification("Visual settings reset to defaults");
    });
    visualSettingsApply?.addEventListener("click", () => {
      applyVisualSettings();
      
      // Force scene rebuild for settings that require it
      markPlanetDirty();
      markMoonsDirty();
      
      // Regenerate starfield if star count changed
      regenerateStarfield();
      
      // Update starfield uniforms for resolution changes
      updateStarfieldUniforms();
      
      hideVisualSettings();
      showNotification("Visual settings applied");
    });

    // Visual settings controls event listeners
    setupVisualSettingsControls();

    // Close visual settings when clicking outside
    visualSettingsPopup?.addEventListener("click", (e) => {
      if (e.target === visualSettingsPopup) {
        hideVisualSettings();
      }
    });

    // Import share handlers
    importShareLoad?.addEventListener("click", async () => {
      const code = (importShareInput?.value || '').trim();
      if (!code) return;
      try {
        // Try API if code looks like an ID, else decode locally
        const isLikelyApiId = /^[A-Za-z0-9_-]{6,12}$/.test(code);
        if (isLikelyApiId) {
          const cfg = await loadConfigurationFromAPIExt(code);
          if (cfg?.data) {
          const prevType = params.planetType;
          const data = cfg.data || {};
          if (data.aurora) mergeAurora(data.aurora);
          Object.keys(data).forEach(k => { if (k !== 'aurora') params[k] = data[k]; });
            if (prevType !== params.planetType) markPlanetDirty();
          }
        } else {
          const decoded = decodeShareExt(code);
          const loadedData = decoded?.data ?? decoded;
          if (Array.isArray(decoded?.moons)) {
            moonSettings.splice(0, moonSettings.length, ...decoded.moons.map(m => ({ ...m })));
            params.moonCount = decoded.moons.length;
          }
          const prevType = params.planetType;
          if (loadedData?.aurora) mergeAurora(loadedData.aurora);
          Object.keys(loadedData || {}).forEach(k => { if (k !== 'aurora') params[k] = loadedData[k]; });
          if (prevType !== params.planetType) markPlanetDirty();
        }
        // Apply
        isApplyingPreset = true;
        try {
          planet.updatePalette();
          planet.updateClouds();
          planet.updateCore();
          sun.updateSun();
          planet.updateRings();
          planet.updateTilt();
          updateSeedDisplay();
          updateGravityDisplay();
          syncMoonSettings();
          Object.keys(guiControllers).forEach(key => {
            if (guiControllers[key] && typeof guiControllers[key].setValue === 'function' && params[key] !== undefined) {
              guiControllers[key].setValue(params[key]);
            }
          });
        } finally {
          isApplyingPreset = false;
        }
        scheduleShareUpdate();
        showNotification('Configuration loaded');
      } catch (e) {
        console.warn('Import failed:', e);
        showNotification('Failed to load configuration', 'error');
      }
    });

    importShareCancel?.addEventListener("click", () => {
      if (importShareInput) importShareInput.value = '';
    });

    // Inline copy share button
    copyShareInlineButton?.addEventListener("click", async () => {
      try {
        await copyShareCode();
      } catch (e) {
        console.warn("Copy share failed:", e);
      }
    });

    panelScrim?.addEventListener("click", () => closeMobilePanel());
    panelScrim?.addEventListener("touchstart", () => closeMobilePanel(), { passive: true });

    sceneContainer?.addEventListener("click", () => {
      if (isMobileLayout() && infoPanel?.classList.contains("open")) closeMobilePanel();
    });
    sceneContainer?.addEventListener("touchstart", () => {
      if (isMobileLayout() && infoPanel?.classList.contains("open")) closeMobilePanel();
    }, { passive: true });

    document.addEventListener("click", (e) => {
      if (!isMobileLayout()) return;
      const target = e.target;
      if (!infoPanel || !infoPanel.classList.contains("open")) return;
      if (infoPanel.contains(target)) return;
      if (mobileToggleButton && (target === mobileToggleButton || mobileToggleButton.contains(target))) return;
      closeMobilePanel();
    });
}

function markPlanetDirty() {
    planetDirty = true;
}

function updateAurora() {
    if (planet) {
        planet.updateAurora();
    }
}

// Keep aurora object and colors array identity to preserve GUI bindings
function mergeAurora(nextAurora) {
    if (!nextAurora) return;
    if (!params.aurora) params.aurora = {};
    const curr = params.aurora;
    if (!Array.isArray(curr.colors)) curr.colors = ["#38ff7a", "#3fb4ff"];
    if (Array.isArray(nextAurora.colors)) {
        if (typeof nextAurora.colors[0] === "string") curr.colors[0] = nextAurora.colors[0];
        if (typeof nextAurora.colors[1] === "string") curr.colors[1] = nextAurora.colors[1];
    }
    const keys = [
        "enabled",
        "latitudeCenterDeg",
        "latitudeWidthDeg",
        "height",
        "intensity",
        "noiseScale",
        "banding",
        "nightBoost"
    ];
    for (const k of keys) {
        if (nextAurora[k] !== undefined) curr[k] = nextAurora[k];
    }
}

function markMoonsDirty() {
    moonsDirty = true;
}

function scheduleShareUpdate() {
    shareDirty = true;
    debounceShare();
}

function updateShareCode() {
    const payload = buildSharePayload();
    const encoded = encodeShare(payload);
    const formatted = chunkCode(encoded, 5).join(" ");

    if (shareDisplay) {
      shareDisplay.textContent = formatted;
      shareDisplay.dataset.code = encoded;
      shareDisplay.title = `Local code - Click \"Copy Share Code\" to save to API`;
    }

    // Keep hash format for better reload handling
    try {
      if (currentShareId) {
        history.replaceState(null, "", `#${currentShareId}`);
      } else {
        history.replaceState(null, "", `#${encoded}`);
      }
    } catch {}
}

function buildSharePayload() {
    const data = {};
    shareKeys.forEach((key) => {
      data[key] = params[key];
    });
    if (Array.isArray(params.rings)) {
      data.rings = params.rings.map((r) => ({
        style: r.style, color: r.color, start: r.start, end: r.end,
        opacity: r.opacity, noiseScale: r.noiseScale, noiseStrength: r.noiseStrength,
        spinSpeed: r.spinSpeed, brightness: r.brightness
      }));
      data.ringCount = params.ringCount ?? params.rings.length;
    }
    const moons = moonSettings.slice(0, params.moonCount).map((moon) => ({
      size: moon.size, distance: moon.distance, orbitSpeed: moon.orbitSpeed,
      inclination: moon.inclination, color: moon.color, phase: moon.phase,
      eccentricity: moon.eccentricity
    }));
    return { version: 1, preset: params.preset, data, moons };
}

function encodeShare(payload) { return encodeShareExt(payload); }
function decodeShare(code) { return decodeShareExt(code); }

async function copyShareCode() {
  try {
    const payload = buildSharePayload();
    const shareCode = encodeShare(payload);
    
    // Try to save to API first
    try {
      const result = await saveConfigurationToAPIExt(payload.data, payload.metadata || {});
      if (result && result.id) {
        // Update URL with API ID in hash format
        currentShareId = result.id;
        try { window.history.replaceState({}, '', `#${result.id}`); } catch {}
        if (shareDisplay) {
          shareDisplay.textContent = result.id;
          shareDisplay.title = `API code - Click to copy\n${result.id}`;
        }
        
        // Copy to clipboard
        await navigator.clipboard.writeText(result.id);
        showNotification("Planet saved to API and copied to clipboard!");
        return;
      }
    } catch (apiError) {
      console.warn("Failed to save to API, using local code:", apiError);
    }
    
    // Fallback to local code
    window.history.replaceState({}, '', `#${shareCode}`);
    currentShareId = null;
    if (shareDisplay) {
      shareDisplay.textContent = shareCode;
      shareDisplay.title = `Local code - Click to copy\n${shareCode}`;
    }
    
    // Copy to clipboard
    await navigator.clipboard.writeText(shareCode);
    showNotification("Share code copied to clipboard!");
    
  } catch (error) {
    console.error("Failed to copy share code:", error);
    showNotification("Failed to copy share code", "error");
  }
}

function showVisualSettings() {
  if (visualSettingsPopup) {
    updateVisualSettingsUI();
    visualSettingsPopup.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
  }
}

function hideVisualSettings() {
  if (visualSettingsPopup) {
    visualSettingsPopup.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }
}

function updateVisualSettingsUI() {
  // Update preset selector - detect which preset matches current settings
  if (visualSettingsPresetSelect) {
    let matchingPreset = "default";
    for (const [presetName, presetValues] of Object.entries(VISUAL_SETTING_PRESETS)) {
      let matches = true;
      for (const [key, value] of Object.entries(presetValues)) {
        if (Math.abs(visualSettings[key] - value) > 0.01) { // Allow small floating point differences
          matches = false;
          break;
        }
      }
      if (matches) {
        matchingPreset = presetName;
        break;
      }
    }
    visualSettingsPresetSelect.value = matchingPreset;
  }
  
  // Update frame rate
  if (frameRateControl) {
    frameRateControl.value = visualSettings.frameRate;
  }
  
  // Update resolution scale
  if (resolutionScale) {
    resolutionScale.value = visualSettings.resolutionScale;
    if (resolutionScaleValue) {
      resolutionScaleValue.textContent = Math.round(visualSettings.resolutionScale * 100) + "%";
    }
  }
  
  // Update lighting scale
  if (lightingScale) {
    lightingScale.value = visualSettings.lightingScale;
    if (lightingScaleValue) {
      lightingScaleValue.textContent = Math.round(visualSettings.lightingScale * 100) + "%";
    }
  }
  
  // Update particle max
  if (particleMaxInput) {
    particleMaxInput.value = visualSettings.particleMax;
    if (particleMaxValue) {
      particleMaxValue.textContent = visualSettings.particleMax;
    }
  }
  
  // Update star max
  if (starMaxInput) {
    starMaxInput.value = visualSettings.starMax;
    if (starMaxValue) {
      starMaxValue.textContent = visualSettings.starMax;
    }
  }
  
  // Update noise resolution
  if (noiseResolutionInput) {
    noiseResolutionInput.value = visualSettings.noiseResolution;
    if (noiseResolutionValue) {
      noiseResolutionValue.textContent = Math.round(visualSettings.noiseResolution * 100) + "%";
    }
  }
  
  // Update gas resolution
  if (gasResolutionInput) {
    gasResolutionInput.value = visualSettings.gasResolution;
    if (gasResolutionValue) {
      gasResolutionValue.textContent = Math.round(visualSettings.gasResolution * 100) + "%";
    }
  }
  
  // Update ring detail
  if (ringDetailInput) {
    ringDetailInput.value = visualSettings.ringDetail;
    if (ringDetailValue) {
      ringDetailValue.textContent = Math.round(visualSettings.ringDetail * 100) + "%";
    }
  }
}

function setupVisualSettingsControls() {
  // Preset selector
  visualSettingsPresetSelect?.addEventListener("change", (e) => {
    const preset = VISUAL_SETTING_PRESETS[e.target.value];
    if (preset) {
      Object.assign(visualSettings, preset);
      updateVisualSettingsUI();
      // Apply the preset immediately for preview
      applyVisualSettings();
    }
  });
  
  // Frame rate control
  frameRateControl?.addEventListener("change", (e) => {
    visualSettings.frameRate = e.target.value;
  });
  
  // Resolution scale
  resolutionScale?.addEventListener("input", (e) => {
    visualSettings.resolutionScale = parseFloat(e.target.value);
    if (resolutionScaleValue) {
      resolutionScaleValue.textContent = Math.round(visualSettings.resolutionScale * 100) + "%";
    }
    // Apply resolution changes immediately for preview
    const pixelRatio = Math.min(window.devicePixelRatio * visualSettings.resolutionScale, 2);
    renderer.setPixelRatio(pixelRatio);
  });
  
  // Lighting scale
  lightingScale?.addEventListener("input", (e) => {
    visualSettings.lightingScale = parseFloat(e.target.value);
    if (lightingScaleValue) {
      lightingScaleValue.textContent = Math.round(visualSettings.lightingScale * 100) + "%";
    }
    // Apply lighting changes immediately for preview
    ambientLight.intensity = 0.35 * visualSettings.lightingScale;
    if (sun && sun.sunLight) {
      sun.sunLight.intensity = Math.max(0, params.sunIntensity) * visualSettings.lightingScale;
    }
  });
  
  // Particle max
  particleMaxInput?.addEventListener("input", (e) => {
    visualSettings.particleMax = parseInt(e.target.value);
    if (particleMaxValue) {
      particleMaxValue.textContent = visualSettings.particleMax;
    }
  });
  
  // Star max
  starMaxInput?.addEventListener("input", (e) => {
    visualSettings.starMax = parseInt(e.target.value);
    if (starMaxValue) {
      starMaxValue.textContent = visualSettings.starMax;
    }
    // Regenerate starfield immediately for preview
    regenerateStarfield();
  });
  
  // Noise resolution
  noiseResolutionInput?.addEventListener("input", (e) => {
    visualSettings.noiseResolution = parseFloat(e.target.value);
    if (noiseResolutionValue) {
      noiseResolutionValue.textContent = Math.round(visualSettings.noiseResolution * 100) + "%";
    }
  });
  
  // Gas resolution
  gasResolutionInput?.addEventListener("input", (e) => {
    visualSettings.gasResolution = parseFloat(e.target.value);
    if (gasResolutionValue) {
      gasResolutionValue.textContent = Math.round(visualSettings.gasResolution * 100) + "%";
    }
  });
  
  // Ring detail
  ringDetailInput?.addEventListener("input", (e) => {
    visualSettings.ringDetail = parseFloat(e.target.value);
    if (ringDetailValue) {
      ringDetailValue.textContent = Math.round(visualSettings.ringDetail * 100) + "%";
    }
  });
}

function showNotification(message, type = "success") {
  // Create container once
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    // Place lower on the screen
    container.style.top = 'auto';
    container.style.bottom = '20px';
    container.style.right = '16px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.zIndex = '10000';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.textContent = message;
  // Match app style (dark translucent cards)
  toast.style.background = 'var(--widget-color, rgba(30, 46, 79, 0.72))';
  toast.style.color = 'var(--text-color, rgba(217, 230, 255, 0.94))';
  toast.style.border = '1px solid rgba(53, 80, 131, 0.35)';
  toast.style.backdropFilter = 'blur(6px)';
  toast.style.padding = '10px 14px';
  toast.style.borderRadius = '10px';
  toast.style.font = '12px var(--font-family, \'Segoe UI\', Roboto, sans-serif)';
  toast.style.boxShadow = '0 6px 20px rgba(0,0,0,0.28)';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-6px)';
  toast.style.transition = 'opacity 140ms ease, transform 140ms ease';

  if (type === 'error') {
    toast.style.border = '1px solid rgba(255, 97, 97, 0.45)';
  }

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
    setTimeout(() => toast.remove(), 160);
  }, 2800);
}

function chunkCode(str, size) {
    const chunks = [];
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size));
    }
    return chunks;
}

function regenerateStarfield() {
    if (starField) {
      scene.remove(starField);
      starField.geometry.dispose();
      starField.material.dispose();
      starField = null;
    }
    const desiredCount = getStarfieldCount(params.starCount);
    if (desiredCount !== params.starCount) {
      params.starCount = desiredCount;
      guiControllers.starCount?.updateDisplay?.();
    }
    starField = createStarfieldExt({ seed: params.seed, count: desiredCount, resolution: visualSettings?.noiseResolution ?? 1.0 });
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
  
function getStarfieldCount(count) {
    let value = Math.max(0, Math.round(count ?? 2000));
    if (visualSettings?.starMax != null) {
      value = Math.min(value, Math.max(0, Math.round(visualSettings.starMax)));
    }
    return value;
}

function showLoading() {
    if (loadingOverlay) loadingOverlay.hidden = false;
}

function hideLoading() {
    if (loadingOverlay) loadingOverlay.hidden = true;
}

function hideLoadingSoon() {
    setTimeout(() => hideLoading(), 30);
}
  
function surpriseMe() {
    const newSeed = generateSeed();
    const rng = new SeededRNG(newSeed);
  
    const isGasGiant = rng.next() < 1 / 6;
  
    const prevSimSpeed = params.simulationSpeed;
    const preserveFoam = params.foamEnabled;
    const preserveRings = !params.ringAllowRandom;
    const prevRingSettings = preserveRings
      ? { ringEnabled: params.ringEnabled, ringAngle: params.ringAngle, ringSpinSpeed: params.ringSpinSpeed, ringCount: params.ringCount, rings: params.rings.map(r => ({...r})) }
      : null;
  
    isApplyingPreset = true;
    if (isGasGiant) {
      params.planetType = "gas_giant";
      const gasGiantPresets = Object.keys(presets).filter(p => presets[p].planetType === 'gas_giant');
      const pickPreset = gasGiantPresets[Math.floor(rng.next() * gasGiantPresets.length)];
      applyPreset(pickPreset, { skipShareUpdate: true, keepSeed: true });
    } else {
      params.planetType = "rocky";
      const rockyPresets = Object.keys(presets).filter(p => presets[p].planetType === 'rocky' || !presets[p].planetType);
      const pickPreset = rockyPresets[Math.floor(rng.next() * rockyPresets.length)];
      applyPreset(pickPreset, { skipShareUpdate: true, keepSeed: true });
    }
    isApplyingPreset = false;
  
    params.simulationSpeed = prevSimSpeed;
    params.foamEnabled = preserveFoam;
    if (preserveRings && prevRingSettings) {
      Object.assign(params, prevRingSettings);
    }
  
    params.seed = newSeed;
  
    if (isGasGiant) {
      params.radius = THREE.MathUtils.lerp(2.0, 4.0, rng.next());
      params.gasGiantStrataCount = Math.round(THREE.MathUtils.lerp(2, 6, rng.next()));
      let totalSize = 0;
      for (let i = 1; i <= params.gasGiantStrataCount; i++) {
        const hue = rng.next();
        params[`gasGiantStrataColor${i}`] = `#${new THREE.Color().setHSL(hue, rng.next() * 0.4 + 0.3, rng.next() * 0.4 + 0.3).getHexString()}`;
        const size = rng.next();
        params[`gasGiantStrataSize${i}`] = size;
        totalSize += size;
      }
      if (totalSize > 0) {
        for (let i = 1; i <= params.gasGiantStrataCount; i++) {
          params[`gasGiantStrataSize${i}`] /= totalSize;
        }
      }
      params.gasGiantNoiseScale = THREE.MathUtils.lerp(1.0, 8.0, rng.next());
      params.gasGiantNoiseStrength = THREE.MathUtils.lerp(0.05, 0.3, rng.next());
      params.gasGiantStrataWarp = THREE.MathUtils.lerp(0.01, 0.1, rng.next());
      params.gasGiantStrataWarpScale = THREE.MathUtils.lerp(2.0, 12.0, rng.next());
    } else {
      params.radius = THREE.MathUtils.lerp(0.6, 2.0, rng.next());
      params.subdivisions = Math.round(THREE.MathUtils.lerp(4, 6, rng.next()));
      params.noiseLayers = Math.round(THREE.MathUtils.lerp(3, 7, rng.next()));
      params.noiseFrequency = THREE.MathUtils.lerp(0.8, 5.2, rng.next());
      params.noiseAmplitude = THREE.MathUtils.lerp(0.2, 0.9, rng.next());
      params.persistence = THREE.MathUtils.lerp(0.35, 0.65, rng.next());
      params.lacunarity = THREE.MathUtils.lerp(1.6, 3.2, rng.next());
      params.oceanLevel = THREE.MathUtils.lerp(0.0, 0.75, rng.next() * rng.next());
      const hue = rng.next();
      const hue2 = (hue + 0.12 + rng.next() * 0.2) % 1;
      const hue3 = (hue + 0.3 + rng.next() * 0.3) % 1;
      params.colorOcean = `#${new THREE.Color().setHSL(hue, 0.6, 0.28).getHexString()}`;
      params.colorShallow = `#${new THREE.Color().setHSL(hue, 0.55, 0.45).getHexString()}`;
      params.colorLow = `#${new THREE.Color().setHSL(hue2, 0.42, 0.3).getHexString()}`;
      params.colorMid = `#${new THREE.Color().setHSL(hue2, 0.36, 0.58).getHexString()}`;
      params.colorHigh = `#${new THREE.Color().setHSL(hue3, 0.15, 0.92).getHexString()}`;
      params.colorCore = `#${new THREE.Color().setHSL(hue, 0.4, 0.3).getHexString()}`;
      params.coreEnabled = true;
      params.coreSize = THREE.MathUtils.lerp(0.2, 0.6, rng.next());
      params.coreVisible = true;
      params.icePolesEnabled = rng.next() < 0.7;
      params.icePolesCoverage = THREE.MathUtils.lerp(0.05, 0.3, rng.next());
      params.icePolesColor = `#${new THREE.Color().setHSL(0.6, rng.next() * 0.2 + 0.1, rng.next() * 0.3 + 0.7).getHexString()}`;
      params.icePolesNoiseScale = THREE.MathUtils.lerp(1.0, 4.0, rng.next());
      params.icePolesNoiseStrength = THREE.MathUtils.lerp(0.1, 0.5, rng.next());
    }
  
    params.axisTilt = THREE.MathUtils.lerp(0, 45, rng.next());
    params.rotationSpeed = THREE.MathUtils.lerp(0.05, 0.5, rng.next());
    params.gravity = THREE.MathUtils.lerp(4, 25, rng.next());
    const atmHue = rng.next();
    params.atmosphereColor = `#${new THREE.Color().setHSL(atmHue, 0.6, 0.55).getHexString()}`;
    params.atmosphereOpacity = THREE.MathUtils.lerp(0.05, 0.5, rng.next());
    params.cloudsOpacity = THREE.MathUtils.lerp(0.1, 0.8, rng.next());
    params.cloudHeight = THREE.MathUtils.lerp(0.01, 0.12, rng.next());
    params.cloudDensity = THREE.MathUtils.lerp(0.25, 0.85, rng.next());
    params.cloudNoiseScale = THREE.MathUtils.lerp(1.2, 5.0, rng.next());
    params.cloudDriftSpeed = THREE.MathUtils.lerp(0, 0.06, rng.next());
  
    if (rng.next() > 0.2) {
      params.sunVariant = "Star";
      const starPresetNames = Object.keys(starPresets);
      const pickedStarPreset = starPresetNames[Math.floor(rng.next() * starPresetNames.length)];
      applyStarPreset(pickedStarPreset, { skipShareUpdate: true });
    } else {
      params.sunVariant = "Black Hole";
      params.blackHoleCoreSize = THREE.MathUtils.lerp(0.4, 1.6, rng.next());
      params.blackHoleDiskRadius = params.blackHoleCoreSize * THREE.MathUtils.lerp(1.8, 4.0, rng.next());
      params.blackHoleDiskThickness = THREE.MathUtils.lerp(0.1, 0.8, rng.next());
      params.blackHoleDiskIntensity = THREE.MathUtils.lerp(0.8, 2.5, rng.next());
      params.blackHoleHaloRadius = params.blackHoleDiskRadius * THREE.MathUtils.lerp(1.1, 1.8, rng.next());
      params.blackHoleHaloAngle = THREE.MathUtils.lerp(20, 160, rng.next());
    }
  
    params.moonCount = Math.round(THREE.MathUtils.lerp(0, 4, rng.next() * rng.next()));
    params.moonMassScale = THREE.MathUtils.lerp(0.6, 2.5, rng.next());
    moonSettings.splice(0, moonSettings.length);
    for (let i = 0; i < params.moonCount; i += 1) {
      moonSettings.push({
        size: THREE.MathUtils.lerp(0.08, 0.4, rng.next()),
        distance: THREE.MathUtils.lerp(2.4, 12.5, rng.next()),
        orbitSpeed: THREE.MathUtils.lerp(0.4, 1.2, rng.next()),
        inclination: THREE.MathUtils.lerp(-25, 25, rng.next()),
        color: `#${new THREE.Color().setHSL((rng.next() + 0.5) % 1, 0.15 + rng.next() * 0.3, 0.6 + rng.next() * 0.2).getHexString()}`,
        phase: rng.next() * Math.PI * 2,
        eccentricity: THREE.MathUtils.lerp(0.02, 0.55, rng.next())
      });
    }
  
    if (!preserveRings) {
      params.ringEnabled = rng.next() > 0.5;
      if (params.ringEnabled) {
        params.ringCount = Math.round(THREE.MathUtils.lerp(1, 5, rng.next()));
        params.ringAngle = THREE.MathUtils.lerp(-45, 45, rng.next());
        params.rings.splice(0, params.rings.length);
        let lastRadius = 1.2;
        for (let i = 0; i < params.ringCount; i += 1) {
          const start = lastRadius + THREE.MathUtils.lerp(0.05, 0.2, rng.next());
          const end = start + THREE.MathUtils.lerp(0.1, 0.5, rng.next());
          params.rings.push({
            style: rng.next() > 0.5 ? "Texture" : "Noise",
            color: `#${new THREE.Color().setHSL(rng.next(), 0.15, 0.6).getHexString()}`,
            start, end, opacity: THREE.MathUtils.lerp(0.4, 0.9, rng.next()),
            noiseScale: THREE.MathUtils.lerp(1.5, 6.0, rng.next()),
            noiseStrength: THREE.MathUtils.lerp(0.1, 0.6, rng.next()),
            spinSpeed: THREE.MathUtils.lerp(-0.1, 0.1, rng.next()),
            brightness: 1
          });
          lastRadius = end;
        }
      }
    }

    // Randomize aurora
    params.aurora.enabled = rng.next() > 0.3; // 70% chance of aurora
    if (params.aurora.enabled) {
      const h1 = rng.next();
      const h2 = (h1 + 0.4 + rng.next() * 0.2) % 1.0;
      // mutate colors to preserve array identity
      params.aurora.colors[0] = `#${new THREE.Color().setHSL(h1, 0.9, 0.6).getHexString()}`;
      params.aurora.colors[1] = `#${new THREE.Color().setHSL(h2, 0.9, 0.6).getHexString()}`;
      params.aurora.latitudeCenterDeg = 60 + rng.next() * 15;
      params.aurora.latitudeWidthDeg = THREE.MathUtils.lerp(8, 20, rng.next());
      // Aurora height at atmosphere level (matches Earth-like preset)
      params.aurora.height = 0.06;
      params.aurora.intensity = THREE.MathUtils.lerp(0.5, 2.0, rng.next());
      params.aurora.noiseScale = THREE.MathUtils.lerp(1.0, 5.0, rng.next());
      params.aurora.banding = THREE.MathUtils.lerp(0.3, 1.0, rng.next());
      params.aurora.nightBoost = THREE.MathUtils.lerp(1.2, 2.5, rng.next());
    }

    Object.keys(guiControllers).forEach((key) => {
      if (params[key] !== undefined && guiControllers[key]?.setValue) {
        isApplyingPreset = true;
        guiControllers[key].setValue(params[key]);
        isApplyingPreset = false;
      }
    });

    try {
      Object.values(guiControllers).forEach((ctrl) => ctrl?.updateDisplay?.());
      guiControllers.refreshPlanetTypeVisibility(params.planetType);
      guiControllers.rebuildRingControls?.();
      
      // Update aurora controllers explicitly using setValue for proper GUI updates
      if (params.aurora) {
        isApplyingPreset = true;
        try {
          if (guiControllers.auroraEnabled) guiControllers.auroraEnabled.setValue(params.aurora.enabled);
          if (guiControllers.auroraColor1) guiControllers.auroraColor1.setValue(params.aurora.colors[0]);
          if (guiControllers.auroraColor2) guiControllers.auroraColor2.setValue(params.aurora.colors[1]);
          if (guiControllers.auroraLatitudeCenter) guiControllers.auroraLatitudeCenter.setValue(params.aurora.latitudeCenterDeg);
          if (guiControllers.auroraLatitudeWidth) guiControllers.auroraLatitudeWidth.setValue(params.aurora.latitudeWidthDeg);
          // Aurora height is fixed - no controller to update
          if (guiControllers.auroraIntensity) guiControllers.auroraIntensity.setValue(params.aurora.intensity);
          if (guiControllers.auroraNoiseScale) guiControllers.auroraNoiseScale.setValue(params.aurora.noiseScale);
          if (guiControllers.auroraBanding) guiControllers.auroraBanding.setValue(params.aurora.banding);
          if (guiControllers.auroraNightBoost) guiControllers.auroraNightBoost.setValue(params.aurora.nightBoost);
        } finally {
          isApplyingPreset = false;
        }
      }
    } catch {}

    normalizeMoonSettings();
    handleSeedChanged({ skipShareUpdate: true });
    planet.updatePalette();
    planet.updateClouds();
    sun.updateSun();
    planet.updateRings();
    planet.updateTilt();
    updateGravityDisplay();
    rebuildMoonControls();
    markMoonsDirty();
    planet.initMoonPhysics();
    updateStarfieldUniforms();
    planet.guiControllers.updateStabilityDisplay(moonSettings.length, moonSettings.length);
    scheduleShareUpdate();
    
    // Force immediate URL update for surprise me to prevent loss on reload
    setTimeout(() => {
      if (shareDirty) {
        updateShareCode();
        shareDirty = false;
      }
    }, 200); // Slightly longer than debounce to ensure it runs after
}
