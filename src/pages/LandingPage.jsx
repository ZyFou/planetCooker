import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../app/config.js";
import { formatRelativeTime } from "../lib/formatRelativeTime.js";

const API_ROOT = API_BASE_URL.replace(/\/?$/, "");

export default function LandingPage() {
  const [searchParams] = useSearchParams();
  const [systemsCount, setSystemsCount] = useState(null);
  const [recentSystems, setRecentSystems] = useState([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [recentError, setRecentError] = useState(null);
  const navigate = useNavigate();

  const previewCode = searchParams.get("previewCode");

  useEffect(() => {
    document.title = "Procedural Planet Studio";
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = `${API_ROOT}/stats/count`;
    fetch(endpoint, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const total = Number(payload?.total);
        if (Number.isFinite(total)) {
          setSystemsCount(total);
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.warn("Unable to retrieve system count", error);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = `${API_ROOT}/recent?limit=6`;
    setIsLoadingRecent(true);
    setRecentError(null);

    fetch(endpoint, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        setRecentSystems(Array.isArray(payload?.items) ? payload.items : []);
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setRecentError("Unable to retrieve recent systems");
        console.warn("Unable to retrieve recent systems", error);
      })
      .finally(() => {
        setIsLoadingRecent(false);
      });

    return () => controller.abort();
  }, []);

  const previewSrc = useMemo(() => {
    const params = new URLSearchParams();
    params.set("preview", "1");
    if (previewCode) {
      params.set("load", previewCode.trim());
    }
    return `/studio?${params.toString()}`;
  }, [previewCode]);

  const totalDisplay = systemsCount == null ? "—" : systemsCount.toLocaleString();

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-space-800/80 via-space-900 to-space-900 px-6 pb-12 pt-10 sm:px-10">
      <div className="pointer-events-none absolute -right-32 -top-40 h-96 w-96 rounded-full bg-accent-blue/40 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-accent-purple/30 blur-3xl" aria-hidden="true" />

      <header className="z-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.4em] text-slate-200/90">
          <span className="h-3 w-3 rounded-full bg-gradient-to-br from-slate-200 via-accent-blue to-blue-700 shadow-glow" aria-hidden="true" />
          <span>Procedural Planet Studio</span>
        </div>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link className="rounded-full border border-slate-500/40 px-4 py-2 transition hover:border-slate-300/70 hover:text-white" to="/explore">
            Explore Systems
          </Link>
          <Link
            className="rounded-full bg-accent-blue/90 px-4 py-2 font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:bg-accent-blue"
            to="/studio"
          >
            Launch Studio
          </Link>
        </nav>
      </header>

      <main id="main" tabIndex="-1" className="z-10 mt-12 grid flex-1 gap-12 lg:grid-cols-[minmax(0,520px)_1fr]">
        <section className="space-y-8">
          <div className="space-y-6">
            <h1 className="text-4xl font-bold uppercase tracking-wide text-white sm:text-5xl">
              Craft Your Own Worlds
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-slate-200/80">
              Dial in atmospheres, rings, moons, and stars with science-inspired controls. Share fully reproducible planets in a single code.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                className="rounded-full bg-accent-blue/90 px-5 py-2.5 font-semibold text-white transition hover:bg-accent-blue"
                to={previewCode ? `/studio#${previewCode}` : "/studio"}
              >
                Launch The Studio
              </Link>
              <Link
                className="rounded-full border border-slate-500/50 px-5 py-2.5 text-slate-200 transition hover:border-slate-200 hover:text-white"
                to={previewCode ? `/explore?id=${encodeURIComponent(previewCode)}` : "/explore"}
              >
                Explore Systems
              </Link>
            </div>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-500/40 bg-space-800/60 p-6 shadow-panel">
              <dt className="text-xs uppercase tracking-[0.3em] text-slate-300/80">Total Systems Shared</dt>
              <dd className="mt-3 text-3xl font-semibold text-white" data-loaded={systemsCount != null}>
                {totalDisplay}
              </dd>
            </div>
          </dl>
        </section>

        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-white">Live Preview</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-300/80">
              Glance at a generated system—open the studio to make it your own.
            </p>
          </div>
          <div className="relative overflow-hidden rounded-3xl border border-slate-500/40 bg-black/40 shadow-xl">
            <iframe
              key={previewSrc}
              title="Interactive system preview"
              src={previewSrc}
              loading="lazy"
              allow="accelerometer; fullscreen"
              className="h-80 w-full rounded-3xl"
            />
            <div className="absolute left-4 top-4 rounded-full bg-black/70 px-4 py-1 text-xs font-medium uppercase tracking-widest text-slate-200">
              Preview Mode
            </div>
          </div>

          <section aria-labelledby="recent-systems" className="rounded-3xl border border-slate-500/40 bg-space-800/70 p-6 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="recent-systems" className="text-xl font-semibold text-white">
                  Latest Shared Systems
                </h2>
                <p className="mt-1 text-sm text-slate-300/80">Open one to remix it in the studio.</p>
              </div>
              <Link className="text-sm font-medium text-accent-blue transition hover:text-accent-blue/80" to="/explore">
                See all systems →
              </Link>
            </div>

            <div className="mt-6 space-y-4">
              {isLoadingRecent && <p className="text-sm text-slate-300/80">Loading systems…</p>}
              {recentError && <p className="text-sm text-red-300">{recentError}</p>}
              {!isLoadingRecent && !recentError && recentSystems.length === 0 && (
                <p className="text-sm text-slate-300/80">No shared systems yet—save one from the studio to appear here.</p>
              )}
              {!isLoadingRecent && !recentError && recentSystems.length > 0 && (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {recentSystems.map((item) => (
                    <RecentSystemCard key={item.id} item={item} onLoad={navigate} />
                  ))}
                </ul>
              )}
            </div>
          </section>
        </section>
      </main>

      <footer className="z-10 mt-16 text-sm text-slate-300/80">
        Need to jump straight in?{" "}
        <Link className="text-accent-blue hover:text-accent-blue/80" to="/studio">
          Launch the full experience
        </Link>{" "}
        or explore the presets awaiting inside.
      </footer>
    </div>
  );
}

function RecentSystemCard({ item, onLoad }) {
  const [copied, setCopied] = useState(false);
  const navigate = onLoad;

  const displayName = item?.metadata?.name || item?.summary?.preset || `System ${item?.id}`;

  const handleLoad = () => {
    if (!item?.id) return;
    navigate({ pathname: "/studio", hash: `#${item.id}` });
  };

  const handleCopy = async () => {
    if (!item?.id) return;
    try {
      await navigator.clipboard.writeText(item.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn("Clipboard copy failed", error);
    }
  };

  return (
    <li className="h-full rounded-2xl border border-slate-500/40 bg-black/40 p-4">
      <article className="flex h-full flex-col justify-between gap-4">
        <header className="space-y-1">
          <h3 className="text-lg font-semibold text-white">{displayName}</h3>
          <p className="text-xs uppercase tracking-widest text-slate-400">#{item?.id}</p>
        </header>
        <dl className="grid gap-2 text-sm text-slate-300/80">
          <div className="flex justify-between gap-2">
            <dt className="uppercase tracking-widest text-xs text-slate-400">Seed</dt>
            <dd>{item?.summary?.seed || "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="uppercase tracking-widest text-xs text-slate-400">Preset</dt>
            <dd>{item?.summary?.preset || "Custom"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="uppercase tracking-widest text-xs text-slate-400">Shared</dt>
            <dd>{formatRelativeTime(item?.createdAt) || "Recently"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleLoad}
            className="flex-1 rounded-full bg-accent-blue/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-blue"
          >
            Load in Studio
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 rounded-full border border-slate-500/60 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-300 hover:text-white"
          >
            {copied ? "Copied!" : "Copy Code"}
          </button>
        </div>
      </article>
    </li>
  );
}
