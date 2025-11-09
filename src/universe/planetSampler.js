import * as THREE from "three";

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export const ROCKY_NOISE_TYPES = {
  classic: 0,
  ridged: 1,
  billowy: 2,
  warped: 3
};

export function resolveRockyNoiseType(value) {
  if (typeof value === "number") {
    return clamp(value, 0, 3);
  }
  if (typeof value === "string") {
    const key = value.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ROCKY_NOISE_TYPES, key)) {
      return ROCKY_NOISE_TYPES[key];
    }
  }
  return ROCKY_NOISE_TYPES.classic;
}

export function sphericalToCartesian(lat, lon) {
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    cosLat * Math.cos(lon),
    Math.sin(lat),
    cosLat * Math.sin(lon)
  ).normalize();
}

function permuteScalar(x) {
  return ((x * 34.0 + 1.0) * x) % 289.0;
}

function taylorInvSqrt(r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function snoise(v) {
  const Cx = 1.0 / 6.0;
  const Cy = 1.0 / 3.0;

  const i = [
    Math.floor(v[0] + (v[0] + v[1] + v[2]) * Cy),
    Math.floor(v[1] + (v[0] + v[1] + v[2]) * Cy),
    Math.floor(v[2] + (v[0] + v[1] + v[2]) * Cy)
  ];

  const x0 = [
    v[0] - i[0] + (i[0] + i[1] + i[2]) * Cx,
    v[1] - i[1] + (i[0] + i[1] + i[2]) * Cx,
    v[2] - i[2] + (i[0] + i[1] + i[2]) * Cx
  ];

  const g = [
    x0[1] >= x0[0] ? 1 : 0,
    x0[2] >= x0[1] ? 1 : 0,
    x0[0] >= x0[2] ? 1 : 0
  ];
  const l = [1 - g[0], 1 - g[1], 1 - g[2]];

  const i1 = [
    Math.min(g[0], l[2]),
    Math.min(g[1], l[0]),
    Math.min(g[2], l[1])
  ];
  const i2 = [
    Math.max(g[0], l[2]),
    Math.max(g[1], l[0]),
    Math.max(g[2], l[1])
  ];

  const x1 = [x0[0] - i1[0] + Cx, x0[1] - i1[1] + Cx, x0[2] - i1[2] + Cx];
  const x2 = [x0[0] - i2[0] + 2.0 * Cx, x0[1] - i2[1] + 2.0 * Cx, x0[2] - i2[2] + 2.0 * Cx];
  const x3 = [x0[0] - 1.0 + 3.0 * Cx, x0[1] - 1.0 + 3.0 * Cx, x0[2] - 1.0 + 3.0 * Cx];

  const iMod = [i[0] % 289.0, i[1] % 289.0, i[2] % 289.0];

  const perm1 = [
    permuteScalar(iMod[2]),
    permuteScalar(iMod[2] + i1[2]),
    permuteScalar(iMod[2] + i2[2]),
    permuteScalar(iMod[2] + 1.0)
  ];

  const perm2 = [
    permuteScalar(perm1[0] + iMod[1]),
    permuteScalar(perm1[1] + iMod[1] + i1[1]),
    permuteScalar(perm1[2] + iMod[1] + i2[1]),
    permuteScalar(perm1[3] + iMod[1] + 1.0)
  ];

  const p = [
    permuteScalar(perm2[0] + iMod[0]),
    permuteScalar(perm2[1] + iMod[0] + i1[0]),
    permuteScalar(perm2[2] + iMod[0] + i2[0]),
    permuteScalar(perm2[3] + iMod[0] + 1.0)
  ];

  const n_ = 1.0 / 7.0;
  const ns = [n_ * 2.0 - 0.0, n_ * 1.0 - 0.5, n_ * 0.0 - 1.0];

  const j = [
    p[0] - 49.0 * Math.floor(p[0] * ns[2] * ns[2]),
    p[1] - 49.0 * Math.floor(p[1] * ns[2] * ns[2]),
    p[2] - 49.0 * Math.floor(p[2] * ns[2] * ns[2]),
    p[3] - 49.0 * Math.floor(p[3] * ns[2] * ns[2])
  ];

  const x_ = [Math.floor(j[0] * ns[2]), Math.floor(j[1] * ns[2]), Math.floor(j[2] * ns[2]), Math.floor(j[3] * ns[2])];
  const y_ = [
    Math.floor(j[0] - 7.0 * x_[0]),
    Math.floor(j[1] - 7.0 * x_[1]),
    Math.floor(j[2] - 7.0 * x_[2]),
    Math.floor(j[3] - 7.0 * x_[3])
  ];

  const x = [
    x_[0] * ns[0] + ns[1],
    x_[1] * ns[0] + ns[1],
    x_[2] * ns[0] + ns[1],
    x_[3] * ns[0] + ns[1]
  ];
  const y = [
    y_[0] * ns[0] + ns[1],
    y_[1] * ns[0] + ns[1],
    y_[2] * ns[0] + ns[1],
    y_[3] * ns[0] + ns[1]
  ];

  const h = [1.0 - Math.abs(x[0]) - Math.abs(y[0]), 1.0 - Math.abs(x[1]) - Math.abs(y[1]), 1.0 - Math.abs(x[2]) - Math.abs(y[2]), 1.0 - Math.abs(x[3]) - Math.abs(y[3])];

  const b0 = [x[0], x[1], y[0], y[1]];
  const b1 = [x[2], x[3], y[2], y[3]];

  const s0 = [Math.floor(b0[0]) * 2.0 + 1.0, Math.floor(b0[1]) * 2.0 + 1.0, Math.floor(b0[2]) * 2.0 + 1.0, Math.floor(b0[3]) * 2.0 + 1.0];
  const s1 = [Math.floor(b1[0]) * 2.0 + 1.0, Math.floor(b1[1]) * 2.0 + 1.0, Math.floor(b1[2]) * 2.0 + 1.0, Math.floor(b1[3]) * 2.0 + 1.0];
  const sh = [h[0] < 0 ? -1 : 0, h[1] < 0 ? -1 : 0, h[2] < 0 ? -1 : 0, h[3] < 0 ? -1 : 0];

  const a0 = [
    b0[0] + s0[0] * sh[0],
    b0[2] + s0[2] * sh[0],
    b0[1] + s0[1] * sh[1],
    b0[3] + s0[3] * sh[1]
  ];
  const a1 = [
    b1[0] + s1[0] * sh[2],
    b1[2] + s1[2] * sh[2],
    b1[1] + s1[1] * sh[3],
    b1[3] + s1[3] * sh[3]
  ];

  const grad = [
    [a0[0], a0[1], h[0]],
    [a0[2], a0[3], h[1]],
    [a1[0], a1[1], h[2]],
    [a1[2], a1[3], h[3]]
  ];

  const norm = [
    taylorInvSqrt(dot3(grad[0], grad[0])),
    taylorInvSqrt(dot3(grad[1], grad[1])),
    taylorInvSqrt(dot3(grad[2], grad[2])),
    taylorInvSqrt(dot3(grad[3], grad[3]))
  ];
  for (let idx = 0; idx < 4; idx += 1) {
    grad[idx][0] *= norm[idx];
    grad[idx][1] *= norm[idx];
    grad[idx][2] *= norm[idx];
  }

  const m = [
    Math.max(0.6 - dot3(x0, x0), 0.0),
    Math.max(0.6 - dot3(x1, x1), 0.0),
    Math.max(0.6 - dot3(x2, x2), 0.0),
    Math.max(0.6 - dot3(x3, x3), 0.0)
  ];

  const m2 = [m[0] * m[0], m[1] * m[1], m[2] * m[2], m[3] * m[3]];
  const dotProducts = [
    dot3(grad[0], x0),
    dot3(grad[1], x1),
    dot3(grad[2], x2),
    dot3(grad[3], x3)
  ];

  return 42.0 * (m2[0] * m2[0] * dotProducts[0] + m2[1] * m2[1] * dotProducts[1] + m2[2] * m2[2] * dotProducts[2] + m2[3] * m2[3] * dotProducts[3]);
}

function fbm(p, octaves, persistence, lacunarity) {
  let amplitude = 1.0;
  let frequency = 1.0;
  let total = 0.0;
  let normalization = 0.0;

  for (let i = 0; i < octaves; i += 1) {
    const scaled = [p[0] * frequency, p[1] * frequency, p[2] * frequency];
    total += amplitude * snoise(scaled);
    normalization += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return normalization > 0 ? total / normalization : 0;
}

function fbmBillow(p, octaves, persistence, lacunarity) {
  let amplitude = 1.0;
  let frequency = 1.0;
  let total = 0.0;
  let normalization = 0.0;

  for (let i = 0; i < octaves; i += 1) {
    const scaled = [p[0] * frequency, p[1] * frequency, p[2] * frequency];
    let n = snoise(scaled);
    n = Math.abs(n);
    total += n * amplitude;
    normalization += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return normalization > 0 ? total / normalization : 0;
}

function fbmRidged(p, octaves, persistence, lacunarity) {
  let amplitude = 0.5;
  let frequency = 1.0;
  let total = 0.0;
  let weight = 1.0;

  for (let i = 0; i < 8; i += 1) {
    if (i >= octaves) break;
    const scaled = [p[0] * frequency, p[1] * frequency, p[2] * frequency];
    let n = snoise(scaled);
    n = 1.0 - Math.abs(n);
    n *= n;
    n *= weight;
    total += n * amplitude;
    weight = clamp(n * 4.0, 0.0, 1.0);
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return total * 2.0;
}

function domainWarp(p, warpStrength, warpFrequency, variant) {
  const q = [
    snoise([p[0] * warpFrequency, p[1] * warpFrequency, p[2] * warpFrequency]),
    snoise([p[0] * warpFrequency + 43.0, p[1] * warpFrequency + 17.0, p[2] * warpFrequency + 29.0]),
    snoise([p[0] * warpFrequency + 23.0, p[1] * warpFrequency + 71.0, p[2] * warpFrequency + 11.0])
  ];

  const r = [
    snoise([
      p[0] * warpFrequency * 2.0 + q[0] * (0.5 + variant) + 19.0,
      p[1] * warpFrequency * 2.0 + q[1] * (0.5 + variant) + 39.0,
      p[2] * warpFrequency * 2.0 + q[2] * (0.5 + variant) + 57.0
    ]),
    snoise([
      p[0] * warpFrequency * 2.0 + q[0] * (0.5 + variant) + 59.0,
      p[1] * warpFrequency * 2.0 + q[1] * (0.5 + variant) + 11.0,
      p[2] * warpFrequency * 2.0 + q[2] * (0.5 + variant) + 83.0
    ]),
    snoise([
      p[0] * warpFrequency * 2.0 + q[0] * (0.5 + variant) + 17.0,
      p[1] * warpFrequency * 2.0 + q[1] * (0.5 + variant) + 93.0,
      p[2] * warpFrequency * 2.0 + q[2] * (0.5 + variant) + 41.0
    ])
  ];

  return [
    (q[0] + r[0]) * warpStrength,
    (q[1] + r[1]) * warpStrength,
    (q[2] + r[2]) * warpStrength
  ];
}

export class TerrainSampler {
  constructor(params, baseLatitude, baseLongitude, radius) {
    this.params = params;
    this.baseLatitude = baseLatitude;
    this.baseLongitude = baseLongitude;
    this.radius = radius;
    this.planetScale = radius;

    this.tempDir = new THREE.Vector3();
    this.tempArray = [0, 0, 0];

    this.seaLevel = typeof params.seaLevel === "number" ? params.seaLevel : 0.52;
    this.mountainHeight = typeof params.mountainHeight === "number" ? params.mountainHeight : 0.4;
    this.continentSize = typeof params.continentSize === "number" ? params.continentSize : 1.5;
    this.roughness = typeof params.roughness === "number" ? params.roughness : 0.55;
    this.detail = typeof params.detail === "number" ? params.detail : 6.0;
    this.noiseVariant = clamp(typeof params.noiseVariant === "number" ? params.noiseVariant : 0.5, 0, 1);
    this.noiseType = resolveRockyNoiseType(params.noiseType);
    this.iceCapThreshold = typeof params.iceCapThreshold === "number" ? params.iceCapThreshold : 0.9;

    this.colors = {
      deepWater: new THREE.Color(params.colorDeepWater ?? "#002b4d"),
      shallowWater: new THREE.Color(params.colorShallowWater ?? "#006994"),
      beach: new THREE.Color(params.colorBeach ?? "#d4c6a3"),
      grass: new THREE.Color(params.colorGrass ?? "#2a602a"),
      forest: new THREE.Color(params.colorForest ?? "#1a381a"),
      mountain: new THREE.Color(params.colorMountain ?? "#666666"),
      mountainHigh: new THREE.Color(params.colorMountainHigh ?? "#888888"),
      snow: new THREE.Color(params.colorSnow ?? "#ffffff")
    };

    this.tempColor = new THREE.Color();
    this.tempColorB = new THREE.Color();

    this.minLatitude = -Math.PI / 2 + 0.001;
    this.maxLatitude = Math.PI / 2 - 0.001;
  }

  computeFinalHeight(dir) {
    const p = this.tempArray;
    p[0] = dir.x * this.continentSize;
    p[1] = dir.y * this.continentSize;
    p[2] = dir.z * this.continentSize;

    const h = fbm(p, 8, this.roughness, this.detail);

    const hmCoord = [
      p[0] * (3.0 + this.noiseVariant),
      p[1] * (3.0 + this.noiseVariant),
      p[2] * (3.0 + this.noiseVariant)
    ];
    let hm = fbm(hmCoord, 4, this.roughness, this.detail * (1.4 + this.noiseVariant * 0.3));
    hm = 1.0 - Math.abs(hm);
    hm = Math.pow(hm, 3.0);

    const ridged = fbmRidged([
      p[0] * (2.0 + this.noiseVariant),
      p[1] * (2.0 + this.noiseVariant),
      p[2] * (2.0 + this.noiseVariant)
    ], 6, THREE.MathUtils.lerp(0.35, this.roughness, 0.6), this.detail + 0.5);

    const billow = fbmBillow([
      p[0] * (1.2 + this.noiseVariant * 0.6),
      p[1] * (1.2 + this.noiseVariant * 0.6),
      p[2] * (1.2 + this.noiseVariant * 0.6)
    ], 6, THREE.MathUtils.lerp(0.5, this.roughness, 0.5), this.detail * (0.9 + this.noiseVariant * 0.4));

    const warpedCoord = domainWarp(p, THREE.MathUtils.lerp(0.18, 0.55, this.noiseVariant), 1.3 + this.noiseVariant * 2.2, this.noiseVariant);
    const warped = fbm(warpedCoord, 6, this.roughness, this.detail * (1.1 + this.noiseVariant * 0.3));

    let finalHeight;
    if (this.noiseType < 0.5) {
      finalHeight = (h * 0.55 + hm * 0.45) + 0.5;
    } else if (this.noiseType < 1.5) {
      finalHeight = THREE.MathUtils.lerp(h + 0.5, h * 0.35 + ridged * 0.65 + 0.5, 0.75);
    } else if (this.noiseType < 2.5) {
      finalHeight = THREE.MathUtils.lerp(h + 0.5, billow * 0.75 + 0.25, 0.7);
    } else {
      const blend = THREE.MathUtils.lerp(0.6, 0.85, this.noiseVariant);
      finalHeight = THREE.MathUtils.lerp(h + 0.5, warped * blend + 0.5 * (1.0 - blend), blend);
    }

    return clamp(finalHeight, 0.0, 1.4);
  }

  writeColor(target, vertexIndex, finalHeight, latitude) {
    const seaLevel = this.seaLevel;
    const colors = this.colors;
    const color = this.tempColor;

    if (finalHeight <= seaLevel) {
      const waterDepth = smoothstep(seaLevel - 0.2, seaLevel, finalHeight);
      color.copy(colors.deepWater).lerp(colors.shallowWater, waterDepth);
    } else {
      const alt = smoothstep(seaLevel, 1.0, finalHeight);
      color.copy(colors.beach);
      color.lerp(colors.grass, smoothstep(0.0, 0.05, alt));
      color.lerp(colors.forest, smoothstep(0.05, 0.3, alt));
      color.lerp(colors.mountain, smoothstep(0.3, 0.5, alt));
      color.lerp(colors.mountainHigh, smoothstep(0.5, 0.7, alt));
    }

    const ice = smoothstep(this.iceCapThreshold - 0.1, this.iceCapThreshold, latitude);
    if (ice > 0) {
      if (finalHeight <= seaLevel) {
        this.tempColorB.copy(colors.snow).multiplyScalar(0.9);
        color.lerp(this.tempColorB, ice);
      } else {
        color.lerp(colors.snow, ice);
      }
    }

    const baseIndex = vertexIndex * 3;
    target[baseIndex] = color.r;
    target[baseIndex + 1] = color.g;
    target[baseIndex + 2] = color.b;
  }

  sampleAtPlane(x, z) {
    const lat = THREE.MathUtils.clamp(
      this.baseLatitude + z / this.radius,
      this.minLatitude,
      this.maxLatitude
    );
    const avgLat = (this.baseLatitude + lat) * 0.5;
    const cosLat = Math.max(0.0001, Math.cos(avgLat));
    let lon = this.baseLongitude + x / (this.radius * cosLat);
    lon = ((lon + Math.PI) % (2 * Math.PI)) - Math.PI;

    const dir = sphericalToCartesian(lat, lon);
    const finalHeight = this.computeFinalHeight(dir);
    const relief = finalHeight - this.seaLevel;
    const displacement = relief > 0
      ? relief * this.mountainHeight * 0.3 * this.planetScale
      : 0;
    const latitude = Math.abs(dir.y);
    return { finalHeight, displacement, latitude };
  }
}


