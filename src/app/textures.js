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

// export function generateGasGiantTexture({ strataCount = 4, strataColors = ["#c7b59a", "#e6d8b5", "#d9c7a0", "#b8a58f"], strataSizes = [0.3, 0.25, 0.2, 0.25], noiseScale = 2.0, noiseStrength = 0.4, seedKey = "gg", seed }) {
//   const size = 512;
//   const canvas = document.createElement("canvas");
//   canvas.width = size;
//   canvas.height = size;
//   const ctx = canvas.getContext("2d");
//   if (!ctx) {
//     const fallback = new THREE.CanvasTexture(canvas);
//     fallback.colorSpace = THREE.SRGBColorSpace;
//     fallback.wrapS = THREE.RepeatWrapping;
//     fallback.wrapT = THREE.RepeatWrapping;
//     fallback.anisotropy = 4;
//     fallback.generateMipmaps = false;
//     fallback.minFilter = THREE.LinearFilter;
//     fallback.magFilter = THREE.LinearFilter;
//     fallback.needsUpdate = true;
//     return fallback;
//   }
//   const image = ctx.createImageData(size, size);
//   const data = image.data;
//   const center = size * 0.5;

//   // Ensure we have valid colors array
//   const colors = strataColors && strataColors.length > 0 ? strataColors : ["#c7b59a", "#e6d8b5", "#d9c7a0", "#b8a58f"];
//   const strata = Math.min(Math.max(1, strataCount || 4), 6);
//   const sizes = strataSizes && strataSizes.length === strata ? strataSizes : new Array(strata).fill(1/strata);

//   // Normalize sizes to sum to 1
//   const totalSize = sizes.reduce((sum, s) => sum + s, 0);
//   const normalizedSizes = sizes.map(s => s / totalSize);

//   // Noise setup
//   const nStrength = THREE.MathUtils.clamp(noiseStrength ?? 0.4, 0, 1);
//   const freq = Math.max(0.2, noiseScale ?? 2.0);
//   const rngSeed = `${seed || seedKey}-gasgiant-${strata}-${freq.toFixed(2)}-${nStrength.toFixed(2)}`;
//   const rand = (() => { let s = Array.from(rngSeed).reduce((a,c)=>a+c.charCodeAt(0),0)>>>0; return () => { let t = s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
//   const noise = createNoise3D(() => rand());

//   // Create strata boundaries
//   const boundaries = [0];
//   for (let i = 0; i < strata; i++) {
//     boundaries.push(boundaries[i] + normalizedSizes[i]);
//   }

//   for (let y = 0; y < size; y += 1) {
//     const dy = (y - center) / center;
//     const normalizedY = dy * 0.5 + 0.5; // Convert to 0-1 range

//     for (let x = 0; x < size; x += 1) {
//       const dx = (x - center) / center;
//       const radius = Math.sqrt(dx * dx + dy * dy);
//       const idx = (y * size + x) * 4;

//       if (radius >= 1) {
//         data[idx + 3] = 0;
//         continue;
//       }

//       // Find which stratum this pixel belongs to
//       let stratumIndex = 0;
//       for (let i = 0; i < strata; i++) {
//         if (normalizedY >= boundaries[i] && normalizedY < boundaries[i + 1]) {
//           stratumIndex = i;
//           break;
//         }
//       }
//       stratumIndex = Math.min(stratumIndex, colors.length - 1);

//       const baseColor = new THREE.Color(colors[stratumIndex] || "#c7b59a");
//       const highlight = baseColor.clone().lerp(new THREE.Color(1, 1, 1), 0.3);
//       const shadow = baseColor.clone().lerp(new THREE.Color(0, 0, 0), 0.5);

//       // Add some radial variation
//       const radialFade = 1 - THREE.MathUtils.smoothstep(radius, 0.6, 0.9);

//       // Add noise for texture variation
//       const angle = Math.atan2(dy, dx);
//       const radialComponent = noise(radius * freq * 2, Math.cos(angle) * freq, Math.sin(angle) * freq) * 0.5 + 0.5;
//       const angularComponent = noise(Math.cos(angle * 3) * freq, Math.sin(angle * 3) * freq, radius * freq) * 0.5 + 0.5;
//       const combined = THREE.MathUtils.clamp(radialComponent * 0.7 + angularComponent * 0.3, 0, 1);
//       const mix = THREE.MathUtils.lerp(0.4, combined, nStrength);

//       // Add some band mixing for smoother transitions
//       let bandMix = mix;
//       if (stratumIndex > 0 && normalizedY < boundaries[stratumIndex] + normalizedSizes[stratumIndex] * 0.3) {
//         const prevColor = new THREE.Color(colors[stratumIndex - 1] || colors[stratumIndex]);
//         const mixAmount = 1 - (normalizedY - boundaries[stratumIndex - 1]) / (normalizedSizes[stratumIndex - 1] * 0.3);
//         baseColor.lerp(prevColor, mixAmount * 0.3);
//       }
//       if (stratumIndex < strata - 1 && normalizedY > boundaries[stratumIndex + 1] - normalizedSizes[stratumIndex + 1] * 0.3) {
//         const nextColor = new THREE.Color(colors[stratumIndex + 1] || colors[stratumIndex]);
//         const mixAmount = (normalizedY - (boundaries[stratumIndex + 1] - normalizedSizes[stratumIndex + 1] * 0.3)) / (normalizedSizes[stratumIndex + 1] * 0.3);
//         baseColor.lerp(nextColor, mixAmount * 0.3);
//       }

//       const r = THREE.MathUtils.lerp(shadow.r, highlight.r, bandMix) * 255;
//       const g = THREE.MathUtils.lerp(shadow.g, highlight.g, bandMix) * 255;
//       const b = THREE.MathUtils.lerp(shadow.b, highlight.b, bandMix) * 255;
//       const alpha = radialFade * 0.9;

//       data[idx + 0] = Math.max(0, Math.min(255, Math.round(r)));
//       data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
//       data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
//       data[idx + 3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
//     }
//   }

//   ctx.putImageData(image, 0, 0);
//   const texture = new THREE.CanvasTexture(canvas);
//   texture.colorSpace = THREE.SRGBColorSpace;
//   texture.wrapS = THREE.RepeatWrapping;
//   texture.wrapT = THREE.RepeatWrapping;
//   texture.anisotropy = 4;
//   texture.generateMipmaps = false;
//   texture.minFilter = THREE.LinearFilter;
//   texture.magFilter = THREE.LinearFilter;
//   texture.needsUpdate = true;
//   return texture;
// }

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

export function generateGasGiantTexture({ strataCount = 4, strataColors = ["#c7b59a", "#e6d8b5", "#d9c7a0", "#b8a58f"], strataSizes = [0.3, 0.25, 0.2, 0.25], noiseScale = 2.0, noiseStrength = 0.4, seedKey = "gg", seed }) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.wrapS = THREE.RepeatWrapping;
    fallback.wrapT = THREE.RepeatWrapping;
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

  // Ensure we have valid colors array
  const colors = strataColors && strataColors.length > 0 ? strataColors : ["#c7b59a", "#e6d8b5", "#d9c7a0", "#b8a58f"];
  const strata = Math.min(Math.max(1, strataCount || 4), 6);
  const sizes = strataSizes && strataSizes.length === strata ? strataSizes : new Array(strata).fill(1/strata);

  // Normalize sizes to sum to 1
  const totalSize = sizes.reduce((sum, s) => sum + s, 0);
  const normalizedSizes = sizes.map(s => s / totalSize);

  // Noise setup
  const nStrength = THREE.MathUtils.clamp(noiseStrength ?? 0.4, 0, 1);
  const freq = Math.max(0.2, noiseScale ?? 2.0);
  const rngSeed = `${seed || seedKey}-gasgiant-${strata}-${freq.toFixed(2)}-${nStrength.toFixed(2)}`;
  const rand = (() => { let s = Array.from(rngSeed).reduce((a,c)=>a+c.charCodeAt(0),0)>>>0; return () => { let t = s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const noise = createNoise3D(() => rand());

  // Create strata boundaries
  const boundaries = [0];
  for (let i = 0; i < strata; i++) {
    boundaries.push(boundaries[i] + normalizedSizes[i]);
  }

  for (let y = 0; y < size; y += 1) {
    const dy = (y - center) / center;
    const normalizedY = dy * 0.5 + 0.5; // Convert to 0-1 range

    for (let x = 0; x < size; x += 1) {
      const dx = (x - center) / center;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (radius >= 1) {
        data[idx + 3] = 0;
        continue;
      }

      // Find which stratum this pixel belongs to
      let stratumIndex = 0;
      for (let i = 0; i < strata; i++) {
        if (normalizedY >= boundaries[i] && normalizedY < boundaries[i + 1]) {
          stratumIndex = i;
          break;
        }
      }
      stratumIndex = Math.min(stratumIndex, colors.length - 1);

      const baseColor = new THREE.Color(colors[stratumIndex] || "#c7b59a");
      const highlight = baseColor.clone().lerp(new THREE.Color(1, 1, 1), 0.3);
      const shadow = baseColor.clone().lerp(new THREE.Color(0, 0, 0), 0.5);

      // Add some radial variation
      const radialFade = 1 - THREE.MathUtils.smoothstep(radius, 0.6, 0.9);

      // Add noise for texture variation
      const angle = Math.atan2(dy, dx);
      const radialComponent = noise(radius * freq * 2, Math.cos(angle) * freq, Math.sin(angle) * freq) * 0.5 + 0.5;
      const angularComponent = noise(Math.cos(angle * 3) * freq, Math.sin(angle * 3) * freq, radius * freq) * 0.5 + 0.5;
      const combined = THREE.MathUtils.clamp(radialComponent * 0.7 + angularComponent * 0.3, 0, 1);
      const mix = THREE.MathUtils.lerp(0.4, combined, nStrength);

      // Add some band mixing for smoother transitions
      let bandMix = mix;
      if (stratumIndex > 0 && normalizedY < boundaries[stratumIndex] + normalizedSizes[stratumIndex] * 0.3) {
        const prevColor = new THREE.Color(colors[stratumIndex - 1] || colors[stratumIndex]);
        const mixAmount = 1 - (normalizedY - boundaries[stratumIndex - 1]) / (normalizedSizes[stratumIndex - 1] * 0.3);
        baseColor.lerp(prevColor, mixAmount * 0.3);
      }
      if (stratumIndex < strata - 1 && normalizedY > boundaries[stratumIndex + 1] - normalizedSizes[stratumIndex + 1] * 0.3) {
        const nextColor = new THREE.Color(colors[stratumIndex + 1] || colors[stratumIndex]);
        const mixAmount = (normalizedY - (boundaries[stratumIndex + 1] - normalizedSizes[stratumIndex + 1] * 0.3)) / (normalizedSizes[stratumIndex + 1] * 0.3);
        baseColor.lerp(nextColor, mixAmount * 0.3);
      }

      const r = THREE.MathUtils.lerp(shadow.r, highlight.r, bandMix) * 255;
      const g = THREE.MathUtils.lerp(shadow.g, highlight.g, bandMix) * 255;
      const b = THREE.MathUtils.lerp(shadow.b, highlight.b, bandMix) * 255;
      const alpha = radialFade * 0.9;

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
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}


