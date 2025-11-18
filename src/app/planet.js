import * as THREE from "three";
import {
    terrainVertexShader,
    terrainFragmentShader,
    gasPlanetVertexShader,
    gasPlanetFragmentShader,
    atmosphereVertexShader,
    atmosphereFragmentShader
} from "./shaders/planetShaders.js";
import { generateRingTexture, generateAnnulusTexture } from "./textures.js";

const ROCKY_NOISE_TYPES = {
    classic: 0,
    ridged: 1,
    billowy: 2,
    warped: 3
};

function resolveRockyNoiseType(value) {
    if (typeof value === 'number') {
        return THREE.MathUtils.clamp(value, 0, 3);
    }
    if (typeof value === 'string') {
        const key = value.toLowerCase();
        if (ROCKY_NOISE_TYPES.hasOwnProperty(key)) {
            return ROCKY_NOISE_TYPES[key];
        }
    }
    return ROCKY_NOISE_TYPES.classic;
}

export class Planet {
    constructor(scene, params, guiControllers) {
        this.scene = scene;
        this.params = params;
        this.guiControllers = guiControllers;

        // Create planet root group
        this.planetRoot = new THREE.Group();
        this.scene.add(this.planetRoot);

        // Create spin group for rotation
        this.spinGroup = new THREE.Group();
        this.planetRoot.add(this.spinGroup);

        // Create groups for rings
        this.ringGroup = new THREE.Group();
        this.spinGroup.add(this.ringGroup);
        this.ringMeshes = [];
        this.ringTextures = [];

        // Create groups for moons
        this.moonsGroup = new THREE.Group();
        this.planetRoot.add(this.moonsGroup);
        this.orbitLinesGroup = new THREE.Group();
        this.scene.add(this.orbitLinesGroup);

        // Initialize default sun direction (will be updated from spotlight)
        this.sunDirection = new THREE.Vector3(1.0, 0.5, 1.0).normalize();

        // Create geometry (high detail icosahedron)
        this.geometry = new THREE.IcosahedronGeometry(1, 96);

        if (this.params.noiseType === undefined) this.params.noiseType = 'classic';
        if (this.params.noiseVariant === undefined) this.params.noiseVariant = 0.5;

        const volumetricDefaults = {
            volumetricCloudsEnabled: true,
            volumetricCloudCount: 18,
            volumetricCloudPuffCount: 8,
            volumetricCloudSpread: 0.4,
            volumetricCloudFlatness: 0.45,
            volumetricCloudPuffSize: 0.28,
            volumetricCloudParticleSize: 0.16,
            volumetricCloudParticleOpacity: 0.06,
            volumetricCloudParticlesPerCloud: 320,
            volumetricCloudSize: 1.0,
            volumetricCloudHeight: 1.0,
            volumetricCloudColor: "#ffffff"
        };
        Object.entries(volumetricDefaults).forEach(([key, value]) => {
            if (this.params[key] === undefined) {
                this.params[key] = value;
            }
        });
        this._volumetricCloudBaseShell = { inner: 0.05, outer: 0.12 };

        // Create uniforms for rocky planet
        this.rockyUniforms = {
            uTime: { value: 0 },
            uSunDirection: { value: this.sunDirection.clone() },
            uSeaLevel: { value: params.seaLevel ?? 0.52 },
            uContinentSize: { value: params.continentSize ?? 1.5 },
            uMountainHeight: { value: params.mountainHeight ?? 0.4 },
            uRoughness: { value: params.roughness ?? 0.55 },
            uDetail: { value: params.detail ?? 6.0 },
            uIceCapThreshold: { value: params.iceCapThreshold ?? 0.9 },
            uNoiseType: { value: resolveRockyNoiseType(params.noiseType) },
            uNoiseVariant: { value: THREE.MathUtils.clamp(params.noiseVariant ?? 0.5, 0, 1) },
            uColorDeepWater: { value: new THREE.Color(params.colorDeepWater ?? "#002b4d") },
            uColorShallowWater: { value: new THREE.Color(params.colorShallowWater ?? "#006994") },
            uColorBeach: { value: new THREE.Color(params.colorBeach ?? "#d4c6a3") },
            uColorGrass: { value: new THREE.Color(params.colorGrass ?? "#2a602a") },
            uColorForest: { value: new THREE.Color(params.colorForest ?? "#1a381a") },
            uColorMountain: { value: new THREE.Color(params.colorMountain ?? "#666666") },
            uColorMountainHigh: { value: new THREE.Color(params.colorMountainHigh ?? "#888888") },
            uColorSnow: { value: new THREE.Color(params.colorSnow ?? "#ffffff") }
        };

        // Create uniforms for gas planet
        this.gasUniforms = {
            uTime: { value: 0 },
            uSunDirection: { value: this.sunDirection.clone() },
            uStripeSpeed: { value: params.gasStripeSpeed ?? 0.02 },
            uStripeFrequency: { value: params.gasStripeFrequency ?? 3.0 },
            uStripeSharpness: { value: params.gasStripeSharpness ?? 2.0 },
            uTurbulence: { value: params.gasTurbulence ?? 0.75 },
            uColor1: { value: new THREE.Color(params.gasColor1 ?? "#d4a574") },
            uColor2: { value: new THREE.Color(params.gasColor2 ?? "#8b6f47") },
            uColor3: { value: new THREE.Color(params.gasColor3 ?? "#ffd4a3") },
            uColor4: { value: new THREE.Color(params.gasColor4 ?? "#5c4a2e") },
            uColor5: { value: new THREE.Color(params.gasColor5 ?? "#f5e6d3") }
        };

        // Create materials
        this.rockyMaterial = new THREE.ShaderMaterial({
            vertexShader: terrainVertexShader,
            fragmentShader: terrainFragmentShader,
            uniforms: this.rockyUniforms
        });

        this.gasMaterial = new THREE.ShaderMaterial({
            vertexShader: gasPlanetVertexShader,
            fragmentShader: gasPlanetFragmentShader,
            uniforms: this.gasUniforms
        });

        // Create planet mesh
        this.planetMesh = new THREE.Mesh(this.geometry, this.rockyMaterial);
        this.planetMesh.receiveShadow = true;
        this.planetMesh.castShadow = false; // Planet doesn't cast shadow on itself
        this.spinGroup.add(this.planetMesh);

        // Initialize planet scale
        this.planetMesh.scale.setScalar(params.planetSize ?? 1.0);

        // Create atmosphere
        const atmoGeometry = new THREE.IcosahedronGeometry(1.15, 32);
        this.atmosphereUniforms = {
            uSunDirection: { value: this.sunDirection.clone() },
            uAtmosphereColor: { value: new THREE.Color(params.atmosphereColor ?? "#3a9eff") },
            uAtmosphereDensity: { value: params.atmosphereDensity ?? 0.3 }
        };
        const atmoMaterial = new THREE.ShaderMaterial({
            vertexShader: atmosphereVertexShader,
            fragmentShader: atmosphereFragmentShader,
            uniforms: this.atmosphereUniforms,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });
        this.atmosphereMesh = new THREE.Mesh(atmoGeometry, atmoMaterial);
        this.spinGroup.add(this.atmosphereMesh);
        this.atmosphereMesh.scale.setScalar((params.planetSize ?? 1.0) * 1.15);

        // Create clouds (simple CanvasTexture as in planet.html)
        this.cloudTexture = this._generateCloudTexture();
        const cloudMaterial = new THREE.MeshStandardMaterial({
            map: this.cloudTexture,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1.03, 64, 64), cloudMaterial);
        this.spinGroup.add(this.cloudMesh);
        this.cloudMesh.scale.setScalar((params.planetSize ?? 1.0) * 1.03);

        this.volumetricCloudSprite = this._createVolumetricCloudTexture();
        this.volumetricCloudMaterial = new THREE.PointsMaterial({
            map: this.volumetricCloudSprite,
            transparent: true,
            depthWrite: false,
            sizeAttenuation: true,
            blending: THREE.NormalBlending,
            color: new THREE.Color(params.volumetricCloudColor ?? "#ffffff")
        });
        this.volumetricCloudGroup = new THREE.Group();
        this.spinGroup.add(this.volumetricCloudGroup);
        this._updateVolumetricCloudMaterial();
        this._regenerateVolumetricClouds();

        // Set initial planet type
        this.setPlanetType(params.planetType ?? 'earth');
    }

    _generateCloudTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Generate seamless cloud texture
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 1024, 512);

        // Use a seed for consistent random generation
        let seed = 12345;
        const random = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        // Generate clouds with blur
        ctx.filter = 'blur(30px)';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';

        // Generate clouds, ensuring seamless wrapping
        // Store cloud positions to duplicate near edges
        const clouds = [];
        for (let i = 0; i < 100; i++) {
            const x = random() * 1024;
            const y = random() * 512;
            const radius = random() * 50 + 20;
            clouds.push({ x, y, radius });

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Duplicate clouds near the edges to ensure seamless wrapping
        // Clouds within 100px of the right edge should also appear on the left
        for (const cloud of clouds) {
            if (cloud.x > 1024 - 100) {
                // Draw on left side (wrapped)
                ctx.beginPath();
                ctx.arc(cloud.x - 1024, cloud.y, cloud.radius, 0, Math.PI * 2);
                ctx.fill();
            }
            if (cloud.x < 100) {
                // Draw on right side (wrapped)
                ctx.beginPath();
                ctx.arc(cloud.x + 1024, cloud.y, cloud.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.filter = 'none';

        // Get image data to ensure seamless wrapping
        const imageData = ctx.getImageData(0, 0, 1024, 512);
        const data = imageData.data;
        const edgeBlendWidth = 30; // Pixels to blend at the seam

        // Make the texture seamless by blending the left and right edges
        for (let y = 0; y < 512; y++) {
            for (let x = 0; x < edgeBlendWidth; x++) {
                // Left edge pixel (from left side)
                const leftIdx = (y * 1024 + x) * 4;
                // Right edge pixel (from right side, matching position)
                const rightIdx = (y * 1024 + (1024 - 1 - x)) * 4;

                // Average the left and right edge pixels for seamless blending
                const avgR = (data[leftIdx] + data[rightIdx]) * 0.5;
                const avgG = (data[leftIdx + 1] + data[rightIdx + 1]) * 0.5;
                const avgB = (data[leftIdx + 2] + data[rightIdx + 2]) * 0.5;
                const avgA = (data[leftIdx + 3] + data[rightIdx + 3]) * 0.5;

                // Apply blended values to both edges
                data[leftIdx] = avgR;
                data[leftIdx + 1] = avgG;
                data[leftIdx + 2] = avgB;
                data[leftIdx + 3] = avgA;

                data[rightIdx] = avgR;
                data[rightIdx + 1] = avgG;
                data[rightIdx + 2] = avgB;
                data[rightIdx + 3] = avgA;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    setPlanetType(type) {
        this.params.planetType = type;

        if (type === 'gas') {
            this.planetMesh.material = this.gasMaterial;
            this.planetMesh.scale.setScalar(this.params.gasPlanetSize ?? 1.0);
            this.atmosphereMesh.scale.setScalar((this.params.gasPlanetSize ?? 1.0) * 1.15);
            this.cloudMesh.visible = false;
            this.atmosphereMesh.visible = false;
            if (this.volumetricCloudGroup) {
                this.volumetricCloudGroup.visible = false;
            }
        } else {
            this.planetMesh.material = this.rockyMaterial;
            this.planetMesh.scale.setScalar(this.params.planetSize ?? 1.0);
            this.atmosphereMesh.scale.setScalar((this.params.planetSize ?? 1.0) * 1.15);
            this.cloudMesh.scale.setScalar((this.params.planetSize ?? 1.0) * 1.03);
            this.cloudMesh.visible = true;
            this.atmosphereMesh.visible = true;
            if (this.volumetricCloudGroup) {
                this.volumetricCloudGroup.visible = this.params.volumetricCloudsEnabled !== false;
                if (this.volumetricCloudGroup.visible) {
                    this._regenerateVolumetricClouds();
                }
            }
        }
    }

    applyParams(newParams) {
        // Update params
        Object.assign(this.params, newParams);

        if (this.params.noiseVariant !== undefined) {
            this.params.noiseVariant = THREE.MathUtils.clamp(this.params.noiseVariant, 0, 1);
        }

        // Update rocky uniforms
        if (this.rockyUniforms) {
            if (newParams.seaLevel !== undefined) this.rockyUniforms.uSeaLevel.value = newParams.seaLevel;
            if (newParams.continentSize !== undefined) this.rockyUniforms.uContinentSize.value = newParams.continentSize;
            if (newParams.mountainHeight !== undefined) this.rockyUniforms.uMountainHeight.value = newParams.mountainHeight;
            if (newParams.roughness !== undefined) this.rockyUniforms.uRoughness.value = newParams.roughness;
            if (newParams.detail !== undefined) this.rockyUniforms.uDetail.value = newParams.detail;
            if (newParams.iceCapThreshold !== undefined) this.rockyUniforms.uIceCapThreshold.value = newParams.iceCapThreshold;
            if (newParams.noiseType !== undefined) this.rockyUniforms.uNoiseType.value = resolveRockyNoiseType(newParams.noiseType);
            if (newParams.noiseVariant !== undefined) this.rockyUniforms.uNoiseVariant.value = THREE.MathUtils.clamp(newParams.noiseVariant, 0, 1);
            if (newParams.colorDeepWater) this.rockyUniforms.uColorDeepWater.value.set(newParams.colorDeepWater);
            if (newParams.colorShallowWater) this.rockyUniforms.uColorShallowWater.value.set(newParams.colorShallowWater);
            if (newParams.colorBeach) this.rockyUniforms.uColorBeach.value.set(newParams.colorBeach);
            if (newParams.colorGrass) this.rockyUniforms.uColorGrass.value.set(newParams.colorGrass);
            if (newParams.colorForest) this.rockyUniforms.uColorForest.value.set(newParams.colorForest);
            if (newParams.colorMountain) this.rockyUniforms.uColorMountain.value.set(newParams.colorMountain);
            if (newParams.colorMountainHigh) this.rockyUniforms.uColorMountainHigh.value.set(newParams.colorMountainHigh);
            if (newParams.colorSnow) this.rockyUniforms.uColorSnow.value.set(newParams.colorSnow);
        }

        // Update gas uniforms
        if (this.gasUniforms) {
            if (newParams.gasStripeSpeed !== undefined) this.gasUniforms.uStripeSpeed.value = newParams.gasStripeSpeed;
            if (newParams.gasStripeFrequency !== undefined) this.gasUniforms.uStripeFrequency.value = newParams.gasStripeFrequency;
            if (newParams.gasStripeSharpness !== undefined) this.gasUniforms.uStripeSharpness.value = newParams.gasStripeSharpness;
            if (newParams.gasTurbulence !== undefined) this.gasUniforms.uTurbulence.value = newParams.gasTurbulence;
            // gasPlanetSize is handled by mesh scale, not shader uniform
            if (newParams.gasColor1) this.gasUniforms.uColor1.value.set(newParams.gasColor1);
            if (newParams.gasColor2) this.gasUniforms.uColor2.value.set(newParams.gasColor2);
            if (newParams.gasColor3) this.gasUniforms.uColor3.value.set(newParams.gasColor3);
            if (newParams.gasColor4) this.gasUniforms.uColor4.value.set(newParams.gasColor4);
            if (newParams.gasColor5) this.gasUniforms.uColor5.value.set(newParams.gasColor5);
        }

        // Update atmosphere uniforms
        if (this.atmosphereUniforms) {
            if (newParams.atmosphereDensity !== undefined) this.atmosphereUniforms.uAtmosphereDensity.value = newParams.atmosphereDensity;
            if (newParams.atmosphereColor) this.atmosphereUniforms.uAtmosphereColor.value.set(newParams.atmosphereColor);
        }

        const volShapeKeys = [
            'volumetricCloudsEnabled',
            'volumetricCloudCount',
            'volumetricCloudPuffCount',
            'volumetricCloudSpread',
            'volumetricCloudFlatness',
            'volumetricCloudPuffSize',
            'volumetricCloudParticlesPerCloud',
            'volumetricCloudSize',
            'volumetricCloudHeight',
            'planetSize'
        ];
        const volMaterialKeys = [
            'volumetricCloudParticleSize',
            'volumetricCloudParticleOpacity',
            'volumetricCloudColor'
        ];
        let shouldRegenVolClouds = false;
        let shouldUpdateVolMaterial = false;

        volShapeKeys.forEach(key => {
            if (newParams[key] !== undefined) {
                shouldRegenVolClouds = true;
            }
        });
        volMaterialKeys.forEach(key => {
            if (newParams[key] !== undefined) {
                shouldUpdateVolMaterial = true;
            }
        });

        // Update scales
        if (newParams.planetType === 'gas') {
            if (newParams.gasPlanetSize !== undefined) {
                this.planetMesh.scale.setScalar(newParams.gasPlanetSize);
                this.atmosphereMesh.scale.setScalar(newParams.gasPlanetSize * 1.15);
            }
        } else {
            if (newParams.planetSize !== undefined) {
                this.planetMesh.scale.setScalar(newParams.planetSize);
                this.atmosphereMesh.scale.setScalar(newParams.planetSize * 1.15);
                this.cloudMesh.scale.setScalar(newParams.planetSize * 1.03);
            }
        }

        // Auto-scale detail/frequency based on size
        if (newParams.planetSize !== undefined && !this.params.locks?.detail) {
            const newDetail = 3.0 + ((newParams.planetSize - 0.5) / 1.5) * 5.0;
            this.params.detail = newDetail;
            this.rockyUniforms.uDetail.value = newDetail;
        }

        if (newParams.gasPlanetSize !== undefined && !this.params.locks?.gasStripeFrequency) {
            const newFreq = 1.0 + ((newParams.gasPlanetSize - 0.5) / 1.5) * 4.0;
            this.params.gasStripeFrequency = newFreq;
            this.gasUniforms.uStripeFrequency.value = newFreq;
        }

        // Update planet type if changed
        if (newParams.planetType && newParams.planetType !== this.params.planetType) {
            this.setPlanetType(newParams.planetType);
        }

        if (shouldUpdateVolMaterial) {
            this._updateVolumetricCloudMaterial();
        }
        if (shouldRegenVolClouds) {
            this._regenerateVolumetricClouds();
        }
    }

    updateSunDirection(sunDirection) {
        this.sunDirection.copy(sunDirection);
        if (this.rockyUniforms) this.rockyUniforms.uSunDirection.value.copy(sunDirection);
        if (this.gasUniforms) this.gasUniforms.uSunDirection.value.copy(sunDirection);
        if (this.atmosphereUniforms) this.atmosphereUniforms.uSunDirection.value.copy(sunDirection);
    }

    update(delta, time) {
        // Update time uniforms
        if (this.rockyUniforms) this.rockyUniforms.uTime.value = time;
        if (this.gasUniforms) this.gasUniforms.uTime.value = time;

        // Rotate planet
        const rotationDelta = (this.params.rotationSpeed ?? 0.05) * delta * Math.PI * 2;
        this.spinGroup.rotation.y += rotationDelta;

        // Rotate clouds and atmosphere
        this.cloudMesh.rotation.y += rotationDelta * 1.2;
        this.atmosphereMesh.rotation.y += rotationDelta * 0.1;
        if (this.volumetricCloudGroup && this.volumetricCloudGroup.visible) {
            this.volumetricCloudGroup.rotation.y += rotationDelta * 0.35;
        }

        // Rotate entire ring group (global spin)
        if (this.params.ringSpinSpeed !== undefined) {
            this.ringGroup.rotation.y += this.params.ringSpinSpeed * delta;
        }

        // Rotate individual rings (each ring can have its own spin speed)
        this.ringMeshes.forEach((ringMesh, index) => {
            const ringData = this.params.rings?.[index];
            if (ringData && ringData.spinSpeed !== undefined) {
                ringMesh.rotation.z += ringData.spinSpeed * delta;
            }
        });
    }

    // Moon and ring methods
    updateMoons() {
        if (!this.params.moonSettings) return;

        // Clear existing moons
        while (this.moonsGroup.children.length > 0) {
            const child = this.moonsGroup.children[0];
            this.moonsGroup.remove(child);
            if (child.userData.mesh) {
                child.userData.mesh.geometry?.dispose();
                child.userData.mesh.material?.dispose();
            }
            if (child.userData.orbitLine) {
                child.userData.orbitLine.geometry?.dispose();
                child.userData.orbitLine.material?.dispose();
                this.orbitLinesGroup.remove(child.userData.orbitLine);
            }
        }

        // Create moons based on moonSettings
        const moonCount = Math.min(this.params.moonCount || 0, this.params.moonSettings.length);
        for (let i = 0; i < moonCount; i++) {
            const moon = this.params.moonSettings[i];
            if (!moon) continue;

            // Create moon pivot (for orbit)
            const moonPivot = new THREE.Group();
            moonPivot.userData.moonIndex = i;

            // Create moon mesh
            const moonGeometry = new THREE.SphereGeometry(moon.size || 0.2, 16, 16);
            const moonMaterial = new THREE.MeshStandardMaterial({
                color: moon.color || "#cccccc",
                roughness: 0.8,
                metalness: 0.1
            });
            const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
            moonMesh.position.set(moon.distance || 3.0, 0, 0);
            moonPivot.add(moonMesh);
            moonPivot.userData.mesh = moonMesh;

            // Set inclination
            moonPivot.rotation.z = (moon.inclination || 0) * Math.PI / 180;

            this.moonsGroup.add(moonPivot);

            // Create orbit line
            const orbitPoints = [];
            const segments = 64;
            const semiMajor = Math.max(0.5, moon.distance || 3.5);
            const eccentricity = THREE.MathUtils.clamp(moon.eccentricity ?? 0, 0, 0.95);
            for (let j = 0; j <= segments; j++) {
                const angle = (j / segments) * Math.PI * 2;
                const r = semiMajor * (1 - eccentricity * eccentricity) / (1 + eccentricity * Math.cos(angle));
                orbitPoints.push(new THREE.Vector3(r * Math.cos(angle), 0, r * Math.sin(angle)));
            }
            const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
            const orbitMaterial = new THREE.LineBasicMaterial({
                color: 0x888888,
                transparent: true,
                opacity: 0.3
            });
            const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
            orbitLine.rotation.z = moonPivot.rotation.z;
            orbitLine.userData.isOrbitLine = true;
            this.orbitLinesGroup.add(orbitLine);
            moonPivot.userData.orbitLine = orbitLine;
        }
    }

    updateRings() {
        if (!this.params.rings || !Array.isArray(this.params.rings)) return;

        // Clear existing rings
        this.ringMeshes.forEach(mesh => {
            this.ringGroup.remove(mesh);
            mesh.geometry?.dispose();
            mesh.material?.dispose();
            if (mesh.material.map) mesh.material.map.dispose();
        });
        this.ringTextures.forEach(texture => texture.dispose());
        this.ringMeshes = [];
        this.ringTextures = [];

        if (!this.params.ringEnabled) return;

        // Create rings
        this.params.rings.forEach((ring, index) => {
            if (!ring) return;

            const innerRadius = ring.start || 1.2;
            const outerRadius = ring.end || 1.5;
            const segments = 128; // Increased for smoother rings

            const ringGeometry = new THREE.RingGeometry(innerRadius, outerRadius, segments);

            let texture;
            try {
                const innerRatio = innerRadius / outerRadius;
                if (ring.style === "Texture") {
                    texture = generateRingTexture(innerRatio, {
                        ringColor: ring.color || 0x888888,
                        ringOpacity: ring.opacity || 0.6,
                        ringNoiseScale: ring.noiseScale || 3.2,
                        ringNoiseStrength: ring.noiseStrength || 0.55,
                        seed: this.params.seed || "ring",
                        noiseResolution: 1.0
                    });
                } else {
                    texture = generateAnnulusTexture({
                        innerRatio: innerRatio,
                        color: ring.color || "#888888",
                        opacity: ring.opacity || 0.6,
                        noiseScale: ring.noiseScale || 3.2,
                        noiseStrength: ring.noiseStrength || 0.55,
                        seedKey: "ring",
                        seed: this.params.seed || "ring",
                        noiseResolution: 1.0
                    });
                }
            } catch (e) {
                console.warn('Ring texture generation failed:', e);
                // Fallback to simple texture if generation fails
                const canvas = document.createElement('canvas');
                canvas.width = 512;
                canvas.height = 512;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = ring.color || '#888888';
                ctx.fillRect(0, 0, 512, 512);
                texture = new THREE.CanvasTexture(canvas);
            }
            this.ringTextures.push(texture);

            // Apply brightness to material
            const brightness = ring.brightness || 1.0;
            const ringMaterial = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: ring.opacity || 0.6,
                color: new THREE.Color(brightness, brightness, brightness),
                blending: THREE.NormalBlending,
                depthWrite: false
            });

            const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
            ringMesh.rotation.x = Math.PI / 2;
            ringMesh.userData.ringIndex = index;
            ringMesh.userData.spinSpeed = ring.spinSpeed || 0;
            this.ringGroup.add(ringMesh);
            this.ringMeshes.push(ringMesh);
        });
    }

    updateTilt() {
        // Apply axis tilt to the planet root
        if (this.params.axisTilt !== undefined) {
            this.planetRoot.rotation.z = (this.params.axisTilt * Math.PI) / 180;
        }

        // Apply ring angle (independent of axis tilt)
        if (this.params.ringAngle !== undefined && this.ringGroup) {
            this.ringGroup.rotation.z = (this.params.ringAngle * Math.PI) / 180;
        }
    }

    _createVolumetricCloudTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, 0,
            canvas.width / 2, canvas.height / 2, canvas.width / 2
        );
        gradient.addColorStop(0.0, 'rgba(255,255,255,0.9)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
        gradient.addColorStop(1.0, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    _createVolumetricCloudPositions({ puffCount, spread, flatness, puffSize }) {
        const flatnessFactor = 1.0 - THREE.MathUtils.clamp(flatness ?? 0.0, 0.0, 0.95);
        // Apply cloud resolution scaling
        const cloudResolution = this.guiControllers?.visualSettings?.cloudResolution ?? 1.0;
        const particlesPerCloud = THREE.MathUtils.clamp(this.params.volumetricCloudParticlesPerCloud ?? 320, 80, 1600);
        const totalParticles = Math.max(80, Math.floor(particlesPerCloud * cloudResolution));
        const positions = [];

        const puffs = Math.max(1, Math.floor(puffCount ?? 4));
        const particlesPerPuff = Math.max(20, Math.floor(totalParticles / puffs));

        for (let i = 0; i < puffs; i++) {
            const puffCenter = new THREE.Vector3(
                (Math.random() - 0.5) * spread * 2,
                (Math.random() - 0.5) * spread * flatnessFactor,
                (Math.random() - 0.5) * spread * 2
            );
            for (let j = 0; j < particlesPerPuff; j++) {
                let x, y, z, d;
                do {
                    x = (Math.random() - 0.5) * puffSize;
                    y = (Math.random() - 0.5) * puffSize;
                    z = (Math.random() - 0.5) * puffSize;
                    d = x * x + y * y + z * z;
                } while (d > (puffSize * 0.5) ** 2);

                positions.push(
                    puffCenter.x + x,
                    puffCenter.y + y * flatnessFactor,
                    puffCenter.z + z
                );
            }
        }
        return positions;
    }

    _clearVolumetricClouds() {
        if (!this.volumetricCloudGroup) return;
        while (this.volumetricCloudGroup.children.length > 0) {
            const child = this.volumetricCloudGroup.children.pop();
            this.volumetricCloudGroup.remove(child);
            child?.geometry?.dispose();
        }
    }

    _updateVolumetricCloudMaterial() {
        if (!this.volumetricCloudMaterial) return;
        const baseRadius = this.planetMesh.scale.x || 1;
        const sizeRatio = THREE.MathUtils.clamp(this.params.volumetricCloudParticleSize ?? 0.16, 0.02, 0.6);
        this.volumetricCloudMaterial.size = sizeRatio * baseRadius;
        this.volumetricCloudMaterial.opacity = THREE.MathUtils.clamp(this.params.volumetricCloudParticleOpacity ?? 0.06, 0.02, 0.25);
        if (this.params.volumetricCloudColor !== undefined) {
            this.volumetricCloudMaterial.color.set(this.params.volumetricCloudColor);
        }
        this.volumetricCloudMaterial.needsUpdate = true;
    }

    _regenerateVolumetricClouds() {
        if (!this.volumetricCloudGroup) return;
        if (!this.params.volumetricCloudsEnabled || this.params.planetType === 'gas') {
            this.volumetricCloudGroup.visible = false;
            this._clearVolumetricClouds();
            return;
        }

        this.volumetricCloudGroup.visible = true;
        this._clearVolumetricClouds();

        const baseRadius = this.planetMesh.scale.x || 1;
        // Apply cloud resolution scaling
        const cloudResolution = this.guiControllers?.visualSettings?.cloudResolution ?? 1.0;
        const sizeMul = THREE.MathUtils.clamp(this.params.volumetricCloudSize ?? 1.0, 0.4, 2.4);
        const spread = THREE.MathUtils.clamp(this.params.volumetricCloudSpread ?? 0.4, 0.05, 1.8) * baseRadius * sizeMul;
        const puffSize = THREE.MathUtils.clamp(this.params.volumetricCloudPuffSize ?? 0.28, 0.05, 1.6) * baseRadius * sizeMul;
        const puffCount = Math.max(1, Math.floor((this.params.volumetricCloudPuffCount ?? 8) * cloudResolution));
        const count = Math.max(0, Math.floor((this.params.volumetricCloudCount ?? 18) * cloudResolution));
        const flatness = THREE.MathUtils.clamp(this.params.volumetricCloudFlatness ?? 0.45, 0.0, 0.95);
        const heightMul = THREE.MathUtils.clamp(this.params.volumetricCloudHeight ?? 1.0, 0.5, 2.0);
        const innerBase = this._volumetricCloudBaseShell?.inner ?? 0.05;
        const outerBase = this._volumetricCloudBaseShell?.outer ?? 0.12;
        const inner = baseRadius * (1 + innerBase * heightMul);
        const outer = baseRadius * (1 + outerBase * heightMul);

        const up = new THREE.Vector3(0, 1, 0);
        const allPositions = [];
        const tempVec = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
            const cloudPositions = this._createVolumetricCloudPositions({ puffCount, spread, flatness, puffSize });
            if (!cloudPositions || cloudPositions.length === 0) continue;

            const dir = new THREE.Vector3(
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
                Math.random() * 2 - 1
            );
            if (dir.lengthSq() === 0) {
                i--;
                continue;
            }
            dir.normalize();
            const altitude = THREE.MathUtils.lerp(inner, outer, Math.random());
            const cloudPos = dir.clone().multiplyScalar(altitude);

            const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);

            // Transform local cloud points to world space and add to big list
            for (let j = 0; j < cloudPositions.length; j += 3) {
                tempVec.set(cloudPositions[j], cloudPositions[j + 1], cloudPositions[j + 2]);
                tempVec.applyQuaternion(quaternion);
                tempVec.add(cloudPos);
                allPositions.push(tempVec.x, tempVec.y, tempVec.z);
            }
        }

        if (allPositions.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
            const cloudMesh = new THREE.Points(geometry, this.volumetricCloudMaterial);
            this.volumetricCloudGroup.add(cloudMesh);
        }
    }

}

