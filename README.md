# Procedural Planet Studio

A browser-based procedural planet generator built with Three.js. Create stylised or realistic planets, adjust terrain, atmospheres, moons, and environmental settings in real time, and export the resulting system as an FBX file for Unity, Blender, or other DCC/engine pipelines.

## Quick Start

1. Open `index.html` in a modern desktop browser (Chrome, Edge, Firefox, or Safari) and click **Launch Studio** – or load `studio.html` directly to skip the landing page.
2. Use the control panel (press **H** to hide/show) to tweak the planet or choose one of the bundled presets.
3. Randomise or enter a custom seed to share exact results with others. The share code updates automatically in the info panel.
4. Click **Export FBX** to download the current planet (plus any moons) for import into Unity or Blender.

## Key Features

- Layered simplex-noise displacement with adjustable frequency, amplitude, persistence, and lacunarity.
- Real-time vertex-colour palette editing for oceans, lowlands, highlands, and peaks.
- Atmosphere and cloud shell rendering with adjustable opacity and colour.
- Configurable moons with elliptical orbits, seeded physical parameters, mutual gravity, and a live stability indicator to spot escaping bodies.
- Environment controls for gravity, two-way physics, and an expanded star/sun panel (colour, distance, glow, pulse) with adjustable axial tilt.
- Seeded starfield renderer with animated twinkle and brightness controls.
- Time simulation speed slider plus animated rotation (toggle GUI with **H**).
- Seeded generation with shareable codes (URL hash + copy button) for quick collaboration.
- Lightweight built-in FBX exporter clones the current system, strips orbit guides, and bakes world transforms for clean Unity/Blender import.

## Notes

- Exported FBX files contain the current mesh deformations, cloud shell, and moon hierarchy. Orbit guide lines are removed automatically.
- Gravity influences moon orbital speed during simulation; adjust `Sim Speed` for faster/slower playback.
- The UI uses lil-gui; controls update only after slider release for heavy operations like mesh regeneration.
- Tested with Three.js r162. Future upgrades should keep dependency versions synchronized in `main.js`.

## Multi-Planet System API

The studio now includes a light-weight orbital system manager that can render dozens of simplified planets while keeping the close-up planet workflow intact.

```js
import { PlanetSystem } from "./systems/PlanetSystem.js";
import { SystemViewControls } from "./systems/SystemViewControls.js";

const systemRoot = new THREE.Group();
scene.add(systemRoot);

const viewControls = new SystemViewControls(camera, orbitControls, {
  transitionDuration: 1.2,
  systemDistanceMultiplier: 2.6,
  cameraFarSystem: 1500,
});

const planetSystem = new PlanetSystem({
  root: systemRoot,
  sun: systemRoot,
  viewControls,
});

planetSystem.addPlanet({
  type: "rocky",
  seed: 12345,
  radius: 0.75,
  semiMajorAxis: 8,
  orbitalSpeed: 0.32,
  phase: Math.PI / 3,
  inclination: 0.1,
  spinSpeed: 0.4,
});

function animate(dt) {
  planetSystem.update(dt);
  renderer.render(scene, camera);
}
```

`PlanetSystem` implements the full API surfaced to the GUI:

- `addPlanet`, `updatePlanet`, `removePlanet`, `getPlanets`
- `setSystemTimeScale`, `getTimeScale`
- `setViewMode`, `getViewMode`
- `toggleOrbitGizmos`, `areOrbitGizmosVisible`

System-wide camera transitions and distance limits are handled by `SystemViewControls`. The accompanying `SystemPanel` (mounts under the existing control panel) exposes add/duplicate/delete actions, per-planet sliders, a global time-scale control, view toggles, and orbit gizmo switching. Share codes now embed the full multi-planet payload, so loading a code rebuilds the entire system before restoring the close-up planet.

