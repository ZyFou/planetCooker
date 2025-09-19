// Biome material system for procedural planets
import * as THREE from "three";

export const BIOME_TYPES = {
  ROCK: 'rock',
  WATER: 'water', 
  ICE: 'ice',
  VEGETATION: 'vegetation',
  SAND: 'sand',
  SNOW: 'snow'
};

export const BIOME_COLORS = {
  [BIOME_TYPES.ROCK]: {
    primary: '#8B7355',
    secondary: '#A09080',
    accent: '#6B5B4A'
  },
  [BIOME_TYPES.WATER]: {
    primary: '#1B4F72',
    secondary: '#2E86AB',
    accent: '#0F3A4A'
  },
  [BIOME_TYPES.ICE]: {
    primary: '#E8F4FD',
    secondary: '#B8D4F0',
    accent: '#A8C8E8'
  },
  [BIOME_TYPES.VEGETATION]: {
    primary: '#2D5016',
    secondary: '#4A7C59',
    accent: '#1A3A0A'
  },
  [BIOME_TYPES.SAND]: {
    primary: '#D2B48C',
    secondary: '#F4E4BC',
    accent: '#B8860B'
  },
  [BIOME_TYPES.SNOW]: {
    primary: '#FFFFFF',
    secondary: '#F0F8FF',
    accent: '#E6E6FA'
  }
};

export const BIOME_PROPERTIES = {
  [BIOME_TYPES.ROCK]: {
    roughness: 0.9,
    metalness: 0.1,
    bumpScale: 0.3,
    normalScale: 0.2
  },
  [BIOME_TYPES.WATER]: {
    roughness: 0.0,
    metalness: 0.0,
    bumpScale: 0.1,
    normalScale: 0.05,
    transparent: true,
    opacity: 0.8
  },
  [BIOME_TYPES.ICE]: {
    roughness: 0.1,
    metalness: 0.0,
    bumpScale: 0.2,
    normalScale: 0.1,
    transparent: true,
    opacity: 0.9
  },
  [BIOME_TYPES.VEGETATION]: {
    roughness: 0.8,
    metalness: 0.0,
    bumpScale: 0.4,
    normalScale: 0.3
  },
  [BIOME_TYPES.SAND]: {
    roughness: 0.7,
    metalness: 0.0,
    bumpScale: 0.1,
    normalScale: 0.05
  },
  [BIOME_TYPES.SNOW]: {
    roughness: 0.3,
    metalness: 0.0,
    bumpScale: 0.05,
    normalScale: 0.02
  }
};

// Generate procedural textures for biomes
export function generateBiomeTexture(biomeType, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  const colors = BIOME_COLORS[biomeType];
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  
  // Simple noise-based texture generation
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % size;
    const y = Math.floor((i / 4) / size);
    
    // Generate noise pattern
    const noise1 = Math.sin(x * 0.1) * Math.cos(y * 0.1);
    const noise2 = Math.sin(x * 0.05) * Math.cos(y * 0.05);
    const noise3 = Math.sin(x * 0.02) * Math.cos(y * 0.02);
    const combinedNoise = (noise1 + noise2 * 0.5 + noise3 * 0.25) / 1.75;
    
    // Map noise to color variation
    const variation = (combinedNoise + 1) * 0.5; // Normalize to 0-1
    
    let r, g, b;
    
    if (variation < 0.33) {
      // Primary color
      const color = hexToRgb(colors.primary);
      r = color.r;
      g = color.g;
      b = color.b;
    } else if (variation < 0.66) {
      // Secondary color
      const color = hexToRgb(colors.secondary);
      r = color.r;
      g = color.g;
      b = color.b;
    } else {
      // Accent color
      const color = hexToRgb(colors.accent);
      r = color.r;
      g = color.g;
      b = color.b;
    }
    
    // Add some randomness
    const randomFactor = 0.1;
    r += (Math.random() - 0.5) * randomFactor * 255;
    g += (Math.random() - 0.5) * randomFactor * 255;
    b += (Math.random() - 0.5) * randomFactor * 255;
    
    data[i] = Math.max(0, Math.min(255, r));     // R
    data[i + 1] = Math.max(0, Math.min(255, g)); // G
    data[i + 2] = Math.max(0, Math.min(255, b)); // B
    data[i + 3] = 255; // A
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  
  return texture;
}

// Generate normal map for biome
export function generateBiomeNormalMap(biomeType, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % size;
    const y = Math.floor((i / 4) / size);
    
    // Generate height map
    const noise1 = Math.sin(x * 0.1) * Math.cos(y * 0.1);
    const noise2 = Math.sin(x * 0.05) * Math.cos(y * 0.05);
    const height = (noise1 + noise2 * 0.5) / 1.5;
    
    // Calculate normal from height differences
    const leftHeight = Math.sin((x - 1) * 0.1) * Math.cos(y * 0.1);
    const rightHeight = Math.sin((x + 1) * 0.1) * Math.cos(y * 0.1);
    const topHeight = Math.sin(x * 0.1) * Math.cos((y - 1) * 0.1);
    const bottomHeight = Math.sin(x * 0.1) * Math.cos((y + 1) * 0.1);
    
    const dx = (rightHeight - leftHeight) / 2;
    const dy = (bottomHeight - topHeight) / 2;
    
    // Convert to normal map format
    const normalX = (dx + 1) * 0.5;
    const normalY = (dy + 1) * 0.5;
    const normalZ = Math.sqrt(1 - normalX * normalX - normalY * normalY);
    
    data[i] = Math.max(0, Math.min(255, normalX * 255));     // R
    data[i + 1] = Math.max(0, Math.min(255, normalY * 255)); // G
    data[i + 2] = Math.max(0, Math.min(255, normalZ * 255)); // B
    data[i + 3] = 255; // A
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  
  return texture;
}

// Create biome material
export function createBiomeMaterial(biomeType) {
  const properties = BIOME_PROPERTIES[biomeType];
  const colors = BIOME_COLORS[biomeType];
  
  const material = new THREE.MeshStandardMaterial({
    color: colors.primary,
    roughness: properties.roughness,
    metalness: properties.metalness,
    transparent: properties.transparent || false,
    opacity: properties.opacity || 1.0
  });
  
  // Add textures
  material.map = generateBiomeTexture(biomeType);
  material.normalMap = generateBiomeNormalMap(biomeType);
  material.normalScale = new THREE.Vector2(properties.normalScale, properties.normalScale);
  
  return material;
}

// Determine biome based on elevation, temperature, and moisture
export function determineBiome(elevation, temperature, moisture) {
  // Normalize inputs to 0-1 range
  const normElevation = (elevation + 1) / 2; // -1 to 1 -> 0 to 1
  const normTemp = (temperature + 1) / 2;
  const normMoisture = (moisture + 1) / 2;
  
  // High elevation = snow/ice
  if (normElevation > 0.8) {
    return normTemp < 0.3 ? BIOME_TYPES.ICE : BIOME_TYPES.SNOW;
  }
  
  // Water level
  if (normElevation < 0.3) {
    return normTemp < 0.2 ? BIOME_TYPES.ICE : BIOME_TYPES.WATER;
  }
  
  // Land biomes based on temperature and moisture
  if (normTemp < 0.3) {
    return BIOME_TYPES.ICE;
  } else if (normTemp < 0.6) {
    if (normMoisture < 0.3) {
      return BIOME_TYPES.ROCK;
    } else if (normMoisture < 0.7) {
      return BIOME_TYPES.VEGETATION;
    } else {
      return BIOME_TYPES.VEGETATION;
    }
  } else {
    if (normMoisture < 0.2) {
      return BIOME_TYPES.SAND;
    } else if (normMoisture < 0.6) {
      return BIOME_TYPES.ROCK;
    } else {
      return BIOME_TYPES.VEGETATION;
    }
  }
}

// Helper function to convert hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

// Biome material cache
const biomeMaterialCache = new Map();

export function getBiomeMaterial(biomeType) {
  if (!biomeMaterialCache.has(biomeType)) {
    biomeMaterialCache.set(biomeType, createBiomeMaterial(biomeType));
  }
  return biomeMaterialCache.get(biomeType);
}

// Clear biome material cache
export function clearBiomeMaterialCache() {
  biomeMaterialCache.forEach(material => {
    if (material.map) material.map.dispose();
    if (material.normalMap) material.normalMap.dispose();
    material.dispose();
  });
  biomeMaterialCache.clear();
}