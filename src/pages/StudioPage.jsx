import { useEffect } from "react";
export default function StudioPage() {
  useEffect(() => {
    document.title = "Procedural Planet Studio";
    let cancelled = false;

    async function loadExperience() {
      try {
        if (!window.__planetStudioBootstrap) {
          window.__planetStudioBootstrap = import("../legacyStudio.js");
        }
        const modulePromise = window.__planetStudioBootstrap;
        await modulePromise;
        if (cancelled) return;
      } catch (error) {
        console.error("Failed to load studio experience", error);
      }
    }

    loadExperience();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      id="app"
      className="flex min-h-screen flex-col bg-gradient-to-br from-space-800/80 via-space-900 to-space-900 text-slate-100"
    >
      <header id="header" className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/50 bg-space-800/70 px-4 py-4 shadow-lg shadow-black/30 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold uppercase tracking-[0.4em] text-slate-300">Procedural Planet Studio</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Primary actions">
          <button
            id="toggle-controls"
            className="rounded-full border border-slate-500/50 px-3 py-1 text-xs uppercase tracking-widest text-slate-200 transition hover:border-slate-300 hover:text-white sm:hidden"
            aria-controls="info"
            aria-expanded="false"
            title="Toggle controls"
            type="button"
          >
            Controls
          </button>
          <button
            id="randomize-seed"
            className="hidden rounded-full border border-slate-500/60 px-4 py-2 text-sm text-slate-100 transition hover:border-accent-blue hover:text-white md:inline-flex"
            type="button"
          >
            Randomize Seed
          </button>
          <button
            id="surprise-me"
            className="hidden rounded-full border border-slate-500/60 px-4 py-2 text-sm text-slate-100 transition hover:border-accent-blue hover:text-white md:inline-flex"
            type="button"
          >
            Surprise Me
          </button>
          <button
            id="copy-share"
            className="hidden rounded-full border border-slate-500/60 px-4 py-2 text-sm text-slate-100 transition hover:border-accent-blue hover:text-white md:inline-flex"
            type="button"
          >
            Copy Share Code
          </button>
          <button
            id="help"
            className="hidden rounded-full border border-slate-500/60 px-4 py-2 text-sm text-slate-100 transition hover:border-accent-blue hover:text-white md:inline-flex"
            type="button"
            title="Show tutorial"
          >
            Help
          </button>
          <button
            id="return-home"
            type="button"
            className="hidden rounded-full border border-slate-500/60 px-4 py-2 text-sm text-slate-100 transition hover:border-accent-blue hover:text-white md:inline-flex"
          >
            Back to Landing
          </button>
          <button
            id="mobile-menu-toggle"
            className="rounded-full border border-slate-500/50 px-3 py-1 text-xs uppercase tracking-widest text-slate-200 transition hover:border-slate-300 hover:text-white sm:inline-flex md:hidden"
            aria-controls="mobile-menu"
            aria-expanded="false"
            title="Menu"
            type="button"
          >
            ☰
          </button>
        </div>
        <div
          id="mobile-menu"
          className="flex w-full flex-col gap-2 rounded-2xl border border-slate-600/60 bg-space-900/90 p-4 text-sm shadow-panel md:hidden"
          hidden
        >
          <button id="mobile-randomize" type="button" className="rounded-full border border-slate-500/60 px-4 py-2 text-left">Randomize Seed</button>
          <button id="mobile-surprise" type="button" className="rounded-full border border-slate-500/60 px-4 py-2 text-left">Surprise Me</button>
          <button id="mobile-copy" type="button" className="rounded-full border border-slate-500/60 px-4 py-2 text-left">Copy Share Code</button>
          <button id="mobile-reset" type="button" className="rounded-full border border-slate-500/60 px-4 py-2 text-left">Reset All</button>
          <button id="mobile-help" type="button" className="rounded-full border border-slate-500/60 px-4 py-2 text-left">How to Play</button>
          <button id="mobile-home" type="button" className="rounded-full border border-slate-500/60 px-4 py-2 text-left">
            Back to Landing
          </button>
        </div>
      </header>

      <main id="main" tabIndex="-1" className="flex flex-1 flex-col gap-4 overflow-hidden px-4 pb-6 pt-4 sm:px-6 lg:flex-row">
        <section
          id="info"
          className="fixed inset-y-0 left-0 z-20 flex max-w-[360px] flex-col gap-4 overflow-y-auto border-r border-slate-600/40 bg-space-900/95 p-5 shadow-2xl transform transition-transform duration-300 max-h-screen lg:static lg:max-w-sm lg:overflow-visible lg:rounded-3xl lg:border lg:border-slate-600/40 lg:bg-space-800/70 lg:p-4 lg:shadow-panel lg:transform-none -translate-x-full"
        >
          <div className="grid grid-cols-2 gap-3 text-xs uppercase tracking-[0.3em] text-slate-400">
            <div className="rounded-2xl bg-black/30 p-3">
              <span className="block text-[0.6rem] text-slate-400">Seed</span>
              <span id="seed-display" className="text-lg font-semibold text-white">-</span>
            </div>
            <div className="rounded-2xl bg-black/30 p-3">
              <span className="block text-[0.6rem] text-slate-400">Gravity</span>
              <span id="gravity-display" className="text-lg font-semibold text-white">-</span>
            </div>
            <div className="rounded-2xl bg-black/30 p-3">
              <span className="block text-[0.6rem] text-slate-400">System Age</span>
              <span id="time-display" className="text-lg font-semibold text-white">0y</span>
            </div>
            <div className="rounded-2xl bg-black/30 p-3">
              <span className="block text-[0.6rem] text-slate-400">Stable Moons</span>
              <span id="orbit-stability" className="text-lg font-semibold text-white">-</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-[0.3em] text-slate-400">
              <span>Share Code</span>
            </div>
            <div id="import-share-container" className="flex gap-2">
              <input
                id="import-share-input"
                type="text"
                inputMode="text"
                spellCheck="false"
                autoComplete="off"
                placeholder="Paste share code..."
                aria-label="Paste share code"
                className="flex-1 rounded-2xl border border-slate-600/60 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-accent-blue"
              />
              <button id="import-share-load" type="button" className="rounded-full border border-slate-500/60 px-3 py-2 text-xs uppercase tracking-widest">Load</button>
              <button id="import-share-cancel" type="button" className="rounded-full border border-slate-500/60 px-3 py-2 text-xs uppercase tracking-widest">Cancel</button>
            </div>
          </div>

          <div id="control-search-bar" className="flex items-center gap-2 rounded-2xl border border-slate-600/60 bg-black/30 px-3 py-2">
            <input
              type="search"
              id="control-search"
              placeholder="Search controls..."
              autoComplete="off"
              spellCheck="false"
              aria-label="Search controls"
              className="h-9 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            <button id="control-search-clear" type="button" title="Clear search" aria-label="Clear search" className="rounded-full border border-slate-500/60 px-3 py-1">
              ×
            </button>
          </div>
          <p id="control-search-empty" className="text-xs text-slate-300" hidden>
            No controls match your search.
          </p>
          <div id="controls" className="flex flex-col gap-3 overflow-y-auto pr-2" />

          <section id="debug-panel" className="space-y-3 rounded-2xl border border-slate-600/60 bg-black/40 p-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Debug Info</h2>
            <div className="flex justify-between text-sm text-slate-200">
              <span>FPS:</span>
              <span id="debug-fps">0</span>
            </div>
            <div className="space-y-1 text-sm text-slate-200">
              <label className="flex items-center gap-2">
                <input type="checkbox" id="debug-planet-vector" className="rounded border-slate-500 bg-space-900" />
                <span>Planet velocity vector</span>
              </label>
              <span className="text-xs text-slate-400">
                Speed: <span id="debug-planet-speed">0.000</span>
              </span>
            </div>
            <div className="space-y-1 text-sm text-slate-200">
              <label className="flex items-center gap-2">
                <input type="checkbox" id="debug-moon-vectors" className="rounded border-slate-500 bg-space-900" />
                <span>Moon velocity vectors</span>
              </label>
            </div>
            <div className="space-y-1 text-sm text-slate-200">
              <label className="flex items-center gap-2">
                <input type="checkbox" id="debug-hud-fps" defaultChecked className="rounded border-slate-500 bg-space-900" />
                <span>HUD FPS</span>
              </label>
            </div>
            <ul id="debug-moon-speed-list" className="space-y-1 text-xs text-slate-300" />
            <button id="reset-all" type="button" className="w-full rounded-full border border-slate-500/60 px-4 py-2 text-xs uppercase tracking-widest">
              Reset All
            </button>
          </section>
          <p className="text-xs text-slate-400">Use the sliders on the left to tweak the planet. Press H to hide/show the panel.</p>
        </section>

        <section id="scene" className="relative flex-1 overflow-hidden rounded-3xl border border-slate-600/40 bg-black/40">
          <div
            id="loading"
            hidden
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70"
          >
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-500 border-t-accent-blue" />
            <div className="text-sm text-slate-200">Generating…</div>
          </div>
          <button
            id="camera-mode"
            type="button"
            className="absolute left-3 top-3 z-10 rounded-full border border-slate-500/60 bg-black/70 px-3 py-1 text-xs uppercase tracking-widest text-slate-200 transition hover:border-accent-blue hover:text-white"
            title="Change camera mode"
          >
            Camera: Orbit
          </button>
          <div id="hud-fps" className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs" aria-live="polite">
            FPS: 0
          </div>
        </section>
      </main>

      <div id="panel-scrim" hidden className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div id="exit-overlay" hidden className="fixed inset-0 flex items-center justify-center bg-black/80">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-600/60 bg-space-900/90 px-10 py-8 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-500 border-t-accent-blue" aria-hidden="true" />
          <p className="text-lg font-semibold">Saving your system…</p>
          <p className="text-sm text-slate-300">Preparing the landing preview</p>
        </div>
      </div>
    </div>
  );
}
