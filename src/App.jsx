import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Studio from './pages/Studio'
import Explore from './pages/Explore'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/explore" element={<Explore />} />
    </Routes>
  )
}

export default App