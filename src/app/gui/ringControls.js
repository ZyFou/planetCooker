import * as THREE from "three";

export function setupRingControls({
	gui,
	params,
	guiControllers,
	registerFolder,
	unregisterFolder,
	applyControlSearch,
	scheduleShareUpdate,
	updateRings,
	getIsApplyingPreset,
	getRingsFolder
}) {
	const ringControlFolders = [];

	function shouldSkip() {
		return getIsApplyingPreset?.();
	}

	function ensureParams() {
		if (!Array.isArray(params.rings)) params.rings = [];
		if (typeof params.ringCount !== "number") params.ringCount = params.rings.length || 0;
	}

	function createDefaultRing(index = 0, planetSize = 1.0) {
		const rng = new THREE.MathUtils.seededRandom ? { next: THREE.MathUtils.seededRandom } : { next: Math.random };
		
		// Scale ring size based on planet size
		// Start rings just outside the planet surface (1.15x planet radius)
		const minRingRadius = planetSize * 1.15;
		const baseStart = minRingRadius + (index * 0.25 * planetSize);
		const thickness = (0.15 + (Math.random() * 0.2)) * planetSize;
		
		const style = index % 2 === 0 ? "Texture" : "Noise";
		const hue = (0.05 + (index * 0.15)) % 1;
		const saturation = 0.25 + Math.random() * 0.3;
		const lightness = 0.6 + Math.random() * 0.3;
		const color = new THREE.Color().setHSL(hue, saturation, lightness).getStyle();
		return {
			style,
			color,
			start: baseStart,
			end: baseStart + thickness,
			opacity: 0.5 + Math.random() * 0.3,
			noiseScale: 2.5 + Math.random() * 2.0,
			noiseStrength: 0.4 + Math.random() * 0.4,
			spinSpeed: (0.02 + Math.random() * 0.08) * (index % 2 === 0 ? 1 : -1),
			brightness: 0.8 + Math.random() * 0.4
		};
	}

	function normalizeRingSettings() {
		ensureParams();
		// Get current planet size for proper scaling
		const planetSize = params.planetType === 'gas' 
			? (params.gasPlanetSize || 2.0) 
			: (params.planetSize || 1.0);
			
		while (params.rings.length < (params.ringCount || 0)) {
			params.rings.push(createDefaultRing(params.rings.length, planetSize));
		}
		while (params.rings.length > (params.ringCount || 0)) {
			params.rings.pop();
		}
	}

	function rebuildRingControls() {
		ringControlFolders.splice(0, ringControlFolders.length).forEach((folder) => {
			unregisterFolder(folder);
			folder.destroy();
		});

		if (!params.ringEnabled) {
			applyControlSearch?.({ scrollToFirst: false });
			return;
		}

		normalizeRingSettings();
		const parent = getRingsFolder?.() || gui;
		// No folders when there are no rings
		if (!Array.isArray(params.rings) || params.rings.length === 0) {
			updateRings?.();
			applyControlSearch?.({ scrollToFirst: false });
			return;
		}
		params.rings.forEach((ring, index) => {
			const folder = registerFolder(parent.addFolder(`Ring ${index + 1}`));
			
			// Style and appearance
			folder
				.add(ring, "style", ["Texture", "Noise"]).name("Style").onChange(() => {
					if (shouldSkip()) return;
					updateRings?.();
					scheduleShareUpdate?.();
				});
			folder
				.addColor(ring, "color").name("Color").onChange(() => {
					updateRings?.();
					scheduleShareUpdate?.();
				});
			folder
				.add(ring, "brightness", 0.2, 3, 0.01).name("Brightness").onChange(() => {
					updateRings?.();
					scheduleShareUpdate?.();
				});
			folder
				.add(ring, "opacity", 0, 1, 0.01).name("Opacity").onChange(() => {
					updateRings?.();
					scheduleShareUpdate?.();
				});
			
			// Size and position
			folder
				.add(ring, "start", 1.05, 10, 0.01).name("Inner Radius").onChange(() => {
					if (ring.end < ring.start + 0.02) ring.end = ring.start + 0.02;
					updateRings?.();
					scheduleShareUpdate?.();
				});
			folder
				.add(ring, "end", 1.1, 12, 0.01).name("Outer Radius").onChange(() => {
					if (ring.end < ring.start + 0.02) ring.end = ring.start + 0.02;
					updateRings?.();
					scheduleShareUpdate?.();
				});
			
			// Texture/Noise properties
			folder
				.add(ring, "noiseScale", 0.2, 15, 0.1).name("Noise Scale").onChange(() => {
					updateRings?.();
					scheduleShareUpdate?.();
				});
			folder
				.add(ring, "noiseStrength", 0, 1, 0.01).name("Noise Strength").onChange(() => {
					updateRings?.();
					scheduleShareUpdate?.();
				});
			
			// Animation
			folder
				.add(ring, "spinSpeed", -2, 2, 0.01).name("Spin Speed").onChange(() => {
					scheduleShareUpdate?.();
				});
			
			ringControlFolders.push(folder);
		});

		applyControlSearch?.({ scrollToFirst: false });
	}

	ensureParams();
	guiControllers.rebuildRingControls = rebuildRingControls;
	guiControllers.normalizeRingSettings = normalizeRingSettings;

	return {
		rebuildRingControls,
		normalizeRingSettings
	};
}



