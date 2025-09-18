// Builds the planet, palette, motion, and environment sections in the settings GUI.
export function setupPlanetControls({
  gui,
  params,
  presets,
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
  onPresetChange
}) {
  // Build grouped preset UI: base presets + Real Worlds
  const presetNames = Object.keys(presets);
  const presetFolder = registerFolder(gui.addFolder("Presets"), { close: true });
  const presetController = presetFolder.add(params, "preset", presetNames).name("Preset");
  guiControllers.preset = presetController;

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

  guiControllers.noiseLayers = planetFolder.add(params, "noiseLayers", 1, 8, 1)
    .name("Noise Layers")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.noiseFrequency = planetFolder.add(params, "noiseFrequency", 0.3, 8, 0.05)
    .name("Noise Frequency")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.noiseAmplitude = planetFolder.add(params, "noiseAmplitude", 0, 1.4, 0.01)
    .name("Terrain Height")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.persistence = planetFolder.add(params, "persistence", 0.2, 0.9, 0.01)
    .name("Persistence")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.lacunarity = planetFolder.add(params, "lacunarity", 1.2, 3.8, 0.01)
    .name("Lacunarity")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.oceanLevel = planetFolder.add(params, "oceanLevel", 0, 0.95, 0.01)
    .name("Ocean Level")
    .onFinishChange(() => {
      markPlanetDirty();
      scheduleShareUpdate();
    });

  const paletteFolder = registerFolder(gui.addFolder("Palette"), { close: true });

  guiControllers.colorOcean = paletteFolder.addColor(params, "colorOcean")
    .name("Deep Water")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.colorShallow = paletteFolder.addColor(params, "colorShallow")
    .name("Shallow Water")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.colorLow = paletteFolder.addColor(params, "colorLow")
    .name("Lowlands")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.colorMid = paletteFolder.addColor(params, "colorMid")
    .name("Highlands")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.colorHigh = paletteFolder.addColor(params, "colorHigh")
    .name("Peaks")
    .onChange(() => {
      updatePalette();
      markPlanetDirty();
      scheduleShareUpdate();
    });

  guiControllers.atmosphereColor = paletteFolder.addColor(params, "atmosphereColor")
    .name("Atmosphere")
    .onChange(() => {
      updatePalette();
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

  guiControllers.sunColor = sunFolder.addColor(params, "sunColor")
    .name("Color")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

  guiControllers.sunIntensity = sunFolder.add(params, "sunIntensity", 0.2, 4, 0.05)
    .name("Intensity")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

  guiControllers.sunDistance = sunFolder.add(params, "sunDistance", 10, 160, 1)
    .name("Distance")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

  guiControllers.sunSize = sunFolder.add(params, "sunSize", 0.5, 4, 0.05)
    .name("Core Size")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

  guiControllers.sunHaloSize = sunFolder.add(params, "sunHaloSize", 2, 18, 0.1)
    .name("Halo Radius")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

  guiControllers.sunGlowStrength = sunFolder.add(params, "sunGlowStrength", 0.1, 3.5, 0.05)
    .name("Glow Strength")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

  guiControllers.sunPulseSpeed = sunFolder.add(params, "sunPulseSpeed", 0, 2.5, 0.05)
    .name("Pulse Speed")
    .onChange(() => {
      updateSun();
      scheduleShareUpdate();
    });

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

  // Rings
  const ringsFolder = registerFolder(environmentFolder.addFolder("Rings"), { close: true });

  guiControllers.ringEnabled = ringsFolder.add(params, "ringEnabled")
    .name("Enable Rings")
    .onChange(() => {
      updateRings?.();
      scheduleShareUpdate();
    });

  guiControllers.ringColor = ringsFolder.addColor(params, "ringColor")
    .name("Color")
    .onChange(() => {
      updateRings?.();
      scheduleShareUpdate();
    });

  guiControllers.ringOpacity = ringsFolder.add(params, "ringOpacity", 0, 1, 0.01)
    .name("Opacity")
    .onChange(() => {
      updateRings?.();
      scheduleShareUpdate();
    });

  guiControllers.ringStart = ringsFolder.add(params, "ringStart", 1.05, 6, 0.01)
    .name("Start Distance (radii)")
    .onChange(() => {
      if (params.ringEnd < params.ringStart + 0.02) params.ringEnd = params.ringStart + 0.02;
      guiControllers.ringEnd?.updateDisplay?.();
      updateRings?.();
      scheduleShareUpdate();
    });

  guiControllers.ringEnd = ringsFolder.add(params, "ringEnd", 1.1, 10, 0.01)
    .name("End Distance (radii)")
    .onChange(() => {
      if (params.ringEnd < params.ringStart + 0.02) params.ringEnd = params.ringStart + 0.02;
      updateRings?.();
      scheduleShareUpdate();
    });

  guiControllers.ringAngle = ringsFolder.add(params, "ringAngle", -90, 90, 0.5)
    .name("Angle (deg)")
    .onChange(() => {
      updateRings?.();
      scheduleShareUpdate();
    });

  guiControllers.ringNoiseScale = ringsFolder.add(params, "ringNoiseScale", 0.5, 10, 0.1)
    .name("Noise Scale")
    .onChange(() => {
      updateRings?.();
      scheduleShareUpdate();
    });

  guiControllers.ringNoiseStrength = ringsFolder.add(params, "ringNoiseStrength", 0, 1, 0.01)
    .name("Noise Strength")
    .onChange(() => {
      updateRings?.();
      scheduleShareUpdate();
    });

  guiControllers.ringSpinSpeed = ringsFolder.add(params, "ringSpinSpeed", -2, 2, 0.01)
    .name("Spin Speed")
    .onChange(() => {
      scheduleShareUpdate();
    });

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

  return {
    presetController,
    folders: {
      planetFolder,
      paletteFolder,
      motionFolder,
      environmentFolder,
      sunFolder,
      spaceFolder,
      effectsFolder
    }
  };
}

