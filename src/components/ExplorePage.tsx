import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { API_BASE_URL } from '../app/config'

interface SharedSystem {
  id: string
  metadata?: {
    name?: string
  }
  summary?: {
    preset?: string
    seed?: string
  }
  createdAt: string
  viewCount?: number
}

const ExplorePage: React.FC = () => {
  const location = useLocation()
  const [systems, setSystems] = useState<SharedSystem[]>([])
  const [selectedSystem, setSelectedSystem] = useState<SharedSystem | null>(null)
  const [filters, setFilters] = useState({
    preset: '',
    seed: '',
    sort: 'recent'
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Check for direct system ID in URL
    const params = new URLSearchParams(location.search)
    const systemId = params.get('id')
    if (systemId) {
      // Handle direct system link
      console.log('Direct system link:', systemId)
    }
  }, [location])

  useEffect(() => {
    fetchSystems()
  }, [filters, currentPage])

  const fetchSystems = async () => {
    setLoading(true)
    try {
      const queryParams = new URLSearchParams()
      if (filters.preset) queryParams.append('preset', filters.preset)
      if (filters.seed) queryParams.append('seed', filters.seed)
      queryParams.append('sort', filters.sort)
      queryParams.append('page', currentPage.toString())
      queryParams.append('limit', '12')

      const endpoint = `${API_BASE_URL.replace(/\/?$/, '')}/systems?${queryParams.toString()}`
      const response = await fetch(endpoint, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      
      const payload = await response.json()
      setSystems(payload?.items || [])
      setTotalPages(payload?.totalPages || 1)
    } catch (err) {
      console.warn('Unable to retrieve systems', err)
      setSystems([])
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setCurrentPage(1) // Reset to first page when filters change
  }

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchSystems()
  }

  const resetFilters = () => {
    setFilters({ preset: '', seed: '', sort: 'recent' })
    setCurrentPage(1)
  }

  const formatRelativeTime = (value: string): string => {
    try {
      const now = Date.now()
      const target = new Date(value).getTime()
      if (Number.isNaN(target)) return ''
      const diff = Math.max(0, now - target)

      const minute = 60 * 1000
      const hour = 60 * minute
      const day = 24 * hour
      const week = 7 * day

      if (diff < minute) return 'Just now'
      if (diff < hour) {
        const mins = Math.round(diff / minute)
        return `${mins} min${mins === 1 ? '' : 's'} ago`
      }
      if (diff < day) {
        const hours = Math.round(diff / hour)
        return `${hours} hour${hours === 1 ? '' : 's'} ago`
      }
      if (diff < week) {
        const days = Math.round(diff / day)
        return `${days} day${days === 1 ? '' : 's'} ago`
      }
      const weeks = Math.round(diff / week)
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`
    } catch {
      return ''
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.setAttribute('readonly', '')
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
    } catch (err) {
      console.warn('Clipboard copy failed', err)
    }
  }

  const handleSystemSelect = (system: SharedSystem) => {
    setSelectedSystem(system)
  }

  const getPreviewSrc = () => {
    if (!selectedSystem) return ''
    return `/studio?preview=1&load=${encodeURIComponent(selectedSystem.id)}`
  }

  const goToPage = (page: number) => {
    setCurrentPage(page)
  }

  return (
    <div className="explore">
      <header className="explore__nav">
        <Link className="explore__brand" to="/">
          <span className="logo-dot" aria-hidden="true"></span>
          <span className="logo-text">Procedural Planet Studio</span>
        </Link>
        <div className="explore__actions">
          <Link className="btn btn-ghost" to="/">Home</Link>
          <Link className="btn btn-secondary" to="/studio">Launch Studio</Link>
        </div>
      </header>

      <main className="explore__main">
        <section className="explore__intro">
          <h1>Explore Shared Systems</h1>
          <p>
            Browse the latest creations from the community, preview them in real time, and jump straight into the
            studio to make them your own.
          </p>
        </section>

        <form className="explore__filters" onSubmit={handleFilterSubmit}>
          <label className="explore__filter">
            <span className="explore__filter-label">Preset</span>
            <input 
              type="text" 
              value={filters.preset}
              onChange={(e) => handleFilterChange('preset', e.target.value)}
              placeholder="Any" 
              autoComplete="off" 
            />
          </label>
          <label className="explore__filter">
            <span className="explore__filter-label">Seed</span>
            <input 
              type="text" 
              value={filters.seed}
              onChange={(e) => handleFilterChange('seed', e.target.value)}
              placeholder="Any" 
              autoComplete="off" 
            />
          </label>
          <label className="explore__filter">
            <span className="explore__filter-label">Sort</span>
            <select 
              value={filters.sort}
              onChange={(e) => handleFilterChange('sort', e.target.value)}
            >
              <option value="recent">Newest</option>
              <option value="popular">Most visited</option>
            </select>
          </label>
          <div className="explore__filter-actions">
            <button type="submit" className="btn btn-secondary">Apply</button>
            <button type="button" onClick={resetFilters} className="btn btn-ghost">Reset</button>
          </div>
        </form>

        <section className="explore__content">
          <div className="explore__list" role="list">
            {loading ? (
              <div className="loading">Loading systems...</div>
            ) : systems.length > 0 ? (
              systems.map((system) => (
                <div 
                  key={system.id} 
                  className={`explore__item ${selectedSystem?.id === system.id ? 'selected' : ''}`}
                  onClick={() => handleSystemSelect(system)}
                  role="listitem"
                >
                  <article className="explore__card">
                    <div className="explore__card-header">
                      <h3 className="explore__title">
                        {system?.metadata?.name || system?.summary?.preset || `System ${system.id}`}
                      </h3>
                      <span className="explore__code">#{system.id}</span>
                    </div>
                    <dl className="explore__meta">
                      <dt>Seed</dt>
                      <dd>{system?.summary?.seed || '—'}</dd>
                      <dt>Preset</dt>
                      <dd>{system?.summary?.preset || 'Custom'}</dd>
                      <dt>Shared</dt>
                      <dd>{formatRelativeTime(system.createdAt) || 'Recently'}</dd>
                      {system.viewCount && (
                        <>
                          <dt>Views</dt>
                          <dd>{system.viewCount}</dd>
                        </>
                      )}
                    </dl>
                  </article>
                </div>
              ))
            ) : (
              <div className="explore__empty">No systems found matching your criteria.</div>
            )}
          </div>
          
          <aside className="explore__preview" aria-live="polite">
            <div className="explore__preview-frame">
              {selectedSystem ? (
                <iframe
                  src={getPreviewSrc()}
                  title="Planet preview"
                  loading="lazy"
                  allow="accelerometer; fullscreen"
                />
              ) : (
                <div className="explore__preview-empty">Select a system to preview</div>
              )}
            </div>
            {selectedSystem && (
              <>
                <div className="explore__preview-details">
                  <h3>{selectedSystem?.metadata?.name || selectedSystem?.summary?.preset || `System ${selectedSystem.id}`}</h3>
                  <dl>
                    <dt>Seed</dt>
                    <dd>{selectedSystem?.summary?.seed || '—'}</dd>
                    <dt>Preset</dt>
                    <dd>{selectedSystem?.summary?.preset || 'Custom'}</dd>
                    <dt>Shared</dt>
                    <dd>{formatRelativeTime(selectedSystem.createdAt) || 'Recently'}</dd>
                  </dl>
                </div>
                <div className="explore__preview-actions">
                  <Link 
                    to={`/studio#${selectedSystem.id}`}
                    className="explore__button"
                  >
                    Open in Studio
                  </Link>
                  <button 
                    className="explore__button explore__button--ghost"
                    onClick={() => copyToClipboard(selectedSystem.id)}
                  >
                    Copy Share Code
                  </button>
                </div>
              </>
            )}
          </aside>
        </section>

        <nav className="explore__pagination" aria-label="Pagination controls">
          <button 
            className="explore__page-button" 
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button 
            className="explore__page-button" 
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
          </button>
        </nav>
      </main>
    </div>
  )
}

export default ExplorePage