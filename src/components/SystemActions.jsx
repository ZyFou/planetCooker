import React from 'react'
import { Link } from 'react-router-dom'
import { useClipboard } from '../hooks/useUtils'

const SystemActions = ({ system, variant = 'default' }) => {
  const copyToClipboard = useClipboard()
  const [copied, setCopied] = React.useState(false)

  const handleCopyCode = async () => {
    const success = await copyToClipboard(system.id)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (variant === 'inline') {
    return (
      <div className="flex gap-2 mt-auto">
        <Link
          to={`/studio#${system.id}`}
          className="flex-1 px-3 py-2 rounded-full border border-blue-400/50 bg-slate-700/65 text-slate-100 text-xs font-semibold tracking-wider uppercase transition-all hover:bg-slate-600/75 hover:-translate-y-0.5 text-center"
        >
          Load in Studio
        </Link>
        <button
          onClick={handleCopyCode}
          className="flex-1 px-3 py-2 rounded-full border border-slate-400/40 bg-slate-800/55 text-slate-200 text-xs font-semibold tracking-wider uppercase transition-all hover:bg-slate-700/65 text-center"
        >
          {copied ? 'Copied!' : 'Copy Code'}
        </button>
      </div>
    )
  }

  if (variant === 'preview') {
    return (
      <div className="flex gap-2">
        <Link
          to={`/studio#${system.id}`}
          className="flex-1 btn btn-secondary"
        >
          Open in Studio
        </Link>
        <button
          onClick={handleCopyCode}
          className="flex-1 btn btn-ghost"
        >
          {copied ? 'Copied!' : 'Copy Share Code'}
        </button>
      </div>
    )
  }

  return null
}

export default SystemActions