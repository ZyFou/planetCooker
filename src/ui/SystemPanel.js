const TWO_PI = Math.PI * 2;

function formatNumber(value, fractionDigits = 2) {
  return Number.parseFloat(value).toFixed(fractionDigits);
}

function radiansToDegrees(rad) {
  return rad * (180 / Math.PI);
}

function degreesToRadians(deg) {
  return (deg * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createDefaultPlanet(index = 0) {
  const seed = Math.floor(Math.random() * 0xffffffff);
  const type = Math.random() > 0.45 ? "gas" : "rocky";
  const semiMajorAxis = 6 + index * 5 + Math.random() * 2;
  const radius = type === "gas" ? 1.1 + Math.random() * 0.6 : 0.5 + Math.random() * 0.4;
  const orbitalSpeed = 0.1 + Math.random() * 0.4;
  const spinSpeed = 0.1 + Math.random() * 0.3;
  return {
    seed,
    type,
    radius,
    semiMajorAxis,
    orbitalSpeed,
    phase: Math.random() * TWO_PI,
    inclination: 0,
    spinSpeed,
  };
}

export class SystemPanel {
  constructor(container, options) {
    this.container = container;
    this.system = options.system;
    this.onViewModeChange = options.onViewModeChange;
    this.onRequestRefresh = options.onRequestRefresh ?? (() => {});
    this.render();
  }

  refresh() {
    this.render();
  }

  render() {
    if (!this.container) return;
    const planets = this.system.getPlanets();
    const viewMode = this.system.getViewMode();
    const timeScale = this.system.getTimeScale();
    const orbitVisible = this.system.areOrbitGizmosVisible();

    const wrapper = document.createElement("div");
    wrapper.className = "system-panel";

    const header = document.createElement("div");
    header.className = "system-panel__header";
    header.innerHTML = `
      <h2 class="system-panel__title">System Manager</h2>
      <div class="system-panel__global-controls">
        <label class="system-panel__field">
          <span>View Mode</span>
          <select data-role="view-mode">
            <option value="close" ${viewMode === "close" ? "selected" : ""}>Close View</option>
            <option value="system" ${viewMode === "system" ? "selected" : ""}>System View</option>
          </select>
        </label>
        <label class="system-panel__field">
          <span>Time Scale</span>
          <input type="range" data-role="time-scale" min="0" max="4" step="0.1" value="${timeScale}" />
          <span class="system-panel__value" data-role="time-scale-value">${formatNumber(timeScale, 1)}×</span>
        </label>
        <label class="system-panel__field system-panel__checkbox">
          <input type="checkbox" data-role="orbit-toggle" ${orbitVisible ? "checked" : ""} />
          <span>Show Orbit Gizmos</span>
        </label>
        <button type="button" class="system-panel__add" data-role="add-planet">Add Planet</button>
      </div>
    `;
    wrapper.appendChild(header);

    const list = document.createElement("div");
    list.className = "system-panel__list";

    if (!planets.length) {
      const empty = document.createElement("p");
      empty.className = "system-panel__empty";
      empty.textContent = "No planets in the system yet. Click \"Add Planet\" to begin.";
      list.appendChild(empty);
    } else {
      planets.forEach((planet, index) => {
        const item = document.createElement("div");
        item.className = "system-panel__planet";
        item.dataset.planetId = planet.id;
        item.innerHTML = `
          <header class="system-panel__planet-header">
            <span class="system-panel__planet-name">Planet ${index + 1}</span>
            <span class="system-panel__planet-type">${planet.type === "gas" ? "Gas" : "Rocky"}</span>
          </header>
          <div class="system-panel__controls">
            <label class="system-panel__field">
              <span>Type</span>
              <select data-param="type">
                <option value="rocky" ${planet.type === "rocky" ? "selected" : ""}>Rocky</option>
                <option value="gas" ${planet.type === "gas" ? "selected" : ""}>Gas</option>
              </select>
            </label>
            <label class="system-panel__field">
              <span>Distance</span>
              <input type="range" min="2" max="80" step="0.1" value="${planet.semiMajorAxis ?? 0}" data-param="semiMajorAxis" />
              <span class="system-panel__value" data-value="semiMajorAxis">${formatNumber(planet.semiMajorAxis ?? 0, 1)}</span>
            </label>
            <label class="system-panel__field">
              <span>Orbital Speed</span>
              <input type="range" min="0" max="1.5" step="0.01" value="${planet.orbitalSpeed ?? 0}" data-param="orbitalSpeed" />
              <span class="system-panel__value" data-value="orbitalSpeed">${formatNumber(planet.orbitalSpeed ?? 0, 2)} rad/s</span>
            </label>
            <label class="system-panel__field">
              <span>Inclination</span>
              <input type="range" min="-90" max="90" step="1" value="${formatNumber(radiansToDegrees(planet.inclination ?? 0), 0)}" data-param="inclination" />
              <span class="system-panel__value" data-value="inclination">${formatNumber(radiansToDegrees(planet.inclination ?? 0), 0)}°</span>
            </label>
            <label class="system-panel__field">
              <span>Phase</span>
              <input type="range" min="0" max="360" step="1" value="${formatNumber(radiansToDegrees(planet.phase ?? 0), 0)}" data-param="phase" />
              <span class="system-panel__value" data-value="phase">${formatNumber(radiansToDegrees(planet.phase ?? 0), 0)}°</span>
            </label>
            <label class="system-panel__field">
              <span>Radius</span>
              <input type="range" min="0.2" max="3.5" step="0.05" value="${planet.radius ?? 1}" data-param="radius" />
              <span class="system-panel__value" data-value="radius">${formatNumber(planet.radius ?? 1, 2)}</span>
            </label>
            <label class="system-panel__field">
              <span>Spin Speed</span>
              <input type="range" min="-1" max="1" step="0.01" value="${planet.spinSpeed ?? 0}" data-param="spinSpeed" />
              <span class="system-panel__value" data-value="spinSpeed">${formatNumber(planet.spinSpeed ?? 0, 2)} rad/s</span>
            </label>
          </div>
          <div class="system-panel__actions">
            <button type="button" data-role="duplicate">Duplicate</button>
            <button type="button" data-role="remove">Delete</button>
          </div>
        `;
        list.appendChild(item);
      });
    }

    wrapper.appendChild(list);
    this.container.innerHTML = "";
    this.container.appendChild(wrapper);

    this.bindEvents();
  }

  bindEvents() {
    const addButton = this.container.querySelector('[data-role="add-planet"]');
    addButton?.addEventListener("click", () => {
      const index = this.system.getPlanets().length;
      this.system.addPlanet(createDefaultPlanet(index));
      this.refresh();
      this.onRequestRefresh();
    });

    const viewSelect = this.container.querySelector('[data-role="view-mode"]');
    viewSelect?.addEventListener("change", (event) => {
      const mode = event.target.value === "system" ? "system" : "close";
      if (this.onViewModeChange) {
        this.onViewModeChange(mode);
      } else {
        this.system.setViewMode(mode);
      }
      this.refresh();
    });

    const timeScale = this.container.querySelector('[data-role="time-scale"]');
    const timeScaleValue = this.container.querySelector('[data-role="time-scale-value"]');
    timeScale?.addEventListener("input", (event) => {
      const value = Number.parseFloat(event.target.value);
      this.system.setSystemTimeScale(value);
      if (timeScaleValue) timeScaleValue.textContent = `${formatNumber(value, 1)}×`;
    });

    const orbitToggle = this.container.querySelector('[data-role="orbit-toggle"]');
    orbitToggle?.addEventListener("change", (event) => {
      this.system.toggleOrbitGizmos(event.target.checked);
      this.refresh();
    });

    const planetRows = this.container.querySelectorAll(".system-panel__planet");
    planetRows.forEach((row) => {
      const planetId = row.dataset.planetId;
      const controls = row.querySelectorAll("[data-param]");
      controls.forEach((control) => {
        control.addEventListener("input", (event) => {
          const param = control.dataset.param;
          let value = event.target.value;
          if (param === "type") {
            this.system.updatePlanet(planetId, { type: value });
            this.refresh();
            return;
          }
          value = Number.parseFloat(value);
          if (param === "inclination" || param === "phase") {
            value = degreesToRadians(value);
          }
          if (param === "radius") {
            value = clamp(value, 0.1, 10);
          }
          this.system.updatePlanet(planetId, { [param]: value });
          const display = row.querySelector(`[data-value="${param}"]`);
          if (display) {
            if (param === "inclination" || param === "phase") {
              display.textContent = `${formatNumber(radiansToDegrees(value), 0)}°`;
            } else if (param === "semiMajorAxis") {
              display.textContent = formatNumber(value, 1);
            } else if (param === "radius") {
              display.textContent = formatNumber(value, 2);
            } else if (param === "spinSpeed" || param === "orbitalSpeed") {
              display.textContent = `${formatNumber(value, 2)} rad/s`;
            } else {
              display.textContent = formatNumber(value, 2);
            }
          }
        });
      });

      const duplicate = row.querySelector('[data-role="duplicate"]');
      duplicate?.addEventListener("click", () => {
        const current = this.system.getPlanets().find((p) => p.id === planetId);
        if (!current) return;
        const clone = { ...current, id: undefined, seed: Math.floor(Math.random() * 0xffffffff) };
        clone.phase = (clone.phase ?? 0) + Math.PI / 6;
        clone.semiMajorAxis = (clone.semiMajorAxis ?? 0) + 2;
        this.system.addPlanet(clone);
        this.refresh();
        this.onRequestRefresh();
      });

      const remove = row.querySelector('[data-role="remove"]');
      remove?.addEventListener("click", () => {
        this.system.removePlanet(planetId);
        this.refresh();
        this.onRequestRefresh();
      });
    });
  }
}
