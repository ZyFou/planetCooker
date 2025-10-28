import * as THREE from "three";

export function createSunTexture({ inner = 0.1, outer = 1, innerAlpha = 1, outerAlpha = 0, resolution = 1.0 } = {}) {
  const scale = Math.max(0.25, Math.min(2.0, resolution || 1.0));
  const size = Math.max(32, Math.round(256 * scale));
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
  texture.anisotropy = Math.max(1, Math.round(2 * scale));
  return texture;
}

export function createStarfield({ seed, count, resolution = 1.0 }) {
  const starCount = Math.max(0, Math.round(count || 2000));
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);
  const rng = new (class RNG { constructor(seedStr){ this.seed = Array.from(String(seedStr||"default")).reduce((a,c)=>a+c.charCodeAt(0),0)>>>0; } next(){ let t = this.seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } })(`${seed || "default"}-stars`);
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

  const pointTexture = createSunTexture({ inner: 0.0, outer: 0.5, innerAlpha: 1, outerAlpha: 0, resolution });
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


