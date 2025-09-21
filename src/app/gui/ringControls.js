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

	function createDefaultRing(index = 0) {
		const rng = new THREE.MathUtils.seededRandom ? { next: THREE.MathUtils.seededRandom } : { next: Math.random };
		const baseStart = 1.4 + (index * 0.25);
		const thickness = 0.22;
		const style = "Texture";
		const color = new THREE.Color().setHSL((0.1 + (index * 0.12)) % 1, 0.35, 0.7).getStyle();
		return {
			style,
			color,
			start: baseStart,
			end: baseStart + thickness,
			opacity: 0.6,
			noiseScale: 3.2,
			noiseStrength: 0.55,
			spinSpeed: 0.05 * (index % 2 === 0 ? 1 : -1),
			brightness: 1
		};
	}

	function normalizeRingSettings() {
		ensureParams();
		while (params.rings.length < (params.ringCount || 0)) {
			params.rings.push(createDefaultRing(params.rings.length));
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
		params.rings.forEach((ring, index) => {
			const folder = registerFolder(parent.addFolder(`Ring ${index + 1}`));
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
				.add(ring, "brightness", 0.2, 2, 0.01).name("Brightness").onChange(() => {
					updateRings?.();
					scheduleShareUpdate?.();
				});
			folder
				.add(ring, "start", 1.05, 10, 0.01).name("Start (radii)").onChange(() => {
					if (ring.end < ring.start + 0.02) ring.end = ring.start + 0.02;
					updateRings?.();
					scheduleShareUpdate?.();
				});
			folder
				.add(ring, "end", 1.1, 12, 0.01).name("End (radii)").onChange(() => {
					if (ring.end < ring.start + 0.02) ring.end = ring.start + 0.02;
					updateRings?.();
					scheduleShareUpdate?.();
				});
			folder
				.add(ring, "noiseScale", 0.2, 10, 0.1).name("Noise Scale").onChange(() => {
					updateRings?.();
					scheduleShareUpdate?.();
				});
			folder
				.add(ring, "noiseStrength", 0, 1, 0.01).name("Noise Strength").onChange(() => {
					updateRings?.();
					scheduleShareUpdate?.();
				});
			folder
				.add(ring, "spinSpeed", -2, 2, 0.01).name("Noise/Spin Speed").onChange(() => {
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


