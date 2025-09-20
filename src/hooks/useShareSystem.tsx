import { useState, useCallback } from 'react'
import * as THREE from 'three'
import { encodeShare, decodeShare, saveConfigurationToAPI } from '../app/shareCore'

export const useShareSystem = (
  planet: THREE.Mesh | null,
  moons: THREE.Mesh[],
  sun: THREE.Mesh | null
) => {
  const [shareCode, setShareCode] = useState<string>('')

  const generateShareCode = useCallback(async () => {
    if (!planet) return ''

    try {
      // Collect current system configuration
      const config = {
        planet: {
          position: planet.position.toArray(),
          rotation: planet.rotation.toArray(),
          scale: planet.scale.toArray(),
          userData: planet.userData
        },
        moons: moons.map(moon => ({
          position: moon.position.toArray(),
          rotation: moon.rotation.toArray(),
          scale: moon.scale.toArray(),
          userData: moon.userData
        })),
        sun: sun ? {
          position: sun.position.toArray(),
          rotation: sun.rotation.toArray(),
          scale: sun.scale.toArray(),
          userData: sun.userData
        } : null
      }

      // Encode the configuration
      const encoded = await encodeShare(config)
      setShareCode(encoded)
      return encoded
    } catch (error) {
      console.error('Failed to generate share code:', error)
      return ''
    }
  }, [planet, moons, sun])

  const saveSystem = useCallback(async () => {
    try {
      const code = await generateShareCode()
      if (code) {
        // Save to API
        const result = await saveConfigurationToAPI(code, {
          name: `System ${Date.now()}`,
          preset: 'Custom'
        })
        
        if (result && result.id) {
          setShareCode(result.id)
          return result.id
        }
      }
    } catch (error) {
      console.error('Failed to save system:', error)
    }
    return null
  }, [generateShareCode])

  const loadSystem = useCallback(async (code: string) => {
    try {
      // Decode the configuration
      const config = await decodeShare(code)
      
      if (config && planet) {
        // Apply planet configuration
        if (config.planet) {
          planet.position.fromArray(config.planet.position)
          planet.rotation.fromArray(config.planet.rotation)
          planet.scale.fromArray(config.planet.scale)
          Object.assign(planet.userData, config.planet.userData)
        }

        // Apply moons configuration
        if (config.moons) {
          config.moons.forEach((moonConfig, index) => {
            if (moons[index]) {
              moons[index].position.fromArray(moonConfig.position)
              moons[index].rotation.fromArray(moonConfig.rotation)
              moons[index].scale.fromArray(moonConfig.scale)
              Object.assign(moons[index].userData, moonConfig.userData)
            }
          })
        }

        // Apply sun configuration
        if (config.sun && sun) {
          sun.position.fromArray(config.sun.position)
          sun.rotation.fromArray(config.sun.rotation)
          sun.scale.fromArray(config.sun.scale)
          Object.assign(sun.userData, config.sun.userData)
        }
      }
    } catch (error) {
      console.error('Failed to load system:', error)
    }
  }, [planet, moons, sun])

  return {
    shareCode,
    generateShareCode,
    saveSystem,
    loadSystem
  }
}