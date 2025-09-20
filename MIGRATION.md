# Migration Report

## Overview

- Replaced the multi-page HTML + vanilla JS shell with a Vite-powered React 18 SPA that uses React Router for the landing, explore, and studio routes.
- Tailwind CSS now drives all styling. Legacy `.css` files (`landing.css`, `explore.css`, `styles.css`) were removed and their styles reimplemented through utility classes.
- The existing Three.js experience remains intact inside `src/legacyStudio.js` and boots lazily when the studio route mounts, ensuring no regressions to the procedural pipeline.

## Removed legacy assets

| File | Reason |
| --- | --- |
| `index.html` (static landing markup) | Replaced by React entry + `LandingPage` route |
| `explore.html`, `studio.html` | Functionality now rendered by React Router pages |
| `src/landing.css`, `src/explore.css`, `src/styles.css` | Tailwind utilities supersede bespoke CSS |
| `src/explore.js` | Explore logic refactored into the `ExplorePage` React component |

## Architecture notes

- Routing follows a lazy-loaded structure so the heavy studio bundle only loads when necessary.
- Accessibility improvements include a persistent skip link, focus management on route changes, and aria-live updates after navigation.
- Data fetching for landing/explore uses `AbortController` to avoid race conditions when navigating quickly between routes.
- Tests cover the landing route render pipeline and the relative-time formatter.

