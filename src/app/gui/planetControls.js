// Builds the planet, palette, motion, and environment sections in the settings GUI.
export function setupPlanetControls({
  gui,
  params,
  presets,
  starPresets = {},
  guiControllers,
  registerFolder,
  scheduleShareUpdate,
  markPlanetDirty,
  markMoonsDirty,
  handleSeedChanged,
  updatePalette,
  updateClouds,
  updateTilt,
  updateSun,
  updateRings,
  updateStarfieldUniforms,
  regenerateStarfield,
  updateGravityDisplay,
  initMoonPhysics,
  getIsApplyingPreset,
  getIsApplyingStarPreset,
  onPlanetTypeChange,
  onPresetChange,
  onStarPresetChange
}) {
  // Build grouped preset UI: base presets + Real Worlds
  const allPresetNames = Object.keys(presets);
  const shouldSkipStarUpdate = () => (getIsApplyingPreset?.() || getIsApplyingStarPreset?.());
  const presetFolder = registerFolder(gui.addFolder("Presets"), { close: true });

  const getPresetNamesForType = (type) => {
    const target = type === "gas_giant" ? "gas_giant" : "rocky";
    const names = allPresetNames.filter((name) => (presets[name]?.planetType || "rocky") === target);
    return names.length ? names : allPresetNames;
  };

  const ensurePresetSelection = (type) => {
    const options = getPresetNamesForType(type);
    if (!options.includes(params.preset)) {
      params.preset = options[0] || params.preset;
    }
    return options;
  };

  let presetController = presetFolder.add(params, "preset", ensurePresetSelection(params.planetType || "rocky")).name("Preset");
  guiControllers.preset = presetController;

  const attachPresetHandler = (controller) => {
    controller.onChange((value) => {
      if (getIsApplyingPreset()) return;
      onPresetChange?.(value);
    });
  };
  attachPresetHandler(presetController);

  const updatePresetOptions = (type) => {
    const options = ensurePresetSelection(type);
    const updatedController = presetController.options(options);
    guiControllers.preset = updatedController;
    presetController = updatedController;
    attachPresetHandler(updatedController);
    if (params.preset) {
      try { updatedController.setValue(params.preset); } catch {}
    }
  };
  guiControllers.updatePresetOptions = updatePresetOptions;

  // Real Worlds subfolder (predefined presets for solar system)
  const realWorldsFolder = registerFolder(presetFolder.addFolder("Real Worlds"), { close: true });
  const realWorldEntries = [
    { key: "mercury", label: "Mercury", preset: "Mercury", type: "rocky" },
    { key: "venus", label: "Venus", preset: "Venus", type: "rocky" },
    { key: "earth", label: "Earth", preset: "Earth-like", type: "rocky" },
    { key: "mars", label: "Mars", preset: "Mars", type: "rocky" },
    { key: "jupiter", label: "Jupiter", preset: "Jupiter", type: "gas_giant" },
    { key: "saturn", label: "Saturn", preset: "Saturn", type: "gas_giant" },
    { key: "uranus", label: "Uranus", preset: "Uranus", type: "gas_giant" },
    { key: "neptune", label: "Neptune", preset: "Neptune", type: "gas_giant" }
  ];
  const realWorldActions = {};
  const realWorldControllers = [];
  realWorldEntries.forEach((entry) => {
    realWorldActions[entry.key] = () => onPresetChange?.(entry.preset);
    const controller = realWorldsFolder.add(realWorldActions, entry.key).name(entry.label);
    realWorldControllers.push({ controller, type: entry.type });
  });

  const planetFolder = registerFolder(gui.addFolder("Planet"), { close: true });

  const rockyControllers = [];
  const rockyPaletteControllers = [];
  const gasGiantControllers = [];
  const gasGiantStrataControllers = [];

  const planetTypes = { Rocky: "rocky", "Gas Giant": "gas_giant" };
  guiControllers.planetType = planetFolder
    .add(params, "planetType", planetTypes)
    .name("Planet Type")
    .onChange((value) => {
      const nextType = value === "gas_giant" ? "gas_giant" : "rocky";
      guiControllers.updatePresetOptions?.(nextType);
      refreshPlanetTypeVisibility(nextType);
      onPlanetTypeChange?.(nextType, { fromUI: true });
    });

  guiControllers.seed = planetFolder
    .add(params, "seed")
    .name("Seed")
    .onFinishChange(() => {
      if (getIsApplyingPreset()) return;
      handleSeedChanged();
    });

  guiControllers.radius = planetFolder.add(params, "radius", 0.4, 4.2, 0.02)
    .name("Radius")
    .onFinishChange(() => {
      markPlanetDirty();
      markMoonsDirty();
      scheduleShareUpdate();
    });

  guiControllers.subdivisions = planetFolder.add(params, "subdivisions", 2, 6, 1)
    .name("Surface Detail")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyControllers.push(guiControllers.subdivisions);

  guiControllers.noiseLayers = planetFolder.add(params, "noiseLayers", 1, 8, 1)
    .name("Noise Layers")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyControllers.push(guiControllers.noiseLayers);

  guiControllers.noiseFrequency = planetFolder.add(params, "noiseFrequency", 0.3, 8, 0.05)
    .name("Noise Frequency")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyControllers.push(guiControllers.noiseFrequency);

  guiControllers.noiseAmplitude = planetFolder.add(params, "noiseAmplitude", 0, 1.4, 0.01)
    .name("Terrain Height")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyControllers.push(guiControllers.noiseAmplitude);

  guiControllers.persistence = planetFolder.add(params, "persistence", 0.2, 0.9, 0.01)
    .name("Persistence")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyControllers.push(guiControllers.persistence);

  guiControllers.lacunarity = planetFolder.add(params, "lacunarity", 1.2, 3.8, 0.01)
    .name("Lacunarity")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyControllers.push(guiControllers.lacunarity);

  guiControllers.oceanLevel = planetFolder.add(params, "oceanLevel", 0, 0.95, 0.01)
    .name("Ocean Level")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyControllers.push(guiControllers.oceanLevel);

  const paletteFolder = registerFolder(gui.addFolder("Palette"), { close: true });

  guiControllers.colorOcean = paletteFolder.addColor(params, "colorOcean")
    .name("Deep Water")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPaletteControllers.push(guiControllers.colorOcean);

  guiControllers.colorShallow = paletteFolder.addColor(params, "colorShallow")
    .name("Shallow Water")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPaletteControllers.push(guiControllers.colorShallow);

  guiControllers.colorFoam = paletteFolder.addColor(params, "colorFoam")
    .name("Shore Foam")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPaletteControllers.push(guiControllers.colorFoam);

  guiControllers.foamEnabled = paletteFolder.add(params, "foamEnabled")
    .name("Show Foam")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPaletteControllers.push(guiControllers.foamEnabled);

  guiControllers.colorLow = paletteFolder.addColor(params, "colorLow")
    .name("Lowlands")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPaletteControllers.push(guiControllers.colorLow);

  guiControllers.colorMid = paletteFolder.addColor(params, "colorMid")
    .name("Highlands")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPaletteControllers.push(guiControllers.colorMid);

  guiControllers.colorHigh = paletteFolder.addColor(params, "colorHigh")
    .name("Peaks")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPaletteControllers.push(guiControllers.colorHigh);

  guiControllers.colorCore = paletteFolder.addColor(params, "colorCore")
    .name("Core")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.coreEnabled = paletteFolder.add(params, "coreEnabled")
    .name("Enable Core")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.coreSize = paletteFolder.add(params, "coreSize", 0.05, 1.0, 0.01)
    .name("Core Size")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.coreVisible = paletteFolder.add(params, "coreVisible")
    .name("Show Core")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.atmosphereColor = paletteFolder.addColor(params, "atmosphereColor")
    .name("Atmosphere Color")
    .onChange(() => {
      updatePalette();
      updateClouds();
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.atmosphereOpacity = paletteFolder.add(params, "atmosphereOpacity", 0, 1, 0.01)
    .name("Atmosphere Opacity")
    .onChange(() => {
      updateClouds();
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.cloudsOpacity = paletteFolder.add(params, "cloudsOpacity", 0, 1, 0.01)
    .name("Cloud Opacity")
    .onChange(() => {
      updateClouds();
      scheduleShareUpdate();
    });

  guiControllers.cloudHeight = paletteFolder.add(params, "cloudHeight", 0, 0.3, 0.005)
    .name("Cloud Height")
    .onChange(() => {
      updateClouds();
      scheduleShareUpdate();
    });

  guiControllers.cloudDensity = paletteFolder.add(params, "cloudDensity", 0, 1, 0.01)
    .name("Cloud Density")
    .onChange(() => {
      updateClouds();
      scheduleShareUpdate();
    });

  guiControllers.cloudNoiseScale = paletteFolder.add(params, "cloudNoiseScale", 0.5, 8, 0.05)
    .name("Cloud Scale")
    .onChange(() => {
      updateClouds();
      scheduleShareUpdate();
    });

  const gasGiantFolder = registerFolder(planetFolder.addFolder("Gas Giant"), { close: true });

  const updateGasGiantStrataVisibility = (count = params.gasGiantStrataCount) => {
    const clamped = Math.max(1, Math.min(6, Math.round(count || 1)));
    gasGiantStrataControllers.forEach((entry, index) => {
      const show = index < clamped;
      const method = show ? "show" : "hide";
      entry.color?.[method]?.();
      entry.size?.[method]?.();
    });
  };

  guiControllers.gasGiantStrataCount = gasGiantFolder.add(params, "gasGiantStrataCount", 1, 6, 1)
    .name("Strata Count")
    .onChange((value) => {
      updateGasGiantStrataVisibility(value);
      markPlanetDirty();
      scheduleShareUpdate();
    });
  gasGiantControllers.push(guiControllers.gasGiantStrataCount);

  for (let i = 1; i <= 6; i += 1) {
    const colorKey = `gasGiantStrata${i}Color`;
    const sizeKey = `gasGiantStrata${i}Size`;
    const colorController = gasGiantFolder.addColor(params, colorKey)
      .name(`Stratum ${i} Color`)
      .onChange(() => {
        markPlanetDirty();
        scheduleShareUpdate();
      });
    const sizeController = gasGiantFolder.add(params, sizeKey, 0.02, 1, 0.01)
      .name(`Stratum ${i} Size`)
      .onChange(() => {
        markPlanetDirty();
        scheduleShareUpdate();
      });
    gasGiantStrataControllers.push({ color: colorController, size: sizeController });
    gasGiantControllers.push(colorController, sizeController);
  }

  guiControllers.gasGiantNoiseScale = gasGiantFolder.add(params, "gasGiantNoiseScale", 0.4, 6, 0.05)
    .name("Noise Scale")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  gasGiantControllers.push(guiControllers.gasGiantNoiseScale);

  guiControllers.gasGiantNoiseStrength = gasGiantFolder.add(params, "gasGiantNoiseStrength", 0, 1, 0.01)
    .name("Noise Strength")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  gasGiantControllers.push(guiControllers.gasGiantNoiseStrength);

  guiControllers.gasGiantBandContrast = gasGiantFolder.add(params, "gasGiantBandContrast", 0, 1, 0.01)
    .name("Band Contrast")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  gasGiantControllers.push(guiControllers.gasGiantBandContrast);

  guiControllers.gasGiantBandSoftness = gasGiantFolder.add(params, "gasGiantBandSoftness", 0.05, 0.6, 0.01)
    .name("Band Softness")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  gasGiantControllers.push(guiControllers.gasGiantBandSoftness);

  guiControllers.gasGiantOpacity = gasGiantFolder.add(params, "gasGiantOpacity", 0.4, 1, 0.01)
    .name("Layer Opacity")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  gasGiantControllers.push(guiControllers.gasGiantOpacity);

  const gasActions = {
    resetToRocky: () => {
      try { guiControllers.planetType?.setValue?.("rocky"); } catch {}
    }
  };
  const resetController = gasGiantFolder.add(gasActions, "resetToRocky").name("Reset to Rocky");
  gasGiantControllers.push(resetController);

  updateGasGiantStrataVisibility(params.gasGiantStrataCount);

  function refreshPlanetTypeVisibility(type = params.planetType) {
    const isGasGiant = type === "gas_giant";
    if (gasGiantFolder?.show) gasGiantFolder.show(isGasGiant);
    rockyControllers.forEach((controller) => {
      if (!controller) return;
      if (isGasGiant) controller.hide?.(); else controller.show?.();
    });
    rockyPaletteControllers.forEach((controller) => {
      if (!controller) return;
      if (isGasGiant) controller.hide?.(); else controller.show?.();
    });
    gasGiantControllers.forEach((controller) => {
      if (!controller) return;
      if (isGasGiant) controller.show?.(); else controller.hide?.();
    });
    realWorldControllers.forEach(({ controller, type }) => {
      if (!controller) return;
      if (!type || type === "both") {
        controller.show?.();
        return;
      }
      if (type === "gas_giant") {
        if (isGasGiant) controller.show?.(); else controller.hide?.();
      } else {
        if (isGasGiant) controller.hide?.(); else controller.show?.();
      }
    });
    if (isGasGiant) {
      updateGasGiantStrataVisibility(params.gasGiantStrataCount);
    }
  }
  guiControllers.refreshPlanetTypeVisibility = refreshPlanetTypeVisibility;
  refreshPlanetTypeVisibility(params.planetType || "rocky");

  const motionFolder = registerFolder(gui.addFolder("Motion"), { close: true });

  guiControllers.axisTilt = motionFolder.add(params, "axisTilt", 0, 45, 0.5)
    .name("Axis Tilt")
    .onChange(() => {
      updateTilt();
      scheduleShareUpdate();
    });

  guiControllers.rotationSpeed = motionFolder.add(params, "rotationSpeed", 0, 0.7, 0.005)
    .name("Rotation Speed")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.simulationSpeed = motionFolder.add(params, "simulationSpeed", 0.02, 2, 0.01)
    .name("Simulation Speed")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.cloudDriftSpeed = motionFolder.add(params, "cloudDriftSpeed", 0, 0.2, 0.001)
    .name("Cloud Drift")
    .onChange(() => {
      scheduleShareUpdate();
    });

  const environmentFolder = registerFolder(gui.addFolder("Environment"), { close: true });

  guiControllers.gravity = environmentFolder.add(params, "gravity", 0.1, 40, 0.1)
    .name("Gravity m/s^2")
    .onChange(() => {
      updateGravityDisplay();
      initMoonPhysics();
      scheduleShareUpdate();
    });

  const sunFolder = registerFolder(environmentFolder.addFolder("Star"), { close: true });

  const starOnlyControllers = [];
  const blackHoleControllers = [];

  const refreshStarVariantVisibility = (nextVariant = params.sunVariant) => {
    const showBlackHole = nextVariant === "Black Hole";
    starOnlyControllers.forEach((controller) => {
      if (!controller) return;
      if (showBlackHole) controller.hide(); else controller.show();
    });
    blackHoleControllers.forEach((controller) => {
      if (!controller) return;
      if (showBlackHole) controller.show(); else controller.hide();
    });
  };

  // Expose to main so programmatic variant changes can update visibility
  guiControllers.refreshStarVariantVisibility = refreshStarVariantVisibility;

  guiControllers.sunVariant = sunFolder.add(params, "sunVariant", ["Star", "Black Hole"])
    .name("Star Type")
    .onChange((value) => {
      refreshStarVariantVisibility(value);
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });

  const starPresetNames = Object.keys(starPresets);
  if (starPresetNames.length) {
    const starPresetController = sunFolder.add(params, "sunPreset", starPresetNames).name("Star Preset");
    guiControllers.sunPreset = starPresetController;
    starOnlyControllers.push(starPresetController);
    starPresetController.onChange((value) => {
      if (shouldSkipStarUpdate()) return;
      onStarPresetChange?.(value);
    });
  }

  guiControllers.sunColor = sunFolder.addColor(params, "sunColor")
    .name("Color")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });

  guiControllers.sunIntensity = sunFolder.add(params, "sunIntensity", 0.2, 4, 0.05)
    .name("Intensity")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });

  guiControllers.sunDistance = sunFolder.add(params, "sunDistance", 10, 160, 1)
    .name("Distance")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });

  guiControllers.sunSize = sunFolder.add(params, "sunSize", 0.5, 4, 0.05)
    .name("Core Size")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  starOnlyControllers.push(guiControllers.sunSize);

  guiControllers.sunHaloSize = sunFolder.add(params, "sunHaloSize", 2, 18, 0.1)
    .name("Halo Radius")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  starOnlyControllers.push(guiControllers.sunHaloSize);

  guiControllers.sunGlowStrength = sunFolder.add(params, "sunGlowStrength", 0.1, 3.5, 0.05)
    .name("Glow Strength")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  starOnlyControllers.push(guiControllers.sunGlowStrength);

  guiControllers.sunPulseSpeed = sunFolder.add(params, "sunPulseSpeed", 0, 2.5, 0.05)
    .name("Pulse Speed")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  starOnlyControllers.push(guiControllers.sunPulseSpeed);

  guiControllers.sunNoiseScale = sunFolder.add(params, "sunNoiseScale", 0.3, 4, 0.05)
    .name("Noise Scale")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  starOnlyControllers.push(guiControllers.sunNoiseScale);

  guiControllers.sunParticleCount = sunFolder.add(params, "sunParticleCount", 0, 600, 10)
    .name("Particle Count")
    .onFinishChange(() => {
      if (shouldSkipStarUpdate()) return;
      params.sunParticleCount = Math.round(params.sunParticleCount);
      updateSun();
      scheduleShareUpdate();
    });
  starOnlyControllers.push(guiControllers.sunParticleCount);

  guiControllers.sunParticleSpeed = sunFolder.add(params, "sunParticleSpeed", 0, 2, 0.01)
    .name("Particle Speed")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  starOnlyControllers.push(guiControllers.sunParticleSpeed);

  guiControllers.sunParticleSize = sunFolder.add(params, "sunParticleSize", 0.02, 0.3, 0.01)
    .name("Particle Size")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  starOnlyControllers.push(guiControllers.sunParticleSize);

  guiControllers.sunParticleLifetime = sunFolder.add(params, "sunParticleLifetime", 0.5, 8, 0.1)
    .name("Particle Lifetime")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  starOnlyControllers.push(guiControllers.sunParticleLifetime);

  guiControllers.sunParticleColor = sunFolder.addColor(params, "sunParticleColor")
    .name("Particle Color")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  starOnlyControllers.push(guiControllers.sunParticleColor);

  guiControllers.blackHoleCoreSize = sunFolder.add(params, "blackHoleCoreSize", 0.2, 3.5, 0.05)
    .name("Horizon Radius")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleCoreSize);

  guiControllers.blackHoleDiskEnabled = sunFolder.add(params, "blackHoleDiskEnabled")
    .name("Show Disk")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleDiskEnabled);

  guiControllers.blackHoleHaloEnabled = sunFolder.add(params, "blackHoleHaloEnabled")
    .name("Show Halo")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleHaloEnabled);

  guiControllers.blackHoleDiskRadius = sunFolder.add(params, "blackHoleDiskRadius", 0.6, 6.5, 0.05)
    .name("Disk Radius")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleDiskRadius);

  guiControllers.blackHoleDiskThickness = sunFolder.add(params, "blackHoleDiskThickness", 0.05, 0.9, 0.01)
    .name("Disk Thickness")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleDiskThickness);

  guiControllers.blackHoleDiskIntensity = sunFolder.add(params, "blackHoleDiskIntensity", 0, 4, 0.05)
    .name("Disk Brightness")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleDiskIntensity);

  guiControllers.blackHoleHaloIntensity = sunFolder.add(params, "blackHoleHaloIntensity", 0, 4, 0.05)
    .name("Halo Brightness")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleHaloIntensity);

  // Styles for disk and halo
  guiControllers.blackHoleDiskStyle = sunFolder.add(params, "blackHoleDiskStyle", ["Noise", "Texture", "Flat"]).name("Disk Style")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleDiskStyle);

  guiControllers.blackHoleHaloStyle = sunFolder.add(params, "blackHoleHaloStyle", ["Noise", "Texture", "Flat"]).name("Halo Style")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleHaloStyle);

  guiControllers.blackHoleDiskTilt = sunFolder.add(params, "blackHoleDiskTilt", -90, 90, 1)
    .name("Disk Tilt")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleDiskTilt);

  guiControllers.blackHoleDiskYaw = sunFolder.add(params, "blackHoleDiskYaw", -180, 180, 1)
    .name("Disk Yaw")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleDiskYaw);

  guiControllers.blackHoleDiskTwist = sunFolder.add(params, "blackHoleDiskTwist", -180, 180, 1)
    .name("Disk Twist")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleDiskTwist);

  guiControllers.blackHoleSpinSpeed = sunFolder.add(params, "blackHoleSpinSpeed", -2, 2, 0.01)
    .name("Disk Spin Speed")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleSpinSpeed);

  guiControllers.blackHoleHaloSpinSpeed = sunFolder.add(params, "blackHoleHaloSpinSpeed", -2, 2, 0.01)
    .name("Halo Spin Speed")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleHaloSpinSpeed);

  guiControllers.blackHoleDiskNoiseScale = sunFolder.add(params, "blackHoleDiskNoiseScale", 0.1, 4, 0.05)
    .name("Disk Noise Scale")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleDiskNoiseScale);

  guiControllers.blackHoleDiskNoiseStrength = sunFolder.add(params, "blackHoleDiskNoiseStrength", 0, 1, 0.01)
    .name("Disk Noise Strength")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleDiskNoiseStrength);

  guiControllers.blackHoleHaloRadius = sunFolder.add(params, "blackHoleHaloRadius", 0.8, 7.5, 0.05)
    .name("Halo Radius")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleHaloRadius);

  guiControllers.blackHoleHaloAngle = sunFolder.add(params, "blackHoleHaloAngle", 0, 170, 1)
    .name("Halo Angle")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleHaloAngle);

  guiControllers.blackHoleHaloThickness = sunFolder.add(params, "blackHoleHaloThickness", 0.05, 0.9, 0.01)
    .name("Halo Thickness")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleHaloThickness);

  guiControllers.blackHoleHaloIntensity = sunFolder.add(params, "blackHoleHaloIntensity", 0, 3, 0.05)
    .name("Halo Brightness")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleHaloIntensity);

  guiControllers.blackHoleHaloNoiseScale = sunFolder.add(params, "blackHoleHaloNoiseScale", 0.1, 4, 0.05)
    .name("Halo Noise Scale")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleHaloNoiseScale);

  guiControllers.blackHoleHaloNoiseStrength = sunFolder.add(params, "blackHoleHaloNoiseStrength", 0, 1, 0.01)
    .name("Halo Noise Strength")
    .onChange(() => {
      if (shouldSkipStarUpdate()) return;
      updateSun();
      scheduleShareUpdate();
    });
  blackHoleControllers.push(guiControllers.blackHoleHaloNoiseStrength);

  refreshStarVariantVisibility();

  const spaceFolder = registerFolder(environmentFolder.addFolder("Sky"), { close: true });

  guiControllers.starCount = spaceFolder.add(params, "starCount", 500, 4000, 50)
    .name("Star Count")
    .onFinishChange(() => {
      params.starCount = Math.round(params.starCount);
      regenerateStarfield();
      scheduleShareUpdate();
    });

  guiControllers.starBrightness = spaceFolder.add(params, "starBrightness", 0.2, 2, 0.01)
    .name("Brightness")
    .onChange(() => {
      updateStarfieldUniforms();
      scheduleShareUpdate();
    });

  guiControllers.starTwinkleSpeed = spaceFolder.add(params, "starTwinkleSpeed", 0, 2.5, 0.01)
    .name("Twinkle Speed")
    .onChange(() => {
      updateStarfieldUniforms();
      scheduleShareUpdate();
    });

  // Rings (overview + global controls; per-ring controls are managed in ringControls.js)
  const ringsFolder = registerFolder(environmentFolder.addFolder("Rings"), { close: true });

  guiControllers.ringEnabled = ringsFolder.add(params, "ringEnabled")
    .name("Enable Rings")
    .onChange(() => {
      guiControllers.rebuildRingControls?.();
      updateRings?.();
      scheduleShareUpdate();
    });

  // Number of ring segments
  if (typeof params.ringCount === "number") {
    guiControllers.ringCount = ringsFolder.add(params, "ringCount", 0, 6, 1)
      .name("Ring Count")
      .onChange(() => {
        // Per-ring controls module will react and rebuild controls
        guiControllers.normalizeRingSettings?.();
        guiControllers.rebuildRingControls?.();
        updateRings?.();
        scheduleShareUpdate();
      });
  }

  guiControllers.ringAngle = ringsFolder.add(params, "ringAngle", -90, 90, 0.5)
    .name("Angle (deg)")
    .onChange(() => {
      updateRings?.();
      scheduleShareUpdate();
    });

  // Keep a global spin speed for convenience (per-ring spin can also exist)
  if (typeof params.ringSpinSpeed === "number") {
    guiControllers.ringSpinSpeed = ringsFolder.add(params, "ringSpinSpeed", -2, 2, 0.01)
      .name("Global Spin Speed")
      .onChange(() => {
        scheduleShareUpdate();
      });
  }

  guiControllers.ringAllowRandom = ringsFolder.add(params, "ringAllowRandom")
    .name("Allow Surprise Me")
    .onChange(() => {
      scheduleShareUpdate();
    });

  // Effects: Explosions
  const effectsFolder = registerFolder(environmentFolder.addFolder("Explosions"), { close: true });

  guiControllers.explosionEnabled = effectsFolder.add(params, "explosionEnabled")
    .name("Enable Explosions")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.explosionColor = effectsFolder.addColor(params, "explosionColor")
    .name("Color")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.explosionStrength = effectsFolder.add(params, "explosionStrength", 0.2, 3, 0.05)
    .name("Strength Multiplier")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.explosionParticleBase = effectsFolder.add(params, "explosionParticleBase", 10, 400, 1)
    .name("Particle Count")
    .onChange(() => {
      params.explosionParticleBase = Math.round(params.explosionParticleBase);
      scheduleShareUpdate();
    });

  guiControllers.explosionSize = effectsFolder.add(params, "explosionSize", 0.1, 3, 0.05)
    .name("Particle Size")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.explosionGravity = effectsFolder.add(params, "explosionGravity", 0, 20, 0.1)
    .name("Gravity Pull (Disabled)")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.explosionDamping = effectsFolder.add(params, "explosionDamping", 0.6, 1, 0.01)
    .name("Damping")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.explosionLifetime = effectsFolder.add(params, "explosionLifetime", 0.3, 5, 0.05)
    .name("Lifetime (s)")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.explosionColorVariation = effectsFolder.add(params, "explosionColorVariation", 0, 1, 0.05)
    .name("Color Variation")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.explosionSpeedVariation = effectsFolder.add(params, "explosionSpeedVariation", 0.2, 3, 0.05)
    .name("Speed Variation")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.explosionSizeVariation = effectsFolder.add(params, "explosionSizeVariation", 0.2, 2, 0.05)
    .name("Size Variation")
    .onChange(() => {
      scheduleShareUpdate();
    });

  // Attach folders on guiControllers so other modules (rings) can find them
  guiControllers.folders = {
    planetFolder,
    paletteFolder,
    motionFolder,
    environmentFolder,
    sunFolder,
    ringsFolder,
    spaceFolder,
    effectsFolder
  };

  return {
    presetController,
    folders: guiControllers.folders
  };
}

