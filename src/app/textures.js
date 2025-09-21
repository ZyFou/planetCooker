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


export function generateGasGiantTexture({
  seed = "gas",
  strata = [],
  noiseScale = 2.4,
  noiseStrength = 0.35,
  bandContrast = 0.45,
  bandSoftness = 0.22
} = {}) {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const buildFallbackTexture = () => {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.wrapS = THREE.RepeatWrapping;
    fallback.wrapT = THREE.ClampToEdgeWrapping;
    fallback.anisotropy = 8;
    fallback.generateMipmaps = true;
    fallback.minFilter = THREE.LinearMipMapLinearFilter;
    fallback.magFilter = THREE.LinearFilter;
    fallback.needsUpdate = true;
    return fallback;
  };

  if (!ctx) {
    return buildFallbackTexture();
  }

  const normalized = (() => {
    if (!Array.isArray(strata) || strata.length === 0) {
      return [
        { color: "#d9b48f", size: 0.18 },
        { color: "#a66e3f", size: 0.22 },
        { color: "#f1d7b5", size: 0.2 },
        { color: "#8a4f2b", size: 0.18 }
      ];
    }
    return strata.map((layer) => ({
      color: layer.color || "#ffffff",
      size: Math.max(0.01, layer.size || 0.01)
    }));
  })();

  const totalSize = normalized.reduce((sum, layer) => sum + layer.size, 0) || 1;
  const layers = normalized.map((layer, index) => {
    const color = new THREE.Color(layer.color);
    return {
      start: index === 0 ? 0 : normalized.slice(0, index).reduce((sum, l) => sum + l.size, 0) / totalSize,
      end: normalized.slice(0, index + 1).reduce((sum, l) => sum + l.size, 0) / totalSize,
      color,
      highlight: color.clone().lerp(new THREE.Color(1, 1, 1), 0.45),
      shadow: color.clone().lerp(new THREE.Color(0, 0, 0), 0.35),
      index
    };
  });

  const rngSeed = `${seed}-gas-${width}-${height}`;
  const rand = (() => {
    let s = Array.from(rngSeed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0) >>> 0;
    return () => {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  const noise = createNoise3D(() => rand());
  const image = ctx.createImageData(width, height);
  const data = image.data;

  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const sampleLayer = (v) => {
    const value = clamp01(v);
    for (let i = 0; i < layers.length; i += 1) {
      const layer = layers[i];
      if (value >= layer.start && value <= layer.end) {
        return layer;
      }
    }
    return layers[layers.length - 1];
  };

  const softness = THREE.MathUtils.lerp(0.6, 3.6, clamp01(bandSoftness));
  const contrast = clamp01(bandContrast);
  const nStrength = clamp01(noiseStrength);
  const nScale = Math.max(0.2, noiseScale);

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const latWarp = noise(0.1, v * nScale, 7.31) * 0.5 + 0.5;
    const warpedV = clamp01(v + (latWarp - 0.5) * 0.12 * (0.25 + bandSoftness));
    const layer = sampleLayer(warpedV);
    const bandHeight = Math.max(1e-5, layer.end - layer.start);
    const localT = clamp01((warpedV - layer.start) / bandHeight);
    const bandProfileBase = clamp01(1 - Math.abs(localT - 0.5) * 2);
    const bandProfile = Math.pow(bandProfileBase, softness);

    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const idx = (y * width + x) * 4;

      const turbulence = noise(u * nScale * 2.2, warpedV * nScale * 0.6, layer.index * 1.7 + 0.5) * 0.5 + 0.5;
      const flow = noise(u * nScale * 0.7 + warpedV * 3.1, warpedV * nScale * 1.6, layer.index * 0.9 + 11.8) * 0.5 + 0.5;
      const swirl = noise(u * nScale * 1.2, warpedV * nScale * 1.8, layer.index * 2.4 + 4.2) * 0.5 + 0.5;
      const detail = clamp01((turbulence * 0.5 + flow * 0.35 + swirl * 0.15) - 0.5);
      const mixNoise = clamp01(0.5 + detail * nStrength);

      const equatorBoost = Math.pow(1 - Math.abs(warpedV - 0.5) * 2, 2.2);
      const mixBase = clamp01(THREE.MathUtils.lerp(0.5, bandProfile, contrast));
      const mix = clamp01(mixBase + (mixNoise - 0.5) * 0.6 + equatorBoost * 0.08 * (1 - contrast));

      const r = THREE.MathUtils.lerp(layer.shadow.r, layer.highlight.r, mix) * 255;
      const g = THREE.MathUtils.lerp(layer.shadow.g, layer.highlight.g, mix) * 255;
      const b = THREE.MathUtils.lerp(layer.shadow.b, layer.highlight.b, mix) * 255;
      const alpha = clamp01(0.72 + (mix - 0.5) * 0.18 + equatorBoost * 0.05);

      data[idx + 0] = Math.max(0, Math.min(255, Math.round(r)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[idx + 3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}


