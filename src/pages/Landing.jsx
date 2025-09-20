import React, { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSystemsCount, useRecentSystems } from '../hooks/useApi'
import SystemCard from '../components/SystemCard'
import SystemActions from '../components/SystemActions'

const Landing = () => {
  const [searchParams] = useSearchParams()
  const previewCode = searchParams.get('previewCode')
  
  const { count: systemsCount, loadCount } = useSystemsCount()
  const { systems: recentSystems, loading, loadRecent } = useRecentSystems()

  useEffect(() => {
    loadCount()
    loadRecent(6)
  }, [loadCount, loadRecent])


  const getPreviewSrc = () => {
    let src = '/studio?preview=1'
    if (previewCode) {
      src += `&load=${encodeURIComponent(previewCode)}`
    }
    return src
  }

  const getStudioLink = (systemId) => {
    return previewCode ? `/studio#${systemId}` : `/studio#${systemId}`
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 p-6 md:p-12">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-[420px] h-[420px] bg-blue-500/30 rounded-full blur-[140px] opacity-35 -top-32 -right-40" />
        <div className="absolute w-[520px] h-[520px] bg-purple-500/25 rounded-full blur-[140px] opacity-35 -bottom-56 -left-44" />
      </div>

      {/* Header */}
      <header className="flex items-center justify-between gap-4 z-10 mb-8">
        <div className="flex items-center gap-3 font-semibold tracking-wider uppercase text-slate-200">
          <div className="w-3 h-3 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full shadow-lg shadow-blue-400/85" />
          <span>Procedural Planet Studio</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start z-10">
        {/* Hero section */}
        <section className="max-w-lg">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-wide uppercase mb-4">
            Craft Your Own Worlds
          </h1>
          <p className="text-lg leading-relaxed text-slate-300 mb-7">
            Dial in atmospheres, rings, moons, and stars with science-inspired controls. Share fully
            reproducible planets in a single code.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <Link 
              to={getStudioLink('')} 
              className="btn btn-primary"
            >
              Launch The Studio
            </Link>
            <Link to="/explore" className="btn btn-ghost">
              Explore Systems
            </Link>
          </div>
          <div className="bg-slate-800/65 border border-blue-300/45 rounded-2xl p-6 shadow-2xl">
            <dl className="text-sm">
              <dt className="text-xs tracking-widest uppercase text-slate-300 mb-1">
                Total Systems Shared
              </dt>
              <dd className="text-2xl md:text-3xl font-semibold tracking-wide text-slate-100">
                {systemsCount}
              </dd>
            </dl>
          </div>
        </section>

        {/* Preview section */}
        <section className="flex flex-col gap-6">
          <div>
            <h2 className="text-xl tracking-widest uppercase text-slate-200 mb-2">
              Live Preview
            </h2>
            <p className="text-slate-300">
              Glance at a generated system—open the studio to make it your own.
            </p>
          </div>
          <div className="relative rounded-3xl overflow-hidden bg-slate-900/65 border border-blue-300/35 shadow-2xl aspect-[5/3] min-h-[400px]">
            <iframe
              src={getPreviewSrc()}
              title="Interactive system preview"
              className="w-full h-full border-0 saturate-110 pointer-events-none"
              loading="lazy"
              allow="accelerometer; fullscreen"
            />
            <div className="absolute bottom-4 right-4 px-3 py-2 bg-slate-800/78 border border-blue-400/40 rounded-full text-xs tracking-widest uppercase text-slate-200">
              Preview Mode
            </div>
          </div>
        </section>
      </main>

      {/* Recent systems */}
      <section className="mt-12 lg:mt-16 bg-slate-800/78 border border-blue-300/35 rounded-3xl p-6 md:p-8 shadow-2xl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h2 className="text-lg tracking-widest uppercase text-slate-200">
            Latest Shared Systems
          </h2>
          <Link 
            to="/explore" 
            className="text-blue-300 hover:text-blue-200 text-sm tracking-wide uppercase transition-colors"
          >
            See All Systems →
          </Link>
        </div>
        
        {loading ? (
          <div className="text-center py-8 text-slate-400">
            Loading systems...
          </div>
        ) : recentSystems.length === 0 ? (
          <p className="text-slate-400">
            No shared systems yet—save one from the studio to appear here.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {recentSystems.map((system) => (
              <SystemCard
                key={system.id}
                system={system}
                onClick={() => {}} // No click handler needed for landing page
                showActions={true}
              >
                <SystemActions system={system} variant="inline" />
              </SystemCard>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="mt-12 text-center text-slate-400 text-sm">
        <p>
          Need to jump straight in?{' '}
          <Link 
            to={getStudioLink('')} 
            className="text-slate-200 hover:text-white transition-colors"
          >
            Launch the full experience
          </Link>{' '}
          or explore the presets awaiting inside.
        </p>
      </footer>
    </div>
  )
}

export default Landing