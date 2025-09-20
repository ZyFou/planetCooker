import React, { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSystemsList } from '../hooks/useApi'
import SystemCard from '../components/SystemCard'
import PreviewPanel from '../components/PreviewPanel'
import FiltersPanel from '../components/FiltersPanel'
import Pagination from '../components/Pagination'

const Explore = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedSystem, setSelectedSystem] = useState(null)
  
  const pageSize = 12
  const page = parseInt(searchParams.get('page') || '1', 10)
  const preset = searchParams.get('preset') || ''
  const seed = searchParams.get('seed') || ''
  const sort = searchParams.get('sort') || 'recent'
  const selectedId = searchParams.get('id') || null

  const { systems, total, pageCount, loading, error, loadSystems } = useSystemsList()

  const updateUrl = useCallback((updates) => {
    const newParams = new URLSearchParams(searchParams)
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== '') {
        newParams.set(key, value)
      } else {
        newParams.delete(key)
      }
    })
    
    setSearchParams(newParams)
  }, [searchParams, setSearchParams])


  const selectItem = (item) => {
    setSelectedSystem(item)
    updateUrl({ id: item.id })
  }

  const handleFilterSubmit = (filters) => {
    updateUrl({
      ...filters,
      page: '1'
    })
  }

  const handleResetFilters = () => {
    updateUrl({
      preset: '',
      seed: '',
      sort: 'recent',
      page: '1'
    })
  }

  const handlePageChange = (newPage) => {
    updateUrl({ page: String(newPage) })
  }

  useEffect(() => {
    loadSystems({ page, pageSize, preset, seed, sort })
  }, [loadSystems, page, pageSize, preset, seed, sort])

  useEffect(() => {
    // Set selected system from URL param
    if (selectedId && systems.length > 0) {
      const system = systems.find(s => s.id === selectedId)
      if (system) {
        setSelectedSystem(system)
      }
    } else if (!selectedId && systems.length > 0 && !selectedSystem) {
      // Auto-select first item if none selected
      selectItem(systems[0])
    }
  }, [selectedId, systems, selectedSystem])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 p-6 md:p-12">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 mb-8">
        <Link 
          to="/" 
          className="flex items-center gap-3 font-semibold tracking-wider uppercase text-slate-200 hover:text-white transition-colors"
        >
          <div className="w-3 h-3 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full shadow-lg shadow-blue-400/85" />
          <span>Procedural Planet Studio</span>
        </Link>
        <div className="flex gap-3">
          <Link to="/" className="btn btn-ghost">
            Home
          </Link>
          <Link to="/studio" className="btn btn-secondary">
            Launch Studio
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col gap-8">
        {/* Intro */}
        <section className="max-w-3xl">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-wide uppercase mb-4">
            Explore Shared Systems
          </h1>
          <p className="text-lg leading-relaxed text-slate-300">
            Browse the latest creations from the community, preview them in real time, and jump straight into the
            studio to make them your own.
          </p>
        </section>

        {/* Filters */}
        <FiltersPanel
          filters={{ preset, seed, sort }}
          onFilterSubmit={handleFilterSubmit}
          onResetFilters={handleResetFilters}
        />

        {/* Content grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Systems list */}
          <div className="xl:col-span-2">
            {loading ? (
              <div className="text-center py-16 text-slate-400">
                Loading systems...
              </div>
            ) : error ? (
              <div className="text-center py-16 text-red-400">
                {error}
              </div>
            ) : systems.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                No shared systems yet. Save one in the studio to get started.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {systems.map((system) => (
                  <SystemCard
                    key={system.id}
                    system={system}
                    isActive={selectedSystem?.id === system.id}
                    onClick={selectItem}
                    compact={true}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Preview panel */}
          <aside className="xl:col-span-1">
            <PreviewPanel selectedSystem={selectedSystem} />
          </aside>
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={page}
          totalPages={pageCount}
          onPageChange={handlePageChange}
        />
      </main>
    </div>
  )
}

export default Explore