import React, { useState, useCallback } from 'react'
import * as THREE from 'three'

interface DebugOptions {
  showPlanetVector: boolean
  showMoonVectors: boolean
  showHudFps: boolean
}

interface SceneStats {
  fps: number
  frameCount: number
  lastTime: number
}

export const useDebugPanel = (
  planet: THREE.Mesh | null,
  moons: THREE.Mesh[],
  stats: SceneStats
) => {
  const [debugOptions, setDebugOptions] = useState<DebugOptions>({
    showPlanetVector: false,
    showMoonVectors: false,
    showHudFps: true
  })

  const [planetSpeed, setPlanetSpeed] = useState<string>('0.000')
  const [moonSpeeds, setMoonSpeeds] = useState<string[]>([])

  const updateDebugOption = useCallback((option: keyof DebugOptions, value: boolean) => {
    setDebugOptions(prev => ({
      ...prev,
      [option]: value
    }))
  }, [])

  // Update speeds based on planet and moons
  const updateSpeeds = useCallback(() => {
    if (planet && planet.userData.velocity) {
      const speed = planet.userData.velocity.length()
      setPlanetSpeed(speed.toFixed(3))
    }

    const speeds = moons.map(moon => {
      if (moon && moon.userData.velocity) {
        const speed = moon.userData.velocity.length()
        return speed.toFixed(3)
      }
      return '0.000'
    })
    setMoonSpeeds(speeds)
  }, [planet, moons])

  // Update speeds periodically
  React.useEffect(() => {
    const interval = setInterval(updateSpeeds, 100)
    return () => clearInterval(interval)
  }, [updateSpeeds])

  return {
    debugOptions,
    updateDebugOption,
    fps: stats.fps,
    planetSpeed,
    moonSpeeds
  }
}