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
  onPresetChange,
  onStarPresetChange
}) {
  // Initialize folders object early so it can be used throughout the function
  guiControllers.folders = guiControllers.folders || {};
  
  // Build grouped preset UI: base presets + Real Worlds
  const presetNames = Object.keys(presets);
  const shouldSkipStarUpdate = () => (getIsApplyingPreset?.() || getIsApplyingStarPreset?.());
  const presetFolder = registerFolder(gui.addFolder("Presets"), { close: true });
  const presetController = presetFolder.add(params, "preset", presetNames).name("Preset");
  guiControllers.preset = presetController;

  function updatePresetList(planetType) {
    const filteredPresets = Object.keys(presets).filter(p => (presets[p].planetType || 'rocky') === planetType);
    presetController.options(filteredPresets);
    if (!filteredPresets.includes(params.preset)) {
      params.preset = filteredPresets[0];
      onPresetChange?.(params.preset);
    }
    presetController.setValue(params.preset);
  }

  presetController.onChange((value) => {
    if (getIsApplyingPreset()) return;
    onPresetChange?.(value);
  });

  // Real Worlds subfolder (predefined presets for solar system)
  const realWorldsFolder = registerFolder(presetFolder.addFolder("Real Worlds"), { close: true });
  const real = {
    mercury: () => onPresetChange?.("Mercury"),
    venus: () => onPresetChange?.("Venus"),
    earth: () => onPresetChange?.("Earth-like"),
    mars: () => onPresetChange?.("Mars"),
    jupiter: () => onPresetChange?.("Jupiter"),
    saturn: () => onPresetChange?.("Saturn"),
    uranus: () => onPresetChange?.("Uranus"),
    neptune: () => onPresetChange?.("Neptune")
  };
  realWorldsFolder.add(real, "mercury").name("Mercury");
  realWorldsFolder.add(real, "venus").name("Venus");
  realWorldsFolder.add(real, "earth").name("Earth");
  realWorldsFolder.add(real, "mars").name("Mars");
  realWorldsFolder.add(real, "jupiter").name("Jupiter");
  realWorldsFolder.add(real, "saturn").name("Saturn");
  realWorldsFolder.add(real, "uranus").name("Uranus");
  realWorldsFolder.add(real, "neptune").name("Neptune");

  const planetFolder = registerFolder(gui.addFolder("Planet"), { close: true });

  const rockyPlanetControllers = [];
  const gasGiantControllers = [];

  const refreshPlanetTypeVisibility = (nextPlanetType = params.planetType) => {
    const showGasGiant = nextPlanetType === "gas_giant";
    if (guiControllers.folders.gasGiantFolder) {
      if (showGasGiant) guiControllers.folders.gasGiantFolder.show();
      else guiControllers.folders.gasGiantFolder.hide();
    }
    rockyPlanetControllers.forEach((controller) => {
      if (!controller) return;
      if (showGasGiant) controller.hide();
      else controller.show();
    });
  };

  guiControllers.refreshPlanetTypeVisibility = refreshPlanetTypeVisibility;

  guiControllers.planetType = planetFolder.add(params, "planetType", ["rocky", "gas_giant"])
    .name("Planet Type")
    .onChange((value) => {
      refreshPlanetTypeVisibility(value);
      updatePresetList(value);
      markPlanetDirty();
      scheduleShareUpdate();
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
  rockyPlanetControllers.push(guiControllers.subdivisions);

  guiControllers.noiseLayers = planetFolder.add(params, "noiseLayers", 1, 8, 1)
    .name("Noise Layers")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.noiseLayers);

  guiControllers.noiseFrequency = planetFolder.add(params, "noiseFrequency", 0.3, 8, 0.05)
    .name("Noise Frequency")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.noiseFrequency);

  guiControllers.noiseAmplitude = planetFolder.add(params, "noiseAmplitude", 0, 1.4, 0.01)
    .name("Terrain Height")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.noiseAmplitude);

  guiControllers.persistence = planetFolder.add(params, "persistence", 0.2, 0.9, 0.01)
    .name("Persistence")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.persistence);

  guiControllers.lacunarity = planetFolder.add(params, "lacunarity", 1.2, 3.8, 0.01)
    .name("Lacunarity")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.lacunarity);

  guiControllers.oceanLevel = planetFolder.add(params, "oceanLevel", 0, 0.95, 0.01)
    .name("Ocean Level")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.oceanLevel);

  const gasGiantFolder = registerFolder(planetFolder.addFolder("Gas Giant"), { close: true });
  guiControllers.folders.gasGiantFolder = gasGiantFolder;

  guiControllers.gasGiantStrataCount = gasGiantFolder.add(params, "gasGiantStrataCount", 1, 6, 1)
    .name("Strata Count")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
      // Re-build strata controls when count changes
      rebuildStrataControls();
    });
  gasGiantControllers.push(guiControllers.gasGiantStrataCount);

  const strataControllers = [];
  function rebuildStrataControls() {
    // Clear existing strata controls
    strataControllers.forEach(c => c.destroy());
    strataControllers.length = 0;

    for (let i = 1; i <= params.gasGiantStrataCount; i++) {
      const colorCtrl = gasGiantFolder.addColor(params, `gasGiantStrataColor${i}`).name(`Color ${i}`);
      const sizeCtrl = gasGiantFolder.add(params, `gasGiantStrataSize${i}`, 0, 1, 0.01).name(`Size ${i}`);

      colorCtrl.onChange(() => {
        markPlanetDirty();
        scheduleShareUpdate();
      });

      sizeCtrl.onFinishChange(() => {
        markPlanetDirty();
        scheduleShareUpdate();
      });

      strataControllers.push(colorCtrl);
      strataControllers.push(sizeCtrl);
    }
  }

  rebuildStrataControls(); // Initial build

  guiControllers.gasGiantNoiseScale = gasGiantFolder.add(params, "gasGiantNoiseScale", 0.1, 10, 0.1)
    .name("Noise Scale")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  gasGiantControllers.push(guiControllers.gasGiantNoiseScale);

  guiControllers.gasGiantNoiseStrength = gasGiantFolder.add(params, "gasGiantNoiseStrength", 0, 1, 0.01)
    .name("Noise Strength")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  gasGiantControllers.push(guiControllers.gasGiantNoiseStrength);

  guiControllers.gasGiantStrataWarp = gasGiantFolder.add(params, "gasGiantStrataWarp", 0, 0.2, 0.001)
    .name("Strata Warp")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  gasGiantControllers.push(guiControllers.gasGiantStrataWarp);

  guiControllers.gasGiantStrataWarpScale = gasGiantFolder.add(params, "gasGiantStrataWarpScale", 0.5, 20, 0.1)
    .name("Warp Scale")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  gasGiantControllers.push(guiControllers.gasGiantStrataWarpScale);

  const paletteFolder = registerFolder(gui.addFolder("Palette"), { close: true });

  guiControllers.colorOcean = paletteFolder.addColor(params, "colorOcean")
    .name("Deep Water")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.colorOcean);

  guiControllers.colorShallow = paletteFolder.addColor(params, "colorShallow")
    .name("Shallow Water")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.colorShallow);

  guiControllers.colorFoam = paletteFolder.addColor(params, "colorFoam")
    .name("Shore Foam")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.colorFoam);

  guiControllers.foamEnabled = paletteFolder.add(params, "foamEnabled")
    .name("Show Foam")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.foamEnabled);

  guiControllers.colorLow = paletteFolder.addColor(params, "colorLow")
    .name("Lowlands")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.colorLow);

  guiControllers.colorMid = paletteFolder.addColor(params, "colorMid")
    .name("Highlands")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.colorMid);

  guiControllers.colorHigh = paletteFolder.addColor(params, "colorHigh")
    .name("Peaks")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.colorHigh);

  guiControllers.colorCore = paletteFolder.addColor(params, "colorCore")
    .name("Core")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.colorCore);

  guiControllers.coreEnabled = paletteFolder.add(params, "coreEnabled")
    .name("Enable Core")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.coreEnabled);

  guiControllers.coreSize = paletteFolder.add(params, "coreSize", 0.05, 1.0, 0.01)
    .name("Core Size")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.coreSize);

  guiControllers.coreVisible = paletteFolder.add(params, "coreVisible")
    .name("Show Core")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.coreVisible);

  // Ice Poles section
  guiControllers.icePolesEnabled = paletteFolder.add(params, "icePolesEnabled")
    .name("Ice Poles")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.icePolesEnabled);

  guiControllers.icePolesCoverage = paletteFolder.add(params, "icePolesCoverage", 0.01, 0.5, 0.01)
    .name("Ice Coverage")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.icePolesCoverage);

  guiControllers.icePolesColor = paletteFolder.addColor(params, "icePolesColor")
    .name("Ice Color")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.icePolesColor);

  guiControllers.icePolesNoiseScale = paletteFolder.add(params, "icePolesNoiseScale", 0.5, 8.0, 0.1)
    .name("Ice Noise Scale")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.icePolesNoiseScale);

  guiControllers.icePolesNoiseStrength = paletteFolder.add(params, "icePolesNoiseStrength", 0.0, 1.0, 0.01)
    .name("Ice Noise Strength")
    .onChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });
  rockyPlanetControllers.push(guiControllers.icePolesNoiseStrength);

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

  guiControllers.starCount = spaceFolder.add(params, "starCount", 0, 4000, 50)
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
  Object.assign(guiControllers.folders, {
    planetFolder,
    paletteFolder,
    motionFolder,
    environmentFolder,
    sunFolder,
    ringsFolder,
    spaceFolder,
    effectsFolder,
    gasGiantFolder
  });

  refreshPlanetTypeVisibility();

  return {
    presetController,
    folders: guiControllers.folders
  };
}
