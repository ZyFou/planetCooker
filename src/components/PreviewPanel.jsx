import React from 'react'
import SystemActions from './SystemActions'
import { useFormatRelativeTime } from '../hooks/useUtils'

const PreviewPanel = ({ selectedSystem }) => {
  const formatRelativeTime = useFormatRelativeTime()

  return (
    <div className="sticky top-8 flex flex-col gap-4 p-6 bg-slate-800/80 border border-blue-300/40 rounded-2xl shadow-2xl">
      <div className="relative rounded-2xl overflow-hidden bg-slate-900/85 border border-blue-400/35 aspect-video">
        {selectedSystem ? (
          <iframe
            src={`/studio?preview=1&load=${encodeURIComponent(selectedSystem.id)}`}
            title="Planet preview"
            className="w-full h-full border-0"
            loading="lazy"
            allow="accelerometer; fullscreen"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 text-slate-400">
            Select a system to preview
          </div>
        )}
      </div>
      
      <div className="text-sm text-slate-300 leading-relaxed">
        {selectedSystem && (
          <>
            {selectedSystem.summary?.preset && `Preset: ${selectedSystem.summary.preset}`}
            {selectedSystem.summary?.seed && ` • Seed: ${selectedSystem.summary.seed}`}
            {Number.isFinite(selectedSystem.summary?.moonCount) && 
              ` • ${selectedSystem.summary.moonCount} moon${selectedSystem.summary.moonCount === 1 ? '' : 's'}`}
            {selectedSystem.summary?.description && ` • ${selectedSystem.summary.description}`}
            {` • Shared ${formatRelativeTime(selectedSystem.createdAt) || 'recently'}`}
          </>
        )}
      </div>
      
      {selectedSystem && (
        <SystemActions system={selectedSystem} variant="preview" />
      )}
    </div>
  )
}

export default PreviewPanel