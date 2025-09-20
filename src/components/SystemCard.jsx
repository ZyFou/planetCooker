import React from 'react'
import { useFormatRelativeTime } from '../hooks/useUtils'

const SystemCard = ({ 
  system, 
  isActive = false, 
  onClick, 
  showActions = true,
  compact = false,
  children
}) => {
  const formatRelativeTime = useFormatRelativeTime()

  const handleClick = () => {
    if (onClick) {
      onClick(system)
    }
  }

  const baseClasses = `
    ${compact ? 'p-3' : 'p-4'} 
    rounded-2xl border text-left transition-all duration-200
    ${isActive 
      ? 'border-blue-400/75 bg-slate-700/85 shadow-2xl shadow-blue-400/25' 
      : 'border-blue-300/35 bg-slate-800/88 hover:border-blue-400/50 hover:bg-slate-700/75 hover:-translate-y-1'
    }
  `

  return (
    <article className={baseClasses} onClick={handleClick}>
      <div className={`flex items-baseline justify-between gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
        <h3 className={`font-semibold tracking-wide text-slate-100 ${compact ? 'text-sm' : 'text-base'}`}>
          {system?.metadata?.name || system?.summary?.preset || `System ${system.id}`}
        </h3>
        <span className="text-xs tracking-widest uppercase text-blue-300">
          #{system.id}
        </span>
      </div>
      
      <dl className={`grid grid-cols-2 gap-x-3 gap-y-1 text-xs ${compact ? 'mb-2' : 'mb-3'}`}>
        <dt className="tracking-widest uppercase text-slate-400">Seed</dt>
        <dd className="text-slate-300">{system?.summary?.seed || '—'}</dd>
        <dt className="tracking-widest uppercase text-slate-400">Preset</dt>
        <dd className="text-slate-300">{system?.summary?.preset || 'Custom'}</dd>
        {!compact && (
          <>
            <dt className="tracking-widest uppercase text-slate-400">Moons</dt>
            <dd className="text-slate-300">
              {Number.isFinite(system?.summary?.moonCount) ? String(system.summary.moonCount) : '—'}
            </dd>
          </>
        )}
      </dl>
      
      <div className="text-xs tracking-widest uppercase text-slate-400">
        {formatRelativeTime(system.createdAt) || 'Recently shared'}
      </div>
      
      {children}
    </article>
  )
}

export default SystemCard