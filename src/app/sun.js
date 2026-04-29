import * as THREE from "three";
import { sunVertexShader, sunFragmentShader } from "./shaders/planetShaders.js";

export const DEFAULT_SUN_PARAMS = {
    sunColor: "#ffd27f",
    sunIntensity: 1.6,
    sunDistance: 96,
    sunSize: 1.7,
    sunPulseSpeed: 0.28,
    sunGlowStrength: 1.45,
    sunNoiseScale: 1.35,
    sunNoiseStrength: 0.045,
    sunPulseAmplitude: 0.08,
    sunHotspotStrength: 0.28
};

function createPalette(baseColor) {
    const base = new THREE.Color(baseColor);
    const highlight = base.clone().lerp(new THREE.Color(0xffffff), 0.45);
    const rim = base.clone().lerp(new THREE.Color(0x000d1f), 0.6);
    return { base, highlight, rim };
}

function createSunUniforms(params, palette) {
    return {
        uTime: { value: 0 },
        uNoiseScale: { value: params.sunNoiseScale },
        uNoiseStrength: { value: params.sunNoiseStrength },
        uPulseAmplitude: { value: params.sunPulseAmplitude },
        uPulseSpeed: { value: params.sunPulseSpeed },
        uBrightness: { value: params.sunGlowStrength },
        uHotspotStrength: { value: params.sunHotspotStrength },
        uBaseColor: { value: palette.base.clone() },
        uHighlightColor: { value: palette.highlight.clone() },
        uRimColor: { value: palette.rim.clone() }
    };
}

export function createSunComponents(params = {}, options = {}) {
    const merged = { ...DEFAULT_SUN_PARAMS, ...params };
    const palette = createPalette(merged.sunColor);
    const geometry = options.geometry instanceof THREE.BufferGeometry
        ? options.geometry
        : new THREE.SphereGeometry(
            1,
            options.widthSegments ?? 96,
            options.heightSegments ?? 48
        );
    const uniforms = createSunUniforms(merged, palette);

    const material = new THREE.ShaderMaterial({
        vertexShader: sunVertexShader,
        fragmentShader: sunFragmentShader,
        uniforms,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        fog: false
    });
    material.toneMapped = false;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = options.meshName ?? "SunVisual";
    mesh.frustumCulled = false;
    mesh.renderOrder = options.renderOrder ?? 0;

    const sizeMultiplier = options.sizeMultiplier ?? 1;
    mesh.scale.setScalar((merged.sunSize ?? DEFAULT_SUN_PARAMS.sunSize) * sizeMultiplier);

    let lightTarget = null;
    let light;

    if (options.lightType === "point") {
        light = new THREE.PointLight(
            palette.base.clone(),
            merged.sunIntensity,
            options.lightDistance ?? 0,
            options.lightDecay ?? 2.0
        );
        light.castShadow = Boolean(options.castShadow);
        if (light.castShadow) {
            light.shadow.mapSize.width = options.shadowMapWidth ?? 1024;
            light.shadow.mapSize.height = options.shadowMapHeight ?? 1024;
            light.shadow.bias = options.shadowBias ?? -0.0005;
        }
    } else {
        lightTarget = options.lightTarget ?? new THREE.Object3D();
        if (!lightTarget.name) {
            lightTarget.name = options.targetName ?? "SunLightTarget";
        }
        light = new THREE.SpotLight(
            palette.base.clone(),
            merged.sunIntensity,
            options.lightDistance ?? 1000,
            options.lightAngle ?? Math.PI / 4,
            options.lightPenumbra ?? 0.2,
            options.lightDecay ?? 1.0
        );
        light.target = lightTarget;
        light.castShadow = options.castShadow ?? true;
        light.shadow.mapSize.width = options.shadowMapWidth ?? 2048;
        light.shadow.mapSize.height = options.shadowMapHeight ?? 2048;
        light.shadow.camera.near = options.shadowNear ?? 0.1;
        light.shadow.camera.far = options.shadowFar ?? 100;
        light.shadow.camera.fov = options.shadowFov ?? 45;
        light.shadow.camera.aspect = 1.0;
        light.shadow.bias = options.shadowBias ?? -0.0001;
    }

    light.name = options.lightName ?? "Sun Light";

    const applyParams = (changes = {}) => {
        if (!changes || typeof changes !== "object") {
            return;
        }
        Object.assign(merged, changes);

        if (changes.sunColor) {
            const nextPalette = createPalette(merged.sunColor);
            palette.base.copy(nextPalette.base);
            palette.highlight.copy(nextPalette.highlight);
            palette.rim.copy(nextPalette.rim);
            light.color.copy(palette.base);
            uniforms.uBaseColor.value.copy(palette.base);
            uniforms.uHighlightColor.value.copy(palette.highlight);
            uniforms.uRimColor.value.copy(palette.rim);
        }
        if (changes.sunIntensity !== undefined) {
            light.intensity = merged.sunIntensity;
        }
        if (changes.sunNoiseScale !== undefined) {
            uniforms.uNoiseScale.value = merged.sunNoiseScale;
        }
        if (changes.sunNoiseStrength !== undefined) {
            uniforms.uNoiseStrength.value = merged.sunNoiseStrength;
        }
        if (changes.sunPulseAmplitude !== undefined) {
            uniforms.uPulseAmplitude.value = merged.sunPulseAmplitude;
        }
        if (changes.sunPulseSpeed !== undefined) {
            uniforms.uPulseSpeed.value = merged.sunPulseSpeed;
        }
        if (changes.sunGlowStrength !== undefined) {
            uniforms.uBrightness.value = merged.sunGlowStrength;
        }
        if (changes.sunHotspotStrength !== undefined) {
            uniforms.uHotspotStrength.value = merged.sunHotspotStrength;
        }
        if (changes.sunSize !== undefined) {
            mesh.scale.setScalar((merged.sunSize ?? DEFAULT_SUN_PARAMS.sunSize) * sizeMultiplier);
        }
    };

    const update = (time = 0) => {
        if (uniforms.uTime) {
            uniforms.uTime.value = time;
        }
    };

    const dispose = () => {
        geometry.dispose?.();
        material.dispose();
    };

    return {
        mesh,
        light,
        target: lightTarget,
        uniforms,
        material,
        params: merged,
        applyParams,
        update,
        dispose,
        palette
    };
}

export class Sun {
    constructor(scene, planetRoot = null, params = {}, options = {}) {
        this.scene = scene;
        this.planetRoot = planetRoot ?? null;
        this.params = { ...DEFAULT_SUN_PARAMS, ...params };
        this.sunDirection = (options.sunDirection ?? new THREE.Vector3(1.0, 0.5, 1.0)).clone().normalize();

        const target = planetRoot ?? new THREE.Object3D();
        if (!planetRoot && !target.name) {
            target.name = options.targetName ?? "SunLightTarget";
        }

        this.components = createSunComponents(this.params, {
            ...options,
            lightType: options.lightType ?? "spot",
            sizeMultiplier: options.sizeMultiplier ?? 0.9,
            lightTarget: target
        });

        this.sunVisual = this.components.mesh;
        this.uniforms = this.components.uniforms;
        this.light = this.components.light;
        this.lightTarget = this.light.target ?? target;

        if (scene) {
            if (this.lightTarget && !this.lightTarget.parent) {
                scene.add(this.lightTarget);
            }
            scene.add(this.sunVisual);
            scene.add(this.light);
        }

        this.components.applyParams(this.params);
        this._applyDistance();
    }

    update(time = 0) {
        if (this.planetRoot) {
            this.lightTarget.position.copy(this.planetRoot.position);
        }
        if (this.sunVisual) {
            this.sunVisual.position.copy(this.light.position);
            if (this.lightTarget) {
                this.sunVisual.lookAt(this.lightTarget.position);
            }
        }
        this.components.update(time);
    }

    updateSun(params = {}) {
        this.applyParams(params);
    }

    getDirection() {
        return this.sunDirection.clone();
    }

    applyParams(newParams = {}) {
        if (!newParams || typeof newParams !== "object") {
            return;
        }
        Object.assign(this.params, newParams);
        this.components.applyParams(newParams);
        if (newParams.sunDistance !== undefined) {
            this._applyDistance();
        }
    }

    _applyDistance() {
        const dist = (this.params.sunDistance ?? DEFAULT_SUN_PARAMS.sunDistance) / 4.0;
        this.light.position.copy(this.sunDirection.clone().multiplyScalar(dist));
        if (this.sunVisual) {
            this.sunVisual.position.copy(this.light.position);
        }
    }
}
