import { useState, useEffect, useCallback } from 'react'
import * as THREE from 'three'

interface PlanetControl {
  name: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

export const usePlanetControls = (
  planet: THREE.Mesh | null,
  updateScene: () => void
): PlanetControl[] => {
  const [controls, setControls] = useState<PlanetControl[]>([])

  const updatePlanet = useCallback((property: string, value: number) => {
    if (!planet) return

    // Update planet properties based on the control
    switch (property) {
      case 'radius':
        planet.scale.setScalar(value)
        break
      case 'rotationSpeed':
        planet.userData.rotationSpeed = value
        break
      case 'color':
        if (planet.material instanceof THREE.MeshLambertMaterial) {
          planet.material.color.setHex(value)
        }
        break
      case 'opacity':
        if (planet.material instanceof THREE.MeshLambertMaterial) {
          planet.material.opacity = value
        }
        break
      // Add more planet properties as needed
    }

    updateScene()
  }, [planet, updateScene])

  useEffect(() => {
    if (!planet) {
      setControls([])
      return
    }

    // Create planet controls
    const planetControls: PlanetControl[] = [
      {
        name: 'Radius',
        value: 1.0,
        min: 0.5,
        max: 3.0,
        step: 0.1,
        onChange: (value: number) => updatePlanet('radius', value)
      },
      {
        name: 'Rotation Speed',
        value: 1.0,
        min: 0.0,
        max: 5.0,
        step: 0.1,
        onChange: (value: number) => updatePlanet('rotationSpeed', value)
      },
      {
        name: 'Color',
        value: 0x4a90e2,
        min: 0x000000,
        max: 0xffffff,
        step: 1,
        onChange: (value: number) => updatePlanet('color', value)
      },
      {
        name: 'Opacity',
        value: 0.9,
        min: 0.1,
        max: 1.0,
        step: 0.05,
        onChange: (value: number) => updatePlanet('opacity', value)
      }
    ]

    setControls(planetControls)
  }, [planet, updatePlanet])

  return controls
}