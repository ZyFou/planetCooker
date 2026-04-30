import "./walk.css";
import * as THREE from "three";
import { decodeShare as decodeShareExt } from "./app/shareCore.js";
import { SurfaceSceneManager } from "./app/surface/SurfaceSceneManager.js";
import { FPSController } from "./app/surface/FPSController.js";
import { TerrainSampler, sphericalToCartesian } from "./universe/planetSampler.js";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const PLANET_WORLD_SCALE = 5;

const getEffectiveRadius = (params) => {
  const worldScale = params.worldScale ?? PLANET_WORLD_SCALE;
  if (params.planetType === "gas" && typeof params.gasPlanetSize === "number") {
    return params.gasPlanetSize * worldScale;
  }
  if (typeof params.radius === "number") return params.radius * worldScale;
  if (typeof params.planetSize === "number") return params.planetSize * worldScale;
  return worldScale;
};

function showFatal(message) {
  const loading = document.getElementById("loading-screen");
  if (loading) {
    loading.textContent = message;
  } else {
    // eslint-disable-next-line no-alert
    alert(message);
  }
  throw new Error(message);
}

function parseLandingParameters() {
  const search = new URLSearchParams(window.location.search);
  const shareCode = search.get("share");
  if (!shareCode) {
    showFatal("Missing planet configuration share code");
  }

  let decoded;
  try {
    decoded = decodeShareExt(shareCode);
  } catch (error) {
    showFatal("Failed to decode planet share code");
  }

  const data = decoded?.data ?? decoded;
  if (!data || typeof data !== "object") {
    showFatal("Invalid planet configuration payload");
  }

  const lat = parseFloat(search.get("lat") ?? "0");
  const lon = parseFloat(search.get("lon") ?? "0");

  return {
    params: { ...data },
    spawnLat: Number.isFinite(lat) ? lat : 0,
    spawnLon: Number.isFinite(lon) ? lon : 0,
    shareCode
  };
}

function setPlanetBadge(params) {
  const name = document.getElementById("planet-name");
  const type = document.getElementById("planet-type");
  const gravity = document.getElementById("planet-gravity");
  const temperature = document.getElementById("planet-temperature");
  const atmosphere = document.getElementById("planet-atmosphere");

  if (name) {
    name.textContent = params.name ?? params.displayName ?? "Custom Planet";
  }
  if (type) {
    const label = params.planetType ?? params.type ?? "procedural";
    type.textContent = label.replace(/_/g, " ");
  }
  if (gravity) {
    const g = typeof params.gravity === "number" ? params.gravity : (typeof params.gravityG === "number" ? params.gravityG : 1);
    gravity.textContent = `${g.toFixed(2)} g`;
  }
  if (temperature) {
    if (typeof params.temperature === "number") {
      temperature.textContent = `${Math.round(params.temperature)} K`;
    } else if (typeof params.temperatureK === "number") {
      temperature.textContent = `${Math.round(params.temperatureK)} K`;
    } else {
      temperature.textContent = "—";
    }
  }
  if (atmosphere) {
    const atm = params.atmosphere ?? params.atmosphereType ?? "unknown";
    atmosphere.textContent = atm.replace(/_/g, " ");
  }
}

function bootstrap() {
  const { params, spawnLat, spawnLon } = parseLandingParameters();
  setPlanetBadge(params);

  const loadingScreen = document.getElementById("loading-screen");
  const hud = document.getElementById("hud");
  const fpsDisplay = document.getElementById("hud-fps");
  const flyModeButton = document.getElementById("hud-fly");
  const pointerInstructions = document.getElementById("pointer-instructions");
  const crosshair = document.getElementById("crosshair");
  const returnButton = document.getElementById("hud-exit");

  if (returnButton) {
    returnButton.addEventListener("click", () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = new URL("studio.html", window.location.href).toString();
      }
    });
  }

  const radius = getEffectiveRadius(params);
  const sampler = new TerrainSampler(params, spawnLat, spawnLon, radius);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor("#050914", 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#050a16");

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, radius * 80);
  camera.position.set(0, 6, 12);

  const surfaceManager = new SurfaceSceneManager({
    planetParams: params,
    sampler,
    scene,
    renderer
  });

  const setFlyModeHud = (enabled) => {
    if (!flyModeButton) return;
    flyModeButton.textContent = enabled ? "Fly" : "Walk";
    flyModeButton.setAttribute("aria-pressed", enabled ? "true" : "false");
  };

  const eyeHeight = Math.max(radius * 0.04, 0.06 * radius + 0.04);
  const controller = new FPSController(camera, {
    domElement: renderer.domElement,
    gravityG: params.gravityG ?? params.gravity ?? 1,
    getHeightAt: (x, z) => surfaceManager.getHeightAt(x, z),
    onLockChange: (locked) => {
      if (pointerInstructions) pointerInstructions.hidden = locked;
      if (crosshair) crosshair.hidden = !locked;
    },
    onFlyModeChange: setFlyModeHud,
    baseWalkSpeed: 0.6, // Reduced by 10
    playerHeight: eyeHeight
  });
  setFlyModeHud(controller.isFlying());

  if (flyModeButton) {
    flyModeButton.addEventListener("click", () => {
      controller.setFlying(!controller.isFlying());
    });
  }

  const spawnNormal = sphericalToCartesian(spawnLat, spawnLon);
  const east = new THREE.Vector3().crossVectors(WORLD_UP, spawnNormal).normalize();
  if (east.lengthSq() < 1e-6) {
    east.set(0, 0, 1);
  }
  const north = new THREE.Vector3().crossVectors(spawnNormal, east).normalize();

  const initialPosition = new THREE.Vector3();
  initialPosition.addScaledVector(east, 0);
  initialPosition.addScaledVector(north, 0);

  surfaceManager.initialize(initialPosition);

  const startHeight = surfaceManager.getHeightAt(initialPosition.x, initialPosition.z);
  const spawnPoint = new THREE.Vector3(
    initialPosition.x,
    startHeight + eyeHeight,
    initialPosition.z
  );

  controller.getObject().position.copy(spawnPoint);
  camera.position.copy(spawnPoint);

  let hudRevealed = false;
  let fpsAccumulator = 0;
  let fpsFrames = 0;

  const revealHud = () => {
    if (hudRevealed) return;
    hudRevealed = true;
    if (loadingScreen) {
      loadingScreen.hidden = true;
      loadingScreen.style.display = "none";
    }
    if (hud) hud.hidden = false;
    if (pointerInstructions) pointerInstructions.hidden = false;
  };

  const clock = new THREE.Clock();
  const animate = () => {
    const delta = Math.min(0.1, clock.getDelta());

    controller.update(delta);
    const playerObject = controller.getObject();
    surfaceManager.update(delta, playerObject.position);
    renderer.render(scene, camera);

    fpsAccumulator += delta;
    fpsFrames += 1;
    if (fpsAccumulator >= 0.5) {
      const fps = Math.round(fpsFrames / fpsAccumulator);
      fpsAccumulator = 0;
      fpsFrames = 0;
      if (fpsDisplay) fpsDisplay.textContent = `FPS: ${fps}`;
    }

    revealHud();
    requestAnimationFrame(animate);
  };

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  window.addEventListener("error", () => revealHud());
  window.addEventListener("unhandledrejection", () => revealHud());

  animate();
}

try {
  bootstrap();
} catch (error) {
  console.error("Fatal initialization error:", error);
}
