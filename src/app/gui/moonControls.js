// Manages moon-related controls and provides helpers to rebuild dynamic moon folders.
import * as THREE from "three";
import { SeededRNG } from "../utils.js";

export function setupMoonControls({
  gui,
  params,
  guiControllers,
  registerFolder,
  unregisterFolder,
  applyControlSearch,
  scheduleShareUpdate,
  markMoonsDirty,
  updateOrbitLinesVisibility,
  initMoonPhysics,
  resetMoonPhysics,
  getIsApplyingPreset
}) {
  const moonSettings = [];
  const moonControlFolders = [];

  function createDefaultMoon(index = 0) {
    const basePhase = (index / Math.max(1, params.moonCount || 1)) * Math.PI * 2;
    const rng = new SeededRNG(`${params.seed || "moon"}-${index}`);
    const color = new THREE.Color().setHSL(
      (0.5 + rng.next() * 0.3) % 1,
      0.15 + rng.next() * 0.35,
      0.5 + rng.next() * 0.3
    );
    return {
      size: THREE.MathUtils.lerp(0.08, 0.36, rng.next()),
      distance: THREE.MathUtils.lerp(2.4, 11.5, rng.next()),
      orbitSpeed: THREE.MathUtils.lerp(0.2, 0.75, rng.next()),
      inclination: THREE.MathUtils.lerp(-25, 25, rng.next()),
      color: color.getStyle(),
      phase: basePhase + rng.next() * Math.PI * 2,
      eccentricity: THREE.MathUtils.lerp(0.02, 0.4, rng.next())
    };
  }

  function normalizeMoonSettings() {
    moonSettings.forEach((moon, index) => {
      if (typeof moon.size !== "number" || Number.isNaN(moon.size)) {
        moon.size = 0.18;
      }
      if (typeof moon.distance !== "number" || Number.isNaN(moon.distance)) {
        moon.distance = 3.5;
      }
      if (typeof moon.orbitSpeed !== "number" || Number.isNaN(moon.orbitSpeed)) {
        moon.orbitSpeed = 0.4;
      }
      if (typeof moon.inclination !== "number" || Number.isNaN(moon.inclination)) {
        moon.inclination = 0;
      }
      if (typeof moon.phase !== "number" || Number.isNaN(moon.phase)) {
        moon.phase = 0;
      }
      if (!moon.color) {
        moon.color = "#cfcfcf";
      }
      if (typeof moon.eccentricity !== "number" || Number.isNaN(moon.eccentricity)) {
        const rng = new SeededRNG(`${params.seed || "moon"}-ecc-${index}`);
        moon.eccentricity = THREE.MathUtils.lerp(0.02, 0.35, rng.next());
      }
      moon.eccentricity = THREE.MathUtils.clamp(moon.eccentricity, 0, 0.95);
      moon.phase = ((moon.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    });
  }

  function rebuildMoonControls() {
    moonControlFolders.splice(0, moonControlFolders.length).forEach((folder) => {
      unregisterFolder(folder);
      folder.destroy();
    });

    moonSettings.forEach((moon, index) => {
      const folder = registerFolder(gui.addFolder(`Moon ${index + 1}`));
      folder
        .add(moon, "size", 0.05, 0.9, 0.01)
        .name("Size")
        .onChange(() => {
          markMoonsDirty();
          scheduleShareUpdate();
        });
      folder
        .add(moon, "distance", 1.5, 20, 0.1)
        .name("Distance")
        .onChange(() => {
          markMoonsDirty();
          scheduleShareUpdate();
        });
      folder
        .add(moon, "orbitSpeed", 0, 2, 0.01)
        .name("Orbit Speed")
        .onChange(() => {
          if (params.physicsEnabled) {
            initMoonPhysics();
          }
          scheduleShareUpdate();
        });
      folder
        .add(moon, "inclination", -45, 45, 0.5)
        .name("Inclination")
        .onChange(() => {
          markMoonsDirty();
          scheduleShareUpdate();
        });
      folder
        .addColor(moon, "color")
        .name("Color")
        .onChange(() => {
          markMoonsDirty();
          scheduleShareUpdate();
        });
      folder
        .add(moon, "eccentricity", 0, 0.95, 0.01)
        .name("Eccentricity")
        .onChange(() => {
          markMoonsDirty();
          scheduleShareUpdate();
        });
      folder
        .add(moon, "phase", 0, Math.PI * 2, 0.01)
        .name("Phase")
        .onChange(() => {
          markMoonsDirty();
          scheduleShareUpdate();
        });
      moonControlFolders.push(folder);
    });

    applyControlSearch({ scrollToFirst: false });
  }

  function syncMoonSettings() {
    while (moonSettings.length < params.moonCount) {
      moonSettings.push(createDefaultMoon(moonSettings.length));
    }
    while (moonSettings.length > params.moonCount) {
      moonSettings.pop();
    }
    normalizeMoonSettings();
    rebuildMoonControls();
    markMoonsDirty();
  }

  // Moons folder is now created in planetControls.js under Environment
  // The moon count and orbit lines controls are handled there

  // Respawn/Add a moon convenience button
  const respawnApi = {
    respawn: () => {
      moonSettings.push(createDefaultMoon(moonSettings.length));
      params.moonCount = moonSettings.length;
      rebuildMoonControls();
      // Rebuild scene for new moon
      markMoonsDirty();
      scheduleShareUpdate();
      if (params.physicsEnabled) {
        initMoonPhysics();
      }
    }
  };
  
  // Create a separate folder for the respawn button
  const respawnFolder = registerFolder(gui.addFolder("Moon Actions"), { close: true });
  respawnFolder.add(respawnApi, "respawn").name("Respawn Moon");

  const physicsFolder = registerFolder(gui.addFolder("Physics"), { close: true });

  guiControllers.physicsEnabled = physicsFolder.add(params, "physicsEnabled")
    .name("Enable Physics")
    .onChange(() => {
      initMoonPhysics();
      scheduleShareUpdate();
    });

  guiControllers.physicsTwoWay = physicsFolder.add(params, "physicsTwoWay")
    .name("Two-way Gravity")
    .onChange(() => {
      initMoonPhysics();
      scheduleShareUpdate();
    });

  guiControllers.impactDeformation = physicsFolder.add(params, "impactDeformation")
    .name("Impact Deformation")
    .onChange(() => {
      // Pure toggle; no immediate rebuild required
      scheduleShareUpdate();
    });

  // Impact tuning controls
  const impactsFolder = registerFolder(physicsFolder.addFolder("Impact Tuning"), { close: true });
  guiControllers.impactStrengthMul = impactsFolder.add(params, "impactStrengthMul", 0.1, 4, 0.05)
    .name("Strength x")
    .onChange(() => {
      scheduleShareUpdate();
    });
  guiControllers.impactSpeedMul = impactsFolder.add(params, "impactSpeedMul", 0, 3, 0.01)
    .name("Speed x")
    .onChange(() => {
      scheduleShareUpdate();
    });
  guiControllers.impactMassMul = impactsFolder.add(params, "impactMassMul", 0.2, 3, 0.05)
    .name("Mass x")
    .onChange(() => {
      scheduleShareUpdate();
    });
  guiControllers.impactElongationMul = impactsFolder.add(params, "impactElongationMul", 0, 3, 0.05)
    .name("Elongation x")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.moonMassScale = physicsFolder.add(params, "moonMassScale", 0.1, 5, 0.05)
    .name("Moon Mass Scale")
    .onChange(() => {
      initMoonPhysics();
      scheduleShareUpdate();
    });

  guiControllers.physicsDamping = physicsFolder.add(params, "physicsDamping", 0, 0.02, 0.0005)
    .name("Damping")
    .onChange(() => {
      scheduleShareUpdate();
    });

  guiControllers.physicsSubsteps = physicsFolder.add(params, "physicsSubsteps", 1, 8, 1)
    .name("Substeps")
    .onChange(() => {
      scheduleShareUpdate();
    });

  physicsFolder.add({ reset: () => resetMoonPhysics() }, "reset").name("Reset Orbits");

  return {
    moonSettings,
    moonControlFolders,
    createDefaultMoon,
    normalizeMoonSettings,
    rebuildMoonControls,
    syncMoonSettings
  };
}

