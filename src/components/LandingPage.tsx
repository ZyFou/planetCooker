import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
}

const LandingPage: React.FC = () => {
  const [systemsCount, setSystemsCount] = useState<number | null>(null)
  const [recentSystems, setRecentSystems] = useState<SharedSystem[]>([])
  const [currentUpdateIndex, setCurrentUpdateIndex] = useState(0)
  const [previewCode, setPreviewCode] = useState<string>('')

  const updates = [
    {
      title: "Ocean & Shoreline Effects",
      content: "New Water System: Added realistic ocean layers with transparent water spheres and dynamic shoreline foam! Control foam color and visibility independently. The ocean now feels like actual water with proper refraction and shoreline effects."
    },
    {
      title: "Independent Atmosphere Controls", 
      content: "Separated Controls: Atmosphere and cloud opacity are now completely independent! Create subtle atmospheres with thick clouds, or dramatic atmospheres with light clouds. Full control over both layers for more realistic planet rendering."
    },
    {
      title: "Enhanced Mobile Experience",
      content: "Mobile Focus System: Enhanced mobile layout with intuitive controls and a new focus system! Use the eye button (👁️) in the bottom right to focus on planets, moons, and stars. The mobile interface now provides easy access to all celestial elements with optimized touch controls."
    },
    {
      title: "Advanced Physics & Collisions",
      content: "Realistic Interactions: Improved moon physics with proper orbital mechanics, collision detection, and impact deformation. Moons now create realistic craters and surface changes when they collide with planets. Two-way gravitational interactions for more dynamic systems."
    }
  ]

  useEffect(() => {
    // Get systems count
    const fetchSystemsCount = async () => {
      try {
        const endpoint = `${API_BASE_URL.replace(/\/?$/, '')}/stats/count`
        const response = await fetch(endpoint, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json()
        const total = Number(payload?.total)
        if (Number.isFinite(total)) {
          setSystemsCount(total)
        }
      } catch (err) {
        console.warn('Unable to retrieve system count', err)
      }
    }

    // Get recent systems
    const fetchRecentSystems = async () => {
      try {
        const endpoint = `${API_BASE_URL.replace(/\/?$/, '')}/recent?limit=6`
        const response = await fetch(endpoint, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json()
        setRecentSystems(payload?.items || [])
      } catch (err) {
        console.warn('Unable to retrieve recent systems', err)
      }
    }

    fetchSystemsCount()
    fetchRecentSystems()

    // Auto-advance carousel
    const interval = setInterval(() => {
      setCurrentUpdateIndex(prev => (prev + 1) % updates.length)
    }, 8000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Handle URL parameters
    const params = new URLSearchParams(window.location.search)
    const code = params.get('previewCode')
    if (code) {
      setPreviewCode(code)
    }
  }, [])

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

  const nextUpdate = () => {
    setCurrentUpdateIndex(prev => (prev + 1) % updates.length)
  }

  const prevUpdate = () => {
    setCurrentUpdateIndex(prev => (prev - 1 + updates.length) % updates.length)
  }

  const goToUpdate = (index: number) => {
    setCurrentUpdateIndex(index)
  }

  const getPreviewSrc = () => {
    let src = "/studio?preview=1"
    if (previewCode) {
      src += `&load=${encodeURIComponent(previewCode)}`
    }
    return src
  }

  return (
    <div className="landing">
      <header className="landing__nav">
        <div className="landing__brand">
          <span className="logo-dot" aria-hidden="true"></span>
          <span className="logo-text">Procedural Planet Studio</span>
        </div>
      </header>

      <main className="landing__main">
        <section className="hero">
          <h1>Craft Your Own Worlds</h1>
          <p>
            Dial in atmospheres, rings, moons, and stars with science-inspired controls. Share fully
            reproducible planets in a single code.
          </p>
          <div className="hero__actions">
            <Link 
              className="btn btn-primary" 
              to={previewCode ? `/studio#${previewCode}` : "/studio"}
            >
              Launch The Studio
            </Link>
            <Link className="btn btn-ghost" to="/explore">
              Explore Systems
            </Link>
          </div>
          <div className="hero__meta" aria-live="polite">
            <dl className="hero__stat">
              <dt>Total Systems Shared</dt>
              <dd>{systemsCount !== null ? systemsCount.toLocaleString() : '—'}</dd>
            </dl>
          </div>
          
          <div className="hero__updates">
            <h3>Latest Updates</h3>
            <div className="updates__carousel">
              <div className="updates__track" style={{ transform: `translateX(-${currentUpdateIndex * 100}%)` }}>
                {updates.map((update, index) => (
                  <div key={index} className={`hero__update ${index === currentUpdateIndex ? 'active' : ''}`}>
                    <h4>{update.title}</h4>
                    <p><strong>{update.title.split(' ')[0]} {update.title.split(' ')[1]}:</strong> {update.content}</p>
                  </div>
                ))}
              </div>
              <div className="updates__nav">
                <button className="updates__prev" onClick={prevUpdate} aria-label="Previous update">‹</button>
                <div className="updates__dots">
                  {updates.map((_, index) => (
                    <div
                      key={index}
                      className={`updates__dot ${index === currentUpdateIndex ? 'active' : ''}`}
                      onClick={() => goToUpdate(index)}
                    />
                  ))}
                </div>
                <button className="updates__next" onClick={nextUpdate} aria-label="Next update">›</button>
              </div>
            </div>
          </div>
        </section>

        <section className="preview" aria-labelledby="preview-title">
          <div className="preview__header">
            <h2 id="preview-title">Live Preview</h2>
            <p>Glance at a generated system—open the studio to make it your own.</p>
          </div>
          <div className="preview__frame">
            <iframe
              src={getPreviewSrc()}
              title="Interactive system preview"
              loading="lazy"
              allow="accelerometer; fullscreen"
            />
            <div className="preview__label">Preview Mode</div>
          </div>
        </section>

        <section className="recent" aria-labelledby="recent-title">
          <div className="recent__header">
            <h2 id="recent-title">Latest Shared Systems</h2>
            <Link className="recent__view" to="/explore">See All Systems →</Link>
          </div>
          {recentSystems.length > 0 ? (
            <ul className="recent__list" aria-live="polite">
              {recentSystems.map((item) => (
                <li key={item.id} className="recent__item">
                  <article className="recent__card">
                    <div className="recent__card-header">
                      <h3 className="recent__title">
                        {item?.metadata?.name || item?.summary?.preset || `System ${item.id}`}
                      </h3>
                      <span className="recent__code">#{item.id}</span>
                    </div>
                    <dl className="recent__meta">
                      <dt>Seed</dt>
                      <dd>{item?.summary?.seed || '—'}</dd>
                      <dt>Preset</dt>
                      <dd>{item?.summary?.preset || 'Custom'}</dd>
                      <dt>Shared</dt>
                      <dd>{formatRelativeTime(item.createdAt) || 'Recently'}</dd>
                    </dl>
                    <div className="recent__actions">
                      <Link to={`/studio#${item.id}`} className="recent__action">
                        Load in Studio
                      </Link>
                      <button 
                        className="recent__action recent__action--ghost"
                        onClick={() => copyToClipboard(item.id)}
                      >
                        Copy Code
                      </button>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <p className="recent__empty">No shared systems yet—save one from the studio to appear here.</p>
          )}
        </section>
      </main>

      <footer className="landing__footer">
        <p>
          Need to jump straight in? <Link to={previewCode ? `/studio#${previewCode}` : "/studio"}>Launch the full experience</Link> or explore the
          presets awaiting inside.
        </p>
      </footer>
    </div>
  )
}

export default LandingPage