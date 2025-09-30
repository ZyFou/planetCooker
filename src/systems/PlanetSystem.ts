import * as THREE from "three";
import { Planet } from "../app/planet.js";
import { SeededRNG } from "../app/utils.js";

const _STAR_WORLD = new THREE.Vector3();
const _STAR_LOCAL = new THREE.Vector3();

export type PlanetOrbitParams = {
  id: string;
  seed: number | string;
  preset: string | null;
  radius: number;
  semiMajorAxis: number;
  orbitalSpeed: number;
  phase: number;
  inclination: number;
  spinSpeed: number;
  type?: string;
};

export type PlanetSystemEntry = {
  id: string;
  params: PlanetOrbitParams;
  pivot: THREE.Object3D;
  mesh: THREE.Object3D;
  planet: Planet;
  theta: number;
  gizmo?: THREE.LineLoop;
  moons: any[];
  stateSnapshot: Record<string, any>;
  isPrimary?: boolean;
};

type PlanetFactoryOptions = {
  scene: THREE.Scene;
  params: Record<string, any>;
  moonSettings: any[];
  guiControllers: Record<string, any>;
  visualSettings: Record<string, any>;
  sun: any;
};

type PlanetFactory = (options: PlanetFactoryOptions) => Planet;

type FocusHandler = (object: THREE.Object3D | null, metadata?: { id?: string }) => void;

type OrbitGizmoFactory = (radius: number) => THREE.LineLoop;

function uuidv4() {
  const rng = new SeededRNG(Math.random() * 1e9);
  const segments: string[] = [];
  for (let i = 0; i < 4; i++) {
    segments.push(Math.floor(rng.next() * 0xffffffff).toString(16).padStart(8, "0"));
  }
  return `${segments[0]}-${segments[1].slice(0, 4)}-${segments[2].slice(0, 4)}-${segments[3].slice(0, 4)}-${segments[1].slice(4)}${segments[2].slice(4)}${segments[3].slice(4)}`;
}

export class PlanetSystem {
  scene: THREE.Scene;
  sun: any;
  starAnchor: THREE.Object3D;
  planets: Map<string, PlanetSystemEntry> = new Map();
  order: string[] = [];
  factory: PlanetFactory;
  focusHandler?: FocusHandler;
  orbitFactory: OrbitGizmoFactory;
  timeScale = 1;
  viewMode: "close" | "system" = "close";
  orbitGizmosVisible = true;
  controls?: any;
  systemCameraState: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  currentPlanetId: string | null = null;

  constructor(
    scene: THREE.Scene,
    sun: any,
    factory: PlanetFactory,
    orbitFactory: OrbitGizmoFactory,
    focusHandler?: FocusHandler,
  ) {
    this.scene = scene;
    this.sun = sun;
    this.factory = factory;
    this.focusHandler = focusHandler;
    this.orbitFactory = orbitFactory;

    this.starAnchor = new THREE.Group();
    this.starAnchor.name = "StarAnchor";
    this.scene.add(this.starAnchor);

    if (this.sun?.sunGroup && this.sun.sunGroup.parent !== this.starAnchor) {
      this.scene.remove(this.sun.sunGroup);
      this.starAnchor.add(this.sun.sunGroup);
    }
  }

  private getStarLocalPosition(target = _STAR_LOCAL) {
    if (this.sun?.sunGroup) {
      target.copy(this.sun.sunGroup.position ?? target.set(0, 0, 0));
    } else {
      target.set(0, 0, 0);
    }
    return target;
  }

  getStarWorldPosition(target = _STAR_WORLD) {
    if (this.sun?.sunGroup?.getWorldPosition) {
      this.sun.sunGroup.getWorldPosition(target);
    } else {
      target.set(0, 0, 0);
    }
    return target;
  }

  attachControls(controls: any) {
    this.controls = controls;
  }

  createFromExisting(id: string, planet: Planet, stateSnapshot: Record<string, any>, params: Partial<PlanetOrbitParams> = {}) {
    const entryId = id || uuidv4();
    const pivot = new THREE.Object3D();
    pivot.name = `PlanetPivot_${entryId}`;
    const mesh = (planet as any).planetSystem ?? planet.planetRoot ?? new THREE.Group();
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
    const starPosition = this.getStarLocalPosition();
    pivot.position.copy(starPosition);
    const defaults: PlanetOrbitParams = {
      id: entryId,
      seed: planet.params?.seed || Math.floor(Math.random() * 1e9),
      preset: planet.params?.preset ?? null,
      radius: planet.params?.radius ?? 1,
      semiMajorAxis: params.semiMajorAxis ?? 14,
      orbitalSpeed: params.orbitalSpeed ?? 0.03,
      phase: params.phase ?? 0,
      inclination: params.inclination ?? THREE.MathUtils.degToRad(planet.params?.axisTilt ?? 0),
      spinSpeed: params.spinSpeed ?? planet.params?.rotationSpeed ?? 0,
      type: params.type ?? planet.params?.planetType ?? "rocky",
    };

    mesh.position.set(defaults.semiMajorAxis, 0, 0);
    pivot.rotation.x = defaults.inclination;
    pivot.add(mesh);

    planet.params.rotationSpeed = defaults.spinSpeed;

    const gizmo = this.orbitFactory(defaults.semiMajorAxis);
    pivot.add(gizmo);
    gizmo.visible = this.orbitGizmosVisible;

    this.starAnchor.add(pivot);

    const entry: PlanetSystemEntry = {
      id: entryId,
      params: defaults,
      pivot,
      mesh,
      planet,
      theta: defaults.phase,
      gizmo,
      moons: [],
      stateSnapshot,
      isPrimary: true,
    };

    this.planets.set(entryId, entry);
    this.order.push(entryId);
    this.currentPlanetId = entryId;
    return entry;
  }

  addPlanet(options: {
    baseState: Record<string, any>;
    moonSettings: any[];
    guiControllers: Record<string, any>;
    visualSettings: Record<string, any>;
    orbitParams?: Partial<PlanetOrbitParams>;
    planetState?: Record<string, any>;
  }) {
    const id = uuidv4();
    const baseState = options.planetState ?? options.baseState ?? {};
    const stateClone = structuredClone(baseState);
    const pivot = new THREE.Object3D();
    pivot.name = `PlanetPivot_${id}`;
    const starPosition = this.getStarLocalPosition();
    pivot.position.copy(starPosition);

    const orbitParams: PlanetOrbitParams = {
      id,
      seed: options.orbitParams?.seed ?? stateClone?.seed ?? Math.floor(Math.random() * 1e9),
      preset: options.orbitParams?.preset ?? stateClone?.preset ?? null,
      radius: options.orbitParams?.radius ?? stateClone?.radius ?? 1,
      semiMajorAxis: options.orbitParams?.semiMajorAxis ?? 14 + this.planets.size * 6,
      orbitalSpeed: options.orbitParams?.orbitalSpeed ?? 0.04,
      phase: options.orbitParams?.phase ?? 0,
      inclination: options.orbitParams?.inclination ?? 0,
      spinSpeed: options.orbitParams?.spinSpeed ?? stateClone?.rotationSpeed ?? 0,
      type: options.orbitParams?.type ?? stateClone?.planetType ?? "rocky",
    };

    const moonSettings = (options.moonSettings ?? []).map((m) => ({ ...m }));
    const planetParams = { ...stateClone, seed: orbitParams.seed };

    const planet = this.factory({
      scene: this.scene,
      params: planetParams,
      moonSettings,
      guiControllers: options.guiControllers,
      visualSettings: options.visualSettings,
      sun: this.sun,
    });
    planet.params.rotationSpeed = orbitParams.spinSpeed;

    const mesh = (planet as any).planetSystem ?? planet.planetRoot ?? new THREE.Group();
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
    mesh.position.set(orbitParams.semiMajorAxis, 0, 0);
    pivot.rotation.x = orbitParams.inclination;
    pivot.add(mesh);

    const gizmo = this.orbitFactory(orbitParams.semiMajorAxis);
    pivot.add(gizmo);
    gizmo.visible = this.orbitGizmosVisible;

    this.starAnchor.add(pivot);

    const entry: PlanetSystemEntry = {
      id,
      params: orbitParams,
      pivot,
      mesh,
      planet,
      theta: orbitParams.phase,
      gizmo,
      moons: moonSettings,
      stateSnapshot: planetParams,
      isPrimary: false,
    };

    this.planets.set(id, entry);
    this.order.push(id);

    return id;
  }

  removePlanet(id: string) {
    const entry = this.planets.get(id);
    if (!entry || entry.isPrimary) return;
    entry.pivot.parent?.remove(entry.pivot);
    entry.planet?.dispose?.();
    this.planets.delete(id);
    this.order = this.order.filter((pid) => pid !== id);
    if (this.currentPlanetId === id) {
      this.currentPlanetId = this.order[0] ?? null;
    }
  }

  duplicatePlanet(id: string) {
    const entry = this.planets.get(id);
    if (!entry) return null;
    const cloneState = structuredClone(entry.stateSnapshot ?? {});
    const newId = this.addPlanet({
      baseState: cloneState,
      moonSettings: entry.moons,
      guiControllers: {},
      visualSettings: {},
      orbitParams: {
        ...entry.params,
        id: undefined,
        phase: entry.params.phase + Math.PI / 4,
      },
    });
    return newId;
  }

  regeneratePlanet(id: string, seed: number | null) {
    const entry = this.planets.get(id);
    if (!entry) return;
    const newSeed =
      typeof seed === "number" || typeof seed === "string"
        ? seed
        : Math.floor(Math.random() * 1e9);
    entry.params.seed = newSeed;
    if (entry.stateSnapshot) entry.stateSnapshot.seed = newSeed;
    if (entry.planet?.params) entry.planet.params.seed = newSeed;
    entry.planet.rebuildPlanet?.();
  }

  updatePlanet(id: string, patch: Partial<PlanetOrbitParams>) {
    const entry = this.planets.get(id);
    if (!entry) return;
    Object.assign(entry.params, patch);
    const needsReposition = patch.semiMajorAxis !== undefined || patch.phase !== undefined;
    if (patch.semiMajorAxis !== undefined && entry.gizmo) {
      const gizmo = this.orbitFactory(entry.params.semiMajorAxis);
      entry.pivot.remove(entry.gizmo);
      entry.gizmo.geometry.dispose?.();
      entry.gizmo.material.dispose?.();
      entry.gizmo = gizmo;
      entry.gizmo.visible = this.orbitGizmosVisible;
      entry.pivot.add(entry.gizmo);
    }
    if (patch.inclination !== undefined) {
      entry.pivot.rotation.x = patch.inclination;
    }
    if (patch.phase !== undefined) {
      entry.theta = patch.phase;
    }
    if (patch.radius !== undefined) {
      entry.planet.params.radius = entry.params.radius;
      entry.planet.rebuildPlanet?.();
    }
    if (patch.spinSpeed !== undefined) {
      entry.planet.params.rotationSpeed = entry.params.spinSpeed;
    }
    if (needsReposition) {
      const a = entry.params.semiMajorAxis;
      const x = a * Math.cos(entry.theta);
      const z = a * Math.sin(entry.theta);
      entry.mesh.position.set(x, 0, z);
    }
  }

  getPlanets() {
    return this.order.map((id) => this.planets.get(id)?.params).filter(Boolean) as PlanetOrbitParams[];
  }

  getPlanetEntry(id: string) {
    return this.planets.get(id) ?? null;
  }

  setTimeScale(scale: number) {
    this.timeScale = scale;
  }

  setViewMode(mode: "close" | "system") {
    this.viewMode = mode;
    if (mode === "system") {
      this.currentPlanetId = null;
    }
  }

  focusPlanet(id: string) {
    const entry = this.planets.get(id);
    if (!entry) return;
    this.currentPlanetId = id;
    this.focusHandler?.(entry.mesh, { id });
  }

  getCurrentPlanetId() {
    return this.currentPlanetId ?? this.order[0] ?? null;
  }

  toggleOrbitGizmos(visible: boolean) {
    this.orbitGizmosVisible = visible;
    this.planets.forEach((entry) => {
      if (entry.gizmo) entry.gizmo.visible = visible;
    });
  }

  updatePrimarySnapshot(state: Record<string, any>, moons: any[]) {
    const primaryId = this.order[0];
    if (!primaryId) return;
    this.updatePlanetSnapshot(primaryId, state, moons);
  }

  updatePlanetSnapshot(id: string, state: Record<string, any>, moons: any[]) {
    const entry = this.planets.get(id);
    if (!entry) return;
    entry.stateSnapshot = structuredClone(state ?? {});
    entry.moons = (moons ?? []).map((moon) => ({ ...moon }));
    if (state?.radius !== undefined) entry.params.radius = state.radius;
    if (state?.rotationSpeed !== undefined) entry.params.spinSpeed = state.rotationSpeed;
    if (state?.seed !== undefined) entry.params.seed = state.seed;
    if (state?.preset !== undefined) entry.params.preset = state.preset ?? null;
    if (state?.planetType !== undefined) entry.params.type = state.planetType;
  }

  applyPlanetState(
    id: string,
    state: Record<string, any>,
    moonSettings: any[],
    orbitOverrides: Partial<PlanetOrbitParams> = {},
  ) {
    const entry = this.planets.get(id);
    if (!entry || entry.isPrimary) return;

    const snapshot = structuredClone(state ?? {});
    entry.stateSnapshot = snapshot;
    entry.moons = (moonSettings ?? []).map((moon) => ({ ...moon }));

    entry.params.radius = orbitOverrides.radius ?? snapshot.radius ?? entry.params.radius;
    entry.params.spinSpeed = orbitOverrides.spinSpeed ?? snapshot.rotationSpeed ?? entry.params.spinSpeed;
    if (orbitOverrides.seed !== undefined || snapshot.seed !== undefined) {
      entry.params.seed = orbitOverrides.seed ?? snapshot.seed;
    }
    if (orbitOverrides.preset !== undefined || snapshot.preset !== undefined) {
      entry.params.preset = (orbitOverrides.preset ?? snapshot.preset) ?? null;
    }
    if (orbitOverrides.type !== undefined || snapshot.planetType !== undefined) {
      entry.params.type = orbitOverrides.type ?? snapshot.planetType;
    }
    if (orbitOverrides.inclination !== undefined || snapshot.inclination !== undefined) {
      entry.params.inclination = orbitOverrides.inclination ?? snapshot.inclination ?? entry.params.inclination;
      entry.pivot.rotation.x = entry.params.inclination;
    }
    if (snapshot.phase !== undefined && typeof snapshot.phase === "number") {
      entry.params.phase = snapshot.phase;
      entry.theta = snapshot.phase;
    }
    if (orbitOverrides.phase !== undefined) {
      entry.theta = orbitOverrides.phase;
      entry.params.phase = orbitOverrides.phase;
    }

    entry.planet?.dispose?.();

    const planet = this.factory({
      scene: this.scene,
      params: { ...snapshot },
      moonSettings: entry.moons,
      guiControllers: {},
      visualSettings: {},
      sun: this.sun,
    });

    const mesh = (planet as any).planetSystem ?? planet.planetRoot ?? new THREE.Group();
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.position.set(entry.params.semiMajorAxis, 0, 0);

    entry.pivot.remove(entry.mesh);
    entry.pivot.add(mesh);

    entry.mesh = mesh;
    entry.planet = planet;
    entry.planet.params.rotationSpeed = entry.params.spinSpeed;
  }

  update(delta: number, simulationDelta: number = delta) {
    const starLocal = this.getStarLocalPosition();
    const focusedId = this.getCurrentPlanetId();
    this.planets.forEach((entry) => {
      entry.pivot.position.copy(starLocal);
      entry.theta += entry.params.orbitalSpeed * simulationDelta * this.timeScale;
      const a = entry.params.semiMajorAxis;
      const x = a * Math.cos(entry.theta);
      const z = a * Math.sin(entry.theta);
      entry.mesh.position.set(x, 0, z);
      if (entry.id !== focusedId) {
        entry.planet.params.rotationSpeed = entry.params.spinSpeed ?? entry.planet.params.rotationSpeed;
        entry.planet.update(delta, simulationDelta, null);
      }
    });
  }
}
