function createSlider(label, key, value, min, max, step) {
  const wrapper = document.createElement("label");
  wrapper.className = "system-panel__slider";

  const span = document.createElement("span");
  span.textContent = label;
  wrapper.appendChild(span);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.dataset.key = key;

  const valueDisplay = document.createElement("span");
  valueDisplay.className = "system-panel__value";
  valueDisplay.textContent = value.toFixed(2);

  input.addEventListener("input", () => {
    valueDisplay.textContent = Number(input.value).toFixed(2);
  });

  wrapper.appendChild(input);
  wrapper.appendChild(valueDisplay);

  return { element: wrapper, input };
}

export class SystemPanel {
  /** @param {HTMLElement} host */
  constructor(host, systemApi) {
    this.host = host;
    this.systemApi = systemApi;
    this.selectedId = null;

    const tpl = document.getElementById("system-panel-template");
    if (!tpl) {
      console.warn("System panel template missing");
      return;
    }
    const content = tpl.content.cloneNode(true);
    this.root = content.querySelector(".system-panel");
    this.list = content.querySelector(".system-panel__list");
    this.toggleViewButton = content.querySelector("[data-action=toggle-view]");
    this.toggleGizmoButton = content.querySelector("[data-action=toggle-gizmos]");

    content.querySelector("[data-action=add]")?.addEventListener("click", () => {
      const id = this.systemApi.addPlanet();
      if (id) {
        this.setSelected(id);
      } else {
        this.render();
      }
    });

    this.toggleViewButton?.addEventListener("click", () => {
      const next = this.systemApi.toggleViewMode();
      this.toggleViewButton.textContent = next === "system" ? "Close View" : "System View";
    });

    this.toggleGizmoButton?.addEventListener("click", () => {
      const pressed = this.toggleGizmoButton.getAttribute("aria-pressed") === "true";
      const next = !pressed;
      this.toggleGizmoButton.setAttribute("aria-pressed", String(next));
      this.toggleGizmoButton.textContent = next ? "Orbits On" : "Orbits Off";
      this.systemApi.toggleOrbitGizmos(next);
    });

    this.host.appendChild(content);
    this.render();
  }

  setSelected(id) {
    this.selectedId = id;
    this.render();
  }

  render() {
    if (!this.list) return;
    this.list.innerHTML = "";
    const planets = this.systemApi.getPlanets();
    const formatType = (type) => {
      if (!type) return "Custom";
      return type
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    };
    const formatValue = (value, digits) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      return value.toFixed(digits);
    };
    planets.forEach((planet) => {
      const item = document.createElement("article");
      item.className = "system-panel__item";
      item.dataset.id = planet.id;
      if (planet.id === this.selectedId) item.classList.add("system-panel__item--active");

      const header = document.createElement("header");
      header.className = "system-panel__item-header";
      const title = document.createElement("h3");
      title.textContent = planet.preset || `Planet ${planet.id.slice(0, 4)}`;
      header.appendChild(title);

      const actions = document.createElement("div");
      actions.className = "system-panel__item-actions";
      const focusBtn = document.createElement("button");
      focusBtn.textContent = "Focus";
      focusBtn.addEventListener("click", () => {
        this.systemApi.focusPlanet(planet.id);
        this.setSelected(planet.id);
      });
      const duplicateBtn = document.createElement("button");
      duplicateBtn.textContent = "Duplicate";
      duplicateBtn.addEventListener("click", () => {
        const id = this.systemApi.duplicatePlanet(planet.id);
        if (id) {
          this.setSelected(id);
        } else {
          this.render();
        }
      });
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Delete";
      removeBtn.addEventListener("click", () => {
        this.systemApi.removePlanet(planet.id);
        const remaining = this.systemApi.getPlanets();
        this.selectedId = remaining[0]?.id ?? null;
        this.render();
      });
      const regenBtn = document.createElement("button");
      regenBtn.textContent = "Regenerate";
      regenBtn.addEventListener("click", () => {
        this.systemApi.regeneratePlanet(planet.id);
      });
      actions.append(focusBtn, duplicateBtn, regenBtn, removeBtn);
      header.appendChild(actions);
      item.appendChild(header);

      const meta = document.createElement("div");
      meta.className = "system-panel__meta";
      const typeField = document.createElement("div");
      typeField.className = "system-panel__meta-field";
      typeField.innerHTML = `<span class="system-panel__meta-label">Type</span><span class="system-panel__meta-value">${formatType(
        planet.type,
      )}</span>`;
      const orbitField = document.createElement("div");
      orbitField.className = "system-panel__meta-field";
      const orbitValue = formatValue(planet.semiMajorAxis, 1);
      const orbitDisplay = orbitValue ? orbitValue.replace(/\.0$/, "") : "—";
      orbitField.innerHTML = `<span class="system-panel__meta-label">Orbit</span><span class="system-panel__meta-value">${orbitDisplay}${
        orbitValue ? '<span class="system-panel__meta-unit">u</span>' : ""
      }</span>`;
      const radiusField = document.createElement("div");
      radiusField.className = "system-panel__meta-field";
      const radiusValue = formatValue(planet.radius, 2);
      const radiusDisplay = radiusValue ? radiusValue.replace(/\.00$/, "") : "—";
      radiusField.innerHTML = `<span class="system-panel__meta-label">Radius</span><span class="system-panel__meta-value">${radiusDisplay}${
        radiusValue ? "&times;" : ""
      }</span>`;
      meta.append(typeField, orbitField, radiusField);
      item.appendChild(meta);

      const controls = document.createElement("div");
      controls.className = "system-panel__item-controls";

      const sliders = [
        createSlider("Semi-major Axis", "semiMajorAxis", planet.semiMajorAxis, 0, 80, 0.5),
        createSlider("Orbital Speed", "orbitalSpeed", planet.orbitalSpeed, 0, 1, 0.005),
        createSlider("Inclination", "inclination", planet.inclination, -Math.PI / 2, Math.PI / 2, 0.01),
        createSlider("Phase", "phase", planet.phase, 0, Math.PI * 2, 0.01),
        createSlider("Spin", "spinSpeed", planet.spinSpeed, -2, 2, 0.01),
        createSlider("Scale", "radius", planet.radius, 0.2, 5, 0.01),
      ];

      sliders.forEach(({ element, input }) => {
        input.addEventListener("change", () => {
          const key = input.dataset.key;
          const value = Number(input.value);
          this.systemApi.updatePlanet(planet.id, { [key]: value });
        });
        controls.appendChild(element);
      });

      item.appendChild(controls);
      this.list.appendChild(item);
    });
  }
}

export function mountSystemPanel(host, systemApi) {
  return new SystemPanel(host, systemApi);
}
