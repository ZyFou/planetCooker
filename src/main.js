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
import { setupRingControls } from "./app/gui/ringControls.js";
import { createStarfield as createStarfieldExt, createSunTexture as createSunTextureExt } from "./app/stars.js";
import { generateRingTexture as generateRingTextureExt, generateAnnulusTexture as generateAnnulusTextureExt, generateGasGiantTexture as generateGasGiantTextureExt } from "./app/textures.js";
import { encodeShare as encodeShareExt, decodeShare as decodeShareExt, padBase64 as padBase64Ext, saveConfigurationToAPI as saveConfigurationToAPIExt, loadConfigurationFromAPI as loadConfigurationFromAPIExt } from "./app/shareCore.js";
import { initOnboarding, showOnboarding } from "./app/onboarding.js";

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
  // Allow CSS class changes to apply before measuring (2 frames for safety)
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
            // Force viewport-sized canvas in photo mode
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            canvas.style.maxWidth = `${width}px`;
            canvas.style.maxHeight = `${height}px`;
          } else {
            // Clear overrides so canvas conforms to container
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
  if (previewMode) return; // no photo mode in embed
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
  // Temporary workaround: reload to fully reset layout sizing
  setTimeout(() => {
    try { window.location.reload(); } catch {}
  }, 0);
}

function togglePhotoMode() {
  if (isPhotoMode) enterUiMode(); else enterPhotoMode();
}

function enterUiMode() {
  exitPhotoMode();
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
    // Force one render to be safe
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

// Position photo buttons relative to the actual canvas bounds (desktop only)
function positionPhotoButtons() {
  if (!renderer || !renderer.domElement) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const isMobile = isMobileLayout();

  // Toggle button
  if (photoToggleButton) {
    if (isMobile) {
      // Let CSS handle mobile placement
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
  
  // Shutter button
  if (photoShutterButton) {
    if (isMobile) {
      // Let CSS handle mobile placement
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

// Keep positions updated
window.addEventListener("resize", positionPhotoButtons);
// Initial position after first render/layout
requestAnimationFrame(() => positionPhotoButtons());

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

// Rings holder (follows tilt but not planet spin)
const ringGroup = new THREE.Group();
tiltGroup.add(ringGroup);
let ringMeshes = [];
let ringTextures = [];

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

// Core sphere (solid collision object)
const coreGeometry = new THREE.SphereGeometry(1, 16, 16);
const coreMaterial = new THREE.MeshStandardMaterial({
  color: 0x8b4513, // Default brown color
  roughness: 0.8,
  metalness: 0.2,
  transparent: false, // Solid material
  opacity: 1, // Always solid when visible
  flatShading: false
});
const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
coreMesh.castShadow = true;
coreMesh.receiveShadow = true;
coreMesh.userData = { isCore: true };
spinGroup.add(coreMesh);

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

// Ocean sphere (transparent water layer) and shoreline foam overlay
const oceanMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0x1b3c6d),
  transparent: true,
  opacity: 0.6,
  roughness: 0.35,
  metalness: 0.02,
  transmission: 0.7,
  thickness: 0.2,
  ior: 1.333,
  depthWrite: false
});
const oceanMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 128, 128), oceanMaterial);
oceanMesh.castShadow = false;
oceanMesh.receiveShadow = false;
oceanMesh.renderOrder = 1;
spinGroup.add(oceanMesh);

const foamMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 1.0,
  depthWrite: false
});
let foamTexture = null;
const foamMesh = new THREE.Mesh(new THREE.SphereGeometry(1.002, 128, 128), foamMaterial);
foamMesh.castShadow = false;
foamMesh.receiveShadow = false;
foamMesh.renderOrder = 2;
spinGroup.add(foamMesh);

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

const planetOrbitState = {
  initialPosition: planetSystem.position.clone(),
  velocity: new THREE.Vector3(),
  lastEnabled: false
};
planetSystem.userData.orbitVel = planetOrbitState.velocity;

const planetMotionScratch = {
  toSun: new THREE.Vector3(),
  radial: new THREE.Vector3(),
  reference: new THREE.Vector3(),
  right: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  tangent: new THREE.Vector3()
};

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

const starCoreUniforms = {
  uColorCore: { value: new THREE.Color(0xffd27f) },
  uColorEdge: { value: new THREE.Color(0xffa060) },
  uTime: { value: 0 },
  uNoiseScale: { value: 1.6 },
  uNoiseStrength: { value: 0.4 },
  uPulse: { value: 0 }
};

const starCoronaUniforms = {
  uColor: { value: new THREE.Color(0xffa060) },
  uTime: { value: 0 },
  uNoiseScale: { value: 1.2 },
  uNoiseStrength: { value: 0.5 },
  uPulse: { value: 0 }
};

const starCoreVertexShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  void main() {
    vPosition = position;
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const starCoreFragmentShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  uniform vec3 uColorCore;
  uniform vec3 uColorEdge;
  uniform float uTime;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform float uPulse;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
      float h = hash(p * frequency + uTime * 0.6);
      value += amplitude * (h * 2.0 - 1.0);
      frequency *= 1.9;
      amplitude *= 0.55;
      p += vec3(17.0, 9.0, 23.0);
    }
    return value;
  }

  void main() {
    float r = length(vPosition);
    float base = pow(smoothstep(1.0, 0.0, r), 1.6);
    float turbulence = fbm(normalize(vNormal) * uNoiseScale + uTime * 0.25);
    float intensity = base + uNoiseStrength * turbulence + uPulse;
    intensity = clamp(intensity, 0.0, 1.4);
    vec3 color = mix(uColorEdge, uColorCore, clamp(intensity, 0.0, 1.0));
    gl_FragColor = vec4(color, clamp(intensity, 0.2, 1.0));
  }
`;

const starCoronaVertexShader = `
  varying vec3 vPosition;
  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const starCoronaFragmentShader = `
  varying vec3 vPosition;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform float uPulse;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(4.898, 7.23, 3.17))) * 43758.5453);
  }

  float turbulence(vec3 p) {
    float sum = 0.0;
    float scale = 1.0;
    for (int i = 0; i < 3; i++) {
      sum += abs(hash(p * scale + uTime * 0.4) * 2.0 - 1.0) / scale;
      scale *= 2.2;
    }
    return sum;
  }

  void main() {
    float radius = length(vPosition);
    float rim = smoothstep(1.0, 0.2, radius);
    float t = turbulence(normalize(vPosition) * uNoiseScale) * uNoiseStrength;
    float alpha = clamp(rim * (0.65 + t + uPulse), 0.0, 1.0);
    if (alpha <= 0.001) discard;
    vec3 color = uColor * (0.6 + 0.4 * rim);
    gl_FragColor = vec4(color, alpha);
  }
`;

const blackHoleDiskUniforms = {
  uColor: { value: new THREE.Color(0xffb378) },
  uInnerRadius: { value: 0.6 },
  uOuterRadius: { value: 2.4 },
  uFeather: { value: 0.25 },
  uIntensity: { value: 1.5 },
  uScale: { value: 1 },
  uNoiseScale: { value: 1.0 },
  uNoiseStrength: { value: 0.25 }
};

const blackHoleHaloUniforms = {
  uColor: { value: new THREE.Color(0xffd6a6) },
  uInnerRadius: { value: 1.2 },
  uOuterRadius: { value: 3.1 },
  uFeather: { value: 0.35 },
  uIntensity: { value: 0.9 },
  uScale: { value: 1 },
  uNoiseScale: { value: 1.0 },
  uNoiseStrength: { value: 0.35 }
};

const blackHoleDiskVertexShader = `
  varying vec2 vLocalPos;
  varying vec3 vWorldPos;
  void main() {
    vLocalPos = position.xy;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const blackHoleDiskFragmentShader = `
  varying vec2 vLocalPos;
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uFeather;
  uniform float uIntensity;
  uniform float uScale;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(13.9898, 78.233, 37.719))) * 43758.5453);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.6;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
      value += amplitude * (hash(p * frequency) * 2.0 - 1.0);
      frequency *= 2.1;
      amplitude *= 0.55;
      p += vec3(17.0, 9.0, 13.0);
    }
    return value;
  }

  void main() {
    float radius = length(vLocalPos) * uScale;
    float inner = max(0.0, uInnerRadius);
    float outer = max(inner + 0.0001, uOuterRadius);
    float feather = max(0.0001, uFeather);

    float innerEdge = smoothstep(inner - feather, inner, radius);
    float outerEdge = 1.0 - smoothstep(outer, outer + feather, radius);
    float band = clamp(innerEdge * outerEdge, 0.0, 1.0);

    if (band <= 0.0001) discard;

    float t = clamp((radius - inner) / max(0.0001, outer - inner), 0.0, 1.0);
    float baseBrightness = mix(1.3, 0.35, t) * uIntensity;

    vec3 coord = normalize(vWorldPos) * uNoiseScale;
    float turbulence = fbm(coord) * uNoiseStrength;

    vec3 color = uColor * (baseBrightness + turbulence);
    float alpha = band * clamp(uIntensity + turbulence * 0.5, 0.0, 1.4);
    gl_FragColor = vec4(color, alpha);
  }
`;

const blackHoleHaloFragmentShader = `
  varying vec2 vLocalPos;
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uFeather;
  uniform float uIntensity;
  uniform float uScale;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(4.898, 7.23, 3.17))) * 43758.5453);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.6;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
      value += amplitude * (hash(p * frequency) * 2.0 - 1.0);
      frequency *= 2.1;
      amplitude *= 0.55;
      p += vec3(11.0, 5.0, 19.0);
    }
    return value;
  }

  void main() {
    float radius = length(vLocalPos) * uScale;
    float inner = max(0.0, uInnerRadius);
    float outer = max(inner + 0.0001, uOuterRadius);
    float feather = max(0.0001, uFeather);

    float core = smoothstep(inner - feather, inner, radius);
    float halo = 1.0 - smoothstep(outer - feather, outer + feather, radius);
    float band = clamp(core * halo, 0.0, 1.0);

    if (band <= 0.0001) discard;

    vec3 coord = normalize(vWorldPos) * uNoiseScale;
    float turbulence = fbm(coord) * uNoiseStrength;

    float heightFade = exp(-abs(vLocalPos.y) * 1.2);
    float brightness = (0.6 + 0.6 * heightFade + turbulence) * uIntensity;
    vec3 color = uColor * brightness;
    float alpha = band * clamp(uIntensity + turbulence * 0.4, 0.0, 1.2);
    gl_FragColor = vec4(color, alpha);
  }
`;

const sunCoreGeometry = new THREE.IcosahedronGeometry(1, 4);
const sunCoreMaterial = new THREE.ShaderMaterial({
  uniforms: starCoreUniforms,
  vertexShader: starCoreVertexShader,
  fragmentShader: starCoreFragmentShader,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false
});
const sunVisual = new THREE.Mesh(sunCoreGeometry, sunCoreMaterial);
sunVisual.frustumCulled = false;
sunGroup.add(sunVisual);

const sunCoronaGeometry = new THREE.IcosahedronGeometry(1.2, 3);
const sunCoronaMaterial = new THREE.ShaderMaterial({
  uniforms: starCoronaUniforms,
  vertexShader: starCoronaVertexShader,
  fragmentShader: starCoronaFragmentShader,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false
});
const sunCorona = new THREE.Mesh(sunCoronaGeometry, sunCoronaMaterial);
sunCorona.frustumCulled = false;
sunGroup.add(sunCorona);

const blackHoleGroup = new THREE.Group();
blackHoleGroup.name = "BlackHoleGroup";
blackHoleGroup.visible = false;
sunGroup.add(blackHoleGroup);

const blackHoleOrientationGroup = new THREE.Group();
const blackHoleSpinGroup = new THREE.Group();
blackHoleGroup.add(blackHoleOrientationGroup);
blackHoleOrientationGroup.add(blackHoleSpinGroup);

const blackHoleCoreMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.FrontSide, toneMapped: false });
const blackHoleCore = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), blackHoleCoreMaterial);
blackHoleCore.castShadow = false;
blackHoleCore.receiveShadow = false;
blackHoleCore.renderOrder = 2;
blackHoleSpinGroup.add(blackHoleCore);

const blackHoleDiskGeometry = new THREE.CircleGeometry(1, 256);
const blackHoleDiskMaterial = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.clone(blackHoleDiskUniforms),
  vertexShader: blackHoleDiskVertexShader,
  fragmentShader: blackHoleDiskFragmentShader,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false
});
const blackHoleDisk = new THREE.Mesh(blackHoleDiskGeometry, blackHoleDiskMaterial);
blackHoleDisk.rotation.x = Math.PI / 2;
blackHoleDisk.renderOrder = 3;
blackHoleSpinGroup.add(blackHoleDisk);

const blackHoleHaloGeometry = new THREE.CircleGeometry(1, 256);
const blackHoleHaloMaterial = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.clone(blackHoleHaloUniforms),
  vertexShader: blackHoleDiskVertexShader,
  fragmentShader: blackHoleHaloFragmentShader,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false
});
const blackHoleHalo = new THREE.Mesh(blackHoleHaloGeometry, blackHoleHaloMaterial);
blackHoleHalo.rotation.y = Math.PI / 2;
blackHoleHalo.renderOrder = 4;
blackHoleSpinGroup.add(blackHoleHalo);

const blackHoleHaloSecondary = blackHoleHalo.clone();
blackHoleHaloSecondary.material = blackHoleHaloMaterial.clone();
blackHoleHaloSecondary.rotation.y = -Math.PI / 2;
blackHoleSpinGroup.add(blackHoleHaloSecondary);

const blackHoleHaloMaterials = [blackHoleHaloMaterial, blackHoleHaloSecondary.material];

// Optional basic materials/textures when using Texture style
let blackHoleDiskBasicMaterial = null;
let blackHoleDiskTexture = null;
let blackHoleHaloBasicMaterial = null;
let blackHoleHaloSecondaryBasicMaterial = null;
let blackHoleHaloTexture = null;

let starParticleState = {
  points: null,
  geometry: null,
  material: null,
  texture: null,
  positions: null,
  velocities: null,
  life: null,
  maxLife: null,
  rng: null,
  count: 0,
  speed: 0.6,
  baseLifetime: 3.5,
  color: "#ffd27f"
};

const blackHoleState = {
  lastCoreSize: null,
  lastDiskRadius: null,
  lastDiskThickness: null,
  lastDiskIntensity: null,
  lastDiskTilt: null,
  lastDiskYaw: null,
  lastDiskNoiseScale: null,
  lastDiskNoiseStrength: null,
  lastHaloRadius: null,
  lastHaloAngle: null,
  lastHaloThickness: null,
  lastHaloIntensity: null,
  lastHaloNoiseScale: null,
  lastHaloNoiseStrength: null,
  baseTwist: 0,
  spinAngle: 0,
  haloSpinAngle: 0,
  lastColor: new THREE.Color()
};

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

// Debug: Check if desktop menu buttons exist
console.log("Desktop menu buttons:", {
  desktopCopy: !!desktopCopy,
  desktopHelp: !!desktopHelp,
  desktopVisualSettings: !!desktopVisualSettings,
  desktopHome: !!desktopHome,
  copyShareButton: !!copyShareButton,
  helpButton: !!helpButton,
  returnHomeButton: !!returnHomeButton
});
const mobileFocusToggle = document.getElementById("mobile-focus-toggle");
const mobileFocusMenu = document.getElementById("mobile-focus-menu");
const focusMoonsContainer = document.getElementById("focus-moons-container");
//#endregion

//#region Visual Settings
const visualSettings = {
  frameRate: "unlimited", // "unlimited", "60", "30", "24", "15"
  resolutionScale: 1.0, // 0.25 to 2.0
  lightingScale: 1.0, // 0.1 to 2.0
  particleMax: 1000, // clamps sun and explosion particles
  noiseResolution: 1.0, // texture/noise resolution multiplier (0.25 - 2.0)
  gasResolution: 1.0, // gas giant texture + mesh detail (0.25 - 2.0)
  starMax: 4000, // clamps starfield population
  ringDetail: 1.0 // multiplier for ring geometry resolution
};

const VISUAL_SETTING_PRESETS = {
  ultra: {
    frameRate: "unlimited",
    resolutionScale: 2.0,
    lightingScale: 1.2,
    particleMax: 2000,
    noiseResolution: 2.0,
    gasResolution: 2.0,
    starMax: 4000,
    ringDetail: 1.25
  },
  high: {
    frameRate: "unlimited",
    resolutionScale: 1.5,
    lightingScale: 1.1,
    particleMax: 1600,
    noiseResolution: 1.5,
    gasResolution: 1.5,
    starMax: 3600,
    ringDetail: 1.0
  },
  default: {
    frameRate: "unlimited",
    resolutionScale: 1.0,
    lightingScale: 1.0,
    particleMax: 1000,
    noiseResolution: 1.0,
    gasResolution: 1.0,
    starMax: 4000,
    ringDetail: 1.0
  },
  low: {
    frameRate: "30",
    resolutionScale: 0.75,
    lightingScale: 0.85,
    particleMax: 800,
    noiseResolution: 0.75,
    gasResolution: 0.75,
    starMax: 2000,
    ringDetail: 0.75
  },
  potato: {
    frameRate: "24",
    resolutionScale: 0.5,
    lightingScale: 0.7,
    particleMax: 400,
    noiseResolution: 0.5,
    gasResolution: 0.5,
    starMax: 800,
    ringDetail: 0.5
  }
};

let frameCapTargetMs = 0;
let frameCapLastTime = 0;
const TARGET_FRAME_TIMES = {
  "60": 1000 / 60,
  "30": 1000 / 30,
  "24": 1000 / 24,
  "15": 1000 / 15
};
//#endregion

//#region Parameters and presets
const params = {
  preset: "Earth-like",
  planetType: "rocky", // rocky | gas_giant
  // Gas Giant settings
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
  atmosphereColor: "#7baeff",
  atmosphereOpacity: 0.22,
  cloudsOpacity: 0.4,
  cloudHeight: 0.03,
  cloudDensity: 0.55,
  cloudNoiseScale: 3.2,
  cloudDriftSpeed: 0.02,
  axisTilt: 23,
  rotationSpeed: 0.12,
  simulationSpeed: 0.12,
  planetMotionEnabled: false,
  starGravity: 0,
  planetForwardSpeed: 0,
  planetForwardAngle: 0,
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
  blackHoleDiskStyle: "Noise", // Noise | Texture | Flat
  blackHoleHaloStyle: "Noise", // Noise | Texture | Flat
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
  // Physics options
  impactDeformation: true,
  // Impact tuning
  impactStrengthMul: 2.5,
  impactSpeedMul: 1.2,
  impactMassMul: 2.0,
  impactElongationMul: 1.6,
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
  explosionSizeVariation: 1.0,
  // Rings
  ringEnabled: false,
  ringAngle: 0,   // degrees relative to equator
  ringSpinSpeed: 0.05, // global fallback
  ringAllowRandom: true,
  ringCount: 0,
  rings: []
};

let currentSunVariant = params.sunVariant || "Star";

const presets = {
  "Earth-like": {
    planetType: "rocky",
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
    atmosphereOpacity: 0.23,
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
    ],
    impactDeformation: true,
    impactStrengthMul: 2.5,
    impactSpeedMul: 1.2,
    impactMassMul: 2.0
  },
  "Mars": {
    planetType: "rocky",
    seed: "MARS",
    radius: 0.71,
    subdivisions: 6,
    noiseLayers: 5,
    noiseFrequency: 3.1,
    noiseAmplitude: 0.34,
    persistence: 0.46,
    lacunarity: 2.2,
    oceanLevel: 0.0,
    colorOcean: "#211b1b",
    colorShallow: "#3b2a22",
    colorLow: "#7a3e27",
    colorMid: "#b25a32",
    colorHigh: "#e4c7a1",
    colorCore: "#8b4513",
    coreEnabled: true,
    coreSize: 0.4,
    coreVisible: true,
    atmosphereColor: "#ffb382",
    atmosphereOpacity: 0.0,
    cloudsOpacity: 0.0,
    axisTilt: 25,
    rotationSpeed: 0.24,
    simulationSpeed: 0.12,
    gravity: 3.71,
    sunColor: "#ffd27f",
    sunIntensity: 1.8,
    sunDistance: 60,
    sunSize: 1,
    sunHaloSize: 6.5,
    sunGlowStrength: 1.2,
    sunPulseSpeed: 0.5,
    moonMassScale: 0.6,
    starCount: 2400,
    starBrightness: 0.9,
    starTwinkleSpeed: 0.6,
    moons: [
      { size: 0.08, distance: 2.6, orbitSpeed: 0.8, inclination: 1, color: "#9e7a5c", phase: 0.3, eccentricity: 0.015 },
      { size: 0.06, distance: 3.8, orbitSpeed: 0.66, inclination: 1.8, color: "#7a5d48", phase: 2.1, eccentricity: 0.025 }
    ]
  },
  "Jupiter": {
    planetType: "gas_giant",
    seed: "JUPITER",
    radius: 3.5,
    axisTilt: 3,
    rotationSpeed: 0.48,
    simulationSpeed: 0.32,
    gravity: 24.79,
    gasGiantStrataCount: 5,
    gasGiantStrataColor1: "#c7b59a",
    gasGiantStrataColor2: "#efe7dd",
    gasGiantStrataColor3: "#b3a58b",
    gasGiantStrataColor4: "#d6c8a7",
    gasGiantStrataColor5: "#c0b8a8",
    gasGiantStrataSize1: 0.3,
    gasGiantStrataSize2: 0.2,
    gasGiantStrataSize3: 0.2,
    gasGiantStrataSize4: 0.2,
    gasGiantStrataSize5: 0.1,
    gasGiantNoiseScale: 3.0,
    gasGiantNoiseStrength: 0.15,
    atmosphereColor: "#d9c7a0",
    atmosphereOpacity: 0.38,
    cloudsOpacity: 0.7,
    sunColor: "#ffd27f",
    sunIntensity: 2.8,
    sunDistance: 120,
    sunSize: 1.6,
    sunHaloSize: 10.5,
    sunGlowStrength: 2.2,
    sunPulseSpeed: 0.25,
    moonMassScale: 2.2,
    starCount: 3400,
    starBrightness: 1.1,
    starTwinkleSpeed: 0.45,
    moons: [
      { size: 0.35, distance: 5.8, orbitSpeed: 0.52, inclination: 2, color: "#d9d0c0", phase: 0.1, eccentricity: 0.01 },
      { size: 0.32, distance: 7.3, orbitSpeed: 0.44, inclination: 0, color: "#b3a58b", phase: 0.7, eccentricity: 0.002 },
      { size: 0.3, distance: 9.7, orbitSpeed: 0.36, inclination: 0.1, color: "#d6c8a7", phase: 1.3, eccentricity: 0.004 },
      { size: 0.28, distance: 15.7, orbitSpeed: 0.23, inclination: 0.5, color: "#c0b8a8", phase: 2.0, eccentricity: 0.01 }
    ]
  },
  "Saturn": {
    planetType: "gas_giant",
    seed: "SATURN",
    radius: 3.2,
    axisTilt: 27,
    rotationSpeed: 0.42,
    simulationSpeed: 0.32,
    gravity: 10.44,
    gasGiantStrataCount: 5,
    gasGiantStrataColor1: "#bda77e",
    gasGiantStrataColor2: "#dccfb0",
    gasGiantStrataColor3: "#f3ecde",
    gasGiantStrataColor4: "#cdbb9a",
    gasGiantStrataColor5: "#bfb39a",
    gasGiantStrataSize1: 0.4,
    gasGiantStrataSize2: 0.3,
    gasGiantStrataSize3: 0.1,
    gasGiantStrataSize4: 0.1,
    gasGiantStrataSize5: 0.1,
    gasGiantNoiseScale: 3.5,
    gasGiantNoiseStrength: 0.12,
    atmosphereColor: "#e6d8b5",
    atmosphereOpacity: 0.33,
    cloudsOpacity: 0.6,
    sunColor: "#ffd27f",
    sunIntensity: 2.6,
    sunDistance: 140,
    sunSize: 1.6,
    sunHaloSize: 12.5,
    sunGlowStrength: 2.0,
    sunPulseSpeed: 0.25,
    moonMassScale: 2.2,
    starCount: 3300,
    starBrightness: 1.05,
    starTwinkleSpeed: 0.45,
    ringEnabled: true,
    ringAngle: 0,
    ringSpinSpeed: 0.03,
    ringCount: 4,
    rings: [
      { style: "Texture", color: "#bfb39a", start: 1.28, end: 1.35, opacity: 0.5, noiseScale: 2.4, noiseStrength: 0.15, spinSpeed: 0.03, brightness: 0.9 },
      { style: "Texture", color: "#e3dccb", start: 1.38, end: 1.80, opacity: 0.95, noiseScale: 2.8, noiseStrength: 0.25, spinSpeed: 0.03, brightness: 1.2 },
      { style: "Texture", color: "#d7ccb4", start: 1.88, end: 2.30, opacity: 0.9, noiseScale: 2.6, noiseStrength: 0.22, spinSpeed: 0.03, brightness: 1.1 },
      { style: "Texture", color: "#f3eee2", start: 2.35, end: 2.42, opacity: 0.6, noiseScale: 2.0, noiseStrength: 0.10, spinSpeed: 0.035, brightness: 1.1 }
    ],
    moons: [
      { size: 0.3, distance: 10.0, orbitSpeed: 0.3, inclination: 2, color: "#d9d6cf", phase: 0.1, eccentricity: 0.01 },
      { size: 0.22, distance: 6.8, orbitSpeed: 0.42, inclination: 1, color: "#cdbb9a", phase: 0.8, eccentricity: 0.02 }
    ]
  },
  "Uranus": {
    planetType: "gas_giant",
    seed: "URANUS",
    radius: 2.7,
    axisTilt: 98,
    rotationSpeed: -0.25,
    simulationSpeed: 0.22,
    gravity: 8.69,
    gasGiantStrataCount: 3,
    gasGiantStrataColor1: "#54c4d7",
    gasGiantStrataColor2: "#86dceb",
    gasGiantStrataColor3: "#d6f4fb",
    gasGiantStrataSize1: 0.5,
    gasGiantStrataSize2: 0.3,
    gasGiantStrataSize3: 0.2,
    gasGiantNoiseScale: 2.0,
    gasGiantNoiseStrength: 0.05,
    atmosphereColor: "#9adbe7",
    atmosphereOpacity: 0.33,
    cloudsOpacity: 0.6,
    sunColor: "#ffd27f",
    sunIntensity: 2.4,
    sunDistance: 150,
    sunSize: 1.4,
    sunHaloSize: 12.0,
    sunGlowStrength: 1.9,
    sunPulseSpeed: 0.3,
    moonMassScale: 1.6,
    starCount: 3200,
    starBrightness: 1.0,
    starTwinkleSpeed: 0.5,
    ringEnabled: true,
    ringAngle: 0,
    ringSpinSpeed: 0.02,
    ringCount: 2,
    rings: [
      { style: "Noise", color: "#d5eaf6", start: 1.45, end: 1.48, opacity: 0.35, noiseScale: 1.6, noiseStrength: 0.2, spinSpeed: 0.02, brightness: 0.8 },
      { style: "Noise", color: "#d5eaf6", start: 1.58, end: 1.61, opacity: 0.35, noiseScale: 1.6, noiseStrength: 0.2, spinSpeed: 0.02, brightness: 0.8 }
    ],
    moons: [
      { size: 0.18, distance: 6.5, orbitSpeed: 0.4, inclination: 1, color: "#d5eaf6", phase: 0.2, eccentricity: 0.03 }
    ]
  },
  "Neptune": {
    planetType: "gas_giant",
    seed: "NEPTUNE",
    radius: 2.6,
    axisTilt: 28,
    rotationSpeed: 0.26,
    simulationSpeed: 0.22,
    gravity: 11.15,
    gasGiantStrataCount: 4,
    gasGiantStrataColor1: "#2e60bf",
    gasGiantStrataColor2: "#5b8ee6",
    gasGiantStrataColor3: "#b7d0ff",
    gasGiantStrataColor4: "#7fb0ff",
    gasGiantStrataSize1: 0.4,
    gasGiantStrataSize2: 0.3,
    gasGiantStrataSize3: 0.2,
    gasGiantStrataSize4: 0.1,
    gasGiantNoiseScale: 2.5,
    gasGiantNoiseStrength: 0.1,
    atmosphereColor: "#7fb0ff",
    atmosphereOpacity: 0.33,
    cloudsOpacity: 0.6,
    sunColor: "#ffd27f",
    sunIntensity: 2.4,
    sunDistance: 160,
    sunSize: 1.4,
    sunHaloSize: 12.5,
    sunGlowStrength: 1.9,
    sunPulseSpeed: 0.3,
    moonMassScale: 1.7,
    starCount: 3200,
    starBrightness: 1.0,
    starTwinkleSpeed: 0.5,
    ringEnabled: true,
    ringAngle: 0,
    ringSpinSpeed: 0.02,
    ringCount: 1,
    rings: [
      { style: "Noise", color: "#d1e2ff", start: 1.50, end: 1.53, opacity: 0.25, noiseScale: 1.6, noiseStrength: 0.2, spinSpeed: 0.02, brightness: 0.8 }
    ],
    moons: [
      { size: 0.24, distance: 8.6, orbitSpeed: 0.34, inclination: 0.1, color: "#d1e2ff", phase: 0.8, eccentricity: 0.01 }
    ]
  },
  "Mercury": {
    planetType: "rocky",
    seed: "MERCURY",
    radius: 0.38,
    subdivisions: 6,
    noiseLayers: 5,
    noiseFrequency: 3.4,
    noiseAmplitude: 0.42,
    persistence: 0.5,
    lacunarity: 2.2,
    oceanLevel: 0.0,
    colorOcean: "#2a2623",
    colorShallow: "#3b322c",
    colorLow: "#5c4a3e",
    colorMid: "#8a705d",
    colorHigh: "#d1c0af",
    colorCore: "#8b4513",
    coreEnabled: true,
    coreSize: 0.4,
    coreVisible: true,
    atmosphereColor: "#b9b2a8",
    atmosphereOpacity: 0.0,
    cloudsOpacity: 0.0,
    axisTilt: 0.03,
    rotationSpeed: 0.02,
    simulationSpeed: 0.12,
    gravity: 3.7,
    sunColor: "#ffd27f",
    sunIntensity: 2.0,
    sunDistance: 20,
    sunSize: 1,
    sunHaloSize: 6.5,
    sunGlowStrength: 1.4,
    sunPulseSpeed: 0.5,
    moonMassScale: 0.2,
    starCount: 2200,
    starBrightness: 0.9,
    starTwinkleSpeed: 0.6,
    moons: []
  },
  "Venus": {
    planetType: "rocky",
    seed: "VENUS",
    radius: 0.95,
    subdivisions: 6,
    noiseLayers: 5,
    noiseFrequency: 3.0,
    noiseAmplitude: 0.45,
    persistence: 0.48,
    lacunarity: 2.25,
    oceanLevel: 0.35,
    colorOcean: "#2d2018",
    colorShallow: "#4a362a",
    colorLow: "#6f513f",
    colorMid: "#b38a6c",
    colorHigh: "#f0e6d9",
    colorCore: "#8b4513",
    coreEnabled: true,
    coreSize: 0.4,
    coreVisible: true,
    atmosphereColor: "#e3c6a2",
    atmosphereOpacity: 0.47,
    cloudsOpacity: 0.85,
    axisTilt: 177,
    rotationSpeed: -0.01,
    simulationSpeed: 0.12,
    gravity: 8.87,
    sunColor: "#ffd27f",
    sunIntensity: 2.2,
    sunDistance: 30,
    sunSize: 1,
    sunHaloSize: 6.5,
    sunGlowStrength: 1.5,
    sunPulseSpeed: 0.5,
    moonMassScale: 0.4,
    starCount: 2500,
    starBrightness: 0.95,
    starTwinkleSpeed: 0.6,
    moons: []
  },
  "Desert World": {
    planetType: "rocky",
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
    colorCore: "#8b4513",
    coreEnabled: true,
    coreSize: 0.4,
    coreVisible: true,
    atmosphereColor: "#f4aa5a",
    atmosphereOpacity: 0.05,
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
    planetType: "gas_giant",
    seed: "GLACIER",
    radius: 2.8,
    axisTilt: 28,
    rotationSpeed: 0.28,
    simulationSpeed: 0.2,
    gravity: 17.2,
    gasGiantStrataCount: 4,
    gasGiantStrataColor1: "#2e5e9c",
    gasGiantStrataColor2: "#88b5ff",
    gasGiantStrataColor3: "#f6fbff",
    gasGiantStrataColor4: "#9ed7ff",
    gasGiantStrataSize1: 0.5,
    gasGiantStrataSize2: 0.3,
    gasGiantStrataSize3: 0.1,
    gasGiantStrataSize4: 0.1,
    gasGiantNoiseScale: 2.2,
    gasGiantNoiseStrength: 0.08,
    atmosphereColor: "#9ed7ff",
    atmosphereOpacity: 0.33,
    cloudsOpacity: 0.6,
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
    planetType: "rocky",
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
    colorCore: "#8b4513",
    coreEnabled: true,
    coreSize: 0.4,
    coreVisible: true,
    atmosphereColor: "#ff7a3a",
    atmosphereOpacity: 0.1,
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
    planetType: "gas_giant",
    seed: "AEROX",
    radius: 3.6,
    axisTilt: 12,
    rotationSpeed: 0.45,
    simulationSpeed: 0.4,
    gravity: 24.8,
    gasGiantStrataCount: 6,
    gasGiantStrataColor1: "#dcdff7",
    gasGiantStrataColor2: "#8f9ec8",
    gasGiantStrataColor3: "#34527f",
    gasGiantStrataColor4: "#253a66",
    gasGiantStrataColor5: "#14203b",
    gasGiantStrataColor6: "#c1d6ff",
    gasGiantStrataSize1: 0.2,
    gasGiantStrataSize2: 0.2,
    gasGiantStrataSize3: 0.2,
    gasGiantStrataSize4: 0.2,
    gasGiantStrataSize5: 0.1,
    gasGiantStrataSize6: 0.1,
    gasGiantNoiseScale: 4.0,
    gasGiantNoiseStrength: 0.2,
    atmosphereColor: "#c1d6ff",
    atmosphereOpacity: 0.38,
    cloudsOpacity: 0.7,
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

const starPresets = {
  Sol: {
    sunColor: "#ffd27f",
    sunIntensity: 1.6,
    sunDistance: 48,
    sunSize: 1.1,
    sunHaloSize: 5.4,
    sunGlowStrength: 1.3,
    sunPulseSpeed: 0.6,
    sunNoiseScale: 1.45,
    sunParticleCount: 240,
    sunParticleSpeed: 0.65,
    sunParticleSize: 0.14,
    sunParticleColor: "#ffbf7a",
    sunParticleLifetime: 4.2
  },
  "Red Dwarf": {
    sunColor: "#ff7750",
    sunIntensity: 0.9,
    sunDistance: 36,
    sunSize: 0.8,
    sunHaloSize: 4.1,
    sunGlowStrength: 1.1,
    sunPulseSpeed: 0.85,
    sunNoiseScale: 1.9,
    sunParticleCount: 180,
    sunParticleSpeed: 0.42,
    sunParticleSize: 0.12,
    sunParticleColor: "#ff6242",
    sunParticleLifetime: 5.0
  },
  "Blue Giant": {
    sunColor: "#9fc4ff",
    sunIntensity: 2.5,
    sunDistance: 110,
    sunSize: 1.6,
    sunHaloSize: 8.2,
    sunGlowStrength: 2.0,
    sunPulseSpeed: 0.4,
    sunNoiseScale: 1.2,
    sunParticleCount: 320,
    sunParticleSpeed: 0.9,
    sunParticleSize: 0.18,
    sunParticleColor: "#8abaff",
    sunParticleLifetime: 3.2
  },
  "White Dwarf": {
    sunColor: "#f2f7ff",
    sunIntensity: 1.9,
    sunDistance: 38,
    sunSize: 0.9,
    sunHaloSize: 3.6,
    sunGlowStrength: 0.9,
    sunPulseSpeed: 1.2,
    sunNoiseScale: 2.3,
    sunParticleCount: 140,
    sunParticleSpeed: 0.5,
    sunParticleSize: 0.1,
    sunParticleColor: "#eff6ff",
    sunParticleLifetime: 2.6
  },
  "Neutron Star": {
    sunColor: "#9ecaff",
    sunIntensity: 3.2,
    sunDistance: 65,
    sunSize: 0.6,
    sunHaloSize: 5.2,
    sunGlowStrength: 2.6,
    sunPulseSpeed: 1.8,
    sunNoiseScale: 3.0,
    sunParticleCount: 260,
    sunParticleSpeed: 1.4,
    sunParticleSize: 0.09,
    sunParticleColor: "#96caff",
    sunParticleLifetime: 1.8
  }
};

const shareKeys = [
  "seed",
  "planetType",
  "gasGiantStrataCount",
  "gasGiantStrataColor1",
  "gasGiantStrataColor2",
  "gasGiantStrataColor3",
  "gasGiantStrataColor4",
  "gasGiantStrataColor5",
  "gasGiantStrataColor6",
  "gasGiantStrataSize1",
  "gasGiantStrataSize2",
  "gasGiantStrataSize3",
  "gasGiantStrataSize4",
  "gasGiantStrataSize5",
  "gasGiantStrataSize6",
  "gasGiantNoiseScale",
  "gasGiantNoiseStrength",
  "gasGiantStrataWarp",
  "gasGiantStrataWarpScale",
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
  "colorFoam",
  "foamEnabled",
  "colorLow",
  "colorMid",
  "colorHigh",
  // Palette/core additions
  "colorCore",
  "coreEnabled",
  "coreSize",
  "coreVisible",
  "atmosphereColor",
  "atmosphereOpacity",
  "cloudsOpacity",
  "cloudHeight",
  "cloudDensity",
  "cloudNoiseScale",
  "cloudDriftSpeed",
  "axisTilt",
  "rotationSpeed",
  "simulationSpeed",
  "planetMotionEnabled",
  "starGravity",
  "planetForwardSpeed",
  "planetForwardAngle",
  "gravity",
  "sunColor",
  "sunIntensity",
  "sunDistance",
  "sunSize",
  "sunHaloSize",
  "sunGlowStrength",
  "sunPulseSpeed",
  "sunVariant",
  "sunPreset",
  "sunNoiseScale",
  "sunParticleCount",
  "sunParticleSpeed",
  "sunParticleSize",
  "sunParticleColor",
  "sunParticleLifetime",
  "blackHoleCoreSize",
  "blackHoleDiskRadius",
  "blackHoleDiskThickness",
  "blackHoleDiskIntensity",
  "blackHoleDiskTilt",
  "blackHoleDiskYaw",
  "blackHoleDiskTwist",
  "blackHoleSpinSpeed",
  "blackHoleHaloSpinSpeed",
  "blackHoleDiskStyle",
  "blackHoleHaloStyle",
  "blackHoleDiskNoiseScale",
  "blackHoleDiskNoiseStrength",
  "blackHoleHaloRadius",
  "blackHoleHaloAngle",
  "blackHoleHaloThickness",
  "blackHoleHaloIntensity",
  "blackHoleHaloNoiseScale",
  "blackHoleHaloNoiseStrength",
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
  "impactDeformation",
  // Impact tuning
  "impactStrengthMul",
  "impactSpeedMul",
  "impactMassMul",
  "impactElongationMul",
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
  "explosionSizeVariation",
  // Rings (global)
  "ringEnabled",
  "ringAngle",
  "ringSpinSpeed",
  "ringAllowRandom",
  "ringCount"
];
//#endregion

//#region State tracking
const palette = {
  ocean: new THREE.Color(params.colorOcean),
  shallow: new THREE.Color(params.colorShallow),
  foam: new THREE.Color(params.colorFoam),
  low: new THREE.Color(params.colorLow),
  mid: new THREE.Color(params.colorMid),
  high: new THREE.Color(params.colorHigh),
  core: new THREE.Color(params.colorCore),
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
let isApplyingStarPreset = false;

function ensurePlanetVelocityVector() {
  let planetVel = planetRoot.userData.planetVel;
  if (!planetVel) {
    planetVel = new THREE.Vector3();
    planetRoot.userData.planetVel = planetVel;
  }
  return planetVel;
}

function computeInitialPlanetVelocity(target = planetOrbitState.velocity) {
  sunGroup.getWorldPosition(planetMotionScratch.toSun);
  planetMotionScratch.toSun.sub(planetSystem.position);
  if (planetMotionScratch.toSun.lengthSq() <= 1e-8) {
    target.set(0, 0, 0);
    return target;
  }

  planetMotionScratch.radial.copy(planetMotionScratch.toSun).normalize();
  planetMotionScratch.reference.set(0, 1, 0);
  planetMotionScratch.right.copy(planetMotionScratch.reference).cross(planetMotionScratch.radial);
  if (planetMotionScratch.right.lengthSq() < 1e-8) {
    planetMotionScratch.reference.set(1, 0, 0);
    planetMotionScratch.right.copy(planetMotionScratch.reference).cross(planetMotionScratch.radial);
  }
  planetMotionScratch.right.normalize();
  planetMotionScratch.forward.copy(planetMotionScratch.radial).cross(planetMotionScratch.right).normalize();

  const angleRad = THREE.MathUtils.degToRad(params.planetForwardAngle || 0);
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  planetMotionScratch.tangent.copy(planetMotionScratch.forward).multiplyScalar(cosA);
  planetMotionScratch.toSun.copy(planetMotionScratch.right).multiplyScalar(sinA);
  planetMotionScratch.tangent.add(planetMotionScratch.toSun);
  if (planetMotionScratch.tangent.lengthSq() < 1e-8) {
    planetMotionScratch.tangent.copy(planetMotionScratch.forward);
  } else {
    planetMotionScratch.tangent.normalize();
  }

  const speed = Math.max(0, params.planetForwardSpeed || 0);
  target.copy(planetMotionScratch.tangent).multiplyScalar(speed);
  return target;
}

function resetPlanetMotion({ resetPosition = true } = {}) {
  if (resetPosition) {
    planetSystem.position.copy(planetOrbitState.initialPosition);
    planetSystem.updateMatrixWorld(true);
  }

  if (params.planetMotionEnabled) {
    computeInitialPlanetVelocity(planetOrbitState.velocity);
  } else {
    planetOrbitState.velocity.set(0, 0, 0);
  }

  planetSystem.userData.orbitVel = planetOrbitState.velocity;
  ensurePlanetVelocityVector().copy(planetOrbitState.velocity);
  planetOrbitState.lastEnabled = params.planetMotionEnabled;
}

function handlePlanetMotionToggle(enabled) {
  params.planetMotionEnabled = enabled;
  resetPlanetMotion({ resetPosition: true });
}

function handlePlanetMotionParamChange({ resetPosition = true } = {}) {
  resetPlanetMotion({ resetPosition });
}

function stepPlanetOrbit(dt) {
  if (planetOrbitState.lastEnabled !== params.planetMotionEnabled) {
    resetPlanetMotion({ resetPosition: true });
  }

  if (!params.planetMotionEnabled) {
    ensurePlanetVelocityVector().set(0, 0, 0);
    planetOrbitState.lastEnabled = false;
    return;
  }

  const velocity = planetOrbitState.velocity;
  const mu = Math.max(0, params.starGravity || 0);
  if (mu > 0) {
    sunGroup.getWorldPosition(planetMotionScratch.toSun);
    planetMotionScratch.toSun.sub(planetSystem.position);
    const distSq = Math.max(1e-6, planetMotionScratch.toSun.lengthSq());
    const dist = Math.sqrt(distSq);
    planetMotionScratch.toSun.multiplyScalar(mu / (distSq * dist));
    velocity.addScaledVector(planetMotionScratch.toSun, dt);
  }

  planetSystem.position.addScaledVector(velocity, dt);
  planetSystem.updateMatrixWorld(true);
  planetSystem.userData.orbitVel = velocity;
  ensurePlanetVelocityVector().copy(velocity);
  planetOrbitState.lastEnabled = true;
}

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
  starPresets,
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
  updateRings,
  updateStarfieldUniforms,
  regenerateStarfield,
  updateGravityDisplay,
  initMoonPhysics,
  onPlanetMotionToggle: handlePlanetMotionToggle,
  onPlanetMotionParamChange: handlePlanetMotionParamChange,
  getIsApplyingPreset: () => isApplyingPreset,
  getIsApplyingStarPreset: () => isApplyingStarPreset,
  onPresetChange: (value) => applyPreset(value),
  onStarPresetChange: (value) => applyStarPreset(value)
});

applyStarPreset(params.sunPreset, { skipShareUpdate: true });

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

// Rings: per-ring controls
const { rebuildRingControls, normalizeRingSettings } = setupRingControls({
  gui,
  params,
  guiControllers,
  registerFolder,
  unregisterFolder,
  applyControlSearch,
  scheduleShareUpdate,
  updateRings,
  getIsApplyingPreset: () => isApplyingPreset,
  getRingsFolder: () => guiControllers?.folders?.ringsFolder
});

// Build ring controls initially
rebuildRingControls();

if (debugPlanetSpeedDisplay) {
  debugPlanetSpeedDisplay.textContent = "0.000";
}

if (debugFpsDisplay) {
  debugFpsDisplay.textContent = "0";
}
  const hudFps = document.getElementById("hud-fps");
  if (hudFps && debugHudFpsToggle) {
    hudFps.hidden = !debugHudFpsToggle.checked;
    debugHudFpsToggle.addEventListener("change", () => {
      hudFps.hidden = !debugHudFpsToggle.checked;
    });
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

// Reset all to default (Earth-like baseline)
resetAllButton?.addEventListener("click", () => {
  try {
    applyPreset("Earth-like", { skipShareUpdate: false, keepSeed: false });
    applyStarPreset("Sol", { skipShareUpdate: true });
  } catch (e) {
    console.warn("Reset All failed:", e);
  }
});

// Desktop menu actions
function closeDesktopMenu() {
  console.log("Closing desktop menu");
  desktopMenu?.setAttribute("hidden", "");
  desktopMenuToggle?.setAttribute("aria-expanded", "false");
}
function openDesktopMenu() {
  console.log("Opening desktop menu");
  desktopMenu?.removeAttribute("hidden");
  desktopMenuToggle?.setAttribute("aria-expanded", "true");
}
desktopMenuToggle?.addEventListener("click", () => {
  console.log("Desktop menu toggle clicked");
  const expanded = desktopMenuToggle.getAttribute("aria-expanded") === "true";
  if (expanded) closeDesktopMenu(); else openDesktopMenu();
});
desktopCopy?.addEventListener("click", async () => {
  console.log("Desktop copy clicked");
  try {
    // Reuse the same logic as the main copy handler, but without touching the UI button text
    const payload = buildSharePayload();
    try {
      const result = await saveConfigurationToAPI(payload, {
        name: `Planet ${payload.data.seed}`,
        description: `A ${payload.preset} planet with ${payload.data.moonCount} moon(s)`,
        preset: payload.preset,
        moonCount: payload.data.moonCount
      });
      await copyToClipboard(result.id);
      flashShareFeedback(`✅ Saved! ID: ${result.id}`);
    } catch (apiError) {
      console.warn("⚠️ API not available, using fallback (desktop menu):", apiError.message);
      const code = getCurrentShareCode();
      if (!code) throw new Error("No share code available");
      await copyToClipboard(code);
      flashShareFeedback("📋 Copied (offline mode)");
    }
  } catch (err) {
    console.error("❌ Share failed (desktop menu):", err);
    flashShareFeedback("❌ Share failed");
  } finally {
    closeDesktopMenu();
  }
});
desktopHelp?.addEventListener("click", () => {
  console.log("Desktop help clicked");
  try { showOnboarding(true); } catch (e) { console.warn("Onboarding not available", e); }
  closeDesktopMenu();
});
desktopHome?.addEventListener("click", () => {
  console.log("Desktop home clicked");
  navigateToLanding();
  closeDesktopMenu();
});
desktopVisualSettings?.addEventListener("click", () => {
  console.log("Desktop visual settings clicked");
  openVisualSettingsPopup();
  closeDesktopMenu();
});

// Mobile menu actions
function closeMobileMenu() {
  mobileMenu?.setAttribute("hidden", "");
  mobileMenuToggle?.setAttribute("aria-expanded", "false");
}
function openMobileMenu() {
  mobileMenu?.removeAttribute("hidden");
  mobileMenuToggle?.setAttribute("aria-expanded", "true");
}
mobileMenuToggle?.addEventListener("click", () => {
  const expanded = mobileMenuToggle.getAttribute("aria-expanded") === "true";
  if (expanded) closeMobileMenu(); else openMobileMenu();
});
mobileRandomize?.addEventListener("click", () => {
  randomizeSeedButton?.click();
  closeMobileMenu();
});
mobileSurprise?.addEventListener("click", () => {
  surpriseMeButton?.click();
  closeMobileMenu();
});
mobileCopy?.addEventListener("click", async () => {
  console.log("Mobile copy clicked");
  try {
    // Reuse the same logic as the desktop copy handler
    const payload = buildSharePayload();
    try {
      const result = await saveConfigurationToAPI(payload, {
        name: `Planet ${payload.data.seed}`,
        description: `A ${payload.preset} planet with ${payload.data.moonCount} moon(s)`,
        preset: payload.preset,
        moonCount: payload.data.moonCount
      });
      await copyToClipboard(result.id);
      flashShareFeedback(`✅ Saved! ID: ${result.id}`);
    } catch (apiError) {
      console.warn("⚠️ API not available, using fallback (mobile menu):", apiError.message);
      const code = getCurrentShareCode();
      if (!code) throw new Error("No share code available");
      await copyToClipboard(code);
      flashShareFeedback("📋 Copied (offline mode)");
    }
  } catch (error) {
    console.error("❌ Mobile share failed:", error);
    flashShareFeedback("❌ Share failed");
  }
  closeMobileMenu();
});
mobileReset?.addEventListener("click", () => {
  resetAllButton?.click();
  closeMobileMenu();
});
mobileVisualSettings?.addEventListener("click", () => {
  openVisualSettingsPopup();
  closeMobileMenu();
});

// Visual Settings helpers and functions
function clampVisualSettingsValues() {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const clampInt = (value, min, max) => Math.round(clamp(value, min, max));
  visualSettings.resolutionScale = clamp(parseFloat(visualSettings.resolutionScale ?? 1), 0.25, 2.0);
  visualSettings.lightingScale = clamp(parseFloat(visualSettings.lightingScale ?? 1), 0.1, 2.0);
  visualSettings.particleMax = clampInt(parseInt(visualSettings.particleMax ?? 1000, 10), 100, 2000);
  visualSettings.noiseResolution = clamp(parseFloat(visualSettings.noiseResolution ?? 1), 0.25, 2.0);
  visualSettings.gasResolution = clamp(parseFloat(visualSettings.gasResolution ?? 1), 0.25, 2.0);
  visualSettings.starMax = clampInt(parseInt(visualSettings.starMax ?? 4000, 10), 0, 4000);
  visualSettings.ringDetail = clamp(parseFloat(visualSettings.ringDetail ?? 1), 0.25, 1.5);
  if (!(visualSettings.frameRate in TARGET_FRAME_TIMES) && visualSettings.frameRate !== "unlimited") {
    visualSettings.frameRate = "unlimited";
  }
}

function visualSettingsMatchesPreset(preset) {
  if (!preset) return false;
  const epsilon = 1e-3;
  return (
    (preset.frameRate ?? "unlimited") === (visualSettings.frameRate ?? "unlimited") &&
    Math.abs((preset.resolutionScale ?? 1) - visualSettings.resolutionScale) < epsilon &&
    Math.abs((preset.lightingScale ?? 1) - visualSettings.lightingScale) < epsilon &&
    Math.abs((preset.particleMax ?? 0) - visualSettings.particleMax) <= 1 &&
    Math.abs((preset.noiseResolution ?? 1) - visualSettings.noiseResolution) < epsilon &&
    Math.abs((preset.gasResolution ?? 1) - visualSettings.gasResolution) < epsilon &&
    Math.abs((preset.starMax ?? 0) - visualSettings.starMax) <= 1 &&
    Math.abs((preset.ringDetail ?? 1) - visualSettings.ringDetail) < epsilon
  );
}

function determineVisualSettingsPreset() {
  for (const [key, preset] of Object.entries(VISUAL_SETTING_PRESETS)) {
    if (visualSettingsMatchesPreset(preset)) return key;
  }
  return "custom";
}

function syncVisualSettingsUI() {
  if (frameRateControl) frameRateControl.value = visualSettings.frameRate;
  if (resolutionScale) resolutionScale.value = String(visualSettings.resolutionScale);
  if (resolutionScaleValue) resolutionScaleValue.textContent = Math.round(visualSettings.resolutionScale * 100) + "%";
  if (lightingScale) lightingScale.value = String(visualSettings.lightingScale);
  if (lightingScaleValue) lightingScaleValue.textContent = Math.round(visualSettings.lightingScale * 100) + "%";
  if (particleMaxInput) {
    particleMaxInput.value = String(visualSettings.particleMax);
    particleMaxValue.textContent = String(visualSettings.particleMax);
  }
  if (starMaxInput) {
    starMaxInput.value = String(visualSettings.starMax);
    starMaxValue.textContent = String(visualSettings.starMax);
  }
  if (noiseResolutionInput) {
    noiseResolutionInput.value = String(visualSettings.noiseResolution);
    noiseResolutionValue.textContent = Math.round(visualSettings.noiseResolution * 100) + "%";
  }
  if (gasResolutionInput) {
    gasResolutionInput.value = String(visualSettings.gasResolution);
    gasResolutionValue.textContent = Math.round(visualSettings.gasResolution * 100) + "%";
  }
  if (ringDetailInput) {
    ringDetailInput.value = String(visualSettings.ringDetail);
    ringDetailValue.textContent = Math.round(visualSettings.ringDetail * 100) + "%";
  }
  if (visualSettingsPresetSelect) {
    visualSettingsPresetSelect.value = determineVisualSettingsPreset();
  }
}

function markVisualPresetCustom() {
  if (visualSettingsPresetSelect) {
    visualSettingsPresetSelect.value = "custom";
  }
}

function closeVisualSettingsPopup() {
  visualSettingsPopup?.setAttribute("hidden", "");
}

function openVisualSettingsPopup() {
  clampVisualSettingsValues();
  syncVisualSettingsUI();
  visualSettingsPopup?.removeAttribute("hidden");
}

function resetVisualSettings() {
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
  clampVisualSettingsValues();
  syncVisualSettingsUI();
  applyVisualSettings();
}

function updateBlackHoleGeometrySegments() {
  const detail = Math.max(0.25, Math.min(1.5, visualSettings?.ringDetail ?? 1.0));
  const segments = Math.max(24, Math.round(256 * detail));
  if (blackHoleDisk?.geometry?.parameters?.segments !== segments) {
    const geom = new THREE.CircleGeometry(1, segments);
    blackHoleDisk.geometry?.dispose?.();
    blackHoleDisk.geometry = geom;
  }
  [blackHoleHalo, blackHoleHaloSecondary].forEach((mesh) => {
    if (!mesh) return;
    if (mesh.geometry?.parameters?.segments === segments) return;
    const geom = new THREE.CircleGeometry(1, segments);
    mesh.geometry?.dispose?.();
    mesh.geometry = geom;
  });
}

function enforceVisualSettingCaps() {
  const starLimit = Math.max(0, Math.round(visualSettings.starMax ?? 0));
  guiControllers.starCount?.min?.(0);
  guiControllers.starCount?.max?.(Math.max(50, starLimit));
  if (params.starCount > starLimit) {
    params.starCount = starLimit;
    guiControllers.starCount?.updateDisplay?.();
  }
}

function applyVisualSettingsState({ persist = true, closePopup = true } = {}) {
  clampVisualSettingsValues();
  syncVisualSettingsUI();

  if (visualSettings.frameRate === "unlimited") {
    frameCapTargetMs = 0;
  } else {
    frameCapTargetMs = TARGET_FRAME_TIMES[visualSettings.frameRate] || 0;
  }

  try {
    const width = Math.max(1, sceneContainer?.clientWidth || window.innerWidth);
    const height = Math.max(1, sceneContainer?.clientHeight || window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio * visualSettings.resolutionScale, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, true);
    if (starField?.material?.uniforms?.uPixelRatio) {
      starField.material.uniforms.uPixelRatio.value = pixelRatio;
    }
  } catch (e) {
    console.warn("Failed to apply resolution scale", e);
  }

  try {
    ambientLight.intensity = 0.35 * visualSettings.lightingScale;
    sunLight.intensity = Math.max(0, params.sunIntensity) * visualSettings.lightingScale;
  } catch (e) {
    console.warn("Failed to apply lighting scale", e);
  }

  enforceVisualSettingCaps();
  updateBlackHoleGeometrySegments();
  planetDirty = true;
  try { updateRings(); } catch (e) { console.warn("Failed to update rings after visual settings", e); }
  try { updateSun(); } catch (e) { console.warn("Failed to update star after visual settings", e); }
  try { regenerateStarfield(); } catch (e) { console.warn("Failed to rebuild starfield after visual settings", e); }

  if (persist) {
    try {
      localStorage.setItem("planet-visual-settings", JSON.stringify(visualSettings));
    } catch {}
  }

  if (closePopup) {
    closeVisualSettingsPopup();
  }
}

function applyVisualSettings(options) {
  applyVisualSettingsState({ persist: true, closePopup: true, ...options });
}

// Apply visual settings on startup
function applyInitialVisualSettings() {
  if (typeof visualSettings === "undefined") return;

  try {
    const raw = localStorage.getItem("planet-visual-settings");
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(visualSettings, saved);
    }
  } catch {}

  applyVisualSettingsState({ persist: false, closePopup: false });
}

// Popup event handlers
visualSettingsClose?.addEventListener("click", closeVisualSettingsPopup);
visualSettingsReset?.addEventListener("click", resetVisualSettings);
visualSettingsApply?.addEventListener("click", () => applyVisualSettings());

// Real-time UI updates
visualSettingsPresetSelect?.addEventListener("change", (e) => {
  const value = e.target.value;
  if (value === "custom") return;
  const preset = VISUAL_SETTING_PRESETS[value];
  if (!preset) return;
  Object.assign(visualSettings, preset);
  clampVisualSettingsValues();
  syncVisualSettingsUI();
});

frameRateControl?.addEventListener("change", (e) => {
  visualSettings.frameRate = e.target.value;
  markVisualPresetCustom();
});

resolutionScale?.addEventListener("input", (e) => {
  visualSettings.resolutionScale = parseFloat(e.target.value);
  resolutionScaleValue.textContent = Math.round(visualSettings.resolutionScale * 100) + "%";
  markVisualPresetCustom();
});

lightingScale?.addEventListener("input", (e) => {
  visualSettings.lightingScale = parseFloat(e.target.value);
  lightingScaleValue.textContent = Math.round(visualSettings.lightingScale * 100) + "%";
  markVisualPresetCustom();
});

particleMaxInput?.addEventListener("input", (e) => {
  const v = Math.max(100, Math.min(2000, parseInt(e.target.value || "1000", 10)));
  visualSettings.particleMax = v;
  particleMaxValue.textContent = String(v);
  markVisualPresetCustom();
});

starMaxInput?.addEventListener("input", (e) => {
  const v = Math.max(0, Math.min(4000, parseInt(e.target.value || "0", 10)));
  visualSettings.starMax = v;
  starMaxValue.textContent = String(v);
  markVisualPresetCustom();
});

noiseResolutionInput?.addEventListener("input", (e) => {
  const v = Math.max(0.25, Math.min(2.0, parseFloat(e.target.value || "1.0")));
  visualSettings.noiseResolution = v;
  noiseResolutionValue.textContent = Math.round(v * 100) + "%";
  markVisualPresetCustom();
});

gasResolutionInput?.addEventListener("input", (e) => {
  const v = Math.max(0.25, Math.min(2.0, parseFloat(e.target.value || "1.0")));
  visualSettings.gasResolution = v;
  gasResolutionValue.textContent = Math.round(v * 100) + "%";
  markVisualPresetCustom();
});

ringDetailInput?.addEventListener("input", (e) => {
  const v = Math.max(0.25, Math.min(1.5, parseFloat(e.target.value || "1.0")));
  visualSettings.ringDetail = v;
  ringDetailValue.textContent = Math.round(v * 100) + "%";
  markVisualPresetCustom();
});

// Close popup when clicking outside
visualSettingsPopup?.addEventListener("click", (e) => {
  if (e.target === visualSettingsPopup) {
    closeVisualSettingsPopup();
  }
});

// Mobile surprise button (always visible)
surpriseMeMobileButton?.addEventListener("click", () => {
  surpriseMeButton?.click();
});

// Close desktop menu when clicking outside
document.addEventListener("click", (e) => {
  if (isMobileLayout()) return;
  const target = e.target;
  if (!desktopMenu || desktopMenu.hasAttribute("hidden")) return;
  if (desktopMenu.contains(target)) return;
  if (desktopMenuToggle && (target === desktopMenuToggle || desktopMenuToggle.contains(target))) return;
  closeDesktopMenu();
});

// Mobile focus mode functionality
function closeMobileFocusMenu() {
  mobileFocusMenu?.setAttribute("hidden", "");
  mobileFocusToggle?.setAttribute("aria-expanded", "false");
}

function openMobileFocusMenu() {
  mobileFocusMenu?.removeAttribute("hidden");
  mobileFocusToggle?.setAttribute("aria-expanded", "true");
  updateMobileFocusMenu();
}

function updateMobileFocusMenu() {
  if (!focusMoonsContainer) return;
  
  // Clear existing moon buttons
  focusMoonsContainer.innerHTML = "";
  
  // Add moon buttons
  moonsGroup.children.forEach((moon, index) => {
    const moonButton = document.createElement("button");
    moonButton.className = "focus-option";
    moonButton.setAttribute("data-target", `moon-${index}`);
    moonButton.innerHTML = `🌙 Moon ${index + 1}`;
    focusMoonsContainer.appendChild(moonButton);
  });
}

function focusOnObject(targetType, moonIndex = null) {
  let targetObject = null;
  
  if (targetType === "planet") {
    targetObject = planetMesh;
  } else if (targetType === "sun") {
    targetObject = sunVisual || sunCorona;
  } else if (targetType === "moon" && moonIndex !== null) {
    // Get the moon mesh from the pivot's userData
    const moonPivot = moonsGroup.children[moonIndex];
    if (moonPivot && moonPivot.userData?.mesh) {
      targetObject = moonPivot.userData.mesh;
    }
  } else if (targetType === "none") {
    // Exit focus mode
    cameraMode = CameraMode.ORBIT;
    focusTarget = null;
    if (cameraModeButton) cameraModeButton.textContent = `Camera: ${cameraMode}`;
    controls.enabled = true;
    closeMobileFocusMenu();
    return;
  }
  
  if (targetObject) {
    focusTarget = targetObject;
    cameraMode = CameraMode.FOCUS;
    if (cameraModeButton) cameraModeButton.textContent = `Camera: ${cameraMode}`;
    closeMobileFocusMenu();
  }
}

// Mobile focus menu event handlers
mobileFocusToggle?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  if (mobileFocusMenu?.hasAttribute("hidden")) {
    openMobileFocusMenu();
  } else {
    closeMobileFocusMenu();
  }
});

// Handle focus option clicks
document.addEventListener("click", (e) => {
  if (!isMobileLayout()) return;
  
  const focusOption = e.target.closest(".focus-option");
  if (!focusOption) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  const target = focusOption.getAttribute("data-target");
  
  if (target === "planet") {
    focusOnObject("planet");
  } else if (target === "sun") {
    focusOnObject("sun");
  } else if (target.startsWith("moon-")) {
    const moonIndex = parseInt(target.split("-")[1]);
    focusOnObject("moon", moonIndex);
  } else if (target === "none") {
    focusOnObject("none");
  }
});

// Close mobile focus menu when clicking outside
document.addEventListener("click", (e) => {
  if (!isMobileLayout()) return;
  const target = e.target;
  if (!mobileFocusMenu || mobileFocusMenu.hasAttribute("hidden")) return;
  if (mobileFocusMenu.contains(target)) return;
  if (mobileFocusToggle && (target === mobileFocusToggle || mobileFocusToggle.contains(target))) return;
  closeMobileFocusMenu();
});

let exitRedirectHandle = null;

function navigateToLanding() {
  const code = getCurrentShareCode();
  const target = code ? `/?previewCode=${encodeURIComponent(code)}` : "/";
  if (!previewMode && exitOverlay) {
    exitOverlay.hidden = false;
    // trigger transition
    requestAnimationFrame(() => exitOverlay.classList.add("visible"));
    if (exitRedirectHandle) {
      clearTimeout(exitRedirectHandle);
    }
    exitRedirectHandle = setTimeout(() => {
      window.location.href = target;
    }, 900);
  } else {
    window.location.href = target;
  }
}

returnHomeButton?.addEventListener("click", () => {
  navigateToLanding();
});

mobileHomeButton?.addEventListener("click", () => {
  navigateToLanding();
  closeMobileMenu();
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
      if (key === "sunPreset") {
        isApplyingStarPreset = true;
        guiControllers[key].setValue(params[key]);
        isApplyingStarPreset = false;
      } else {
        guiControllers[key].setValue(params[key]);
      }
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
  updateCore();
  updateSun();
  updateRings();
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
          // Keep the container visible; just clear input
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
        // Keep the container visible; just clear input
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
      // Keep the container visible; just clear input
      importShareInput.value = "";
    }
  }
});

importShareCancel?.addEventListener("click", () => {
  if (importShareContainer && importShareInput) {
    // Keep the container visible; just clear input
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

if (!previewMode) {
  document.addEventListener("keydown", (event) => {
    // Toggle photo mode with P, take photo with Space when in photo mode
    if (event.key.toLowerCase() === "p") {
      if (isPhotoMode) {
        exitPhotoMode();
      } else {
        enterPhotoMode();
      }
      return;
    }
    if (isPhotoMode && (event.code === "Space" || event.key === " ")) {
      event.preventDefault();
      takeScreenshot();
      return;
    }
    if (event.key.toLowerCase() === "h") {
      guiVisible = !guiVisible;
      if (guiVisible) {
        gui.show();
      } else {
        gui.hide();
      }
    }
    if (event.key === "Escape") {
      if (isPhotoMode) {
        exitPhotoMode();
      } else {
        closeMobilePanel();
      }
    }
  });
}
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
    updateCore();
    updateSun();
    updateRings();
    updateTilt();
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

// Start the app
initializeApp().then(() => {
  normalizeMoonSettings();
  regenerateStarfield();
  updateStarfieldUniforms();
  markPlanetDirty();
  markMoonsDirty();
  applyInitialVisualSettings();
  // Also apply immediately in preview mode to ensure consistency
  if (previewMode) {
    try { applyVisualSettings(); } catch {}
  }
});
initMoonPhysics();
updateOrbitLinesVisibility();
applyControlSearch({ scrollToFirst: false });
updateShareCode();
requestAnimationFrame(animate);
//#endregion

// Initialize onboarding and connect Help actions
try {
  initOnboarding({ sceneContainer, controlsContainer, previewMode });
} catch (err) {
  console.warn("Onboarding init failed", err);
}
helpButton?.addEventListener("click", () => {
  try { closeMobileMenu?.(); } catch {}
  showOnboarding(true);
});
mobileHelpButton?.addEventListener("click", () => {
  try { closeMobileMenu?.(); } catch {}
  showOnboarding(true);
});

//#region Animation loop
function animate(timestamp) {
  // FPS cap
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

  stepPlanetOrbit(simulationDelta);

  // Calculate FPS
  frameCount++;
  if (timestamp - fpsUpdateTime >= 1000) {
    fps = Math.round((frameCount * 1000) / (timestamp - fpsUpdateTime));
    frameCount = 0;
    fpsUpdateTime = timestamp;
    if (debugFpsDisplay) {
      debugFpsDisplay.textContent = fps;
    }
    const hudFps = document.getElementById("hud-fps");
    if (hudFps) hudFps.textContent = `FPS: ${fps}`;
  }

  // Update camera by mode
  if (cameraMode === CameraMode.ORBIT) {
    controls.enabled = true;
    if (params.planetMotionEnabled) {
      const target = planetRoot.getWorldPosition(tmpVecA);
      controls.target.lerp(target, 0.12);
    }
    controls.update();
  } else if (cameraMode === CameraMode.SURFACE) {
    controls.enabled = false;
    const planetCenter = planetRoot.getWorldPosition(tmpVecA);
    // Keep surface view stable and not occluded by planet
    const spinQuat = spinGroup.getWorldQuaternion(tmpQuatA);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(spinQuat);
    const up = tmpVecC.copy(planetCenter).normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const tangentForward = new THREE.Vector3().crossVectors(right, up).normalize();
    const target = new THREE.Vector3().copy(planetCenter);
    const radius = Math.max(0.3, params.radius);
    const eye = new THREE.Vector3().copy(target)
      .addScaledVector(up, radius + 0.08)
      .addScaledVector(tangentForward, 0.22);
    camera.position.lerp(eye, 0.2);
    camera.lookAt(target.addScaledVector(up, radius + 0.02));
  } else if (cameraMode === CameraMode.CHASE) {
    controls.enabled = false;
    if (!chaseTarget && moonsGroup.children.length > 0) {
      chaseTarget = moonsGroup.children[0];
    }
    if (chaseTarget && chaseTarget.userData?.mesh) {
      chaseTarget.updateMatrixWorld(true);
      const targetPos = chaseTarget.userData.mesh.getWorldPosition(tmpVecB);
      const vel = chaseTarget.userData.physics?.velWorld || tmpVecD.set(0, 0, 0);
      const speed = Math.max(0.001, vel.length());
      const back = tmpVecC.copy(vel).normalize().multiplyScalar(-THREE.MathUtils.clamp(0.6 + speed * 0.12, 0.6, 2.0));
      const up2 = tmpVecD.copy(targetPos).normalize().multiplyScalar(THREE.MathUtils.clamp(0.35 + speed * 0.05, 0.35, 1.2));
      const lateral = tmpVecE.copy(vel).cross(targetPos).normalize().multiplyScalar(0.15);
      const desired = new THREE.Vector3().copy(targetPos).add(back).add(up2).add(lateral);
      camera.position.lerp(desired, 0.18);
      const lookAhead = new THREE.Vector3().copy(targetPos).addScaledVector(vel, 0.15);
      camera.lookAt(lookAhead);
    } else {
      controls.enabled = true;
      controls.update();
    }
  } else if (cameraMode === CameraMode.FOCUS) {
    // Enable controls for manual camera movement
    controls.enabled = true;
    controls.update();
    
    if (focusTarget) {
      focusTarget.updateMatrixWorld(true);
      let targetPos;
      
      // Get the world position of the focused object
      if (focusTarget === planetMesh) {
        targetPos = planetRoot.getWorldPosition(tmpVecB);
      } else if (focusTarget === sunVisual || focusTarget === sunCorona) {
        targetPos = sunGroup.getWorldPosition(tmpVecB);
      } else if (focusTarget.parent === blackHoleGroup) {
        targetPos = blackHoleGroup.getWorldPosition(tmpVecB);
      } else if (focusTarget.parent && focusTarget.parent.parent === moonsGroup) {
        // This is a moon mesh
        targetPos = focusTarget.getWorldPosition(tmpVecB);
      } else {
        targetPos = focusTarget.getWorldPosition(tmpVecB);
      }
      
      // Update controls target to focus on the selected object
      controls.target.lerp(targetPos, 0.1);
      
      // Calculate appropriate distance based on object size for initial positioning
      let minDistance, maxDistance;
      if (focusTarget === planetMesh) {
        minDistance = Math.max(1, params.radius * 1.2);
        maxDistance = Math.max(25, params.radius * 15); // Increased max distance for planets
      } else if (focusTarget === sunVisual || focusTarget === sunCorona) {
        minDistance = Math.max(2, params.sunSize * 1.5);
        maxDistance = Math.max(40, params.sunSize * 12); // Increased max distance for sun
      } else if (focusTarget.parent === blackHoleGroup) {
        minDistance = 3;
        maxDistance = 50; // Increased max distance for black holes
      } else {
        // For moons
        const moonSize = focusTarget.geometry?.boundingSphere?.radius || 0.2;
        minDistance = Math.max(0.8, moonSize * 2);
        maxDistance = Math.max(15, moonSize * 20); // Increased max distance for moons
      }
      
      // Mobile-specific adjustments for better focus positioning
      if (isMobileLayout()) {
        // Adjust distances for mobile viewport
        minDistance *= 0.8; // Closer minimum distance on mobile
        maxDistance *= 0.9; // Slightly closer maximum distance on mobile
        
        // Adjust camera position for mobile aspect ratio
        const currentDistance = camera.position.distanceTo(controls.target);
        if (currentDistance > maxDistance) {
          // Move camera closer to target on mobile
          const direction = camera.position.clone().sub(controls.target).normalize();
          camera.position.copy(controls.target).add(direction.multiplyScalar(maxDistance * 0.7));
        }
      }
      
      // Update controls distance limits
      controls.minDistance = minDistance;
      controls.maxDistance = maxDistance;
    } else {
      // If no focus target, fall back to orbit mode
      cameraMode = CameraMode.ORBIT;
      if (cameraModeButton) cameraModeButton.textContent = `Camera: ${cameraMode}`;
      // Reset controls to default values
      controls.minDistance = 2;
      controls.maxDistance = 80;
    }
  }

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

  if (params.ringEnabled && ringMeshes && ringMeshes.length) {
    for (let i = 0; i < ringMeshes.length; i += 1) {
      const mesh = ringMeshes[i];
      if (!mesh) continue;
      const speed = (mesh.userData?.spinSpeed ?? params.ringSpinSpeed ?? 0);
      if (Math.abs(speed) > 1e-4) {
        mesh.rotation.z += delta * speed;
      }
    }
  }

  if (params.sunVariant !== "Black Hole") {
    starCoreUniforms.uTime.value += delta;
    starCoronaUniforms.uTime.value += delta * 0.6;

    if (params.sunPulseSpeed > 0.001) {
      sunPulsePhase += delta * params.sunPulseSpeed * 2.4;
      const pulse = Math.sin(sunPulsePhase) * 0.5 + 0.5;
      const pulseStrength = Math.max(0.05, params.sunGlowStrength || 1) * 0.22;
      starCoreUniforms.uPulse.value = (pulse - 0.5) * pulseStrength;
      starCoronaUniforms.uPulse.value = (pulse - 0.4) * pulseStrength * 1.35;
      const baseCoreScale = Math.max(0.1, params.sunSize);
      const baseHaloScale = Math.max(baseCoreScale * 1.15, params.sunHaloSize);
      const glowStrength = Math.max(0.05, params.sunGlowStrength || 1);
      const coreScaleMultiplier = 1 + (pulse - 0.5) * glowStrength * 0.08;
      const haloScaleMultiplier = 1 + (pulse - 0.4) * glowStrength * 0.12;
      sunVisual.scale.setScalar(baseCoreScale * THREE.MathUtils.clamp(coreScaleMultiplier, 0.85, 1.4));
      sunCorona.scale.setScalar(baseHaloScale * THREE.MathUtils.clamp(haloScaleMultiplier, 0.8, 1.6));
    } else {
      starCoreUniforms.uPulse.value = 0;
      starCoronaUniforms.uPulse.value = 0;
      const baseCoreScale = Math.max(0.1, params.sunSize);
      const baseHaloScale = Math.max(baseCoreScale * 1.15, params.sunHaloSize);
      sunVisual.scale.setScalar(baseCoreScale);
      sunCorona.scale.setScalar(baseHaloScale);
    }

    updateStarParticles(simulationDelta);
  } else {
    starCoreUniforms.uPulse.value = 0;
    starCoronaUniforms.uPulse.value = 0;
  }

  if (params.sunVariant === "Black Hole") {
    const spinSpeed = params.blackHoleSpinSpeed ?? 0;
    if (Math.abs(spinSpeed) > 1e-4) {
      blackHoleState.spinAngle = (blackHoleState.spinAngle || 0) + delta * spinSpeed;
      applyBlackHoleSpinRotation();
    } else if (blackHoleState.spinAngle) {
      blackHoleState.spinAngle = 0;
      applyBlackHoleSpinRotation();
    }
    const haloSpin = params.blackHoleHaloSpinSpeed ?? 0;
    if (Math.abs(haloSpin) > 1e-4) {
      blackHoleState.haloSpinAngle = (blackHoleState.haloSpinAngle || 0) + delta * haloSpin;
      applyBlackHoleHaloSpinRotation();
    } else if (blackHoleState.haloSpinAngle) {
      blackHoleState.haloSpinAngle = 0;
      applyBlackHoleHaloSpinRotation();
    }
  } else if (blackHoleState.spinAngle) {
    blackHoleState.spinAngle = 0;
    applyBlackHoleSpinRotation();
  }

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
      const semiMajor = Math.max(0.5, moon.distance || 3.5);
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

  if (params.planetType === 'gas_giant') {
    planetMaterial.vertexColors = false;
    planetMaterial.map = generateGasGiantTexture(params);
    planetMaterial.needsUpdate = true;

    const gasDetailScale = Math.max(0.25, Math.min(2.0, visualSettings?.gasResolution ?? 1.0));
    const gasSegments = Math.max(24, Math.round(128 * gasDetailScale));
    const geometry = new THREE.SphereGeometry(params.radius, gasSegments, gasSegments);
    planetMesh.geometry.dispose();
    planetMesh.geometry = geometry;

    oceanMesh.visible = false;
    foamMesh.visible = false;

  } else {
    planetMaterial.vertexColors = true;
    planetMaterial.map = null;
    planetMaterial.needsUpdate = true;

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

      const color = sampleColor(normalized, finalRadius);
      colors[i * 3 + 0] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    planetMesh.geometry.dispose();
    planetMesh.geometry = geometry;

    const oceanVisible = params.oceanLevel > 0.001 && params.noiseAmplitude > 0.0001;
    const oceanScale = params.radius * 1.001;
    const foamScale = params.radius * 1.003;
    oceanMesh.visible = oceanVisible;
    foamMesh.visible = oceanVisible && params.foamEnabled;
    if (oceanVisible) {
      oceanMesh.scale.setScalar(oceanScale);
      foamMesh.scale.setScalar(foamScale);
      oceanMesh.material.color.set(palette.ocean);
      foamMesh.material.color.set(palette.foam);

      // Generate shoreline foam texture using equirectangular mapping
      const texWidth = 512;
      const texHeight = 256;
      const data = new Uint8Array(texWidth * texHeight * 4);
      const dir = new THREE.Vector3();
      const warpVecTex = new THREE.Vector3();

      const ridgeFreq = profile.ridgeFrequency;
      const ruggedPower = profile.ruggedPower;
      const ridgeWeight = profile.ridgeWeight;
      const billowWeight = profile.billowWeight;
      const plateauPower = profile.plateauPower;
      const sharpness = profile.sharpness;
      const strStrength = profile.striationStrength;
      const strFreq = profile.striationFrequency;
      const strPhase = profile.striationPhase;
      const equatorLift = profile.equatorLift;
      const poleDrop = profile.poleDrop;
      const craterFreq = profile.craterFrequency;
      const craterThresh = profile.craterThreshold;
      const craterDepth = profile.craterDepth;
      const craterSharp = profile.craterSharpness;
      const warpStrength = profile.warpStrength * 0.35;
      const warpOffset = profile.warpOffset;
      const craterOffset = profile.craterOffset;

      const shorelineHalfWidth = Math.max(0.002, params.noiseAmplitude * 0.06);

      for (let y = 0; y < texHeight; y += 1) {
        const v = y / (texHeight - 1);
        const lat = (v - 0.5) * Math.PI; // -pi/2..pi/2
        const cosLat = Math.cos(lat);
        const sinLat = Math.sin(lat);
        for (let x = 0; x < texWidth; x += 1) {
          const u = x / (texWidth - 1);
          const lon = (u - 0.5) * Math.PI * 2;
          const cosLon = Math.cos(lon);
          const sinLon = Math.sin(lon);
          dir.set(cosLat * cosLon, sinLat, cosLat * sinLon);

          // Apply same directional warp used for terrain sampling
          let sampleDirX = dir.x;
          let sampleDirY = dir.y;
          let sampleDirZ = dir.z;
          if (warpStrength > 0) {
            const fx = profile.warpFrequency;
            warpVecTex.set(
              warpNoiseX(sampleDirX * fx + warpOffset.x, sampleDirY * fx + warpOffset.y, sampleDirZ * fx + warpOffset.z),
              warpNoiseY(sampleDirX * fx + warpOffset.y, sampleDirY * fx + warpOffset.z, sampleDirZ * fx + warpOffset.x),
              warpNoiseZ(sampleDirX * fx + warpOffset.z, sampleDirY * fx + warpOffset.x, sampleDirZ * fx + warpOffset.y)
            );
            sampleDirX = (sampleDirX + warpVecTex.x * warpStrength);
            sampleDirY = (sampleDirY + warpVecTex.y * warpStrength);
            sampleDirZ = (sampleDirZ + warpVecTex.z * warpStrength);
            const invLen = 1 / Math.sqrt(sampleDirX * sampleDirX + sampleDirY * sampleDirY + sampleDirZ * sampleDirZ);
            sampleDirX *= invLen; sampleDirY *= invLen; sampleDirZ *= invLen;
          }

          // Fractal noise accumulation
          let amplitude = 1;
          let frequency = params.noiseFrequency;
          let totalAmplitude = 0;
          let sum = 0;
          let ridgeSum = 0;
          let billowSum = 0;
          for (let layer = 0; layer < params.noiseLayers; layer += 1) {
            const o = offsets[layer];
            const sx = sampleDirX * frequency + o.x;
            const sy = sampleDirY * frequency + o.y;
            const sz = sampleDirZ * frequency + o.z;
            const s = baseNoise(sx, sy, sz);
            sum += s * amplitude;

            const r = ridgeNoise(sx * ridgeFreq, sy * ridgeFreq, sz * ridgeFreq);
            ridgeSum += (1 - Math.abs(r)) * amplitude;

            billowSum += Math.pow(Math.abs(s), ruggedPower) * amplitude;

            totalAmplitude += amplitude;
            amplitude *= params.persistence;
            frequency *= params.lacunarity;
          }
          if (totalAmplitude > 0) {
            sum /= totalAmplitude;
            ridgeSum /= totalAmplitude;
            billowSum /= totalAmplitude;
          }

          let elev = sum;
          elev = THREE.MathUtils.lerp(elev, ridgeSum * 2 - 1, ridgeWeight);
          elev = THREE.MathUtils.lerp(elev, billowSum * 2 - 1, billowWeight);
          elev = Math.sign(elev) * Math.pow(Math.abs(elev), sharpness);
          let normalized = elev * 0.5 + 0.5;
          normalized = Math.pow(THREE.MathUtils.clamp(normalized, 0, 1), plateauPower);
          if (strStrength > 0) {
            const str = Math.sin((sampleDirX + sampleDirZ) * strFreq + strPhase);
            normalized += str * strStrength;
          }
          if (equatorLift || poleDrop) {
            const latitude = Math.abs(sampleDirY);
            normalized += (1 - latitude) * equatorLift;
            normalized -= latitude * poleDrop;
          }
          const cSamp = craterNoise(sampleDirX * craterFreq + craterOffset.x, sampleDirY * craterFreq + craterOffset.y, sampleDirZ * craterFreq + craterOffset.z);
          const cVal = (cSamp + 1) * 0.5;
          if (cVal > craterThresh) {
            const cT = (cVal - craterThresh) / Math.max(1e-6, 1 - craterThresh);
            normalized -= Math.pow(cT, craterSharp) * craterDepth;
          }
          normalized = THREE.MathUtils.clamp(normalized, 0, 1);

          const displacementHere = (normalized - params.oceanLevel) * params.noiseAmplitude;
          const finalR = params.radius + displacementHere;
          const distFromShore = Math.abs(finalR - params.radius);

          // Foam alpha peaks near shoreline and fades with distance
          let alpha = 1 - THREE.MathUtils.smoothstep(distFromShore, 0, shorelineHalfWidth);
          // Slightly bias towards land-side foam
          alpha *= THREE.MathUtils.clamp(0.5 + Math.sign(displacementHere) * 0.5, 0, 1);
          // Add a small dither using lon/lat for natural breakup
          const hash = (Math.sin((x + 37) * 12.9898 + (y + 57) * 78.233) * 43758.5453) % 1;
          alpha = THREE.MathUtils.clamp(alpha * (0.9 + 0.2 * hash), 0, 1);

          const idx = (y * texWidth + x) * 4;
          data[idx + 0] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
          data[idx + 3] = Math.round(alpha * 255);
        }
      }

      if (foamTexture && foamTexture.dispose) {
        foamTexture.dispose();
      }
      foamTexture = new THREE.DataTexture(data, texWidth, texHeight, THREE.RGBAFormat);
      foamTexture.colorSpace = THREE.SRGBColorSpace;
      foamTexture.needsUpdate = true;
      foamTexture.wrapS = THREE.RepeatWrapping;
      foamTexture.wrapT = THREE.ClampToEdgeWrapping;
      foamTexture.magFilter = THREE.LinearFilter;
      foamTexture.minFilter = THREE.LinearMipMapLinearFilter;

      foamMesh.material.map = foamTexture;
      foamMesh.material.alphaMap = foamTexture;
      foamMesh.material.needsUpdate = true;
    }
  }

  const cloudScale = params.radius * (1 + Math.max(0.0, params.cloudHeight || 0.03));
  const atmosphereScale = params.radius * (1.06 + Math.max(0.0, (params.cloudHeight || 0.03)) * 0.8);
  cloudsMesh.scale.setScalar(cloudScale);
  atmosphereMesh.scale.setScalar(atmosphereScale);
  
  // Update core sphere
  updateCore();
  
  updateRings();

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

function sampleColor(elevation, radius) {
  let baseColor;
  
  if (elevation <= params.oceanLevel) {
    const oceanT = params.oceanLevel <= 0 ? 0 : THREE.MathUtils.clamp(elevation / Math.max(params.oceanLevel, 1e-6), 0, 1);
    baseColor = palette.ocean.clone().lerp(palette.shallow, Math.pow(oceanT, 0.65));
  } else {
    const landT = THREE.MathUtils.clamp((elevation - params.oceanLevel) / Math.max(1 - params.oceanLevel, 1e-6), 0, 1);

    if (landT < 0.5) {
      const t = Math.pow(landT / 0.5, 1.1);
      baseColor = palette.low.clone().lerp(palette.mid, t);
    } else {
      const highT = Math.pow((landT - 0.5) / 0.5, 1.3);
      baseColor = palette.mid.clone().lerp(palette.high, highT);
    }
  }

  // No core color blending - using physical core sphere instead
  // Apply the sampled baseColor to the shared scratch color and return it
  return scratchColor.copy(baseColor);
}

function updatePalette() {
  palette.ocean.set(params.colorOcean);
  palette.shallow.set(params.colorShallow);
  palette.foam.set(params.colorFoam);
  palette.low.set(params.colorLow);
  palette.mid.set(params.colorMid);
  palette.high.set(params.colorHigh);
  palette.core.set(params.colorCore);
  palette.atmosphere.set(params.atmosphereColor);
  atmosphereMaterial.color.copy(palette.atmosphere);
}

function updateCore() {
  if (coreMesh) {
    const coreScale = params.radius * params.coreSize;
    coreMesh.scale.setScalar(coreScale);
    coreMesh.material.color.set(params.colorCore);
    
    // Core is solid when enabled and visible
    coreMesh.visible = params.coreEnabled && params.coreVisible;
    
    // Update material properties for better rendering
    coreMesh.material.needsUpdate = true;
  }
}

function updateClouds() {
  cloudsMaterial.opacity = params.cloudsOpacity;
  atmosphereMaterial.opacity = params.atmosphereOpacity;
  // Toggle visibility based on opacity for reliability
  cloudsMesh.visible = params.cloudsOpacity > 0.001;
  atmosphereMesh.visible = params.atmosphereOpacity > 0.001;
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
  const isBlackHole = params.sunVariant === "Black Hole";
  const distance = params.sunDistance;
  const variantChanged = currentSunVariant !== params.sunVariant;

  if (variantChanged) {
    resetBlackHoleState();
    if (isBlackHole) {
      disposeStarParticles();
    }
    currentSunVariant = params.sunVariant;
  }

  sunGroup.position.set(distance, distance * 0.35, distance);
  sunLight.color.copy(color);
  sunLight.intensity = Math.max(0, params.sunIntensity);
  sunLight.target = planetRoot;
  sunLight.target.updateMatrixWorld();

  sunVisual.visible = !isBlackHole;
  sunCorona.visible = !isBlackHole;
  blackHoleGroup.visible = isBlackHole;
  if (starParticleState.points) {
    starParticleState.points.visible = !isBlackHole;
  }

  if (isBlackHole) {
    updateBlackHole(color);
    sunPulsePhase = 0;
    return;
  }

  const edgeColor = color.clone().lerp(new THREE.Color(1, 0.72, 0.42), 0.35);

  starCoreUniforms.uColorCore.value.copy(color);
  starCoreUniforms.uColorEdge.value.copy(edgeColor);
  starCoronaUniforms.uColor.value.copy(edgeColor);

  const coreScale = Math.max(0.1, params.sunSize);
  sunVisual.scale.setScalar(coreScale);

  const haloRadius = Math.max(coreScale * 1.15, params.sunHaloSize);
  sunCorona.scale.setScalar(haloRadius);

  const glowStrength = Math.max(0.05, params.sunGlowStrength);
  const noiseResolutionScale = Math.max(0.25, Math.min(2.0, visualSettings?.noiseResolution ?? 1.0));
  const noiseScale = Math.max(0.2, (params.sunNoiseScale || 1.6) * noiseResolutionScale);
  starCoreUniforms.uNoiseScale.value = noiseScale;
  starCoreUniforms.uNoiseStrength.value = glowStrength * 0.35;
  starCoronaUniforms.uNoiseScale.value = noiseScale * 0.75;
  starCoronaUniforms.uNoiseStrength.value = glowStrength * 0.45;

  let desiredCount = Math.max(0, Math.round(params.sunParticleCount || 0));
  if (visualSettings?.particleMax != null) {
    desiredCount = Math.min(desiredCount, Math.max(100, visualSettings.particleMax));
  }
  if (desiredCount !== params.sunParticleCount) {
    params.sunParticleCount = desiredCount;
  }
  if (desiredCount !== starParticleState.count) {
    rebuildStarParticles(desiredCount);
  } else if (starParticleState.material) {
    starParticleState.material.size = Math.max(0.02, params.sunParticleSize || 0.1);
    starParticleState.material.color.set(params.sunParticleColor || params.sunColor || "#ffd27f");
    starParticleState.material.needsUpdate = true;
  }

  starParticleState.speed = Math.max(0, params.sunParticleSpeed || 0.6);
  starParticleState.baseLifetime = Math.max(0.5, params.sunParticleLifetime || 3.5);
  starParticleState.color = params.sunParticleColor || params.sunColor || "#ffd27f";

  sunPulsePhase = 0;
}

function resetBlackHoleState() {
  blackHoleState.lastCoreSize = null;
  blackHoleState.lastDiskRadius = null;
  blackHoleState.lastDiskThickness = null;
  blackHoleState.lastDiskIntensity = null;
  blackHoleState.lastDiskTilt = null;
  blackHoleState.lastDiskYaw = null;
  blackHoleState.lastDiskNoiseScale = null;
  blackHoleState.lastDiskNoiseStrength = null;
  blackHoleState.lastHaloRadius = null;
  blackHoleState.lastHaloAngle = null;
  blackHoleState.lastHaloThickness = null;
  blackHoleState.lastHaloIntensity = null;
  blackHoleState.lastHaloNoiseScale = null;
  blackHoleState.lastHaloNoiseStrength = null;
  blackHoleState.baseTwist = 0;
  blackHoleState.spinAngle = 0;
  blackHoleState.lastColor.setRGB(0, 0, 0);
  if (blackHoleOrientationGroup) {
    blackHoleOrientationGroup.rotation.set(0, 0, 0);
  }
  if (blackHoleSpinGroup) {
    blackHoleSpinGroup.rotation.set(0, 0, 0);
  }
}

function updateBlackHole(baseColor) {
  const color = baseColor || new THREE.Color(params.sunColor);

  const coreSize = Math.max(0.1, params.blackHoleCoreSize || 0.6);
  if (blackHoleState.lastCoreSize !== coreSize) {
    blackHoleCore.scale.setScalar(coreSize);
    blackHoleState.lastCoreSize = coreSize;
  }

  const diskRadius = Math.max(coreSize + 0.05, params.blackHoleDiskRadius || coreSize * 3);
  const diskThickness = THREE.MathUtils.clamp(params.blackHoleDiskThickness ?? 0.35, 0.05, 0.95);
  const diskInner = THREE.MathUtils.clamp(diskRadius * (1 - diskThickness), coreSize * 1.05, diskRadius - 0.02);
  const diskIntensity = Math.max(0, params.blackHoleDiskIntensity ?? 1.5);
  const diskFeather = THREE.MathUtils.clamp(diskRadius * 0.18 * diskThickness, 0.04, diskRadius * 0.45);
  const noiseResolutionScale = Math.max(0.25, Math.min(2.0, visualSettings?.noiseResolution ?? 1.0));
  const diskNoiseScale = Math.max(0.01, (params.blackHoleDiskNoiseScale ?? 1) * noiseResolutionScale);
  const diskNoiseStrength = Math.max(0, params.blackHoleDiskNoiseStrength ?? 0);

  if (blackHoleState.lastDiskRadius !== diskRadius) {
    blackHoleDisk.scale.setScalar(diskRadius);
    blackHoleState.lastDiskRadius = diskRadius;
  }

  // Update materials based on selected style
  blackHoleDisk.visible = params.blackHoleDiskEnabled !== false;
  const diskStyle = params.blackHoleDiskStyle || "Noise"; // Noise | Flat | Texture
  if (diskStyle === "Noise") {
    if (!(blackHoleDisk.material && blackHoleDisk.material.uniforms)) {
      // switch back to shader material if needed
      blackHoleDisk.material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(blackHoleDiskUniforms),
        vertexShader: blackHoleDiskVertexShader,
        fragmentShader: blackHoleDiskFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
    }
    const diskUniforms = blackHoleDisk.material.uniforms;
    diskUniforms.uScale.value = diskRadius;
    diskUniforms.uOuterRadius.value = diskRadius;
    diskUniforms.uInnerRadius.value = diskInner;
    diskUniforms.uFeather.value = diskFeather;
    diskUniforms.uIntensity.value = diskIntensity;
    diskUniforms.uNoiseScale.value = diskNoiseScale;
    diskUniforms.uNoiseStrength.value = diskNoiseStrength;
    diskUniforms.uColor.value.copy(color);
    blackHoleDisk.material.opacity = 1;
    blackHoleDisk.material.needsUpdate = true;
  } else if (diskStyle === "Flat") {
    // Flat ring: color-only band using alphaMap annulus (no noise)
    if (blackHoleDiskTexture) try { blackHoleDiskTexture.dispose(); } catch {}
    blackHoleDiskTexture = generateAnnulusTexture({
      innerRatio: THREE.MathUtils.clamp(diskInner / Math.max(0.0001, diskRadius), 0, 0.98),
      color: color,
      opacity: THREE.MathUtils.clamp(diskIntensity, 0, 1),
      noiseScale: 1.0,
      noiseStrength: 0.0,
      seedKey: "bh-disk-flat"
    });
    if (!blackHoleDiskBasicMaterial || !blackHoleDiskBasicMaterial.isMeshBasicMaterial) {
      blackHoleDiskBasicMaterial = new THREE.MeshBasicMaterial({
        color: color.clone(),
        transparent: true,
        opacity: 1,
        alphaMap: blackHoleDiskTexture,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
    } else {
      blackHoleDiskBasicMaterial.color.copy(color);
      blackHoleDiskBasicMaterial.opacity = 1;
      blackHoleDiskBasicMaterial.alphaMap = blackHoleDiskTexture;
      blackHoleDiskBasicMaterial.needsUpdate = true;
    }
    blackHoleDiskBasicMaterial.map = null;
    blackHoleDisk.material = blackHoleDiskBasicMaterial;
  } else {
    // Texture
    if (blackHoleDiskTexture) blackHoleDiskTexture.dispose();
    blackHoleDiskTexture = generateAnnulusTexture({
      innerRatio: THREE.MathUtils.clamp(diskInner / Math.max(0.0001, diskRadius), 0, 0.98),
      color,
      opacity: THREE.MathUtils.clamp(diskIntensity, 0, 1),
      noiseScale: diskNoiseScale,
      noiseStrength: diskNoiseStrength,
      seedKey: "bh-disk"
    });
    if (!blackHoleDiskBasicMaterial || !blackHoleDiskBasicMaterial.isMeshBasicMaterial) {
      blackHoleDiskBasicMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xffffff),
        map: blackHoleDiskTexture,
        alphaMap: blackHoleDiskTexture,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false
      });
    } else {
      blackHoleDiskBasicMaterial.map = blackHoleDiskTexture;
      blackHoleDiskBasicMaterial.alphaMap = blackHoleDiskTexture;
      blackHoleDiskBasicMaterial.needsUpdate = true;
    }
    blackHoleDisk.material = blackHoleDiskBasicMaterial;
  }

  const haloRadius = Math.max(diskRadius * 0.8, params.blackHoleHaloRadius || diskRadius * 1.35);
  const haloThickness = THREE.MathUtils.clamp(params.blackHoleHaloThickness ?? 0.45, 0.05, 0.95);
  const haloInner = THREE.MathUtils.clamp(haloRadius * (1 - haloThickness), diskRadius * 0.65, haloRadius - 0.02);
  const haloIntensity = Math.max(0, params.blackHoleHaloIntensity ?? 0.85);
  const haloFeather = THREE.MathUtils.clamp(haloRadius * 0.22 * haloThickness, 0.06, haloRadius * 0.5);
  const haloNoiseScale = Math.max(0.01, (params.blackHoleHaloNoiseScale ?? 1) * noiseResolutionScale);
  const haloNoiseStrength = Math.max(0, params.blackHoleHaloNoiseStrength ?? 0);

  blackHoleHalo.scale.setScalar(haloRadius);
  blackHoleHaloSecondary.scale.setScalar(haloRadius);

  const haloStyle = params.blackHoleHaloStyle || "Noise";
  const haloEnabled = params.blackHoleHaloEnabled !== false;
  blackHoleHalo.visible = haloEnabled;
  blackHoleHaloSecondary.visible = haloEnabled;
  if (haloStyle === "Noise") {
    // ensure shader materials
    if (!(blackHoleHalo.material && blackHoleHalo.material.uniforms)) {
      blackHoleHalo.material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(blackHoleHaloUniforms),
        vertexShader: blackHoleDiskVertexShader,
        fragmentShader: blackHoleHaloFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
    }
    if (!(blackHoleHaloSecondary.material && blackHoleHaloSecondary.material.uniforms)) {
      blackHoleHaloSecondary.material = blackHoleHalo.material.clone();
    }
    [blackHoleHalo.material, blackHoleHaloSecondary.material].forEach((material) => {
      material.uniforms.uScale.value = haloRadius;
      material.uniforms.uOuterRadius.value = haloRadius;
      material.uniforms.uInnerRadius.value = haloInner;
      material.uniforms.uFeather.value = haloFeather;
      material.uniforms.uIntensity.value = haloIntensity;
      material.uniforms.uNoiseScale.value = haloNoiseScale;
      material.uniforms.uNoiseStrength.value = haloNoiseStrength;
      material.uniforms.uColor.value.copy(color);
    });
  } else if (haloStyle === "Flat") {
    // basic semi-transparent colored halos
    if (!blackHoleHaloBasicMaterial || !blackHoleHaloBasicMaterial.isMeshBasicMaterial) {
      blackHoleHaloBasicMaterial = new THREE.MeshBasicMaterial({
        color: color.clone(),
        transparent: true,
        opacity: THREE.MathUtils.clamp(haloIntensity, 0, 1),
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
      blackHoleHaloSecondaryBasicMaterial = blackHoleHaloBasicMaterial.clone();
    } else {
      blackHoleHaloBasicMaterial.color.copy(color);
      blackHoleHaloBasicMaterial.opacity = THREE.MathUtils.clamp(haloIntensity, 0, 1);
      blackHoleHaloSecondaryBasicMaterial.color.copy(color);
      blackHoleHaloSecondaryBasicMaterial.opacity = THREE.MathUtils.clamp(haloIntensity, 0, 1);
    }
    blackHoleHalo.material = blackHoleHaloBasicMaterial;
    blackHoleHaloSecondary.material = blackHoleHaloSecondaryBasicMaterial;
  } else {
    // Texture style using ring texture generator
    if (blackHoleHaloTexture) blackHoleHaloTexture.dispose();
    blackHoleHaloTexture = generateAnnulusTexture({
      innerRatio: THREE.MathUtils.clamp(haloInner / Math.max(0.0001, haloRadius), 0, 0.98),
      color,
      opacity: THREE.MathUtils.clamp(haloIntensity, 0, 1),
      noiseScale: haloNoiseScale,
      noiseStrength: haloNoiseStrength,
      seedKey: "bh-halo"
    });
    const matTex = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      map: blackHoleHaloTexture,
      alphaMap: blackHoleHaloTexture,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    blackHoleHalo.material = matTex;
    blackHoleHaloSecondary.material = matTex.clone();
  }

  const haloAngle = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(params.blackHoleHaloAngle ?? 68, 0, 170));
  blackHoleHalo.rotation.set(haloAngle, Math.PI / 2, (blackHoleState.haloSpinAngle || 0));
  blackHoleHaloSecondary.rotation.set(-haloAngle, -Math.PI / 2, -(blackHoleState.haloSpinAngle || 0));

  const diskTilt = THREE.MathUtils.degToRad(params.blackHoleDiskTilt ?? 0);
  const diskYaw = THREE.MathUtils.degToRad(params.blackHoleDiskYaw ?? 0);
  if (blackHoleState.lastDiskTilt !== diskTilt || blackHoleState.lastDiskYaw !== diskYaw) {
    const orientationEuler = new THREE.Euler(diskTilt, diskYaw, 0, "ZYX");
    blackHoleOrientationGroup.setRotationFromEuler(orientationEuler);
    blackHoleState.lastDiskTilt = diskTilt;
    blackHoleState.lastDiskYaw = diskYaw;
  }

  const baseTwist = THREE.MathUtils.degToRad(params.blackHoleDiskTwist ?? 0);
  if (blackHoleState.baseTwist !== baseTwist) {
    blackHoleState.baseTwist = baseTwist;
  }

  blackHoleState.lastDiskThickness = diskThickness;
  blackHoleState.lastDiskIntensity = diskIntensity;
  blackHoleState.lastDiskNoiseScale = diskNoiseScale;
  blackHoleState.lastDiskNoiseStrength = diskNoiseStrength;
  blackHoleState.lastHaloRadius = haloRadius;
  blackHoleState.lastHaloThickness = haloThickness;
  blackHoleState.lastHaloIntensity = haloIntensity;
  blackHoleState.lastHaloAngle = haloAngle;
  blackHoleState.lastHaloNoiseScale = haloNoiseScale;
  blackHoleState.lastHaloNoiseStrength = haloNoiseStrength;
  blackHoleState.lastColor.copy(color);

  applyBlackHoleSpinRotation();
}

function applyBlackHoleSpinRotation() {
  if (!blackHoleDisk) return;
  // Spin only the noisy disk mesh around its own axis; keep halos static
  blackHoleDisk.rotation.z = (blackHoleState.baseTwist || 0) + (blackHoleState.spinAngle || 0);
}

function applyBlackHoleHaloSpinRotation() {
  if (!blackHoleHalo || !blackHoleHaloSecondary) return;
  // Spin halos in place around their local normal (Z here after set)
  blackHoleHalo.rotation.z = (blackHoleState.haloSpinAngle || 0);
  blackHoleHaloSecondary.rotation.z = -(blackHoleState.haloSpinAngle || 0);
}

function disposeStarParticles() {
  if (starParticleState.points) {
    sunGroup.remove(starParticleState.points);
    if (starParticleState.geometry) starParticleState.geometry.dispose();
    if (starParticleState.material) starParticleState.material.dispose();
    if (starParticleState.texture) starParticleState.texture.dispose();
  }
  starParticleState = {
    points: null,
    geometry: null,
    material: null,
    texture: null,
    positions: null,
    velocities: null,
    life: null,
    maxLife: null,
    rng: null,
    count: 0,
    speed: Math.max(0, params.sunParticleSpeed || 0.6),
    baseLifetime: Math.max(0.5, params.sunParticleLifetime || 3.5),
    color: params.sunParticleColor || params.sunColor || "#ffd27f"
  };
}

function randomUnitVector(rng) {
  const theta = rng.next() * Math.PI * 2;
  const u = rng.next() * 2 - 1;
  const s = Math.sqrt(Math.max(1e-6, 1 - u * u));
  return { x: s * Math.cos(theta), y: u, z: s * Math.sin(theta) };
}

function respawnStarParticle(index, rng, randomizeLife = false) {
  if (!starParticleState.positions || !starParticleState.velocities || !starParticleState.life || !starParticleState.maxLife) return;
  const dir = randomUnitVector(rng);
  const radius = Math.max(0.05, params.sunSize || 1) * (0.25 + rng.next() * 0.45);
  const i3 = index * 3;
  starParticleState.positions[i3 + 0] = dir.x * radius;
  starParticleState.positions[i3 + 1] = dir.y * radius;
  starParticleState.positions[i3 + 2] = dir.z * radius;

  // Tangent vector via simple perpendicular
  let tx = -dir.z;
  let ty = 0;
  let tz = dir.x;
  let len = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (len < 1e-5) {
    tx = 0;
    ty = dir.z;
    tz = -dir.y;
    len = Math.sqrt(tx * tx + ty * ty + tz * tz);
  }
  const invLen = len > 1e-5 ? 1 / len : 1;
  tx *= invLen;
  ty *= invLen;
  tz *= invLen;

  const radialSpeed = 0.6 + rng.next() * 0.9;
  const tangentScale = (rng.next() - 0.5) * 0.35;
  starParticleState.velocities[i3 + 0] = dir.x * radialSpeed + tx * tangentScale;
  starParticleState.velocities[i3 + 1] = dir.y * radialSpeed + ty * tangentScale;
  starParticleState.velocities[i3 + 2] = dir.z * radialSpeed + tz * tangentScale;

  const baseLife = starParticleState.baseLifetime ?? Math.max(0.5, params.sunParticleLifetime || 3.5);
  starParticleState.life[index] = randomizeLife ? rng.next() * baseLife * 0.3 : 0;
  starParticleState.maxLife[index] = baseLife * (0.6 + rng.next() * 0.6);
}

function rebuildStarParticles(desiredCount) {
  disposeStarParticles();
  if (desiredCount <= 0) {
    return;
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(desiredCount * 3);
  const velocities = new Float32Array(desiredCount * 3);
  const life = new Float32Array(desiredCount);
  const maxLife = new Float32Array(desiredCount);
  const rng = new SeededRNG(`${params.seed || "star"}-particles-${desiredCount}`);

  starParticleState.positions = positions;
  starParticleState.velocities = velocities;
  starParticleState.life = life;
  starParticleState.maxLife = maxLife;
  starParticleState.count = desiredCount;
  starParticleState.rng = rng;
  starParticleState.speed = Math.max(0, params.sunParticleSpeed || 0.6);
  starParticleState.baseLifetime = Math.max(0.5, params.sunParticleLifetime || 3.5);
  starParticleState.color = params.sunParticleColor || params.sunColor || "#ffd27f";

  for (let i = 0; i < desiredCount; i += 1) {
    respawnStarParticle(i, rng, true);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const texture = createSunTexture({ inner: 0.0, outer: 0.6, innerAlpha: 1, outerAlpha: 0, resolution: visualSettings?.noiseResolution ?? 1.0 });
  const material = new THREE.PointsMaterial({
    size: Math.max(0.02, params.sunParticleSize || 0.1),
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color(params.sunParticleColor || params.sunColor || "#ffd27f"),
    sizeAttenuation: true
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  sunGroup.add(points);

  starParticleState.points = points;
  starParticleState.geometry = geometry;
  starParticleState.material = material;
  starParticleState.texture = texture;
  starParticleState.positions = positions;
  starParticleState.velocities = velocities;
  starParticleState.life = life;
  starParticleState.maxLife = maxLife;
  starParticleState.rng = rng;
  starParticleState.count = desiredCount;
  starParticleState.speed = Math.max(0, params.sunParticleSpeed || 0.6);
  starParticleState.baseLifetime = Math.max(0.5, params.sunParticleLifetime || 3.5);
  starParticleState.color = params.sunParticleColor || params.sunColor || "#ffd27f";
}

function updateStarParticles(dt) {
  if (!starParticleState.points || !starParticleState.positions) return;
  const count = starParticleState.count;
  if (count <= 0) return;

  const positions = starParticleState.positions;
  const velocities = starParticleState.velocities;
  const life = starParticleState.life;
  const maxLife = starParticleState.maxLife;
  const rng = starParticleState.rng || new SeededRNG(`${params.seed || "star"}-respawn`);
  starParticleState.rng = rng;
  const speed = starParticleState.speed ?? 0.6;
  const baseLifetime = starParticleState.baseLifetime ?? Math.max(0.5, params.sunParticleLifetime || 3.5);

  let needsUpdate = false;
  for (let i = 0; i < count; i += 1) {
    life[i] += dt;
    if (life[i] >= maxLife[i]) {
      respawnStarParticle(i, rng, false);
      maxLife[i] = baseLifetime * (0.6 + rng.next() * 0.6);
      life[i] = rng.next() * baseLifetime * 0.1;
    }

    const idx = i * 3;
    positions[idx + 0] += velocities[idx + 0] * speed * dt;
    positions[idx + 1] += velocities[idx + 1] * speed * dt;
    positions[idx + 2] += velocities[idx + 2] * speed * dt;
    needsUpdate = true;
  }

  if (needsUpdate && starParticleState.geometry) {
    starParticleState.geometry.attributes.position.needsUpdate = true;
  }
}

function generateRingTexture(innerRatio) {
  return generateRingTextureExt(innerRatio, { ...params, noiseResolution: visualSettings?.noiseResolution ?? 1.0 });
}

// Generate an annulus texture with supplied color/noise parameters (for black hole disk/halo Texture style)
function generateAnnulusTexture(opts) {
  return generateAnnulusTextureExt({ ...opts, seed: params.seed, noiseResolution: visualSettings?.noiseResolution ?? 1.0 });
}

function generateGasGiantTexture(p) {
  return generateGasGiantTextureExt({
    ...p,
    noiseResolution: visualSettings?.noiseResolution ?? 1.0,
    gasResolution: visualSettings?.gasResolution ?? 1.0
  });
}

function updateRings() {
  if (!ringGroup) return;
  // Clear all existing meshes/textures if disabled
  if (!params.ringEnabled) {
    ringMeshes.forEach((mesh) => {
      if (!mesh) return;
      if (mesh.material) {
        mesh.material.map = null;
        mesh.material.alphaMap = null;
      }
      if (mesh.parent) mesh.parent.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });
    ringMeshes = [];
    ringTextures.forEach((tex) => tex?.dispose?.());
    ringTextures = [];
    return;
  }

  // Use multi-ring array only; if empty, show no rings
  const angle = THREE.MathUtils.degToRad(params.ringAngle || 0);
  const ringDetailScale = Math.max(0.25, Math.min(1.5, visualSettings?.ringDetail ?? 1.0));
  const segments = Math.max(32, Math.round(256 * ringDetailScale));
  const noiseResolutionScale = Math.max(0.25, Math.min(2.0, visualSettings?.noiseResolution ?? 1.0));
  const ringDefs = Array.isArray(params.rings) ? params.rings : [];
  if (ringDefs.length === 0) {
    // Clear any existing meshes/textures and exit
    ringMeshes.forEach((mesh) => {
      if (!mesh) return;
      if (mesh.material) {
        mesh.material.map = null;
        mesh.material.alphaMap = null;
      }
      if (mesh.parent) mesh.parent.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });
    ringMeshes = [];
    ringTextures.forEach((tex) => tex?.dispose?.());
    ringTextures = [];
    return;
  }

  // Ensure we have matching number of meshes
  while (ringMeshes.length > ringDefs.length) {
    const mesh = ringMeshes.pop();
    if (!mesh) continue;
    if (mesh.material) {
      mesh.material.map = null;
      mesh.material.alphaMap = null;
    }
    if (mesh.parent) mesh.parent.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }
  while (ringMeshes.length < ringDefs.length) {
    const placeholder = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, segments, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }));
    placeholder.renderOrder = 0;
    ringGroup.add(placeholder);
    ringMeshes.push(placeholder);
  }

  // Rebuild textures list to match count
  ringTextures.forEach((tex) => tex?.dispose?.());
  ringTextures = new Array(ringDefs.length).fill(null);

  // Build each ring
  ringDefs.forEach((def, index) => {
    const startR = Math.max(1.05, def.start);
    const endR = Math.max(startR + 0.05, def.end);
    const inner = Math.max(params.radius * startR, params.radius + 0.02);
    const outer = Math.max(params.radius * endR, inner + 0.02);
    const innerRatio = THREE.MathUtils.clamp(inner / outer, 0, 0.98);

    const mesh = ringMeshes[index];
    // Replace geometry and material
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = new THREE.RingGeometry(inner, outer, segments, 1);

    // Choose style
    let texture = null;
    const color = new THREE.Color(def.color || "#c7b299");
    const style = def.style || "Texture"; // Texture or Noise
    const opacity = THREE.MathUtils.clamp(def.opacity ?? 0.6, 0, 1) * (def.brightness ?? 1);

    if (style === "Texture") {
      texture = generateAnnulusTexture({
        innerRatio,
        color,
        opacity,
        noiseScale: def.noiseScale ?? 3.2,
        noiseStrength: def.noiseStrength ?? 0.55,
        seedKey: `ring-${index}`
      });
      if (mesh.material) mesh.material.dispose();
      mesh.material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
        map: texture,
        alphaMap: texture
      });
    } else if (style === "Noise") {
      // Use the black hole disk shader for an animated noise ring
      if (mesh.material) mesh.material.dispose();
      mesh.material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(blackHoleDiskUniforms),
        vertexShader: blackHoleDiskVertexShader,
        fragmentShader: blackHoleDiskFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const u = mesh.material.uniforms;
      u.uColor.value.copy(color);
      u.uInnerRadius.value = inner;
      u.uOuterRadius.value = outer;
      u.uFeather.value = Math.max(0.04, (outer - inner) * 0.22);
      u.uIntensity.value = opacity;
      u.uScale.value = 1;
      u.uNoiseScale.value = Math.max(0.01, (def.noiseScale ?? 1) * noiseResolutionScale);
      u.uNoiseStrength.value = Math.max(0, def.noiseStrength ?? 0.35);
    } else {
      // Fallback to basic texture
      texture = generateAnnulusTexture({ innerRatio, color, opacity, seedKey: `ring-${index}` });
      if (mesh.material) mesh.material.dispose();
      mesh.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, map: texture, alphaMap: texture });
    }

    ringTextures[index] = texture;

    mesh.rotation.set(0, 0, 0);
    mesh.rotation.x = Math.PI / 2 + angle;
    mesh.userData.spinSpeed = def.spinSpeed ?? (params.ringSpinSpeed || 0);
  });
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
    mesh.scale.setScalar(Math.max(0.02, moon.size || 0.15));

    const semiMajor = Math.max(0.5, moon.distance || 3.5);
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
  const semiMajor = Math.max(0.5, moon.distance || 3.5);
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
  const moonRadius = Math.max(0.05, moon.size || 0.15);
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
  const planetVel = planetRoot.userData.planetVel || planetOrbitState.velocity;
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
      const semiMajor = Math.max(0.5, moon.distance || 3.5);
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
  // Ensure the preset selector reflects the applied preset
  try {
    params.preset = name;
    guiControllers.preset?.setValue?.(name);
  } catch {}

  Object.entries(preset).forEach(([key, value]) => {
    if (key === "moons") return;
    if (key === "seed" && keepSeed) return;
    if (!(key in params)) return;
    if (key === "sunPreset") {
      isApplyingStarPreset = true;
      params.sunPreset = value;
      guiControllers.sunPreset?.setValue?.(value);
      isApplyingStarPreset = false;
      return;
    }
    params[key] = value;
    guiControllers[key]?.setValue?.(value);
  });

  if (!keepSeed && preset.seed) {
    params.seed = preset.seed;
    guiControllers.seed?.setValue?.(params.seed);
    updateSeedDisplay();
  }

  // Always ensure core is enabled and visible
  params.coreEnabled = true;
  params.coreVisible = true;
  guiControllers.coreEnabled?.setValue?.(true);
  guiControllers.coreVisible?.setValue?.(true);

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
  handlePlanetMotionParamChange({ resetPosition: true });
  // Rings: default to disabled unless preset explicitly enables
  {
    let nextRingEnabled = false;
    if (Object.prototype.hasOwnProperty.call(preset, 'ringEnabled')) {
      nextRingEnabled = !!preset.ringEnabled;
    } else if (preset.rings && typeof preset.rings.enabled === 'boolean') {
      nextRingEnabled = !!preset.rings.enabled;
    }
    params.ringEnabled = nextRingEnabled;
    guiControllers.ringEnabled?.setValue?.(params.ringEnabled);
  }
  updateRings();
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

function applyStarPreset(name, { skipShareUpdate = false } = {}) {
  const preset = starPresets[name];
  if (!preset) return;
  isApplyingStarPreset = true;

  params.sunVariant = "Star";
  guiControllers.sunVariant?.setValue?.("Star");

  params.sunPreset = name;
  guiControllers.sunPreset?.setValue?.(name);

  Object.entries(preset).forEach(([key, value]) => {
    if (!(key in params)) return;
    params[key] = value;
    guiControllers[key]?.setValue?.(value);
  });

  isApplyingStarPreset = false;
  updateSun();
  handlePlanetMotionParamChange({ resetPosition: true });
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
    if (key === "sunPreset") {
      isApplyingStarPreset = true;
      guiControllers[key]?.setValue?.(data[key]);
      isApplyingStarPreset = false;
    } else {
      guiControllers[key]?.setValue?.(data[key]);
    }
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

  // Rings (optional array)
  if (Array.isArray(data.rings)) {
    params.rings = data.rings.map((r) => ({
      style: r.style || "Texture",
      color: r.color || "#c7b299",
      start: Math.max(1.05, r.start ?? 1.6),
      end: Math.max((r.start ?? 1.6) + 0.05, r.end ?? 2.4),
      opacity: THREE.MathUtils.clamp(r.opacity ?? 0.6, 0, 1),
      noiseScale: Math.max(0.2, r.noiseScale ?? 3.2),
      noiseStrength: THREE.MathUtils.clamp(r.noiseStrength ?? 0.55, 0, 1),
      spinSpeed: r.spinSpeed ?? 0.05,
      brightness: r.brightness ?? 1
    }));
    params.ringCount = params.rings.length;
    guiControllers.ringCount?.setValue?.(params.ringCount);
    guiControllers.rebuildRingControls?.();
  }
  // Backward compatibility: old single-ring fields
  if (!Array.isArray(data.rings) && (data.ringStart !== undefined || data.ringEnd !== undefined || data.ringColor !== undefined)) {
    const start = Math.max(1.05, data.ringStart ?? (params.rings[0]?.start ?? 1.6));
    const end = Math.max(start + 0.05, data.ringEnd ?? (params.rings[0]?.end ?? (start + 0.6)));
    const color = data.ringColor ?? (params.rings[0]?.color ?? "#c7b299");
    const opacity = THREE.MathUtils.clamp(data.ringOpacity ?? (params.rings[0]?.opacity ?? 0.6), 0, 1);
    const noiseScale = Math.max(0.2, data.ringNoiseScale ?? (params.rings[0]?.noiseScale ?? 3.2));
    const noiseStrength = THREE.MathUtils.clamp(data.ringNoiseStrength ?? (params.rings[0]?.noiseStrength ?? 0.55), 0, 1);
    const spinSpeed = data.ringSpinSpeed ?? (params.rings[0]?.spinSpeed ?? params.ringSpinSpeed ?? 0.05);
    params.rings = [{ style: "Texture", color, start, end, opacity, noiseScale, noiseStrength, spinSpeed, brightness: 1 }];
    params.ringCount = 1;
    guiControllers.ringCount?.setValue?.(params.ringCount);
    guiControllers.rebuildRingControls?.();
  }

  if (payload.preset && presets[payload.preset]) {
    params.preset = payload.preset;
    guiControllers.preset?.setValue?.(payload.preset);
  }

  normalizeMoonSettings();

  updatePalette();
  updateClouds();
  updateSun();
  updateRings();
  updateTilt();
  updateGravityDisplay();
  regenerateStarfield();
  updateStarfieldUniforms();
  markPlanetDirty();
  markMoonsDirty();
  handlePlanetMotionParamChange({ resetPosition: true });
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
  updateRings();
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
  const pixelRatio = Math.min(window.devicePixelRatio * visualSettings.resolutionScale, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (starField?.material?.uniforms?.uPixelRatio) {
    starField.material.uniforms.uPixelRatio.value = pixelRatio;
  }
  // Close panel when switching to desktop layout
  if (window.innerWidth > 960) {
    closeMobilePanel(true);
  }
}
//#endregion
//#region Mobile panel toggle
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

function setupMobilePanelToggle() {
  mobileToggleButton?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (infoPanel?.classList.contains("open")) {
      closeMobilePanel();
    } else {
      openMobilePanel();
    }
  });

  panelScrim?.addEventListener("click", () => closeMobilePanel());
  panelScrim?.addEventListener("touchstart", () => closeMobilePanel(), { passive: true });

  // Also allow tapping anywhere in the scene to close on mobile
  sceneContainer?.addEventListener("click", () => {
    if (isMobileLayout() && infoPanel?.classList.contains("open")) closeMobilePanel();
  });
  sceneContainer?.addEventListener("touchstart", () => {
    if (isMobileLayout() && infoPanel?.classList.contains("open")) closeMobilePanel();
  }, { passive: true });

  // Capture any outside clicks to close the panel on mobile
  document.addEventListener("click", (e) => {
    if (!isMobileLayout()) return;
    const target = e.target;
    if (!infoPanel || !infoPanel.classList.contains("open")) return;
    if (infoPanel.contains(target)) return;
    if (mobileToggleButton && (target === mobileToggleButton || mobileToggleButton.contains(target))) {
      // Let the button handle its own click - don't close the panel
      return;
    }
    // Close panel when clicking outside
    closeMobilePanel();
  });
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
  // Include rings array if present
  if (Array.isArray(params.rings)) {
    data.rings = params.rings.map((r) => ({
      style: r.style,
      color: r.color,
      start: r.start,
      end: r.end,
      opacity: r.opacity,
      noiseScale: r.noiseScale,
      noiseStrength: r.noiseStrength,
      spinSpeed: r.spinSpeed,
      brightness: r.brightness
    }));
    data.ringCount = params.ringCount ?? params.rings.length;
  }
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


// Save/Load via API helpers
async function saveConfigurationToAPI(configData, metadata = {}) {
  return saveConfigurationToAPIExt({
    ...configData,
  }, {
    ...metadata,
    preset: params.preset,
    moonCount: params.moonCount,
  });
}

async function loadConfigurationFromAPI(id) {
  return loadConfigurationFromAPIExt(id);
}

function encodeShare(payload) { return encodeShareExt(payload); }
function decodeShare(code) { return decodeShareExt(code); }
function padBase64(str) { return padBase64Ext(str); }

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
  const resScale = Math.max(0.25, Math.min(2.0, visualSettings?.noiseResolution ?? 1.0));
  const width = Math.max(64, Math.round(1024 * resScale));
  const height = Math.max(32, Math.round(512 * resScale));
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
    return navigator.clipboard.writeText(text).catch(() => legacyCopyToClipboard(text));
  }
  return legacyCopyToClipboard(text);
}

function legacyCopyToClipboard(text) {
  return new Promise((resolve, reject) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    textArea.style.left = "0";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const ok = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (ok) resolve(); else reject(new Error("Copy command failed"));
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
  const desiredCount = getStarfieldCount(params.starCount);
  if (desiredCount !== params.starCount) {
    params.starCount = desiredCount;
    guiControllers.starCount?.updateDisplay?.();
  }
  starField = createStarfield({ seed: params.seed, count: desiredCount });
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

function createStarfield({ seed, count }) {
  const desired = getStarfieldCount(count);
  const resolution = visualSettings?.noiseResolution ?? 1.0;
  return createStarfieldExt({ seed, count: desired, resolution });
}

function createSunTexture(opts) {
  return createSunTextureExt({ resolution: visualSettings?.noiseResolution ?? 1.0, ...opts });
}

// Explosion particles when a moon is destroyed
function spawnExplosion(position, color = new THREE.Color(0xffaa66), strength = 1) {
  if (!params.explosionEnabled) return;
  const effectiveStrength = Math.max(0.05, params.explosionStrength) * Math.max(0.1, strength);
  const baseCount = Math.max(10, Math.round(params.explosionParticleBase || 80));
  let count = Math.max(20, Math.floor(baseCount * THREE.MathUtils.clamp(effectiveStrength, 0.2, 4)));
  if (visualSettings?.particleMax != null) {
    count = Math.min(count, Math.max(100, visualSettings.particleMax));
  }
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
    const planetVel = ensurePlanetVelocityVector();
    planetVel.copy(planetOrbitState.velocity);
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

  const planetMass = getPlanetMass();
  const planetVel = ensurePlanetVelocityVector();
  planetVel.copy(planetOrbitState.velocity);
  planetRoot.position.set(0, 0, 0);

  const totalMomentum = tmpVecD.set(0, 0, 0);
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
    const rotMatrix = tmpMatrix3.setFromMatrix4(pivot.matrixWorld);
    const moonMass = getMoonMass(moon);
    const mu = getGravParameter(planetMass, params.physicsTwoWay ? moonMass : 0);
    const velLocal = computeOrbitVelocity(semiMajor, eccentricity, phase, mu, tmpVecA);
    // Apply orbit speed scaling to match non-physics mode behavior
    const rawSpeedSetting = moon.orbitSpeed ?? 0.4;
    const speedMultiplier = (Math.sign(rawSpeedSetting) || 1) * Math.max(0.2, Math.abs(rawSpeedSetting));
    velLocal.multiplyScalar(speedMultiplier);
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
  const planetVel = ensurePlanetVelocityVector();
  planetVel.copy(planetOrbitState.velocity);
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
      const moonRadius = mesh.scale.x;
      const collisionRadius = Math.max(0.1, params.radius) + moonRadius * 0.95;
      if (dist <= collisionRadius) {
        pivot.userData._collided = true;
        collidedIndices.add(index);
      }
      
      // Core collision detection
      if (params.coreEnabled && coreMesh) {
        const coreRadius = params.radius * params.coreSize;
        const coreDist = Math.max(1e-5, phys.posWorld.length());
        if (coreDist <= coreRadius + moonRadius * 0.8) {
          pivot.userData._collided = true;
          collidedIndices.add(index);
          pivot.userData._hitCore = true; // Mark as core collision
        }
      }
    });

  }

  // Keep planet anchored at origin regardless of two-way effects
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
      const isCoreCollision = pivot.userData._hitCore;

      if (params.planetType === 'gas_giant') {
        // Reduce planet size
        params.radius = Math.max(0.1, params.radius * 0.995);
        guiControllers.radius?.setValue?.(params.radius);

        // Smaller explosion
        spawnExplosion(pos, color, strength * 0.2);
      } else {
        // Apply local crater deformation to the planet surface at impact (only for surface collisions)
        if (params.impactDeformation && mesh && !isCoreCollision) {
          try {
            const moonRadius = mesh.scale.x; // in world units (approx projectile radius)
            const planetWorldPos = planetRoot.getWorldPosition(new THREE.Vector3());
            const surfaceNormal = new THREE.Vector3().copy(pos).sub(planetWorldPos).normalize();
            const impactPoint = new THREE.Vector3().copy(planetWorldPos).addScaledVector(surfaceNormal, Math.max(0.01, params.radius));

            // Use momentum and velocity direction to shape crater
            const velocity = phys?.velWorld ? phys.velWorld.clone() : new THREE.Vector3();
            const speed = velocity.length();
            const mass = phys?.mass ?? 1;

            // Direction of travel projected onto the surface (for elongation)
            const travelAlongSurface = velocity.clone().projectOnPlane(surfaceNormal);
            const hasTangent = travelAlongSurface.lengthSq() > 1e-8;
            const tangentDir = hasTangent ? travelAlongSurface.normalize() : new THREE.Vector3(1, 0, 0);

            // Incidence angle relative to the surface normal (0 = head-on)
            const incidence = Math.acos(THREE.MathUtils.clamp(velocity.clone().normalize().negate().dot(surfaceNormal), -1, 1));

            // Scale crater radius and depth by size and speed (tuned for visuals)
            const radiusScale = 0.9 + (params.impactSpeedMul || 0.55) * Math.min(3, speed);
            const impactRadius = moonRadius * radiusScale;

            // Strength scales with momentum and incidence (less depth for very oblique hits)
            const momentumScale = Math.pow(Math.max(1e-6, mass), 0.45) * (0.6 + (params.impactSpeedMul || 0.55) * Math.min(3, speed));
            const sizeFactor = THREE.MathUtils.clamp(
              0.8 + Math.pow(Math.max(0.05, moonRadius), 0.92) * 3.6,
              0.9,
              5.2
            );
            const normalHitScale = 0.5 + 0.5 * Math.max(0, Math.cos(incidence));
            const impactStrength = THREE.MathUtils.clamp(
              (params.impactStrengthMul || 1) * strength * (params.impactMassMul || 1) * momentumScale * normalHitScale * sizeFactor,
              0.3,
              5.5
            );

            applyImpactDeformation(impactPoint, impactRadius, {
              strength: impactStrength,
              directionWorld: tangentDir, // elongate crater along downrange direction
              obliquity: incidence
            });
          } catch (e) {
            console.warn('Impact deformation failed:', e);
          }
        }

        // Different explosion for core vs surface collisions
        if (isCoreCollision) {
          // Core collision: more dramatic explosion with core color
          const coreColor = new THREE.Color(params.colorCore);
          spawnExplosion(pos, coreColor, 3 * strength);
        } else {
          // Surface collision: normal explosion
          spawnExplosion(pos, color, 2 * strength);
        }
      }

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

  const isGasGiant = rng.next() < 1 / 6;

  // Preserve user simulation speed and other settings
  const prevSimSpeed = params.simulationSpeed;
  const preserveFoam = params.foamEnabled;
  const preserveRings = !params.ringAllowRandom;
  const prevRingSettings = preserveRings
    ? {
        ringEnabled: params.ringEnabled,
        ringAngle: params.ringAngle,
        ringSpinSpeed: params.ringSpinSpeed,
        ringCount: params.ringCount,
        rings: params.rings.map(r => ({...r})),
      }
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

  // Restore user-preserved values
  params.simulationSpeed = prevSimSpeed;
  params.foamEnabled = preserveFoam;
  if (preserveRings && prevRingSettings) {
    Object.assign(params, prevRingSettings);
  }

  params.seed = newSeed;

  // Randomize planet parameters
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
    params.coreEnabled = true; // Always enable core
    params.coreSize = THREE.MathUtils.lerp(0.2, 0.6, rng.next());
    params.coreVisible = true; // Always show core
  }

  // Common randomizations
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

  // Randomize sun/environment
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

  // Randomize moons
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

  // Randomize rings if allowed
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
          start,
          end,
          opacity: THREE.MathUtils.lerp(0.4, 0.9, rng.next()),
          noiseScale: THREE.MathUtils.lerp(1.5, 6.0, rng.next()),
          noiseStrength: THREE.MathUtils.lerp(0.1, 0.6, rng.next()),
          spinSpeed: THREE.MathUtils.lerp(-0.1, 0.1, rng.next()),
          brightness: 1
        });
        lastRadius = end;
      }
    }
  }

  // Push all randomized values to GUI controllers
  Object.keys(guiControllers).forEach((key) => {
    if (params[key] !== undefined && guiControllers[key]?.setValue) {
      // isApplyingPreset flag prevents onChange handlers from firing recursively
      isApplyingPreset = true;
      guiControllers[key].setValue(params[key]);
      isApplyingPreset = false;
    }
  });

  // Force controllers to refresh their displays
  try {
    Object.values(guiControllers).forEach((ctrl) => ctrl?.updateDisplay?.());
    guiControllers.refreshPlanetTypeVisibility(params.planetType);
    guiControllers.rebuildRingControls?.();
  } catch {}

  // Update all systems with new parameters
  normalizeMoonSettings();
  handleSeedChanged({ skipShareUpdate: true });
  updatePalette();
  updateClouds();
  updateSun();
  updateRings();
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

// Deform planet mesh around an impact point to create a simple crater
function applyImpactDeformation(worldPosition, impactRadius, { strength = 1, directionWorld = null, obliquity = 0 } = {}) {
  if (!planetMesh || !planetMesh.geometry || !worldPosition) return;
  const geometry = planetMesh.geometry;
  const positions = geometry.getAttribute('position');
  if (!positions) return;
  if (positions.setUsage) {
    try { positions.setUsage(THREE.DynamicDrawUsage); } catch {}
  } else if ('usage' in positions) {
    positions.usage = THREE.DynamicDrawUsage;
  }

  // Center direction in planet local space
  const localImpact = planetMesh.worldToLocal(worldPosition.clone());
  if (localImpact.lengthSq() === 0) return;
  const centerDir = localImpact.clone().normalize();

  // Build a local tangent basis at impact for directional/elliptical deformation
  const up = centerDir;
  const tangentLocal = (() => {
    if (!directionWorld || directionWorld.lengthSq() < 1e-8) return null;
    // Convert world direction at impact point into local tangent direction
    const p1 = planetMesh.worldToLocal(worldPosition.clone());
    const p2 = planetMesh.worldToLocal(worldPosition.clone().add(directionWorld.clone()));
    const dirLocal = p2.sub(p1).normalize();
    // Remove any normal component to ensure tangent lies on surface
    const tangent = dirLocal.sub(up.clone().multiplyScalar(dirLocal.dot(up))).normalize();
    return tangent.lengthSq() > 0.5 ? tangent : null;
  })();
  const bitangentLocal = tangentLocal ? new THREE.Vector3().crossVectors(up, tangentLocal).normalize() : null;

  // Convert impact radius to angular radius on the sphere
  const craterAngle = THREE.MathUtils.clamp(impactRadius / Math.max(1e-6, params.radius), 0.01, Math.PI / 2);

  // Depth scaled by impact size and terrain scale
  const baseDepth = Math.min(impactRadius * 0.45, (params.noiseAmplitude || 0.5) * 0.6 + 0.02);
  const depth = THREE.MathUtils.clamp(baseDepth * THREE.MathUtils.clamp(strength, 0.2, 3.5), 0.005, impactRadius);

  // Ellipticity increases with obliquity: 0 (head-on) -> circular, pi/2 (grazing) -> elongated
  const obliq = THREE.MathUtils.clamp(isFinite(obliquity) ? obliquity : 0, 0, Math.PI / 2);
  const elongBase = (params.impactElongationMul ?? 1.6);
  const elongation = tangentLocal ? (1 + elongBase * (obliq / (Math.PI / 2))) : 1; // major axis scale
  const minorScale = 1 / elongation; // maintain area roughly similar

  const arr = positions.array;
  const v = new THREE.Vector3();
  const vDir = new THREE.Vector3();
  const local = new THREE.Vector3();

  for (let i = 0; i < arr.length; i += 3) {
    v.set(arr[i + 0], arr[i + 1], arr[i + 2]);
    const r = v.length();
    if (r <= 0) continue;
    vDir.copy(v).divideScalar(r); // normalize
    let ang;
    if (tangentLocal) {
      // Measure angular distance using elliptical metric in tangent space
      // Compute local coordinates of vertex direction in tangent frame
      const du = vDir.dot(tangentLocal);
      const dv = vDir.dot(bitangentLocal);
      const dn = vDir.dot(up);
      // Project onto tangent plane frame proportions
      // Scale axes to create ellipse
      const u = du / elongation; // compress along tangent to simulate elongated footprint
      const w = dv / minorScale;
      // Reconstruct a pseudo-direction with anisotropic scaling for angle measure
      local.set(u, dn, w).normalize();
      ang = Math.acos(THREE.MathUtils.clamp(local.y, -1, 1)); // angle from up after scaling
    } else {
      ang = Math.acos(THREE.MathUtils.clamp(vDir.dot(centerDir), -1, 1));
    }
    if (ang > craterAngle) continue;

    // Smooth falloff from center to rim
    const t = 1 - ang / craterAngle; // 1 at center, 0 at rim
    const falloff = t * t * (3 - 2 * t); // smoothstep

    // Depress surface along the normal
    const newR = Math.max(0.01, r - depth * falloff);
    vDir.multiplyScalar(newR);
    arr[i + 0] = vDir.x;
    arr[i + 1] = vDir.y;
    arr[i + 2] = vDir.z;
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  if (geometry.attributes.normal) geometry.attributes.normal.needsUpdate = true;
  geometry.computeBoundingSphere();
}

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

// Camera modes
const CameraMode = {
  ORBIT: "Orbit",
  SURFACE: "Surface",
  CHASE: "Chase",
  FOCUS: "Focus"
};
let cameraMode = CameraMode.ORBIT;
let chaseTarget = null; // first moon
let focusTarget = null; // object being focused on

// Camera mode cycling
function cycleCameraMode() {
  const order = [CameraMode.ORBIT, CameraMode.SURFACE, CameraMode.CHASE];
  const idx = order.indexOf(cameraMode);
  cameraMode = order[(idx + 1) % order.length];
  if (cameraModeButton) cameraModeButton.textContent = `Camera: ${cameraMode}`;
}
cameraModeButton?.addEventListener("click", cycleCameraMode);

//#region Focus functionality
function getObjectName(object) {
  if (object === planetMesh) return "Planet";
  if (object === sunVisual) return "Sun";
  if (object === sunCorona) return "Sun";
  if (object.parent === blackHoleGroup) return "Black Hole";
  if (object.parent === moonsGroup) return `Moon ${moonsGroup.children.indexOf(object.parent) + 1}`;
  return "Unknown Object";
}

// Raycasting for object selection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseClick(event) {
  // Calculate mouse position in normalized device coordinates
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Update the picking ray with the camera and mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Create array of all selectable objects
  const selectableObjects = [];
  
  // Add planet mesh
  if (planetMesh) selectableObjects.push(planetMesh);
  
  // Add sun objects
  if (sunVisual) selectableObjects.push(sunVisual);
  if (sunCorona) selectableObjects.push(sunCorona);
  
  // Add black hole objects
  blackHoleGroup.traverse((child) => {
    if (child.isMesh) selectableObjects.push(child);
  });
  
  // Add moon objects
  moonsGroup.children.forEach((moonPivot) => {
    if (moonPivot.userData?.mesh) {
      selectableObjects.push(moonPivot.userData.mesh);
    }
  });
  
  // Calculate objects intersecting the picking ray
  const intersects = raycaster.intersectObjects(selectableObjects);
  
  if (intersects.length > 0) {
    const clickedObject = intersects[0].object;
    // Single click - could be used for highlighting or other interactions in the future
  } else if (cameraMode === CameraMode.FOCUS) {
    // If clicking on empty space while in focus mode, exit focus mode
    cameraMode = CameraMode.ORBIT;
    focusTarget = null;
    if (cameraModeButton) cameraModeButton.textContent = `Camera: ${cameraMode}`;
    controls.enabled = true;
  }
}

function onMouseDoubleClick(event) {
  // Calculate mouse position in normalized device coordinates
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Update the picking ray with the camera and mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Create array of all selectable objects
  const selectableObjects = [];
  
  // Add planet mesh
  if (planetMesh) selectableObjects.push(planetMesh);
  
  // Add sun objects
  if (sunVisual) selectableObjects.push(sunVisual);
  if (sunCorona) selectableObjects.push(sunCorona);
  
  // Add black hole objects
  blackHoleGroup.traverse((child) => {
    if (child.isMesh) selectableObjects.push(child);
  });
  
  // Add moon objects
  moonsGroup.children.forEach((moonPivot) => {
    if (moonPivot.userData?.mesh) {
      selectableObjects.push(moonPivot.userData.mesh);
    }
  });
  
  // Calculate objects intersecting the picking ray
  const intersects = raycaster.intersectObjects(selectableObjects);
  
  if (intersects.length > 0) {
    const clickedObject = intersects[0].object;
    // Directly focus on the object without showing UI
    focusTarget = clickedObject;
    cameraMode = CameraMode.FOCUS;
    if (cameraModeButton) cameraModeButton.textContent = `Camera: ${cameraMode}`;
    
    // Mobile-specific camera positioning adjustment
    if (isMobileLayout()) {
      // Ensure camera is positioned appropriately for mobile viewport
      const targetPos = clickedObject.getWorldPosition(tmpVecA);
      const currentDistance = camera.position.distanceTo(targetPos);
      
      // If camera is too far, move it closer for better mobile viewing
      if (currentDistance > 20) {
        const direction = camera.position.clone().sub(targetPos).normalize();
        const newDistance = Math.min(15, currentDistance * 0.6);
        camera.position.copy(targetPos).add(direction.multiplyScalar(newDistance));
        controls.target.copy(targetPos);
      }
    }
  }
}

// Add click and double-click event listeners to the renderer
renderer.domElement.addEventListener("click", onMouseClick);
renderer.domElement.addEventListener("dblclick", onMouseDoubleClick);

// Add keyboard shortcut to exit focus mode (Escape key)
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (cameraMode === CameraMode.FOCUS) {
      cameraMode = CameraMode.ORBIT;
      focusTarget = null;
      if (cameraModeButton) cameraModeButton.textContent = `Camera: ${cameraMode}`;
      controls.enabled = true;
    }
  }
});

//#endregion

