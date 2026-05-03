# Flight Follower v0.3.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt HeroUI + Tailwind v4 with a dark/light theme, restructure the DataPanel into collapsible sections with a hideable side panel, swap to CartoDB tiles that follow the theme, ship a wind compass widget and a Flight Info card, multi-tier position typography, aircraft-hover tooltip, and a HeroUI-based Settings modal.

**Architecture:** Almost all changes live in `web/`. The server only gains four optional fields parsed from Simbrief into `FlightPlan`. Tailwind v4 brings CSS-first configuration; HeroUI provides themed primitives; theme is a Zustand store backed by `localStorage`; layout state (panel visibility + per-section collapse) extends the existing `useViewStore` (`sessionStorage`-backed via the existing `persist` middleware). Map UI (ViewModeControl, AircraftMarker, Leaflet tooltips) is refreshed in the same pass so the app doesn't ship half-themed.

**Tech Stack:** Tailwind CSS v4 (CSS-first config via `@tailwindcss/vite`), HeroUI (`@heroui/react`, `@heroui/theme`), `framer-motion`. Existing: TypeScript (strict, ESM), React 18, Zustand 4 with `persist` middleware, Leaflet/React-Leaflet, Vitest, Zod.

**Spec:** [`docs/superpowers/specs/2026-04-25-flight-follower-v0.3.0-design.md`](../specs/2026-04-25-flight-follower-v0.3.0-design.md)

---

## File Structure

### New files
- `web/src/index.css` — Tailwind v4 + HeroUI setup, theme tokens, custom utilities, Leaflet overrides.
- `web/src/store/theme.ts` — theme Zustand store (`localStorage`-persisted).
- `web/src/components/Header.tsx` — extracted header from `App.tsx`.
- `web/src/components/ThemeToggle.tsx` — sun/moon icon toggle.
- `web/src/components/PanelToggle.tsx` — chevron button shown either in panel or on map.
- `web/src/components/DataPanel/Section.tsx` — collapsible section wrapper.
- `web/src/components/DataPanel/WindCompass.tsx` — north-up SVG compass.
- `web/src/components/DataPanel/FlightInfoCard.tsx` — callsign / aircraft / FL / distance / route.

### Modified files (web)
- `web/package.json` — new deps.
- `web/vite.config.ts` — Tailwind v4 plugin.
- `web/index.html` — FOUC-prevention script, remove inline `<style>`, link `index.css`.
- `web/src/main.tsx` — HeroUIProvider wrap.
- `web/src/App.tsx` — header refactor, panel grid, sidebar visibility.
- `web/src/store/view.ts` — `panelVisible`, `sections`, setters.
- `web/src/components/SettingsDialog.tsx` — HeroUI `Modal`.
- `web/src/components/ConnectionStatus.tsx` — theme tokens.
- `web/src/components/Map/Map.tsx` — theme-aware `<TileLayer>`, attribution, `invalidateSize` on panel toggle.
- `web/src/components/Map/ViewModeControl.tsx` — HeroUI `ButtonGroup`.
- `web/src/components/Map/AircraftMarker.tsx` — interactive `<Tooltip>` with callsign + aircraft type, theme color via CSS variable.
- `web/src/components/DataPanel/DataPanel.tsx` — three `<Section>` blocks instead of flat stack.
- `web/src/components/DataPanel/PositionCard.tsx` — uses multi-tier helpers; the shared `Card` / `Row` exports get themed tokens.
- `web/src/components/DataPanel/WindCard.tsx` — `<WindCompass />` above existing rows.
- `web/src/components/DataPanel/RouteCard.tsx`, `SpeedCard.tsx`, `AltitudeCard.tsx`, `TimeCard.tsx` — theme-token sweep only (behavior unchanged).
- `web/src/components/DataPanel/fmt.ts` → renamed to `fmt.tsx`. Multi-tier `fmtLatHemi` / `fmtLonHemi` helpers, unchanged signature otherwise.

### Modified files (server / shared)
- `shared/types.ts` — `FlightPlan` gains five optional fields.
- `server/src/simbrief/parser.ts` — extracts the five fields.
- `server/src/simbrief/parser.test.ts` — TDD tests for the five fields.
- `server/src/simbrief/fixtures/minimal-ofp.json` — extended with the new shapes.

### Modified files (docs)
- `README.md` — short note about HeroUI/Tailwind/dark mode under "Stack".

---

## Verification commands (used throughout)

- Server tests: `npm test`
- Server typecheck: `npx tsc -p server --noEmit`
- Web typecheck: `npx tsc -p web --noEmit`
- Production build: `npm run build`
- Replay manual verification: `npm run dev:replay -- scripts/fixtures/replay-eddb-circuit.jsonl` plus `npm --workspace web run dev`, then visit `http://localhost:5173`.

---

## Task 1: Extend `FlightPlan` types and Simbrief parser

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/src/simbrief/parser.ts`
- Test: `server/src/simbrief/parser.test.ts`
- Modify: `server/src/simbrief/fixtures/minimal-ofp.json`

- [ ] **Step 1: Extend `shared/types.ts`**

Find `FlightPlan` and add five optional fields. The full new shape is:

```ts
export type FlightPlan = {
  fetchedAt: number;
  origin: Airport;
  destination: Airport;
  waypoints: Waypoint[];
  alternate?: Airport;
  scheduledOut?: number;
  scheduledIn?: number;
  flightNumber?: string;
  aircraftType?: string;
  cruiseAltitudeFt?: number;
  totalDistanceNm?: number;
  routeString?: string;
};
```

- [ ] **Step 2: Extend the OFP fixture**

Replace `server/src/simbrief/fixtures/minimal-ofp.json` with:

```json
{
  "params": { "time_generated": "1714000000" },
  "general": {
    "icao_airline": "BAW",
    "flight_number": "123",
    "initial_altitude": "36000",
    "air_distance": "1085",
    "route_distance": "1101",
    "route": "MID OKRIX BAN",
    "route_navigraph": "EGLL DCT MID UN160 OKRIX UM601 BAN LEMD"
  },
  "aircraft": {
    "icao_code": "A320"
  },
  "origin": { "icao_code": "EGLL", "pos_lat": "51.4706", "pos_long": "-0.4619", "name": "London Heathrow" },
  "destination": { "icao_code": "LEMD", "pos_lat": "40.4936", "pos_long": "-3.5668", "name": "Madrid Barajas" },
  "alternate": { "icao_code": "LEBL", "pos_lat": "41.2971", "pos_long": "2.0785", "name": "Barcelona El Prat" },
  "times": {
    "sched_out": "1714053600",
    "sched_in": "1714060800"
  },
  "navlog": {
    "fix": [
      { "ident": "MID", "pos_lat": "51.0531", "pos_long": "-0.6250", "altitude_feet": "15000" },
      { "ident": "OKRIX", "pos_lat": "46.3333", "pos_long": "-2.0000", "altitude_feet": "37000" },
      { "ident": "BAN", "pos_lat": "42.7500", "pos_long": "-2.8500", "altitude_feet": "37000" }
    ]
  }
}
```

- [ ] **Step 3: Add failing tests in `parser.test.ts`**

Append these tests inside the existing `describe('parseSimbriefOfp', …)` block, before its closing `});`:

```ts
  it('extracts callsign by concatenating icao_airline + flight_number', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.flightNumber).toBe('BAW123');
  });

  it('extracts aircraft type from aircraft.icao_code', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.aircraftType).toBe('A320');
  });

  it('extracts cruise altitude in feet', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.cruiseAltitudeFt).toBe(36000);
  });

  it('extracts total distance in nautical miles, preferring air_distance', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.totalDistanceNm).toBe(1085);
  });

  it('extracts route string, preferring route_navigraph when present', () => {
    const plan = parseSimbriefOfp(fixture);
    expect(plan.routeString).toBe('EGLL DCT MID UN160 OKRIX UM601 BAN LEMD');
  });

  it('falls back to general.route when route_navigraph is absent', () => {
    const without = {
      ...fixture,
      general: { ...fixture.general, route_navigraph: undefined },
    };
    const plan = parseSimbriefOfp(without);
    expect(plan.routeString).toBe('MID OKRIX BAN');
  });

  it('omits the new fields when absent from the OFP', () => {
    const stripped = {
      ...fixture,
      general: undefined,
      aircraft: undefined,
    };
    const plan = parseSimbriefOfp(stripped);
    expect(plan.flightNumber).toBeUndefined();
    expect(plan.aircraftType).toBeUndefined();
    expect(plan.cruiseAltitudeFt).toBeUndefined();
    expect(plan.totalDistanceNm).toBeUndefined();
    expect(plan.routeString).toBeUndefined();
  });
```

- [ ] **Step 4: Run tests, see fail**

Run: `npm test`
Expected: the seven new parser tests fail (parser doesn't yet read these fields).

- [ ] **Step 5: Update `parser.ts`**

Replace the contents of `server/src/simbrief/parser.ts` with:

```ts
import { z } from 'zod';
import type { FlightPlan } from '@ff/shared';

const numFromStr = z.union([z.number(), z.string().transform((s) => Number(s))]);

const AirportSchema = z.object({
  icao_code: z.string(),
  pos_lat: numFromStr,
  pos_long: numFromStr,
  name: z.string().optional(),
});

const FixSchema = z.object({
  ident: z.string(),
  pos_lat: numFromStr,
  pos_long: numFromStr,
  altitude_feet: numFromStr.optional(),
});

const TimesSchema = z.object({
  sched_out: numFromStr.optional(),
  sched_in: numFromStr.optional(),
});

const GeneralSchema = z.object({
  icao_airline: z.string().optional(),
  flight_number: z.string().optional(),
  initial_altitude: numFromStr.optional(),
  air_distance: numFromStr.optional(),
  route_distance: numFromStr.optional(),
  route: z.string().optional(),
  route_navigraph: z.string().optional(),
});

const AircraftSchema = z.object({
  icao_code: z.string().optional(),
});

const OfpSchema = z.object({
  general: GeneralSchema.optional(),
  aircraft: AircraftSchema.optional(),
  origin: AirportSchema,
  destination: AirportSchema,
  alternate: AirportSchema.optional(),
  times: TimesSchema.optional(),
  navlog: z.object({
    fix: z.array(FixSchema),
  }),
});

export function parseSimbriefOfp(raw: unknown): FlightPlan {
  const ofp = OfpSchema.parse(raw);
  const schedOutSec = ofp.times?.sched_out;
  const schedInSec = ofp.times?.sched_in;

  const flightNumber =
    ofp.general?.icao_airline && ofp.general?.flight_number
      ? `${ofp.general.icao_airline}${ofp.general.flight_number}`
      : undefined;

  const totalDistanceNm = ofp.general?.air_distance ?? ofp.general?.route_distance;
  const routeString = ofp.general?.route_navigraph ?? ofp.general?.route;

  return {
    fetchedAt: Date.now(),
    origin: {
      icao: ofp.origin.icao_code,
      lat: ofp.origin.pos_lat,
      lon: ofp.origin.pos_long,
      name: ofp.origin.name,
    },
    destination: {
      icao: ofp.destination.icao_code,
      lat: ofp.destination.pos_lat,
      lon: ofp.destination.pos_long,
      name: ofp.destination.name,
    },
    alternate: ofp.alternate
      ? {
          icao: ofp.alternate.icao_code,
          lat: ofp.alternate.pos_lat,
          lon: ofp.alternate.pos_long,
          name: ofp.alternate.name,
        }
      : undefined,
    waypoints: ofp.navlog.fix.map((f) => ({
      ident: f.ident,
      lat: f.pos_lat,
      lon: f.pos_long,
      plannedAltitude: f.altitude_feet,
    })),
    scheduledOut: schedOutSec != null ? schedOutSec * 1000 : undefined,
    scheduledIn: schedInSec != null ? schedInSec * 1000 : undefined,
    flightNumber,
    aircraftType: ofp.aircraft?.icao_code,
    cruiseAltitudeFt: ofp.general?.initial_altitude,
    totalDistanceNm,
    routeString,
  };
}
```

- [ ] **Step 6: Run tests, see pass**

Run: `npm test`
Expected: all parser tests pass (12 total in parser.test.ts).

- [ ] **Step 7: Web typecheck — types still align**

Run: `npx tsc -p web --noEmit`
Expected: no errors. The web side doesn't yet read the new fields, but the FlightPlan type extension is backwards-compatible.

- [ ] **Step 8: Commit**

```bash
git add shared/types.ts server/src/simbrief/parser.ts server/src/simbrief/parser.test.ts server/src/simbrief/fixtures/minimal-ofp.json
git commit -m "feat(simbrief): parse callsign, aircraft type, cruise altitude, distance, route string"
```

---

## Task 2: Install web dependencies

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install runtime dependencies**

Run from the repo root:

```bash
npm --workspace web install @heroui/react @heroui/theme framer-motion
```

- [ ] **Step 2: Install Tailwind v4 + plugin**

```bash
npm --workspace web install tailwindcss@^4 @tailwindcss/vite@^4
```

- [ ] **Step 3: Verify package.json**

Run: `cat web/package.json`
Expected `dependencies` keys present: `@heroui/react`, `@heroui/theme`, `framer-motion`, `tailwindcss`. Expected `devDependencies` key present: `@tailwindcss/vite`.

- [ ] **Step 4: Web typecheck still clean**

Run: `npx tsc -p web --noEmit`
Expected: no errors. (Adding deps doesn't change source.)

- [ ] **Step 5: Commit**

```bash
git add web/package.json package-lock.json
git commit -m "chore(web): add HeroUI, framer-motion, Tailwind v4 deps"
```

---

## Task 3: Wire Tailwind v4 into Vite

**Files:**
- Modify: `web/vite.config.ts`

- [ ] **Step 1: Update `vite.config.ts`**

Replace the contents of `web/vite.config.ts` with:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@ff/shared': fileURLToPath(new URL('../shared/types.ts', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4444',
      '/ws': { target: 'ws://localhost:4444', ws: true },
    },
  },
});
```

- [ ] **Step 2: Verify Vite still starts**

Run: `npm --workspace web run dev` (in a terminal you can leave running for ~3 seconds, then Ctrl+C). Expected: dev server starts on `http://localhost:5173` without crashing. The page won't pick up Tailwind classes yet (no `index.css` import), but startup must succeed.

- [ ] **Step 3: Commit**

```bash
git add web/vite.config.ts
git commit -m "build(web): wire Tailwind v4 Vite plugin"
```

---

## Task 4: Create `index.css` with theme tokens, dark variant, HeroUI plugin

**Files:**
- Create: `web/src/index.css`

- [ ] **Step 1: Write `web/src/index.css`**

Create the file with:

```css
@import "tailwindcss";
@plugin "@heroui/theme";
@source "../node_modules/@heroui/theme/dist/components";
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-fg: var(--ff-fg);
  --color-fg-muted: var(--ff-fg-muted);
  --color-bg: var(--ff-bg);
  --color-bg-elevated: var(--ff-bg-elevated);
  --color-border: var(--ff-border);
  --color-accent: var(--ff-accent);
}

:root {
  --ff-fg: #111827;
  --ff-fg-muted: #6b7280;
  --ff-bg: #ffffff;
  --ff-bg-elevated: #fafafa;
  --ff-border: #e5e7eb;
  --ff-accent: #2563eb;
  --ff-aircraft: #2563eb;
  --ff-compass-arrow: #2563eb;
  --ff-compass-heading: #6b7280;
}

.dark {
  --ff-fg: #f4f4f5;
  --ff-fg-muted: #a1a1aa;
  --ff-bg: #09090b;
  --ff-bg-elevated: #18181b;
  --ff-border: #27272a;
  --ff-accent: #60a5fa;
  --ff-aircraft: #60a5fa;
  --ff-compass-arrow: #60a5fa;
  --ff-compass-heading: #a1a1aa;
}

html, body, #root { height: 100%; margin: 0; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--ff-bg);
  color: var(--ff-fg);
}

/* Multi-tier numeric helpers used by fmtLatHemi / fmtLonHemi */
.major { font-variant-numeric: tabular-nums; }
.minor {
  font-size: 0.75em;
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
}

/* Aircraft marker color */
.ff-aircraft { color: var(--ff-aircraft); }

/* Leaflet tooltip and attribution overrides for theme support */
.leaflet-tooltip {
  background: var(--ff-bg-elevated);
  color: var(--ff-fg);
  border: 1px solid var(--ff-border);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}
.leaflet-tooltip-top::before { border-top-color: var(--ff-border); }
.leaflet-tooltip-bottom::before { border-bottom-color: var(--ff-border); }
.leaflet-tooltip-left::before { border-left-color: var(--ff-border); }
.leaflet-tooltip-right::before { border-right-color: var(--ff-border); }
.leaflet-control-attribution {
  background: var(--ff-bg-elevated) !important;
  color: var(--ff-fg-muted) !important;
}
.leaflet-control-attribution a { color: var(--ff-accent) !important; }
```

> **Note for the implementer:** The `@plugin "@heroui/theme"` and `@source` directives reflect the HeroUI v4 setup at the time of writing. If `npm --workspace web run dev` errors with a HeroUI plugin loading message, consult HeroUI's official Tailwind v4 install guide at https://www.heroui.com/docs/guide/installation and adjust the directives accordingly. The rest of the file (theme tokens, custom utilities, Leaflet overrides) is ours and won't be affected.

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/index.css
git commit -m "style(web): index.css with Tailwind v4 + HeroUI plugin and theme tokens"
```

---

## Task 5: Bootstrap CSS, FOUC script, and HeroUIProvider

**Files:**
- Modify: `web/index.html`
- Modify: `web/src/main.tsx`

- [ ] **Step 1: Update `web/index.html`**

Replace the existing `<head>` block. Final shape:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flight Follower</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      crossorigin=""
    />
    <script>
      // FOUC prevention: read theme from localStorage and set the dark class
      // on <html> before any styles render. Safe to fail-silent — defaults to
      // dark per the v0.3.0 spec.
      try {
        var raw = localStorage.getItem('ff:theme');
        var theme = raw ? JSON.parse(raw).state.theme : 'dark';
        if (theme === 'dark') document.documentElement.classList.add('dark');
      } catch (e) {
        document.documentElement.classList.add('dark');
      }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

The previous inline `<style>html, body, #root { … }</style>` is removed — those rules now live in `index.css`.

- [ ] **Step 2: Update `web/src/main.tsx`**

Replace contents with:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HeroUIProvider } from '@heroui/react';
import { App } from './App.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <App />
    </HeroUIProvider>
  </React.StrictMode>,
);
```

The `import './index.css'` is the line that actually pulls Tailwind into the bundle.

- [ ] **Step 3: Run dev server, verify no console errors**

Run (in one terminal) `npm run dev:replay -- scripts/fixtures/replay-eddb-circuit.jsonl`, in another `npm --workspace web run dev`. Open `http://localhost:5173`. The app should render *unchanged visually* (no components use HeroUI yet). Open DevTools console — expect no errors. Inspect `<html>` — expect class `dark` (because the FOUC script defaults to dark on first load).

- [ ] **Step 4: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/index.html web/src/main.tsx
git commit -m "feat(web): wire HeroUIProvider, FOUC-safe theme bootstrap, link index.css"
```

---

## Task 6: Theme store and ThemeToggle component

**Files:**
- Create: `web/src/store/theme.ts`
- Create: `web/src/components/ThemeToggle.tsx`

- [ ] **Step 1: Create `web/src/store/theme.ts`**

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

type ThemeStore = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggle: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (t) => set({ theme: t }),
    }),
    {
      name: 'ff:theme',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
```

- [ ] **Step 2: Create `web/src/components/ThemeToggle.tsx`**

```tsx
import { useEffect } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { useThemeStore } from '../store/theme.js';

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);

  // Sync the class on <html> so Tailwind dark: variants and HeroUI styles flip together.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  const icon = theme === 'dark' ? '☀' : '☾';

  return (
    <Tooltip content={label}>
      <Button isIconOnly size="sm" variant="light" aria-label={label} onPress={toggle}>
        <span aria-hidden style={{ fontSize: 16 }}>{icon}</span>
      </Button>
    </Tooltip>
  );
}
```

- [ ] **Step 3: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/store/theme.ts web/src/components/ThemeToggle.tsx
git commit -m "feat(web): theme store with localStorage persist and HeroUI sun/moon toggle"
```

---

## Task 7: Extend view store with `panelVisible` and `sections`

**Files:**
- Modify: `web/src/store/view.ts`

- [ ] **Step 1: Replace contents of `web/src/store/view.ts`**

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ViewMode = 'overview' | 'follow' | 'manual';
export type LatLng = [number, number];

type ViewStore = {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  lastCenter: LatLng | null;
  lastZoom: number | null;
  setLastView: (center: LatLng, zoom: number) => void;
  fitOverviewRequest: number;
  requestFitOverview: () => void;
  panelVisible: boolean;
  setPanelVisible: (v: boolean) => void;
  togglePanel: () => void;
  sections: Record<string, boolean>;
  setSectionOpen: (key: string, open: boolean) => void;
  toggleSection: (key: string) => void;
};

const DEFAULT_SECTIONS: Record<string, boolean> = {
  state: true,
  time: true,
  route: true,
};

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      mode: 'overview',
      setMode: (m) => set({ mode: m }),
      lastCenter: null,
      lastZoom: null,
      setLastView: (lastCenter, lastZoom) => set({ lastCenter, lastZoom }),
      fitOverviewRequest: 0,
      requestFitOverview: () => set((s) => ({ fitOverviewRequest: s.fitOverviewRequest + 1 })),
      panelVisible: true,
      setPanelVisible: (v) => set({ panelVisible: v }),
      togglePanel: () => set((s) => ({ panelVisible: !s.panelVisible })),
      sections: DEFAULT_SECTIONS,
      setSectionOpen: (key, open) =>
        set((s) => ({ sections: { ...s.sections, [key]: open } })),
      toggleSection: (key) =>
        set((s) => ({ sections: { ...s.sections, [key]: !(s.sections[key] ?? true) } })),
    }),
    {
      name: 'ff:map-view',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        mode: s.mode,
        lastCenter: s.lastCenter,
        lastZoom: s.lastZoom,
        panelVisible: s.panelVisible,
        sections: s.sections,
      }),
    },
  ),
);
```

Notes:
- `panelVisible` and `sections` are added to `partialize` so they restore on reload (sessionStorage scope).
- `fitOverviewRequest` is intentionally NOT in `partialize` (transient session signal).

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors. Existing consumers (`MapController`, `ViewModeControl`, `Map.tsx`, `SettingsDialog`, `ws.ts`) only read the existing fields and remain unaffected.

- [ ] **Step 3: Commit**

```bash
git add web/src/store/view.ts
git commit -m "feat(web): add panelVisible and sections to view store"
```

---

## Task 8: Section component

**Files:**
- Create: `web/src/components/DataPanel/Section.tsx`

- [ ] **Step 1: Create `Section.tsx`**

```tsx
import type { ReactNode } from 'react';
import { useViewStore } from '../../store/view.js';

type Props = {
  title: string;
  sectionKey: string;
  children: ReactNode;
};

export function Section({ title, sectionKey, children }: Props) {
  const open = useViewStore((s) => s.sections[sectionKey] ?? true);
  const toggle = useViewStore((s) => s.toggleSection);
  return (
    <section style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => toggle(sectionKey)}
        aria-expanded={open}
        aria-controls={`section-${sectionKey}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: '100%',
          padding: '4px 6px',
          background: 'transparent',
          color: 'var(--ff-fg-muted)',
          border: 'none',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
            fontSize: 10,
          }}
        >
          ▶
        </span>
        {title}
      </button>
      {open && (
        <div id={`section-${sectionKey}`} style={{ marginTop: 4 }}>
          {children}
        </div>
      )}
    </section>
  );
}
```

The chevron is a unicode triangle that rotates between `0deg` (closed) and `90deg` (open). Theme tokens via CSS variables.

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/DataPanel/Section.tsx
git commit -m "feat(web): collapsible Section component for DataPanel groups"
```

---

## Task 9: Refactor DataPanel into three sections

**Files:**
- Modify: `web/src/components/DataPanel/DataPanel.tsx`

- [ ] **Step 1: Replace contents of `DataPanel.tsx`**

```tsx
import { AltitudeCard } from './AltitudeCard.js';
import { FlightInfoCard } from './FlightInfoCard.js';
import { PositionCard } from './PositionCard.js';
import { RouteCard } from './RouteCard.js';
import { Section } from './Section.js';
import { SpeedCard } from './SpeedCard.js';
import { TimeCard } from './TimeCard.js';
import { WindCard } from './WindCard.js';

export function DataPanel() {
  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: 12 }}>
      <Section title="Aircraft state" sectionKey="state">
        <PositionCard />
        <SpeedCard />
        <AltitudeCard />
        <WindCard />
      </Section>
      <Section title="Time" sectionKey="time">
        <TimeCard />
      </Section>
      <Section title="Route" sectionKey="route">
        <RouteCard />
        <FlightInfoCard />
      </Section>
    </div>
  );
}
```

This will fail typecheck because `FlightInfoCard` doesn't exist yet — that's fine, the next task creates it. Step 2 below catches it.

- [ ] **Step 2: Web typecheck — expected to fail**

Run: `npx tsc -p web --noEmit`
Expected: ONE error of the form `Cannot find module './FlightInfoCard.js'` or similar. This unblocks once Task 17 lands. Do not commit yet.

- [ ] **Step 3: Stub FlightInfoCard temporarily so the tree compiles**

Create `web/src/components/DataPanel/FlightInfoCard.tsx` with a no-op stub:

```tsx
export function FlightInfoCard() {
  return null;
}
```

This is a TEMPORARY stub. Task 17 replaces it with the real implementation. The stub's purpose is just to let the rest of v0.3.0 land in committable order.

- [ ] **Step 4: Web typecheck — now clean**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DataPanel/DataPanel.tsx web/src/components/DataPanel/FlightInfoCard.tsx
git commit -m "feat(web): group DataPanel cards into collapsible sections"
```

---

## Task 10: Refactor App header — gear icon, theme toggle, panel-toggle slot

**Files:**
- Create: `web/src/components/Header.tsx`
- Create: `web/src/components/PanelToggle.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create `web/src/components/PanelToggle.tsx`**

```tsx
import { Button, Tooltip } from '@heroui/react';
import { useViewStore } from '../store/view.js';

type Props = {
  /** When true, renders the chevron pointing inward (to collapse the panel). */
  collapseDirection: 'right' | 'left';
};

export function PanelToggle({ collapseDirection }: Props) {
  const toggle = useViewStore((s) => s.togglePanel);
  const visible = useViewStore((s) => s.panelVisible);
  const label = visible ? 'Hide side panel' : 'Show side panel';
  const arrow = collapseDirection === 'right' ? '◀' : '▶';
  return (
    <Tooltip content={label}>
      <Button
        isIconOnly
        size="sm"
        variant="flat"
        aria-label={label}
        onPress={toggle}
        className="bg-bg-elevated/70 backdrop-blur"
      >
        <span aria-hidden>{arrow}</span>
      </Button>
    </Tooltip>
  );
}
```

The component renders a single chevron — the caller decides which direction it points based on placement.

- [ ] **Step 2: Create `web/src/components/Header.tsx`**

```tsx
import { Button, Tooltip } from '@heroui/react';
import { ConnectionStatus } from './ConnectionStatus.js';
import { ThemeToggle } from './ThemeToggle.js';

type Props = {
  onOpenSettings: () => void;
};

export function Header({ onOpenSettings }: Props) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        borderBottom: '1px solid var(--ff-border)',
        background: 'var(--ff-bg-elevated)',
        height: 40,
      }}
    >
      <strong style={{ fontSize: 14, color: 'var(--ff-fg)' }}>Flight Follower</strong>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ConnectionStatus />
        <ThemeToggle />
        <Tooltip content="Settings">
          <Button isIconOnly size="sm" variant="light" aria-label="Settings" onPress={onOpenSettings}>
            <span aria-hidden style={{ fontSize: 16 }}>⚙</span>
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Update `web/src/App.tsx`**

Replace contents with:

```tsx
import { useEffect, useState } from 'react';
import { Header } from './components/Header.js';
import { Map } from './components/Map/Map.js';
import { DataPanel } from './components/DataPanel/DataPanel.js';
import { PanelToggle } from './components/PanelToggle.js';
import { SettingsDialog } from './components/SettingsDialog.js';
import { connectWebSocket } from './api/ws.js';
import { useViewStore } from './store/view.js';

export function App() {
  const [showSettings, setShowSettings] = useState(false);
  const panelVisible = useViewStore((s) => s.panelVisible);
  useEffect(() => connectWebSocket(), []);
  return (
    <div style={{ display: 'grid', gridTemplateRows: '40px 1fr', height: '100vh' }}>
      <Header onOpenSettings={() => setShowSettings(true)} />
      <div
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: panelVisible ? '1fr 360px' : '1fr',
          minHeight: 0,
        }}
      >
        <div style={{ position: 'relative', minHeight: 0 }}>
          <Map />
          {!panelVisible && (
            <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1100 }}>
              <PanelToggle collapseDirection="left" />
            </div>
          )}
        </div>
        {panelVisible && (
          <aside
            style={{
              borderLeft: '1px solid var(--ff-border)',
              minHeight: 0,
              position: 'relative',
              background: 'var(--ff-bg)',
            }}
          >
            <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1100 }}>
              <PanelToggle collapseDirection="right" />
            </div>
            <DataPanel />
          </aside>
        )}
      </div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
```

Notes:
- The grid switches columns based on `panelVisible`.
- When panel is visible, the toggle sits at the panel's top-left; when hidden, at the map's top-right.
- The map container gets `position: relative` so the toggle can absolute-position over it.

- [ ] **Step 4: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verify**

Replay running. Visit `http://localhost:5173`. Header shows: title on left, ConnectionStatus + sun-or-moon icon + gear icon on right. Click theme toggle: page colors flip; reload preserves your last choice. Click panel toggle (chevron at panel's top-left corner): panel disappears, map fills the screen, chevron reappears at map's top-right pointing right. Click again: panel returns. Reload: panel state and section state preserved (within the tab session); a brand new tab/window starts panel-visible and all sections open.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Header.tsx web/src/components/PanelToggle.tsx web/src/App.tsx
git commit -m "feat(web): refactor App shell — gear settings, theme toggle, panel toggle"
```

---

## Task 11: Map invalidateSize on panel toggle + theme-aware tiles + attribution

**Files:**
- Modify: `web/src/components/Map/Map.tsx`

- [ ] **Step 1: Replace contents of `Map.tsx`**

```tsx
import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { AircraftMarker } from './AircraftMarker.js';
import { BreadcrumbTrail } from './BreadcrumbTrail.js';
import { MapController } from './MapController.js';
import { PlannedRoute } from './PlannedRoute.js';
import { ViewModeControl } from './ViewModeControl.js';
import { useViewStore } from '../../store/view.js';
import { useThemeStore } from '../../store/theme.js';

const DEFAULT_CENTER: [number, number] = [40, 0];
const DEFAULT_ZOOM = 4;

const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
} as const;

const ATTRIBUTION =
  '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function InvalidateOnPanelToggle() {
  const map = useMap();
  const panelVisible = useViewStore((s) => s.panelVisible);
  useEffect(() => {
    // Wait one frame for the grid layout to settle, then nudge Leaflet.
    const id = window.requestAnimationFrame(() => map.invalidateSize());
    return () => window.cancelAnimationFrame(id);
  }, [panelVisible, map]);
  return null;
}

export function Map() {
  const { lastCenter, lastZoom } = useViewStore.getState();
  const center = lastCenter ?? DEFAULT_CENTER;
  const zoom = lastZoom ?? DEFAULT_ZOOM;
  const theme = useThemeStore((s) => s.theme);
  const tileUrl = TILE_URLS[theme];
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} worldCopyJump>
        <TileLayer key={tileUrl} attribution={ATTRIBUTION} url={tileUrl} />
        <PlannedRoute />
        <BreadcrumbTrail />
        <AircraftMarker />
        <MapController />
        <InvalidateOnPanelToggle />
      </MapContainer>
      <ViewModeControl />
    </div>
  );
}
```

The `key={tileUrl}` prop on `<TileLayer>` causes react-leaflet to recreate the layer when the URL changes (i.e., on theme toggle), which is the simplest way to swap tile providers. `InvalidateOnPanelToggle` watches `panelVisible` and calls `map.invalidateSize()` after the grid layout updates.

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Replay running. Tiles should be CartoDB Dark Matter (dark, labelled). Toggle theme via the header sun/moon button: tiles swap to CartoDB Voyager (light, labelled) within ~1 s. Hide the side panel: map fills the screen; tiles stay aligned and don't show grey gaps (that means `invalidateSize` is firing). Show again: same.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Map/Map.tsx
git commit -m "feat(map): theme-aware CartoDB tiles, invalidateSize on panel toggle"
```

---

## Task 12: Migrate ViewModeControl to HeroUI ButtonGroup

**Files:**
- Modify: `web/src/components/Map/ViewModeControl.tsx`

- [ ] **Step 1: Replace contents of `ViewModeControl.tsx`**

```tsx
import { Button, ButtonGroup } from '@heroui/react';
import { useViewStore, type ViewMode } from '../../store/view.js';

const MODES: ViewMode[] = ['overview', 'follow', 'manual'];

export function ViewModeControl() {
  const mode = useViewStore((s) => s.mode);
  const setMode = useViewStore((s) => s.setMode);
  return (
    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000 }}>
      <ButtonGroup size="sm" variant="flat">
        {MODES.map((m) => (
          <Button
            key={m}
            color={mode === m ? 'primary' : 'default'}
            variant={mode === m ? 'solid' : 'flat'}
            onPress={() => setMode(m)}
            className="capitalize"
          >
            {m}
          </Button>
        ))}
      </ButtonGroup>
    </div>
  );
}
```

The control still sits at the top-right of the map. Click on the active mode no-ops (matches the original behavior).

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Replay running. Top-right of the map shows three connected buttons (overview / follow / manual). Active mode is solid blue, others flat. Click each to switch; behavior identical to v0.2.0. Theme toggle changes button colors appropriately.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Map/ViewModeControl.tsx
git commit -m "feat(map): migrate ViewModeControl to HeroUI ButtonGroup"
```

---

## Task 13: AircraftMarker — theme color, hover Tooltip with callsign + aircraft type

**Files:**
- Modify: `web/src/components/Map/AircraftMarker.tsx`

- [ ] **Step 1: Replace contents of `AircraftMarker.tsx`**

```tsx
import { divIcon } from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';
import { useFlightStore } from '../../store/flight.js';

const PLANE_PATH =
  'M21 16v-2l-8-5V3.5C13 2.7 12.3 2 11.5 2S10 2.7 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

export function AircraftMarker() {
  const t = useFlightStore((s) => s.state.telemetry);
  const plan = useFlightStore((s) => s.state.plan);
  if (!t) return null;
  const heading = t.heading.magnetic;
  const html = `
    <div class="ff-aircraft" style="width:24px;height:24px;transform:rotate(${heading}deg);transform-origin:center;display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 24 24" width="24" height="24" style="display:block;">
        <path fill="currentColor" d="${PLANE_PATH}" />
      </svg>
    </div>
  `;
  const icon = divIcon({
    className: 'ff-aircraft',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  const tooltipText =
    plan?.flightNumber && plan?.aircraftType
      ? `${plan.flightNumber} · ${plan.aircraftType}`
      : plan?.flightNumber || plan?.aircraftType || 'Aircraft';

  return (
    <Marker position={[t.position.lat, t.position.lon]} icon={icon} interactive>
      <Tooltip direction="top" offset={[0, -16]} opacity={1}>
        {tooltipText}
      </Tooltip>
    </Marker>
  );
}
```

Changes:
- `interactive={true}` (was `false`).
- New `<Tooltip>` shows callsign + aircraft type on hover.
- Color removed from the inline `style`; the `ff-aircraft` class on the wrapper picks up `var(--ff-aircraft)` from `index.css` for theme support.

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Replay running. The aircraft icon is themed (slightly lighter blue in dark mode, slightly darker blue in light mode). Hover the icon: a tooltip appears reading `Aircraft` (since the replay fixture has no plan). Load a Simbrief plan: hover now reads `BAW123 · A320` (or similar based on your OFP).

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Map/AircraftMarker.tsx
git commit -m "feat(map): aircraft marker shows callsign + aircraft type on hover, theme color"
```

---

## Task 14: Multi-tier position formatting

**Files:**
- Rename: `web/src/components/DataPanel/fmt.ts` → `web/src/components/DataPanel/fmt.tsx`
- Modify: `web/src/components/DataPanel/PositionCard.tsx` (no behavior change — only imports)

- [ ] **Step 1: Rename `fmt.ts` to `fmt.tsx`**

```bash
git mv web/src/components/DataPanel/fmt.ts web/src/components/DataPanel/fmt.tsx
```

- [ ] **Step 2: Replace contents of `fmt.tsx`**

```tsx
import type { ReactNode } from 'react';

export const dash = '—';

export function fmtNum(v: number | null | undefined, digits = 0): string {
  return v == null ? dash : v.toFixed(digits);
}

export function fmtDurationSec(sec: number | null | undefined): string {
  if (sec == null) return dash;
  const s = Math.floor(sec);
  const hh = Math.floor(s / 3600).toString().padStart(2, '0');
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function fmtUtcTime(epochMs: number | null | undefined): string {
  if (epochMs == null) return dash;
  const d = new Date(epochMs);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function splitMajorMinor(v: number, majorDigits = 2, totalDigits = 4): { major: string; minor: string } {
  const abs = Math.abs(v);
  const major = abs.toFixed(majorDigits);
  const minor = abs.toFixed(totalDigits).slice(major.length);
  return { major, minor };
}

export function fmtLatHemi(v: number | null | undefined): ReactNode {
  if (v == null) return dash;
  const { major, minor } = splitMajorMinor(v);
  const hemi = v >= 0 ? 'N' : 'S';
  return (
    <span>
      <span className="major">{major}</span>
      <span className="minor">{minor}</span>
      ° {hemi}
    </span>
  );
}

export function fmtLonHemi(v: number | null | undefined): ReactNode {
  if (v == null) return dash;
  const { major, minor } = splitMajorMinor(v);
  const hemi = v >= 0 ? 'E' : 'W';
  return (
    <span>
      <span className="major">{major}</span>
      <span className="minor">{minor}</span>
      ° {hemi}
    </span>
  );
}
```

The `.major` and `.minor` CSS classes live in `index.css` (Task 4).

- [ ] **Step 3: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors. PositionCard's existing import (`from './fmt.js'`) still resolves because `fmt.tsx` is the matching name; TypeScript handles the rename transparently.

- [ ] **Step 4: Manual verify**

Replay running. Position card now shows `52.36`<sub>`41`</sub>`° N` / `13.51`<sub>`07`</sub>`° E` — the last two digits are smaller and dimmer than the leading two. Theme toggle preserves the effect in both modes.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DataPanel/fmt.tsx
git commit -m "feat(web): multi-tier lat/lon formatting with major/minor digit tiers"
```

---

## Task 15: WindCompass widget

**Files:**
- Create: `web/src/components/DataPanel/WindCompass.tsx`
- Modify: `web/src/components/DataPanel/WindCard.tsx`

- [ ] **Step 1: Create `WindCompass.tsx`**

```tsx
import { useFlightStore } from '../../store/flight.js';

const SIZE = 80;
const CENTER = SIZE / 2;
const RING_RADIUS = SIZE / 2 - 4;

export function WindCompass() {
  const t = useFlightStore((s) => s.state.telemetry);
  const dir = t?.wind.direction ?? null;
  const speed = t?.wind.speed ?? null;
  const heading = t?.heading.magnetic ?? null;

  const cardinals: Array<{ label: string; angle: number }> = [
    { label: 'N', angle: 0 },
    { label: 'E', angle: 90 },
    { label: 'S', angle: 180 },
    { label: 'W', angle: 270 },
  ];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-label="Wind compass">
        {/* outer ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--ff-border)"
          strokeWidth={1}
        />

        {/* cardinal labels */}
        {cardinals.map(({ label, angle }) => {
          const rad = (angle - 90) * (Math.PI / 180);
          const x = CENTER + Math.cos(rad) * (RING_RADIUS - 8);
          const y = CENTER + Math.sin(rad) * (RING_RADIUS - 8);
          return (
            <text
              key={label}
              x={x}
              y={y}
              fill="var(--ff-fg-muted)"
              fontSize={9}
              fontWeight={600}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {label}
            </text>
          );
        })}

        {/* aircraft heading triangle (smaller, hollow) */}
        {heading != null && (
          <g transform={`rotate(${heading} ${CENTER} ${CENTER})`}>
            <polygon
              points={`${CENTER},${CENTER - RING_RADIUS + 14} ${CENTER - 4},${CENTER - RING_RADIUS + 22} ${CENTER + 4},${CENTER - RING_RADIUS + 22}`}
              fill="none"
              stroke="var(--ff-compass-heading)"
              strokeWidth={1.2}
            />
          </g>
        )}

        {/* wind arrow (filled, larger) — points toward the source cardinal */}
        {dir != null && (
          <g transform={`rotate(${dir} ${CENTER} ${CENTER})`}>
            <polygon
              points={`${CENTER},${CENTER - RING_RADIUS + 4} ${CENTER - 5},${CENTER - RING_RADIUS + 14} ${CENTER + 5},${CENTER - RING_RADIUS + 14}`}
              fill="var(--ff-compass-arrow)"
            />
            <line
              x1={CENTER}
              y1={CENTER - RING_RADIUS + 14}
              x2={CENTER}
              y2={CENTER}
              stroke="var(--ff-compass-arrow)"
              strokeWidth={1.5}
            />
          </g>
        )}

        {/* center text */}
        <text
          x={CENTER}
          y={CENTER + 16}
          fill="var(--ff-fg)"
          fontSize={9}
          fontFamily="ui-monospace, monospace"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {dir != null && speed != null
            ? `${Math.round(dir)}° / ${Math.round(speed)} kt`
            : '—'}
        </text>
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Update `WindCard.tsx`**

```tsx
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';
import { fmtNum, dash } from './fmt.js';
import { WindCompass } from './WindCompass.js';

export function WindCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  return (
    <Card title="Wind">
      <WindCompass />
      <Row label="Dir">{t ? `${fmtNum(t.wind.direction, 0)}°` : dash}</Row>
      <Row label="Speed">{t ? `${fmtNum(t.wind.speed, 0)} kt` : dash}</Row>
    </Card>
  );
}
```

- [ ] **Step 3: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verify**

Replay running. The Wind card shows a circular compass at the top with N/E/S/W cardinals. The wind arrow rotates with `wind.direction`. A small hollow triangle inside represents the aircraft heading. The center text reads e.g. `225° / 12 kt`. Below the compass, the existing two rows (Dir / Speed) are still present.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DataPanel/WindCompass.tsx web/src/components/DataPanel/WindCard.tsx
git commit -m "feat(web): wind compass widget with N-up cardinals, wind arrow, heading triangle"
```

---

## Task 16: FlightInfoCard

**Files:**
- Modify: `web/src/components/DataPanel/FlightInfoCard.tsx` (replaces the stub from Task 9)

- [ ] **Step 1: Replace contents of `FlightInfoCard.tsx`**

```tsx
import { useState } from 'react';
import { useFlightStore } from '../../store/flight.js';
import { Card, Row } from './PositionCard.js';

function fmtFL(ft: number | undefined): string {
  if (ft == null) return '—';
  return 'FL' + Math.round(ft / 100).toString().padStart(3, '0');
}

export function FlightInfoCard() {
  const plan = useFlightStore((s) => s.state.plan);
  const [expanded, setExpanded] = useState(false);

  if (!plan) {
    return (
      <Card title="Flight info">
        <div style={{ color: 'var(--ff-fg-muted)' }}>Import a plan to see flight info.</div>
      </Card>
    );
  }

  const callsign = plan.flightNumber
    ? plan.aircraftType
      ? `${plan.flightNumber} · ${plan.aircraftType}`
      : plan.flightNumber
    : plan.aircraftType ?? '—';

  return (
    <Card title="Flight info">
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'ui-monospace, monospace',
          marginBottom: 4,
        }}
      >
        {callsign}
      </div>
      <Row label="Cruise">{fmtFL(plan.cruiseAltitudeFt)}</Row>
      <Row label="Distance">{plan.totalDistanceNm != null ? `${plan.totalDistanceNm} nm` : '—'}</Row>
      {plan.routeString && (
        <div
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Click to collapse' : 'Click to expand'}
          style={{
            marginTop: 6,
            fontSize: 12,
            fontFamily: 'ui-monospace, monospace',
            color: 'var(--ff-fg-muted)',
            cursor: 'pointer',
            whiteSpace: expanded ? 'normal' : 'nowrap',
            overflow: expanded ? 'visible' : 'hidden',
            textOverflow: expanded ? 'clip' : 'ellipsis',
            wordBreak: expanded ? 'break-all' : undefined,
          }}
        >
          {plan.routeString}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Replay running with a Simbrief plan loaded (use the Settings dialog to fetch one if you have a pilot ID configured; otherwise the placeholder text is what you'll see). With a plan: the card shows the callsign+aircraft type as a header, cruise FL row, distance row, and a truncated single-line route string. Click the route — it expands to wrapped multi-line. Click again — collapses back to one line with ellipsis. With no plan: shows `Import a plan to see flight info.`.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/DataPanel/FlightInfoCard.tsx
git commit -m "feat(web): FlightInfoCard with callsign, cruise FL, distance, expandable route string"
```

---

## Task 17: Migrate SettingsDialog to HeroUI Modal

**Files:**
- Modify: `web/src/components/SettingsDialog.tsx`

- [ ] **Step 1: Replace contents of `SettingsDialog.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { fetchSimbriefPlan, getSettings, saveSettings } from '../api/rest.js';
import { useViewStore } from '../store/view.js';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSettings().then((s) => setUserId(s.simbriefUserId ?? ''));
  }, []);

  async function onSave() {
    setBusy(true);
    try {
      await saveSettings({ simbriefUserId: userId.trim() || null });
      setStatus('Saved.');
    } catch (err) {
      setStatus(`Save failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onFetch() {
    setBusy(true);
    setStatus(null);
    try {
      await saveSettings({ simbriefUserId: userId.trim() || null });
      await fetchSimbriefPlan();
      const view = useViewStore.getState();
      view.setMode('overview');
      view.requestFitOverview();
      setStatus('Plan fetched.');
    } catch (err) {
      setStatus(`Fetch failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const statusOk = status === 'Saved.' || status === 'Plan fetched.';

  return (
    <Modal isOpen onOpenChange={(open) => { if (!open) onClose(); }} size="md">
      <ModalContent>
        <ModalHeader>Settings</ModalHeader>
        <ModalBody>
          <section aria-labelledby="simbrief-section">
            <h3
              id="simbrief-section"
              style={{
                margin: '0 0 8px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--ff-fg-muted)',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              Simbrief
            </h3>
            <Input
              label="Pilot ID"
              labelPlacement="outside"
              value={userId}
              onValueChange={setUserId}
              placeholder="123456"
            />
          </section>
          {status && (
            <p style={{ margin: '8px 0 0', color: statusOk ? '#16a34a' : '#dc2626', fontSize: 13 }}>
              {status}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onSave} isDisabled={busy}>Save</Button>
          <Button color="primary" onPress={onFetch} isDisabled={busy || !userId.trim()}>
            Fetch latest plan
          </Button>
          <Button variant="light" onPress={onClose}>Close</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
```

The behavior is preserved: same Save / Fetch / Close actions, same state messages, same view mode reset on Fetch. The container is HeroUI's `Modal` so it gets focus trap, Escape-to-close, scroll-lock, and theme support for free.

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Replay running. Click the gear icon: a HeroUI modal opens with a heading "Settings" and a "Simbrief" section underneath. Press Escape: closes. Click outside the modal: closes. With a valid pilot ID, click Fetch latest plan: triggers the fetch + overview refit (same as v0.2.0 behavior).

- [ ] **Step 4: Commit**

```bash
git add web/src/components/SettingsDialog.tsx
git commit -m "feat(web): migrate SettingsDialog to HeroUI Modal with section structure"
```

---

## Task 18: Apply theme tokens to shared Card/Row primitives

**Files:**
- Modify: `web/src/components/DataPanel/PositionCard.tsx` (the shared `Card` and `Row` exports)

ConnectionStatus is already theme-agnostic (inherited text color + semantic status colors green / red / amber that work in both modes), so it doesn't need editing.

- [ ] **Step 1: Update the shared `Card` and `Row` components in `PositionCard.tsx`**

Replace the bottom of `PositionCard.tsx` (the `Card` and `Row` exports) with theme-aware versions:

```tsx
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: 10,
        border: '1px solid var(--ff-border)',
        background: 'var(--ff-bg-elevated)',
        borderRadius: 6,
        marginBottom: 8,
        color: 'var(--ff-fg)',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 11,
          color: 'var(--ff-fg-muted)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {title}
      </h3>
      <div style={{ marginTop: 4, fontSize: 14 }}>{children}</div>
    </section>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--ff-fg-muted)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ff-fg)' }}>{children}</span>
    </div>
  );
}
```

The `PositionCard()` function above these stays unchanged. Because every other DataPanel card imports `Card` and `Row` from this file, the theme tokens propagate everywhere with this single change.

- [ ] **Step 2: Web typecheck**

Run: `npx tsc -p web --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Replay running. Toggle theme. All DataPanel cards should look correct in both light and dark — borders visible, label/value contrast OK, no near-invisible text.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/DataPanel/PositionCard.tsx
git commit -m "style(web): apply theme tokens to shared Card/Row primitives"
```

---

## Task 19: README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the "Stack" section**

Find the existing "Stack" paragraph in `README.md`. Append a sentence to it:

> v0.3.0 introduces Tailwind v4, HeroUI for theming and primitives, and a dark-by-default theme that toggles in the header.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: note Tailwind v4 + HeroUI + dark-mode toggle in stack section"
```

---

## Final verification

- [ ] **Step 1: Full server test suite**

Run: `npm test`
Expected: all tests pass (52 from v0.2.0 plus the seven new parser tests = 59 total).

- [ ] **Step 2: Full typecheck**

Run: `npm run typecheck`
Expected: no errors in either workspace.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: web bundle builds without errors. Note: HeroUI + Tailwind v4 will increase bundle size; this is expected.

- [ ] **Step 4: End-to-end visual walkthrough**

In one terminal: `npm run dev:replay -- scripts/fixtures/replay-eddb-circuit.jsonl`
In another: `npm --workspace web run dev`
Open `http://localhost:5173`.

Verify in this order:

1. **First load** — page is dark by default, no flash of light content during page load (FOUC script working).
2. **Header** — title, ConnectionStatus, sun/moon toggle, gear icon. Click sun/moon — theme flips, tile style swaps to Voyager, theme persists across reload.
3. **Position card** — `52.36`<sub>`41`</sub>`° N` style, minor digits visibly smaller and dimmer in both themes.
4. **Wind card** — circular compass at the top with arrow + heading triangle + center text, two rows below for quick reading.
5. **Flight info card** (load a Simbrief plan first via gear icon → Fetch latest) — callsign + aircraft type, FL, distance, expandable route. Click route to expand/collapse.
6. **Aircraft hover** — hovering the marker on the map shows a tooltip with `BAW123 · A320` (or `Aircraft` when no plan loaded).
7. **DataPanel sections** — three group headers (Aircraft state / Time / Route). Click a header — section collapses; chevron rotates. State persists across reload (sessionStorage); a fresh tab/session starts all open.
8. **Panel hide** — click the chevron at panel's top-left: panel disappears, chevron reappears at map's top-right pointing right. Map fills the screen, all view modes still work, no grey gaps.
9. **Map** — Voyager (light) or Dark Matter (dark) tiles with city/water/country labels. Switch view modes; Follow still pans to aircraft; Manual still allows free dragging; Overview re-fits when clicked while already in Overview (after a Fetch latest).
10. **Settings modal** — opens via gear icon. HeroUI Modal — Escape closes, click outside closes, focus trap. "Simbrief" section heading, pilot ID input, Save / Fetch / Close buttons themed correctly.
11. **Theme persistence** — last theme choice survives reload (localStorage).

- [ ] **Step 5: Final commit (if any tweaks needed)**

If anything was missed and required a follow-up tweak during the walkthrough, commit it with a descriptive message. Otherwise the plan is complete.
