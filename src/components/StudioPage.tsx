import React, { useRef, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useThreeScene } from '../hooks/useThreeScene'
import { usePlanetControls } from '../hooks/usePlanetControls'
import { useMoonControls } from '../hooks/useMoonControls'
import { useControlSearch } from '../hooks/useControlSearch'
import { useShareSystem } from '../hooks/useShareSystem'
import { useOnboarding } from '../hooks/useOnboarding'
import { useDebugPanel } from '../hooks/useDebugPanel'
import { useMobileControls } from '../hooks/useMobileControls'

const StudioPage: React.FC = () => {
  const sceneRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  
  const [showControls, setShowControls] = useState(false)
  const [showDesktopMenu, setShowDesktopMenu] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showMobileFocus, setShowMobileFocus] = useState(false)
  const [showImportShare, setShowImportShare] = useState(false)
  const [importShareCode, setImportShareCode] = useState('')

  // Check if in preview mode
  const isPreview = new URLSearchParams(location.search).get('preview') === '1'
  const loadShareParam = new URLSearchParams(location.search).get('load')
  const shareHash = location.hash.replace('#', '')

  // Initialize Three.js scene
  const {
    scene,
    renderer,
    camera,
    controls,
    planet,
    moons,
    sun,
    stats,
    updateScene
  } = useThreeScene(sceneRef, isPreview, loadShareParam || shareHash)

  // Initialize controls
  const planetControls = usePlanetControls(planet, updateScene)
  const moonControls = useMoonControls(moons, updateScene)
  const { searchQuery, filteredControls, clearSearch } = useControlSearch([
    ...planetControls,
    ...moonControls
  ])
  
  const { shareCode, saveSystem, loadSystem } = useShareSystem(planet, moons, sun)
  const { showTutorial } = useOnboarding()
  const { debugOptions, fps, planetSpeed, moonSpeeds } = useDebugPanel(planet, moons, stats)
  const { focusOnTarget } = useMobileControls()

  // Handle import share code
  const handleImportShare = () => {
    if (importShareCode.trim()) {
      loadSystem(importShareCode.trim())
      setImportShareCode('')
      setShowImportShare(false)
    }
  }

  // Handle randomize seed
  const handleRandomize = () => {
    // Implementation will be added when we migrate the planet generation logic
    console.log('Randomize seed')
  }

  // Handle surprise me
  const handleSurpriseMe = () => {
    // Implementation will be added when we migrate the planet generation logic
    console.log('Surprise me')
  }

  // Handle reset all
  const handleResetAll = () => {
    // Implementation will be added when we migrate the planet generation logic
    console.log('Reset all')
  }

  // Handle help
  const handleHelp = () => {
    showTutorial()
  }

  // Handle focus on object
  const handleFocus = (target: string) => {
    focusOnTarget(target)
    setShowMobileFocus(false)
  }

  return (
    <div id="app">
      <header id="header">
        <h1>Procedural Planet Studio</h1>
        <div className="header-actions">
          <button 
            className="desktop-only" 
            onClick={handleRandomize}
          >
            New Planet Shape
          </button>
          <button 
            className="desktop-only" 
            onClick={handleSurpriseMe}
          >
            Generate
          </button>
          <button 
            id="desktop-menu-toggle" 
            className="desktop-menu-toggle" 
            onClick={() => setShowDesktopMenu(!showDesktopMenu)}
            aria-controls="desktop-menu" 
            aria-expanded={showDesktopMenu}
            title="Menu"
          >
            &#9776;
          </button>
          
          <button 
            id="toggle-controls" 
            className="mobile-controls-toggle" 
            onClick={() => setShowControls(!showControls)}
            aria-controls="info" 
            aria-expanded={showControls}
            title="Toggle controls"
          >
            Controls
          </button>
          <button 
            className="mobile-surprise" 
            onClick={handleSurpriseMe}
          >
            Generate
          </button>
          <button 
            id="mobile-menu-toggle" 
            className="mobile-menu-toggle" 
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            aria-controls="mobile-menu" 
            aria-expanded={showMobileMenu}
            title="Menu"
          >
            &#9776;
          </button>
        </div>
        
        {/* Desktop burger menu */}
        <div 
          id="desktop-menu" 
          className="desktop-menu" 
          hidden={!showDesktopMenu}
        >
          <button onClick={() => saveSystem()}>Save Planet</button>
          <button onClick={handleHelp} title="Show tutorial">Help</button>
          <Link to="/">Back to Landing</Link>
        </div>
        
        {/* Mobile burger menu */}
        <div 
          id="mobile-menu" 
          className="mobile-menu" 
          hidden={!showMobileMenu}
        >
          <button onClick={handleRandomize}>New Planet Shape</button>
          <button onClick={() => saveSystem()}>Save Planet</button>
          <button onClick={handleResetAll}>Reset All</button>
          <button onClick={handleHelp}>How to Play</button>
          <Link to="/">Back to Landing</Link>
        </div>
      </header>

      <main id="main">
        <section id="info" className={showControls ? 'mobile-visible' : ''}>
          <div className="stat">
            <span className="label">Seed</span>
            <span className="value">{planet?.userData?.seed || '-'}</span>
          </div>
          <div className="stat">
            <span className="label">Gravity</span>
            <span className="value">{planet?.userData?.gravity || '-'}</span>
          </div>
          <div className="stat">
            <span className="label">System Age</span>
            <span className="value">0y</span>
          </div>
          <div className="stat">
            <span className="label">Stable Moons</span>
            <span className="value">{moons?.length || '-'}</span>
          </div>
          <div className="stat">
            <span className="label">Share Code</span>
            <div className="share-row">
              {!showImportShare ? (
                <button 
                  onClick={() => setShowImportShare(true)}
                  className="copy-inline"
                >
                  Import
                </button>
              ) : (
                <div className="share-row">
                  <input 
                    type="text" 
                    value={importShareCode}
                    onChange={(e) => setImportShareCode(e.target.value)}
                    placeholder="Paste share code..." 
                    aria-label="Paste share code" 
                    style={{flex: 1, minWidth: 0}} 
                  />
                  <button 
                    onClick={handleImportShare}
                    className="copy-inline"
                  >
                    Load
                  </button>
                  <button 
                    onClick={() => {
                      setShowImportShare(false)
                      setImportShareCode('')
                    }}
                    className="copy-inline" 
                    title="Cancel import"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="control-search-bar">
            <input 
              type="search" 
              value={searchQuery}
              onChange={(e) => {
                // This will be handled by the useControlSearch hook
                console.log('Search:', e.target.value)
              }}
              placeholder="Search controls..." 
              autocomplete="off" 
              spellCheck="false" 
              aria-label="Search controls" 
            />
            <button 
              onClick={clearSearch}
              type="button" 
              title="Clear search" 
              aria-label="Clear search"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          
          <p className="control-search-empty" hidden={filteredControls.length > 0}>
            No controls match your search.
          </p>
          
          <div id="controls" ref={controlsRef}>
            {/* Controls will be rendered here by the hooks */}
          </div>
          
          <section className="debug-panel">
            <h2 className="debug-title">Debug Info</h2>
            <div className="debug-option">
              <span className="debug-metric">FPS: <span>{fps}</span></span>
            </div>
            <div className="debug-option">
              <label className="debug-toggle">
                <input 
                  type="checkbox" 
                  checked={debugOptions.showPlanetVector}
                  onChange={(e) => {
                    // This will be handled by the useDebugPanel hook
                    console.log('Toggle planet vector:', e.target.checked)
                  }}
                />
                <span>Planet velocity vector</span>
              </label>
              <span className="debug-metric">Speed: <span>{planetSpeed}</span></span>
            </div>
            <div className="debug-option">
              <label className="debug-toggle">
                <input 
                  type="checkbox" 
                  checked={debugOptions.showMoonVectors}
                  onChange={(e) => {
                    // This will be handled by the useDebugPanel hook
                    console.log('Toggle moon vectors:', e.target.checked)
                  }}
                />
                <span>Moon velocity vectors</span>
              </label>
            </div>
            <div className="debug-option">
              <label className="debug-toggle">
                <input 
                  type="checkbox" 
                  checked={debugOptions.showHudFps}
                  onChange={(e) => {
                    // This will be handled by the useDebugPanel hook
                    console.log('Toggle HUD FPS:', e.target.checked)
                  }}
                />
                <span>HUD FPS</span>
              </label>
            </div>
            <ul className="debug-moon-speed-list">
              {moonSpeeds.map((speed, index) => (
                <li key={index}>Moon {index + 1}: {speed}</li>
              ))}
            </ul>
            <button onClick={handleResetAll} title="Reset to defaults">
              Reset All
            </button>
          </section>
          
          <p className="hint">Use the sliders on the left to tweak the planet. Press H to hide/show the panel.</p>
        </section>
        
        <section id="scene" ref={sceneRef}>
          <div className="hud-fps" aria-live="polite">
            FPS: {fps}
          </div>
          
          {/* Mobile focus mode button */}
          <button 
            className="mobile-focus-toggle" 
            onClick={() => setShowMobileFocus(!showMobileFocus)}
            aria-controls="mobile-focus-menu" 
            aria-expanded={showMobileFocus}
            title="Focus on object"
          >
            👁️
          </button>
          <div 
            className="mobile-focus-menu" 
            hidden={!showMobileFocus}
          >
            <div className="focus-menu-header">Focus on Object</div>
            <button className="focus-option" onClick={() => handleFocus('planet')}>
              🌍 Planet
            </button>
            <button className="focus-option" onClick={() => handleFocus('sun')}>
              ☀️ Star
            </button>
            <div>
              {moons?.map((_, index) => (
                <button 
                  key={index}
                  className="focus-option" 
                  onClick={() => handleFocus(`moon-${index}`)}
                >
                  🌙 Moon {index + 1}
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>
      
      <div id="panel-scrim" hidden={!showControls} onClick={() => setShowControls(false)} />
    </div>
  )
}

export default StudioPage