import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "lil-gui";
import { createNoise3D } from "simplex-noise";
import { exportFBX } from "./export/fbx-exporter.js";

//#region Utility functions
function debounce(fn, delay = 150) {
  let timer;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const debounceShare = debounce(() => {
  if (!shareDirty) return;
  updateShareCode();
  shareDirty = false;
}, 180);
class SeededRNG {
  constructor(seed) {
    if (typeof seed === "string") {
      this.state = hashString(seed);
    } else {
      this.state = seed >>> 0;
    }
    if (this.state === 0) {
      this.state = 0x1a2b3c4d;
    }
  }

  next() {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextFloat(min, max) {
    return min + this.next() * (max - min);
  }

  fork() {
    let nextSeed = Math.floor(this.next() * 0xffffffff) >>> 0;
    if (nextSeed === 0) nextSeed = 0x9e3779b9;
    return new SeededRNG(nextSeed);
  }
}

function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

//#endregion

//#region Scene and renderer setup
const sceneContainer = document.getElementById("scene");
const controlsContainer = document.getElementById("controls");
const loadingOverlay = document.getElementById("loading");
if (!sceneContainer) {
  throw new Error("Missing scene container element");
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
  depthWrite: false
});
const atmosphereMesh = new THREE.Mesh(new THREE.SphereGeometry(1.08, 64, 64), atmosphereMaterial);
atmosphereMesh.castShadow = false;
atmosphereMesh.receiveShadow = false;
spinGroup.add(atmosphereMesh);

const moonsGroup = new THREE.Group();
planetRoot.add(moonsGroup);

const orbitLinesGroup = new THREE.Group();
planetRoot.add(orbitLinesGroup);

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
  depthTest: false
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
  depthTest: false
});
const sunHalo = new THREE.Sprite(sunHaloMaterial);
sunHalo.renderOrder = 1;
sunGroup.add(sunHalo);

let starField = null;
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
  showOrbitLines: true
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
  "showOrbitLines"
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

const moonSettings = [];
const guiControllers = {};
const moonControlFolders = [];

let planetDirty = true;
let moonsDirty = true;
let shareDirty = true;
let simulationYears = 0;
let lastFrameTime = performance.now();
let isApplyingPreset = false;
let guiVisible = true;
let sunPulsePhase = 0;
//#endregion

//#region GUI setup
const gui = new GUI({ title: "Planet Controls", width: 320, container: controlsContainer || undefined });

const presetController = gui.add(params, "preset", Object.keys(presets)).name("Preset");
guiControllers.preset = presetController;

const planetFolder = gui.addFolder("Planet");
planetFolder.close();

guiControllers.seed = planetFolder
  .add(params, "seed")
  .name("Seed")
  .onFinishChange(() => {
    if (isApplyingPreset) return;
    handleSeedChanged();
  });

// ... (rest of code) ...

guiControllers.radius = planetFolder.add(params, "radius", 0.4, 4.2, 0.02)
    .name("Radius")
    .onFinishChange(() => {
      markPlanetDirty();
      markMoonsDirty();
      scheduleShareUpdate();
    });

guiControllers.subdivisions = planetFolder.add(params, "subdivisions", 2, 6, 1)
    .name("Surface Detail")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.noiseLayers = planetFolder.add(params, "noiseLayers", 1, 8, 1)
    .name("Noise Layers")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.noiseFrequency = planetFolder.add(params, "noiseFrequency", 0.3, 8, 0.05)
    .name("Noise Frequency")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.noiseAmplitude = planetFolder.add(params, "noiseAmplitude", 0, 1.4, 0.01)
    .name("Terrain Height")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.persistence = planetFolder.add(params, "persistence", 0.2, 0.9, 0.01)
    .name("Persistence")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.lacunarity = planetFolder.add(params, "lacunarity", 1.2, 3.8, 0.01)
    .name("Lacunarity")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.oceanLevel = planetFolder.add(params, "oceanLevel", 0, 0.95, 0.01)
    .name("Ocean Level")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

const paletteFolder = gui.addFolder("Palette");
paletteFolder.close();

guiControllers.colorOcean = paletteFolder.addColor(params, "colorOcean")
    .name("Deep Water")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.colorShallow = paletteFolder.addColor(params, "colorShallow")
    .name("Shallow Water")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.colorLow = paletteFolder.addColor(params, "colorLow")
    .name("Lowlands")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.colorMid = paletteFolder.addColor(params, "colorMid")
    .name("Highlands")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.colorHigh = paletteFolder.addColor(params, "colorHigh")
    .name("Peaks")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.atmosphereColor = paletteFolder.addColor(params, "atmosphereColor")
    .name("Atmosphere")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

guiControllers.cloudsOpacity = paletteFolder.add(params, "cloudsOpacity", 0, 1, 0.01)
    .name("Clouds")
    .onChange(() => {
      updateClouds();
      scheduleShareUpdate();
    });

const motionFolder = gui.addFolder("Motion");
motionFolder.close();

guiControllers.axisTilt = motionFolder.add(params, "axisTilt", 0, 45, 0.5)
    .name("Axis Tilt")
    .onChange(() => {
      updateTilt();
      scheduleShareUpdate();
    });

guiControllers.rotationSpeed = motionFolder.add(params, "rotationSpeed", 0, 0.7, 0.005)
    .name("Rotation Speed")
    .onChange(() => {
      scheduleShareUpdate();
    });

guiControllers.simulationSpeed = motionFolder.add(params, "simulationSpeed", 0, 2.5, 0.01)
    .name("Sim Speed")
    .onChange(() => {
      scheduleShareUpdate();
    });

const environmentFolder = gui.addFolder("Environment");
environmentFolder.close();

guiControllers.gravity = environmentFolder.add(params, "gravity", 0.1, 40, 0.1)
    .name("Gravity m/s^2")
    .onChange(() => {
      updateGravityDisplay();
      initMoonPhysics();
      scheduleShareUpdate();
    });

const sunFolder = environmentFolder.addFolder("Star");
sunFolder.close();

guiControllers.sunColor = sunFolder.addColor(params, "sunColor")
    .name("Color")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

guiControllers.sunIntensity = sunFolder.add(params, "sunIntensity", 0.2, 4, 0.05)
    .name("Intensity")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

guiControllers.sunDistance = sunFolder.add(params, "sunDistance", 10, 160, 1)
    .name("Distance")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

guiControllers.sunSize = sunFolder.add(params, "sunSize", 0.5, 4, 0.05)
    .name("Core Size")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

guiControllers.sunHaloSize = sunFolder.add(params, "sunHaloSize", 2, 18, 0.1)
    .name("Halo Radius")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

guiControllers.sunGlowStrength = sunFolder.add(params, "sunGlowStrength", 0.1, 3.5, 0.05)
    .name("Glow Strength")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

guiControllers.sunPulseSpeed = sunFolder.add(params, "sunPulseSpeed", 0, 2.5, 0.05)
    .name("Pulse Speed")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

const spaceFolder = environmentFolder.addFolder("Sky");
spaceFolder.close();

guiControllers.starCount = spaceFolder.add(params, "starCount", 500, 4000, 50)
    .name("Star Count")
    .onFinishChange(() => {
      params.starCount = Math.round(params.starCount);
      regenerateStarfield();
      scheduleShareUpdate();
    });

guiControllers.starBrightness = spaceFolder.add(params, "starBrightness", 0.2, 2, 0.01)
    .name("Brightness")
    .onChange(() => {
      updateStarfieldUniforms();
      scheduleShareUpdate();
    });

guiControllers.starTwinkleSpeed = spaceFolder.add(params, "starTwinkleSpeed", 0, 2.5, 0.01)
    .name("Twinkle Speed")
    .onChange(() => {
      updateStarfieldUniforms();
      scheduleShareUpdate();
    });

const moonsFolder = gui.addFolder("Moons");
moonsFolder.open();

guiControllers.moonCount = moonsFolder.add(params, "moonCount", 0, 5, 1)
    .name("Count")
    .onChange(() => {
      if (isApplyingPreset) return;
      syncMoonSettings();
      scheduleShareUpdate();
    });

guiControllers.showOrbitLines = moonsFolder.add(params, "showOrbitLines")
  .name("Show Orbit Lines")
  .onChange(() => {
    updateOrbitLinesVisibility();
    scheduleShareUpdate();
  });

const physicsFolder = gui.addFolder("Physics");
physicsFolder.close();

guiControllers.physicsEnabled = physicsFolder.add(params, "physicsEnabled")
  .name("Enable Physics")
  .onChange(() => {
    initMoonPhysics();
    scheduleShareUpdate();
  });

guiControllers.physicsTwoWay = physicsFolder.add(params, "physicsTwoWay")
  .name("Two-way Gravity")
  .onChange(() => {
    initMoonPhysics();
    scheduleShareUpdate();
  });

guiControllers.moonMassScale = physicsFolder.add(params, "moonMassScale", 0.1, 5, 0.05)
  .name("Moon Mass Scale")
  .onChange(() => {
    initMoonPhysics();
    scheduleShareUpdate();
  });

guiControllers.physicsDamping = physicsFolder.add(params, "physicsDamping", 0, 0.02, 0.0005)
  .name("Damping")
  .onChange(() => {
    scheduleShareUpdate();
  });

guiControllers.physicsSubsteps = physicsFolder.add(params, "physicsSubsteps", 1, 8, 1)
  .name("Substeps")
  .onChange(() => {
    scheduleShareUpdate();
  });

physicsFolder.add({ reset: () => resetMoonPhysics() }, "reset").name("Reset Orbits");

presetController.onChange((value) => {
  if (isApplyingPreset) return;
  applyPreset(value);
});
//#endregion
randomizeSeedButton?.addEventListener("click", () => {
  const nextSeed = generateSeed();
  params.seed = nextSeed;
  guiControllers.seed?.setValue?.(nextSeed);
  handleSeedChanged();
});

copyShareButton?.addEventListener("click", () => {
  const code = shareDisplay?.dataset?.code || "";
  if (!code) return;
  copyToClipboard(code).then(() => flashShareFeedback());
});

copyShareInlineButton?.addEventListener("click", () => {
  const code = shareDisplay?.dataset?.code || "";
  if (!code) return;
  copyToClipboard(code).then(() => flashShareFeedback());
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

//#region Initialization
const loadedFromHash = initFromHash();
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
normalizeMoonSettings();
regenerateStarfield();
updateStarfieldUniforms();
markPlanetDirty();
markMoonsDirty();
initMoonPhysics();
updateOrbitLinesVisibility();
updateShareCode();
requestAnimationFrame(animate);
//#endregion

//#region Animation loop
function animate(timestamp) {
  const delta = Math.min(1 / 15, (timestamp - lastFrameTime) / 1000 || 0);
  lastFrameTime = timestamp;
  const simulationDelta = delta * params.simulationSpeed;
  simulationYears += simulationDelta * 0.08;

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
      const speedMultiplier = Math.max(0.05, moon.orbitSpeed || 0.3);
      data.trueAnomaly = (data.trueAnomaly ?? (moon.phase ?? 0)) + baseSpeed * speedMultiplier * simulationDelta * gravityFactor;
      const angle = data.trueAnomaly;
      computeOrbitPosition(semiMajor, eccentricity, angle, mesh.position);
    });
    updateStabilityDisplay(moonSettings.length, moonSettings.length);
  }

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

  const cloudScale = params.radius * (1.01 + profile.cloudLift);
  const atmosphereScale = params.radius * (1.08 + profile.cloudLift * 0.75);
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

  sunGlow.userData.baseOpacity = THREE.MathUtils.clamp(glowStrength * 0.4, 0.05, 1.8);
  sunHalo.userData.baseOpacity = THREE.MathUtils.clamp(glowStrength * 0.25, 0.03, 1.2);
  sunGlow.material.opacity = sunGlow.userData.baseOpacity;
  sunHalo.material.opacity = sunHalo.userData.baseOpacity;
  sunPulsePhase = 0;
}

function updateMoons() {
  normalizeMoonSettings();

  while (moonsGroup.children.length > moonSettings.length) {
    const child = moonsGroup.children.pop();
    moonsGroup.remove(child);
  }

  while (moonsGroup.children.length < moonSettings.length) {
    const pivot = new THREE.Group();
    pivot.userData = { mesh: null, orbit: null, physics: null, trueAnomaly: 0 };
    moonsGroup.add(pivot);
  }

  while (orbitLinesGroup.children.length > moonSettings.length) {
    const orbit = orbitLinesGroup.children.pop();
    orbit.geometry.dispose();
    orbit.material.dispose();
  }

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

    updateOrbitLine(pivot.userData.orbit.geometry, moon);
    updateOrbitMaterial(pivot, true);
  });

  if (params.physicsEnabled) {
    initMoonPhysics();
  } else {
    updateStabilityDisplay(moonSettings.length, moonSettings.length);
  }
}

function createOrbitLine() {
  const segments = 128;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(segments * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0x88a1ff, transparent: true, opacity: 0.3, depthWrite: false });
  material.userData = { stableColor: new THREE.Color(0x88a1ff), unstableColor: new THREE.Color(0xff7666) };
  const line = new THREE.LineLoop(geometry, material);
  line.frustumCulled = false;
  return line;
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
}

const tmpVecA = new THREE.Vector3();
const tmpVecB = new THREE.Vector3();
const tmpVecC = new THREE.Vector3();
const tmpMatrix3 = new THREE.Matrix3();

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

function normalizeMoonSettings() {
  moonSettings.forEach((moon, index) => {
    if (typeof moon.size !== "number" || Number.isNaN(moon.size)) {
      moon.size = 0.18;
    }
    if (typeof moon.distance !== "number" || Number.isNaN(moon.distance)) {
      moon.distance = 3.5;
    }
    if (typeof moon.orbitSpeed !== "number" || Number.isNaN(moon.orbitSpeed)) {
      moon.orbitSpeed = 0.4;
    }
    if (typeof moon.inclination !== "number" || Number.isNaN(moon.inclination)) {
      moon.inclination = 0;
    }
    if (typeof moon.phase !== "number" || Number.isNaN(moon.phase)) {
      moon.phase = 0;
    }
    if (!moon.color) {
      moon.color = "#cfcfcf";
    }
    if (typeof moon.eccentricity !== "number" || Number.isNaN(moon.eccentricity)) {
      const rng = new SeededRNG(`${params.seed || "moon"}-ecc-${index}`);
      moon.eccentricity = THREE.MathUtils.lerp(0.02, 0.35, rng.next());
    }
    moon.eccentricity = THREE.MathUtils.clamp(moon.eccentricity, 0, 0.95);
    moon.phase = ((moon.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  });
}

function syncMoonSettings() {
  while (moonSettings.length < params.moonCount) {
    moonSettings.push(createDefaultMoon(moonSettings.length));
  }
  while (moonSettings.length > params.moonCount) {
    moonSettings.pop();
  }
  normalizeMoonSettings();
  rebuildMoonControls();
  markMoonsDirty();
}

function rebuildMoonControls() {
  moonControlFolders.splice(0, moonControlFolders.length).forEach((folder) => folder.destroy());
  moonSettings.forEach((moon, index) => {
    const folder = gui.addFolder(`Moon ${index + 1}`);
    folder
      .add(moon, "size", 0.05, 0.9, 0.01)
      .name("Size (radii)")
      .onChange(() => {
        markMoonsDirty();
        scheduleShareUpdate();
      });
    folder
      .add(moon, "distance", 1.5, 20, 0.1)
      .name("Distance")
      .onChange(() => {
        markMoonsDirty();
        scheduleShareUpdate();
      });
    folder
      .add(moon, "orbitSpeed", 0, 2, 0.01)
      .name("Orbit Speed")
      .onChange(() => {
        scheduleShareUpdate();
      });
    folder
      .add(moon, "inclination", -45, 45, 0.5)
      .name("Inclination")
      .onChange(() => {
        markMoonsDirty();
        scheduleShareUpdate();
      });
    folder
      .addColor(moon, "color")
      .name("Color")
      .onChange(() => {
        markMoonsDirty();
        scheduleShareUpdate();
      });
    folder
      .add(moon, "eccentricity", 0, 0.95, 0.01)
      .name("Eccentricity")
      .onChange(() => {
        markMoonsDirty();
        scheduleShareUpdate();
      });
    folder
      .add(moon, "phase", 0, Math.PI * 2, 0.01)
      .name("Phase")
      .onChange(() => {
        markMoonsDirty();
        scheduleShareUpdate();
      });
    moonControlFolders.push(folder);
  });
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

function initFromHash() {
  if (!window.location.hash) return false;
  const code = window.location.hash.slice(1).trim();
  if (!code) return false;
  try {
    const payload = decodeShare(code);
    if (!payload) return false;
    applySharePayload(payload);
    return true;
  } catch (err) {
    console.warn("Failed to load share code", err);
  }
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
  const payload = buildSharePayload();
  const encoded = encodeShare(payload);
  const formatted = chunkCode(encoded, 5).join(" ");
  if (shareDisplay) {
    shareDisplay.textContent = formatted;
    shareDisplay.dataset.code = encoded;
  }
  history.replaceState(null, "", `#${encoded}`);
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

function createDefaultMoon(index = 0) {
  const basePhase = (index / Math.max(1, params.moonCount || 1)) * Math.PI * 2;
  const rng = new SeededRNG(`${params.seed || "moon"}-${index}`);
  const color = new THREE.Color().setHSL(
    (0.5 + rng.next() * 0.3) % 1,
    0.15 + rng.next() * 0.35,
    0.5 + rng.next() * 0.3
  );
  return {
    size: THREE.MathUtils.lerp(0.08, 0.36, rng.next()),
    distance: THREE.MathUtils.lerp(2.4, 11.5, rng.next()),
    orbitSpeed: THREE.MathUtils.lerp(0.2, 0.75, rng.next()),
    inclination: THREE.MathUtils.lerp(-25, 25, rng.next()),
    color: color.getStyle(),
    phase: basePhase + rng.next() * Math.PI * 2,
    eccentricity: THREE.MathUtils.lerp(0.02, 0.4, rng.next())
  };
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
    const velWorld = velLocal.applyMatrix3(rotMatrix);

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
  });

  updateStabilityDisplay(moonSettings.length, moonSettings.length);
}

function resetMoonPhysics() {
  initMoonPhysics();
}

function stepMoonPhysics(dt) {
  if (!params.physicsEnabled) return;
  const substeps = Math.max(1, Math.round(params.physicsSubsteps || 1));
  const h = dt / substeps;
  const planetMass = getPlanetMass();
  const planetVel = planetRoot.userData.planetVel || new THREE.Vector3();
  const damping = Math.max(0, 1 - params.physicsDamping);

  for (let s = 0; s < substeps; s += 1) {
    const planetWorld = planetRoot.getWorldPosition(tmpVecB);

    moonsGroup.children.forEach((pivot, index) => {
      const phys = pivot.userData.physics;
      const mesh = pivot.userData.mesh;
      const moon = moonSettings[index];
      if (!phys || !mesh || !moon) return;

      phys.mu = getGravParameter(planetMass, params.physicsTwoWay ? phys.mass : 0);

      const acc = computeAccelerationTowards(planetWorld, phys.posWorld, phys.mu, tmpVecA);
      phys.posWorld.addScaledVector(phys.velWorld, h).addScaledVector(acc, 0.5 * h * h);

      const nextAcc = computeAccelerationTowards(planetWorld, phys.posWorld, phys.mu, tmpVecC);
      phys.velWorld.addScaledVector(acc.add(nextAcc).multiplyScalar(0.5 * h));
      if (params.physicsDamping > 0) {
        phys.velWorld.multiplyScalar(damping);
      }

      if (params.physicsTwoWay) {
        const planetAcc = nextAcc.multiplyScalar(-phys.mass / Math.max(1e-6, planetMass));
        planetVel.addScaledVector(planetAcc, h);
      }

      pivot.updateMatrixWorld(true);
      mesh.position.copy(pivot.worldToLocal(phys.posWorld.clone()));

      const rVec = tmpVecA.copy(phys.posWorld).sub(planetWorld);
      const dist = Math.max(1e-5, rVec.length());
      const speedSq = phys.velWorld.lengthSq();
      phys.energy = 0.5 * speedSq - phys.mu / dist;
      phys.bound = phys.energy < 0 && dist < params.radius * 140;
      updateOrbitMaterial(pivot, phys.bound);
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


