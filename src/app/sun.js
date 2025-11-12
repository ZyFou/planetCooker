import * as THREE from "three";
import { sunVertexShader, sunFragmentShader } from "./shaders/planetShaders.js";

const DEFAULT_SUN_PARAMS = {
    sunColor: "#ffd27f",
    sunIntensity: 1.6,
    sunDistance: 48,
    sunSize: 1.1,
    sunPulseSpeed: 0.6,
    sunGlowStrength: 1.3,
    sunNoiseScale: 2.2,
    sunNoiseStrength: 0.18,
    sunPulseAmplitude: 0.4,
    sunHotspotStrength: 0.55
};

function createPalette(baseColor) {
    const base = new THREE.Color(baseColor);
    const highlight = base.clone().lerp(new THREE.Color(0xffffff), 0.45);
    const rim = base.clone().lerp(new THREE.Color(0x000d1f), 0.6);
    return { base, highlight, rim };
}

export class Sun {
    constructor(scene, planetRoot, params = {}) {
        this.scene = scene;
        this.planetRoot = planetRoot;
        this.params = { ...DEFAULT_SUN_PARAMS, ...params };

        const palette = createPalette(this.params.sunColor);

        this.sunDirection = new THREE.Vector3(1.0, 0.5, 1.0).normalize();

        this.light = new THREE.SpotLight(
            palette.base,
            this.params.sunIntensity,
            1000,
            Math.PI / 4,
            0.2,
            1.0
        );
        this.light.target = planetRoot;
        this.light.castShadow = true;
        this.light.shadow.mapSize.width = 2048;
        this.light.shadow.mapSize.height = 2048;
        this.light.shadow.camera.near = 0.1;
        this.light.shadow.camera.far = 100;
        this.light.shadow.bias = -0.0001;
        this.light.shadow.camera.fov = 45;
        this.light.shadow.camera.aspect = 1.0;

        this.scene.add(this.light);
        this.scene.add(this.light.target);

        const geometry = new THREE.IcosahedronGeometry(1, 6);
        this.uniforms = {
            uTime: { value: 0 },
            uNoiseScale: { value: this.params.sunNoiseScale },
            uNoiseStrength: { value: this.params.sunNoiseStrength },
            uPulseAmplitude: { value: this.params.sunPulseAmplitude },
            uPulseSpeed: { value: this.params.sunPulseSpeed },
            uBrightness: { value: this.params.sunGlowStrength },
            uHotspotStrength: { value: this.params.sunHotspotStrength },
            uBaseColor: { value: palette.base },
            uHighlightColor: { value: palette.highlight },
            uRimColor: { value: palette.rim }
        };

        const material = new THREE.ShaderMaterial({
            vertexShader: sunVertexShader,
            fragmentShader: sunFragmentShader,
            uniforms: this.uniforms,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            fog: false
        });

        this.sunVisual = new THREE.Mesh(geometry, material);
        this.sunVisual.name = "SunVisual";
        this.sunVisual.frustumCulled = false;
        this.scene.add(this.sunVisual);

        this._applyDistance();
        this._applySize();
    }

    update(time = 0) {
        if (this.planetRoot) {
            this.light.target.position.copy(this.planetRoot.position);
        }
        if (this.sunVisual) {
            this.sunVisual.position.copy(this.light.position);
            if (this.planetRoot) {
                this.sunVisual.lookAt(this.planetRoot.position);
            }
        }
        if (this.uniforms?.uTime) {
            this.uniforms.uTime.value = time;
        }
    }

    updateSun(params = {}) {
        this.applyParams(params);
    }

    getDirection() {
        return this.sunDirection.clone();
    }

    applyParams(newParams = {}) {
        Object.assign(this.params, newParams);

        if (newParams.sunColor) {
            const palette = createPalette(newParams.sunColor);
            this.light.color.copy(palette.base);
            this.uniforms.uBaseColor.value.copy(palette.base);
            this.uniforms.uHighlightColor.value.copy(palette.highlight);
            this.uniforms.uRimColor.value.copy(palette.rim);
        }
        if (newParams.sunIntensity !== undefined) {
            this.light.intensity = newParams.sunIntensity;
        }
        if (newParams.sunNoiseScale !== undefined) {
            this.uniforms.uNoiseScale.value = newParams.sunNoiseScale;
        }
        if (newParams.sunNoiseStrength !== undefined) {
            this.uniforms.uNoiseStrength.value = newParams.sunNoiseStrength;
        }
        if (newParams.sunPulseAmplitude !== undefined) {
            this.uniforms.uPulseAmplitude.value = newParams.sunPulseAmplitude;
        }
        if (newParams.sunPulseSpeed !== undefined) {
            this.uniforms.uPulseSpeed.value = newParams.sunPulseSpeed;
        }
        if (newParams.sunGlowStrength !== undefined) {
            this.uniforms.uBrightness.value = newParams.sunGlowStrength;
        }
        if (newParams.sunHotspotStrength !== undefined) {
            this.uniforms.uHotspotStrength.value = newParams.sunHotspotStrength;
        }
        if (newParams.sunSize !== undefined) {
            this._applySize();
        }
        if (newParams.sunDistance !== undefined) {
            this._applyDistance();
        }
    }

    _applySize() {
        if (!this.sunVisual) return;
        const size = (this.params.sunSize ?? DEFAULT_SUN_PARAMS.sunSize) * 0.38;
        this.sunVisual.scale.setScalar(size);
    }

    _applyDistance() {
        const dist = (this.params.sunDistance ?? DEFAULT_SUN_PARAMS.sunDistance) / 6.0;
        this.light.position.copy(this.sunDirection.clone().multiplyScalar(dist));
        if (this.sunVisual) {
            this.sunVisual.position.copy(this.light.position);
        }
    }
}
