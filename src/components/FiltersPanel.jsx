import React from 'react'

const FiltersPanel = ({ filters, onFilterSubmit, onResetFilters }) => {
  const handleSubmit = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    onFilterSubmit({
      preset: formData.get('preset')?.trim() || '',
      seed: formData.get('seed')?.trim() || '',
      sort: formData.get('sort') || 'recent'
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 p-6 bg-slate-800/78 border border-blue-300/35 rounded-2xl shadow-xl">
      <div className="flex flex-col gap-1 min-w-[160px] flex-1">
        <label className="text-xs tracking-widest uppercase text-slate-400">Preset</label>
        <input
          type="text"
          name="preset"
          placeholder="Any"
          defaultValue={filters.preset}
          className="w-full px-3 py-3 rounded-xl border border-blue-300/40 bg-slate-700/75 text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-400/75 focus:ring-4 focus:ring-blue-400/25"
        />
      </div>
      <div className="flex flex-col gap-1 min-w-[160px] flex-1">
        <label className="text-xs tracking-widest uppercase text-slate-400">Seed</label>
        <input
          type="text"
          name="seed"
          placeholder="Any"
          defaultValue={filters.seed}
          className="w-full px-3 py-3 rounded-xl border border-blue-300/40 bg-slate-700/75 text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-400/75 focus:ring-4 focus:ring-blue-400/25"
        />
      </div>
      <div className="flex flex-col gap-1 min-w-[160px] flex-1">
        <label className="text-xs tracking-widest uppercase text-slate-400">Sort</label>
        <select
          name="sort"
          defaultValue={filters.sort}
          className="w-full px-3 py-3 rounded-xl border border-blue-300/40 bg-slate-700/75 text-slate-200 focus:outline-none focus:border-blue-400/75 focus:ring-4 focus:ring-blue-400/25"
        >
          <option value="recent">Newest</option>
          <option value="popular">Most visited</option>
        </select>
      </div>
      <div className="flex gap-3 items-end">
        <button type="submit" className="btn btn-secondary">
          Apply
        </button>
        <button type="button" onClick={onResetFilters} className="btn btn-ghost">
          Reset
        </button>
      </div>
    </form>
  )
}

export default FiltersPanel