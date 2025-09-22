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

export function generateGasGiantTexture(params) {
  const size = 1024; // Use a larger texture for the planet surface
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2; // Use a 2:1 aspect ratio for equirectangular projection
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Fallback for when canvas is not supported
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.wrapS = THREE.RepeatWrapping;
    fallback.wrapT = THREE.ClampToEdgeWrapping;
    fallback.anisotropy = 16;
    fallback.generateMipmaps = true;
    fallback.minFilter = THREE.LinearMipmapLinearFilter;
    fallback.magFilter = THREE.LinearFilter;
    fallback.needsUpdate = true;
    return fallback;
  }
  const image = ctx.createImageData(canvas.width, canvas.height);
  const data = image.data;

  const strata = [];
  let totalSize = 0;
  for (let i = 1; i <= params.gasGiantStrataCount; i++) {
    const size = params[`gasGiantStrataSize${i}`] || 0;
    if (size > 0) {
      strata.push({
        color: new THREE.Color(params[`gasGiantStrataColor${i}`]),
        size: size,
      });
      totalSize += size;
    }
  }

  // If no strata, return a blank texture
  if (strata.length === 0) {
    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // Normalize strata sizes and calculate their center positions
  if (totalSize > 0) {
    let currentPos = 0;
    for (const stratum of strata) {
      stratum.size /= totalSize;
      stratum.center = currentPos + stratum.size / 2;
      currentPos += stratum.size;
    }
  }

  const noiseStrength = THREE.MathUtils.clamp(params.gasGiantNoiseStrength ?? 0.1, 0, 1);
  const freq = Math.max(0.2, params.gasGiantNoiseScale ?? 2.0);
  const rngSeed = `${params.seed || "gasgiant"}-${freq.toFixed(2)}-${noiseStrength.toFixed(2)}`;
  const rand = (() => { let s = Array.from(rngSeed).reduce((a,c)=>a+c.charCodeAt(0),0)>>>0; return () => { let t = s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const noise = createNoise3D(() => rand());

  const warpAmount = params.gasGiantStrataWarp ?? 0.03;
  const warpScale = params.gasGiantStrataWarpScale ?? 4.0;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const u = x / (canvas.width - 1); // Longitude from 0 to 1
      const v = y / (canvas.height - 1); // Latitude from 0 to 1

      // Deform the v coordinate with noise to make the bands wavy
      const lon = u * Math.PI * 2;
      const lat = (v - 0.5) * Math.PI;
      const sx_warp = Math.cos(lat) * Math.cos(lon);
      const sy_warp = Math.sin(lat);
      const sz_warp = Math.cos(lat) * Math.sin(lon);
      const warpNoiseVal = noise(sx_warp * warpScale, sy_warp * warpScale, sz_warp * warpScale);
      const deformedV = THREE.MathUtils.clamp(v + warpNoiseVal * warpAmount, 0, 1);

      const baseColor = new THREE.Color(0, 0, 0);
      const blendFactor = 40.0; // Higher value = sharper blend

      if (strata.length > 1) {
        let totalWeight = 0;
        for (const stratum of strata) {
          const dist = Math.abs(deformedV - stratum.center);
          const weight = Math.exp(-blendFactor * Math.pow(dist, 2) / stratum.size);
          baseColor.add(stratum.color.clone().multiplyScalar(weight));
          totalWeight += weight;
        }

        if (totalWeight > 0) {
          baseColor.multiplyScalar(1 / totalWeight);
        } else {
          // Fallback: find the closest stratum if weights are all zero
          let closestDist = Infinity;
          for (const s of strata) {
            const d = Math.abs(deformedV - s.center);
            if (d < closestDist) {
              closestDist = d;
              baseColor.copy(s.color);
            }
          }
        }
      } else if (strata.length === 1) {
        baseColor.copy(strata[0].color);
      }

      const idx = (y * canvas.width + x) * 4;

      const highlight = baseColor.clone().lerp(new THREE.Color(1, 1, 1), 0.2);
      const shadow = baseColor.clone().lerp(new THREE.Color(0, 0, 0), 0.2);

      // Noise based on 3D coordinates on a sphere to avoid polar pinching
      const sx = sx_warp;
      const sy = sy_warp;
      const sz = sz_warp;

      let noiseVal = 0;
      let amp = 1.0;
      let f = freq;
      for(let i=0; i<3; i++) {
        noiseVal += noise(sx * f, sy * f * 2.0, sz * f) * amp;
        amp *= 0.5;
        f *= 2.0;
      }

      const mix = THREE.MathUtils.clamp(0.5 + noiseVal * noiseStrength, 0, 1);
      const r = THREE.MathUtils.lerp(shadow.r, highlight.r, mix);
      const g = THREE.MathUtils.lerp(shadow.g, highlight.g, mix);
      const b = THREE.MathUtils.lerp(shadow.b, highlight.b, mix);

      data[idx + 0] = r * 255;
      data[idx + 1] = g * 255;
      data[idx + 2] = b * 255;
      data[idx + 3] = 255; // Fully opaque
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
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


