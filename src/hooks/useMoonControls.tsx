import { useState, useEffect, useCallback } from 'react'
import * as THREE from 'three'

interface MoonControl {
  name: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

export const useMoonControls = (
  moons: THREE.Mesh[],
  updateScene: () => void
): MoonControl[] => {
  const [controls, setControls] = useState<MoonControl[]>([])

  const updateMoons = useCallback((property: string, value: number) => {
    moons.forEach((moon, index) => {
      if (!moon) return

      switch (property) {
        case 'count':
          // This would typically add/remove moons
          // Implementation depends on the moon management system
          break
        case 'orbitRadius':
          moon.userData.orbitRadius = value
          break
        case 'orbitSpeed':
          moon.userData.orbitSpeed = value
          break
        case 'size':
          moon.scale.setScalar(value)
          break
      }
    })

    updateScene()
  }, [moons, updateScene])

  useEffect(() => {
    if (!moons || moons.length === 0) {
      setControls([])
      return
    }

    // Create moon controls
    const moonControls: MoonControl[] = [
      {
        name: 'Moon Count',
        value: moons.length,
        min: 0,
        max: 5,
        step: 1,
        onChange: (value: number) => updateMoons('count', value)
      },
      {
        name: 'Orbit Radius',
        value: 4.0,
        min: 2.0,
        max: 8.0,
        step: 0.1,
        onChange: (value: number) => updateMoons('orbitRadius', value)
      },
      {
        name: 'Orbit Speed',
        value: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
        onChange: (value: number) => updateMoons('orbitSpeed', value)
      },
      {
        name: 'Moon Size',
        value: 0.3,
        min: 0.1,
        max: 1.0,
        step: 0.05,
        onChange: (value: number) => updateMoons('size', value)
      }
    ]

    setControls(moonControls)
  }, [moons, updateMoons])

  return controls
}