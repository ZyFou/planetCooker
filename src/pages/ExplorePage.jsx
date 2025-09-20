import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../app/config.js";
import { formatRelativeTime } from "../lib/formatRelativeTime.js";

const API_ROOT = API_BASE_URL.replace(/\/?$/, "");
const PAGE_SIZE = 12;

export default function ExplorePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1));
  const [filters, setFilters] = useState(() => ({
    preset: (searchParams.get("preset") || "").trim(),
    seed: (searchParams.get("seed") || "").trim(),
    sort: searchParams.get("sort") === "popular" ? "popular" : "recent"
  }));
  const [selectedId, setSelectedId] = useState(() => searchParams.get("id"));
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    document.title = "Explore Shared Systems · Procedural Planet Studio";
  }, []);

  useEffect(() => {
    const params = {};
    if (page > 1) params.page = String(page);
    if (filters.preset) params.preset = filters.preset;
    if (filters.seed) params.seed = filters.seed;
    if (filters.sort !== "recent") params.sort = filters.sort;
    if (selectedId) params.id = selectedId;
    setSearchParams(params, { replace: true });
  }, [filters, page, selectedId, setSearchParams]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchSystems = useCallback(() => {
    const controller = new AbortController();
    setStatus("loading");
    setErrorMessage(null);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: filters.sort
    });
    if (filters.preset) params.set("preset", filters.preset);
    if (filters.seed) params.set("seed", filters.seed);

    fetch(`${API_ROOT}/explore?${params.toString()}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const nextItems = Array.isArray(payload?.items) ? payload.items : [];
        setItems(nextItems);
        setTotal(Number.isFinite(payload?.total) ? payload.total : nextItems.length);
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        console.error("Failed to load systems", error);
        setErrorMessage("Failed to load systems. Please try again.");
      })
      .finally(() => {
        setStatus("idle");
      });

    return () => controller.abort();
  }, [filters.preset, filters.seed, filters.sort, page]);

  useEffect(() => {
    const cancel = fetchSystems();
    return () => {
      if (typeof cancel === "function") cancel();
    };
  }, [fetchSystems]);

  useEffect(() => {
    if (!items.length) {
      setSelectedSummary(null);
      return;
    }

    if (!selectedId) {
      const first = items[0];
      if (first) {
        setSelectedId(first.id);
        setSelectedSummary(first);
      }
      return;
    }

    const summary = items.find((item) => item.id === selectedId);
    setSelectedSummary(summary || null);
  }, [items, selectedId]);

  const previewSrc = useMemo(() => {
    if (!selectedId) return "";
    const params = new URLSearchParams({ preview: "1", load: selectedId });
    return `/studio?${params.toString()}`;
  }, [selectedId]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFilters({
      preset: (form.get("preset") || "").toString().trim(),
      seed: (form.get("seed") || "").toString().trim(),
      sort: form.get("sort") === "popular" ? "popular" : "recent"
    });
    setPage(1);
  };

  const handleReset = () => {
    setFilters({ preset: "", seed: "", sort: "recent" });
    setPage(1);
    setSelectedId(null);
    setSelectedSummary(null);
  };

  const handleSelect = (item) => {
    setSelectedId(item.id);
    setSelectedSummary(item);
  };

  const handleOpenStudio = () => {
    if (!selectedId) return;
    navigate({ pathname: "/studio", hash: `#${selectedId}` });
  };

  const handleCopy = async () => {
    if (!selectedId) return;
    try {
      await navigator.clipboard.writeText(selectedId);
    } catch (error) {
      console.warn("Clipboard copy failed", error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-space-800/80 via-space-900 to-space-900 px-6 pb-12 pt-10 sm:px-10">
      <header className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <Link className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.4em] text-slate-200/90" to="/">
          <span className="h-3 w-3 rounded-full bg-gradient-to-br from-slate-200 via-accent-blue to-blue-700 shadow-glow" aria-hidden="true" />
          <span>Procedural Planet Studio</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link className="rounded-full border border-slate-500/40 px-4 py-2 transition hover:border-slate-300/70 hover:text-white" to="/">
            Home
          </Link>
          <Link className="rounded-full bg-accent-blue/90 px-4 py-2 font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:bg-accent-blue" to="/studio">
            Launch Studio
          </Link>
        </nav>
      </header>

      <main id="main" tabIndex="-1" className="mt-12 space-y-10">
        <section className="space-y-3">
          <h1 className="text-4xl font-bold text-white">Explore Shared Systems</h1>
          <p className="max-w-3xl text-base text-slate-300/80">
            Browse the latest creations from the community, preview them in real time, and jump straight into the studio to make them your own.
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          className="grid gap-4 rounded-3xl border border-slate-600/40 bg-space-800/60 p-6 shadow-panel md:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
        >
          <label className="flex flex-col gap-2 text-sm text-slate-200/80">
            <span className="uppercase tracking-[0.3em] text-xs text-slate-400">Preset</span>
            <input
              type="text"
              name="preset"
              defaultValue={filters.preset}
              className="rounded-2xl border border-slate-500/40 bg-black/40 px-4 py-2 text-base text-white outline-none focus:border-accent-blue"
              placeholder="Any"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200/80">
            <span className="uppercase tracking-[0.3em] text-xs text-slate-400">Seed</span>
            <input
              type="text"
              name="seed"
              defaultValue={filters.seed}
              className="rounded-2xl border border-slate-500/40 bg-black/40 px-4 py-2 text-base text-white outline-none focus:border-accent-blue"
              placeholder="Any"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200/80">
            <span className="uppercase tracking-[0.3em] text-xs text-slate-400">Sort</span>
            <select
              name="sort"
              defaultValue={filters.sort}
              className="rounded-2xl border border-slate-500/40 bg-black/40 px-4 py-2 text-base text-white outline-none focus:border-accent-blue"
            >
              <option value="recent">Newest</option>
              <option value="popular">Most visited</option>
            </select>
          </label>
          <div className="flex items-end gap-3 md:col-span-2 md:justify-end">
            <button
              type="submit"
              className="rounded-full bg-accent-blue/90 px-6 py-2 font-semibold text-white transition hover:bg-accent-blue"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-slate-500/50 px-6 py-2 text-slate-200 transition hover:border-slate-300 hover:text-white"
            >
              Reset
            </button>
          </div>
        </form>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            {status === "loading" && <p className="text-sm text-slate-300/80">Loading systems…</p>}
            {errorMessage && <p className="text-sm text-red-300">{errorMessage}</p>}
            {status !== "loading" && !errorMessage && items.length === 0 && (
              <p className="text-sm text-slate-300/80">
                No shared systems yet. Save one in the studio to get started.
              </p>
            )}
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <ExploreCard
                  key={item.id}
                  item={item}
                  active={item.id === selectedId}
                  onSelect={() => handleSelect(item)}
                />
              ))}
            </ul>
          </div>

          <aside className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-slate-600/40 bg-black/30 shadow-xl">
              {selectedId ? (
                <iframe
                  key={previewSrc}
                  src={previewSrc}
                  title="Planet preview"
                  loading="lazy"
                  allow="accelerometer; fullscreen"
                  className="h-72 w-full"
                />
              ) : (
                <div className="flex h-72 items-center justify-center text-sm text-slate-300/70">
                  Select a system to preview
                </div>
              )}
            </div>
            <div className="min-h-[4rem] rounded-3xl border border-slate-600/40 bg-space-800/60 p-4 text-sm text-slate-200/90">
              {selectedSummary ? (
                <PreviewDetails summary={selectedSummary} />
              ) : (
                <p>Select a system to see its details.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleOpenStudio}
                disabled={!selectedId}
                className="flex-1 rounded-full bg-accent-blue/90 px-4 py-2 font-semibold text-white transition hover:bg-accent-blue disabled:cursor-not-allowed disabled:bg-slate-600/60"
              >
                Open in Studio
              </button>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!selectedId}
                className="flex-1 rounded-full border border-slate-500/60 px-4 py-2 text-slate-200 transition hover:border-slate-300 hover:text-white disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                Copy Share Code
              </button>
            </div>
          </aside>
        </section>

        <nav className="flex items-center justify-center gap-6 text-sm text-slate-200/80" aria-label="Pagination">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
            className="rounded-full border border-slate-500/50 px-4 py-2 transition hover:border-slate-200 hover:text-white disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
          >
            Previous
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            disabled={page >= pageCount}
            className="rounded-full border border-slate-500/50 px-4 py-2 transition hover:border-slate-200 hover:text-white disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
          >
            Next
          </button>
        </nav>
      </main>
    </div>
  );
}

function ExploreCard({ item, active, onSelect }) {
  const displayName = item?.metadata?.name || item?.summary?.preset || `System ${item?.id}`;
  const moonCount = Number.isFinite(item?.summary?.moonCount) ? item.summary.moonCount : null;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex h-full w-full flex-col gap-4 rounded-3xl border px-5 py-4 text-left shadow-panel transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
          active
            ? "border-accent-blue/80 bg-black/60"
            : "border-slate-600/40 bg-black/30 hover:border-accent-blue/40"
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-lg font-semibold text-white">{displayName}</span>
          <span className="text-xs uppercase tracking-widest text-slate-400">#{item?.id}</span>
        </div>
        <dl className="grid gap-2 text-sm text-slate-300/80">
          <div className="flex justify-between gap-2">
            <dt className="uppercase tracking-[0.3em] text-xs text-slate-500">Seed</dt>
            <dd>{item?.summary?.seed || "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="uppercase tracking-[0.3em] text-xs text-slate-500">Preset</dt>
            <dd>{item?.summary?.preset || "Custom"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="uppercase tracking-[0.3em] text-xs text-slate-500">Moons</dt>
            <dd>{moonCount == null ? "—" : moonCount}</dd>
          </div>
        </dl>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {formatRelativeTime(item?.createdAt) || "Recently shared"}
        </div>
      </button>
    </li>
  );
}

function PreviewDetails({ summary }) {
  const parts = [];
  if (summary?.summary?.preset) parts.push(`Preset: ${summary.summary.preset}`);
  if (summary?.summary?.seed) parts.push(`Seed: ${summary.summary.seed}`);
  if (Number.isFinite(summary?.summary?.moonCount)) {
    const moons = summary.summary.moonCount;
    parts.push(`${moons} moon${moons === 1 ? "" : "s"}`);
  }
  if (summary?.summary?.description) parts.push(summary.summary.description);
  const relative = formatRelativeTime(summary?.createdAt);
  if (relative) parts.push(`Shared ${relative}`);

  return <p>{parts.join(" · ")}</p>;
}
