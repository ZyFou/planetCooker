import * as THREE from "three";

function colorToHex(color) {
  return `#${color.getHexString()}`;
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

  const geometry = new THREE.SphereGeometry(radius, 64, 64);
  const material = new THREE.MeshBasicMaterial({
    color,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = options.name ?? "Star Mesh";

  const glowGeometry = new THREE.SphereGeometry(radius * 1.4, 32, 32);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    toneMapped: false
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.name = "Star Glow";
  mesh.add(glow);

  const light = new THREE.PointLight(
    color,
    options.intensity ?? (160 * luminosity),
    options.range ?? 0,
    options.decay ?? 2.0
  );
  light.castShadow = Boolean(options.castShadow);
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0005;
  light.name = options.lightName ?? "Star Light";

  const group = new THREE.Group();
  group.name = options.name ?? "Star";
  group.add(mesh);
  group.add(light);

  return {
    group,
    mesh,
    light,
    radius,
    luminosity,
    color,
    colorHex: colorToHex(color),
    dispose() {
      geometry.dispose();
      glowGeometry.dispose();
    }
  };
}

