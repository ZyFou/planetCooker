// Simple onboarding and touch-gesture hints for Planet Studio
// Provides: initOnboarding({ sceneContainer, controlsContainer, previewMode }) and showOnboarding(force)

/**
 * Storage keys for persistence across sessions.
 */
const STORAGE_KEYS = {
  onboardingSeen: "planetStudio.onboarding.v1",
  touchHintSeen: "planetStudio.touchHint.v1"
};

function getIsTouchDevice() {
  try {
    return (
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches)
    );
  } catch {
    return false;
  }
}

function safeGetLocalStorage(key, fallback = null) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function safeSetLocalStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function createElement(tag, className, children) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (Array.isArray(children)) children.forEach((c) => c && el.appendChild(c));
  return el;
}

function createTextElement(tag, className, text) {
  const el = createElement(tag, className);
  if (typeof text === "string") el.textContent = text;
  return el;
}

function buildSteps(isTouch) {
  const rotateText = isTouch
    ? "Drag with one finger to rotate"
    : "Left-drag to rotate";
  const zoomText = isTouch
    ? "Pinch with two fingers to zoom"
    : "Scroll wheel to zoom";
  const panText = isTouch
    ? "Use three fingers to pan"
    : "Right-drag to pan";

  return [
    {
      title: "Welcome to Planet Studio",
      body: `${rotateText}. ${zoomText}. ${panText}.`
    },
    {
      title: "Build your world",
      body: "Use the controls panel to tweak terrain, atmosphere, rings, and moons."
    },
    {
      title: "Pro tips",
      body: "Press H to hide/show the panel. Use presets or randomize the seed to explore."
    },
    {
      title: "Share",
      body: "Copy the share code to let others load your exact system."
    }
  ];
}

function makeDots(count, activeIndex) {
  const container = createElement("div", "onboarding-dots");
  for (let i = 0; i < count; i += 1) {
    const dot = createElement("span", `onboarding-dot${i === activeIndex ? " active" : ""}`);
    container.appendChild(dot);
  }
  return container;
}

function buildOverlay(steps) {
  let index = 0;

  const scrim = createElement("div", "onboarding-overlay", []);
  const card = createElement("div", "onboarding-card");
  const titleEl = createTextElement("h2", "onboarding-title", steps[0].title);
  const bodyEl = createTextElement("p", "onboarding-body", steps[0].body);
  const dotsEl = makeDots(steps.length, 0);

  const backBtn = createTextElement("button", "onboarding-btn btn-ghost", "Back");
  const skipBtn = createTextElement("button", "onboarding-btn btn-ghost", "Skip");
  const nextBtn = createTextElement("button", "onboarding-btn btn-primary", "Next");

  const actions = createElement("div", "onboarding-actions", [backBtn, createElement("div", "onboarding-spacer"), skipBtn, nextBtn]);
  card.appendChild(titleEl);
  card.appendChild(bodyEl);
  card.appendChild(dotsEl);
  card.appendChild(actions);

  scrim.appendChild(card);

  function render() {
    titleEl.textContent = steps[index].title;
    bodyEl.textContent = steps[index].body;
    const freshDots = makeDots(steps.length, index);
    dotsEl.replaceWith(freshDots);
    // rebind reference
    dotsEl.className = freshDots.className; // maintain variable from closure
  }

  function close() {
    scrim.classList.remove("visible");
    setTimeout(() => {
      scrim.remove();
    }, 200);
  }

  function finish() {
    safeSetLocalStorage(STORAGE_KEYS.onboardingSeen, "1");
    close();
  }

  backBtn.addEventListener("click", () => {
    if (index > 0) {
      index -= 1;
      render();
    }
  });
  skipBtn.addEventListener("click", finish);
  nextBtn.addEventListener("click", () => {
    if (index < steps.length - 1) {
      index += 1;
      if (index === steps.length - 1) nextBtn.textContent = "Start";
      render();
    } else {
      finish();
    }
  });

  scrim.addEventListener("click", (e) => {
    if (e.target === scrim) finish();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") finish();
  });

  return {
    element: scrim,
    open: () => {
      document.body.appendChild(scrim);
      requestAnimationFrame(() => scrim.classList.add("visible"));
    }
  };
}

function showTouchHintOnce(sceneContainer) {
  if (!getIsTouchDevice()) return;
  if (safeGetLocalStorage(STORAGE_KEYS.touchHintSeen)) return;

  let shown = false;
  const handler = () => {
    if (shown) return;
    shown = true;
    try { sceneContainer.removeEventListener("touchstart", handler, { passive: true }); } catch {}

    const hint = createElement("div", "touch-hint");
    hint.innerHTML = "<strong>Tips</strong>: one finger rotate, pinch to zoom, three fingers pan";
    document.body.appendChild(hint);
    requestAnimationFrame(() => hint.classList.add("visible"));
    setTimeout(() => {
      hint.classList.remove("visible");
      setTimeout(() => hint.remove(), 300);
    }, 3800);
    safeSetLocalStorage(STORAGE_KEYS.touchHintSeen, "1");
  };

  try {
    sceneContainer.addEventListener("touchstart", handler, { passive: true, once: true });
  } catch {
    sceneContainer.addEventListener("touchstart", handler, { passive: true });
  }
}

let cachedOnboarding = null;

export function initOnboarding({ sceneContainer, controlsContainer, previewMode }) {
  const isTouch = getIsTouchDevice();
  const steps = buildSteps(isTouch);
  cachedOnboarding = buildOverlay(steps);

  // Auto-open once per user if not in preview embed
  if (!previewMode && !safeGetLocalStorage(STORAGE_KEYS.onboardingSeen)) {
    setTimeout(() => {
      try {
        cachedOnboarding.open();
      } catch {}
    }, 550);
  }

  // Touch hints on first interaction
  if (sceneContainer) showTouchHintOnce(sceneContainer);
}

export function showOnboarding(force = false) {
  if (!cachedOnboarding) {
    cachedOnboarding = buildOverlay(buildSteps(getIsTouchDevice()));
  }
  if (force || !safeGetLocalStorage(STORAGE_KEYS.onboardingSeen)) {
    cachedOnboarding.open();
  }
}

