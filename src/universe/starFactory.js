import * as THREE from "three";
import { createSunComponents } from "../app/sun.js";

function colorToHex(color) {
  return `#${color.getHexString()}`;
}

let starBillboardTexture = null;

function getStarBillboardTexture() {
  if (starBillboardTexture) return starBillboardTexture;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.05,
    size / 2,
    size / 2,
    size * 0.48
  );
  gradient.addColorStop(0, "rgba(255,255,255,1.0)");
  gradient.addColorStop(0.18, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.55, "rgba(100,160,255,0.25)");
  gradient.addColorStop(1, "rgba(0,0,0,0.0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  starBillboardTexture = new THREE.CanvasTexture(canvas);
  starBillboardTexture.colorSpace = THREE.SRGBColorSpace;
  starBillboardTexture.needsUpdate = true;
  return starBillboardTexture;
}

export function createStar(rng, options = {}) {
  if (!rng || typeof rng.nextFloat !== "function") {
    throw new Error("Star factory requires a SeededRNG-compatible instance");
  }

  const baseHue = options.hue ?? rng.next();
  const saturation = options.saturation ?? (0.55 + rng.nextFloat(-0.1, 0.15));
  const lightness = options.lightness ?? (0.55 + rng.nextFloat(-0.05, 0.1));
  const color = new THREE.Color().setHSL(
    (baseHue % 1 + 1) % 1,
    THREE.MathUtils.clamp(saturation, 0.25, 1.0),
    THREE.MathUtils.clamp(lightness, 0.4, 0.75)
  );

  const radius = options.radius ?? rng.nextFloat(1.5, 4.5);
  const luminosity = options.luminosity ?? (radius * radius * (1.1 + rng.nextFloat(-0.2, 0.35)));

  const sunParams = {
    sunColor: colorToHex(color),
    sunIntensity: options.intensity ?? (160 * luminosity),
    sunSize: options.sunSize ?? 1.0,
    sunNoiseScale: options.sunNoiseScale ?? (1.4 + rng.nextFloat(-0.3, 0.6)),
    sunNoiseStrength: options.sunNoiseStrength ?? (0.16 + rng.nextFloat(-0.06, 0.12)),
    sunPulseAmplitude: options.sunPulseAmplitude ?? (0.28 + rng.nextFloat(-0.08, 0.14)),
    sunPulseSpeed: options.sunPulseSpeed ?? (0.45 + rng.nextFloat(-0.12, 0.22)),
    sunGlowStrength: options.sunGlowStrength ?? (1.1 + rng.nextFloat(-0.2, 0.45)),
    sunHotspotStrength: options.sunHotspotStrength ?? (0.45 + rng.nextFloat(-0.12, 0.2))
  };

  const sunComponents = createSunComponents(sunParams, {
    lightType: "point",
    sizeMultiplier: options.sizeMultiplier ?? radius,
    lightDistance: options.range ?? 0,
    lightDecay: options.decay ?? 2.0,
    castShadow: Boolean(options.castShadow),
    shadowMapWidth: options.shadowMapWidth,
    shadowMapHeight: options.shadowMapHeight,
    shadowBias: options.shadowBias ?? -0.0005,
    meshName: options.name ?? "Star Mesh",
    lightName: options.lightName ?? "Star Light"
  });

  const mesh = sunComponents.mesh;
  const light = sunComponents.light;
  light.shadow.mapSize.set(1024, 1024);

  const spriteTexture = getStarBillboardTexture();
  const billboardMaterial = new THREE.PointsMaterial({
    map: spriteTexture,
    color,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    size: options.billboardPixelSize ?? 48,
    sizeAttenuation: false,
    alphaTest: 0.01
  });
  const billboardGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0)]);
  const billboard = new THREE.Points(billboardGeometry, billboardMaterial);
  billboard.name = "Star Billboard";
  billboard.visible = false;
  billboard.renderOrder = (options.billboardRenderOrder ?? 0) + 50;

  const group = new THREE.Group();
  group.name = options.name ?? "Star";
  group.add(mesh);
  group.add(billboard);
  group.add(light);

  let usingBillboard = false;

  function toggleBillboard(enableBillboard) {
    if (usingBillboard === enableBillboard) return;
    usingBillboard = enableBillboard;
    billboard.visible = enableBillboard;
    mesh.visible = !enableBillboard;
    light.visible = !enableBillboard;
  }

  function setVisible(isVisible) {
    const visible = Boolean(isVisible);
    group.visible = visible;
    mesh.visible = visible && !usingBillboard;
    light.visible = visible && !usingBillboard;
    billboard.visible = visible && usingBillboard;
  }

  function updateBillboard(distanceSq, swapDistanceSq) {
    if (swapDistanceSq == null || Number.isNaN(swapDistanceSq)) return;
    toggleBillboard(distanceSq > swapDistanceSq);
  }

  // Default to billboard mode so distant stars are visible before the first update
  toggleBillboard(true);

  return {
    group,
    mesh,
    light,
    billboard,
    shader: sunComponents,
    radius,
    luminosity,
    color,
    colorHex: colorToHex(color),
    toggleBillboard,
    setVisible,
    updateBillboard,
    update(time = 0) {
      sunComponents.update(time);
    },
    get billboardActive() {
      return usingBillboard;
    },
    dispose() {
      sunComponents.dispose();
      billboardGeometry.dispose();
      billboardMaterial.dispose();
    }
  };
}

