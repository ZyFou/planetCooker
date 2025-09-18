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
  updateStarfieldUniforms,
  regenerateStarfield,
  updateGravityDisplay,
  initMoonPhysics,
  getIsApplyingPreset,
  onPresetChange
}) {
  const presetController = gui.add(params, "preset", Object.keys(presets)).name("Preset");
  guiControllers.preset = presetController;

  presetController.onChange((value) => {
    if (getIsApplyingPreset()) return;
    onPresetChange?.(value);
  });

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
    .name("Clouds")
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
    .name("Gravity Pull")
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

