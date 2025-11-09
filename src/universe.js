import "./universe.css";
import * as THREE from "three";
import { ShipController } from "./universe/shipController.js";
import { UniverseManager } from "./universe/universeManager.js";
import { getEffectivePlanetRadius } from "./universe/planetFactory.js";
import { encodeShare } from "./app/shareCore.js";

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
  loadRadius: 1
});

const ship = new ShipController(camera, {
  scene,
  renderer,
  baseSpeed: 140,
  maxSpeed: 600,
  minSpeed: 35,
  cameraOffset: new THREE.Vector3(0, 1.6, 4.2)
});

const hudSpeed = document.getElementById("hud-speed");
const hudTarget = document.getElementById("hud-target");
const landingPrompt = document.getElementById("landing-prompt");
const pointerHint = document.getElementById("pointer-hint");

universe.update(0, ship.position);
const initialTarget = universe.getNearestPlanet(ship.position);
if (initialTarget) {
  const radius = getEffectivePlanetRadius(initialTarget.planet.planet);
  const offset = new THREE.Vector3(0, radius * 6, radius * 10);
  const newPosition = initialTarget.worldPosition.clone().add(offset);
  ship.setPosition(newPosition);
  camera.lookAt(initialTarget.worldPosition);
}

let activeLandingTarget = null;
let lastFrameTime = performance.now();

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

function beginLanding(target) {
  if (!target) return;
  document.exitPointerLock?.();
  const shareCode = encodeShare(target.planet.params);
  const url = new URL("walk.html", window.location.href);
  url.searchParams.set("share", shareCode);
  url.searchParams.set("lat", "0");
  url.searchParams.set("lon", "0");
  window.location.href = url.toString();
}

document.addEventListener("keydown", (event) => {
  if (event.code === "KeyL" && activeLandingTarget) {
    beginLanding(activeLandingTarget);
  }
});

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

function updateLandingPrompt(visible) {
  if (!landingPrompt) return;
  if (visible) {
    landingPrompt.hidden = false;
    landingPrompt.classList.add("prompt--visible");
  } else {
    landingPrompt.classList.remove("prompt--visible");
    landingPrompt.hidden = true;
  }
}

function animate(now) {
  const delta = Math.min(0.12, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  const nearest = universe.getNearestPlanet(ship.position);
  let focusDistance = null;

  if (nearest) {
    const radius = getEffectivePlanetRadius(nearest.planet.planet);
    focusDistance = Math.max(0, nearest.distance - radius * 1.1);
  }

  ship.update(delta, { focusDistance });
  universe.update(delta, ship.position);

  const speed = ship.velocity.length();
  const landingRange = 180;

  activeLandingTarget = null;
  if (nearest) {
    if (focusDistance != null && focusDistance < landingRange) {
      activeLandingTarget = nearest;
    }
  }
  updateLandingPrompt(Boolean(activeLandingTarget));
  updateHud(speed, nearest);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

