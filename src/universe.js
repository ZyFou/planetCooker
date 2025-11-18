import "./universe.css";
import * as THREE from "three";
import { ShipController } from "./universe/shipController.js";
import { UniverseManager } from "./universe/universeManager.js";
import { UniverseMap } from "./universe/universeMap.js";
import { getEffectivePlanetRadius, getPlanetRadiusFromParams } from "./universe/planetFactory.js";
import { createSpaceBackground, createStarfield } from "./app/stars.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060f);

const universeSpaceParams = {
  starCount: 4200,
  starBrightness: 0.95,
  starTwinkleSpeed: 0.55,
  backgroundBrightness: 1.0
};

let universeSpaceBackground = null;
let universeStarfield = null;

function initializeUniverseSky() {
  // Shader background disabled - using solid color background instead
  // if (!universeSpaceBackground) {
  //   universeSpaceBackground = createSpaceBackground({
  //     radius: 80000,
  //     nebulaIntensity: THREE.MathUtils.clamp(0.8 * universeSpaceParams.backgroundBrightness, 0.2, 2.4),
  //     starDensity: THREE.MathUtils.clamp(0.9 * universeSpaceParams.backgroundBrightness, 0.25, 3.0),
  //     gradientIntensity: THREE.MathUtils.clamp(0.4 * universeSpaceParams.backgroundBrightness, 0.15, 1.1),
  //     baseColor: "#05070f",
  //     nebulaColor1: "#2c1b4f",
  //     nebulaColor2: "#123359"
  //   });
  //   scene.add(universeSpaceBackground);
  // }

  // Starfield disabled - using star direction indicators instead
  // if (!universeStarfield) {
  //   universeStarfield = createStarfield({
  //     seed: "universe",
  //     count: universeSpaceParams.starCount
  //   });
  //   scene.add(universeStarfield);
  //   updateUniverseStarfieldUniforms();
  // }

  // updateUniverseSpaceBackground();
}

function updateUniverseStarfieldUniforms() {
  if (!universeStarfield?.material?.uniforms) return;
  const uniforms = universeStarfield.material.uniforms;
  const pixelRatio = Math.min(window.devicePixelRatio ?? 1, 2);
  const height = window.innerHeight || 1080;
  uniforms.uBrightness.value = universeSpaceParams.starBrightness;
  uniforms.uTwinkleSpeed.value = universeSpaceParams.starTwinkleSpeed;
  uniforms.uPixelRatio.value = pixelRatio;
  if (uniforms.uScale) {
    uniforms.uScale.value = pixelRatio * height * 1.2;
  }
}

function updateUniverseSpaceBackground() {
  if (!universeSpaceBackground?.material?.uniforms) return;
  const uniforms = universeSpaceBackground.material.uniforms;
  const brightness = THREE.MathUtils.clamp(universeSpaceParams.backgroundBrightness, 0.2, 3.0);
  uniforms.uNebulaIntensity.value = THREE.MathUtils.clamp(0.8 * brightness, 0.2, 2.4);
  uniforms.uStarDensity.value = THREE.MathUtils.clamp(0.9 * brightness, 0.25, 3.0);
  uniforms.uGradientIntensity.value = THREE.MathUtils.clamp(0.4 * brightness, 0.15, 1.1);
}

initializeUniverseSky();

const camera = new THREE.PerspectiveCamera(
  65,
  window.innerWidth / window.innerHeight,
  0.1,
  250000
);
camera.position.set(0, 0, 80);

const ambient = new THREE.HemisphereLight(0x506080, 0x05070e, 0.35);
scene.add(ambient);

const universe = new UniverseManager(scene, {
  sectorSize: 8000,
  loadRadius: 1,
  visibility: {
    systemCullDistance: 32000, // Reduced from 35000
    planetCullDistance: 22000, // Reduced from 25000
    orbitUpdateDistance: 15000, // Reduced from 18000
    fullDetailDistance: 1500,
    unloadDetailDistance: 2800,
    placeholderSegments: 12, // Reduced from 16
    starBillboardDistance: 60000
  },
  galaxyOptions: {
    galaxyRadius: 150000,
    coreRadius: 25000,
    spiralArms: 2,
    armTwist: 0.00012,
    armWidth: 0.7,
    thickness: 5000,
    coreThickness: 12000
  }
});

const ship = new ShipController(camera, {
  scene,
  renderer,
  baseSpeed: 140,
  maxSpeed: 600,
  minSpeed: 35,
  cameraOffset: new THREE.Vector3(0, 0, 0.05),
  showShipMesh: false
});

const hudSpeed = document.getElementById("hud-speed");
const hudTarget = document.getElementById("hud-target");
const pointerHint = document.getElementById("pointer-hint");
const hudFps = document.getElementById("hud-fps");
const fpsSettings = document.getElementById("fps-settings");
const fpsToggle = document.getElementById("fps-toggle");
const fpsTargetInput = document.getElementById("fps-target");

// FPS tracking
let fpsFrameCount = 0;
let fpsLastTime = 0;
let currentFPS = 0;
let showFPS = true;
let targetFPS = 60;
let minFrameTime = 1000 / targetFPS;

// FPS settings panel
let fpsSettingsVisible = false;

function updateFPSSettings() {
  if (fpsToggle) {
    showFPS = fpsToggle.checked;
    if (hudFps) {
      hudFps.hidden = !showFPS;
    }
  }
  if (fpsTargetInput) {
    targetFPS = Math.max(30, Math.min(144, parseInt(fpsTargetInput.value) || 60));
    minFrameTime = 1000 / targetFPS;
  }
}

function toggleFPSSettings() {
  fpsSettingsVisible = !fpsSettingsVisible;
  if (fpsSettings) {
    fpsSettings.hidden = !fpsSettingsVisible;
  }
  if (fpsSettingsVisible) {
    // Exit pointer lock when opening settings
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
}

// Initialize FPS settings
if (fpsToggle) {
  fpsToggle.addEventListener("change", updateFPSSettings);
}
if (fpsTargetInput) {
  fpsTargetInput.addEventListener("change", updateFPSSettings);
  fpsTargetInput.addEventListener("input", updateFPSSettings);
}

// Escape key handler for FPS settings
document.addEventListener("keydown", (event) => {
  if (event.code === "Escape" || event.key === "Escape" || event.keyCode === 27) {
    if (fpsSettingsVisible) {
      event.preventDefault();
      toggleFPSSettings();
    } else if (!universeMap?.isVisible) {
      // Only toggle FPS settings if map is not open
      event.preventDefault();
      toggleFPSSettings();
    }
  }
}, true);

updateFPSSettings();

// Tracking line
let trackedSystem = null;
let trackingLine = null;

function createTrackingLine() {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.6,
    linewidth: 2
  });
  const line = new THREE.Line(geometry, material);
  line.visible = false;
  scene.add(line);
  return line;
}

function updateTrackingLine() {
  if (!trackingLine) {
    trackingLine = createTrackingLine();
  }

  if (trackedSystem) {
    // Get current system position from universe manager
    const systems = universe.getAllSystems();
    const currentSystem = systems.find(s => s.key === trackedSystem.key);
    
    if (currentSystem) {
      const shipPos = ship.position;
      const targetPos = currentSystem.position;
      
      const positions = new Float32Array([
        shipPos.x, shipPos.y, shipPos.z,
        targetPos.x, targetPos.y, targetPos.z
      ]);
      
      trackingLine.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      trackingLine.geometry.attributes.position.needsUpdate = true;
      trackingLine.visible = true;
    } else {
      // System was unloaded, stop tracking
      trackedSystem = null;
      trackingLine.visible = false;
    }
  } else {
    trackingLine.visible = false;
  }
}

function setTrackedSystem(systemData) {
  trackedSystem = systemData;
  updateTrackingLine();
}

// Initialize map
let universeMap = null;
let mapKeyPressed = false;

function initializeMap() {
  const mapContainer = document.getElementById("map-overlay");
  if (mapContainer && !universeMap) {
    try {
      universeMap = new UniverseMap(
        mapContainer,
        universe,
        () => ship.position,
        setTrackedSystem
      );
    } catch (error) {
      console.error("Failed to initialize map:", error);
      console.error(error.stack);
    }
  }
}

// Map toggle handler
function handleMapToggle(event) {
  // Handle M key - check both code and key for different keyboard layouts
  const isMKey = event.code === "KeyM" || 
                 event.key === "m" || 
                 event.key === "M" ||
                 event.keyCode === 77;
  
  if (!isMKey) {
    return;
  }
  
  if (mapKeyPressed) {
    return;
  }
  
  // Don't handle if it's a repeat keypress
  if (event.repeat) {
    return;
  }
  
  mapKeyPressed = true;
  event.preventDefault();
  event.stopPropagation();
  
  // Ensure map is initialized
  if (!universeMap) {
    initializeMap();
  }
  
  if (universeMap) {
    if (universeMap.isVisible) {
      universeMap.hide();
      // Reset key pressed flag immediately after hiding
      setTimeout(() => {
        mapKeyPressed = false;
      }, 50);
    } else {
      // Exit pointer lock when opening map
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      universeMap.show();
    }
  }
}

function handleMapKeyUp(event) {
  // Handle M key - check both code and key for different keyboard layouts
  const isMKey = event.code === "KeyM" || 
                 event.key === "m" || 
                 event.key === "M" ||
                 event.keyCode === 77;
  
  if (isMKey) {
    mapKeyPressed = false;
  }
}

// Use capture phase and make sure it's not blocked
document.addEventListener("keydown", (event) => {
  // Always allow M key to toggle map, even when map is open
  handleMapToggle(event);
}, true);
document.addEventListener("keyup", handleMapKeyUp, true);

// Initialize map - since this is a module script, DOM should already be ready
// But we'll try to initialize immediately and also on next tick as fallback
initializeMap();

// Also try on next tick in case DOM wasn't fully ready
setTimeout(initializeMap, 0);

universe.update(0, ship.position, camera);
const initialTarget = universe.getNearestPlanet(ship.position);
if (initialTarget) {
  const radius = getEffectivePlanetRadius(initialTarget.planet.planet);
  const offset = new THREE.Vector3(0, radius * 1.6, radius * 3.2);
  const newPosition = initialTarget.worldPosition.clone().add(offset);
  ship.setPosition(newPosition);
  camera.lookAt(initialTarget.worldPosition);
}

let lastFrameTime = performance.now();

function onResize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  // updateUniverseStarfieldUniforms();
  // updateUniverseSpaceBackground();
}

window.addEventListener("resize", onResize);

function formatDistance(km) {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${km.toFixed(0)} km`;
}

function updateHud(speed, targetInfo) {
  if (hudSpeed) {
    hudSpeed.textContent = `Speed: ${speed.toFixed(1)} km/s`;
  }
  if (hudTarget) {
    if (targetInfo) {
      hudTarget.textContent = `Target: ${targetInfo.system.group.name} · ${formatDistance(targetInfo.distance)} out`;
    } else {
      hudTarget.textContent = "No target in range";
    }
  }
  if (pointerHint) {
    pointerHint.classList.toggle("pointer-hint--visible", !ship.isPointerLocked);
  }
}

function animate(now) {
  const elapsed = now - lastFrameTime;
  
  // Limit to target FPS - only process frame if enough time has passed
  if (elapsed < minFrameTime) {
    requestAnimationFrame(animate);
    return;
  }
  
  // Update FPS counter
  if (fpsLastTime === 0) {
    fpsLastTime = now;
  }
  fpsFrameCount++;
  const fpsElapsed = now - fpsLastTime;
  if (fpsElapsed >= 500) { // Update FPS display every 500ms
    currentFPS = Math.round((fpsFrameCount * 1000) / fpsElapsed);
    fpsFrameCount = 0;
    fpsLastTime = now;
    
    if (hudFps && showFPS) {
      hudFps.textContent = `FPS: ${currentFPS}`;
      // Color code based on performance
      if (currentFPS >= targetFPS * 0.9) {
        hudFps.style.color = "#9ad0ff";
      } else if (currentFPS >= targetFPS * 0.6) {
        hudFps.style.color = "#ffd966";
      } else {
        hudFps.style.color = "#ff6b6b";
      }
    }
  }
  
  const delta = Math.min(0.12, elapsed / 1000);
  lastFrameTime = now;
  const elapsedSeconds = now * 0.001;

  // Throttle expensive nearest-planet search to every ~100ms
  if (!window._lastNearestUpdate || now - window._lastNearestUpdate > 100) {
    const nearest = universe.getNearestPlanet(ship.position);
    window._lastNearestPlanet = nearest;
    window._lastNearestUpdate = now;
    
    // Update HUD only when we update nearest info
    const speed = ship.velocity.length();
    updateHud(speed, nearest);
  }
  
  const nearest = window._lastNearestPlanet;
  let focusDistance = null;

  if (nearest) {
    const radius = nearest.planet.planet
      ? getEffectivePlanetRadius(nearest.planet.planet)
      : getPlanetRadiusFromParams(nearest.planet.params);
    focusDistance = Math.max(0, nearest.distance - radius * 1.1);
  }

  ship.update(delta, { focusDistance });
  universe.update(delta, ship.position, camera);

  // if (universeStarfield?.material?.uniforms) {
  //   universeStarfield.material.uniforms.uTime.value = elapsedSeconds;
  // }
  // if (universeSpaceBackground?.material?.uniforms) {
  //   universeSpaceBackground.material.uniforms.uTime.value = elapsedSeconds * 0.08;
  // }
  // if (universeStarfield) {
  //   universeStarfield.position.copy(ship.position);
  // }
  // if (universeSpaceBackground) {
  //   universeSpaceBackground.position.copy(ship.position);
  // }

  updateTrackingLine();

  // HUD updated in throttled block above

  // Update map if visible
  if (universeMap && universeMap.isVisible) {
    universeMap.update();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

