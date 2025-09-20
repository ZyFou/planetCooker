import React, { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import GUI from 'lil-gui'
import { createNoise3D } from 'simplex-noise'
import { debounce, SeededRNG } from '../app/utils.js'
import { initControlSearch } from '../app/gui/controlSearch.js'
import { setupPlanetControls } from '../app/gui/planetControls.js'
import { setupMoonControls } from '../app/gui/moonControls.js'
import { createStarfield as createStarfieldExt, createSunTexture as createSunTextureExt } from '../app/stars.js'
import { generateRingTexture as generateRingTextureExt, generateAnnulusTexture as generateAnnulusTextureExt } from '../app/textures.js'
import { encodeShare as encodeShareExt, decodeShare as decodeShareExt, saveConfigurationToAPI as saveConfigurationToAPIExt, loadConfigurationFromAPI as loadConfigurationFromAPIExt } from '../app/shareCore.js'
import { initOnboarding, showOnboarding } from '../app/onboarding.js'

const Studio3D = ({ previewMode = false, loadShareParam, hashParam }) => {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const guiRef = useRef(null)
  const animationFrameRef = useRef(null)

  // Initialize the 3D scene
  const initializeScene = useCallback(() => {
    if (!containerRef.current) return

    const sceneContainer = containerRef.current
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.1, 500)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    const controls = new OrbitControls(camera, renderer.domElement)

    // Configure renderer
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace

    // Configure camera
    camera.position.set(0, 0, 8)

    // Configure controls
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.enableZoom = true
    controls.enablePan = true
    controls.autoRotate = false
    controls.autoRotateSpeed = 0.5

    // Add to DOM
    sceneContainer.appendChild(renderer.domElement)

    // Store references
    sceneRef.current = scene
    rendererRef.current = renderer
    cameraRef.current = camera
    controlsRef.current = controls

    // Initialize GUI
    if (!previewMode) {
      const gui = new GUI()
      guiRef.current = gui
      
      // Setup planet and moon controls first
      setupPlanetControls(gui)
      setupMoonControls(gui)
      
      // Initialize control search after a short delay to ensure DOM is ready
      setTimeout(() => {
        const controlsContainer = document.getElementById('controls')
        const searchInput = document.getElementById('control-search')
        const clearButton = document.getElementById('control-search-clear')
        const emptyState = document.getElementById('control-search-empty')
        const searchBar = document.getElementById('control-search-bar')
        const infoPanel = document.getElementById('info')
        
        // Initialize control search with proper DOM elements
        if (controlsContainer && searchInput) {
          initControlSearch({
            controlsContainer,
            searchInput,
            clearButton,
            emptyState,
            searchBar,
            infoPanel
          })
        }
      }, 100)
    }

    // Add resize handler
    const handleResize = () => {
      if (!sceneContainer || !camera || !renderer) return
      
      const width = sceneContainer.clientWidth
      const height = sceneContainer.clientHeight
      
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }

    window.addEventListener('resize', handleResize)

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize)
      if (guiRef.current) {
        guiRef.current.destroy()
      }
      if (renderer.domElement && sceneContainer.contains(renderer.domElement)) {
        sceneContainer.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [previewMode])

  // Animation loop
  const animate = useCallback(() => {
    if (!controlsRef.current || !rendererRef.current || !sceneRef.current || !cameraRef.current) return

    controlsRef.current.update()
    rendererRef.current.render(sceneRef.current, cameraRef.current)
    
    animationFrameRef.current = requestAnimationFrame(animate)
  }, [])

  // Handle share code loading
  const handleShareCode = useCallback(async (code) => {
    if (!code) return
    
    try {
      const config = await loadConfigurationFromAPIExt(code)
      if (config && guiRef.current) {
        // Apply configuration to GUI controls
        // This would need to be implemented based on the specific GUI structure
        console.log('Loaded configuration:', config)
      }
    } catch (error) {
      console.error('Failed to load share code:', error)
    }
  }, [])

  // Event handlers for buttons
  useEffect(() => {
    const handleRandomizeSeed = () => {
      // Trigger seed randomization
      console.log('Randomize seed')
    }

    const handleSurpriseMe = () => {
      // Trigger surprise me functionality
      console.log('Surprise me')
    }

    const handleCopyShare = async () => {
      try {
        // Generate and copy share code
        const shareCode = 'example-share-code' // This would be generated from current config
        await navigator.clipboard.writeText(shareCode)
        console.log('Share code copied:', shareCode)
      } catch (error) {
        console.error('Failed to copy share code:', error)
      }
    }

    const handleHelp = () => {
      showOnboarding()
    }

    // Add event listeners
    window.addEventListener('randomize-seed', handleRandomizeSeed)
    window.addEventListener('surprise-me', handleSurpriseMe)
    window.addEventListener('copy-share', handleCopyShare)
    window.addEventListener('help', handleHelp)
    window.addEventListener('mobile-randomize', handleRandomizeSeed)
    window.addEventListener('mobile-surprise', handleSurpriseMe)
    window.addEventListener('mobile-copy', handleCopyShare)
    window.addEventListener('mobile-help', handleHelp)

    return () => {
      window.removeEventListener('randomize-seed', handleRandomizeSeed)
      window.removeEventListener('surprise-me', handleSurpriseMe)
      window.removeEventListener('copy-share', handleCopyShare)
      window.removeEventListener('help', handleHelp)
      window.removeEventListener('mobile-randomize', handleRandomizeSeed)
      window.removeEventListener('mobile-surprise', handleSurpriseMe)
      window.removeEventListener('mobile-copy', handleCopyShare)
      window.removeEventListener('mobile-help', handleHelp)
    }
  }, [])

  // Initialize scene and start animation
  useEffect(() => {
    const cleanup = initializeScene()
    if (cleanup) {
      animate()
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (cleanup) {
        cleanup()
      }
    }
  }, [initializeScene, animate])

  // Handle share code loading from URL
  useEffect(() => {
    if (loadShareParam) {
      handleShareCode(loadShareParam)
    } else if (hashParam) {
      handleShareCode(hashParam)
    }
  }, [loadShareParam, hashParam, handleShareCode])

  // Initialize onboarding
  useEffect(() => {
    if (!previewMode) {
      initOnboarding()
    }
  }, [previewMode])

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full"
      style={{ 
        background: 'radial-gradient(circle at top, #1c2a4a 0%, #05070f 65%)',
        cursor: previewMode ? 'default' : 'grab'
      }}
    />
  )
}

export default Studio3D