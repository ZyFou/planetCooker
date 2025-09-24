import * as THREE from 'three';

const lodLevels = [
    {
        distance: 5,
        subdivisions: 7,
        noiseFrequency: 1.0,
        noiseAmplitude: 1.0,
        cloudDensity: 1.0,
    },
    {
        distance: 15,
        subdivisions: 6,
        noiseFrequency: 0.8,
        noiseAmplitude: 0.9,
        cloudDensity: 0.9,
    },
    {
        distance: 30,
        subdivisions: 5,
        noiseFrequency: 0.6,
        noiseAmplitude: 0.7,
        cloudDensity: 0.7,
    },
    {
        distance: 60,
        subdivisions: 4,
        noiseFrequency: 0.4,
        noiseAmplitude: 0.5,
        cloudDensity: 0.5,
    },
    {
        distance: 120,
        subdivisions: 3,
        noiseFrequency: 0.2,
        noiseAmplitude: 0.3,
        cloudDensity: 0.3,
    },
];

export class LODManager {
    constructor(camera, params) {
        this.camera = camera;
        this.originalParams = { ...params };
        this.lodParams = { ...params };
        this.currentLODIndex = -1;
        this.subdivisionChanged = false;
    }

    update(target) {
        const distance = this.camera.position.distanceTo(target.position);

        let lowerLOD, upperLOD, t;

        if (distance <= lodLevels[0].distance) {
            lowerLOD = lodLevels[0];
            upperLOD = lodLevels[0];
            t = 0;
        } else if (distance >= lodLevels[lodLevels.length - 1].distance) {
            lowerLOD = lodLevels[lodLevels.length - 1];
            upperLOD = lodLevels[lodLevels.length - 1];
            t = 1;
        } else {
            for (let i = 0; i < lodLevels.length - 1; i++) {
                if (distance >= lodLevels[i].distance && distance < lodLevels[i + 1].distance) {
                    lowerLOD = lodLevels[i];
                    upperLOD = lodLevels[i + 1];
                    t = (distance - lowerLOD.distance) / (upperLOD.distance - lowerLOD.distance);
                    break;
                }
            }
        }

        const newLODIndex = lodLevels.indexOf(lowerLOD);
        if (this.currentLODIndex !== newLODIndex) {
            this.subdivisionChanged = true;
            this.currentLODIndex = newLODIndex;
        } else {
            this.subdivisionChanged = false;
        }

        this.lodParams.subdivisions = lowerLOD.subdivisions;
        this.lodParams.noiseFrequency = this.originalParams.noiseFrequency * THREE.MathUtils.lerp(lowerLOD.noiseFrequency, upperLOD.noiseFrequency, t);
        this.lodParams.noiseAmplitude = this.originalParams.noiseAmplitude * THREE.MathUtils.lerp(lowerLOD.noiseAmplitude, upperLOD.noiseAmplitude, t);
        this.lodParams.cloudDensity = this.originalParams.cloudDensity * THREE.MathUtils.lerp(lowerLOD.cloudDensity, upperLOD.cloudDensity, t);
    }
}
