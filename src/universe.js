import "./universe.css";
import * as THREE from "three";
import { ShipController } from "./universe/shipController.js";
import { UniverseManager } from "./universe/universeManager.js";
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

  const speed = ship.velocity.length();

  updateHud(speed, nearest);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

