import * as THREE from "three";

export class Sun {
    constructor(scene, planetRoot) {
        this.scene = scene;
        this.planetRoot = planetRoot;

        // Create spotlight (acts as the sun)
        // The spotlight provides the sun direction to the shaders for lighting calculations
        const lightColor = new THREE.Color(0xffd27f);
        this.light = new THREE.SpotLight(lightColor, 1.6, 1000, Math.PI / 4, 0.2, 1.0);
        this.light.position.set(8, 4, 8);
        this.light.target = planetRoot;
        this.light.castShadow = true;
        this.light.shadow.mapSize.width = 2048;
        this.light.shadow.mapSize.height = 2048;
        this.light.shadow.camera.near = 0.1;
        this.light.shadow.camera.far = 100;
        this.light.shadow.bias = -0.0001;
        this.light.shadow.camera.fov = 45;
        this.light.shadow.camera.aspect = 1.0;

        // Add spotlight to scene
        this.scene.add(this.light);
        this.scene.add(this.light.target);

        // Note: Ambient light is added in main.js, so we don't add another one here
    }

    update() {
        // Update target position to match planet root
        if (this.planetRoot) {
            this.light.target.position.copy(this.planetRoot.position);
        }
    }

    updateSun() {
        // Alias for update() for compatibility
        this.update();
    }

    getDirection() {
        // Use fixed sun direction like planet.html
        // This is the direction FROM the sun TO the surface (for shader lighting)
        // In planet.html: new THREE.Vector3(1.0, 0.5, 1.0).normalize()
        return new THREE.Vector3(1.0, 0.5, 1.0).normalize();
    }
}
