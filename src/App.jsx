import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import LegacyRedirect from "./components/LegacyRedirect.jsx";
import RouteAnnouncer from "./components/RouteAnnouncer.jsx";

const LandingPage = lazy(() => import("./pages/LandingPage.jsx"));
const ExplorePage = lazy(() => import("./pages/ExplorePage.jsx"));
const StudioPage = lazy(() => import("./pages/StudioPage.jsx"));

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-lg">Loading…</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/index.html" element={<LegacyRedirect to="/" />} />
          <Route path="/explore.html" element={<LegacyRedirect to="/explore" />} />
          <Route path="/studio.html" element={<LegacyRedirect to="/studio" />} />
        </Routes>
      </Suspense>
      <RouteAnnouncer />
    </AppShell>
  );
}
