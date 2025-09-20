# Procedural Planet Studio

A modern React 18 + Three.js experience for crafting procedural planets. The application ships with a Tailwind-powered landing page, an explorer for community systems, and the fully interactive studio that renders planets in real time.

## Getting Started

```bash
npm install
npm run dev
```

The Vite dev server starts at `http://localhost:5173`. The studio route loads the full Three.js experience; navigate to `/studio` directly to skip the landing page.

### Available scripts

- `npm run dev` – start the Vite development server with hot module reload.
- `npm run build` – produce a production build in `dist/`.
- `npm run preview` – preview the production bundle.
- `npm run lint` – run ESLint with the React, hooks, a11y, and Prettier configs.
- `npm run test` – execute Vitest unit tests.

## Project structure

```
src/
  App.jsx               # Application shell with router + lazy routes
  main.jsx              # React entry point
  components/           # Shared layout utilities (app shell, announcer)
  lib/                  # Shared utilities (formatters, helpers)
  pages/                # Route-level components (landing, explore, studio)
  styles/tailwind.css   # Tailwind base, component, and utility layers
  legacyStudio.js       # Existing Three.js studio bootstrap (initialised on demand)
```

All layout and styling rely on Tailwind utility classes. Shared UI patterns live in small React components; the Three.js studio code remains in `legacyStudio.js` and is initialised from the `/studio` route.

## Testing

Vitest and Testing Library power the unit tests for critical React components. Run `npm run test` to execute the suite. Linting is enforced with ESLint and Prettier via `npm run lint`.

## Migration notes

- Legacy static HTML has been replaced with React Router routes.
- Plain CSS has been removed; Tailwind utilities now drive page styling.
- Existing Three.js code is bootstrapped lazily to avoid blocking the SPA shell.
- API access remains via `src/app/config.js`; configure the base URL there.

