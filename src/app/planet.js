import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import { SeededRNG } from "./utils.js";
import * as PHYSICS from "./planet/physics.js";
import { generateRingTexture as generateRingTextureExt, generateAnnulusTexture as generateAnnulusTextureExt, generateGasGiantTexture as generateGasGiantTextureExt, generateRockTexture, generateSandTexture } from "./textures.js";
import { blackHoleDiskUniforms, blackHoleDiskVertexShader, blackHoleDiskFragmentShader } from "./sun.js";
import { AuroraNode } from "../nodes/AuroraNode.js";

const surfaceVertexShader = `
    attribute vec3 color;

    varying vec3 vColor;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;
    varying vec4 vShadowCoord;

    void main() {
        vColor = color;
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        vPosition = position;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        
        // Shadow mapping support
        vShadowCoord = gl_Position;
    }
`;

const surfaceFragmentShader = `
    varying vec3 vColor;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;
    varying vec4 vShadowCoord;

    uniform sampler2D tRock;
    uniform sampler2D tSand;
    uniform sampler2D tSplat;
    uniform float detailStrength;
    uniform vec3 lightDirection;
    uniform vec3 lightColor;
    uniform float lightIntensity;
    uniform vec3 ambientLightColor;
    uniform float ambientLightIntensity;
    uniform sampler2D shadowMap;
    uniform mat4 shadowMatrix;

    // Shadow mapping function
    float getShadow(vec4 shadowCoord) {
        vec3 shadowCoords = shadowCoord.xyz / shadowCoord.w;
        shadowCoords = shadowCoords * 0.5 + 0.5;
        
        if (shadowCoords.x < 0.0 || shadowCoords.x > 1.0 || 
            shadowCoords.y < 0.0 || shadowCoords.y > 1.0) {
            return 1.0;
        }
        
        float depth = texture2D(shadowMap, shadowCoords.xy).r;
        float currentDepth = shadowCoords.z;
        
        float bias = 0.001;
        return currentDepth - bias > depth ? 0.3 : 1.0;
    }

    void main() {
        vec4 splat = texture2D(tSplat, vUv);
        vec4 rock = texture2D(tRock, vUv * 10.0);
        vec4 sand = texture2D(tSand, vUv * 10.0);

        vec3 detailSample = mix(rock.rgb, sand.rgb, splat.r);
        float detail = dot(detailSample, vec3(0.299, 0.587, 0.114));
        detail = detail * 0.6 + 0.4;
        float detailFactor = mix(1.0, detail, clamp(detailStrength, 0.0, 1.0));

        vec3 baseColor = vColor * detailFactor;
        
        // Normalize the normal
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(lightDirection);
        
        // Ambient lighting
        vec3 ambient = baseColor * ambientLightColor * ambientLightIntensity;
        
        // Diffuse lighting
        float NdotL = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = baseColor * lightColor * lightIntensity * NdotL;
        
        // Shadow calculation
        float shadow = getShadow(vShadowCoord);
        
        // Combine lighting with shadows
        vec3 finalColor = ambient + diffuse * shadow;
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

const atmosphereVertexShader = `
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const atmosphereFragmentShader = `
    uniform vec3 lightDirection;
    uniform float atmosphereIntensity;
    uniform float sunBrightness;
    uniform vec3 sunColor;
    uniform vec3 atmosphereColor;
    uniform float atmosphereFresnelPower;
    uniform float atmosphereRimPower;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
        float fresnel = 1.0 - abs(dot(normalize(vPosition), vNormal));
        fresnel = pow(fresnel, atmosphereFresnelPower);

        vec3 baseAtmosphereColor = atmosphereColor * atmosphereIntensity;

        float rim = 1.0 - max(dot(vNormal, lightDirection), 0.0);
        rim = pow(rim, atmosphereRimPower);

        vec3 finalColor = baseAtmosphereColor * (fresnel + rim * 0.5) * sunColor * sunBrightness;

        gl_FragColor = vec4(finalColor, fresnel * 0.3 * atmosphereIntensity);
    }
`;

const PLANET_SURFACE_LOD_ORDER = ["ultra", "high", "medium", "low", "micro"];

const PLANET_SURFACE_LOD_CONFIG = {
    ultra:   { detailOffset: 2.0, rockDetailMultiplier: 2.0, rockDetailMin: 10, distanceMultiplier: 0.8,  gasSegmentScale: 2.0, textureScale: 2.0 },
    high:    { detailOffset: 1.0, rockDetailMultiplier: 1.5, rockDetailMin: 8,  distanceMultiplier: 1.5,  gasSegmentScale: 1.5, textureScale: 1.5 },
    medium:  { detailOffset: 0.0, rockDetailMultiplier: 1.0, rockDetailMin: 6,  distanceMultiplier: 3.0,  gasSegmentScale: 1.0, textureScale: 1.0 },
    low:     { detailOffset: -1.0, rockDetailMultiplier: 0.7, rockDetailMin: 4,  distanceMultiplier: 6.0,  gasSegmentScale: 0.7, textureScale: 0.7 },
    micro:   { detailOffset: -2.0, rockDetailMultiplier: 0.5, rockDetailMin: 2,  distanceMultiplier: 12.0, gasSegmentScale: 0.5, textureScale: 0.5 },
};

// --- Chunked LOD over a Cube-Sphere -------------------------------------------------------------

const CHUNK_LOD_DEFAULTS = {
  enabled: true,
  maxLevel: 6,                 // profondeur max de quadtree (≈ 90° / 2^L par face)
  baseResolution: 17,          // (n x n) vertices par chunk racine ; rester impair pour UV/centres
  splitDistanceK: 6.5,         // tuning: plus grand → split plus tôt (plus de détails)
  hysteresis: 1.35,            // anti-oscillation split/merge (merge = split / hysteresis)
  fadeDurationMs: 280,
  skirtDepth: 0.004,           // petites jupes anti-cracks (en fraction du radius)
  chunkFadeSpread: 0.45        // utilise ton _lodChunkFadeSpread
};

// map face index → base axes (cube -> sphere)
const FACE_AXES = [
  // +X, -X, +Y, -Y, +Z, -Z
  { u:[0,0,  -1], v:[0,1,0],  n:[1,0,0] },   // +X
  { u:[0,0,   1], v:[0,1,0],  n:[-1,0,0] },  // -X
  { u:[1,0,  0], v:[0,0,1],   n:[0,1,0] },   // +Y (top)
  { u:[1,0,  0], v:[0,0,1],   n:[0,-1,0] },  // -Y (bottom) - flipped V for correct orientation
  { u:[1,0,  0], v:[0,1,0],   n:[0,0,1] },   // +Z
  { u:[-1,0, 0], v:[0,1,0],   n:[0,0,-1] },  // -Z
];

function vec3(a){ return new THREE.Vector3(a[0],a[1],a[2]); }

class CubeFaceChunk {
  constructor(manager, faceIndex, bounds, level, parent=null) {
    this.manager = manager;
    this.faceIndex = faceIndex;  // 0..5
    this.bounds = bounds;        // {umin,umax,vmin,vmax} dans [-1,1] face plane
    this.level = level;          // 0 = racine
    this.parent = parent;
    this.children = null;
    this.mesh = null;
    this.isFadingIn = false;
    this.isFadingOut = false;
    this.fadeStart = 0;
    this.isLeaf = true;
    this.screenMetric = 0;
    this.centerWorld = new THREE.Vector3();
    this.radiusWorld = 0;        // bounding sphere approx pour ce patch
  }

  dispose() {
    if (this.mesh) {
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
      this.mesh.removeFromParent();
      this.mesh = null;
    }
    if (this.children) {
      this.children.forEach(c => c.dispose());
      this.children = null;
    }
  }

  // crée/maj géométrie du chunk
  ensureMesh() {
    if (this.mesh) return;
    const planet = this.manager.planet;
    const g = this.manager.buildPatchGeometry(this.faceIndex, this.bounds, this.level);
    const mat = this.manager.material;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.renderOrder = this.level;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;
    planet._installLODFadeHooks(this.mesh);
    planet._setLODFadeAlpha(this.mesh, 0); // start transparent for fade-in
    this.manager.group.add(this.mesh);

    // approx bounding sphere: centre du patch et rayon ~ demi-diagonale locale
    this.computeBoundsWorld();
  }

  computeBoundsWorld() {
    const {umin,umax,vmin,vmax} = this.bounds;
    const fAxes = FACE_AXES[this.faceIndex];
    const U = vec3(fAxes.u), V = vec3(fAxes.v), N = vec3(fAxes.n);
    const corners = [
      [umin,vmin],[umax,vmin],[umax,vmax],[umin,vmax]
    ];
    const R = this.manager.params.radius;
    const tmp = new THREE.Vector3();
    const acc = new THREE.Vector3();
    acc.set(0,0,0);
    for (const [u,v] of corners) {
      tmp.copy(N).addScaledVector(U,u).addScaledVector(V,v);
      tmp.normalize().multiplyScalar(R);
      acc.add(tmp);
    }
    this.centerWorld.copy(acc.multiplyScalar(0.25)).add(this.manager.originWorld);
    // rayon approx = angle du patch * R
    const halfDU = (umax-umin)*0.5, halfDV = (vmax-vmin)*0.5;
    const angular = Math.max(halfDU, halfDV) * (Math.PI/2); // chaque face couvre 90°
    this.radiusWorld = Math.max(angular * R, 0.001);
  }

  // renvoie true si devrait splitter
  shouldSplit(camera) {
    if (this.level >= this.manager.cfg.maxLevel) return false;
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const d = camPos.distanceTo(this.centerWorld);
    // simple metric: si patch “projete” à l’écran dépasse un certain seuil
    // approx taille-écran ~ (diamètre chunk / distance) * focal
    const planet = this.manager.planet;
    const R = this.manager.params.radius;
    const diameter = Math.max(0.001, 2 * this.radiusWorld);
    const splitNear = R * this.manager.cfg.splitDistanceK * Math.pow(0.5, this.level);
    // plus on est près que splitNear, plus on split
    const metric = splitNear / Math.max(d, 1e-3);
    this.screenMetric = metric;
    return metric > 1.0;
  }

  shouldMerge(camera) {
    if (!this.isLeaf) return false; // merge decision occurs on parent handling children
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const d = camPos.distanceTo(this.centerWorld);
    const R = this.manager.params.radius;
    const splitNear = R * this.manager.cfg.splitDistanceK * Math.pow(0.5, this.level);
    const metric = splitNear / Math.max(d, 1e-3);
    return metric < (1.0 / this.manager.cfg.hysteresis);
  }

  // split en 4 enfants (quadtree)
  split() {
    if (this.children) return;
    const {umin,umax,vmin,vmax} = this.bounds;
    const umid = (umin+umax)/2, vmid = (vmin+vmax)/2;
    const l = this.level+1;
    this.children = [
      new CubeFaceChunk(this.manager, this.faceIndex, { umin, umax:umid, vmin, vmax:vmid }, l, this),
      new CubeFaceChunk(this.manager, this.faceIndex, { umin:umid, umax, vmin, vmax:vmid }, l, this),
      new CubeFaceChunk(this.manager, this.faceIndex, { umin:umid, umax, vmin:vmid, vmax }, l, this),
      new CubeFaceChunk(this.manager, this.faceIndex, { umin, umax:umid, vmin:vmid, vmax }, l, this),
    ];
    this.isLeaf = false;

    // fade in children & fade out self
    const now = performance.now();
    this.children.forEach(c => {
      c.ensureMesh();
      c.isFadingIn = true;
      c.fadeStart = now;
      this.manager.planet._setLODFadeAlpha(c.mesh, 0);
    });

    if (this.mesh) {
      this.isFadingOut = true;
      this.fadeStart = now;
      this.manager.planet._setLODFadeAlpha(this.mesh, 1);
    }
  }

  // détruit récursivement les enfants avec fondu inverse
  merge() {
    if (!this.children) return;
    const now = performance.now();
    // fade in parent (if exists)
    if (this.mesh) {
      this.isFadingIn = true;
      this.fadeStart = now;
      this.manager.planet._setLODFadeAlpha(this.mesh, 0);
    } else {
      this.ensureMesh();
      this.isFadingIn = true;
      this.fadeStart = now;
    }
    // fade out children
    this.children.forEach(c => {
      if (c.mesh) {
        c.isFadingOut = true;
        c.fadeStart = now;
        this.manager.planet._setLODFadeAlpha(c.mesh, 1);
      }
    });
  }

  tickFade() {
    const cfg = this.manager.cfg;
    const tNow = performance.now();
    const ease = (t)=> (t<0?0:t>1?1:(t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2));

    if (this.isFadingIn && this.mesh) {
      const t = (tNow - this.fadeStart)/cfg.fadeDurationMs;
      this.manager.planet._setLODFadeProfile(this.mesh, { mode:'in', progress:ease(t), spread:this.manager.cfg.chunkFadeSpread, ease:1.2 });
      
      // Réduire l'overdraw : activer depthWrite dès que les enfants > 70%
      if (t >= 0.7 && this.mesh.material) {
        this.mesh.material.depthWrite = true;
      }
      
      if (t>=1) { 
        this.isFadingIn = false; 
        this.manager.planet._setLODFadeAlpha(this.mesh, 1);
        // Finaliser avec opacité pleine
        if (this.mesh && this.mesh.material) {
          this.mesh.material.depthWrite = true;
          this.mesh.material.alphaHash = false;
          this.mesh.material.transparent = false;
        }
      }
    }
    if (this.isFadingOut && this.mesh) {
      const t = (tNow - this.fadeStart)/cfg.fadeDurationMs;
      this.manager.planet._setLODFadeProfile(this.mesh, { mode:'out', progress:ease(t), spread:this.manager.cfg.chunkFadeSpread, ease:1.2 });
      
      // Réduire l'overdraw : masquer le parent dès que progress > 0.5
      if (t >= 0.5) {
        this.mesh.visible = false;
      }
      
      if (t>=1) {
        this.isFadingOut = false;
        if (this.mesh) {
          this.mesh.visible = false; // <- force
          const m = this.mesh;
          this.mesh = null;
          if (m.geometry) m.geometry.dispose();
          if (m.material) m.material.dispose();
          m.removeFromParent();
        }
      }
    }

    if (!this.isLeaf && this.children) {
      let allGone = true;
      for (const c of this.children) {
        c.tickFade();
        if (c.isFadingOut || c.mesh) allGone = false;
      }
      if (allGone) {
        // enfants totalement retirés
        this.children.forEach(c => c.dispose());
        this.children = null;
        this.isLeaf = true;
      }
    }
  }
}

class ChunkedLODSphere {
  constructor(planet, cfg={}) {
    this.planet = planet;
    this.cfg = {...CHUNK_LOD_DEFAULTS, ...cfg};
    this.params = planet.params;
    this.group = new THREE.Group();
    this.group.name = 'ChunkedLODSphere';
    planet.spinGroup.add(this.group);

    // origine monde (pour centrage)
    this.originWorld = new THREE.Vector3(0,0,0);

    // matériau partagé (vertexColors comme ton mesh rocky)
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.12,
      flatShading: false,
      side: THREE.FrontSide,      // <- important
      transparent: false          // <- pas de blend permanent
    });

    // bruit/profil identiques à rebuildPlanet()
    this._initNoise();

    // 6 faces racines
    this.roots = [];
    for (let f=0; f<6; f++) {
      const root = new CubeFaceChunk(this, f, { umin:-1,umax:1,vmin:-1,vmax:1 }, 0, null);
      root.ensureMesh();  // visible via fade
      this.planet._setLODFadeAlpha(root.mesh, 1);
      this.roots.push(root);
    }
  }

  dispose() {
    this.roots.forEach(r => r.dispose());
    this.roots = [];
    if (this.group) {
      this.group.removeFromParent();
      this.group = null;
    }
  }

  _initNoise() {
    const rng = new SeededRNG(this.params.seed);
    const noiseRng = rng.fork();
    this.baseNoise = createNoise3D(() => noiseRng.next());
    this.ridgeNoise = createNoise3D(() => noiseRng.next());
    this.warpNoiseX = createNoise3D(() => noiseRng.next());
    this.warpNoiseY = createNoise3D(() => noiseRng.next());
    this.warpNoiseZ = createNoise3D(() => noiseRng.next());
    this.craterNoise = createNoise3D(() => noiseRng.next());
    this.profile = this.planet.deriveTerrainProfile(this.params.seed);

    // offsets par couche
    this.offsets = [];
    for (let i = 0; i < this.params.noiseLayers; i++) {
      const fork = noiseRng.fork();
      this.offsets.push(new THREE.Vector3(
        fork.nextFloat(-128,128),
        fork.nextFloat(-128,128),
        fork.nextFloat(-128,128)
      ));
    }
  }

  // fabrique la géométrie du patch en grille quad (convertie en triangles)
  buildPatchGeometry(faceIndex, bounds, level) {
    const n = Math.max(5, this.cfg.baseResolution * Math.pow(2, Math.min(level, this.cfg.maxLevel))); // grid points
    const verts = n * n;
    const idxCount = (n-1)*(n-1)*6;

    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(verts*3);
    const colors = new Float32Array(verts*3);
    const uvs = new Float32Array(verts*2);
    const indices = new Uint32Array(idxCount);

    const fAxes = FACE_AXES[faceIndex];
    const U = vec3(fAxes.u), V = vec3(fAxes.v), N = vec3(fAxes.n);

    const { umin,umax,vmin,vmax } = bounds;
    const R = this.params.radius;
    const skirt = this.cfg.skirtDepth * R;

    const vpos = new THREE.Vector3();
    const unit = new THREE.Vector3();

    let ip = 0, iu = 0, ii = 0;

    // --- vertices
    for (let j=0;j<n;j++){
      const v = j/(n-1);
      const vv = THREE.MathUtils.lerp(vmin, vmax, v);
      for (let i=0;i<n;i++){
        const u = i/(n-1);
        const uu = THREE.MathUtils.lerp(umin, umax, u);

        // pos cube -> sphere
        const c = N.clone().addScaledVector(U, uu).addScaledVector(V, vv);
        unit.copy(c).normalize();

        // Warp displacement, with polar correction
        const sampleDir = unit.clone();
        if (this.profile.warpStrength > 0) {
            const warpAmount = this.profile.warpStrength * 0.35;
            const poleFalloff = 1.0 - Math.pow(Math.abs(unit.y), 4);
            const effectiveWarp = warpAmount * poleFalloff;

            const fx = this.profile.warpFrequency;
            const offset = this.profile.warpOffset;
            const warpVec = new THREE.Vector3(
                this.warpNoiseX(unit.x * fx + offset.x, unit.y * fx + offset.y, unit.z * fx + offset.z),
                this.warpNoiseY(unit.x * fx + offset.y, unit.y * fx + offset.z, unit.z * fx + offset.x),
                this.warpNoiseZ(unit.x * fx + offset.z, unit.y * fx + offset.x, unit.z * fx + offset.y)
            );
            sampleDir.addScaledVector(warpVec, effectiveWarp).normalize();
        }

        // === displacement (copie compacte de _buildRockyGeometry) ===
        let amplitude = 1;
        let frequency = this.params.noiseFrequency;
        let totalAmp = 0, sum = 0, ridgeSum = 0, billowSum = 0;

        for (let layer=0; layer<this.params.noiseLayers; layer++){
          const off = this.offsets[layer];
          const sx = sampleDir.x * frequency + off.x;
          const sy = sampleDir.y * frequency + off.y;
          const sz = sampleDir.z * frequency + off.z;

          const s = this.baseNoise(sx, sy, sz);
          sum += s * amplitude;

          const rs = this.ridgeNoise(
            sx * this.profile.ridgeFrequency,
            sy * this.profile.ridgeFrequency,
            sz * this.profile.ridgeFrequency
          );
          ridgeSum += (1 - Math.abs(rs)) * amplitude;

          billowSum += Math.pow(Math.abs(s), this.profile.ruggedPower) * amplitude;

          totalAmp += amplitude;
          amplitude *= this.params.persistence;
          frequency *= this.params.lacunarity;
        }
        if (totalAmp>0){ sum/=totalAmp; ridgeSum/=totalAmp; billowSum/=totalAmp; }

        let elev = sum;
        elev = THREE.MathUtils.lerp(elev, ridgeSum*2-1, this.profile.ridgeWeight);
        elev = THREE.MathUtils.lerp(elev, billowSum*2-1, this.profile.billowWeight);
        elev = Math.sign(elev)*Math.pow(Math.abs(elev), this.profile.sharpness);

        let normalized = elev*0.5 + 0.5;
        normalized = Math.pow(THREE.MathUtils.clamp(normalized,0,1), this.profile.plateauPower);

        if (this.profile.striationStrength>0){
          const str = Math.sin((sampleDir.x + sampleDir.z) * this.profile.striationFrequency + this.profile.striationPhase);
          normalized += str * this.profile.striationStrength;
        }
        if (this.profile.equatorLift || this.profile.poleDrop){
          const lat = Math.abs(sampleDir.y);
          normalized += (1-lat)*this.profile.equatorLift;
          normalized -= lat*this.profile.poleDrop;
        }

        const cSamp = this.craterNoise(
          sampleDir.x*this.profile.craterFrequency + this.profile.craterOffset.x,
          sampleDir.y*this.profile.craterFrequency + this.profile.craterOffset.y,
          sampleDir.z*this.profile.craterFrequency + this.profile.craterOffset.z
        );
        const cVal = (cSamp+1)*0.5;
        if (cVal > this.profile.craterThreshold){
          const cT = (cVal - this.profile.craterThreshold) / Math.max(1e-6, 1 - this.profile.craterThreshold);
          normalized -= Math.pow(cT, this.profile.craterSharpness) * this.profile.craterDepth;
        }
        normalized = THREE.MathUtils.clamp(normalized, 0, 1);

        const displacement = (normalized - this.params.oceanLevel) * this.params.noiseAmplitude;
        const finalR = R + displacement;

        vpos.copy(unit).multiplyScalar(finalR);

        // skirts aux bords pour masquer cracks de niveaux adjacents
        const onEdge = (i===0 || j===0 || i===n-1 || j===n-1);
        if (onEdge) vpos.addScaledVector(unit, -skirt);

        // write pos
        positions[ip+0]=vpos.x; positions[ip+1]=vpos.y; positions[ip+2]=vpos.z; ip+=3;

        // color via palette existante
        const col = this.planet.sampleColor(normalized, finalR, unit);
        colors[iu+0]=col.r; colors[iu+1]=col.g; colors[iu+2]=col.b; iu+=3;

        // UV sphériques
        const Uu = Math.atan2(unit.x, unit.z)/(2*Math.PI)+0.5;
        const Vv = Math.asin(unit.y)/Math.PI + 0.5;
        const uvk = (j*n + i)*2;
        uvs[uvk+0]=Uu; uvs[uvk+1]=Vv;
      }
    }

    // --- indices
    let idx = 0;
    for (let j=0;j<n-1;j++){
      for (let i=0;i<n-1;i++){
        const a =  j   *n + i;
        const b =  j   *n + (i+1);
        const c = (j+1)*n + i;
        const d = (j+1)*n + (i+1);
        // CCW face camera
        indices[ii++] = a; indices[ii++] = b; indices[ii++] = c;
        indices[ii++] = b; indices[ii++] = d; indices[ii++] = c;
      }
    }

    g.setAttribute('position', new THREE.BufferAttribute(positions,3));
    g.setAttribute('color',    new THREE.BufferAttribute(colors,3));
    g.setAttribute('uv',       new THREE.BufferAttribute(uvs,2));
    g.setIndex(new THREE.BufferAttribute(indices,1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  // Exemple simple : invalider toutes les X ms ou si rotation Δ>ε
  _needsRecomputeBounds() {
    const now = performance.now();
    if (!this._lastBoundsT) this._lastBoundsT = 0;
    const rotY = this.planet.spinGroup.rotation.y;
    const changed = Math.abs((this._lastRotY ?? 0) - rotY) > 0.005 || (now - this._lastBoundsT) > 250;
    if (changed) { this._lastRotY = rotY; this._lastBoundsT = now; return true; }
    return false;
  }

  // parcours + split/merge + fade
  update(camera) {
    // 0) si la planète a tourné ou bougé, rafraîchir les bounds des feuilles visibles
    if (this._needsRecomputeBounds()) {
      const stack = [...this.roots];
      for (const n of stack) {
        // on peut limiter aux feuilles pour le coût
        if (n.mesh) n.computeBoundsWorld(); 
        if (n.children) stack.push(...n.children);
      }
    }

    // 1) split pass
    const stack = [...this.roots];
    for (const node of stack) {
      if (node.isLeaf && node.shouldSplit(camera)) {
        node.split();
      }
      if (node.children) stack.push(...node.children);
    }

    // 2) merge pass
    const merge_stack = [...this.roots];
    for(const node of merge_stack) {
        if (!node.isLeaf) {
            let canMerge = true;
            for (const child of node.children) {
                if (!child.isLeaf || !child.shouldMerge(camera)) {
                    canMerge = false;
                    break;
                }
            }
            if (canMerge) {
                node.merge();
            } else {
                merge_stack.push(...node.children);
            }
        }
    }

    // 3) tick fades
    const all = [...this.roots];
    for (const n of all) {
      n.tickFade();
      if (n.children) all.push(...n.children);
    }
  }
}


export class Planet {
    constructor(scene, params, moonSettings, guiControllers, visualSettings, sun) {
        this.scene = scene;
        this.params = params;
        this.moonSettings = moonSettings;
        this.guiControllers = guiControllers;
        this.visualSettings = visualSettings;
        this.sun = sun;

        // LOD par chunks
        this._lodChunkFadeSpread = 0.25;           // utilisé par _setLODFadeProfile
        this.chunkedLODEnabled = this.params.chunkedLODEnabled ?? true;
        this.chunkLOD = null;                       // gestionnaire de chunks

        this.planetSystem = new THREE.Group();
        this.scene.add(this.planetSystem);

        this.planetRoot = new THREE.Group();
        this.planetSystem.add(this.planetRoot);

        this.tiltGroup = new THREE.Group();
        this.planetRoot.add(this.tiltGroup);

        this.spinGroup = new THREE.Group();
        this.tiltGroup.add(this.spinGroup);

        this.ringGroup = new THREE.Group();
        this.tiltGroup.add(this.ringGroup);
        this.ringMeshes = [];
        this.ringTextures = [];

        this.moonsGroup = new THREE.Group();
        this.planetRoot.add(this.moonsGroup);

        this.orbitLinesGroup = new THREE.Group();
        this.planetRoot.add(this.orbitLinesGroup);

        this.cloudTexture = null;
        this.foamTexture = null;
        this.lastCloudParams = null;
        this.lastFoamParams = null;
        this.ridgeNoise = null;
        this.warpNoiseX = null;
        this.warpNoiseY = null;
        this.warpNoiseZ = null;
        this.craterNoise = null;

        this.palette = {
            ocean: new THREE.Color(this.params.colorOcean),
            shallow: new THREE.Color(this.params.colorShallow),
            foam: new THREE.Color(this.params.colorFoam),
            low: new THREE.Color(this.params.colorLow),
            mid: new THREE.Color(this.params.colorMid),
            high: new THREE.Color(this.params.colorHigh),
            core: new THREE.Color(this.params.colorCore),
            atmosphere: new THREE.Color(this.params.atmosphereColor),
            icePoles: new THREE.Color(this.params.icePolesColor)
        };

        this.activeExplosions = [];

        this.surfaceLOD = null;
        this.surfaceLODLevels = {};
        this.gasLODMaterials = [];
        this.gasLODTextures = [];
        this.gasTextureCache = new Map();
        this.lastGasParams = null;
        this.icePoleNoise = null;

        this._activeLODKey = null;
        this._lodTransitionFromMesh = null;
        this._lodTransitionToMesh = null;

        this._createPlanetObjects();
        this.rebuildPlanet();
    }

    _createPlanetObjects() {
        this.planetMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.82,
            metalness: 0.12,
            flatShading: false
        });

        this.surfaceLOD = new THREE.LOD();
        this.surfaceLOD.name = "PlanetSurfaceLOD";
        this.surfaceLOD.matrixAutoUpdate = true;
        this.spinGroup.add(this.surfaceLOD);

        this.surfaceLODLevels = {};
        PLANET_SURFACE_LOD_ORDER.forEach((levelKey, index) => {
            const mesh = this._createSurfaceMeshPlaceholder(levelKey, index);
            this.surfaceLODLevels[levelKey] = mesh;
        });
        this.planetMesh = this.surfaceLODLevels.medium;

        const coreGeometry = new THREE.SphereGeometry(1, 16, 16);
        const coreMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.8,
            metalness: 0.2,
            transparent: false,
            opacity: 1,
            flatShading: false
        });
        this.coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
        this.coreMesh.castShadow = true;
        this.coreMesh.receiveShadow = true;
        this.coreMesh.userData = { isCore: true };
        this.spinGroup.add(this.coreMesh);

        this.cloudsMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.38,
            roughness: 0.4,
            metalness: 0,
            depthWrite: false
        });
        this.cloudsMesh = new THREE.Mesh(new THREE.SphereGeometry(1.03, 96, 96), this.cloudsMaterial);
        this.cloudsMesh.castShadow = false;
        this.cloudsMesh.receiveShadow = false;
        this.spinGroup.add(this.cloudsMesh);

        this.atmosphereUniforms = {
            lightDirection: { value: new THREE.Vector3(1, 0, 0) },
            atmosphereIntensity: { value: 1.0 },
            sunBrightness: { value: 1.0 },
            sunColor: { value: new THREE.Color(1, 1, 1) },
            atmosphereColor: { value: new THREE.Color(0.3, 0.6, 1.0) },
            atmosphereFresnelPower: { value: 2.0 },
            atmosphereRimPower: { value: 3.0 }
        };
        const atmosphereMaterial = new THREE.ShaderMaterial({
            vertexShader: atmosphereVertexShader,
            fragmentShader: atmosphereFragmentShader,
            uniforms: this.atmosphereUniforms,
            transparent: true,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true
        });
        this.atmosphereMesh = new THREE.Mesh(new THREE.SphereGeometry(1.08, 64, 64), atmosphereMaterial);
        this.atmosphereMesh.castShadow = false;
        this.atmosphereMesh.receiveShadow = false;
        this.spinGroup.add(this.atmosphereMesh);

        this.auroraNode = new AuroraNode(this);
        this.spinGroup.add(this.auroraNode.mesh);

        const oceanMaterial = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(0x1b3c6d),
            transparent: true,
            opacity: 0.6,
            roughness: 0.35,
            metalness: 0.02,
            transmission: 0.7,
            thickness: 0.2,
            ior: 1.333,
            depthWrite: false
        });
        this.oceanMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 128, 128), oceanMaterial);
        this.oceanMesh.castShadow = false;
        this.oceanMesh.receiveShadow = false;
        this.oceanMesh.renderOrder = 1;
        this.spinGroup.add(this.oceanMesh);

        const foamMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            depthWrite: false
        });
        this.foamMesh = new THREE.Mesh(new THREE.SphereGeometry(1.002, 128, 128), foamMaterial);
        this.foamMesh.castShadow = false;
        this.foamMesh.receiveShadow = false;
        this.foamMesh.renderOrder = 2;
        this.spinGroup.add(this.foamMesh);

        this._updateSurfaceLodDistances();
    }

    _createSurfaceMeshPlaceholder(levelKey, orderIndex = 0) {
        const placeholderDetail = this._getSurfaceDetailForLevel(levelKey);
        const geometry = new THREE.IcosahedronGeometry(1, Math.max(0, placeholderDetail));
        const mesh = new THREE.Mesh(geometry, this.planetMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `PlanetSurface_${levelKey}`;
        mesh.userData.lodKey = levelKey;
        this._installLODFadeHooks(mesh);
        if (this.surfaceLOD) {
            this.surfaceLOD.addLevel(mesh, 0);
        }
        return mesh;
    }

    _collectMeshes(target) {
        if (!target) return [];
        const meshes = [];
        const stack = [target];
        while (stack.length) {
            const current = stack.pop();
            if (!current) continue;
            if (current.isMesh) {
                meshes.push(current);
            }
            if (current.children && current.children.length) {
                for (let i = 0; i < current.children.length; i += 1) {
                    stack.push(current.children[i]);
                }
            }
        }
        return meshes;
    }

    _installLODFadeHooks(target) {
        if (!target) return;
        const meshes = this._collectMeshes(target);
        meshes.forEach((mesh) => {
            if (!mesh) return;
            mesh.userData = mesh.userData || {};
            if (mesh.userData.lodFadeHookInstalled) return;

            mesh.userData.lodFadeAlpha = mesh.userData.lodFadeAlpha ?? 1;
            mesh.userData.lodFadeJitter = mesh.userData.lodFadeJitter ?? Math.random();
            const originalBefore = mesh.onBeforeRender;
            const originalAfter = mesh.onAfterRender;
            mesh.userData.lodFadeOriginalOnBeforeRender = originalBefore;
            mesh.userData.lodFadeOriginalOnAfterRender = originalAfter;

            mesh.userData.lodOriginalRenderOrder = mesh.userData.lodOriginalRenderOrder ?? (mesh.renderOrder ?? 0);

            mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
                const mat = material || mesh.material;
                const alpha = mesh.userData?.lodFadeAlpha ?? 1;
                const fadeActive = alpha < 0.999;

                if (mat) {
                    mat.userData = mat.userData || {};
                    if (mat.userData.lodBaseOpacity === undefined) {
                        mat.userData.lodBaseOpacity = mat.opacity ?? 1;
                        mat.userData.lodOriginalTransparent = mat.transparent;
                        mat.userData.lodOriginalAlphaHash = mat.alphaHash;
                        mat.userData.lodOriginalDepthWrite = mat.depthWrite;
                    }
                    const baseOpacity = mat.userData.lodBaseOpacity ?? 1;
                    mat.opacity = baseOpacity * alpha;
                    mat.alphaHash = fadeActive;
                    mat.transparent = mat.userData.lodOriginalTransparent ?? false;
                    mat.depthWrite = fadeActive ? false : (mat.userData.lodOriginalDepthWrite ?? true);
                }

                if (typeof originalBefore === 'function') {
                    originalBefore.call(mesh, renderer, scene, camera, geometry, mat ?? mesh.material, group);
                }
            };

            mesh.onAfterRender = (renderer, scene, camera, geometry, material, group) => {
                const mat = material || mesh.material;
                if (mat && mat.userData) {
                    mat.opacity = mat.userData.lodBaseOpacity ?? mat.opacity ?? 1;
                    mat.alphaHash = mat.userData.lodOriginalAlphaHash ?? false;
                    mat.transparent = mat.userData.lodOriginalTransparent ?? false;
                    mat.depthWrite = mat.userData.lodOriginalDepthWrite ?? mat.depthWrite;
                }
                if (typeof originalAfter === 'function') {
                    originalAfter.call(mesh, renderer, scene, camera, geometry, mat ?? mesh.material, group);
                }
            };

            mesh.userData.lodFadeHookInstalled = true;
        });
    }

    _setLODFadeAlpha(target, alpha) {
        const value = THREE.MathUtils.clamp(alpha ?? 0, 0, 1);
        if (!target) return;
        const meshes = this._collectMeshes(target);
        meshes.forEach((mesh) => {
            this._installLODFadeHooks(mesh);
            mesh.userData.lodFadeAlpha = value;
        });
    }

    _setLODFadeProfile(target, profile = {}) {
        if (!target) return;
        const mode = profile.mode || 'out';
        const progress = THREE.MathUtils.clamp(profile.progress ?? 0, 0, 1);
        const spread = THREE.MathUtils.clamp(profile.spread ?? this._lodChunkFadeSpread ?? 0.45, 0, 0.95);
        const ease = Math.max(0.01, profile.ease ?? 1.2);
        const meshes = this._collectMeshes(target);
        if (!meshes.length) return;

        meshes.forEach((mesh) => {
            this._installLODFadeHooks(mesh);
            const jitter = mesh.userData?.lodFadeJitter ?? 0;
            const start = jitter * spread;
            const end = Math.min(1, start + (1 - spread));
            const denom = Math.max(1e-4, end - start);
            let localT = THREE.MathUtils.clamp((progress - start) / denom, 0, 1);
            if (ease !== 1) {
                localT = Math.pow(localT, ease);
            }

            let value = 1;
            if (mode === 'out') {
                value = 1 - localT;
            } else if (mode === 'in') {
                value = localT;
            } else if (mode === 'set') {
                value = THREE.MathUtils.clamp(profile.alpha ?? 1, 0, 1);
            }

            mesh.userData.lodFadeAlpha = THREE.MathUtils.clamp(value, 0, 1);
        });
    }


    _updateSurfaceLodDistances() {
        if (!this.surfaceLOD || !this.surfaceLOD.levels || !this.surfaceLOD.levels.length) return;
        const radius = Math.max(0.1, this.params.radius || 1);
        
        PLANET_SURFACE_LOD_ORDER.forEach((levelKey, index) => {
            const level = this.surfaceLOD.levels[index];
            if (!level) return;

            const config = PLANET_SURFACE_LOD_CONFIG[levelKey] || PLANET_SURFACE_LOD_CONFIG.medium;
            // The first level should always be visible up close.
            const distance = (index === 0) ? 0 : radius * config.distanceMultiplier;
            level.distance = distance;
        });
    }

    _syncActiveSurfaceMesh() {
        if (!this.surfaceLOD?.levels?.length) return;
        let activeMesh = null;
        let activeLODKey = null;
        for (let i = 0; i < this.surfaceLOD.levels.length; i += 1) {
            const candidate = this.surfaceLOD.levels[i]?.object;
            if (candidate?.visible) {
                activeMesh = candidate;
                activeLODKey = candidate.userData?.lodKey;
                break;
            }
        }
        if (!activeMesh) {
            activeMesh = this.surfaceLODLevels?.medium || this.planetMesh;
            activeLODKey = 'medium';
        }
        if (activeMesh && this.planetMesh !== activeMesh) {
            this.planetMesh = activeMesh;

            // Generate texture for new LOD level if needed (gas giants only)
            if (this.params.planetType === 'gas_giant' && activeLODKey) {
                this._ensureGasTextureForLOD(activeLODKey);
            }
        }

        if (!activeLODKey) return;

        if (!this._activeLODKey) {
            this._activeLODKey = activeLODKey;
            this._finalizeActiveLODTransition(activeLODKey);
            return;
        }

        if (activeLODKey !== this._activeLODKey) {
            this.startLODTransition(activeLODKey);
            this._activeLODKey = activeLODKey;
        }
    }

    _finalizeActiveLODTransition(activeLODKey) {
        // Finalize the LOD transition by ensuring the active mesh is properly set up
        const activeMesh = this.surfaceLODLevels?.[activeLODKey];
        if (activeMesh) {
            // Ensure the mesh is fully opaque and visible
            this._setLODFadeAlpha(activeMesh, 1);
            // Update the planet mesh reference
            this.planetMesh = activeMesh;
        }
    }

    startLODTransition(newLODKey) {
        // Start a smooth transition to a new LOD level
        const fromMesh = this.surfaceLODLevels?.[this._activeLODKey];
        const toMesh = this.surfaceLODLevels?.[newLODKey];
        
        if (!fromMesh || !toMesh || fromMesh === toMesh) {
            return;
        }

        // Store transition meshes for potential cleanup
        this._lodTransitionFromMesh = fromMesh;
        this._lodTransitionToMesh = toMesh;

        // Start fade out of old mesh and fade in of new mesh
        this._setLODFadeAlpha(fromMesh, 1); // Ensure it starts visible
        this._setLODFadeAlpha(toMesh, 0);   // Start new mesh transparent
        
        // The actual transition will be handled by the LOD system's visibility changes
        // This method primarily sets up the transition state
    }

    _getSurfaceDetailForLevel(levelKey) {
        // Use the specific config for this LOD level
        const config = PLANET_SURFACE_LOD_CONFIG[levelKey] || PLANET_SURFACE_LOD_CONFIG.medium;
        const baseDetail = Math.max(0, Math.round(this.params.subdivisions ?? 0));
        const multiplier = config.rockDetailMultiplier ?? 1;
        const offset = config.detailOffset ?? 0;
        const minDetail = config.rockDetailMin ?? 0;
        const candidate = Math.round(baseDetail * multiplier + offset);
        return Math.max(minDetail, candidate);
    }

    _replaceSurfaceGeometry(levelKey, geometry) {
        const mesh = this.surfaceLODLevels?.[levelKey];
        if (!mesh || !geometry) return;
        if (mesh.geometry) {
            mesh.geometry.dispose();
        }
        mesh.geometry = geometry;
    }

    _assignSurfaceMaterial(levelKey, material) {
        const mesh = this.surfaceLODLevels?.[levelKey];
        if (!mesh || !material) return;
        mesh.material = material;
        this._installLODFadeHooks(mesh);
    }

    _ensureGasTextureForLOD(levelKey) {
        if (this.params.planetType !== 'gas_giant') return;

        const config = PLANET_SURFACE_LOD_CONFIG[levelKey] || PLANET_SURFACE_LOD_CONFIG.medium;
        const textureScale = Math.max(0.25, config.textureScale ?? 1);
        const baseNoiseRes = this.visualSettings?.noiseResolution ?? 1.0;
        const baseGasRes = this.visualSettings?.gasResolution ?? 1.0;

        const cacheKey = `${this.params.seed}-${this.params.gasGiantStrataCount}-${this.params.gasGiantNoiseScale}-${this.params.gasGiantNoiseStrength}-${this.params.gasGiantStrataWarp}-${this.params.gasGiantStrataWarpScale}-${textureScale}-${baseNoiseRes}-${baseGasRes}`;

        let texture = this.gasTextureCache.get(cacheKey);
        if (!texture) {
            // Generate texture asynchronously to prevent blocking
            setTimeout(() => {
                texture = this.generateGasGiantTexture(this.params, { resolutionScale: textureScale });
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                texture.anisotropy = Math.max(2, Math.round(8 * textureScale));
                texture.needsUpdate = true;
                this.gasTextureCache.set(cacheKey, texture);

                // Update the material with the new texture
                const mesh = this.surfaceLODLevels?.[levelKey];
                if (mesh?.material) {
                    mesh.material.map = texture;
                    mesh.material.needsUpdate = true;
                }
            }, 0);
        }
    }

    _disposeGasLODResources() {
        if (this.gasLODTextures?.length) {
            this.gasLODTextures.forEach((texture) => texture?.dispose?.());
        }
        if (this.gasLODMaterials?.length) {
            const retained = new Set();
            PLANET_SURFACE_LOD_ORDER.forEach((key) => {
                const mat = this.surfaceLODLevels?.[key]?.material;
                if (mat) retained.add(mat);
            });
            this.gasLODMaterials.forEach((material) => {
                if (material && material !== this.planetMaterial && !retained.has(material)) {
                    material.dispose?.();
                }
            });
        }
        this.gasLODMaterials = [];
        this.gasLODTextures = [];

        // Clear texture cache when disposing
        this.gasTextureCache.forEach((texture) => texture?.dispose?.());
        this.gasTextureCache.clear();
    }

    _buildRockyGeometry(detail, generators, profile, offsets) {
        const geometry = new THREE.IcosahedronGeometry(1, Math.max(0, detail));
        const positions = geometry.getAttribute("position");
        const uvs = new Float32Array(positions.count * 2);
        const colors = new Float32Array(positions.count * 3);
        const vertex = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const sampleDir = new THREE.Vector3();
        const warpVec = new THREE.Vector3();
        const unitVertex = new THREE.Vector3();
        const { baseNoise, ridgeNoise, warpNoiseX, warpNoiseY, warpNoiseZ, craterNoise } = generators;

        for (let i = 0; i < positions.count; i += 1) {
            vertex.fromBufferAttribute(positions, i);
            normal.copy(vertex).normalize();
            sampleDir.copy(normal);

            if (profile.warpStrength > 0) {
                const warpAmount = profile.warpStrength * 0.35;
                // Attenuate warp at poles to prevent artifacts
                const poleFalloff = 1.0 - Math.pow(Math.abs(normal.y), 4);
                const effectiveWarp = warpAmount * poleFalloff;

                const fx = profile.warpFrequency;
                const offset = profile.warpOffset;
                warpVec.set(
                    warpNoiseX(normal.x * fx + offset.x, normal.y * fx + offset.y, normal.z * fx + offset.z),
                    warpNoiseY(normal.x * fx + offset.y, normal.y * fx + offset.z, normal.z * fx + offset.x),
                    warpNoiseZ(normal.x * fx + offset.z, normal.y * fx + offset.x, normal.z * fx + offset.y)
                );
                sampleDir.addScaledVector(warpVec, effectiveWarp).normalize();
            }

            let amplitude = 1;
            let frequency = this.params.noiseFrequency;
            let totalAmplitude = 0;
            let sum = 0;
            let ridgeSum = 0;
            let billowSum = 0;

            for (let layer = 0; layer < this.params.noiseLayers; layer += 1) {
                const offset = offsets[layer];
                const sx = sampleDir.x * frequency + offset.x;
                const sy = sampleDir.y * frequency + offset.y;
                const sz = sampleDir.z * frequency + offset.z;

                const sample = baseNoise(sx, sy, sz);
                sum += sample * amplitude;

                const ridgeSample = ridgeNoise(
                    sx * profile.ridgeFrequency,
                    sy * profile.ridgeFrequency,
                    sz * profile.ridgeFrequency
                );
                ridgeSum += (1 - Math.abs(ridgeSample)) * amplitude;

                billowSum += Math.pow(Math.abs(sample), profile.ruggedPower) * amplitude;

                totalAmplitude += amplitude;
                amplitude *= this.params.persistence;
                frequency *= this.params.lacunarity;
            }

            if (totalAmplitude > 0) {
                sum /= totalAmplitude;
                ridgeSum /= totalAmplitude;
                billowSum /= totalAmplitude;
            }

            let elevation = sum;
            elevation = THREE.MathUtils.lerp(elevation, ridgeSum * 2 - 1, profile.ridgeWeight);
            elevation = THREE.MathUtils.lerp(elevation, billowSum * 2 - 1, profile.billowWeight);
            elevation = Math.sign(elevation) * Math.pow(Math.abs(elevation), profile.sharpness);

            let normalized = elevation * 0.5 + 0.5;
            normalized = Math.pow(THREE.MathUtils.clamp(normalized, 0, 1), profile.plateauPower);

            if (profile.striationStrength > 0) {
                const striation = Math.sin((sampleDir.x + sampleDir.z) * profile.striationFrequency + profile.striationPhase);
                normalized += striation * profile.striationStrength;
            }

            if (profile.equatorLift || profile.poleDrop) {
                const latitude = Math.abs(sampleDir.y);
                normalized += (1 - latitude) * profile.equatorLift;
                normalized -= latitude * profile.poleDrop;
            }

            const craterSample = craterNoise(
                sampleDir.x * profile.craterFrequency + profile.craterOffset.x,
                sampleDir.y * profile.craterFrequency + profile.craterOffset.y,
                sampleDir.z * profile.craterFrequency + profile.craterOffset.z
            );
            const craterValue = (craterSample + 1) * 0.5;
            if (craterValue > profile.craterThreshold) {
                const craterT = (craterValue - profile.craterThreshold) / Math.max(1e-6, 1 - profile.craterThreshold);
                normalized -= Math.pow(craterT, profile.craterSharpness) * profile.craterDepth;
            }

            normalized = THREE.MathUtils.clamp(normalized, 0, 1);

            const displacement = (normalized - this.params.oceanLevel) * this.params.noiseAmplitude;
            const finalRadius = this.params.radius + displacement;
            vertex.copy(normal).multiplyScalar(finalRadius);
            positions.setXYZ(i, vertex.x, vertex.y, vertex.z);

            unitVertex.copy(vertex).normalize();
            const color = this.sampleColor(normalized, finalRadius, unitVertex);
            const offsetIndex = i * 3;
            colors[offsetIndex + 0] = color.r;
            colors[offsetIndex + 1] = color.g;
            colors[offsetIndex + 2] = color.b;

            const u = Math.atan2(unitVertex.x, unitVertex.z) / (2 * Math.PI) + 0.5;
            const v = Math.asin(unitVertex.y) / Math.PI + 0.5;
            uvs[i * 2] = u;
            uvs[i * 2 + 1] = v;
        }

        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        return geometry;
    }


    update(delta, simulationDelta, camera = null) {
        if (camera && this.surfaceLOD) {
            this.surfaceLOD.updateMatrixWorld(true);
            this.surfaceLOD.update(camera);
        }

        // LOD par chunks (rocheuses)
        if (this.chunkLOD) {
          // assure que le groupe suit la planète
          this.chunkLOD.originWorld.copy(this.planetRoot.getWorldPosition(new THREE.Vector3()));
          if (camera) this.chunkLOD.update(camera);
        }

        this._syncActiveSurfaceMesh();
        const rotationDelta = this.params.rotationSpeed * simulationDelta * Math.PI * 2;
        this.spinGroup.rotation.y += rotationDelta;
        this.cloudsMesh.rotation.y += rotationDelta * 1.12;
        this.cloudsMesh.rotation.y += delta * this.params.cloudDriftSpeed;

        if (this.params.ringEnabled && this.ringMeshes && this.ringMeshes.length) {
            for (let i = 0; i < this.ringMeshes.length; i += 1) {
                const mesh = this.ringMeshes[i];
                if (!mesh) continue;
                const speed = (mesh.userData?.spinSpeed ?? this.params.ringSpinSpeed ?? 0);
                if (Math.abs(speed) > 1e-4) {
                    mesh.rotation.z += delta * speed;
                }
            }
        }

        const gravityFactor = Math.sqrt(this.params.gravity / 9.81);
        if (this.params.physicsEnabled) {
            PHYSICS.stepMoonPhysics(simulationDelta, {
                params: this.params,
                planetRoot: this.planetRoot,
                moonsGroup: this.moonsGroup,
                moonSettings: this.moonSettings,
                coreMesh: this.coreMesh,
                orbitLinesGroup: this.orbitLinesGroup,
                updateStabilityDisplay: this.guiControllers.updateStabilityDisplay,
                updateOrbitMaterial: this.updateOrbitMaterial.bind(this),
                updateTrajectoryHistory: this.updateTrajectoryHistory.bind(this),
                spawnExplosion: this.spawnExplosion.bind(this),
                applyImpactDeformation: this.applyImpactDeformation.bind(this),
                syncDebugMoonArtifacts: this.guiControllers.syncDebugMoonArtifacts,
                rebuildMoonControls: this.guiControllers.rebuildMoonControls,
                guiControllers: this.guiControllers,
            });
        } else {
            const planetMass = PHYSICS.getPlanetMass(this.params);
            const mu = PHYSICS.getGravParameter(planetMass);
            this.moonsGroup.children.forEach((pivot, index) => {
                const moon = this.moonSettings[index];
                const mesh = pivot.userData.mesh;
                if (!moon || !mesh) return;
                const semiMajor = Math.max(0.5, moon.distance || 3.5);
                const eccentricity = THREE.MathUtils.clamp(moon.eccentricity ?? 0, 0, 0.95);
                const data = pivot.userData;
                const baseSpeed = Math.sqrt(Math.max(1e-6, mu / Math.pow(semiMajor, 3)));
                const rawSpeed = moon.orbitSpeed ?? 0.4;
                const speedMultiplier = (Math.sign(rawSpeed) || 1) * Math.max(0.2, Math.abs(rawSpeed));
                data.trueAnomaly = (data.trueAnomaly ?? (moon.phase ?? 0)) + baseSpeed * speedMultiplier * simulationDelta * gravityFactor;
                const angle = data.trueAnomaly;
                PHYSICS.computeOrbitPosition(semiMajor, eccentricity, angle, mesh.position);

                pivot.updateMatrixWorld(true);
                const worldPos = pivot.localToWorld(mesh.position.clone());
                this.updateTrajectoryHistory(pivot, worldPos);
            });
            this.guiControllers.updateStabilityDisplay(this.moonSettings.length, this.moonSettings.length);
        }

        this.updateExplosions(simulationDelta);
        this.syncOrbitLinesWithPivots();

        if (this.auroraNode) {
            this.auroraNode.update(delta);
        }
    }

    rebuildPlanet() {
        this.updatePalette();

        if (this.params.planetType === 'gas_giant') {
          // Check if gas giant parameters changed and clear cache if needed
          const currentGasParams = {
            seed: this.params.seed,
            gasGiantStrataCount: this.params.gasGiantStrataCount,
            gasGiantNoiseScale: this.params.gasGiantNoiseScale,
            gasGiantNoiseStrength: this.params.gasGiantNoiseStrength,
            gasGiantStrataWarp: this.params.gasGiantStrataWarp,
            gasGiantStrataWarpScale: this.params.gasGiantStrataWarpScale,
            noiseResolution: this.visualSettings?.noiseResolution ?? 1.0,
            gasResolution: this.visualSettings?.gasResolution ?? 1.0
          };
          
          if (this.lastGasParams && JSON.stringify(currentGasParams) !== JSON.stringify(this.lastGasParams)) {
            this.gasTextureCache.forEach((texture) => texture?.dispose?.());
            this.gasTextureCache.clear();
          }
          this.lastGasParams = currentGasParams;
          
          this._disposeGasLODResources();

          const baseSegments = Math.max(24, Math.round(128 * Math.max(0.25, this.visualSettings?.gasResolution ?? 1.0)));
          const baseNoiseRes = this.visualSettings?.noiseResolution ?? 1.0;
          const baseGasRes = this.visualSettings?.gasResolution ?? 1.0;
          
          // Only generate textures for medium LOD initially to prevent crashes
          const initialLODs = ['medium', 'high', 'low'];
          
          PLANET_SURFACE_LOD_ORDER.forEach((levelKey) => {
            const config = PLANET_SURFACE_LOD_CONFIG[levelKey] || PLANET_SURFACE_LOD_CONFIG.medium;
            const segmentScale = Math.max(0.4, config.gasSegmentScale ?? 1);
            const segments = Math.max(12, Math.round(baseSegments * segmentScale));
            const geometry = new THREE.SphereGeometry(this.params.radius, segments, segments);
            this._replaceSurfaceGeometry(levelKey, geometry);

            const textureScale = Math.max(0.25, config.textureScale ?? 1);
            
            // Create cache key based on parameters that affect texture generation
            const cacheKey = `${this.params.seed}-${this.params.gasGiantStrataCount}-${this.params.gasGiantNoiseScale}-${this.params.gasGiantNoiseStrength}-${this.params.gasGiantStrataWarp}-${this.params.gasGiantStrataWarpScale}-${textureScale}-${baseNoiseRes}-${baseGasRes}`;
            
            let texture = this.gasTextureCache.get(cacheKey);
            if (!texture && initialLODs.includes(levelKey)) {
              texture = this.generateGasGiantTexture(this.params, { resolutionScale: textureScale });
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.ClampToEdgeWrapping;
              texture.anisotropy = Math.max(2, Math.round(8 * textureScale));
              texture.needsUpdate = true;
              this.gasTextureCache.set(cacheKey, texture);
            }
            
            const material = new THREE.MeshStandardMaterial({
              map: texture || null,
              roughness: 0.35,
              metalness: 0.08,
              flatShading: false,
              vertexColors: false
            });
            material.needsUpdate = true;

            this._assignSurfaceMaterial(levelKey, material);
            this.gasLODMaterials.push(material);
            this.gasLODTextures.push(texture);
          });

          this.planetMesh = this.surfaceLODLevels.medium;
          this.oceanMesh.visible = false;
          this.foamMesh.visible = false;

            // --- Gas Giant LOD Strategy ---
            this.ridgeNoise = null;
            this.warpNoiseX = null;
            this.warpNoiseY = null;
            this.warpNoiseZ = null;
            this.craterNoise = null;
            // Ensure chunked LOD is disabled and disposed
            if (this.chunkLOD) {
                this.chunkLOD.dispose();
                this.chunkLOD = null;
            }
            // Ensure the main LOD system is visible
            if (this.surfaceLOD) {
                this.surfaceLOD.visible = true;
            }
            this.oceanMesh.visible = false;
            this.foamMesh.visible = false;

        } else {
            // --- Rocky Planet LOD Strategy ---
            this._disposeGasLODResources();

            // Ensure the main LOD system is hidden
            if (this.surfaceLOD) {
                this.surfaceLOD.visible = false;
            }

            // Enable and build the chunked LOD system
            if (this.chunkedLODEnabled) {
                if (this.chunkLOD) {
                    this.chunkLOD.dispose();
                }
                this.chunkLOD = new ChunkedLODSphere(this, {
                    maxLevel: 6,
                    baseResolution: 9,
                    splitDistanceK: 5.5,
                    hysteresis: 1.5,
                    fadeDurationMs: 180,
                    skirtDepth: 0.004,
                    chunkFadeSpread: this._lodChunkFadeSpread ?? 0.25
                });
            } else {
                // Fallback for when chunkedLOD is disabled: show the old system
                if (this.chunkLOD) {
                    this.chunkLOD.dispose();
                    this.chunkLOD = null;
                }
                if (this.surfaceLOD) {
                    this.surfaceLOD.visible = true;
                }
            }

            const rng = new SeededRNG(this.params.seed);
            const noiseRng = rng.fork();
            const baseNoise = createNoise3D(() => noiseRng.next());
            this.ridgeNoise = createNoise3D(() => noiseRng.next());
            this.warpNoiseX = createNoise3D(() => noiseRng.next());
            this.warpNoiseY = createNoise3D(() => noiseRng.next());
            this.warpNoiseZ = createNoise3D(() => noiseRng.next());
            this.craterNoise = createNoise3D(() => noiseRng.next());

            const profile = this.deriveTerrainProfile(this.params.seed);
            const offsets = [];
            for (let i = 0; i < this.params.noiseLayers; i += 1) {
                const fork = noiseRng.fork();
                offsets.push(new THREE.Vector3(
                    fork.nextFloat(-128, 128),
                    fork.nextFloat(-128, 128),
                    fork.nextFloat(-128, 128)
                ));
            }

            // Note: _buildRockyGeometry is now primarily for the fallback LOD.
            // The main geometry generation for rocky planets happens inside ChunkedLODSphere.
            const generators = { baseNoise, ridgeNoise: baseNoise, warpNoiseX: baseNoise, warpNoiseY: baseNoise, warpNoiseZ: baseNoise, craterNoise: baseNoise };
            PLANET_SURFACE_LOD_ORDER.forEach((levelKey) => {
                const detail = this._getSurfaceDetailForLevel(levelKey);
                const geometry = this._buildRockyGeometry(detail, generators, profile, offsets);
                this._replaceSurfaceGeometry(levelKey, geometry);
                this._assignSurfaceMaterial(levelKey, this.planetMaterial);
            });
            this.planetMesh = this.surfaceLODLevels.medium;

            const oceanVisible = this.params.oceanLevel > 0.001 && this.params.noiseAmplitude > 0.0001;
            const oceanScale = this.params.radius * 1.001;
            const foamScale = this.params.radius * 1.003;
            this.oceanMesh.visible = oceanVisible;
            this.foamMesh.visible = oceanVisible && this.params.foamEnabled;
            if (oceanVisible) {
                this.oceanMesh.scale.setScalar(oceanScale);
                this.foamMesh.scale.setScalar(foamScale);
                this.oceanMesh.material.color.set(this.palette.ocean);
                this.foamMesh.material.color.set(this.palette.foam);

                // Regenerate foam texture only if needed
                this.regenerateFoamTextureIfNeeded(profile, offsets, baseNoise);
            }
        }

        this._updateSurfaceLodDistances();

        const cloudScale = this.params.radius * (1 + Math.max(0.0, this.params.cloudHeight || 0.03));
        const atmosphereScale = this.params.radius * (1.06 + Math.max(0.0, (this.params.cloudHeight || 0.03)) * 0.8);
        this.cloudsMesh.scale.setScalar(cloudScale);
        this.atmosphereMesh.scale.setScalar(atmosphereScale);

        this.updateCore();
        this.updateRings();
        this._syncActiveSurfaceMesh();
        this.updateAurora();
    }

    deriveTerrainProfile(seed) {
        const rng = new SeededRNG(`${seed || "default"}-terrain`);
        return {
          warpStrength: THREE.MathUtils.lerp(0.0, 0.45, rng.next()),
          warpFrequency: THREE.MathUtils.lerp(0.6, 1.8, rng.next()),
          ridgeFrequency: THREE.MathUtils.lerp(0.5, 1.3, rng.next()),
          ridgeWeight: THREE.MathUtils.lerp(0.1, 0.65, rng.next()),
          billowWeight: THREE.MathUtils.lerp(0.05, 0.35, rng.next()),
          plateauPower: THREE.MathUtils.lerp(0.75, 1.45, rng.next()),
          sharpness: THREE.MathUtils.lerp(0.8, 1.45, rng.next()),
          ruggedPower: THREE.MathUtils.lerp(1.1, 2.4, rng.next()),
          craterFrequency: THREE.MathUtils.lerp(1.4, 4.6, rng.next()),
          craterThreshold: THREE.MathUtils.lerp(0.78, 0.94, rng.next()),
          craterDepth: THREE.MathUtils.lerp(0.015, 0.12, rng.next()),
          craterSharpness: THREE.MathUtils.lerp(1.6, 3.4, rng.next()),
          equatorLift: THREE.MathUtils.lerp(0, 0.12, rng.next()),
          poleDrop: THREE.MathUtils.lerp(0, 0.08, rng.next()),
          striationStrength: THREE.MathUtils.lerp(0, 0.09, rng.next()),
          striationFrequency: THREE.MathUtils.lerp(2.8, 8.5, rng.next()),
          striationPhase: rng.next() * Math.PI * 2,
          warpOffset: new THREE.Vector3(
            rng.nextFloat(-64, 64),
            rng.nextFloat(-64, 64),
            rng.nextFloat(-64, 64)
          ),
          craterOffset: new THREE.Vector3(
            rng.nextFloat(-128, 128),
            rng.nextFloat(-128, 128),
            rng.nextFloat(-128, 128)
          ),
          cloudLift: THREE.MathUtils.lerp(0.0, 0.07, rng.next())
        };
    }

    sampleColor(elevation, radius, vertexPosition) {
        let baseColor;
        const scratchColor = new THREE.Color();

        if (elevation <= this.params.oceanLevel) {
          const oceanT = this.params.oceanLevel <= 0 ? 0 : THREE.MathUtils.clamp(elevation / Math.max(this.params.oceanLevel, 1e-6), 0, 1);
          baseColor = this.palette.ocean.clone().lerp(this.palette.shallow, Math.pow(oceanT, 0.65));
        } else {
          const landT = THREE.MathUtils.clamp((elevation - this.params.oceanLevel) / Math.max(1 - this.params.oceanLevel, 1e-6), 0, 1);

          if (landT < 0.5) {
            const t = Math.pow(landT / 0.5, 1.1);
            baseColor = this.palette.low.clone().lerp(this.palette.mid, t);
          } else {
            const highT = Math.pow((landT - 0.5) / 0.5, 1.3);
            baseColor = this.palette.mid.clone().lerp(this.palette.high, highT);
          }
        }

        if (this.params.icePolesEnabled && vertexPosition) {
          const latitude = Math.abs(vertexPosition.y);
          const poleThreshold = this.params.icePolesCoverage;

          if (latitude > (1 - poleThreshold)) {
            const iceStrength = (latitude - (1 - poleThreshold)) / poleThreshold;

            if (!this.icePoleNoise) {
                this.icePoleNoise = createNoise3D(() => new SeededRNG(this.params.seed).next());
            }
            const noiseValue = this.icePoleNoise(
              vertexPosition.x * this.params.icePolesNoiseScale,
              vertexPosition.y * this.params.icePolesNoiseScale,
              vertexPosition.z * this.params.icePolesNoiseScale
            );

            const noiseInfluence = (noiseValue + 1) * 0.5;
            const finalIceStrength = iceStrength * (1 - this.params.icePolesNoiseStrength) +
                                    iceStrength * noiseInfluence * this.params.icePolesNoiseStrength;

            baseColor.lerp(this.palette.icePoles, finalIceStrength);
          }
        }

        return scratchColor.copy(baseColor);
    }

    updatePalette() {
        this.palette.ocean.set(this.params.colorOcean);
        this.palette.shallow.set(this.params.colorShallow);
        this.palette.foam.set(this.params.colorFoam);
        this.palette.low.set(this.params.colorLow);
        this.palette.mid.set(this.params.colorMid);
        this.palette.high.set(this.params.colorHigh);
        this.palette.core.set(this.params.colorCore);
        this.palette.atmosphere.set(this.params.atmosphereColor);
        this.palette.icePoles.set(this.params.icePolesColor);

        this.atmosphereUniforms.sunColor.value.set(this.params.sunColor);
        this.atmosphereUniforms.atmosphereColor.value.set(this.params.atmosphereColor);
    }

    updateCore() {
        if (this.coreMesh) {
          const coreScale = this.params.radius * this.params.coreSize;
          this.coreMesh.scale.setScalar(coreScale);
          this.coreMesh.material.color.set(this.params.colorCore);
          this.coreMesh.visible = this.params.coreEnabled && this.params.coreVisible;
          this.coreMesh.material.needsUpdate = true;
        }
    }

    updateClouds() {
        this.cloudsMaterial.opacity = this.params.cloudsOpacity;

        this.atmosphereUniforms.atmosphereIntensity.value = this.params.atmosphereIntensity;
        this.atmosphereUniforms.sunBrightness.value = this.params.sunIntensity;
        this.atmosphereUniforms.sunColor.value.set(this.params.sunColor);
        this.atmosphereUniforms.atmosphereColor.value.set(this.params.atmosphereColor);
        this.atmosphereUniforms.atmosphereFresnelPower.value = this.params.atmosphereFresnelPower;
        this.atmosphereUniforms.atmosphereRimPower.value = this.params.atmosphereRimPower;

        const sunDirection = new THREE.Vector3();
        sunDirection.subVectors(this.sun.sunGroup.position, this.planetRoot.position).normalize();
        this.atmosphereUniforms.lightDirection.value.copy(sunDirection);

        this.cloudsMesh.visible = this.params.cloudsOpacity > 0.001;
        this.atmosphereMesh.visible = this.params.atmosphereOpacity > 0.001;
        const cloudScale = Math.max(0.1, this.params.radius * (1 + Math.max(0, this.params.cloudHeight || 0.03)));
        this.cloudsMesh.scale.setScalar(cloudScale);

        const currentCloudParams = {
            seed: this.params.seed,
            noiseScale: this.params.cloudNoiseScale,
            density: this.params.cloudDensity,
            opacity: this.params.cloudsOpacity,
            resolution: this.visualSettings?.noiseResolution
        };

        if (JSON.stringify(currentCloudParams) !== this.lastCloudParams) {
            this.regenerateCloudTexture();
            this.lastCloudParams = JSON.stringify(currentCloudParams);
        }
    }

    updateTilt() {
        const radians = THREE.MathUtils.degToRad(this.params.axisTilt);
        this.tiltGroup.rotation.z = radians;
        this.moonsGroup.rotation.z = radians;
        this.orbitLinesGroup.rotation.z = radians;
    }

    regenerateCloudTexture() {
        const resScale = Math.max(0.25, Math.min(2.0, this.visualSettings?.noiseResolution ?? 1.0));
        const width = Math.max(64, Math.round(1024 * resScale));
        const height = Math.max(32, Math.round(512 * resScale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        const img = ctx.createImageData(width, height);
        const data = img.data;

        const rng = new SeededRNG(`${this.params.seed || "default"}-clouds`);
        const noise = createNoise3D(() => rng.next());
        const scale = Math.max(0.2, this.params.cloudNoiseScale || 3.2);
        const density = THREE.MathUtils.clamp(this.params.cloudDensity ?? 0.5, 0, 1);
        const threshold = THREE.MathUtils.clamp(0.15 + (1 - density) * 0.75, 0.05, 0.9);
        const feather = 0.12;

        for (let y = 0; y < height; y += 1) {
          const v = y / (height - 1);
          const yy = (v * 2 - 1) * scale;
          for (let x = 0; x < width; x += 1) {
            const u = x / (width - 1);
            const theta = u * Math.PI * 2;
            const nx = Math.cos(theta) * scale;
            const nz = Math.sin(theta) * scale;

            let val = 0;
            let amp = 0.6;
            let freq = 1;
            for (let o = 0; o < 3; o += 1) {
              const n = noise(nx * freq, yy * freq, nz * freq) * 0.5 + 0.5;
              val += n * amp;
              freq *= 2;
              amp *= 0.5;
            }
            val = THREE.MathUtils.clamp(val, 0, 1);
            const a = THREE.MathUtils.clamp((val - threshold) / Math.max(1e-6, feather), 0, 1);
            const alpha = Math.pow(a, 1.2) * this.params.cloudsOpacity;

            const i = (y * width + x) * 4;
            data[i + 0] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255);
          }
        }

        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;

        if (this.cloudTexture) {
            this.cloudTexture.dispose();
        }
        this.cloudTexture = tex;

        if (this.cloudsMaterial) {
            this.cloudsMaterial.map = this.cloudTexture;
            this.cloudsMaterial.alphaMap = this.cloudTexture;
            this.cloudsMaterial.needsUpdate = true;
        }
    }

    generateGasGiantTexture(p, { resolutionScale = 1 } = {}) {
        const baseNoiseRes = this.visualSettings?.noiseResolution ?? 1.0;
        const baseGasRes = this.visualSettings?.gasResolution ?? 1.0;
        const scale = Math.max(0.25, resolutionScale);
        return generateGasGiantTextureExt({
          ...p,
          noiseResolution: Math.max(0.25, baseNoiseRes * scale),
          gasResolution: Math.max(0.25, baseGasRes * scale)
        });
    }

    updateRings() {
        if (!this.ringGroup) return;
        if (!this.params.ringEnabled) {
          this.ringMeshes.forEach((mesh) => {
            if (!mesh) return;
            if (mesh.material) {
              mesh.material.map = null;
              mesh.material.alphaMap = null;
            }
            if (mesh.parent) mesh.parent.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
          });
          this.ringMeshes = [];
          this.ringTextures.forEach((tex) => tex?.dispose?.());
          this.ringTextures = [];
          return;
        }

        const angle = THREE.MathUtils.degToRad(this.params.ringAngle || 0);
        const ringDetailScale = Math.max(0.25, Math.min(1.5, this.visualSettings?.ringDetail ?? 1.0));
        const segments = Math.max(32, Math.round(256 * ringDetailScale));
        const noiseResolutionScale = Math.max(0.25, Math.min(2.0, this.visualSettings?.noiseResolution ?? 1.0));
        const ringDefs = Array.isArray(this.params.rings) ? this.params.rings : [];
        if (ringDefs.length === 0) {
          this.ringMeshes.forEach((mesh) => {
            if (!mesh) return;
            if (mesh.material) {
              mesh.material.map = null;
              mesh.material.alphaMap = null;
            }
            if (mesh.parent) mesh.parent.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
          });
          this.ringMeshes = [];
          this.ringTextures.forEach((tex) => tex?.dispose?.());
          this.ringTextures = [];
          return;
        }

        while (this.ringMeshes.length > ringDefs.length) {
          const mesh = this.ringMeshes.pop();
          if (!mesh) continue;
          if (mesh.material) {
            mesh.material.map = null;
            mesh.material.alphaMap = null;
          }
          if (mesh.parent) mesh.parent.remove(mesh);
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) mesh.material.dispose();
        }
        while (this.ringMeshes.length < ringDefs.length) {
          const placeholder = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, segments, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }));
          placeholder.renderOrder = 0;
          this.ringGroup.add(placeholder);
          this.ringMeshes.push(placeholder);
        }

        this.ringTextures.forEach((tex) => tex?.dispose?.());
        this.ringTextures = new Array(ringDefs.length).fill(null);

        ringDefs.forEach((def, index) => {
          const startR = Math.max(1.05, def.start);
          const endR = Math.max(startR + 0.05, def.end);
          const inner = Math.max(this.params.radius * startR, this.params.radius + 0.02);
          const outer = Math.max(this.params.radius * endR, inner + 0.02);
          const innerRatio = THREE.MathUtils.clamp(inner / outer, 0, 0.98);

          const mesh = this.ringMeshes[index];
          if (mesh.geometry) mesh.geometry.dispose();
          mesh.geometry = new THREE.RingGeometry(inner, outer, segments, 1);

          let texture = null;
          const color = new THREE.Color(def.color || "#c7b299");
          const style = def.style || "Texture";
          const opacity = THREE.MathUtils.clamp(def.opacity ?? 0.6, 0, 1) * (def.brightness ?? 1);

          if (style === "Texture") {
            texture = generateAnnulusTextureExt({
              innerRatio,
              color,
              opacity,
              noiseScale: def.noiseScale ?? 3.2,
              noiseStrength: def.noiseStrength ?? 0.55,
              seedKey: `ring-${index}`
            });
            if (mesh.material) mesh.material.dispose();
            mesh.material = new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: 1,
              side: THREE.DoubleSide,
              depthWrite: false,
              map: texture,
              alphaMap: texture
            });
          } else if (style === "Noise") {
            if (mesh.material) mesh.material.dispose();
            mesh.material = new THREE.ShaderMaterial({
              uniforms: THREE.UniformsUtils.clone(blackHoleDiskUniforms),
              vertexShader: blackHoleDiskVertexShader,
              fragmentShader: blackHoleDiskFragmentShader,
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide
            });
            const u = mesh.material.uniforms;
            u.uColor.value.copy(color);
            u.uInnerRadius.value = inner;
            u.uOuterRadius.value = outer;
            u.uFeather.value = Math.max(0.04, (outer - inner) * 0.22);
            u.uIntensity.value = opacity;
            u.uScale.value = 1;
            u.uNoiseScale.value = Math.max(0.01, (def.noiseScale ?? 1) * noiseResolutionScale);
            u.uNoiseStrength.value = Math.max(0, def.noiseStrength ?? 0.35);
          } else {
            texture = generateAnnulusTextureExt({ innerRatio, color, opacity, seedKey: `ring-${index}` });
            if (mesh.material) mesh.material.dispose();
            mesh.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, map: texture, alphaMap: texture });
          }

          this.ringTextures[index] = texture;

          mesh.rotation.set(0, 0, 0);
          mesh.rotation.x = Math.PI / 2 + angle;
          mesh.userData.spinSpeed = def.spinSpeed ?? (this.params.ringSpinSpeed || 0);
        });
    }

    updateMoons() {
        this.guiControllers.normalizeMoonSettings();

        this.moonsGroup.children.forEach((pivot) => {
          if (pivot.userData.trajectoryHistory) {
            pivot.userData.trajectoryHistory = [];
          }
        });

        while (this.moonsGroup.children.length > this.moonSettings.length) {
          const child = this.moonsGroup.children.pop();
          this.moonsGroup.remove(child);
        }

        while (this.moonsGroup.children.length < this.moonSettings.length) {
          const pivot = new THREE.Group();
          pivot.userData = {
            mesh: null,
            orbit: null,
            physics: null,
            trueAnomaly: 0,
            trajectoryHistory: [],
            maxTrajectoryPoints: 200
          };
          this.moonsGroup.add(pivot);
        }

        while (this.orbitLinesGroup.children.length > this.moonSettings.length) {
          const orbit = this.orbitLinesGroup.children.pop();
          orbit.geometry.dispose();
          orbit.material.dispose();
        }

        this.guiControllers.syncDebugMoonArtifacts();

        this.moonSettings.forEach((moon, index) => {
          const pivot = this.moonsGroup.children[index];
          pivot.rotation.x = THREE.MathUtils.degToRad(moon.inclination || 0);

          let mesh = pivot.userData.mesh;
          if (!mesh) {
            mesh = new THREE.Mesh(
              new THREE.SphereGeometry(1, 48, 48),
              new THREE.MeshStandardMaterial({ color: moon.color || "#d0d0d0", roughness: 0.85, metalness: 0.18 })
            );
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            pivot.add(mesh);
            pivot.userData.mesh = mesh;
          }

          mesh.material.color.set(moon.color || "#d0d0d0");
          mesh.scale.setScalar(Math.max(0.02, moon.size || 0.15));

          const semiMajor = Math.max(0.5, moon.distance || 3.5);
          const eccentricity = THREE.MathUtils.clamp(moon.eccentricity ?? 0, 0, 0.95);
          const phase = (moon.phase ?? 0) % (Math.PI * 2);

          if (!this.params.physicsEnabled) {
            PHYSICS.computeOrbitPosition(semiMajor, eccentricity, phase, mesh.position);
            pivot.userData.physics = null;
            pivot.userData.trueAnomaly = phase;
          } else if (!pivot.userData.physics) {
            pivot.userData.physics = { posWorld: new THREE.Vector3(), velWorld: new THREE.Vector3(), mass: 0, mu: 0, bound: true, energy: 0 };
          }

          if (!pivot.userData.orbit) {
            const orbit = this.createOrbitLine();
            pivot.userData.orbit = orbit;
            this.orbitLinesGroup.add(orbit);
          }

          if (!pivot.userData.trajectoryHistory) {
            pivot.userData.trajectoryHistory = [];
            pivot.userData.maxTrajectoryPoints = 200;
          }

          if (!this.params.physicsEnabled) {
            this.updateOrbitLine(pivot.userData.orbit.geometry, moon);
            this.updateOrbitMaterial(pivot, true);
            this.alignOrbitLineWithPivot(pivot);
          } else {
            this.updateOrbitMaterial(pivot, true);
            const orbit = pivot.userData.orbit;
            if (orbit) {
              orbit.position.set(0, 0, 0);
              orbit.quaternion.identity();
              orbit.scale.set(1, 1, 1);
              orbit.updateMatrixWorld(true);
            }
          }
        });

        if (this.params.physicsEnabled) {
          this.initMoonPhysics();
        } else {
            this.guiControllers.updateStabilityDisplay(this.moonSettings.length, this.moonSettings.length);
        }
    }

    createOrbitLine() {
        const segments = 200;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(segments * 3);
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({ color: 0x88a1ff, transparent: true, opacity: 0.3, depthWrite: false });
        material.userData = { stableColor: new THREE.Color(0x88a1ff), unstableColor: new THREE.Color(0xff7666) };
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        return line;
    }

    updateTrajectoryHistory(pivot, worldPosition) {
        if (!pivot.userData.trajectoryHistory) {
          pivot.userData.trajectoryHistory = [];
          pivot.userData.maxTrajectoryPoints = 200;
        }
        const history = pivot.userData.trajectoryHistory;
        const maxPoints = pivot.userData.maxTrajectoryPoints;
        history.push(worldPosition.clone());
        if (history.length > maxPoints) {
          history.shift();
        }
    }

    updateTrajectoryLine(pivot) {
        if (!pivot.userData.orbit || !pivot.userData.trajectoryHistory) return;

        const orbit = pivot.userData.orbit;
        orbit.position.set(0, 0, 0);
        orbit.quaternion.identity();
        orbit.scale.set(1, 1, 1);
        orbit.updateMatrixWorld(true);
        const history = pivot.userData.trajectoryHistory;
        const geometry = orbit.geometry;
        const positions = geometry.attributes.position.array;

        positions.fill(0);

        if (history.length < 2) {
          geometry.attributes.position.needsUpdate = true;
          return;
        }

        const localPos = new THREE.Vector3();
        for (let i = 0; i < history.length && i < positions.length / 3; i++) {
          const worldPos = history[i];
          this.orbitLinesGroup.worldToLocal(localPos.copy(worldPos));
          positions[i * 3 + 0] = localPos.x;
          positions[i * 3 + 1] = localPos.y;
          positions[i * 3 + 2] = localPos.z;
        }

        geometry.setDrawRange(0, Math.min(history.length, positions.length / 3));
        geometry.attributes.position.needsUpdate = true;
        geometry.computeBoundingSphere();
    }

    updateOrbitLine(geometry, moon) {
        const positions = geometry.attributes.position.array;
        const segments = geometry.attributes.position.count;
        const semiMajor = Math.max(0.5, moon.distance || 3.5);
        const eccentricity = THREE.MathUtils.clamp(moon.eccentricity ?? 0, 0, 0.95);
        for (let i = 0; i < segments; i += 1) {
          const angle = (i / segments) * Math.PI * 2;
          const r = (semiMajor * (1 - eccentricity * eccentricity)) / Math.max(1e-6, 1 + eccentricity * Math.cos(angle));
          positions[i * 3 + 0] = Math.cos(angle) * r;
          positions[i * 3 + 1] = 0;
          positions[i * 3 + 2] = Math.sin(angle) * r;
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeBoundingSphere();
    }

    alignOrbitLineWithPivot(pivot) {
        if (!pivot?.userData?.orbit) return;
        const orbit = pivot.userData.orbit;
        pivot.updateMatrixWorld(true);
        const pivotWorldQuat = pivot.getWorldQuaternion(new THREE.Quaternion());
        const parentWorldQuat = this.orbitLinesGroup.getWorldQuaternion(new THREE.Quaternion());
        parentWorldQuat.invert();
        orbit.quaternion.copy(parentWorldQuat.multiply(pivotWorldQuat));
        const pivotWorldPos = pivot.getWorldPosition(new THREE.Vector3());
        this.orbitLinesGroup.worldToLocal(pivotWorldPos);
        orbit.position.copy(pivotWorldPos);
        orbit.updateMatrixWorld(true);
    }

    syncOrbitLinesWithPivots() {
        if (!this.params.showOrbitLines) return;
        this.moonsGroup.children.forEach((pivot) => {
          if (!pivot?.userData?.orbit) return;
          if (this.params.physicsEnabled && pivot.userData.trajectoryHistory && pivot.userData.trajectoryHistory.length > 1) {
            this.updateTrajectoryLine(pivot);
          } else {
            this.alignOrbitLineWithPivot(pivot);
          }
        });
    }

    updateOrbitLinesVisibility() {
        this.orbitLinesGroup.visible = this.params.showOrbitLines;
        if (this.params.showOrbitLines) {
            this.syncOrbitLinesWithPivots();
        }
    }

    updateOrbitMaterial(pivot, isBound) {
        const orbit = pivot.userData.orbit;
        if (orbit && orbit.material) {
          const mat = orbit.material;
          const stable = mat.userData?.stableColor || new THREE.Color(0x88a1ff);
          const unstable = mat.userData?.unstableColor || new THREE.Color(0xff7666);
          mat.color.copy(isBound ? stable : unstable);
          mat.opacity = isBound ? 0.32 : 0.5;
        }
        const mesh = pivot.userData.mesh;
        if (mesh?.material?.isMeshStandardMaterial) {
          mesh.material.emissive = mesh.material.emissive || new THREE.Color();
          mesh.material.emissive.setHex(isBound ? 0x1a2d4d : 0x5a1b1b);
          mesh.material.emissiveIntensity = isBound ? 0.25 : 0.55;
        }
    }

    initMoonPhysics() {
        PHYSICS.initMoonPhysics({
            params: this.params,
            planetRoot: this.planetRoot,
            moonsGroup: this.moonsGroup,
            moonSettings: this.moonSettings,
            updateStabilityDisplay: this.guiControllers.updateStabilityDisplay,
            updateOrbitMaterial: this.updateOrbitMaterial.bind(this),
            alignOrbitLineWithPivot: this.alignOrbitLineWithPivot.bind(this)
        });
    }

    resetMoonPhysics() {
        PHYSICS.resetMoonPhysics({
            moonsGroup: this.moonsGroup,
            initMoonPhysics: this.initMoonPhysics.bind(this)
        });
    }

    spawnExplosion(position, color = new THREE.Color(0xffaa66), strength = 1) {
        if (!this.params.explosionEnabled) return;
        const effectiveStrength = Math.max(0.05, this.params.explosionStrength) * Math.max(0.1, strength);
        const baseCount = Math.max(10, Math.round(this.params.explosionParticleBase || 80));
        let count = Math.max(20, Math.floor(baseCount * THREE.MathUtils.clamp(effectiveStrength, 0.2, 4)));
        if (this.visualSettings?.particleMax != null) {
          count = Math.min(count, this.visualSettings.particleMax);
        }
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        const baseCol = new THREE.Color();
        baseCol.set(this.params.explosionColor || 0xffaa66);
        const col = new THREE.Color(color);

        const colorVariations = [
          baseCol.clone(),
          baseCol.clone().lerp(col, 0.3),
          baseCol.clone().lerp(col, 0.6),
          baseCol.clone().lerp(new THREE.Color(1, 0.2, 0.1), 0.4),
          baseCol.clone().lerp(new THREE.Color(1, 0.8, 0.2), 0.3),
          baseCol.clone().lerp(new THREE.Color(0.8, 0.2, 1), 0.2),
          baseCol.clone().lerp(new THREE.Color(0.2, 0.8, 1), 0.2),
        ];

        for (let i = 0; i < count; i += 1) {
          positions[i * 3 + 0] = position.x;
          positions[i * 3 + 1] = position.y;
          positions[i * 3 + 2] = position.z;

          const dir = new THREE.Vector3(
            (Math.random() - 0.5),
            (Math.random() - 0.2),
            (Math.random() - 0.5)
          ).normalize();

          const baseSpeed = THREE.MathUtils.lerp(3.5, 10.5, Math.random()) * effectiveStrength;
          const speedVariation = THREE.MathUtils.lerp(0.5, 2.0, Math.random()) * (this.params.explosionSpeedVariation || 1.0);
          const speed = baseSpeed * speedVariation;

          velocities[i * 3 + 0] = dir.x * speed;
          velocities[i * 3 + 1] = dir.y * speed;
          velocities[i * 3 + 2] = dir.z * speed;

          const baseColor = colorVariations[Math.floor(Math.random() * colorVariations.length)];
          const colorVariation = this.params.explosionColorVariation || 0.5;
          const tint = baseColor.clone().lerp(
            new THREE.Color(Math.random(), Math.random(), Math.random()),
            Math.random() * colorVariation
          );

          tint.multiplyScalar(THREE.MathUtils.lerp(0.7, 1.3, Math.random()));
          tint.r = THREE.MathUtils.clamp(tint.r, 0, 1);
          tint.g = THREE.MathUtils.clamp(tint.g, 0, 1);
          tint.b = THREE.MathUtils.clamp(tint.b, 0, 1);

          colors[i * 3 + 0] = tint.r;
          colors[i * 3 + 1] = tint.g;
          colors[i * 3 + 2] = tint.b;
        }

        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        const pointTexture = generateAnnulusTextureExt({ innerRatio: 0.0, color: 0xffffff, opacity: 1 });
        const sizeVariation = this.params.explosionSizeVariation || 1.0;
        const material = new THREE.PointsMaterial({
          size: Math.max(0.05, (this.params.explosionSize || 0.4) * (0.5 + effectiveStrength * 0.5) * sizeVariation),
          map: pointTexture,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
          opacity: 1
        });
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        this.scene.add(points);

        this.activeExplosions.push({
          object: points,
          velocities,
          life: 0,
          maxLife: Math.max(0.1, this.params.explosionLifetime || 1.6),
          damping: THREE.MathUtils.clamp(this.params.explosionDamping ?? 0.9, 0.4, 1)
        });
    }

    updateExplosions(dt) {
        if (this.activeExplosions.length === 0) return;
        for (let i = this.activeExplosions.length - 1; i >= 0; i -= 1) {
          const e = this.activeExplosions[i];
          const geom = e.object.geometry;
          const positions = geom.attributes.position.array;
          const vels = e.velocities;

          const drag = Math.pow(e.damping, Math.max(0, dt) * 60);
          for (let p = 0; p < vels.length; p += 3) {
            vels[p + 0] *= drag;
            vels[p + 1] *= drag;
            vels[p + 2] *= drag;

            positions[p + 0] += vels[p + 0] * dt;
            positions[p + 1] += vels[p + 1] * dt;
            positions[p + 2] += vels[p + 2] * dt;
          }
          geom.attributes.position.needsUpdate = true;

          e.life += dt;
          const t = THREE.MathUtils.clamp(e.life / e.maxLife, 0, 1);
          const fade = 1 - Math.pow(t, 1.8);
          e.object.material.opacity = fade;
          e.object.material.size = Math.max(0.1, e.object.material.size * (0.995 + 0.002 * Math.random()));

          if (e.life >= e.maxLife) {
            this.scene.remove(e.object);
            if (geom) geom.dispose();
            if (e.object.material && e.object.material.map) e.object.material.map.dispose();
            if (e.object.material) e.object.material.dispose();
            this.activeExplosions.splice(i, 1);
          }
        }
    }

    applyImpactDeformation(worldPosition, impactRadius, { strength = 1, directionWorld = null, obliquity = 0 } = {}) {
        if (!worldPosition || impactRadius <= 0) return;
        if (this.params.planetType === 'gas_giant') return;

        const meshes = this.surfaceLODLevels ? Object.values(this.surfaceLODLevels) : [];
        const targets = meshes.length ? meshes : (this.planetMesh ? [this.planetMesh] : []);
        if (!targets.length) return;

        const up = new THREE.Vector3();
        const tangentCandidate = new THREE.Vector3();
        const bitangent = new THREE.Vector3();
        const v = new THREE.Vector3();
        const vDir = new THREE.Vector3();
        const local = new THREE.Vector3();

        targets.forEach((mesh) => {
          if (!mesh?.geometry) return;
          const geometry = mesh.geometry;
          const positions = geometry.getAttribute('position');
          if (!positions) return;
          if (positions.setUsage) {
            try { positions.setUsage(THREE.DynamicDrawUsage); } catch {}
          } else if ('usage' in positions) {
            positions.usage = THREE.DynamicDrawUsage;
          }

          const localImpact = mesh.worldToLocal(worldPosition.clone());
          if (localImpact.lengthSq() === 0) return;
          const centerDir = up.copy(localImpact).normalize();

          let tangentLocal = null;
          if (directionWorld && directionWorld.lengthSq() >= 1e-8) {
            const p1 = mesh.worldToLocal(worldPosition.clone());
            const p2 = mesh.worldToLocal(worldPosition.clone().add(directionWorld.clone()));
            const dirLocal = p2.sub(p1).normalize();
            const projection = centerDir.dot(dirLocal);
            tangentCandidate.copy(dirLocal).sub(centerDir.clone().multiplyScalar(projection)).normalize();
            if (tangentCandidate.lengthSq() > 0.5) {
              tangentLocal = tangentCandidate.clone();
            }
          }
          const bitangentLocal = tangentLocal ? bitangent.copy(centerDir).cross(tangentLocal).normalize() : null;

          const craterAngle = THREE.MathUtils.clamp(impactRadius / Math.max(1e-6, this.params.radius), 0.01, Math.PI / 2);
          const baseDepth = Math.min(impactRadius * 0.45, (this.params.noiseAmplitude || 0.5) * 0.6 + 0.02);
          const depth = THREE.MathUtils.clamp(baseDepth * THREE.MathUtils.clamp(strength, 0.2, 3.5), 0.005, impactRadius);

          const obliq = THREE.MathUtils.clamp(isFinite(obliquity) ? obliquity : 0, 0, Math.PI / 2);
          const elongBase = (this.params.impactElongationMul ?? 1.6);
          const elongation = tangentLocal ? (1 + elongBase * (obliq / (Math.PI / 2))) : 1;
          const minorScale = 1 / elongation;

          const arr = positions.array;
          for (let i = 0; i < arr.length; i += 3) {
            v.set(arr[i + 0], arr[i + 1], arr[i + 2]);
            const r = v.length();
            if (r <= 0) continue;
            vDir.copy(v).divideScalar(r);
            let ang;
            if (tangentLocal) {
              const du = vDir.dot(tangentLocal);
              const dv = vDir.dot(bitangentLocal);
              const dn = vDir.dot(centerDir);
              const u = du / elongation;
              const w = dv / minorScale;
              local.set(u, dn, w).normalize();
              ang = Math.acos(THREE.MathUtils.clamp(local.y, -1, 1));
            } else {
              ang = Math.acos(THREE.MathUtils.clamp(vDir.dot(centerDir), -1, 1));
            }
            if (ang > craterAngle) continue;

            const t = 1 - ang / craterAngle;
            const falloff = t * t * (3 - 2 * t);

            const newR = Math.max(0.01, r - depth * falloff);
            vDir.multiplyScalar(newR);
            arr[i + 0] = vDir.x;
            arr[i + 1] = vDir.y;
            arr[i + 2] = vDir.z;
          }

          positions.needsUpdate = true;
          geometry.computeVertexNormals();
          if (geometry.attributes.normal) geometry.attributes.normal.needsUpdate = true;
          geometry.computeBoundingSphere();
        });
    }

    updateAurora() {
        if (!this.auroraNode) return;
        this.auroraNode.applyParams(true);
    }

    regenerateFoamTextureIfNeeded(profile, offsets, baseNoise) {
        const { ridgeNoise, warpNoiseX, warpNoiseY, warpNoiseZ, craterNoise } = this;
        const currentFoamParams = {
            seed: this.params.seed,
            oceanLevel: this.params.oceanLevel,
            noiseAmplitude: this.params.noiseAmplitude,
            noiseLayers: this.params.noiseLayers,
            persistence: this.params.persistence,
            lacunarity: this.params.lacunarity,
            noiseFrequency: this.params.noiseFrequency,
            profile: JSON.stringify(profile)
        };

        if (JSON.stringify(currentFoamParams) === this.lastFoamParams) {
            return;
        }

        const texWidth = 512;
        const texHeight = 256;
        const data = new Uint8Array(texWidth * texHeight * 4);
        const dir = new THREE.Vector3();
        const warpVecTex = new THREE.Vector3();

        const ridgeFreq = profile.ridgeFrequency;
        const ruggedPower = profile.ruggedPower;
        const ridgeWeight = profile.ridgeWeight;
        const billowWeight = profile.billowWeight;
        const plateauPower = profile.plateauPower;
        const sharpness = profile.sharpness;
        const strStrength = profile.striationStrength;
        const strFreq = profile.striationFrequency;
        const strPhase = profile.striationPhase;
        const equatorLift = profile.equatorLift;
        const poleDrop = profile.poleDrop;
        const craterFreq = profile.craterFrequency;
        const craterThresh = profile.craterThreshold;
        const craterDepth = profile.craterDepth;
        const craterSharp = profile.craterSharpness;
        const warpStrength = profile.warpStrength * 0.35;
        const warpOffset = profile.warpOffset;
        const craterOffset = profile.craterOffset;

        const shorelineHalfWidth = Math.max(0.002, this.params.noiseAmplitude * 0.06);

        for (let y = 0; y < texHeight; y += 1) {
          const v = y / (texHeight - 1);
          const lat = (v - 0.5) * Math.PI;
          const cosLat = Math.cos(lat);
          const sinLat = Math.sin(lat);
          for (let x = 0; x < texWidth; x += 1) {
            const u = x / (texWidth - 1);
            const lon = (u - 0.5) * Math.PI * 2;
            const cosLon = Math.cos(lon);
            const sinLon = Math.sin(lon);
            dir.set(cosLat * cosLon, sinLat, cosLat * sinLon);

            let sampleDirX = dir.x;
            let sampleDirY = dir.y;
            let sampleDirZ = dir.z;
            if (warpStrength > 0) {
              const fx = profile.warpFrequency;
              warpVecTex.set(
                warpNoiseX(sampleDirX * fx + warpOffset.x, sampleDirY * fx + warpOffset.y, sampleDirZ * fx + warpOffset.z),
                warpNoiseY(sampleDirX * fx + warpOffset.y, sampleDirY * fx + warpOffset.z, sampleDirZ * fx + warpOffset.x),
                warpNoiseZ(sampleDirX * fx + warpOffset.z, sampleDirY * fx + warpOffset.x, sampleDirZ * fx + warpOffset.y)
              );
              sampleDirX = (sampleDirX + warpVecTex.x * warpStrength);
              sampleDirY = (sampleDirY + warpVecTex.y * warpStrength);
              sampleDirZ = (sampleDirZ + warpVecTex.z * warpStrength);
              const invLen = 1 / Math.sqrt(sampleDirX * sampleDirX + sampleDirY * sampleDirY + sampleDirZ * sampleDirZ);
              sampleDirX *= invLen; sampleDirY *= invLen; sampleDirZ *= invLen;
            }

            let amplitude = 1;
            let frequency = this.params.noiseFrequency;
            let totalAmplitude = 0;
            let sum = 0;
            let ridgeSum = 0;
            let billowSum = 0;
            for (let layer = 0; layer < this.params.noiseLayers; layer += 1) {
              const o = offsets[layer];
              const sx = sampleDirX * frequency + o.x;
              const sy = sampleDirY * frequency + o.y;
              const sz = sampleDirZ * frequency + o.z;
              const s = baseNoise(sx, sy, sz);
              sum += s * amplitude;

              const r = ridgeNoise(sx * ridgeFreq, sy * ridgeFreq, sz * ridgeFreq);
              ridgeSum += (1 - Math.abs(r)) * amplitude;

              billowSum += Math.pow(Math.abs(s), ruggedPower) * amplitude;

              totalAmplitude += amplitude;
              amplitude *= this.params.persistence;
              frequency *= this.params.lacunarity;
            }
            if (totalAmplitude > 0) {
              sum /= totalAmplitude;
              ridgeSum /= totalAmplitude;
              billowSum /= totalAmplitude;
            }

            let elev = sum;
            elev = THREE.MathUtils.lerp(elev, ridgeSum * 2 - 1, ridgeWeight);
            elev = THREE.MathUtils.lerp(elev, billowSum * 2 - 1, billowWeight);
            elev = Math.sign(elev) * Math.pow(Math.abs(elev), sharpness);
            let normalized = elev * 0.5 + 0.5;
            normalized = Math.pow(THREE.MathUtils.clamp(normalized, 0, 1), plateauPower);
            if (strStrength > 0) {
              const str = Math.sin((sampleDirX + sampleDirZ) * strFreq + strPhase);
              normalized += str * strStrength;
            }
            if (equatorLift || poleDrop) {
              const latitude = Math.abs(sampleDirY);
              normalized += (1 - latitude) * equatorLift;
              normalized -= latitude * poleDrop;
            }
            const cSamp = craterNoise(sampleDirX * craterFreq + craterOffset.x, sampleDirY * craterFreq + craterOffset.y, sampleDirZ * craterFreq + craterOffset.z);
            const cVal = (cSamp + 1) * 0.5;
            if (cVal > craterThresh) {
              const cT = (cVal - craterThresh) / Math.max(1e-6, 1 - craterThresh);
              normalized -= Math.pow(cT, craterSharp) * craterDepth;
            }
            normalized = THREE.MathUtils.clamp(normalized, 0, 1);

            const displacementHere = (normalized - this.params.oceanLevel) * this.params.noiseAmplitude;
            const finalR = this.params.radius + displacementHere;
            const distFromShore = Math.abs(finalR - this.params.radius);

            let alpha = 1 - THREE.MathUtils.smoothstep(distFromShore, 0, shorelineHalfWidth);
            alpha *= THREE.MathUtils.clamp(0.5 + Math.sign(displacementHere) * 0.5, 0, 1);
            const hash = (Math.sin((x + 37) * 12.9898 + (y + 57) * 78.233) * 43758.5453) % 1;
            alpha = THREE.MathUtils.clamp(alpha * (0.9 + 0.2 * hash), 0, 1);

            const idx = (y * texWidth + x) * 4;
            data[idx + 0] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = Math.round(alpha * 255);
          }
        }

        if (this.foamTexture && this.foamTexture.dispose) {
            this.foamTexture.dispose();
        }
        this.foamTexture = new THREE.DataTexture(data, texWidth, texHeight, THREE.RGBAFormat);
        this.foamTexture.colorSpace = THREE.SRGBColorSpace;
        this.foamTexture.needsUpdate = true;
        this.foamTexture.wrapS = THREE.RepeatWrapping;
        this.foamTexture.wrapT = THREE.ClampToEdgeWrapping;
        this.foamTexture.magFilter = THREE.LinearFilter;
        this.foamTexture.minFilter = THREE.LinearMipMapLinearFilter;

        this.foamMesh.material.map = this.foamTexture;
        this.foamMesh.material.alphaMap = this.foamTexture;
        this.foamMesh.material.needsUpdate = true;
        this.lastFoamParams = JSON.stringify(currentFoamParams);
    }
}


