export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-space-800/80 via-space-900 to-space-900 text-slate-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-black/80 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      {children}
    </div>
  );
}
