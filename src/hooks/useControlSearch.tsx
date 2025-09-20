import { useState, useMemo } from 'react'

interface Control {
  name: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

export const useControlSearch = (allControls: Control[]) => {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredControls = useMemo(() => {
    if (!searchQuery.trim()) {
      return allControls
    }

    const query = searchQuery.toLowerCase()
    return allControls.filter(control => 
      control.name.toLowerCase().includes(query)
    )
  }, [allControls, searchQuery])

  const clearSearch = () => {
    setSearchQuery('')
  }

  return {
    searchQuery,
    setSearchQuery,
    filteredControls,
    clearSearch
  }
}