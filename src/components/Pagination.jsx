import React from 'react'

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null

  return (
    <nav className="flex items-center justify-center gap-4 mt-8 text-slate-400">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-5 py-2 rounded-full border border-blue-300/45 bg-slate-700/70 text-slate-200 text-xs font-semibold tracking-widest uppercase transition-all hover:bg-slate-600/80 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        Previous
      </button>
      <span className="text-sm">
        Page {currentPage} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-5 py-2 rounded-full border border-blue-300/45 bg-slate-700/70 text-slate-200 text-xs font-semibold tracking-widest uppercase transition-all hover:bg-slate-600/80 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        Next
      </button>
    </nav>
  )
}

export default Pagination