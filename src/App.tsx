import React from 'react'
import { Routes, Route } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import StudioPage from './components/StudioPage'
import ExplorePage from './components/ExplorePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/studio" element={<StudioPage />} />
      <Route path="/explore" element={<ExplorePage />} />
    </Routes>
  )
}

export default App