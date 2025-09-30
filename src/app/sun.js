import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import { SeededRNG } from "./utils.js";
import { createSunTexture as createSunTextureExt } from "./stars.js";
import { generateAnnulusTexture as generateAnnulusTextureExt } from "./textures.js";

// Shaders
const starCoreVertexShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  void main() {
    vPosition = position;
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const starCoreFragmentShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  uniform vec3 uColorCore;
  uniform vec3 uColorEdge;
  uniform float uTime;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform float uPulse;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
      float h = hash(p * frequency + uTime * 0.6);
      value += amplitude * (h * 2.0 - 1.0);
      frequency *= 1.9;
      amplitude *= 0.55;
      p += vec3(17.0, 9.0, 23.0);
    }
    return value;
  }

  void main() {
    float r = length(vPosition);
    float base = pow(smoothstep(1.0, 0.0, r), 1.6);
    float turbulence = fbm(normalize(vNormal) * uNoiseScale + uTime * 0.25);
    float intensity = base + uNoiseStrength * turbulence + uPulse;
    intensity = clamp(intensity, 0.0, 1.4);
    vec3 color = mix(uColorEdge, uColorCore, clamp(intensity, 0.0, 1.0));
    gl_FragColor = vec4(color, clamp(intensity, 0.2, 1.0));
  }
`;

const starCoronaVertexShader = `
  varying vec3 vPosition;
  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const starCoronaFragmentShader = `
  varying vec3 vPosition;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform float uPulse;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(4.898, 7.23, 3.17))) * 43758.5453);
  }

  float turbulence(vec3 p) {
    float sum = 0.0;
    float scale = 1.0;
    for (int i = 0; i < 3; i++) {
      sum += abs(hash(p * scale + uTime * 0.4) * 2.0 - 1.0) / scale;
      scale *= 2.2;
    }
    return sum;
  }

  void main() {
    float radius = length(vPosition);
    float rim = smoothstep(1.0, 0.2, radius);
    float t = turbulence(normalize(vPosition) * uNoiseScale) * uNoiseStrength;
    float alpha = clamp(rim * (0.65 + t + uPulse), 0.0, 1.0);
    if (alpha <= 0.001) discard;
    vec3 color = uColor * (0.6 + 0.4 * rim);
    gl_FragColor = vec4(color, alpha);
  }
`;

const blackHoleDiskVertexShader = `
  varying vec2 vLocalPos;
  varying vec3 vWorldPos;
  void main() {
    vLocalPos = position.xy;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const blackHoleDiskFragmentShader = `
  varying vec2 vLocalPos;
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uFeather;
  uniform float uIntensity;
  uniform float uScale;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(13.9898, 78.233, 37.719))) * 43758.5453);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.6;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
      value += amplitude * (hash(p * frequency) * 2.0 - 1.0);
      frequency *= 2.1;
      amplitude *= 0.55;
      p += vec3(17.0, 9.0, 13.0);
    }
    return value;
  }

  void main() {
    float radius = length(vLocalPos) * uScale;
    float inner = max(0.0, uInnerRadius);
    float outer = max(inner + 0.0001, uOuterRadius);
    float feather = max(0.0001, uFeather);

    float innerEdge = smoothstep(inner - feather, inner, radius);
    float outerEdge = 1.0 - smoothstep(outer, outer + feather, radius);
    float band = clamp(innerEdge * outerEdge, 0.0, 1.0);

    if (band <= 0.0001) discard;

    float t = clamp((radius - inner) / max(0.0001, outer - inner), 0.0, 1.0);
    float baseBrightness = mix(1.3, 0.35, t) * uIntensity;

    vec3 coord = normalize(vWorldPos) * uNoiseScale;
    float turbulence = fbm(coord) * uNoiseStrength;

    vec3 color = uColor * (baseBrightness + turbulence);
    float alpha = band * clamp(uIntensity + turbulence * 0.5, 0.0, 1.4);
    gl_FragColor = vec4(color, alpha);
  }
`;

const blackHoleHaloFragmentShader = `
  varying vec2 vLocalPos;
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uFeather;
  uniform float uIntensity;
  uniform float uScale;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(4.898, 7.23, 3.17))) * 43758.5453);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.6;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
      value += amplitude * (hash(p * frequency) * 2.0 - 1.0);
      frequency *= 2.1;
      amplitude *= 0.55;
      p += vec3(11.0, 5.0, 19.0);
    }
    return value;
  }

  void main() {
    float radius = length(vLocalPos) * uScale;
    float inner = max(0.0, uInnerRadius);
    float outer = max(inner + 0.0001, uOuterRadius);
    float feather = max(0.0001, uFeather);

    float core = smoothstep(inner - feather, inner, radius);
    float halo = 1.0 - smoothstep(outer - feather, outer + feather, radius);
    float band = clamp(core * halo, 0.0, 1.0);

    if (band <= 0.0001) discard;

    vec3 coord = normalize(vWorldPos) * uNoiseScale;
    float turbulence = fbm(coord) * uNoiseStrength;

    float heightFade = exp(-abs(vLocalPos.y) * 1.2);
    float brightness = (0.6 + 0.6 * heightFade + turbulence) * uIntensity;
    vec3 color = uColor * brightness;
    float alpha = band * clamp(uIntensity + turbulence * 0.4, 0.0, 1.2);
    gl_FragColor = vec4(color, alpha);
  }
`;


// Black hole uniforms (moved outside class for export)
const blackHoleDiskUniforms = {
    uColor: { value: new THREE.Color(0xffb378) },
    uInnerRadius: { value: 0.6 },
    uOuterRadius: { value: 2.4 },
    uFeather: { value: 0.25 },
    uIntensity: { value: 1.5 },
    uScale: { value: 1 },
    uNoiseScale: { value: 1.0 },
    uNoiseStrength: { value: 0.25 }
};

// Export shader constants and uniforms for use in other modules
export { blackHoleDiskUniforms, blackHoleDiskVertexShader, blackHoleDiskFragmentShader };

const SUN_LOD_LEVELS = ["high", "medium", "low"];
const SUN_CORE_LOD_CONFIG = {
  high: { detail: 5, distance: 6 },
  medium: { detail: 3, distance: 18 },
  low: { detail: 1, distance: 42 }
};
const SUN_CORONA_LOD_CONFIG = {
  high: { detail: 4, distance: 8 },
  medium: { detail: 2, distance: 24 },
  low: { detail: 1, distance: 58 }
};

export class Sun {
    constructor(scene, planetRoot, params, visualSettings) {
        this.scene = scene;
        this.planetRoot = planetRoot;
        this.params = params;
        this.visualSettings = visualSettings;
        this.sunPulsePhase = 0;
        this.currentSunVariant = this.params.sunVariant || "Star";

        this.sunGroup = new THREE.Group();
        this.sunGroup.name = "SunGroup";
        this.scene.add(this.sunGroup);

        this.sunLight = this._createSunLight();
        this.sunGroup.add(this.sunLight);

        this._createStarObjects();
        this._createBlackHoleObjects();
        this._createStarParticles();

        this.update();
    }

    _createSunLight() {
        const sunLight = new THREE.PointLight(0xfff0ce, 1.65, 0, 1.5);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(2048, 2048);
        sunLight.shadow.camera.near = 0.1;
        sunLight.shadow.camera.far = 220;
        sunLight.shadow.bias = -0.00008;
        sunLight.shadow.radius = 2.5;
        sunLight.position.set(0, 0, 0);
        return sunLight;
    }

    _createStarObjects() {
        this.starCoreUniforms = {
            uColorCore: { value: new THREE.Color(0xffd27f) },
            uColorEdge: { value: new THREE.Color(0xffa060) },
            uTime: { value: 0 },
            uNoiseScale: { value: 1.6 },
            uNoiseStrength: { value: 0.4 },
            uPulse: { value: 0 }
        };

        this.starCoronaUniforms = {
            uColor: { value: new THREE.Color(0xffa060) },
            uTime: { value: 0 },
            uNoiseScale: { value: 1.2 },
            uNoiseStrength: { value: 0.5 },
            uPulse: { value: 0 }
        };

        const sunCoreMaterial = new THREE.ShaderMaterial({
            uniforms: this.starCoreUniforms,
            vertexShader: starCoreVertexShader,
            fragmentShader: starCoreFragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        });
        this.sunCoreMaterial = sunCoreMaterial;

        this.sunCoreLOD = new THREE.LOD();
        this.sunCoreLOD.name = "SunCoreLOD";
        this.sunCoreLOD.frustumCulled = false;
        this.sunGroup.add(this.sunCoreLOD);
        this.sunCoreLevels = {};
        SUN_LOD_LEVELS.forEach((levelKey) => {
            const config = SUN_CORE_LOD_CONFIG[levelKey] || SUN_CORE_LOD_CONFIG.medium;
            const detail = Math.max(0, config.detail ?? 3);
            const geometry = new THREE.IcosahedronGeometry(1, detail);
            const mesh = new THREE.Mesh(geometry, sunCoreMaterial);
            mesh.frustumCulled = false;
            mesh.name = `SunCore_${levelKey}`;
            this.sunCoreLOD.addLevel(mesh, 0);
            this.sunCoreLevels[levelKey] = mesh;
        });
        this.sunVisual = this.sunCoreLevels.medium;

        const sunCoronaMaterial = new THREE.ShaderMaterial({
            uniforms: this.starCoronaUniforms,
            vertexShader: starCoronaVertexShader,
            fragmentShader: starCoronaFragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        });
        this.sunCoronaMaterial = sunCoronaMaterial;

        this.sunCoronaLOD = new THREE.LOD();
        this.sunCoronaLOD.name = "SunCoronaLOD";
        this.sunCoronaLOD.frustumCulled = false;
        this.sunGroup.add(this.sunCoronaLOD);
        this.sunCoronaLevels = {};
        SUN_LOD_LEVELS.forEach((levelKey) => {
            const config = SUN_CORONA_LOD_CONFIG[levelKey] || SUN_CORONA_LOD_CONFIG.medium;
            const detail = Math.max(0, config.detail ?? 2);
            const geometry = new THREE.IcosahedronGeometry(1.2, detail);
            const mesh = new THREE.Mesh(geometry, sunCoronaMaterial);
            mesh.frustumCulled = false;
            mesh.renderOrder = 1;
            mesh.name = `SunCorona_${levelKey}`;
            this.sunCoronaLOD.addLevel(mesh, 0);
            this.sunCoronaLevels[levelKey] = mesh;
        });
        this.sunCorona = this.sunCoronaLevels.medium;

        this._updateSunLodDistances();
    }

    _updateSunLodDistances() {
        const resolutionScale = Math.max(0.5, Math.min(1.6, this.visualSettings?.noiseResolution ?? 1.0));
        if (this.sunCoreLOD?.levels?.length) {
            const coreScale = Math.max(0.1, this.params.sunSize || 1);
            SUN_LOD_LEVELS.forEach((levelKey, index) => {
                const level = this.sunCoreLOD.levels[index];
                if (!level) return;
                const config = SUN_CORE_LOD_CONFIG[levelKey] || SUN_CORE_LOD_CONFIG.medium;
                level.distance = coreScale * resolutionScale * (config.distance ?? 10);
            });
        }
        if (this.sunCoronaLOD?.levels?.length) {
            const haloScale = Math.max(Math.max(0.1, this.params.sunSize || 1) * 1.2, this.params.sunHaloSize || 1);
            SUN_LOD_LEVELS.forEach((levelKey, index) => {
                const level = this.sunCoronaLOD.levels[index];
                if (!level) return;
                const config = SUN_CORONA_LOD_CONFIG[levelKey] || SUN_CORONA_LOD_CONFIG.medium;
                level.distance = haloScale * resolutionScale * (config.distance ?? 14);
            });
        }
    }

    _syncActiveSunMeshes() {
        if (this.sunCoreLOD?.levels?.length) {
            const activeCore = this.sunCoreLOD.levels.find((level) => level?.object?.visible)?.object;
            if (activeCore) {
                this.sunVisual = activeCore;
            }
        }
        if (this.sunCoronaLOD?.levels?.length) {
            const activeCorona = this.sunCoronaLOD.levels.find((level) => level?.object?.visible)?.object;
            if (activeCorona) {
                this.sunCorona = activeCorona;
            }
        }
    }

    _createBlackHoleObjects() {
        this.blackHoleDiskUniforms = THREE.UniformsUtils.clone(blackHoleDiskUniforms);

        this.blackHoleHaloUniforms = {
            uColor: { value: new THREE.Color(0xffd6a6) },
            uInnerRadius: { value: 1.2 },
            uOuterRadius: { value: 3.1 },
            uFeather: { value: 0.35 },
            uIntensity: { value: 0.9 },
            uScale: { value: 1 },
            uNoiseScale: { value: 1.0 },
            uNoiseStrength: { value: 0.35 }
        };

        this.blackHoleGroup = new THREE.Group();
        this.blackHoleGroup.name = "BlackHoleGroup";
        this.blackHoleGroup.visible = false;
        this.sunGroup.add(this.blackHoleGroup);

        this.blackHoleOrientationGroup = new THREE.Group();
        this.blackHoleSpinGroup = new THREE.Group();
        this.blackHoleGroup.add(this.blackHoleOrientationGroup);
        this.blackHoleOrientationGroup.add(this.blackHoleSpinGroup);

        const blackHoleCoreMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.FrontSide, toneMapped: false });
        this.blackHoleCore = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), blackHoleCoreMaterial);
        this.blackHoleCore.castShadow = false;
        this.blackHoleCore.receiveShadow = false;
        this.blackHoleCore.renderOrder = 2;
        this.blackHoleSpinGroup.add(this.blackHoleCore);

        const blackHoleDiskGeometry = new THREE.CircleGeometry(1, 256);
        const blackHoleDiskMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(this.blackHoleDiskUniforms),
            vertexShader: blackHoleDiskVertexShader,
            fragmentShader: blackHoleDiskFragmentShader,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        });
        this.blackHoleDisk = new THREE.Mesh(blackHoleDiskGeometry, blackHoleDiskMaterial);
        this.blackHoleDisk.rotation.x = Math.PI / 2;
        this.blackHoleDisk.renderOrder = 3;
        this.blackHoleSpinGroup.add(this.blackHoleDisk);

        const blackHoleHaloGeometry = new THREE.CircleGeometry(1, 256);
        const blackHoleHaloMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(this.blackHoleHaloUniforms),
            vertexShader: blackHoleDiskVertexShader,
            fragmentShader: blackHoleHaloFragmentShader,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        });
        this.blackHoleHalo = new THREE.Mesh(blackHoleHaloGeometry, blackHoleHaloMaterial);
        this.blackHoleHalo.rotation.y = Math.PI / 2;
        this.blackHoleHalo.renderOrder = 4;
        this.blackHoleSpinGroup.add(this.blackHoleHalo);

        this.blackHoleHaloSecondary = this.blackHoleHalo.clone();
        this.blackHoleHaloSecondary.material = blackHoleHaloMaterial.clone();
        this.blackHoleHaloSecondary.rotation.y = -Math.PI / 2;
        this.blackHoleSpinGroup.add(this.blackHoleHaloSecondary);

        this.blackHoleHaloMaterials = [this.blackHoleHalo.material, this.blackHoleHaloSecondary.material];

        this.blackHoleDiskBasicMaterial = null;
        this.blackHoleDiskTexture = null;
        this.blackHoleHaloBasicMaterial = null;
        this.blackHoleHaloSecondaryBasicMaterial = null;
        this.blackHoleHaloTexture = null;

        this.blackHoleState = {
            lastCoreSize: null,
            lastDiskRadius: null,
            lastDiskThickness: null,
            lastDiskIntensity: null,
            lastDiskTilt: null,
            lastDiskYaw: null,
            lastDiskNoiseScale: null,
            lastDiskNoiseStrength: null,
            lastHaloRadius: null,
            lastHaloAngle: null,
            lastHaloThickness: null,
            lastHaloIntensity: null,
            lastHaloNoiseScale: null,
            lastHaloNoiseStrength: null,
            baseTwist: 0,
            spinAngle: 0,
            haloSpinAngle: 0,
            lastColor: new THREE.Color()
        };
    }

    _createStarParticles() {
        this.starParticleState = {
            points: null,
            geometry: null,
            material: null,
            texture: null,
            positions: null,
            velocities: null,
            life: null,
            maxLife: null,
            rng: null,
            count: 0,
            speed: 0.6,
            baseLifetime: 3.5,
            color: "#ffd27f"
        };
    }

    update(delta, simulationDelta, camera = null) {
        if (camera) {
            if (this.sunCoreLOD) {
                this.sunCoreLOD.updateMatrixWorld(true);
                this.sunCoreLOD.update(camera);
            }
            if (this.sunCoronaLOD) {
                this.sunCoronaLOD.updateMatrixWorld(true);
                this.sunCoronaLOD.update(camera);
            }
        }
        this._syncActiveSunMeshes();
        if (this.params.sunVariant !== "Black Hole") {
            this.starCoreUniforms.uTime.value += delta;
            this.starCoronaUniforms.uTime.value += delta * 0.6;

            if (this.params.sunPulseSpeed > 0.001) {
              this.sunPulsePhase += delta * this.params.sunPulseSpeed * 2.4;
              const pulse = Math.sin(this.sunPulsePhase) * 0.5 + 0.5;
              const pulseStrength = Math.max(0.05, this.params.sunGlowStrength || 1) * 0.22;
              this.starCoreUniforms.uPulse.value = (pulse - 0.5) * pulseStrength;
              this.starCoronaUniforms.uPulse.value = (pulse - 0.4) * pulseStrength * 1.35;
              const baseCoreScale = Math.max(0.1, this.params.sunSize);
              const baseHaloScale = Math.max(baseCoreScale * 1.15, this.params.sunHaloSize);
              const glowStrength = Math.max(0.05, this.params.sunGlowStrength || 1);
              const coreScaleMultiplier = 1 + (pulse - 0.5) * glowStrength * 0.08;
              const haloScaleMultiplier = 1 + (pulse - 0.4) * glowStrength * 0.12;
              this.sunCoreLOD?.scale?.setScalar(baseCoreScale * THREE.MathUtils.clamp(coreScaleMultiplier, 0.85, 1.4));
              this.sunCoronaLOD?.scale?.setScalar(baseHaloScale * THREE.MathUtils.clamp(haloScaleMultiplier, 0.8, 1.6));
            } else {
                this.starCoreUniforms.uPulse.value = 0;
                this.starCoronaUniforms.uPulse.value = 0;
              const baseCoreScale = Math.max(0.1, this.params.sunSize);
              const baseHaloScale = Math.max(baseCoreScale * 1.15, this.params.sunHaloSize);
              this.sunCoreLOD?.scale?.setScalar(baseCoreScale);
              this.sunCoronaLOD?.scale?.setScalar(baseHaloScale);
            }

            this._updateStarParticles(simulationDelta);
        } else {
            this.starCoreUniforms.uPulse.value = 0;
            this.starCoronaUniforms.uPulse.value = 0;
        }

        if (this.params.sunVariant === "Black Hole") {
            const spinSpeed = this.params.blackHoleSpinSpeed ?? 0;
            if (Math.abs(spinSpeed) > 1e-4) {
                this.blackHoleState.spinAngle = (this.blackHoleState.spinAngle || 0) + delta * spinSpeed;
                this._applyBlackHoleSpinRotation();
            } else if (this.blackHoleState.spinAngle) {
                this.blackHoleState.spinAngle = 0;
                this._applyBlackHoleSpinRotation();
            }
            const haloSpin = this.params.blackHoleHaloSpinSpeed ?? 0;
            if (Math.abs(haloSpin) > 1e-4) {
                this.blackHoleState.haloSpinAngle = (this.blackHoleState.haloSpinAngle || 0) + delta * haloSpin;
                this._applyBlackHoleHaloSpinRotation();
            } else if (this.blackHoleState.haloSpinAngle) {
                this.blackHoleState.haloSpinAngle = 0;
                this._applyBlackHoleHaloSpinRotation();
            }
        } else if (this.blackHoleState.spinAngle) {
            this.blackHoleState.spinAngle = 0;
            this._applyBlackHoleSpinRotation();
        }
    }

    updateSun() {
        const color = new THREE.Color(this.params.sunColor);
        const isBlackHole = this.params.sunVariant === "Black Hole";
        const variantChanged = this.currentSunVariant !== this.params.sunVariant;

        if (variantChanged) {
          this._resetBlackHoleState();
          if (isBlackHole) {
            this._disposeStarParticles();
          }
          this.currentSunVariant = this.params.sunVariant;
        }

        this.sunGroup.position.set(0, 0, 0);
        this.sunLight.color.copy(color);
        this.sunLight.intensity = Math.max(0, this.params.sunIntensity) * (this.visualSettings.lightingScale || 1.0);
        this.sunLight.decay = THREE.MathUtils.clamp(this.params.sunFalloff ?? 1.4, 0, 4) || 1.4;
        this.sunLight.distance = Math.max(0, this.params.sunLightRange ?? 0);
        this.sunLight.position.set(0, 0, 0);

        const lodVisible = !isBlackHole;
        this.sunVisual.visible = lodVisible;
        this.sunCorona.visible = lodVisible;
        if (this.sunCoreLOD) this.sunCoreLOD.visible = lodVisible;
        if (this.sunCoronaLOD) this.sunCoronaLOD.visible = lodVisible;
        this.blackHoleGroup.visible = isBlackHole;
        if (this.starParticleState.points) {
            this.starParticleState.points.visible = lodVisible;
        }

        if (isBlackHole) {
          this._updateBlackHole(color);
          this.sunPulsePhase = 0;
          return;
        }

        const edgeColor = color.clone().lerp(new THREE.Color(1, 0.72, 0.42), 0.35);

        this.starCoreUniforms.uColorCore.value.copy(color);
        this.starCoreUniforms.uColorEdge.value.copy(edgeColor);
        this.starCoronaUniforms.uColor.value.copy(edgeColor);

        const coreScale = Math.max(0.1, this.params.sunSize);
        this.sunCoreLOD?.scale?.setScalar(coreScale);

        const haloRadius = Math.max(coreScale * 1.15, this.params.sunHaloSize);
        this.sunCoronaLOD?.scale?.setScalar(haloRadius);

        this._updateSunLodDistances();
        this._syncActiveSunMeshes();

        const glowStrength = Math.max(0.05, this.params.sunGlowStrength);
        const noiseResolutionScale = Math.max(0.25, Math.min(2.0, this.visualSettings?.noiseResolution ?? 1.0));
        const noiseScale = Math.max(0.2, (this.params.sunNoiseScale || 1.6) * noiseResolutionScale);
        this.starCoreUniforms.uNoiseScale.value = noiseScale;
        this.starCoreUniforms.uNoiseStrength.value = glowStrength * 0.35;
        this.starCoronaUniforms.uNoiseScale.value = noiseScale * 0.75;
        this.starCoronaUniforms.uNoiseStrength.value = glowStrength * 0.45;

        let desiredCount = Math.max(0, Math.round(this.params.sunParticleCount || 0));
        if (this.visualSettings?.particleMax != null) {
          desiredCount = Math.min(desiredCount, Math.max(100, this.visualSettings.particleMax));
        }
        if (desiredCount !== this.params.sunParticleCount) {
            this.params.sunParticleCount = desiredCount;
        }
        if (desiredCount !== this.starParticleState.count) {
          this._rebuildStarParticles(desiredCount);
        } else if (this.starParticleState.material) {
            this.starParticleState.material.size = Math.max(0.02, this.params.sunParticleSize || 0.1);
            this.starParticleState.material.color.set(this.params.sunParticleColor || this.params.sunColor || "#ffd27f");
            this.starParticleState.material.needsUpdate = true;
        }

        this.starParticleState.speed = Math.max(0, this.params.sunParticleSpeed || 0.6);
        this.starParticleState.baseLifetime = Math.max(0.5, this.params.sunParticleLifetime || 3.5);
        this.starParticleState.color = this.params.sunParticleColor || this.params.sunColor || "#ffd27f";

        this.sunPulsePhase = 0;
    }

    _resetBlackHoleState() {
        this.blackHoleState.lastCoreSize = null;
        this.blackHoleState.lastDiskRadius = null;
        this.blackHoleState.lastDiskThickness = null;
        this.blackHoleState.lastDiskIntensity = null;
        this.blackHoleState.lastDiskTilt = null;
        this.blackHoleState.lastDiskYaw = null;
        this.blackHoleState.lastDiskNoiseScale = null;
        this.blackHoleState.lastDiskNoiseStrength = null;
        this.blackHoleState.lastHaloRadius = null;
        this.blackHoleState.lastHaloAngle = null;
        this.blackHoleState.lastHaloThickness = null;
        this.blackHoleState.lastHaloIntensity = null;
        this.blackHoleState.lastHaloNoiseScale = null;
        this.blackHoleState.lastHaloNoiseStrength = null;
        this.blackHoleState.baseTwist = 0;
        this.blackHoleState.spinAngle = 0;
        this.blackHoleState.lastColor.setRGB(0, 0, 0);
        if (this.blackHoleOrientationGroup) {
            this.blackHoleOrientationGroup.rotation.set(0, 0, 0);
        }
        if (this.blackHoleSpinGroup) {
            this.blackHoleSpinGroup.rotation.set(0, 0, 0);
        }
    }

    _updateBlackHole(baseColor) {
        const color = baseColor || new THREE.Color(this.params.sunColor);

        const coreSize = Math.max(0.1, this.params.blackHoleCoreSize || 0.6);
        if (this.blackHoleState.lastCoreSize !== coreSize) {
          this.blackHoleCore.scale.setScalar(coreSize);
          this.blackHoleState.lastCoreSize = coreSize;
        }

        const diskRadius = Math.max(coreSize + 0.05, this.params.blackHoleDiskRadius || coreSize * 3);
        const diskThickness = THREE.MathUtils.clamp(this.params.blackHoleDiskThickness ?? 0.35, 0.05, 0.95);
        const diskInner = THREE.MathUtils.clamp(diskRadius * (1 - diskThickness), coreSize * 1.05, diskRadius - 0.02);
        const diskIntensity = Math.max(0, this.params.blackHoleDiskIntensity ?? 1.5);
        const diskFeather = THREE.MathUtils.clamp(diskRadius * 0.18 * diskThickness, 0.04, diskRadius * 0.45);
        const noiseResolutionScale = Math.max(0.25, Math.min(2.0, this.visualSettings?.noiseResolution ?? 1.0));
        const diskNoiseScale = Math.max(0.01, (this.params.blackHoleDiskNoiseScale ?? 1) * noiseResolutionScale);
        const diskNoiseStrength = Math.max(0, this.params.blackHoleDiskNoiseStrength ?? 0);

        if (this.blackHoleState.lastDiskRadius !== diskRadius) {
          this.blackHoleDisk.scale.setScalar(diskRadius);
          this.blackHoleState.lastDiskRadius = diskRadius;
        }

        this.blackHoleDisk.visible = this.params.blackHoleDiskEnabled !== false;
        const diskStyle = this.params.blackHoleDiskStyle || "Noise"; // Noise | Flat | Texture
        if (diskStyle === "Noise") {
          if (!(this.blackHoleDisk.material && this.blackHoleDisk.material.uniforms)) {
            this.blackHoleDisk.material = new THREE.ShaderMaterial({
              uniforms: THREE.UniformsUtils.clone(this.blackHoleDiskUniforms),
              vertexShader: blackHoleDiskVertexShader,
              fragmentShader: blackHoleDiskFragmentShader,
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide,
              blending: THREE.AdditiveBlending,
              toneMapped: false
            });
          }
          const diskUniforms = this.blackHoleDisk.material.uniforms;
          diskUniforms.uScale.value = diskRadius;
          diskUniforms.uOuterRadius.value = diskRadius;
          diskUniforms.uInnerRadius.value = diskInner;
          diskUniforms.uFeather.value = diskFeather;
          diskUniforms.uIntensity.value = diskIntensity;
          diskUniforms.uNoiseScale.value = diskNoiseScale;
          diskUniforms.uNoiseStrength.value = diskNoiseStrength;
          diskUniforms.uColor.value.copy(color);
          this.blackHoleDisk.material.opacity = 1;
          this.blackHoleDisk.material.needsUpdate = true;
        } else if (diskStyle === "Flat") {
          if (this.blackHoleDiskTexture) try { this.blackHoleDiskTexture.dispose(); } catch {}
          this.blackHoleDiskTexture = generateAnnulusTextureExt({
            innerRatio: THREE.MathUtils.clamp(diskInner / Math.max(0.0001, diskRadius), 0, 0.98),
            color: color,
            opacity: THREE.MathUtils.clamp(diskIntensity, 0, 1),
            noiseScale: 1.0,
            noiseStrength: 0.0,
            seedKey: "bh-disk-flat"
          });
          if (!this.blackHoleDiskBasicMaterial || !this.blackHoleDiskBasicMaterial.isMeshBasicMaterial) {
            this.blackHoleDiskBasicMaterial = new THREE.MeshBasicMaterial({
              color: color.clone(),
              transparent: true,
              opacity: 1,
              alphaMap: this.blackHoleDiskTexture,
              side: THREE.DoubleSide,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              toneMapped: false
            });
          } else {
            this.blackHoleDiskBasicMaterial.color.copy(color);
            this.blackHoleDiskBasicMaterial.opacity = 1;
            this.blackHoleDiskBasicMaterial.alphaMap = this.blackHoleDiskTexture;
            this.blackHoleDiskBasicMaterial.needsUpdate = true;
          }
          this.blackHoleDiskBasicMaterial.map = null;
          this.blackHoleDisk.material = this.blackHoleDiskBasicMaterial;
        } else {
          if (this.blackHoleDiskTexture) this.blackHoleDiskTexture.dispose();
          this.blackHoleDiskTexture = generateAnnulusTextureExt({
            innerRatio: THREE.MathUtils.clamp(diskInner / Math.max(0.0001, diskRadius), 0, 0.98),
            color,
            opacity: THREE.MathUtils.clamp(diskIntensity, 0, 1),
            noiseScale: diskNoiseScale,
            noiseStrength: diskNoiseStrength,
            seedKey: "bh-disk"
          });
          if (!this.blackHoleDiskBasicMaterial || !this.blackHoleDiskBasicMaterial.isMeshBasicMaterial) {
            this.blackHoleDiskBasicMaterial = new THREE.MeshBasicMaterial({
              color: new THREE.Color(0xffffff),
              map: this.blackHoleDiskTexture,
              alphaMap: this.blackHoleDiskTexture,
              transparent: true,
              opacity: 1,
              side: THREE.DoubleSide,
              depthWrite: false
            });
          } else {
            this.blackHoleDiskBasicMaterial.map = this.blackHoleDiskTexture;
            this.blackHoleDiskBasicMaterial.alphaMap = this.blackHoleDiskTexture;
            this.blackHoleDiskBasicMaterial.needsUpdate = true;
          }
          this.blackHoleDisk.material = this.blackHoleDiskBasicMaterial;
        }

        const haloRadius = Math.max(diskRadius * 0.8, this.params.blackHoleHaloRadius || diskRadius * 1.35);
        const haloThickness = THREE.MathUtils.clamp(this.params.blackHoleHaloThickness ?? 0.45, 0.05, 0.95);
        const haloInner = THREE.MathUtils.clamp(haloRadius * (1 - haloThickness), diskRadius * 0.65, haloRadius - 0.02);
        const haloIntensity = Math.max(0, this.params.blackHoleHaloIntensity ?? 0.85);
        const haloFeather = THREE.MathUtils.clamp(haloRadius * 0.22 * haloThickness, 0.06, haloRadius * 0.5);
        const haloNoiseScale = Math.max(0.01, (this.params.blackHoleHaloNoiseScale ?? 1) * noiseResolutionScale);
        const haloNoiseStrength = Math.max(0, this.params.blackHoleHaloNoiseStrength ?? 0);

        this.blackHoleHalo.scale.setScalar(haloRadius);
        this.blackHoleHaloSecondary.scale.setScalar(haloRadius);

        const haloStyle = this.params.blackHoleHaloStyle || "Noise";
        const haloEnabled = this.params.blackHoleHaloEnabled !== false;
        this.blackHoleHalo.visible = haloEnabled;
        this.blackHoleHaloSecondary.visible = haloEnabled;
        if (haloStyle === "Noise") {
          if (!(this.blackHoleHalo.material && this.blackHoleHalo.material.uniforms)) {
            this.blackHoleHalo.material = new THREE.ShaderMaterial({
              uniforms: THREE.UniformsUtils.clone(this.blackHoleHaloUniforms),
              vertexShader: blackHoleDiskVertexShader,
              fragmentShader: blackHoleHaloFragmentShader,
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide,
              blending: THREE.AdditiveBlending,
              toneMapped: false
            });
          }
          if (!(this.blackHoleHaloSecondary.material && this.blackHoleHaloSecondary.material.uniforms)) {
            this.blackHoleHaloSecondary.material = this.blackHoleHalo.material.clone();
          }
          [this.blackHoleHalo.material, this.blackHoleHaloSecondary.material].forEach((material) => {
            material.uniforms.uScale.value = haloRadius;
            material.uniforms.uOuterRadius.value = haloRadius;
            material.uniforms.uInnerRadius.value = haloInner;
            material.uniforms.uFeather.value = haloFeather;
            material.uniforms.uIntensity.value = haloIntensity;
            material.uniforms.uNoiseScale.value = haloNoiseScale;
            material.uniforms.uNoiseStrength.value = haloNoiseStrength;
            material.uniforms.uColor.value.copy(color);
          });
        } else if (haloStyle === "Flat") {
          if (!this.blackHoleHaloBasicMaterial || !this.blackHoleHaloBasicMaterial.isMeshBasicMaterial) {
            this.blackHoleHaloBasicMaterial = new THREE.MeshBasicMaterial({
              color: color.clone(),
              transparent: true,
              opacity: THREE.MathUtils.clamp(haloIntensity, 0, 1),
              side: THREE.DoubleSide,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              toneMapped: false
            });
            this.blackHoleHaloSecondaryBasicMaterial = this.blackHoleHaloBasicMaterial.clone();
          } else {
            this.blackHoleHaloBasicMaterial.color.copy(color);
            this.blackHoleHaloBasicMaterial.opacity = THREE.MathUtils.clamp(haloIntensity, 0, 1);
            this.blackHoleHaloSecondaryBasicMaterial.color.copy(color);
            this.blackHoleHaloSecondaryBasicMaterial.opacity = THREE.MathUtils.clamp(haloIntensity, 0, 1);
          }
          this.blackHoleHalo.material = this.blackHoleHaloBasicMaterial;
          this.blackHoleHaloSecondary.material = this.blackHoleHaloSecondaryBasicMaterial;
        } else {
          if (this.blackHoleHaloTexture) this.blackHoleHaloTexture.dispose();
          this.blackHoleHaloTexture = generateAnnulusTextureExt({
            innerRatio: THREE.MathUtils.clamp(haloInner / Math.max(0.0001, haloRadius), 0, 0.98),
            color,
            opacity: THREE.MathUtils.clamp(haloIntensity, 0, 1),
            noiseScale: haloNoiseScale,
            noiseStrength: haloNoiseStrength,
            seedKey: "bh-halo"
          });
          const matTex = new THREE.MeshBasicMaterial({
            color: new THREE.Color(color),
            map: this.blackHoleHaloTexture,
            alphaMap: this.blackHoleHaloTexture,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false
          });
          this.blackHoleHalo.material = matTex;
          this.blackHoleHaloSecondary.material = matTex.clone();
        }

        const haloAngle = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(this.params.blackHoleHaloAngle ?? 68, 0, 170));
        this.blackHoleHalo.rotation.set(haloAngle, Math.PI / 2, (this.blackHoleState.haloSpinAngle || 0));
        this.blackHoleHaloSecondary.rotation.set(-haloAngle, -Math.PI / 2, -(this.blackHoleState.haloSpinAngle || 0));

        const diskTilt = THREE.MathUtils.degToRad(this.params.blackHoleDiskTilt ?? 0);
        const diskYaw = THREE.MathUtils.degToRad(this.params.blackHoleDiskYaw ?? 0);
        if (this.blackHoleState.lastDiskTilt !== diskTilt || this.blackHoleState.lastDiskYaw !== diskYaw) {
          const orientationEuler = new THREE.Euler(diskTilt, diskYaw, 0, "ZYX");
          this.blackHoleOrientationGroup.setRotationFromEuler(orientationEuler);
          this.blackHoleState.lastDiskTilt = diskTilt;
          this.blackHoleState.lastDiskYaw = diskYaw;
        }

        const baseTwist = THREE.MathUtils.degToRad(this.params.blackHoleDiskTwist ?? 0);
        if (this.blackHoleState.baseTwist !== baseTwist) {
          this.blackHoleState.baseTwist = baseTwist;
        }

        this.blackHoleState.lastDiskThickness = diskThickness;
        this.blackHoleState.lastDiskIntensity = diskIntensity;
        this.blackHoleState.lastDiskNoiseScale = diskNoiseScale;
        this.blackHoleState.lastDiskNoiseStrength = diskNoiseStrength;
        this.blackHoleState.lastHaloRadius = haloRadius;
        this.blackHoleState.lastHaloThickness = haloThickness;
        this.blackHoleState.lastHaloIntensity = haloIntensity;
        this.blackHoleState.lastHaloAngle = haloAngle;
        this.blackHoleState.lastHaloNoiseScale = haloNoiseScale;
        this.blackHoleState.lastHaloNoiseStrength = haloNoiseStrength;
        this.blackHoleState.lastColor.copy(color);

        this._applyBlackHoleSpinRotation();
    }

    _applyBlackHoleSpinRotation() {
        if (!this.blackHoleDisk) return;
        this.blackHoleDisk.rotation.z = (this.blackHoleState.baseTwist || 0) + (this.blackHoleState.spinAngle || 0);
    }

    _applyBlackHoleHaloSpinRotation() {
        if (!this.blackHoleHalo || !this.blackHoleHaloSecondary) return;
        this.blackHoleHalo.rotation.z = (this.blackHoleState.haloSpinAngle || 0);
        this.blackHoleHaloSecondary.rotation.z = -(this.blackHoleState.haloSpinAngle || 0);
    }

    _disposeStarParticles() {
        if (this.starParticleState.points) {
            this.sunGroup.remove(this.starParticleState.points);
            if (this.starParticleState.geometry) this.starParticleState.geometry.dispose();
            if (this.starParticleState.material) this.starParticleState.material.dispose();
            if (this.starParticleState.texture) this.starParticleState.texture.dispose();
        }
        this.starParticleState = {
            points: null,
            geometry: null,
            material: null,
            texture: null,
            positions: null,
            velocities: null,
            life: null,
            maxLife: null,
            rng: null,
            count: 0,
            speed: Math.max(0, this.params.sunParticleSpeed || 0.6),
            baseLifetime: Math.max(0.5, this.params.sunParticleLifetime || 3.5),
            color: this.params.sunParticleColor || this.params.sunColor || "#ffd27f"
        };
    }

    _randomUnitVector(rng) {
        const theta = rng.next() * Math.PI * 2;
        const u = rng.next() * 2 - 1;
        const s = Math.sqrt(Math.max(1e-6, 1 - u * u));
        return { x: s * Math.cos(theta), y: u, z: s * Math.sin(theta) };
    }

    _respawnStarParticle(index, rng, randomizeLife = false) {
        if (!this.starParticleState.positions || !this.starParticleState.velocities || !this.starParticleState.life || !this.starParticleState.maxLife) return;
        const dir = this._randomUnitVector(rng);
        const radius = Math.max(0.05, this.params.sunSize || 1) * (0.25 + rng.next() * 0.45);
        const i3 = index * 3;
        this.starParticleState.positions[i3 + 0] = dir.x * radius;
        this.starParticleState.positions[i3 + 1] = dir.y * radius;
        this.starParticleState.positions[i3 + 2] = dir.z * radius;

        let tx = -dir.z;
        let ty = 0;
        let tz = dir.x;
        let len = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (len < 1e-5) {
          tx = 0;
          ty = dir.z;
          tz = -dir.y;
          len = Math.sqrt(tx * tx + ty * ty + tz * tz);
        }
        const invLen = len > 1e-5 ? 1 / len : 1;
        tx *= invLen;
        ty *= invLen;
        tz *= invLen;

        const radialSpeed = 0.6 + rng.next() * 0.9;
        const tangentScale = (rng.next() - 0.5) * 0.35;
        this.starParticleState.velocities[i3 + 0] = dir.x * radialSpeed + tx * tangentScale;
        this.starParticleState.velocities[i3 + 1] = dir.y * radialSpeed + ty * tangentScale;
        this.starParticleState.velocities[i3 + 2] = dir.z * radialSpeed + tz * tangentScale;

        const baseLife = this.starParticleState.baseLifetime ?? Math.max(0.5, this.params.sunParticleLifetime || 3.5);
        this.starParticleState.life[index] = randomizeLife ? rng.next() * baseLife * 0.3 : 0;
        this.starParticleState.maxLife[index] = baseLife * (0.6 + rng.next() * 0.6);
    }

    _rebuildStarParticles(desiredCount) {
        this._disposeStarParticles();
        if (desiredCount <= 0) {
            return;
        }

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(desiredCount * 3);
        const velocities = new Float32Array(desiredCount * 3);
        const life = new Float32Array(desiredCount);
        const maxLife = new Float32Array(desiredCount);
        const rng = new SeededRNG(`${this.params.seed || "star"}-particles-${desiredCount}`);

        this.starParticleState.positions = positions;
        this.starParticleState.velocities = velocities;
        this.starParticleState.life = life;
        this.starParticleState.maxLife = maxLife;
        this.starParticleState.count = desiredCount;
        this.starParticleState.rng = rng;
        this.starParticleState.speed = Math.max(0, this.params.sunParticleSpeed || 0.6);
        this.starParticleState.baseLifetime = Math.max(0.5, this.params.sunParticleLifetime || 3.5);
        this.starParticleState.color = this.params.sunParticleColor || this.params.sunColor || "#ffd27f";

        for (let i = 0; i < desiredCount; i += 1) {
          this._respawnStarParticle(i, rng, true);
        }

        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const texture = createSunTextureExt({ inner: 0.0, outer: 0.6, innerAlpha: 1, outerAlpha: 0, resolution: this.visualSettings?.noiseResolution ?? 1.0 });
        const material = new THREE.PointsMaterial({
          size: Math.max(0.02, this.params.sunParticleSize || 0.1),
          map: texture,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color(this.params.sunParticleColor || this.params.sunColor || "#ffd27f"),
          sizeAttenuation: true
        });

        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        this.sunGroup.add(points);

        this.starParticleState.points = points;
        this.starParticleState.geometry = geometry;
        this.starParticleState.material = material;
        this.starParticleState.texture = texture;
    }

    _updateStarParticles(dt) {
        if (!this.starParticleState.points || !this.starParticleState.positions) return;
        const count = this.starParticleState.count;
        if (count <= 0) return;

        const positions = this.starParticleState.positions;
        const velocities = this.starParticleState.velocities;
        const life = this.starParticleState.life;
        const maxLife = this.starParticleState.maxLife;
        const rng = this.starParticleState.rng || new SeededRNG(`${this.params.seed || "star"}-respawn`);
        this.starParticleState.rng = rng;
        const speed = this.starParticleState.speed ?? 0.6;
        const baseLifetime = this.starParticleState.baseLifetime ?? Math.max(0.5, this.params.sunParticleLifetime || 3.5);

        let needsUpdate = false;
        for (let i = 0; i < count; i += 1) {
          life[i] += dt;
          if (life[i] >= maxLife[i]) {
            this._respawnStarParticle(i, rng, false);
            maxLife[i] = baseLifetime * (0.6 + rng.next() * 0.6);
            life[i] = rng.next() * baseLifetime * 0.1;
          }

          const idx = i * 3;
          positions[idx + 0] += velocities[idx + 0] * speed * dt;
          positions[idx + 1] += velocities[idx + 1] * speed * dt;
          positions[idx + 2] += velocities[idx + 2] * speed * dt;
          needsUpdate = true;
        }

        if (needsUpdate && this.starParticleState.geometry) {
            this.starParticleState.geometry.attributes.position.needsUpdate = true;
        }
    }

    getGravityParameter() {
        const size = Math.max(0.1, this.params.sunSize || 1);
        const intensity = Math.max(0.1, this.params.sunIntensity || 1);
        const baseMu = Math.pow(size, 3) * intensity * 12;
        if (this.params.sunVariant === "Black Hole") {
            return baseMu * 25;
        }
        return baseMu;
    }
}

