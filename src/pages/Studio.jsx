import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Studio3D from '../components/Studio3D'

const Studio = () => {
  const [searchParams] = useSearchParams()
  const [controlsOpen, setControlsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const previewMode = searchParams.get('preview') === '1'
  const loadShareParam = searchParams.get('load')
  const hashParam = window.location.hash.substring(1)

  const handleToggleControls = () => {
    setControlsOpen(!controlsOpen)
  }

  const handleToggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  const handleCloseMobileMenu = () => {
    setMobileMenuOpen(false)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'h' || e.key === 'H') {
        if (!previewMode) {
          setControlsOpen(!controlsOpen)
        }
      }
      if (e.key === 'Escape') {
        setControlsOpen(false)
        setMobileMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [controlsOpen, previewMode])

  if (previewMode) {
    return (
      <div className="h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Studio3D 
          previewMode={true}
          loadShareParam={loadShareParam}
          hashParam={hashParam}
        />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 bg-slate-900/72 border-b border-blue-300/20">
        <h1 className="text-xl font-semibold tracking-wider uppercase">
          Procedural Planet Studio
        </h1>
        <div className="flex gap-3 items-center">
          <button
            onClick={handleToggleControls}
            className="lg:hidden px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80 hover:-translate-y-0.5"
            aria-controls="info"
            aria-expanded={controlsOpen}
          >
            Controls
          </button>
          
          <div className="hidden lg:flex gap-3">
            <button
              onClick={() => {
                // Randomize seed functionality will be handled by Studio3D
                const event = new CustomEvent('randomize-seed')
                window.dispatchEvent(event)
              }}
              className="px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80 hover:-translate-y-0.5"
            >
              Randomize Seed
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('surprise-me')
                window.dispatchEvent(event)
              }}
              className="px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80 hover:-translate-y-0.5"
            >
              Surprise Me
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('copy-share')
                window.dispatchEvent(event)
              }}
              className="px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80 hover:-translate-y-0.5"
            >
              Copy Share Code
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('help')
                window.dispatchEvent(event)
              }}
              className="px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80 hover:-translate-y-0.5"
              title="Show tutorial"
            >
              Help
            </button>
            <Link
              to="/"
              className="px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80 hover:-translate-y-0.5"
            >
              Back to Landing
            </Link>
          </div>
          
          <button
            onClick={handleToggleMobileMenu}
            className="lg:hidden px-3 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-lg transition-all hover:bg-slate-600/80"
            aria-controls="mobile-menu"
            aria-expanded={mobileMenuOpen}
            title="Menu"
          >
            ☰
          </button>
        </div>
        
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="absolute right-4 top-16 z-50 flex flex-col gap-2 p-3 rounded-xl border border-blue-300/22 bg-slate-800/95 shadow-2xl">
            <button
              onClick={() => {
                const event = new CustomEvent('mobile-randomize')
                window.dispatchEvent(event)
                handleCloseMobileMenu()
              }}
              className="px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80"
            >
              Randomize Seed
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('mobile-surprise')
                window.dispatchEvent(event)
                handleCloseMobileMenu()
              }}
              className="px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80"
            >
              Surprise Me
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('mobile-copy')
                window.dispatchEvent(event)
                handleCloseMobileMenu()
              }}
              className="px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80"
            >
              Copy Share Code
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('mobile-reset')
                window.dispatchEvent(event)
                handleCloseMobileMenu()
              }}
              className="px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80"
            >
              Reset All
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('mobile-help')
                window.dispatchEvent(event)
                handleCloseMobileMenu()
              }}
              className="px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80"
            >
              How to Play
            </button>
            <Link
              to="/"
              onClick={handleCloseMobileMenu}
              className="px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold tracking-wide transition-all hover:bg-slate-600/80 text-center"
            >
              Back to Landing
            </Link>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 flex min-h-0">
        {/* Controls panel */}
        <div 
          id="info"
          className={`${
            controlsOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          } fixed lg:static inset-y-0 left-0 z-20 w-full max-w-sm lg:max-w-none lg:w-80 bg-slate-800/80 border-r border-blue-300/18 p-5 overflow-y-auto transition-transform duration-300`}
        >
          <div className="flex flex-col gap-4 h-full">
            {/* Stats */}
            <div className="space-y-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs tracking-widest uppercase text-slate-400">Seed</span>
                <span id="seed-display" className="text-lg font-semibold">-</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs tracking-widest uppercase text-slate-400">Gravity</span>
                <span id="gravity-display" className="text-lg font-semibold">-</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs tracking-widest uppercase text-slate-400">System Age</span>
                <span id="time-display" className="text-lg font-semibold">0y</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs tracking-widest uppercase text-slate-400">Stable Moons</span>
                <span id="orbit-stability" className="text-lg font-semibold">-</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs tracking-widest uppercase text-slate-400">Share Code</span>
                <div id="import-share-container" className="flex gap-2 mt-1">
                  <input
                    id="import-share-input"
                    type="text"
                    placeholder="Paste share code..."
                    aria-label="Paste share code"
                    className="flex-1 px-3 py-2 rounded-full border border-blue-300/32 bg-slate-700/65 text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-400/65 focus:ring-2 focus:ring-blue-400/25"
                  />
                  <button
                    id="import-share-load"
                    className="px-3 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-xs font-semibold transition-all hover:bg-slate-600/80"
                  >
                    Load
                  </button>
                  <button
                    id="import-share-cancel"
                    className="px-3 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-xs font-semibold transition-all hover:bg-slate-600/80"
                    title="Cancel import"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>

            {/* Control search */}
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-3 rounded-2xl border border-blue-300/22 bg-slate-700/92 shadow-lg">
                <input
                  id="control-search"
                  type="search"
                  placeholder="Search controls..."
                  className="flex-1 px-3 py-2 rounded-full border border-blue-300/32 bg-slate-600/65 text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-400/65 focus:ring-2 focus:ring-blue-400/25"
                />
                <button
                  id="control-search-clear"
                  type="button"
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-blue-300/28 bg-slate-600/72 text-slate-200 transition-all hover:bg-slate-500/80"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  ×
                </button>
              </div>
              <p id="control-search-empty" className="hidden mt-2 text-xs tracking-widest uppercase text-slate-400">
                No controls match your search.
              </p>
            </div>

            {/* Controls container */}
            <div id="controls" className="flex-1" />

            {/* Debug panel */}
            <section id="debug-panel" className="mt-5 p-4 rounded-2xl border border-blue-300/18 bg-slate-800/68">
              <h2 className="text-sm font-semibold tracking-widest uppercase text-slate-300 mb-3">
                Debug Info
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">FPS: <span id="debug-fps">0</span></span>
                </div>
                <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-slate-700/45 border border-blue-300/14">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      id="debug-planet-vector"
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span>Planet velocity vector</span>
                  </label>
                  <span className="text-xs text-slate-400">Speed: <span id="debug-planet-speed">0.000</span></span>
                </div>
                <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-slate-700/45 border border-blue-300/14">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      id="debug-moon-vectors"
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span>Moon velocity vectors</span>
                  </label>
                </div>
                <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-slate-700/45 border border-blue-300/14">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      id="debug-hud-fps"
                      defaultChecked
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span>HUD FPS</span>
                  </label>
                </div>
                <ul id="debug-moon-speed-list" className="space-y-1" />
              </div>
              <button
                id="reset-all"
                className="w-full mt-4 px-4 py-2 rounded-full border border-blue-300/40 bg-slate-700/60 text-slate-100 text-sm font-semibold transition-all hover:bg-slate-600/80"
                title="Reset to defaults"
              >
                Reset All
              </button>
            </section>

            <p className="text-xs leading-relaxed text-slate-400 mt-auto">
              Use the sliders on the left to tweak the planet. Press H to hide/show the panel.
            </p>
          </div>
        </div>

        {/* 3D Scene */}
        <section id="scene" className="flex-1 relative min-h-0">
          <Studio3D 
            previewMode={false}
            loadShareParam={loadShareParam}
            hashParam={hashParam}
          />
          <div id="hud-fps" className="absolute left-4 bottom-4 px-3 py-2 rounded-lg bg-slate-900/55 border border-blue-300/35 text-sm font-bold tracking-wide" aria-live="polite">
            FPS: 0
          </div>
        </section>
      </main>

      {/* Panel scrim for mobile */}
      {controlsOpen && (
        <div 
          id="panel-scrim"
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-10 lg:hidden"
          onClick={() => setControlsOpen(false)}
        />
      )}

      {/* Exit overlay */}
      <div id="exit-overlay" className="fixed inset-0 flex items-center justify-center bg-slate-900/78 backdrop-blur-lg z-60 opacity-0 transition-opacity duration-500 pointer-events-none">
        <div className="flex flex-col items-center gap-3 p-12 rounded-3xl bg-slate-800/92 border border-blue-400/35 shadow-2xl">
          <div className="w-10 h-10 border-4 border-slate-400/25 border-t-slate-400/95 rounded-full animate-spin" />
          <p className="text-lg font-semibold tracking-widest uppercase text-slate-200">
            Saving your system…
          </p>
          <p className="text-sm text-slate-400">
            Preparing the landing preview
          </p>
        </div>
      </div>
    </div>
  )
}

export default Studio