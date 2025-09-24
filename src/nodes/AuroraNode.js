import * as THREE from "three";
import auroraVertexShader from "../shaders/aurora.vert.glsl?raw";
import auroraFragmentShader from "../shaders/aurora.frag.glsl?raw";

const DEFAULT_AURORA_COLORS = ["#38ff7a", "#3fb4ff"];
const BASE_RADIUS_OFFSET = 0.01;

export class AuroraNode {
    constructor(planet) {
        this.planet = planet;
        this.params = planet.params;

        const geometry = new THREE.SphereGeometry(1, 64, 64);
        this.material = new THREE.ShaderMaterial({
            vertexShader: auroraVertexShader,
            fragmentShader: auroraFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uSunDir: { value: new THREE.Vector3(1, 0, 0) },
                uAuroraColor1: { value: new THREE.Color(DEFAULT_AURORA_COLORS[0]) },
                uAuroraColor2: { value: new THREE.Color(DEFAULT_AURORA_COLORS[1]) },
                uLatitudeCenter: { value: THREE.MathUtils.degToRad(65) },
                uLatitudeWidth: { value: THREE.MathUtils.degToRad(12) },
                uHeight: { value: 0.06 },
                uIntensity: { value: 1.0 },
                uNoiseScale: { value: 2.0 },
                uBanding: { value: 0.8 },
                uNightBoost: { value: 1.5 },
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this.sunDirection = new THREE.Vector3(1, 0, 0);
        this.sunWorldPosition = new THREE.Vector3();
        this.planetWorldPosition = new THREE.Vector3();
        this._configKey = null;

        this.northMesh = new THREE.Mesh(geometry, this.material);
        this.northMesh.renderOrder = 10;

        this.southMesh = new THREE.Mesh(geometry, this.material);
        this.southMesh.renderOrder = 10;
        this.southMesh.rotation.y = Math.PI;

        this.mesh = new THREE.Group();
        this.mesh.add(this.northMesh);
        this.mesh.add(this.southMesh);

        this.applyParams(true);
    }

    applyParams(force = false) {
        const auroraParams = this.params.aurora || {};
        const radius = Math.max(0.01, this.params.radius || 1);
        const enabled = !!auroraParams.enabled;

        const colorArray = Array.isArray(auroraParams.colors) ? auroraParams.colors : DEFAULT_AURORA_COLORS;
        const color1 = colorArray?.[0] || DEFAULT_AURORA_COLORS[0];
        const color2 = colorArray?.[1] || DEFAULT_AURORA_COLORS[1];

        const latitudeCenter = THREE.MathUtils.degToRad(auroraParams.latitudeCenterDeg ?? 65);
        const latitudeWidth = THREE.MathUtils.degToRad(auroraParams.latitudeWidthDeg ?? 12);
        const height = Math.max(0.0, auroraParams.height ?? 0.06);
        const intensity = auroraParams.intensity ?? 1.0;
        const noiseScale = auroraParams.noiseScale ?? 2.0;
        const banding = THREE.MathUtils.clamp(auroraParams.banding ?? 0.8, 0, 1);
        const nightBoost = auroraParams.nightBoost ?? 1.5;

        const configKey = [
            enabled ? 1 : 0,
            color1,
            color2,
            latitudeCenter.toFixed(4),
            latitudeWidth.toFixed(4),
            height.toFixed(4),
            intensity.toFixed(4),
            noiseScale.toFixed(4),
            banding.toFixed(4),
            nightBoost.toFixed(4),
            radius.toFixed(4)
        ].join("|");

        if (!force && configKey === this._configKey) {
            return;
        }
        this._configKey = configKey;

        const uniforms = this.material.uniforms;
        uniforms.uAuroraColor1.value.set(color1);
        uniforms.uAuroraColor2.value.set(color2);
        uniforms.uLatitudeCenter.value = latitudeCenter;
        uniforms.uLatitudeWidth.value = latitudeWidth;
        uniforms.uHeight.value = height;
        uniforms.uIntensity.value = intensity;
        uniforms.uNoiseScale.value = noiseScale;
        uniforms.uBanding.value = banding;
        uniforms.uNightBoost.value = nightBoost;

        const shellScale = radius * (1 + BASE_RADIUS_OFFSET);
        this.mesh.scale.setScalar(shellScale);

        this.mesh.visible = enabled;
        this.northMesh.visible = enabled;
        this.southMesh.visible = enabled;
    }

    update(delta) {
        this.applyParams();

        const uniforms = this.material.uniforms;
        uniforms.uTime.value += delta;

        if (!this.planet?.sun?.sunGroup || !this.planet?.planetRoot) {
            return;
        }

        this.planet.sun.sunGroup.getWorldPosition(this.sunWorldPosition);
        this.planet.planetRoot.getWorldPosition(this.planetWorldPosition);
        this.sunDirection.subVectors(this.sunWorldPosition, this.planetWorldPosition).normalize();
        uniforms.uSunDir.value.copy(this.sunDirection);
    }
}
