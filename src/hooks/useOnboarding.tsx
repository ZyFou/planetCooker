import { useState, useCallback } from 'react'

export const useOnboarding = () => {
  const [showOnboarding, setShowOnboarding] = useState(false)

  const showTutorial = useCallback(() => {
    setShowOnboarding(true)
  }, [])

  const hideTutorial = useCallback(() => {
    setShowOnboarding(false)
  }, [])

  return {
    showOnboarding,
    showTutorial,
    hideOnboarding: hideTutorial
  }
}