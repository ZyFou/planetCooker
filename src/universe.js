import "./universe.css";
import * as THREE from "three";
import { ShipController } from "./universe/shipController.js";
import { UniverseManager } from "./universe/universeManager.js";
import { UniverseMap } from "./universe/universeMap.js";
import { getEffectivePlanetRadius, getPlanetRadiusFromParams } from "./universe/planetFactory.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060f);

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
    systemCullDistance: 35000,
    planetCullDistance: 25000,
    orbitUpdateDistance: 18000,
    fullDetailDistance: 1500,
    unloadDetailDistance: 2800,
    placeholderSegments: 16
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
  console.log("initializeMap() called");
  const mapContainer = document.getElementById("map-overlay");
  console.log("Map container found:", !!mapContainer);
  if (mapContainer && !universeMap) {
    try {
      console.log("Creating UniverseMap instance...");
      universeMap = new UniverseMap(
        mapContainer,
        universe,
        () => ship.position,
        setTrackedSystem
      );
      console.log("UniverseMap created successfully");
    } catch (error) {
      console.error("Failed to initialize map:", error);
      console.error(error.stack);
    }
  } else if (!mapContainer) {
    console.warn("Map container not found in DOM");
  } else if (universeMap) {
    console.log("Map already initialized");
  }
}

// Map toggle handler
function handleMapToggle(event) {
  // Log all keydown events to debug
  console.log("Key pressed:", event.code, event.key, "keyCode:", event.keyCode);
  
  // Handle M key - check both code and key for different keyboard layouts
  const isMKey = event.code === "KeyM" || 
                 event.key === "m" || 
                 event.key === "M" ||
                 event.keyCode === 77;
  
  if (!isMKey) {
    return;
  }
  
  console.log("M key detected!");
  
  if (mapKeyPressed) {
    console.log("Map key already pressed, ignoring");
    return;
  }
  
  // Don't handle if it's a repeat keypress
  if (event.repeat) {
    console.log("Key repeat, ignoring");
    return;
  }
  
  console.log("Processing M key press");
  mapKeyPressed = true;
  event.preventDefault();
  event.stopPropagation();
  
  // Ensure map is initialized
  if (!universeMap) {
    console.log("Initializing map...");
    initializeMap();
  }
  
  if (universeMap) {
    console.log("Toggling map, current state:", universeMap.isVisible, "mapKeyPressed:", mapKeyPressed);
    if (universeMap.isVisible) {
      console.log("Hiding map");
      universeMap.hide();
      // Reset key pressed flag immediately after hiding
      setTimeout(() => {
        mapKeyPressed = false;
        console.log("Map key flag reset after hide");
      }, 50);
    } else {
      console.log("Showing map");
      // Exit pointer lock when opening map
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      universeMap.show();
    }
  } else {
    console.warn("Map not initialized. Map container may be missing.");
    console.log("Map container exists:", !!document.getElementById("map-overlay"));
  }
}

function handleMapKeyUp(event) {
  // Handle M key - check both code and key for different keyboard layouts
  const isMKey = event.code === "KeyM" || 
                 event.key === "m" || 
                 event.key === "M" ||
                 event.keyCode === 77;
  
  if (isMKey) {
    console.log("M key released");
    mapKeyPressed = false;
  }
}

console.log("Registering map key handlers...");
// Use capture phase and make sure it's not blocked
document.addEventListener("keydown", (event) => {
  // Always allow M key to toggle map, even when map is open
  handleMapToggle(event);
}, true);
document.addEventListener("keyup", handleMapKeyUp, true);
console.log("Map key handlers registered");

// Initialize map - since this is a module script, DOM should already be ready
// But we'll try to initialize immediately and also on next tick as fallback
initializeMap();

// Also try on next tick in case DOM wasn't fully ready
setTimeout(initializeMap, 0);

universe.update(0, ship.position);
const initialTarget = universe.getNearestPlanet(ship.position);
if (initialTarget) {
  const radius = getEffectivePlanetRadius(initialTarget.planet.planet);
  const offset = new THREE.Vector3(0, radius * 1.6, radius * 3.2);
  const newPosition = initialTarget.worldPosition.clone().add(offset);
  ship.setPosition(newPosition);
  camera.lookAt(initialTarget.worldPosition);
}

let lastFrameTime = performance.now();
const targetFPS = 60;
const minFrameTime = 1000 / targetFPS; // ~16.67ms per frame

function onResize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
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
  
  // Limit to 60 FPS - only process frame if enough time has passed
  if (elapsed < minFrameTime) {
    requestAnimationFrame(animate);
    return;
  }
  
  const delta = Math.min(0.12, elapsed / 1000);
  lastFrameTime = now;

  const nearest = universe.getNearestPlanet(ship.position);
  let focusDistance = null;

  if (nearest) {
    const radius = nearest.planet.planet
      ? getEffectivePlanetRadius(nearest.planet.planet)
      : getPlanetRadiusFromParams(nearest.planet.params);
    focusDistance = Math.max(0, nearest.distance - radius * 1.1);
  }

  ship.update(delta, { focusDistance });
  universe.update(delta, ship.position);

  updateTrackingLine();

  const speed = ship.velocity.length();

  updateHud(speed, nearest);

  // Update map if visible
  if (universeMap) {
    universeMap.update();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

