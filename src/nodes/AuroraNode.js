import * as THREE from "three";
import auroraVertexShader from "../shaders/aurora.vert.glsl?raw";
import auroraFragmentShader from "../shaders/aurora.frag.glsl?raw";

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
                uPlanetRadius: { value: this.params.radius },
                uSunDir: { value: new THREE.Vector3(1, 0, 0) },
                uAuroraColor1: { value: new THREE.Color("#38ff7a") },
                uAuroraColor2: { value: new THREE.Color("#3fb4ff") },
                uLatitudeCenter: { value: 65 * (Math.PI / 180) },
                uLatitudeWidth: { value: 12 * (Math.PI / 180) },
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

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.renderOrder = 10; // Render after atmosphere
    }

    update(delta, camera) {
        this.material.uniforms.uTime.value += delta;

        const sunDirection = new THREE.Vector3();
        sunDirection.subVectors(this.planet.sun.sunGroup.position, this.planet.planetRoot.position).normalize();
        this.material.uniforms.uSunDir.value.copy(sunDirection);
    }
}
