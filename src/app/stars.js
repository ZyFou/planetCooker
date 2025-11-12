import * as THREE from "three";
import { spaceBackgroundVertexShader, spaceBackgroundFragmentShader } from "./shaders/planetShaders.js";

const starVertexShader = /* glsl */`
attribute vec3 color;
attribute float aSize;
attribute float aPhase;

uniform float uTime;
uniform float uPixelRatio;
uniform float uScale;
uniform float uTwinkleSpeed;
uniform float uBrightness;

varying vec3 vColor;
varying float vBrightness;

void main() {
  vColor = color;

  float twinkle = 0.7 + 0.3 * sin(uTime * uTwinkleSpeed + aPhase);
  vBrightness = uBrightness * twinkle;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float size = aSize * (1.0 + 0.4 * twinkle);
  
  // Calculate point size with proper perspective scaling
  // Stars are far away (90-280 units), so we need a larger base size
  float distance = max(-mvPosition.z, 1.0);
  float pointSize = size * uScale / distance;
  
  // Ensure minimum visible size (at least 2 pixels)
  gl_PointSize = max(pointSize, 2.0);

  gl_Position = projectionMatrix * mvPosition;
}
`;

const starFragmentShader = /* glsl */`
uniform sampler2D uTexture;

varying vec3 vColor;
varying float vBrightness;

void main() {
  vec4 texColor = texture2D(uTexture, gl_PointCoord);
  float brightness = clamp(vBrightness, 0.0, 2.0);
  float alpha = texColor.a * brightness;
  
  // Lower threshold to ensure dim stars are still visible
  if (alpha <= 0.001) {
    discard;
  }

  vec3 color = vColor * texColor.rgb * brightness;
  gl_FragColor = vec4(color, alpha);
}
`;

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
  const pixelRatio = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const viewportHeight = typeof window !== "undefined" && window.innerHeight ? window.innerHeight : 1080;
  // Scale factor for point size - larger value makes stars more visible at distance
  // Stars are positioned at 90-280 units away, so we need a significant scale
  const uniforms = {
    uTime: { value: 0 },
    uBrightness: { value: 1 },
    uTwinkleSpeed: { value: 0.6 },
    uPixelRatio: { value: Math.min(pixelRatio, 2) },
    uScale: { value: Math.min(pixelRatio, 2) * viewportHeight * 1.2 },
    uTexture: { value: pointTexture }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending
  });

  material.uniformsNeedUpdate = true;

  const points = new THREE.Points(geometry, material);
  points.name = "Starfield";
  points.frustumCulled = false;
  points.renderOrder = -1000; // Render stars first/behind everything
  return points;
}

export function createSpaceBackground({
  radius = 240,
  nebulaIntensity = 0.65,
  starDensity = 1.0,
  gradientIntensity = 0.4,
  baseColor = "#04060f",
  nebulaColor1 = "#402074",
  nebulaColor2 = "#1b3c68"
} = {}) {
  const geometry = new THREE.SphereGeometry(radius, 64, 64);
  const uniforms = {
    uTime: { value: 0 },
    uNebulaIntensity: { value: nebulaIntensity },
    uStarDensity: { value: starDensity },
    uGradientIntensity: { value: gradientIntensity },
    uBaseColor: { value: new THREE.Color(baseColor) },
    uNebulaColor1: { value: new THREE.Color(nebulaColor1) },
    uNebulaColor2: { value: new THREE.Color(nebulaColor2) }
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: spaceBackgroundVertexShader,
    fragmentShader: spaceBackgroundFragmentShader,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    transparent: false,
    fog: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "SpaceBackground";
  mesh.renderOrder = -1100;
  mesh.frustumCulled = false;

  return mesh;
}


