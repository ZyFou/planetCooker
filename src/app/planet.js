import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import { SeededRNG } from "./utils.js";
import * as PHYSICS from "./planet/physics.js";
import { generateRingTexture as generateRingTextureExt, generateAnnulusTexture as generateAnnulusTextureExt, generateGasGiantTexture as generateGasGiantTextureExt } from "./textures.js";
import { blackHoleDiskUniforms, blackHoleDiskVertexShader, blackHoleDiskFragmentShader } from "./sun.js";
import { LODManager } from "./LODManager.js";

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

export class Planet {
    constructor(scene, camera, params, moonSettings, guiControllers, visualSettings, sun) {
        this.scene = scene;
        this.camera = camera;
        this.params = params;
        this.moonSettings = moonSettings;
        this.guiControllers = guiControllers;
        this.visualSettings = visualSettings;
        this.sun = sun;

        this.lodManager = new LODManager(this.camera, this.params);

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

        this.previousPlanetMesh = null;
        this.transitionProgress = 1;

        this._createPlanetObjects();
        this.rebuildPlanet();
    }

    _createPlanetObjects() {
        this.planetMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.82,
            metalness: 0.12,
            flatShading: false,
            transparent: true,
            opacity: 1.0
        });

        this.planetMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.fade = { value: 1.0 };
            shader.fragmentShader = 'uniform float fade;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                '#include <dithering_fragment>\n    gl_FragColor.a *= fade;'
            );
        };

        const initialGeometry = new THREE.IcosahedronGeometry(1, 5);
        this.planetMesh = new THREE.Mesh(initialGeometry, this.planetMaterial);
        this.planetMesh.castShadow = true;
        this.planetMesh.receiveShadow = true;
        this.spinGroup.add(this.planetMesh);

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
    }

    update(delta, simulationDelta) {
        this.lodManager.update(this.planetRoot);
        const lodParams = this.lodManager.lodParams;

        if (this.lodManager.subdivisionChanged) {
            if (this.previousPlanetMesh) {
                this.spinGroup.remove(this.previousPlanetMesh);
                this.previousPlanetMesh.geometry.dispose();
                this.previousPlanetMesh.material.dispose();
            }
            this.previousPlanetMesh = this.planetMesh;

            const rng = new SeededRNG(lodParams.seed);
            const noiseRng = rng.fork();
            const noiseFunctions = {
                base: createNoise3D(() => noiseRng.next()),
                ridge: createNoise3D(() => noiseRng.next()),
                warpX: createNoise3D(() => noiseRng.next()),
                warpY: createNoise3D(() => noiseRng.next()),
                warpZ: createNoise3D(() => noiseRng.next()),
                crater: createNoise3D(() => noiseRng.next()),
            };
            const profile = this.deriveTerrainProfile(lodParams.seed);

            const geometry = this._createPlanetGeometry(lodParams, noiseFunctions, profile);
            const newMaterial = this.planetMaterial.clone();
            newMaterial.onBeforeCompile = this.planetMaterial.onBeforeCompile;

            this.planetMesh = new THREE.Mesh(geometry, newMaterial);
            this.planetMesh.castShadow = true;
            this.planetMesh.receiveShadow = true;
            this.spinGroup.add(this.planetMesh);

            this.transitionProgress = 0;
        }

        if (this.transitionProgress < 1) {
            this.transitionProgress = Math.min(1, this.transitionProgress + delta / 0.5); // 0.5s transition
            if (this.planetMesh.material.uniforms && this.planetMesh.material.uniforms.fade) {
                this.planetMesh.material.uniforms.fade.value = this.transitionProgress;
            }
            if (this.previousPlanetMesh && this.previousPlanetMesh.material.uniforms && this.previousPlanetMesh.material.uniforms.fade) {
                this.previousPlanetMesh.material.uniforms.fade.value = 1 - this.transitionProgress;
            }

            if (this.transitionProgress === 1) {
                if (this.previousPlanetMesh) {
                    this.spinGroup.remove(this.previousPlanetMesh);
                    this.previousPlanetMesh.geometry.dispose();
                    this.previousPlanetMesh.material.dispose();
                    this.previousPlanetMesh = null;
                }
            }
        }

        const rotationDelta = lodParams.rotationSpeed * simulationDelta * Math.PI * 2;
        this.spinGroup.rotation.y += rotationDelta;
        this.cloudsMesh.rotation.y += rotationDelta * 1.12;
        this.cloudsMesh.rotation.y += delta * lodParams.cloudDriftSpeed;

        if (lodParams.ringEnabled && this.ringMeshes && this.ringMeshes.length) {
            for (let i = 0; i < this.ringMeshes.length; i += 1) {
                const mesh = this.ringMeshes[i];
                if (!mesh) continue;
                const speed = (mesh.userData?.spinSpeed ?? lodParams.ringSpinSpeed ?? 0);
                if (Math.abs(speed) > 1e-4) {
                    mesh.rotation.z += delta * speed;
                }
            }
        }

        const gravityFactor = Math.sqrt(lodParams.gravity / 9.81);
        if (lodParams.physicsEnabled) {
            PHYSICS.stepMoonPhysics(simulationDelta, {
                params: lodParams,
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
            const planetMass = PHYSICS.getPlanetMass(lodParams);
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
    }

    rebuildPlanet() {
        const lodParams = this.lodManager.lodParams;
        this.updatePalette();

        if (lodParams.planetType === 'gas_giant') {
          this.planetMaterial.vertexColors = false;
          this.planetMaterial.map = this.generateGasGiantTexture(lodParams);
          this.planetMaterial.needsUpdate = true;

          const gasDetailScale = Math.max(0.25, Math.min(2.0, this.visualSettings?.gasResolution ?? 1.0));
          const gasSegments = Math.max(24, Math.round(128 * gasDetailScale));
          const geometry = new THREE.SphereGeometry(lodParams.radius, gasSegments, gasSegments);
          if (this.lodManager.isTransitioning) {
              this.previousPlanetMesh = this.planetMesh;
              const newMaterial = this.planetMaterial.clone();
              newMaterial.onBeforeCompile = this.planetMaterial.onBeforeCompile;
              this.planetMesh = new THREE.Mesh(geometry, newMaterial);
              this.planetMesh.castShadow = true;
              this.planetMesh.receiveShadow = true;
              this.spinGroup.add(this.planetMesh);
          } else {
            this.planetMesh.geometry.dispose();
            this.planetMesh.geometry = geometry;
          }

          this.oceanMesh.visible = false;
          this.foamMesh.visible = false;

        } else {
          this.planetMaterial.vertexColors = true;
          this.planetMaterial.map = null;
          this.planetMaterial.needsUpdate = true;

          const rng = new SeededRNG(lodParams.seed);
          const noiseRng = rng.fork();
          const noiseFunctions = {
                base: createNoise3D(() => noiseRng.next()),
                ridge: createNoise3D(() => noiseRng.next()),
                warpX: createNoise3D(() => noiseRng.next()),
                warpY: createNoise3D(() => noiseRng.next()),
                warpZ: createNoise3D(() => noiseRng.next()),
                crater: createNoise3D(() => noiseRng.next()),
          };
          const profile = this.deriveTerrainProfile(lodParams.seed);

          const offsets = [];
            for (let i = 0; i < lodParams.noiseLayers; i += 1) {
                const fork = new SeededRNG(`${lodParams.seed}-${i}`).fork();
                offsets.push(new THREE.Vector3(
                    fork.nextFloat(-128, 128),
                    fork.nextFloat(-128, 128),
                    fork.nextFloat(-128, 128)
                ));
            }

          const geometry = this._createPlanetGeometry(lodParams, noiseFunctions, profile, offsets);

          if (this.lodManager.isTransitioning) {
              this.previousPlanetMesh = this.planetMesh;
              const newMaterial = this.planetMaterial.clone();
              newMaterial.onBeforeCompile = this.planetMaterial.onBeforeCompile;
              this.planetMesh = new THREE.Mesh(geometry, newMaterial);
              this.planetMesh.castShadow = true;
              this.planetMesh.receiveShadow = true;
              this.spinGroup.add(this.planetMesh);
          } else {
            this.planetMesh.geometry.dispose();
            this.planetMesh.geometry = geometry;
          }

          const oceanVisible = lodParams.oceanLevel > 0.001 && lodParams.noiseAmplitude > 0.0001;
          const oceanScale = lodParams.radius * 1.001;
          const foamScale = lodParams.radius * 1.003;
          this.oceanMesh.visible = oceanVisible;
          this.foamMesh.visible = oceanVisible && lodParams.foamEnabled;
          if (oceanVisible) {
            this.oceanMesh.scale.setScalar(oceanScale);
            this.foamMesh.scale.setScalar(foamScale);
            this.oceanMesh.material.color.set(this.palette.ocean);
            this.foamMesh.material.color.set(this.palette.foam);

            this._createFoamTexture(lodParams, noiseFunctions, profile, offsets);
          }
        }
        const cloudScale = lodParams.radius * (1 + Math.max(0.0, lodParams.cloudHeight || 0.03));
        const atmosphereScale = lodParams.radius * (1.06 + Math.max(0.0, (lodParams.cloudHeight || 0.03)) * 0.8);
        this.cloudsMesh.scale.setScalar(cloudScale);
        this.atmosphereMesh.scale.setScalar(atmosphereScale);

        this.updateCore();
        this.updateRings();
    }

    _createFoamTexture(lodParams, noiseFunctions, profile, offsets) {
        const texWidth = 512;
        const texHeight = 256;
        const data = new Uint8Array(texWidth * texHeight * 4);
        const dir = new THREE.Vector3();
        const warpVecTex = new THREE.Vector3();

        const { base: baseNoise, ridge: ridgeNoise, warpX: warpNoiseX, warpY: warpNoiseY, warpZ: warpNoiseZ, crater: craterNoise } = noiseFunctions;

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

        const shorelineHalfWidth = Math.max(0.002, lodParams.noiseAmplitude * 0.06);

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

                const lodParams = this.lodManager.lodParams;
                let amplitude = 1;
                let frequency = lodParams.noiseFrequency;
                let totalAmplitude = 0;
                let sum = 0;
                let ridgeSum = 0;
                let billowSum = 0;
                for (let layer = 0; layer < lodParams.noiseLayers; layer += 1) {
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
                    amplitude *= lodParams.persistence;
                    frequency *= lodParams.lacunarity;
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

                const displacementHere = (normalized - lodParams.oceanLevel) * lodParams.noiseAmplitude;
                const finalR = lodParams.radius + displacementHere;
                const distFromShore = Math.abs(finalR - lodParams.radius);

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

    _createPlanetGeometry(lodParams, noiseFunctions, profile) {
        const { base: baseNoise, ridge: ridgeNoise, warpX: warpNoiseX, warpY: warpNoiseY, warpZ: warpNoiseZ, crater: craterNoise } = noiseFunctions;

        const offsets = [];
        for (let i = 0; i < lodParams.noiseLayers; i += 1) {
            const fork = new SeededRNG(`${lodParams.seed}-${i}`).fork();
            offsets.push(new THREE.Vector3(
                fork.nextFloat(-128, 128),
                fork.nextFloat(-128, 128),
                fork.nextFloat(-128, 128)
            ));
        }

        const detail = Math.round(lodParams.subdivisions);
        const geometry = new THREE.IcosahedronGeometry(1, detail);
        const positions = geometry.getAttribute("position");
        const colors = new Float32Array(positions.count * 3);
        const vertex = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const sampleDir = new THREE.Vector3();
        const warpVec = new THREE.Vector3();

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

            const lodParams = this.lodManager.lodParams;
            let amplitude = 1;
            let frequency = lodParams.noiseFrequency;
            let totalAmplitude = 0;
            let sum = 0;
            let ridgeSum = 0;
            let billowSum = 0;

            for (let layer = 0; layer < lodParams.noiseLayers; layer += 1) {
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
                amplitude *= lodParams.persistence;
                frequency *= lodParams.lacunarity;
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

            const displacement = (normalized - lodParams.oceanLevel) * lodParams.noiseAmplitude;
            const finalRadius = lodParams.radius + displacement;
            vertex.copy(normal).multiplyScalar(finalRadius);
            positions.setXYZ(i, vertex.x, vertex.y, vertex.z);

            const color = this.sampleColor(normalized, finalRadius, vertex.clone().normalize());
            colors[i * 3 + 0] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        return geometry;
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
        const lodParams = this.lodManager.lodParams;
        let baseColor;
        const scratchColor = new THREE.Color();

        if (elevation <= lodParams.oceanLevel) {
          const oceanT = lodParams.oceanLevel <= 0 ? 0 : THREE.MathUtils.clamp(elevation / Math.max(lodParams.oceanLevel, 1e-6), 0, 1);
          baseColor = this.palette.ocean.clone().lerp(this.palette.shallow, Math.pow(oceanT, 0.65));
        } else {
          const landT = THREE.MathUtils.clamp((elevation - lodParams.oceanLevel) / Math.max(1 - lodParams.oceanLevel, 1e-6), 0, 1);

          if (landT < 0.5) {
            const t = Math.pow(landT / 0.5, 1.1);
            baseColor = this.palette.low.clone().lerp(this.palette.mid, t);
          } else {
            const highT = Math.pow((landT - 0.5) / 0.5, 1.3);
            baseColor = this.palette.mid.clone().lerp(this.palette.high, highT);
          }
        }
        if (lodParams.icePolesEnabled && vertexPosition) {
          const latitude = Math.abs(vertexPosition.y);
          const poleThreshold = lodParams.icePolesCoverage;

          if (latitude > (1 - poleThreshold)) {
            const iceStrength = (latitude - (1 - poleThreshold)) / poleThreshold;

            const iceNoise = createNoise3D(() => new SeededRNG(lodParams.seed).next());
            const noiseValue = iceNoise(
              vertexPosition.x * lodParams.icePolesNoiseScale,
              vertexPosition.y * lodParams.icePolesNoiseScale,
              vertexPosition.z * lodParams.icePolesNoiseScale
            );

            const noiseInfluence = (noiseValue + 1) * 0.5;
            const finalIceStrength = iceStrength * (1 - lodParams.icePolesNoiseStrength) +
                                    iceStrength * noiseInfluence * lodParams.icePolesNoiseStrength;

            baseColor.lerp(this.palette.icePoles, finalIceStrength);
          }
        }

        return scratchColor.copy(baseColor);
    }

    updatePalette() {
        const lodParams = this.lodManager.lodParams;
        this.palette.ocean.set(lodParams.colorOcean);
        this.palette.shallow.set(lodParams.colorShallow);
        this.palette.foam.set(lodParams.colorFoam);
        this.palette.low.set(lodParams.colorLow);
        this.palette.mid.set(lodParams.colorMid);
        this.palette.high.set(lodParams.colorHigh);
        this.palette.core.set(lodParams.colorCore);
        this.palette.atmosphere.set(lodParams.atmosphereColor);
        this.palette.icePoles.set(lodParams.icePolesColor);

        this.atmosphereUniforms.sunColor.value.set(lodParams.sunColor);
        this.atmosphereUniforms.atmosphereColor.value.set(lodParams.atmosphereColor);
    }

    updateCore() {
        const lodParams = this.lodManager.lodParams;
        if (this.coreMesh) {
          const coreScale = lodParams.radius * lodParams.coreSize;
          this.coreMesh.scale.setScalar(coreScale);
          this.coreMesh.material.color.set(lodParams.colorCore);
          this.coreMesh.visible = lodParams.coreEnabled && lodParams.coreVisible;
          this.coreMesh.material.needsUpdate = true;
        }
    }

    updateClouds() {
        const lodParams = this.lodManager.lodParams;
        this.cloudsMaterial.opacity = lodParams.cloudsOpacity;

        this.atmosphereUniforms.atmosphereIntensity.value = lodParams.atmosphereIntensity;
        this.atmosphereUniforms.sunBrightness.value = lodParams.sunIntensity;
        this.atmosphereUniforms.sunColor.value.set(lodParams.sunColor);
        this.atmosphereUniforms.atmosphereColor.value.set(lodParams.atmosphereColor);
        this.atmosphereUniforms.atmosphereFresnelPower.value = lodParams.atmosphereFresnelPower;
        this.atmosphereUniforms.atmosphereRimPower.value = lodParams.atmosphereRimPower;

        const sunDirection = new THREE.Vector3();
        sunDirection.subVectors(this.sun.sunGroup.position, this.planetRoot.position).normalize();
        this.atmosphereUniforms.lightDirection.value.copy(sunDirection);

        this.cloudsMesh.visible = lodParams.cloudsOpacity > 0.001;
        this.atmosphereMesh.visible = lodParams.atmosphereOpacity > 0.001;
        const cloudScale = Math.max(0.1, lodParams.radius * (1 + Math.max(0, lodParams.cloudHeight || 0.03)));
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
        const lodParams = this.lodManager.lodParams;
        const radians = THREE.MathUtils.degToRad(lodParams.axisTilt);
        this.tiltGroup.rotation.z = radians;
        this.moonsGroup.rotation.z = radians;
        this.orbitLinesGroup.rotation.z = radians;
    }

    regenerateCloudTexture() {
        const lodParams = this.lodManager.lodParams;
        const resScale = Math.max(0.25, Math.min(2.0, this.visualSettings?.noiseResolution ?? 1.0));
        const width = Math.max(64, Math.round(1024 * resScale));
        const height = Math.max(32, Math.round(512 * resScale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        const img = ctx.createImageData(width, height);
        const data = img.data;

        const rng = new SeededRNG(`${lodParams.seed || "default"}-clouds`);
        const noise = createNoise3D(() => rng.next());
        const scale = Math.max(0.2, lodParams.cloudNoiseScale || 3.2);
        const density = THREE.MathUtils.clamp(lodParams.cloudDensity ?? 0.5, 0, 1);
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
            const alpha = Math.pow(a, 1.2) * this.lodManager.lodParams.cloudsOpacity;

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

    generateGasGiantTexture(p) {
        return generateGasGiantTextureExt({
          ...p,
          noiseResolution: this.visualSettings?.noiseResolution ?? 1.0,
          gasResolution: this.visualSettings?.gasResolution ?? 1.0
        });
    }

    updateRings() {
        const lodParams = this.lodManager.lodParams;
        if (!this.ringGroup) return;
        if (!lodParams.ringEnabled) {
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

        const angle = THREE.MathUtils.degToRad(lodParams.ringAngle || 0);
        const ringDetailScale = Math.max(0.25, Math.min(1.5, this.visualSettings?.ringDetail ?? 1.0));
        const segments = Math.max(32, Math.round(256 * ringDetailScale));
        const noiseResolutionScale = Math.max(0.25, Math.min(2.0, this.visualSettings?.noiseResolution ?? 1.0));
        const ringDefs = Array.isArray(lodParams.rings) ? lodParams.rings : [];
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
          const inner = Math.max(lodParams.radius * startR, lodParams.radius + 0.02);
          const outer = Math.max(lodParams.radius * endR, inner + 0.02);
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
          mesh.userData.spinSpeed = def.spinSpeed ?? (lodParams.ringSpinSpeed || 0);
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

          if (!this.lodManager.lodParams.physicsEnabled) {
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

          if (!this.lodManager.lodParams.physicsEnabled) {
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

        if (this.lodManager.lodParams.physicsEnabled) {
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
        if (!this.lodManager.lodParams.showOrbitLines) return;
        this.moonsGroup.children.forEach((pivot) => {
          if (!pivot?.userData?.orbit) return;
          if (this.lodManager.lodParams.physicsEnabled && pivot.userData.trajectoryHistory && pivot.userData.trajectoryHistory.length > 1) {
            this.updateTrajectoryLine(pivot);
          } else {
            this.alignOrbitLineWithPivot(pivot);
          }
        });
    }

    updateOrbitLinesVisibility() {
        this.orbitLinesGroup.visible = this.lodManager.lodParams.showOrbitLines;
        if (this.lodManager.lodParams.showOrbitLines) {
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
            params: this.lodManager.lodParams,
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
        const lodParams = this.lodManager.lodParams;
        if (!lodParams.explosionEnabled) return;
        const effectiveStrength = Math.max(0.05, lodParams.explosionStrength) * Math.max(0.1, strength);
        const baseCount = Math.max(10, Math.round(lodParams.explosionParticleBase || 80));
        let count = Math.max(20, Math.floor(baseCount * THREE.MathUtils.clamp(effectiveStrength, 0.2, 4)));
        if (this.visualSettings?.particleMax != null) {
          count = Math.min(count, Math.max(100, this.visualSettings.particleMax));
        }
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        const baseCol = new THREE.Color();
        baseCol.set(lodParams.explosionColor || 0xffaa66);
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
          const speedVariation = THREE.MathUtils.lerp(0.5, 2.0, Math.random()) * (lodParams.explosionSpeedVariation || 1.0);
          const speed = baseSpeed * speedVariation;

          velocities[i * 3 + 0] = dir.x * speed;
          velocities[i * 3 + 1] = dir.y * speed;
          velocities[i * 3 + 2] = dir.z * speed;

          const baseColor = colorVariations[Math.floor(Math.random() * colorVariations.length)];
          const colorVariation = lodParams.explosionColorVariation || 0.5;
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

        const pointTexture = generateAnnulusTextureExt({ inner: 0.0, outer: 0.55, innerAlpha: 1, outerAlpha: 0 });
        const sizeVariation = lodParams.explosionSizeVariation || 1.0;
        const material = new THREE.PointsMaterial({
          size: Math.max(0.1, (lodParams.explosionSize || 0.8) * Math.max(1, effectiveStrength) * sizeVariation),
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
          maxLife: Math.max(0.1, lodParams.explosionLifetime || 1.6),
          damping: THREE.MathUtils.clamp(lodParams.explosionDamping ?? 0.9, 0.4, 1)
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
        if (!this.planetMesh || !this.planetMesh.geometry || !worldPosition) return;
        const geometry = this.planetMesh.geometry;
        const positions = geometry.getAttribute('position');
        if (!positions) return;
        if (positions.setUsage) {
          try { positions.setUsage(THREE.DynamicDrawUsage); } catch {}
        } else if ('usage' in positions) {
          positions.usage = THREE.DynamicDrawUsage;
        }

        const localImpact = this.planetMesh.worldToLocal(worldPosition.clone());
        if (localImpact.lengthSq() === 0) return;
        const centerDir = localImpact.clone().normalize();

        const up = centerDir;
        const tangentLocal = (() => {
          if (!directionWorld || directionWorld.lengthSq() < 1e-8) return null;
          const p1 = this.planetMesh.worldToLocal(worldPosition.clone());
          const p2 = this.planetMesh.worldToLocal(worldPosition.clone().add(directionWorld.clone()));
          const dirLocal = p2.sub(p1).normalize();
          const tangent = dirLocal.sub(up.clone().multiplyScalar(dirLocal.dot(up))).normalize();
          return tangent.lengthSq() > 0.5 ? tangent : null;
        })();
        const bitangentLocal = tangentLocal ? new THREE.Vector3().crossVectors(up, tangentLocal).normalize() : null;

        const craterAngle = THREE.MathUtils.clamp(impactRadius / Math.max(1e-6, this.lodManager.lodParams.radius), 0.01, Math.PI / 2);

        const baseDepth = Math.min(impactRadius * 0.45, (this.lodManager.lodParams.noiseAmplitude || 0.5) * 0.6 + 0.02);
        const depth = THREE.MathUtils.clamp(baseDepth * THREE.MathUtils.clamp(strength, 0.2, 3.5), 0.005, impactRadius);

        const obliq = THREE.MathUtils.clamp(isFinite(obliquity) ? obliquity : 0, 0, Math.PI / 2);
        const elongBase = (this.lodManager.lodParams.impactElongationMul ?? 1.6);
        const elongation = tangentLocal ? (1 + elongBase * (obliq / (Math.PI / 2))) : 1;
        const minorScale = 1 / elongation;

        const arr = positions.array;
        const v = new THREE.Vector3();
        const vDir = new THREE.Vector3();
        const local = new THREE.Vector3();

        for (let i = 0; i < arr.length; i += 3) {
          v.set(arr[i + 0], arr[i + 1], arr[i + 2]);
          const r = v.length();
          if (r <= 0) continue;
          vDir.copy(v).divideScalar(r);
          let ang;
          if (tangentLocal) {
            const du = vDir.dot(tangentLocal);
            const dv = vDir.dot(bitangentLocal);
            const dn = vDir.dot(up);
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
    }
}
