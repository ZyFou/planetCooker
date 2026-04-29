import * as THREE from "three";

function pickPlanetPalette(params = {}) {
    const isGas = params.planetType === "gas" || params.planetType === "gas_giant";
    const keys = isGas
        ? [
            "gasColor1",
            "gasColor2",
            "gasColor3",
            "gasColor4",
            "gasColor5",
            "gasGiantStrataColor1",
            "gasGiantStrataColor2",
            "gasGiantStrataColor3",
            "gasGiantStrataColor4",
            "gasGiantStrataColor5",
            "gasGiantStrataColor6",
            "atmosphereColor"
        ]
        : [
            "colorBeach",
            "colorGrass",
            "colorForest",
            "colorMountain",
            "colorMountainHigh",
            "colorSnow",
            "colorLow",
            "colorMid",
            "colorHigh",
            "colorShallow",
            "atmosphereColor"
        ];

    const colors = [];
    keys.forEach((key) => {
        if (!params[key]) return;
        try {
            colors.push(new THREE.Color(params[key]));
        } catch {
            // Ignore malformed shared/preset colors.
        }
    });

    if (colors.length > 0) return colors;
    return [new THREE.Color(isGas ? "#d8c4a2" : "#8f8578")];
}

export function getHarmonizedRingColor(params = {}, index = 0, random = Math.random) {
    const palette = pickPlanetPalette(params);
    const base = palette[index % palette.length].clone();
    const neighbor = palette[(index + 1) % palette.length] || base;
    base.lerp(neighbor, 0.18 + random() * 0.28);

    const hsl = {};
    base.getHSL(hsl);
    const hueShift = (random() - 0.5) * 0.045;
    const saturation = THREE.MathUtils.clamp(hsl.s * 0.48 + 0.08 + random() * 0.08, 0.08, 0.42);
    const lightness = THREE.MathUtils.clamp(hsl.l * 0.58 + 0.28 + random() * 0.12, 0.28, 0.78);

    const mineral = new THREE.Color().setHSL((hsl.h + hueShift + 1) % 1, saturation, lightness);
    mineral.lerp(new THREE.Color("#b8b0a0"), 0.16 + random() * 0.18);
    return mineral.getStyle();
}

export function createDefaultRing(index = 0, planetSize = 1.0, params = {}, random = Math.random) {
    const minRingRadius = planetSize * 1.15;
    const baseStart = minRingRadius + (index * 0.25 * planetSize);
    const thickness = (0.15 + (random() * 0.2)) * planetSize;

    return {
        style: index % 2 === 0 ? "Texture" : "Noise",
        color: getHarmonizedRingColor(params, index, random),
        start: baseStart,
        end: baseStart + thickness,
        opacity: 0.55 + random() * 0.25,
        noiseScale: 2.0 + random() * 1.8,
        noiseStrength: 0.25 + random() * 0.28,
        spinSpeed: (0.02 + random() * 0.08) * (index % 2 === 0 ? 1 : -1),
        brightness: 0.85 + random() * 0.35
    };
}
