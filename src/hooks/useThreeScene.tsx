import { useRef, useEffect, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createNoise3D } from 'simplex-noise'
import { createStarfield, createSunTexture } from '../app/stars'
import { generateRingTexture, generateAnnulusTexture } from '../app/textures'

interface SceneStats {
  fps: number
  frameCount: number
  lastTime: number
}

interface UseThreeSceneReturn {
  scene: THREE.Scene | null
  renderer: THREE.WebGLRenderer | null
  camera: THREE.PerspectiveCamera | null
  controls: OrbitControls | null
  planet: THREE.Mesh | null
  moons: THREE.Mesh[]
  sun: THREE.Mesh | null
  stats: SceneStats
  updateScene: () => void
}

export const useThreeScene = (
  containerRef: React.RefObject<HTMLDivElement>,
  isPreview: boolean = false,
  loadShareParam?: string
): UseThreeSceneReturn => {
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const planetRef = useRef<THREE.Mesh | null>(null)
  const moonsRef = useRef<THREE.Mesh[]>([])
  const sunRef = useRef<THREE.Mesh | null>(null)
  const animationIdRef = useRef<number | null>(null)
  
  const [stats, setStats] = useState<SceneStats>({
    fps: 0,
    frameCount: 0,
    lastTime: performance.now()
  })

  const updateScene = useCallback(() => {
    // This will be called when controls change
    // Implementation will be added when we migrate the planet generation logic
    console.log('Scene update requested')
  }, [])

  const animate = useCallback(() => {
    if (!sceneRef.current || !rendererRef.current || !cameraRef.current || !controlsRef.current) {
      return
    }

    const now = performance.now()
    const deltaTime = now - stats.lastTime

    // Update controls
    controlsRef.current.update()

    // Update planet rotation
    if (planetRef.current) {
      planetRef.current.rotation.y += 0.005
    }

    // Update moons
    moonsRef.current.forEach((moon, index) => {
      if (moon && moon.userData.orbitRadius && moon.userData.orbitSpeed) {
        const time = now * 0.001
        moon.position.x = Math.cos(time * moon.userData.orbitSpeed + index) * moon.userData.orbitRadius
        moon.position.z = Math.sin(time * moon.userData.orbitSpeed + index) * moon.userData.orbitRadius
      }
    })

    // Render
    rendererRef.current.render(sceneRef.current, cameraRef.current)

    // Update stats
    setStats(prevStats => {
      const newFrameCount = prevStats.frameCount + 1
      const newFps = newFrameCount % 60 === 0 ? 1000 / deltaTime : prevStats.fps
      return {
        fps: Math.round(newFps),
        frameCount: newFrameCount,
        lastTime: now
      }
    })

    animationIdRef.current = requestAnimationFrame(animate)
  }, [stats.lastTime])

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    // Create scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05070f)

    // Create camera
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 500)
    camera.position.set(0, 2.4, 8.5)

    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.045
    controls.rotateSpeed = 0.7
    controls.minDistance = 2
    controls.maxDistance = 80

    if (isPreview) {
      controls.enablePan = false
      controls.enableZoom = false
      controls.autoRotate = true
      controls.autoRotateSpeed = 0.35
    }

    // Create lighting
    const ambientLight = new THREE.AmbientLight(0x6f87b6, 0.35)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2)
    directionalLight.position.set(5, 5, 5)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    scene.add(directionalLight)

    // Create starfield
    const starfield = createStarfield()
    scene.add(starfield)

    // Create sun
    const sunTexture = createSunTexture()
    const sunGeometry = new THREE.SphereGeometry(0.5, 32, 32)
    const sunMaterial = new THREE.MeshBasicMaterial({ 
      map: sunTexture,
      transparent: true,
      opacity: 0.9
    })
    const sun = new THREE.Mesh(sunGeometry, sunMaterial)
    sun.position.set(15, 0, 0)
    scene.add(sun)

    // Create planet (placeholder for now)
    const planetGeometry = new THREE.SphereGeometry(2, 64, 64)
    const planetMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x4a90e2,
      transparent: true,
      opacity: 0.9
    })
    const planet = new THREE.Mesh(planetGeometry, planetMaterial)
    planet.castShadow = true
    planet.receiveShadow = true
    planet.userData = {
      seed: Math.random().toString(36).substr(2, 9),
      gravity: '1.0g'
    }
    scene.add(planet)

    // Store references
    sceneRef.current = scene
    rendererRef.current = renderer
    cameraRef.current = camera
    controlsRef.current = controls
    planetRef.current = planet
    sunRef.current = sun

    // Handle resize
    const handleResize = () => {
      if (!container || !renderer || !camera) return
      
      const newWidth = container.clientWidth
      const newHeight = container.clientHeight
      
      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
    }

    window.addEventListener('resize', handleResize)

    // Start animation
    animate()

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [containerRef, isPreview, animate])

  // Load shared system if provided
  useEffect(() => {
    if (loadShareParam && loadShareParam.trim()) {
      // Implementation will be added when we migrate the share system logic
      console.log('Loading shared system:', loadShareParam)
    }
  }, [loadShareParam])

  return {
    scene: sceneRef.current,
    renderer: rendererRef.current,
    camera: cameraRef.current,
    controls: controlsRef.current,
    planet: planetRef.current,
    moons: moonsRef.current,
    sun: sunRef.current,
    stats,
    updateScene
  }
}