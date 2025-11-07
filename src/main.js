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
const clock = new THREE.Clock();

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

const camera = new THREE.PerspectiveCamera(55, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.01, 50); // Clipping divided by 10
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

// FPS mode state
let isFpsMode = false;
let fpsModeType = "ship";
let ship = null;
let fpsController = {
  position: new THREE.Vector3(),
  rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
  velocity: new THREE.Vector3(),
  speed: 0.04, // Base speed (divided by 10)
  baseSpeed: 0.04, // Base speed reference (divided by 10)
  minSpeed: 0.005, // Minimum speed when very close to planet (divided by 10)
  maxSpeed: 0.08, // Maximum speed when far from planet (divided by 10)
  accelerationMultiplier: 2.0,
  slowMultiplier: 0.3,
  dashBoost: 1.0,
  dashCooldown: 0,
  dashDuration: 0,
  mouseSensitivity: 0.002,
  pitch: 0,
  yaw: 0,
  isPointerLocked: false
};

const walkController = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  mouseSensitivity: 0.0012,
  speed: 0.015,
  sprintMultiplier: 2.0,
  maxPitch: THREE.MathUtils.degToRad(85),
  eyeHeight: 0.015,
  gravity: 0.2,
  groundAcceleration: 15,
  airAcceleration: 4,
  groundFriction: 10,
  jumpStrength: 0.04,
  onGround: false
};
const tempVec1 = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempVec3 = new THREE.Vector3();
const tempVec4 = new THREE.Vector3();
const tempVec5 = new THREE.Vector3();
const tempVec6 = new THREE.Vector3();
const tempVec7 = new THREE.Vector3();
const tempQuat1 = new THREE.Quaternion();
const tempQuat2 = new THREE.Quaternion();
const tempMat4 = new THREE.Matrix4();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);

// Keyboard input state
const keys = {};

// Ship initialization
function createShip() {
  if (ship) {
    // Ship already exists, just update position
    return ship;
  }
  
  // Create a triangular ship using a cone geometry (very small - divided by 10)
  const shipGeometry = new THREE.ConeGeometry(0.001, 0.002, 3);
  
  // Create glowing blue material
  const shipMaterial = new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    emissive: 0x0055cc,
    emissiveIntensity: 1.5,
    metalness: 0.8,
    roughness: 0.2
  });
  
  ship = new THREE.Mesh(shipGeometry, shipMaterial);
  ship.rotation.x = Math.PI / 2; // Rotate to point forward
  
  // Add glow effect with additional geometry (divided by 10)
  const glowGeometry = new THREE.ConeGeometry(0.0012, 0.0024, 3);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.rotation.x = Math.PI / 2;
  ship.add(glow);
  
  // Position ship at safe distance from planet
  if (planet && planet.planetRoot) {
    const planetRadius = getEffectivePlanetRadius();
    const initialDistance = planetRadius * 2.5;
    ship.position.set(0, initialDistance * 0.5, initialDistance);
    fpsController.position.copy(ship.position);
  } else {
    ship.position.set(0, 3, 3);
    fpsController.position.copy(ship.position);
  }
  
  scene.add(ship);
  return ship;
}

function getEffectivePlanetRadius() {
  if (planet?.planetMesh?.scale) {
    return planet.planetMesh.scale.x;
  }
  if (typeof params.radius === "number" && !Number.isNaN(params.radius)) {
    return params.radius;
  }
  if (typeof params.planetSize === "number" && !Number.isNaN(params.planetSize)) {
    return params.planetSize;
  }
  return 1.0;
}

const planetCenterCache = new THREE.Vector3();
function getPlanetCenter(target = planetCenterCache) {
  target.set(0, 0, 0);
  if (planet?.planetRoot) {
    planet.planetRoot.getWorldPosition(target);
  }
  return target;
}

// Removed - now handled inline in updateWalkMovement

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
  seed: "BLUEHOME",
  planetType: "earth", // 'earth' or 'gas'
  rotationSpeed: 0.05,
  planetSize: 1.0,
  seaLevel: 0.52,
  continentSize: 1.5,
  mountainHeight: 0.4,
  roughness: 0.55,
  detail: 6.0,
  iceCapThreshold: 0.9,
  noiseType: "classic",
  noiseVariant: 0.5,
  colorDeepWater: "#002b4d",
  colorShallowWater: "#006994",
  colorBeach: "#d4c6a3",
  colorGrass: "#2a602a",
  colorForest: "#1a381a",
  colorMountain: "#666666",
  colorMountainHigh: "#888888",
  colorSnow: "#ffffff",
  atmosphereDensity: 0.3,
  atmosphereColor: "#3a9eff",
  // Gas Planet Params
  gasPlanetSize: 1.0,
  gasStripeSpeed: 0.02,
  gasStripeFrequency: 3.0,
  gasStripeSharpness: 2.0,
  gasTurbulence: 0.75,
  gasColor1: "#d4a574",
  gasColor2: "#8b6f47",
  gasColor3: "#ffd4a3",
  gasColor4: "#5c4a2e",
  gasColor5: "#f5e6d3",
  // Starfield
  starCount: 2200,
  starBrightness: 0.85,
  starTwinkleSpeed: 0.6,
  // Moons and Rings
  moonCount: 0,
  moonMassScale: 1,
  ringEnabled: false,
  ringAngle: 0,
  ringSpinSpeed: 0.05,
  ringCount: 0,
  rings: [],
  showOrbitLines: true,
  physicsEnabled: false,
  physicsTwoWay: false,
  physicsDamping: 0.0005,
  physicsSubsteps: 2,
  impactDeformation: false,
  impactStrengthMul: 2.5,
  impactSpeedMul: 1.2,
  impactMassMul: 2.0,
  impactElongationMul: 1.6,
  gravity: 9.81
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

//#endregion

//#region State tracking
let planetDirty = true;
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
  markMoonsDirty: () => { planetDirty = true; }, // Moons are part of the planet
  getIsApplyingPreset: () => isApplyingPreset
});

// Add moon settings normalization function to guiControllers
guiControllers.normalizeMoonSettings = normalizeMoonSettings;
guiControllers.rebuildMoonControls = rebuildMoonControls;

const { rebuildRingControls, normalizeRingSettings } = setupRingControls({
  gui,
  params,
  guiControllers,
  registerFolder,
  unregisterFolder,
  applyControlSearch,
  scheduleShareUpdate: () => { shareDirty = true; debounceShare(); },
  updateRings: () => planet?.updateRings?.(),
  getIsApplyingPreset: () => isApplyingPreset,
  getRingsFolder: () => guiControllers?.folders?.ringsFolder
});

// Add ring settings to guiControllers
guiControllers.rebuildRingControls = rebuildRingControls;
guiControllers.normalizeRingSettings = normalizeRingSettings;

// Create Rings folder and controls
const ringsFolder = registerFolder(gui.addFolder("Rings"), { close: false });
guiControllers.folders = guiControllers.folders || {};
guiControllers.folders.ringsFolder = ringsFolder;

guiControllers.ringEnabled = ringsFolder.add(params, "ringEnabled")
  .name("Enable Rings")
  .onChange(() => {
    if (planet) {
      planet.updateRings();
      planet.updateTilt();
    }
    rebuildRingControls();
    shareDirty = true;
    debounceShare();
  });

guiControllers.ringCount = ringsFolder.add(params, "ringCount", 0, 10, 1)
  .name("Number of Rings")
  .onChange(() => {
    if (isApplyingPreset) return;
    
    // Get current planet size for proper ring scaling
    const planetSize = params.planetType === 'gas' 
      ? (params.gasPlanetSize || 2.0) 
      : (params.planetSize || 1.0);
    
    // Ensure rings array matches count
    while (params.rings.length < params.ringCount) {
      const index = params.rings.length;
      const minRingRadius = planetSize * 1.15;
      const baseStart = minRingRadius + (index * 0.25 * planetSize);
      const thickness = (0.15 + (Math.random() * 0.2)) * planetSize;
      
      params.rings.push({
        style: index % 2 === 0 ? "Texture" : "Noise",
        color: new THREE.Color().setHSL(
          (0.05 + index * 0.15) % 1,
          0.25 + Math.random() * 0.3,
          0.6 + Math.random() * 0.3
        ).getStyle(),
        start: baseStart,
        end: baseStart + thickness,
        opacity: 0.5 + Math.random() * 0.3,
        noiseScale: 2.5 + Math.random() * 2.0,
        noiseStrength: 0.4 + Math.random() * 0.4,
        spinSpeed: (0.02 + Math.random() * 0.08) * (index % 2 === 0 ? 1 : -1),
        brightness: 0.8 + Math.random() * 0.4
      });
    }
    while (params.rings.length > params.ringCount) {
      params.rings.pop();
    }
    rebuildRingControls();
    if (planet) {
      planet.updateRings();
    }
    shareDirty = true;
    debounceShare();
  });

guiControllers.ringAngle = ringsFolder.add(params, "ringAngle", -90, 90, 0.1)
  .name("Ring Tilt (degrees)")
  .onChange(() => {
    if (planet) {
      planet.updateTilt();
    }
    shareDirty = true;
    debounceShare();
  });

guiControllers.ringSpinSpeed = ringsFolder.add(params, "ringSpinSpeed", -1, 1, 0.01)
  .name("Global Ring Spin")
  .onChange(() => {
    shareDirty = true;
    debounceShare();
  });

setupPlanetControls({
    gui,
    params,
    guiControllers,
    registerFolder,
    scheduleShareUpdate: () => { shareDirty = true; debounceShare(); },
    markPlanetDirty: () => { planetDirty = true; },
    planet: null // Will be set after planet is created
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

if (debugPanel) {
  guiControllers.syncDebugMoonArtifacts();
  updateDebugVectors();
}
//#endregion

randomizeSeedButton?.addEventListener("click", () => {
  // "New Planet Shape" should regenerate the planet with a new seed
  // Randomize terrain parameters (not colors) and respect locks
  const nextSeed = generateSeed();
  params.seed = nextSeed;
  guiControllers.seed?.setValue?.(nextSeed);
  
  // Randomize terrain parameters only (not colors), respecting locks
  const locks = params.locks || {};
  
  if (!locks.seaLevel) params.seaLevel = Math.random() * 0.7 + 0.1; // 0.1 to 0.8
  if (!locks.continentSize) params.continentSize = Math.random() * 3.0 + 0.5; // 0.5 to 3.5
  if (!locks.mountainHeight) params.mountainHeight = Math.random(); // 0.0 to 1.0
  if (!locks.roughness) params.roughness = Math.random() * 0.6 + 0.2; // 0.2 to 0.8
  if (!locks.detail) {
    // Auto-scale detail with planet size if not locked
    params.detail = 3.0 + ((params.planetSize - 0.5) / 1.5) * 5.0;
  }
  if (!locks.iceCapThreshold) params.iceCapThreshold = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
  
  // For gas planets, randomize gas parameters
  if (params.planetType === 'gas') {
    if (!locks.gasStripeSpeed) params.gasStripeSpeed = Math.random() * 0.035;
    if (!locks.gasStripeFrequency) {
      // Auto-scale with planet size if not locked
      params.gasStripeFrequency = 1.0 + ((params.gasPlanetSize - 0.5) / 1.5) * 4.0;
    }
    if (!locks.gasStripeSharpness) params.gasStripeSharpness = Math.random() * 3.0 + 1.0;
    if (!locks.gasTurbulence) params.gasTurbulence = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
  }
  
  // Update planet with new parameters
  if (planet) {
    planet.applyParams(params);
  }
  
  // Update GUI controllers to reflect changes
  if (guiControllers.percentWrappers) {
    Object.keys(guiControllers.percentWrappers).forEach(key => {
      if (params.hasOwnProperty(key) && guiControllers.percentWrappers[key]) {
        // Trigger update by setting the value
        const wrapper = guiControllers.percentWrappers[key];
        wrapper.value = wrapper.value; // This will update the slider display
      }
    });
  }
  
  handleSeedChanged();
  // Clear saved ID and update URL with new share code
  currentShareId = null;
  currentHashIsApiId = false;
  scheduleShareUpdate();
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

surpriseMeMobileButton?.addEventListener("click", () => {
  try {
    surpriseMe();
    updateSeedDisplay();
    updateGravityDisplay();
    scheduleShareUpdate();
  } catch (e) {
    console.warn("Surprise Me (mobile) failed:", e);
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
    
    // Apply all preset values to params
    Object.keys(preset).forEach(key => {
      if (key !== 'moons') { // Handle moons separately
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
    
    // Rebuild ring controls if ring count changed
    if (guiControllers.rebuildRingControls) {
      guiControllers.rebuildRingControls();
    }
    
    // Update all planet components
    if (planet) {
      planet.applyParams(params);
      planet.updateRings();
      planet.updateTilt();
      planet.updateMoons();
    }
    
    // Update sun (done in render loop but apply params here)
    updateSeedDisplay();
    
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
    'DAWN', 'DUSK', 'TWILIGHT', 'SUNRISE', 'SUNSET', 'MIDNIGHT',
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
  if (sun && sun.light) {
    sun.light.intensity = Math.max(0, 1.6) * visualSettings.lightingScale;
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
  // Check both hash and query parameter for load ID
  const hash = window.location.hash.slice(1); // Remove the # symbol
  const loadParam = new URLSearchParams(window.location.search).get("load");
  const loadId = hash || loadParam;
  
  if (!loadId) return false;
  
  // Only try API if loadId looks like a short saved ID (nanoid-like)
  const isLikelyApiId = /^[A-Za-z0-9_-]{6,12}$/.test(loadId);
  currentHashIsApiId = isLikelyApiId;
  
  if (isLikelyApiId) {
    // Preserve hash URL and remember id, even if API fails
    currentShareId = loadId;
    // Don't change URL format - keep hash for better reload handling
    try {
      const configData = await loadConfigurationFromAPIExt(loadId);
      if (configData && configData.data) {
        currentShareId = configData.id || loadId;
        // Apply the loaded configuration
        const prevType = params.planetType;
        const prevSeed = params.seed;
        const data = configData.data || {};
        Object.keys(data).forEach(k => { params[k] = data[k]; });
        
        // Guard against GUI onChange side-effects while syncing controls
        isApplyingPreset = true;
        try {
          // Update all the UI elements and regenerate the planet
          if (planet) {
            planet.setPlanetType(params.planetType || 'earth');
            planet.applyParams(params);
          }
          if (sun) sun.updateSun();
          updateSeedDisplay();
          updateGravityDisplay();
          syncMoonSettings();
          if (prevType !== params.planetType) {
            markPlanetDirty();
          }
          // If seed changed, regenerate starfield and mark planet dirty
          if (prevSeed !== params.seed) {
            regenerateStarfield();
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
    } catch (apiError) {
      // Only log API errors if they're not "not found" errors
      if (!apiError.message || !apiError.message.includes('Configuration not found')) {
        console.warn('Failed to load configuration from API:', apiError);
      }
      // Fall through to try decoding as share code
    }
  }
  
  // Fallback: try to decode as direct share code (for both API failures and non-API hashes)
  try {
    const decoded = decodeShareExt(loadId);
      if (decoded) {
        const loadedData = decoded?.data ?? decoded;
        const prevType = params.planetType;
        const prevSeed = params.seed;
        
        // Handle moons if present
        let moonsFromShare = null;
        if (Array.isArray(decoded?.moons)) {
          moonsFromShare = decoded.moons.map((m) => ({ ...m }));
        }
        if (!moonsFromShare && Array.isArray(loadedData?.moons)) {
          moonsFromShare = loadedData.moons.map((m) => ({ ...m }));
          delete loadedData.moons;
        }
        if (moonsFromShare) {
          moonSettings.splice(0, moonSettings.length, ...moonsFromShare.map((m) => ({ ...m })));
          params.moonCount = moonsFromShare.length;
          if (loadedData && typeof loadedData === "object") {
            loadedData.moonCount = moonsFromShare.length;
          }
        }
        
        Object.keys(loadedData || {}).forEach(k => { params[k] = loadedData[k]; });
        
        isApplyingPreset = true;
        try {
          // Update all the UI elements and regenerate the planet
          if (planet) {
            planet.setPlanetType(params.planetType || 'earth');
            planet.applyParams(params);
          }
          if (sun) sun.updateSun();
          updateSeedDisplay();
          updateGravityDisplay();
          syncMoonSettings();
          if (prevType !== params.planetType) {
            markPlanetDirty();
          }
          // If seed changed, regenerate starfield and mark planet dirty
          if (prevSeed !== params.seed) {
            regenerateStarfield();
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
            const encoded = encodeShare({ version: SHARE_VERSION || 1, preset: params.preset, data: loadedData });
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
  
  return false;
}

// Helper to yield to browser for rendering between loading phases
function yieldToBrowser() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

// Update loading status display
function updateLoadingStatus(text) {
  const statusEl = document.getElementById('loading-status');
  if (statusEl) {
    if (text) {
      statusEl.textContent = text;
      statusEl.hidden = false;
    } else {
      statusEl.hidden = true;
    }
  }
}

async function initializeApp() {
  // Phase 1: Scene setup and background color (already done before this function)
  // Ensure dark background is visible
  scene.background = new THREE.Color(0x05070f);
  await yieldToBrowser();

  // Phase 2: Create and add starfield, render immediately
  updateLoadingStatus("Loading starfield...");
  const desiredCount = getStarfieldCount(params.starCount);
  if (desiredCount !== params.starCount) {
    params.starCount = desiredCount;
    guiControllers.starCount?.updateDisplay?.();
  }
  starField = createStarfieldExt({ 
    seed: params.seed, 
    count: desiredCount, 
    resolution: visualSettings?.noiseResolution ?? 1.0 
  });
  scene.add(starField);
  updateStarfieldUniforms();
  renderer.render(scene, camera);
  await yieldToBrowser();

  // Phase 3: Create planet object
  updateLoadingStatus("Loading planet...");
  planet = new Planet(scene, params, guiControllers);
  // Update planet reference in GUI controllers
  guiControllers.planet = planet;
  renderer.render(scene, camera);
  await yieldToBrowser();

  // Phase 4: Create sun with planet root
  updateLoadingStatus("Loading star...");
  sun = new Sun(scene, planet.planetRoot);
  renderer.render(scene, camera);
  await yieldToBrowser();

  // Phase 5: Initialize planet properties
  planet.applyParams(params);
  planet.updateRings();
  updateSeedDisplay();
  renderer.render(scene, camera);
  await yieldToBrowser();

  // Phase 6: Load configuration from hash (if present)
  const loadedFromHash = await initFromHash();
  if (!loadedFromHash) {
    // Apply default Earth-like preset
    planet.applyParams(params);
  }
  planet.updateRings();
  renderer.render(scene, camera);
  await yieldToBrowser();

  // Phase 7: Final setup
  setupMobilePanelToggle();
  applyInitialVisualSettings();
  if (previewMode) {
    try { applyVisualSettings(); } catch {}
  }
  applyControlSearch({ scrollToFirst: false });
  updateShareCode();
  
  renderer.render(scene, camera);
  await yieldToBrowser();

  // Hide status display
  updateLoadingStatus("");
}

initializeApp().then(() => {
  // All initialization is now handled in initializeApp() with progressive loading
  // Start animation loop
  renderer.domElement.addEventListener('dblclick', (event) => {
    if (!planet) return;
    
    const mouse = new THREE.Vector2();
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const moonMeshes = planet.moonsGroup?.children?.map(p => p.userData.mesh).filter(m => m) || [];
    const focusableObjects = [planet.planetMesh];
    if (sun?.sunVisual) focusableObjects.push(sun.sunVisual);
    focusableObjects.push(...moonMeshes);
    
    const intersects = raycaster.intersectObjects(focusableObjects, true);

    if (intersects.length > 0) {
      const planetHit = intersects.find(hit => hit.object === planet.planetMesh);
      if (planetHit) {
        enterWalkMode(planetHit, raycaster.ray.direction);
        return;
      }
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
  // Skip activeFocus when in FPS mode
  if (activeFocus && !isFpsMode) {
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

  // Only update OrbitControls when not in FPS mode
  if (!isFpsMode) {
    controls.update();
  } else if (fpsModeType === 'ship') {
    updateShipMovement(delta);
  } else if (fpsModeType === 'walk') {
    updateWalkMovement(delta);
  }

  if (planetDirty) {
    showLoading();
    planet.applyParams(params);
    planetDirty = false;
    hideLoadingSoon();
  }

  // Update sun and get direction
  if (sun) {
    sun.update();
    const sunDirection = sun.getDirection();
    if (planet) {
      planet.updateSunDirection(sunDirection);
    }
  }

  // Update planet with time
  const time = clock.getElapsedTime();
  if (planet) {
    planet.update(delta, time);
  }

  if (starField && starField.material && starField.material.uniforms) {
    starField.rotation.y += delta * 0.002;
    const uniforms = starField.material.uniforms;
    uniforms.uTime.value = timestamp * 0.001;
    uniforms.uBrightness.value = params.starBrightness;
    uniforms.uTwinkleSpeed.value = params.starTwinkleSpeed;
  }

  // Update ocean time
  if (planet?.oceanUniforms?.uTime) {
    planet.oceanUniforms.uTime.value = timestamp * 0.001;
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
        markPlanetDirty();
    }
    if (!skipShareUpdate) {
      scheduleShareUpdate();
    }
}
  
function updateSeedDisplay() {
    if (seedDisplay) seedDisplay.textContent = params.seed;
}
  
function updateGravityDisplay() {
    if (gravityDisplay) {
      const gravity = typeof params.gravity === 'number' && !Number.isNaN(params.gravity) 
        ? params.gravity 
        : 9.81; // Default to Earth gravity
      gravityDisplay.textContent = `${gravity.toFixed(2)} m/s^2`;
    }
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
    if (starField?.material?.uniforms?.uScale) {
      starField.material.uniforms.uScale.value = pixelRatio * height * 1.2;
    }
    if (window.innerWidth > 960) {
      closeMobilePanel(true);
    }
}
window.addEventListener("resize", onWindowResize);

// Keyboard input handlers for FPS mode
function handleKeyDown(event) {
  const key = event.key.toLowerCase();
  keys[key] = true;
  keys[event.code] = true;

  if (event.code === 'Space' && isFpsMode) {
    event.preventDefault();
    if (fpsModeType === 'ship') {
      if (fpsController.dashCooldown <= 0) {
        fpsController.dashBoost = 3.0;
        fpsController.dashDuration = 0.3; // 0.3 seconds dash
        fpsController.dashCooldown = 2.0; // 2 seconds cooldown
      }
    } else if (fpsModeType === 'walk') {
      if (walkController.onGround) {
        walkController.velocity.addScaledVector(walkController.up, walkController.jumpStrength);
        walkController.onGround = false;
      }
    }
  }

  if (key === 'v' && !event.repeat) {
    toggleFpsMode();
  }
}

function handleKeyUp(event) {
  const key = event.key.toLowerCase();
  keys[key] = false;
  keys[event.code] = false;
}

// Mouse look controls
let mouseX = 0;
let mouseY = 0;
let previousMouseX = 0;
let previousMouseY = 0;

function handleMouseMove(event) {
  if (!isFpsMode || !fpsController.isPointerLocked) return;

  const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
  const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

  if (fpsModeType === 'ship') {
    fpsController.yaw -= movementX * fpsController.mouseSensitivity;
    fpsController.pitch -= movementY * fpsController.mouseSensitivity;
    fpsController.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, fpsController.pitch));
  } else if (fpsModeType === 'walk') {
    walkController.yaw -= movementX * walkController.mouseSensitivity;
    walkController.pitch -= movementY * walkController.mouseSensitivity;
    walkController.pitch = THREE.MathUtils.clamp(
      walkController.pitch,
      -walkController.maxPitch,
      walkController.maxPitch
    );
  }
}

function requestPointerLock() {
  const canvas = renderer.domElement;
  if (canvas.requestPointerLock) {
    canvas.requestPointerLock();
  } else if (canvas.mozRequestPointerLock) {
    canvas.mozRequestPointerLock();
  } else if (canvas.webkitRequestPointerLock) {
    canvas.webkitRequestPointerLock();
  }
}

function onPointerLockChange() {
  const wasLocked = fpsController.isPointerLocked;
  fpsController.isPointerLocked = document.pointerLockElement === renderer.domElement ||
                                  document.mozPointerLockElement === renderer.domElement ||
                                  document.webkitPointerLockElement === renderer.domElement;

  if (wasLocked && !fpsController.isPointerLocked && isFpsMode) {
    exitFpsMode({ skipPointerLock: true });
  }
}

document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);
document.addEventListener('mousemove', handleMouseMove);
document.addEventListener('pointerlockchange', onPointerLockChange);
document.addEventListener('mozpointerlockchange', onPointerLockChange);
document.addEventListener('webkitpointerlockchange', onPointerLockChange);

function enterShipMode() {
  fpsModeType = 'ship';
  isFpsMode = true;
  controls.enabled = false;
  activeFocus = null;

  if (!ship) {
    createShip();
  }

  if (ship) {
    fpsController.position.copy(ship.position);
    ship.visible = false;

    camera.getWorldDirection(tempVec1);
    fpsController.yaw = Math.atan2(tempVec1.x, tempVec1.z);
    fpsController.pitch = Math.asin(-tempVec1.y);

    const euler = new THREE.Euler(fpsController.pitch, fpsController.yaw, 0, 'YXZ');
    camera.rotation.copy(euler);

    tempQuat1.setFromEuler(euler);
    tempVec2.set(0, 0.0005, 0.001).applyQuaternion(tempQuat1);
    camera.position.copy(fpsController.position).add(tempVec2);
  }

  const canvas = renderer.domElement;
  canvas.addEventListener('click', requestPointerLockOnClick, { once: true });
}

function enterWalkMode(hit, rayDirection) {
  if (!planet || !hit?.point) return;

  const planetCenter = getPlanetCenter(tempVec1);
  const hitDir = tempVec2.copy(hit.point).sub(planetCenter);
  if (hitDir.lengthSq() === 0) return;
  hitDir.normalize();

  const latitude = Math.asin(THREE.MathUtils.clamp(hitDir.y, -1, 1));
  const longitude = Math.atan2(hitDir.z, hitDir.x);

  let shareCode = null;
  try {
    const payload = buildSharePayload();
    shareCode = encodeShare(payload);
  } catch (error) {
    console.warn('Failed to build landing payload', error);
    return;
  }

  const destination = new URL('walk.html', window.location.href);
  destination.searchParams.set('share', shareCode);
  destination.searchParams.set('lat', latitude.toFixed(6));
  destination.searchParams.set('lon', longitude.toFixed(6));

  window.location.href = destination.toString();
}

function exitFpsMode(options = {}) {
  if (!isFpsMode) return;

  const { skipPointerLock = false, skipOrbitReset = false } = options;
  const previousMode = fpsModeType;

  isFpsMode = false;
  fpsModeType = 'ship';
  controls.enabled = true;

  if (!skipPointerLock) {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    } else if (document.mozExitPointerLock) {
      document.mozExitPointerLock();
    } else if (document.webkitExitPointerLock) {
      document.webkitExitPointerLock();
    }
  }

  if (previousMode === 'ship' && ship) {
    ship.visible = true;
  }

  if (previousMode === 'walk') {
    walkController.velocity.set(0, 0, 0);
    walkController.onGround = false;
  }

  if (!skipOrbitReset && planet && planet.planetRoot) {
    const planetRadius = getEffectivePlanetRadius();
    tempVec1.set(0, planetRadius * 2.5, planetRadius * 2.5);
    camera.position.copy(tempVec1);
    controls.target.set(0, 0, 0);
    controls.update();
  }
}

function toggleFpsMode() {
  if (isFpsMode) {
    exitFpsMode();
  } else {
    enterShipMode();
  }
}

function requestPointerLockOnClick() {
  requestPointerLock();
}

// Update ship movement in FPS mode
function updateShipMovement(delta) {
  if (!ship || !isFpsMode || !planet || fpsModeType !== 'ship') return;

  const planetCenter = getPlanetCenter(tempVec1);
  const distanceToPlanet = fpsController.position.distanceTo(planetCenter);
  const planetRadius = getEffectivePlanetRadius();

  let distanceSpeedMultiplier = 1.0;
  const closeDistance = planetRadius * 2.0;
  const farDistance = planetRadius * 10.0;

  if (distanceToPlanet < closeDistance) {
    const closeFactor = distanceToPlanet / closeDistance;
    distanceSpeedMultiplier = THREE.MathUtils.lerp(0.1, 0.5, closeFactor);
  } else if (distanceToPlanet < farDistance) {
    const t = (distanceToPlanet - closeDistance) / (farDistance - closeDistance);
    distanceSpeedMultiplier = THREE.MathUtils.lerp(0.5, 1.0, t);
  } else {
    distanceSpeedMultiplier = 1.0;
  }

  fpsController.speed = THREE.MathUtils.lerp(
    fpsController.minSpeed,
    fpsController.maxSpeed,
    distanceSpeedMultiplier
  );

  const euler = new THREE.Euler(fpsController.pitch, fpsController.yaw, 0, 'YXZ');
  const quaternion = new THREE.Quaternion().setFromEuler(euler);

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);

  const moveDirection = new THREE.Vector3();
  if (keys['z'] || keys['w']) {
    moveDirection.add(forward);
  }
  if (keys['s']) {
    moveDirection.sub(forward);
  }
  if (keys['q'] || keys['a']) {
    moveDirection.sub(right);
  }
  if (keys['d']) {
    moveDirection.add(right);
  }

  if (moveDirection.length() > 0) {
    moveDirection.normalize();
  }

  let speedMultiplier = 1.0;
  if (keys['shift']) {
    speedMultiplier = fpsController.accelerationMultiplier;
  } else if (keys['control'] || keys['ctrl']) {
    speedMultiplier = fpsController.slowMultiplier;
  }

  if (fpsController.dashDuration > 0) {
    speedMultiplier *= fpsController.dashBoost;
    fpsController.dashDuration -= delta;
    if (fpsController.dashDuration <= 0) {
      fpsController.dashBoost = 1.0;
    }
  }

  if (fpsController.dashCooldown > 0) {
    fpsController.dashCooldown -= delta;
  }

  const targetVelocity = moveDirection.multiplyScalar(fpsController.speed * speedMultiplier);
  fpsController.velocity.lerp(targetVelocity, delta * 10);

  fpsController.position.add(fpsController.velocity.clone().multiplyScalar(delta));

  ship.position.copy(fpsController.position);

  const cameraOffset = new THREE.Vector3(0, 0.005, 0.01).applyQuaternion(quaternion);
  camera.position.copy(fpsController.position).add(cameraOffset);

  camera.rotation.copy(euler);

  ship.rotation.y = fpsController.yaw;
  ship.rotation.x = fpsController.pitch + Math.PI / 2;
}

// Terrain height sampling functions (ported from GLSL shader)
// Simplified noise implementation for terrain height sampling
function permuteVec4(x, y, z, w) {
  return [
    ((x * 34.0 + 1.0) * x) % 289.0,
    ((y * 34.0 + 1.0) * y) % 289.0,
    ((z * 34.0 + 1.0) * z) % 289.0,
    ((w * 34.0 + 1.0) * w) % 289.0
  ];
}

function taylorInvSqrt(r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function snoise(v) {
  const C = [1.0 / 6.0, 1.0 / 3.0];
  const D = [0.0, 0.5, 1.0, 2.0];

  // First corner
  const dotSum = v[0] + v[1] + v[2];
  const i = [
    Math.floor(v[0] + dotSum * C[1]),
    Math.floor(v[1] + dotSum * C[1]),
    Math.floor(v[2] + dotSum * C[1])
  ];
  const iSum = i[0] + i[1] + i[2];
  const x0 = [
    v[0] - i[0] + iSum * C[0],
    v[1] - i[1] + iSum * C[0],
    v[2] - i[2] + iSum * C[0]
  ];

  // Other corners
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

  const x1 = [x0[0] - i1[0] + C[0], x0[1] - i1[1] + C[0], x0[2] - i1[2] + C[0]];
  const x2 = [x0[0] - i2[0] + 2.0 * C[0], x0[1] - i2[1] + 2.0 * C[0], x0[2] - i2[2] + 2.0 * C[0]];
  const x3 = [x0[0] - 1.0 + 3.0 * C[0], x0[1] - 1.0 + 3.0 * C[0], x0[2] - 1.0 + 3.0 * C[0]];

  // Permutations
  const iMod = [
    i[0] % 289.0,
    i[1] % 289.0,
    i[2] % 289.0
  ];

  const perm1 = permuteVec4(iMod[2], iMod[2] + i1[2], iMod[2] + i2[2], iMod[2] + 1.0);
  const perm2 = permuteVec4(
    perm1[0] + iMod[1], perm1[1] + iMod[1] + i1[1], perm1[2] + iMod[1] + i2[1], perm1[3] + iMod[1] + 1.0
  );
  const p = permuteVec4(
    perm2[0] + iMod[0], perm2[1] + iMod[0] + i1[0], perm2[2] + iMod[0] + i2[0], perm2[3] + iMod[0] + 1.0
  );

  // Gradients
  const n_ = 1.0 / 7.0;
  const ns = [
    n_ * D[3] - D[0],
    n_ * D[2] - D[1],
    n_ * D[1] - D[3]
  ];

  const j = p.map(val => val - 49.0 * Math.floor(val * ns[2] * ns[2]));
  const x_ = j.map(val => Math.floor(val * ns[2]));
  const y_ = j.map((val, idx) => Math.floor(val - 7.0 * x_[idx]));

  const x = x_.map((val, idx) => val * ns[0] + ns[1]);
  const y = y_.map((val, idx) => val * ns[0] + ns[1]);
  const h = [1.0 - Math.abs(x[0]) - Math.abs(y[0]), 1.0 - Math.abs(x[1]) - Math.abs(y[1]), 1.0 - Math.abs(x[2]) - Math.abs(y[2]), 1.0 - Math.abs(x[3]) - Math.abs(y[3])];

  const b0 = [x[0], x[1], y[0], y[1]];
  const b1 = [x[2], x[3], y[2], y[3]];

  const s0 = b0.map(val => Math.floor(val) * 2.0 + 1.0);
  const s1 = b1.map(val => Math.floor(val) * 2.0 + 1.0);
  const sh = h.map(val => val < 0 ? -1 : 0);

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

  const grad0 = [a0[0], a0[1], h[0]];
  const grad1 = [a0[2], a0[3], h[1]];
  const grad2 = [a1[0], a1[1], h[2]];
  const grad3 = [a1[2], a1[3], h[3]];

  // Normalize gradients
  const dot0 = dot3(grad0, grad0);
  const dot1 = dot3(grad1, grad1);
  const dot2 = dot3(grad2, grad2);
  const dot3_val = dot3(grad3, grad3);
  const norm = [
    taylorInvSqrt(dot0),
    taylorInvSqrt(dot1),
    taylorInvSqrt(dot2),
    taylorInvSqrt(dot3_val)
  ];

  grad0[0] *= norm[0]; grad0[1] *= norm[0]; grad0[2] *= norm[0];
  grad1[0] *= norm[1]; grad1[1] *= norm[1]; grad1[2] *= norm[1];
  grad2[0] *= norm[2]; grad2[1] *= norm[2]; grad2[2] *= norm[2];
  grad3[0] *= norm[3]; grad3[1] *= norm[3]; grad3[2] *= norm[3];

  // Mix final noise value
  const dotX0 = dot3(x0, x0);
  const dotX1 = dot3(x1, x1);
  const dotX2 = dot3(x2, x2);
  const dotX3 = dot3(x3, x3);

  const m = [
    Math.max(0.6 - dotX0, 0.0),
    Math.max(0.6 - dotX1, 0.0),
    Math.max(0.6 - dotX2, 0.0),
    Math.max(0.6 - dotX3, 0.0)
  ];
  const m2 = m.map(val => val * val);
  const m4 = m2.map(val => val * val);

  const dotP0 = dot3(grad0, x0);
  const dotP1 = dot3(grad1, x1);
  const dotP2 = dot3(grad2, x2);
  const dotP3 = dot3(grad3, x3);

  return 42.0 * (m4[0] * dotP0 + m4[1] * dotP1 + m4[2] * dotP2 + m4[3] * dotP3);
}

function fbm(p, octaves, persistence, lacunarity) {
  let amplitude = 1.0;
  let frequency = 1.0;
  let total = 0.0;
  let normalization = 0.0;

  for (let i = 0; i < octaves; i++) {
    const scaledP = [p[0] * frequency, p[1] * frequency, p[2] * frequency];
    total += amplitude * snoise(scaledP);
    normalization += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return total / normalization;
}

// Get terrain height displacement at a given position
// Position should be in planet-local space (before rotation)
function getTerrainHeightAtPosition(localPos) {
  if (!planet || !params) return 0.0;

  const continentSize = params.continentSize ?? 1.5;
  const mountainHeight = params.mountainHeight ?? 0.4;
  const roughness = params.roughness ?? 0.55;
  const detail = params.detail ?? 6.0;
  const seaLevel = params.seaLevel ?? 0.52;

  // Base continent shape (low frequency)
  const h = fbm([localPos[0] * continentSize, localPos[1] * continentSize, localPos[2] * continentSize], 8, roughness, detail);

  // Ridged mountain noise (adds detail to landmasses)
  let hm = fbm([localPos[0] * continentSize * 4.0, localPos[1] * continentSize * 4.0, localPos[2] * continentSize * 4.0], 4, roughness, detail * 1.5);
  hm = 1.0 - Math.abs(hm); // ridges
  hm = Math.pow(hm, 3.0);

  // Combine and normalize roughly to [0, 1]
  const finalHeight = (h * 0.6 + hm * 0.4) + 0.5;

  // Displacement
  // Only displace if above sea level to keep ocean flat-ish
  let displacement = 0.0;
  if (finalHeight > seaLevel) {
    displacement = (finalHeight - seaLevel) * mountainHeight * 0.3;
  }

  return displacement;
}

// Store previous planet rotation to calculate delta
let previousPlanetRotation = 0;

function updateWalkMovement(delta) {
  if (!isFpsMode || fpsModeType !== 'walk' || !planet) return;

  const planetCenter = getPlanetCenter(tempVec1);
  const baseRadius = getEffectivePlanetRadius();
  const planetRotation = planet.spinGroup ? planet.spinGroup.rotation.y : 0;
  
  // Rotate player with planet
  const rotationDelta = planetRotation - previousPlanetRotation;
  if (Math.abs(rotationDelta) > 1e-8) {
    const rotQuat = tempQuat1.setFromAxisAngle(WORLD_UP, rotationDelta);
    walkController.position.sub(planetCenter).applyQuaternion(rotQuat).add(planetCenter);
    walkController.velocity.applyQuaternion(rotQuat);
    walkController.yaw += rotationDelta;
  }
  previousPlanetRotation = planetRotation;
  
  // Get surface normal (radial direction from planet center)
  const toCenter = tempVec2.copy(walkController.position).sub(planetCenter);
  const currentDist = toCenter.length();
  if (currentDist < 1e-6) {
    toCenter.set(0, 1, 0);
  }
  const surfaceNormal = toCenter.normalize();
  
  // Sample terrain height
  const rotQuat = tempQuat1.setFromAxisAngle(WORLD_UP, -planetRotation);
  const localUp = tempVec3.copy(surfaceNormal).applyQuaternion(rotQuat);
  const terrainHeight = getTerrainHeightAtPosition([localUp.x, localUp.y, localUp.z]);
  const targetRadius = baseRadius + terrainHeight + walkController.eyeHeight;
  
  // Build tangent space basis (surface-aligned coordinate system)
  // North reference projected onto tangent plane
  const tangentNorth = tempVec4.set(0, 0, 1).projectOnPlane(surfaceNormal);
  if (tangentNorth.lengthSq() < 1e-6) {
    tangentNorth.set(1, 0, 0).projectOnPlane(surfaceNormal);
  }
  tangentNorth.normalize();
  
  const tangentEast = tempVec5.copy(surfaceNormal).cross(tangentNorth).normalize();
  
  // Apply yaw rotation in tangent space
  const yawQuat = tempQuat1.setFromAxisAngle(surfaceNormal, walkController.yaw);
  const tangentForward = tempVec6.copy(tangentNorth).applyQuaternion(yawQuat).normalize();
  const tangentRight = tempVec7.copy(tangentEast).applyQuaternion(yawQuat).normalize();
  
  // Movement input in tangent space
  const moveDirection = new THREE.Vector3();
  if (keys['z'] || keys['w']) moveDirection.add(tangentForward);
  if (keys['s']) moveDirection.sub(tangentForward);
  if (keys['q'] || keys['a']) moveDirection.sub(tangentRight);
  if (keys['d']) moveDirection.add(tangentRight);
  
  if (moveDirection.length() > 0) {
    moveDirection.normalize();
  }
  
  let speedMultiplier = 1.0;
  if (keys['shift']) {
    speedMultiplier = walkController.sprintMultiplier;
  } else if (keys['control'] || keys['ctrl']) {
    speedMultiplier = 0.5;
  }
  
  // Split velocity into tangent and radial
  const radialVel = walkController.velocity.dot(surfaceNormal);
  const tangentVel = new THREE.Vector3().copy(walkController.velocity).addScaledVector(surfaceNormal, -radialVel);
  
  // Apply movement
  const targetSpeed = walkController.speed * speedMultiplier;
  const accel = walkController.onGround ? walkController.groundAcceleration : walkController.airAcceleration;
  const lerpFactor = THREE.MathUtils.clamp(accel * delta, 0, 1);
  
  if (moveDirection.lengthSq() > 0) {
    const targetVel = moveDirection.multiplyScalar(targetSpeed);
    tangentVel.lerp(targetVel, lerpFactor);
  } else if (walkController.onGround) {
    const friction = Math.max(0, 1 - walkController.groundFriction * delta);
    tangentVel.multiplyScalar(friction);
  }
  
  // Apply gravity
  let newRadialVel = radialVel;
  if (walkController.onGround && currentDist <= targetRadius * 1.01) {
    // On ground - cancel radial velocity and stick to surface
    newRadialVel = 0;
    walkController.velocity.copy(tangentVel);
    
    // Apply movement
    walkController.position.addScaledVector(walkController.velocity, delta);
    
    // Snap to surface
    const correctedPos = tempVec2.copy(walkController.position).sub(planetCenter);
    correctedPos.setLength(targetRadius);
    walkController.position.copy(planetCenter).add(correctedPos);
    
  } else {
    // In air - apply gravity
    newRadialVel -= walkController.gravity * delta;
    walkController.velocity.copy(tangentVel).addScaledVector(surfaceNormal, newRadialVel);
    
    // Apply movement
    walkController.position.addScaledVector(walkController.velocity, delta);
    
    // Collision with surface
    const newToCenter = tempVec2.copy(walkController.position).sub(planetCenter);
    const newDist = newToCenter.length();
    
    if (newDist < targetRadius) {
      // Hit ground
      newToCenter.setLength(targetRadius);
      walkController.position.copy(planetCenter).add(newToCenter);
      walkController.onGround = true;
      
      // Cancel downward velocity
      const newNormal = newToCenter.normalize();
      const velDown = walkController.velocity.dot(newNormal);
      if (velDown < 0) {
        walkController.velocity.addScaledVector(newNormal, -velDown);
      }
    } else if (newDist < targetRadius * 1.05) {
      walkController.onGround = true;
    } else {
      walkController.onGround = false;
    }
  }
  
  // Build camera orientation: surface-aligned with pitch applied
  const finalSurfaceNormal = tempVec2.copy(walkController.position).sub(planetCenter).normalize();
  const finalTangentNorth = tempVec3.set(0, 0, 1).projectOnPlane(finalSurfaceNormal);
  if (finalTangentNorth.lengthSq() < 1e-6) {
    finalTangentNorth.set(1, 0, 0).projectOnPlane(finalSurfaceNormal);
  }
  finalTangentNorth.normalize();
  
  const finalYawQuat = tempQuat1.setFromAxisAngle(finalSurfaceNormal, walkController.yaw);
  const cameraForward = tempVec4.copy(finalTangentNorth).applyQuaternion(finalYawQuat);
  
  // Apply pitch around right axis
  const cameraRight = tempVec5.copy(finalSurfaceNormal).cross(cameraForward).normalize();
  const pitchQuat = tempQuat2.setFromAxisAngle(cameraRight, walkController.pitch);
  cameraForward.applyQuaternion(pitchQuat).normalize();
  
  // Rebuild right to stay orthogonal
  cameraRight.copy(cameraForward).cross(finalSurfaceNormal).normalize();
  
  // Set camera
  camera.position.copy(walkController.position);
  camera.up.copy(finalSurfaceNormal);
  
  const lookTarget = new THREE.Vector3().copy(walkController.position).add(cameraForward);
  camera.lookAt(lookTarget);
}

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
      // "New Planet Shape" - same as desktop randomize-seed button
      const nextSeed = generateSeed();
      params.seed = nextSeed;
      guiControllers.seed?.setValue?.(nextSeed);
      
      // Randomize terrain parameters only (not colors), respecting locks
      const locks = params.locks || {};
      
      if (!locks.seaLevel) params.seaLevel = Math.random() * 0.7 + 0.1;
      if (!locks.continentSize) params.continentSize = Math.random() * 3.0 + 0.5;
      if (!locks.mountainHeight) params.mountainHeight = Math.random();
      if (!locks.roughness) params.roughness = Math.random() * 0.6 + 0.2;
      if (!locks.detail) {
        params.detail = 3.0 + ((params.planetSize - 0.5) / 1.5) * 5.0;
      }
      if (!locks.iceCapThreshold) params.iceCapThreshold = Math.random() * 0.5 + 0.5;
      
      if (params.planetType === 'gas') {
        if (!locks.gasStripeSpeed) params.gasStripeSpeed = Math.random() * 0.035;
        if (!locks.gasStripeFrequency) {
          params.gasStripeFrequency = 1.0 + ((params.gasPlanetSize - 0.5) / 1.5) * 4.0;
        }
        if (!locks.gasStripeSharpness) params.gasStripeSharpness = Math.random() * 3.0 + 1.0;
        if (!locks.gasTurbulence) params.gasTurbulence = Math.random() * 0.5 + 0.5;
      }
      
      if (planet) {
        planet.applyParams(params);
      }
      
      if (guiControllers.percentWrappers) {
        Object.keys(guiControllers.percentWrappers).forEach(key => {
          if (params.hasOwnProperty(key) && guiControllers.percentWrappers[key]) {
            const wrapper = guiControllers.percentWrappers[key];
            wrapper.value = wrapper.value;
          }
        });
      }
      
      handleSeedChanged();
      // Clear saved ID and update URL with new share code
      currentShareId = null;
      currentHashIsApiId = false;
      scheduleShareUpdate();
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
      if (!code) {
        showNotification('Please enter a share code', 'error');
        return;
      }
      try {
        let loadedData = null;
        let loadedFromAPI = false;
        
        // Try API if code looks like an ID, else decode locally
        const isLikelyApiId = /^[A-Za-z0-9_-]{6,12}$/.test(code);
        if (isLikelyApiId) {
          try {
            const cfg = await loadConfigurationFromAPIExt(code);
            if (cfg?.data) {
              loadedData = cfg.data;
              loadedFromAPI = true;
              currentShareId = cfg.id || code;
              currentHashIsApiId = true;
            } else {
              throw new Error('No data in API response');
            }
          } catch (apiError) {
            console.warn('API load failed, trying as local code:', apiError);
            // Fall through to try as local code
          }
        }
        
        // If not loaded from API, try as local share code
        if (!loadedData) {
          try {
            const decoded = decodeShareExt(code);
            loadedData = decoded?.data ?? decoded;
            if (!loadedData) {
              throw new Error('Invalid share code format');
            }
            let moonsFromShare = null;
            if (Array.isArray(decoded?.moons)) {
              moonsFromShare = decoded.moons.map((m) => ({ ...m }));
            }

            if (!moonsFromShare && Array.isArray(loadedData?.moons)) {
              moonsFromShare = loadedData.moons.map((m) => ({ ...m }));
              delete loadedData.moons;
            }

            if (moonsFromShare) {
              moonSettings.splice(0, moonSettings.length, ...moonsFromShare.map((m) => ({ ...m })));
              params.moonCount = moonsFromShare.length;
              if (loadedData && typeof loadedData === "object") {
                loadedData.moonCount = moonsFromShare.length;
              }
            }

            currentShareId = null;
            currentHashIsApiId = false;
          } catch (decodeError) {
            throw new Error('Invalid share code. Please check the code and try again.');
          }
        }
        
        // Apply the loaded configuration
        const prevType = params.planetType;
        Object.keys(loadedData || {}).forEach(k => { params[k] = loadedData[k]; });
        if (prevType !== params.planetType) markPlanetDirty();
        
        // Apply
        isApplyingPreset = true;
        try {
          // Update all the UI elements and regenerate the planet
          if (planet) {
            planet.setPlanetType(params.planetType || 'earth');
            planet.applyParams(params);
          }
          if (sun) sun.updateSun();
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
        
        // Update URL
        try {
          if (currentShareId && currentHashIsApiId) {
            window.history.replaceState({}, '', `#${currentShareId}`);
          } else {
            const encoded = encodeShare({ version: 1, preset: params.preset, data: loadedData });
            window.history.replaceState({}, '', `#${encoded}`);
          }
        } catch {}
        
        scheduleShareUpdate();
        const source = loadedFromAPI ? 'API' : 'local code';
        showNotification(`✅ Planet loaded from ${source}!`);
        
        // Clear input
        if (importShareInput) importShareInput.value = '';
      } catch (e) {
        console.error('Import failed:', e);
        const errorMsg = e.message || 'Failed to load configuration';
        showNotification(errorMsg, 'error');
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

// Aurora removed


function scheduleShareUpdate() {
    shareDirty = true;
    debounceShare();
}

function updateShareCode() {
    const payload = buildSharePayload();
    const encoded = encodeShare(payload);

    if (shareDisplay) {
      if (currentShareId && currentHashIsApiId) {
        // Show API ID (short code)
        shareDisplay.textContent = currentShareId;
        shareDisplay.dataset.code = currentShareId;
        shareDisplay.title = `Saved! API code - Click \"Copy Share Code\" to copy\n${currentShareId}`;
      } else {
        // Show local code (formatted)
        const formatted = chunkCode(encoded, 5).join(" ");
        shareDisplay.textContent = formatted;
        shareDisplay.dataset.code = encoded;
        shareDisplay.title = `Local code - Click \"Copy Share Code\" to save to API\n${encoded}`;
      }
    }

    // Keep hash format for better reload handling
    try {
      if (currentShareId && currentHashIsApiId) {
        history.replaceState(null, "", `#${currentShareId}`);
      } else {
        history.replaceState(null, "", `#${encoded}`);
      }
    } catch {}
}

const SHARE_VERSION = 2;
const SHARE_EXCLUDED_KEYS = new Set(["rings"]);

function cloneShareValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (typeof value === "number" && Number.isNaN(value)) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => cloneShareValue(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const result = {};
    Object.keys(value).forEach((key) => {
      const cloned = cloneShareValue(value[key]);
      if (cloned !== undefined) {
        result[key] = cloned;
      }
    });
    return result;
  }
  return value;
}

function normalizeRingEntry(ring = {}) {
  const start = typeof ring.start === "number" && !Number.isNaN(ring.start) ? ring.start : 1.4;
  const end = typeof ring.end === "number" && !Number.isNaN(ring.end) ? ring.end : start + 0.2;
  return {
    style: typeof ring.style === "string" && ring.style ? ring.style : "Texture",
    color: typeof ring.color === "string" && ring.color ? ring.color : "#ffffff",
    start,
    end,
    opacity: typeof ring.opacity === "number" && !Number.isNaN(ring.opacity) ? ring.opacity : 0.6,
    noiseScale: typeof ring.noiseScale === "number" && !Number.isNaN(ring.noiseScale) ? ring.noiseScale : 3.2,
    noiseStrength: typeof ring.noiseStrength === "number" && !Number.isNaN(ring.noiseStrength) ? ring.noiseStrength : 0.55,
    spinSpeed: typeof ring.spinSpeed === "number" && !Number.isNaN(ring.spinSpeed) ? ring.spinSpeed : 0,
    brightness: typeof ring.brightness === "number" && !Number.isNaN(ring.brightness) ? ring.brightness : 1
  };
}

function normalizeMoonEntry(moon = {}) {
  return {
    size: typeof moon.size === "number" && !Number.isNaN(moon.size) ? moon.size : 0.18,
    distance: typeof moon.distance === "number" && !Number.isNaN(moon.distance) ? moon.distance : 3.5,
    orbitSpeed: typeof moon.orbitSpeed === "number" && !Number.isNaN(moon.orbitSpeed) ? moon.orbitSpeed : 0.4,
    inclination: typeof moon.inclination === "number" && !Number.isNaN(moon.inclination) ? moon.inclination : 0,
    color: typeof moon.color === "string" && moon.color ? moon.color : "#cfcfcf",
    phase: typeof moon.phase === "number" && !Number.isNaN(moon.phase) ? moon.phase : 0,
    eccentricity: typeof moon.eccentricity === "number" && !Number.isNaN(moon.eccentricity) ? moon.eccentricity : 0
  };
}

function collectShareData() {
  const data = {};

  Object.entries(params).forEach(([key, value]) => {
    if (SHARE_EXCLUDED_KEYS.has(key)) return;
    const cloned = cloneShareValue(value);
    if (cloned !== undefined) {
      data[key] = cloned;
    }
  });

  const hasRings = Array.isArray(params.rings);
  if (hasRings) {
    data.rings = params.rings.map((ring) => normalizeRingEntry(ring));
  }

  const normalizedMoons = Array.isArray(moonSettings)
    ? moonSettings.map((moon) => normalizeMoonEntry(moon))
    : [];

  if (Array.isArray(moonSettings)) {
    data.moons = normalizedMoons;
  }

  const moonCount = normalizedMoons.length;
  data.moonCount = typeof params.moonCount === "number" ? params.moonCount : moonCount;

  if (!Object.prototype.hasOwnProperty.call(data, "ringCount")) {
    data.ringCount = typeof params.ringCount === "number"
      ? params.ringCount
      : hasRings
        ? params.rings.length
        : 0;
  }

  return data;
}

function buildShareMetadata() {
  const metadata = {
    shareVersion: SHARE_VERSION,
    seed: params.seed,
    planetType: params.planetType
  };

  if (params.preset) metadata.preset = params.preset;
  const moonCount = Array.isArray(moonSettings) ? moonSettings.length : undefined;
  if (typeof moonCount === "number") metadata.moonCount = moonCount;
  if (typeof params.ringCount === "number") metadata.ringCount = params.ringCount;

  return metadata;
}

function buildSharePayload() {
    const data = collectShareData();
    return { version: SHARE_VERSION, preset: params.preset ?? null, data, metadata: buildShareMetadata() };
}

function encodeShare(payload) { return encodeShareExt(payload); }
function decodeShare(code) { return decodeShareExt(code); }

async function copyShareCode() {
  try {
    const payload = buildSharePayload();
    const shareCode = encodeShare(payload);
    const apiMetadata = {
      ...payload.metadata,
      savedAt: new Date().toISOString()
    };
    
    // Try to save to API first
    try {
      const result = await saveConfigurationToAPIExt(payload.data, apiMetadata);
      if (result && result.id) {
        // Update URL with API ID in hash format
        currentShareId = result.id;
        currentHashIsApiId = true;
        try { window.history.replaceState({}, '', `#${result.id}`); } catch {}
        if (shareDisplay) {
          shareDisplay.textContent = result.id;
          shareDisplay.title = `Saved! API code - Click to copy\n${result.id}`;
          shareDisplay.dataset.code = result.id;
        }
        
        // Copy to clipboard
        await navigator.clipboard.writeText(result.id);
        showNotification("✅ Planet saved! Code copied to clipboard.");
        scheduleShareUpdate();
        return;
      }
    } catch (apiError) {
      console.warn("Failed to save to API, using local code:", apiError);
      // Show a warning but still proceed with local code
      const errorMsg = apiError.message || 'API unavailable';
      console.warn("API save failed:", errorMsg);
    }
    
    // Fallback to local code (always works, even if API fails)
    currentShareId = null;
    currentHashIsApiId = false;
    try { 
      window.history.replaceState({}, '', `#${shareCode}`);
    } catch {}
    
    if (shareDisplay) {
      shareDisplay.textContent = chunkCode(shareCode, 5).join(" ");
      shareDisplay.title = `Local code (works offline) - Click to copy\n${shareCode}`;
      shareDisplay.dataset.code = shareCode;
    }
    
    // Copy to clipboard
    await navigator.clipboard.writeText(shareCode);
    showNotification("Share code copied to clipboard! (Local code - works offline)");
    scheduleShareUpdate();
    
  } catch (error) {
    console.error("Failed to copy share code:", error);
    showNotification("Failed to copy share code: " + (error.message || "Unknown error"), "error");
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
    if (sun && sun.light) {
      sun.light.intensity = Math.max(0, 1.6) * visualSettings.lightingScale;
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
    const pixelRatio = Math.min(window.devicePixelRatio * visualSettings.resolutionScale, 2);
    const height = sceneContainer?.clientHeight || window.innerHeight || 1080;
    uniforms.uBrightness.value = params.starBrightness;
    uniforms.uTwinkleSpeed.value = params.starTwinkleSpeed;
    uniforms.uPixelRatio.value = pixelRatio;
    if (uniforms.uScale) {
      uniforms.uScale.value = pixelRatio * height * 1.2;
    }
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
    // Generate new seed
    const newSeed = generateSeed();
    params.seed = newSeed;
    if (guiControllers.seed?.setValue) {
        guiControllers.seed.setValue(newSeed);
    }
    
    // Gas planets are rare (1/6 chance, like in planet.html)
    const isGasPlanet = Math.random() < 1 / 6;
    
    // Set planet type
    params.planetType = isGasPlanet ? 'gas' : 'earth';
    
    // Use the randomize functions from planetControls
    if (isGasPlanet && guiControllers.randomizeGasPlanet) {
        guiControllers.randomizeGasPlanet();
    } else if (!isGasPlanet && guiControllers.randomizeRockyPlanet) {
        guiControllers.randomizeRockyPlanet();
    }
    
    // Randomize rings (gas planets have higher chance)
    const ringChance = isGasPlanet ? 0.7 : 0.15;
    params.ringEnabled = Math.random() < ringChance;
    
    if (params.ringEnabled) {
        // Get planet size for proper ring scaling
        const planetSize = isGasPlanet ? (params.gasPlanetSize || 2.0) : (params.planetSize || 1.0);
        
        // More rings for gas giants
        const minRings = isGasPlanet ? 2 : 1;
        const maxRings = isGasPlanet ? 6 : 3;
        params.ringCount = Math.floor(Math.random() * (maxRings - minRings + 1)) + minRings;
        
        // Random ring angle
        params.ringAngle = THREE.MathUtils.lerp(-45, 45, Math.random());
        params.ringSpinSpeed = THREE.MathUtils.lerp(-0.05, 0.05, Math.random());
        
        // Generate rings with proper sizing
        params.rings = [];
        let lastRadius = planetSize * 1.15; // Start just outside planet
        
        for (let i = 0; i < params.ringCount; i++) {
            const gap = THREE.MathUtils.lerp(0.05, 0.15, Math.random()) * planetSize;
            const start = lastRadius + gap;
            const thickness = THREE.MathUtils.lerp(0.1, 0.4, Math.random()) * planetSize;
            const end = start + thickness;
            
            const hue = (0.05 + i * 0.12 + Math.random() * 0.1) % 1;
            const saturation = 0.2 + Math.random() * 0.3;
            const lightness = 0.5 + Math.random() * 0.4;
            
            params.rings.push({
                style: Math.random() > 0.5 ? "Texture" : "Noise",
                color: new THREE.Color().setHSL(hue, saturation, lightness).getStyle(),
                start: start,
                end: end,
                opacity: THREE.MathUtils.lerp(0.4, 0.9, Math.random()),
                noiseScale: THREE.MathUtils.lerp(2.0, 5.0, Math.random()),
                noiseStrength: THREE.MathUtils.lerp(0.3, 0.7, Math.random()),
                spinSpeed: THREE.MathUtils.lerp(-0.08, 0.08, Math.random()),
                brightness: THREE.MathUtils.lerp(0.7, 1.3, Math.random())
            });
            
            lastRadius = end;
        }
    } else {
        params.ringCount = 0;
        params.rings = [];
    }
    
    // Update GUI controllers for rings
    if (guiControllers.ringEnabled) guiControllers.ringEnabled.updateDisplay();
    if (guiControllers.ringCount) guiControllers.ringCount.updateDisplay();
    if (guiControllers.ringAngle) guiControllers.ringAngle.updateDisplay();
    if (guiControllers.ringSpinSpeed) guiControllers.ringSpinSpeed.updateDisplay();
    
    // Rebuild ring controls
    if (guiControllers.rebuildRingControls) {
        guiControllers.rebuildRingControls();
    }
    
    // Update planet
    if (planet) {
        planet.setPlanetType(params.planetType);
        planet.applyParams(params);
        planet.updateRings();
        planet.updateTilt();
    }
    
    // Update seed display
    updateSeedDisplay();
    
    // Clear saved ID and update URL with new share code
    currentShareId = null;
    currentHashIsApiId = false;
    handleSeedChanged();
    scheduleShareUpdate();
    
    return;
    
    // OLD CODE BELOW - keeping for reference but not used
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

    // Aurora randomization removed

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
    } catch {}

    normalizeMoonSettings();
    handleSeedChanged({ skipShareUpdate: true });
    // Removed: updatePalette, updateClouds (not in new shader-based Planet)
    sun.updateSun();
    planet.updateRings();
    planet.updateTilt();
    updateStarfieldUniforms();
    scheduleShareUpdate();
    
    // Force immediate URL update for surprise me to prevent loss on reload
    setTimeout(() => {
      if (shareDirty) {
        updateShareCode();
        shareDirty = false;
      }
    }, 200); // Slightly longer than debounce to ensure it runs after
}
