import { useState, useCallback } from 'react'
import * as THREE from 'three'

export const useMobileControls = () => {
  const [focusTarget, setFocusTarget] = useState<string>('')

  const focusOnTarget = useCallback((target: string) => {
    setFocusTarget(target)
    
    // This would typically control the camera to focus on the specified object
    // Implementation depends on the camera controls system
    switch (target) {
      case 'planet':
        console.log('Focusing on planet')
        break
      case 'sun':
        console.log('Focusing on sun')
        break
      default:
        if (target.startsWith('moon-')) {
          const moonIndex = parseInt(target.split('-')[1])
          console.log(`Focusing on moon ${moonIndex}`)
        }
        break
    }
  }, [])

  return {
    focusTarget,
    focusOnTarget
  }
}