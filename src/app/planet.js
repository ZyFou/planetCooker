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

const PLANET_SURFACE_LOD_ORDER = [
    "mega", "megaUltra", "ultra", "ultraHigh", 
    "highPlus", "high", "highMed", 
    "mediumHigh", "medium", "mediumMed", 
    "medLow", "lowHigh", "low", 
    "lowMed", "microHigh", "micro", "microLow"
];

// LOD Transition Manager for smooth transitions
class LODTransitionManager {
    constructor() {
        this.currentLOD = 'medium';
        this.targetLOD = 'medium';
        this.transitionProgress = 1.0;
        this.transitionSpeed = 0.02; // Adjust for faster/slower transitions
        this.isTransitioning = false;
        this.transitionStartTime = 0;
        this.transitionDuration = 1000; // milliseconds
    }

    // Smooth interpolation between two LOD configs
    interpolateLODConfig(config1, config2, t) {
        const smoothT = this.easeInOutCubic(t);
        return {
            detailOffset: THREE.MathUtils.lerp(config1.detailOffset, config2.detailOffset, smoothT),
            rockDetailMultiplier: THREE.MathUtils.lerp(config1.rockDetailMultiplier, config2.rockDetailMultiplier, smoothT),
            rockDetailMin: Math.round(THREE.MathUtils.lerp(config1.rockDetailMin, config2.rockDetailMin, smoothT)),
            distanceMultiplier: THREE.MathUtils.lerp(config1.distanceMultiplier, config2.distanceMultiplier, smoothT),
            gasSegmentScale: THREE.MathUtils.lerp(config1.gasSegmentScale, config2.gasSegmentScale, smoothT),
            textureScale: THREE.MathUtils.lerp(config1.textureScale, config2.textureScale, smoothT)
        };
    }

    // Smooth easing function for natural transitions
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Start transition to new LOD level
    startTransition(targetLOD) {
        if (targetLOD === this.currentLOD && this.transitionProgress >= 1.0) {
            return; // Already at target
        }
        
        this.targetLOD = targetLOD;
        this.isTransitioning = true;
        this.transitionStartTime = performance.now();
        this.transitionProgress = 0.0;
    }

    // Update transition progress
    updateTransition() {
        if (!this.isTransitioning) return false;

        const elapsed = performance.now() - this.transitionStartTime;
        this.transitionProgress = Math.min(elapsed / this.transitionDuration, 1.0);

        if (this.transitionProgress >= 1.0) {
            this.currentLOD = this.targetLOD;
            this.isTransitioning = false;
            this.transitionProgress = 1.0;
            return true; // Transition complete
        }

        return false; // Still transitioning
    }

    // Get current interpolated LOD config
    getCurrentLODConfig() {
        if (!this.isTransitioning || this.transitionProgress >= 1.0) {
            return PLANET_SURFACE_LOD_CONFIG[this.currentLOD];
        }

        const currentConfig = PLANET_SURFACE_LOD_CONFIG[this.currentLOD];
        const targetConfig = PLANET_SURFACE_LOD_CONFIG[this.targetLOD];
        
        return this.interpolateLODConfig(currentConfig, targetConfig, this.transitionProgress);
    }

    // Get current LOD level name (for debugging)
    getCurrentLODLevel() {
        return this.isTransitioning ? `${this.currentLOD}→${this.targetLOD}` : this.currentLOD;
    }
}
// Add "intersteps" between each main LOD for finer control
const PLANET_SURFACE_LOD_CONFIG = {
    // Ultra High Quality (100% detail)

    mega:      { detailOffset: 4.0,   rockDetailMultiplier: 2.5,  rockDetailMin: 15, distanceMultiplier: 0.5,  gasSegmentScale: 2.8,  textureScale: 2.5 },
    
    // Very High Quality (90% detail)
    megaUltra: { detailOffset: 3.5,   rockDetailMultiplier: 2.35, rockDetailMin: 13, distanceMultiplier: 0.75, gasSegmentScale: 2.65, textureScale: 2.35 },
    ultra:     { detailOffset: 3.0,   rockDetailMultiplier: 2.2,  rockDetailMin: 12, distanceMultiplier: 1.0,  gasSegmentScale: 2.5,  textureScale: 2.2 },
    ultraHigh: { detailOffset: 2.5,   rockDetailMultiplier: 2.05, rockDetailMin: 11, distanceMultiplier: 1.5,  gasSegmentScale: 2.35, textureScale: 2.05 },
    
    // High Quality (80% detail)
    highPlus:  { detailOffset: 2.0,   rockDetailMultiplier: 1.9,  rockDetailMin: 10, distanceMultiplier: 2.0,  gasSegmentScale: 2.2,  textureScale: 1.9 },
    high:      { detailOffset: 1.5,   rockDetailMultiplier: 1.75, rockDetailMin: 9,  distanceMultiplier: 3.0,  gasSegmentScale: 2.05, textureScale: 1.75 },
    highMed:   { detailOffset: 1.0,   rockDetailMultiplier: 1.6,  rockDetailMin: 8,  distanceMultiplier: 4.0,  gasSegmentScale: 1.9,  textureScale: 1.6 },
    
    // Medium-High Quality (70% detail)
    mediumHigh:{ detailOffset: 0.5,   rockDetailMultiplier: 1.45, rockDetailMin: 7,  distanceMultiplier: 6.0,  gasSegmentScale: 1.75, textureScale: 1.45 },
    medium:    { detailOffset: 0.0,   rockDetailMultiplier: 1.3,  rockDetailMin: 6,  distanceMultiplier: 8.0,  gasSegmentScale: 1.6,  textureScale: 1.3 },
    mediumMed: { detailOffset: -0.5,  rockDetailMultiplier: 1.15, rockDetailMin: 5,  distanceMultiplier: 10.0, gasSegmentScale: 1.45, textureScale: 1.15 },
    
    // Medium Quality (60% detail)
    medLow:    { detailOffset: -1.0,  rockDetailMultiplier: 1.0,  rockDetailMin: 4,  distanceMultiplier: 12.0, gasSegmentScale: 1.3,  textureScale: 1.0 },
    lowHigh:   { detailOffset: -1.5,  rockDetailMultiplier: 0.85, rockDetailMin: 3,  distanceMultiplier: 16.0, gasSegmentScale: 1.15, textureScale: 0.85 },
    low:       { detailOffset: -2.0,  rockDetailMultiplier: 0.7,  rockDetailMin: 2,  distanceMultiplier: 20.0, gasSegmentScale: 1.0,  textureScale: 0.7 },
    
    // Low Quality (50% detail)
    lowMed:    { detailOffset: -2.5,  rockDetailMultiplier: 0.55, rockDetailMin: 1,  distanceMultiplier: 24.0, gasSegmentScale: 0.85, textureScale: 0.55 },
    microHigh: { detailOffset: -3.0,  rockDetailMultiplier: 0.4,  rockDetailMin: 1,  distanceMultiplier: 28.0, gasSegmentScale: 0.7,  textureScale: 0.4 },
    micro:     { detailOffset: -3.5,  rockDetailMultiplier: 0.25, rockDetailMin: 1,  distanceMultiplier: 32.0, gasSegmentScale: 0.55, textureScale: 0.25 },
    
    // Ultra Low Quality (40% detail)
    microLow:  { detailOffset: -4.0,  rockDetailMultiplier: 0.1,  rockDetailMin: 1,  distanceMultiplier: 36.0, gasSegmentScale: 0.4,  textureScale: 0.1 }
};

export class Planet {
    constructor(scene, params, moonSettings, guiControllers, visualSettings, sun) {
        this.scene = scene;
        this.params = params;
        this.moonSettings = moonSettings;
        this.guiControllers = guiControllers;
        this.visualSettings = visualSettings;
        this.sun = sun;

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
        this.cloudTextureDirty = true;
        this.foamTexture = null;

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
        
        // Initialize LOD transition manager for smooth transitions
        this.lodTransitionManager = new LODTransitionManager();
        this.smoothLODTransitionsEnabled = true; // Enable by default

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
        if (this.surfaceLOD) {
            this.surfaceLOD.addLevel(mesh, 0);
        }
        return mesh;
    }

    _updateSurfaceLodDistances() {
        if (!this.surfaceLOD || !this.surfaceLOD.levels || !this.surfaceLOD.levels.length) return;
        const radius = Math.max(0.1, this.params.radius || 1);
        const resolutionScale = Math.max(0.5, Math.min(1.6, this.visualSettings?.noiseResolution ?? 1.0));
        
        // Update transition manager
        this.lodTransitionManager.updateTransition();
        
        PLANET_SURFACE_LOD_ORDER.forEach((levelKey, index) => {
            const level = this.surfaceLOD.levels[index];
            if (!level) return;
            if (index === 0) {
                level.distance = 0;
                return;
            }
            
            // Use the specific config for this LOD level
            const config = PLANET_SURFACE_LOD_CONFIG[levelKey] || PLANET_SURFACE_LOD_CONFIG.medium;
            const multiplier = config.distanceMultiplier ?? (index * 8);
            level.distance = radius * multiplier * resolutionScale;
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

    // Start smooth LOD transition to target level
    startLODTransition(targetLOD) {
        if (PLANET_SURFACE_LOD_ORDER.includes(targetLOD)) {
            this.lodTransitionManager.startTransition(targetLOD);
            console.log(`Starting smooth LOD transition to: ${targetLOD}`);
        }
    }

    // Get current LOD transition status
    getLODTransitionStatus() {
        return {
            current: this.lodTransitionManager.currentLOD,
            target: this.lodTransitionManager.targetLOD,
            progress: this.lodTransitionManager.transitionProgress,
            isTransitioning: this.lodTransitionManager.isTransitioning
        };
    }

    // Auto-adjust LOD based on distance and performance
    autoAdjustLOD(cameraPosition) {
        if (!cameraPosition) return;
        
        const planetPosition = this.spinGroup.position;
        const distance = cameraPosition.distanceTo(planetPosition);
        const radius = Math.max(0.1, this.params.radius || 1);
        const normalizedDistance = distance / (radius * 10); // Normalize by planet size
        
        // Determine target LOD based on distance
        let targetLOD = 'medium'; // default
        
        if (normalizedDistance < 0.5) {
            targetLOD = 'mega';
        } else if (normalizedDistance < 1.0) {
            targetLOD = 'ultra';
        } else if (normalizedDistance < 2.0) {
            targetLOD = 'high';
        } else if (normalizedDistance < 4.0) {
            targetLOD = 'medium';
        } else if (normalizedDistance < 8.0) {
            targetLOD = 'low';
        } else {
            targetLOD = 'micro';
        }
        
        // Start transition if target is different from current
        if (targetLOD !== this.lodTransitionManager.currentLOD && 
            !this.lodTransitionManager.isTransitioning) {
            this.startLODTransition(targetLOD);
        }
    }

    // Apply smooth LOD transitions by adjusting material properties
    _applySmoothLODTransitions() {
        if (!this.smoothLODTransitionsEnabled || !this.lodTransitionManager.isTransitioning) return;
        
        const currentConfig = this.lodTransitionManager.getCurrentLODConfig();
        const targetConfig = PLANET_SURFACE_LOD_CONFIG[this.lodTransitionManager.targetLOD];
        
        if (!targetConfig) return;
        
        // Apply smooth transitions to material properties
        // This could include opacity, roughness, or other visual properties
        // For now, we'll use the transition progress to blend visual effects
        
        const progress = this.lodTransitionManager.transitionProgress;
        
        // Example: Smoothly adjust material opacity during transitions
        if (this.planetMesh && this.planetMesh.material) {
            // You can add smooth material property transitions here
            // this.planetMesh.material.opacity = THREE.MathUtils.lerp(1.0, 0.8, progress);
        }
    }

    // Enable/disable smooth LOD transitions
    setSmoothLODTransitions(enabled) {
        this.smoothLODTransitionsEnabled = enabled;
        if (!enabled) {
            // Reset transition manager to current state
            this.lodTransitionManager.isTransitioning = false;
            this.lodTransitionManager.transitionProgress = 1.0;
        }
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

    _updateMegaLODLighting() {
        const megaMesh = this.surfaceLODLevels?.mega;
        if (!megaMesh?.material?.uniforms) return;

        // Calculate light direction from sun to planet
        const sunDirection = new THREE.Vector3();
        if (this.sun?.sunGroup) {
            sunDirection.subVectors(this.sun.sunGroup.position, this.planetRoot.position).normalize();
        } else {
            sunDirection.set(1, 0, 0); // Default direction
        }

        // Update lighting uniforms
        megaMesh.material.uniforms.lightDirection.value.copy(sunDirection);
        megaMesh.material.uniforms.lightColor.value.set(this.params.sunColor || 0xffffff);
        megaMesh.material.uniforms.lightIntensity.value = this.params.sunIntensity || 1.0;

        // Update ambient light (matches scene ambient light: 0x6f87b6, 0.35)
        megaMesh.material.uniforms.ambientLightColor.value.setHex(0x6f87b6);
        megaMesh.material.uniforms.ambientLightIntensity.value = 0.35;
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
                const fx = profile.warpFrequency;
                const offset = profile.warpOffset;
                warpVec.set(
                    warpNoiseX(normal.x * fx + offset.x, normal.y * fx + offset.y, normal.z * fx + offset.z),
                    warpNoiseY(normal.x * fx + offset.y, normal.y * fx + offset.z, normal.z * fx + offset.x),
                    warpNoiseZ(normal.x * fx + offset.z, normal.y * fx + offset.x, normal.z * fx + offset.y)
                );
                sampleDir.addScaledVector(warpVec, warpAmount).normalize();
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

        } else {
          this._disposeGasLODResources();

          const rng = new SeededRNG(this.params.seed);
          const noiseRng = rng.fork();

          const baseNoise = createNoise3D(() => noiseRng.next());
          const ridgeNoise = createNoise3D(() => noiseRng.next());
          const warpNoiseX = createNoise3D(() => noiseRng.next());
          const warpNoiseY = createNoise3D(() => noiseRng.next());
          const warpNoiseZ = createNoise3D(() => noiseRng.next());
          const craterNoise = createNoise3D(() => noiseRng.next());

          const offsets = [];
          for (let i = 0; i < this.params.noiseLayers; i += 1) {
            const fork = noiseRng.fork();
            offsets.push(new THREE.Vector3(
              fork.nextFloat(-128, 128),
              fork.nextFloat(-128, 128),
              fork.nextFloat(-128, 128)
            ));
          }

          const profile = this.deriveTerrainProfile(this.params.seed);

          const generators = { baseNoise, ridgeNoise, warpNoiseX, warpNoiseY, warpNoiseZ, craterNoise };
          const geometryByLevel = {};
          PLANET_SURFACE_LOD_ORDER.forEach((levelKey) => {
            const detail = this._getSurfaceDetailForLevel(levelKey);
            geometryByLevel[levelKey] = this._buildRockyGeometry(detail, generators, profile, offsets);
            this._replaceSurfaceGeometry(levelKey, geometryByLevel[levelKey]);
          });

          const texWidth = 256;
          const texHeight = 128;
          const splatData = new Uint8Array(texWidth * texHeight);
          const dir = new THREE.Vector3();
          for (let y = 0; y < texHeight; y++) {
              const v = y / (texHeight - 1);
              const lat = (v - 0.5) * Math.PI;
              for (let x = 0; x < texWidth; x++) {
                  const u = x / (texWidth - 1);
                  const lon = (u - 0.5) * Math.PI * 2;
                  dir.set(Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat)).normalize();

                  let elevation = 0;
                  let amplitude = 1;
                  let frequency = this.params.noiseFrequency;
                  let totalAmplitude = 0;
                  for (let l = 0; l < this.params.noiseLayers; l++) {
                      const offset = offsets[l];
                      const sx = dir.x * frequency + offset.x;
                      const sy = dir.y * frequency + offset.y;
                      const sz = dir.z * frequency + offset.z;
                      elevation += baseNoise(sx, sy, sz) * amplitude;
                      totalAmplitude += amplitude;
                      amplitude *= this.params.persistence;
                      frequency *= this.params.lacunarity;
                  }
                  if (totalAmplitude > 0) {
                      elevation /= totalAmplitude;
                  }
                  const normalized = elevation * 0.5 + 0.5;
                  splatData[y * texWidth + x] = Math.floor(THREE.MathUtils.smoothstep(normalized, 0.4, 0.6) * 255);
              }
          }
          const splatTexture = new THREE.DataTexture(splatData, texWidth, texHeight, THREE.RedFormat, THREE.UnsignedByteType);
          splatTexture.needsUpdate = true;

          PLANET_SURFACE_LOD_ORDER.forEach((levelKey) => {
            if (levelKey === 'mega') {
                const rockTexture = generateRockTexture({ seed: this.params.seed });
                const sandTexture = generateSandTexture({ seed: this.params.seed });

                // Use MeshStandardMaterial for proper shadow support
                const material = new THREE.MeshStandardMaterial({
                    vertexColors: true,
                    roughness: 0.82,
                    metalness: 0.12,
                    flatShading: false
                });
                this._assignSurfaceMaterial(levelKey, material);
            } else {
                this._assignSurfaceMaterial(levelKey, this.planetMaterial);
            }
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
          }
        }

        this._updateSurfaceLodDistances();
        
        // Apply smooth LOD transitions
        this._applySmoothLODTransitions();

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

            const iceNoise = createNoise3D(() => new SeededRNG(this.params.seed).next());
            const noiseValue = iceNoise(
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

        this.cloudTextureDirty = true;
        if (this.cloudTextureDirty || !this.cloudTexture) {
          this.regenerateCloudTexture();
        }
        if (this.cloudTexture) {
            this.cloudTexture.needsUpdate = true;
            this.cloudsMaterial.map = this.cloudTexture;
            this.cloudsMaterial.alphaMap = this.cloudTexture;
            this.cloudsMaterial.needsUpdate = true;
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
        this.cloudTexture = tex;
        this.cloudTextureDirty = false;
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
}


