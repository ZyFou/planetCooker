import * as THREE from "three";
import { createNoise3D } from "simplex-noise";

export function generateRingTexture(innerRatio, params) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.wrapS = THREE.ClampToEdgeWrapping;
    fallback.wrapT = THREE.ClampToEdgeWrapping;
    fallback.anisotropy = 4;
    fallback.generateMipmaps = false;
    fallback.minFilter = THREE.LinearFilter;
    fallback.magFilter = THREE.LinearFilter;
    fallback.needsUpdate = true;
    return fallback;
  }
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const center = size * 0.5;

  const baseColor = new THREE.Color(params.ringColor || 0xc7b299);
  const highlight = baseColor.clone().lerp(new THREE.Color(1, 1, 1), 0.45);
  const shadow = baseColor.clone().lerp(new THREE.Color(0, 0, 0), 0.4);
  const baseOpacity = THREE.MathUtils.clamp(params.ringOpacity ?? 0.6, 0, 1);
  const noiseStrength = THREE.MathUtils.clamp(params.ringNoiseStrength ?? 0.55, 0, 1);
  const freq = Math.max(0.2, params.ringNoiseScale ?? 3.2);
  const rngSeed = `${params.seed || "ring"}-${freq.toFixed(2)}-${noiseStrength.toFixed(2)}`;
  const rand = (() => { let s = Array.from(rngSeed).reduce((a,c)=>a+c.charCodeAt(0),0)>>>0; return () => { let t = s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const noise = createNoise3D(() => rand());

  const inner = THREE.MathUtils.clamp(innerRatio, 0, 0.98);
  const innerFeather = 0.03;
  const outerFeather = 0.04;

  for (let y = 0; y < size; y += 1) {
    const dy = (y - center) / center;
    for (let x = 0; x < size; x += 1) {
      const dx = (x - center) / center;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (radius <= inner || radius >= 1) {
        data[idx + 3] = 0;
        continue;
      }

      const innerFade = THREE.MathUtils.smoothstep(radius, inner, inner + innerFeather);
      const outerFade = 1 - THREE.MathUtils.smoothstep(radius, 1 - outerFeather, 1);
      const radialFade = THREE.MathUtils.clamp(innerFade * outerFade, 0, 1);
      if (radialFade <= 0) {
        data[idx + 3] = 0;
        continue;
      }

      const angle = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
      const theta = angle * Math.PI * 2;
      const ax = Math.cos(theta);
      const ay = Math.sin(theta);

      const radialComponent = noise(radius * freq, ax * freq * 0.8, ay * freq * 0.8) * 0.5 + 0.5;
      const angularComponent = noise(ax * freq * 1.6, ay * freq * 1.6, radius * freq) * 0.5 + 0.5;
      const combined = THREE.MathUtils.clamp(radialComponent * 0.6 + angularComponent * 0.4, 0, 1);
      const mix = THREE.MathUtils.lerp(0.5, combined, noiseStrength);

      const r = THREE.MathUtils.lerp(shadow.r, highlight.r, mix) * 255;
      const g = THREE.MathUtils.lerp(shadow.g, highlight.g, mix) * 255;
      const b = THREE.MathUtils.lerp(shadow.b, highlight.b, mix) * 255;
      const alpha = radialFade * baseOpacity * THREE.MathUtils.lerp(0.6, 1, mix);

      data[idx + 0] = Math.max(0, Math.min(255, Math.round(r)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[idx + 3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
    }
  }

  for (let y = 0; y < size; y += 1) {
    const idx0 = (y * size + 0) * 4;
    const idx1 = (y * size + (size - 1)) * 4;
    data[idx1 + 0] = data[idx0 + 0];
    data[idx1 + 1] = data[idx0 + 1];
    data[idx1 + 2] = data[idx0 + 2];
    data[idx1 + 3] = data[idx0 + 3];
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function generateAnnulusTexture({ innerRatio, color, opacity = 1, noiseScale = 3.0, noiseStrength = 0.5, seedKey = "bh", seed }) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.wrapS = THREE.ClampToEdgeWrapping;
    fallback.wrapT = THREE.ClampToEdgeWrapping;
    fallback.anisotropy = 4;
    fallback.generateMipmaps = false;
    fallback.minFilter = THREE.LinearFilter;
    fallback.magFilter = THREE.LinearFilter;
    fallback.needsUpdate = true;
    return fallback;
  }
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const center = size * 0.5;

  const baseColor = new THREE.Color(color || 0xffffff);
  const highlight = baseColor.clone().lerp(new THREE.Color(1, 1, 1), 0.45);
  const shadow = baseColor.clone().lerp(new THREE.Color(0, 0, 0), 0.4);
  const baseOpacity = THREE.MathUtils.clamp(opacity ?? 1, 0, 1);
  const nStrength = THREE.MathUtils.clamp(noiseStrength ?? 0.5, 0, 1);
  const freq = Math.max(0.2, noiseScale ?? 3.0);
  const rngSeed = `${seed || seedKey}-annulus-${freq.toFixed(2)}-${nStrength.toFixed(2)}`;
  const rand = (() => { let s = Array.from(rngSeed).reduce((a,c)=>a+c.charCodeAt(0),0)>>>0; return () => { let t = s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const noise = createNoise3D(() => rand());

  const inner = THREE.MathUtils.clamp(innerRatio, 0, 0.98);
  const innerFeather = 0.03;
  const outerFeather = 0.04;

  for (let y = 0; y < size; y += 1) {
    const dy = (y - center) / center;
    for (let x = 0; x < size; x += 1) {
      const dx = (x - center) / center;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (radius <= inner || radius >= 1) {
        data[idx + 3] = 0;
        continue;
      }

      const innerFade = THREE.MathUtils.smoothstep(radius, inner, inner + innerFeather);
      const outerFade = 1 - THREE.MathUtils.smoothstep(radius, 1 - outerFeather, 1);
      const radialFade = THREE.MathUtils.clamp(innerFade * outerFade, 0, 1);
      if (radialFade <= 0) {
        data[idx + 3] = 0;
        continue;
      }

      const angle = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
      const theta = angle * Math.PI * 2;
      const ax = Math.cos(theta);
      const ay = Math.sin(theta);

      const radialComponent = noise(radius * freq, ax * freq * 0.8, ay * freq * 0.8) * 0.5 + 0.5;
      const angularComponent = noise(ax * 1.6 * freq, ay * 1.6 * freq, radius * freq) * 0.5 + 0.5;
      const combined = THREE.MathUtils.clamp(radialComponent * 0.6 + angularComponent * 0.4, 0, 1);
      const mix = THREE.MathUtils.lerp(0.5, combined, nStrength);

      const r = THREE.MathUtils.lerp(shadow.r, highlight.r, mix) * 255;
      const g = THREE.MathUtils.lerp(shadow.g, highlight.g, mix) * 255;
      const b = THREE.MathUtils.lerp(shadow.b, highlight.b, mix) * 255;
      const alpha = radialFade * baseOpacity * THREE.MathUtils.lerp(0.6, 1, mix);

      data[idx + 0] = Math.max(0, Math.min(255, Math.round(r)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[idx + 3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
    }
  }

  for (let y = 0; y < size; y += 1) {
    const idx0 = (y * size + 0) * 4;
    const idx1 = (y * size + (size - 1)) * 4;
    data[idx1 + 0] = data[idx0 + 0];
    data[idx1 + 1] = data[idx0 + 1];
    data[idx1 + 2] = data[idx0 + 2];
    data[idx1 + 3] = data[idx0 + 3];
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}


// Generates an equirectangular gas-giant band texture with band colors and subtle turbulence
// params: {
//   gasStrata: Array<{ color: string, size: number }>,
//   gasNoiseScale: number,
//   gasNoiseStrength: number,
//   gasBandTwist?: number,
//   gasBandSharpness?: number,
//   seed?: string
// }
export function generateGasGiantTexture(params) {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.wrapS = THREE.RepeatWrapping;
    fallback.wrapT = THREE.ClampToEdgeWrapping;
    fallback.anisotropy = 4;
    fallback.generateMipmaps = false;
    fallback.minFilter = THREE.LinearFilter;
    fallback.magFilter = THREE.LinearFilter;
    fallback.needsUpdate = true;
    return fallback;
  }

  const image = ctx.createImageData(width, height);
  const data = image.data;

  const strata = Array.isArray(params.gasStrata) && params.gasStrata.length > 0
    ? params.gasStrata
    : [
        { color: "#c9b48f", size: 1 },
        { color: "#a68d6a", size: 1 },
        { color: "#d8c8a8", size: 1 },
        { color: "#8a7a5a", size: 1 },
        { color: "#e6dcc4", size: 1 }
      ];

  const totalSize = strata.reduce((s, it) => s + Math.max(0.01, Number(it.size) || 0.01), 0);
  const edges = [];
  let accum = 0;
  for (let i = 0; i < strata.length; i += 1) {
    const sz = Math.max(0.01, Number(strata[i].size) || 0.01) / totalSize;
    edges.push(accum);
    accum += sz;
  }
  edges.push(1);

  const nScale = Math.max(0.1, params.gasNoiseScale ?? 3.0);
  const nStrength = THREE.MathUtils.clamp(params.gasNoiseStrength ?? 0.4, 0, 2);
  const warpStrength = THREE.MathUtils.clamp(params.gasWarpStrength ?? 0.6, 0, 3);
  const warpFreq = Math.max(0.2, params.gasWarpFrequency ?? 3.0);
  const streakStrength = THREE.MathUtils.clamp(params.gasStreakStrength ?? 0.8, 0, 3);
  const twist = THREE.MathUtils.clamp(params.gasBandTwist ?? 0.2, -2, 2);
  const sharp = THREE.MathUtils.clamp(params.gasBandSharpness ?? 0.6, 0.05, 3);

  const rngSeed = `${params.seed || "gas"}-bands-${nScale.toFixed(2)}-${nStrength.toFixed(2)}`;
  const rand = (() => { let s = Array.from(rngSeed).reduce((a,c)=>a+c.charCodeAt(0),0)>>>0; return () => { let t = s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const noise = createNoise3D(() => rand());

  function sampleBandColor(v) {
    // v in [0, 1], find band interval
    let idx = 0;
    for (let i = 0; i < edges.length - 1; i += 1) {
      if (v >= edges[i] && v <= edges[i + 1]) {
        idx = i;
        break;
      }
    }
    const aIdx = idx;
    const bIdx = Math.min(strata.length - 1, idx + 1);
    const aEdge = edges[aIdx];
    const bEdge = edges[aIdx + 1];
    const localT = THREE.MathUtils.clamp((v - aEdge) / Math.max(1e-6, (bEdge - aEdge)), 0, 1);
    const t = Math.pow(localT, sharp);
    const colA = new THREE.Color(strata[aIdx].color || 0xffffff);
    const colB = new THREE.Color(strata[bIdx].color || strata[aIdx].color || 0xffffff);
    const color = colA.lerp(colB, t);
    // Per-band turbulence alters brightness subtly
    const bandTurb = THREE.MathUtils.clamp(Number(strata[aIdx].turbulence ?? 1), 0, 4);
    return { color, bandIndex: aIdx, bandTurb };
  }

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1); // 0..1 from south to north
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1); // 0..1
      const idx = (y * width + x) * 4;

      // Slight latitude warping and band wobble using noise
      const theta = (u * Math.PI * 2);
      const nx = Math.cos(theta);
      const ny = Math.sin(theta);
      const wobble = noise(nx * nScale, ny * nScale, v * nScale) * 0.5 + 0.5;
      // Global warp and per-band turbulence influence latitude wobble
      const baseWarp = (wobble - 0.5) * 0.12 * nStrength * warpStrength;
      const swirl = Math.sin(theta * 2.0) * 0.02 * twist;
      let vWobble = THREE.MathUtils.clamp(v + baseWarp + swirl, 0, 1);

      const sampled = sampleBandColor(vWobble);
      const base = sampled.color;
      // Add per-band local deformation (moves within the band subtly)
      const bandNoise = noise(nx * warpFreq, v * warpFreq, ny * warpFreq) * 0.5 + 0.5;
      vWobble = THREE.MathUtils.clamp(vWobble + (bandNoise - 0.5) * 0.05 * sampled.bandTurb * warpStrength, 0, 1);

      // Nonlinear streaking along longitude for richer detail
      const streak = noise((nx + v * 0.5) * nScale * 1.6, (ny - v * 0.5) * nScale * 1.6, v * nScale * 0.6) * 0.5 + 0.5;
      const streakMix = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.5, streak, nStrength * streakStrength * sampled.bandTurb), 0, 1);
      const brightness = THREE.MathUtils.lerp(0.78, 1.24, streakMix);

      const r = THREE.MathUtils.clamp(base.r * brightness, 0, 1) * 255;
      const g = THREE.MathUtils.clamp(base.g * brightness, 0, 1) * 255;
      const b = THREE.MathUtils.clamp(base.b * brightness, 0, 1) * 255;

      data[idx + 0] = Math.round(r);
      data[idx + 1] = Math.round(g);
      data[idx + 2] = Math.round(b);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}


