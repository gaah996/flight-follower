# Flight Follower — v1.2 Design Spec

- **Date:** 2026-04-25
- **Status:** Approved, ready for implementation planning
- **Scope:** v1.2 (visual foundation — component library, dark mode, layout, themed widgets)
- **Predecessors:**
  - [`2026-04-24-flight-follower-design.md`](./2026-04-24-flight-follower-design.md) — v1
  - [`2026-04-25-flight-follower-v1.1-design.md`](./2026-04-25-flight-follower-v1.1-design.md) — v1.1

## 1. Overview

v1.2 is the visual-foundation release: it adopts a component library and a theming system, restructures the data panel into semantic groups, and replaces a few of the plainer cards with richer widgets (wind compass, flight-info card). It does **not** change any server logic, telemetry shape, or routing math beyond a small extension of the Simbrief parser to surface four extra fields.

The brief, set during brainstorming: a **modern/minimal dashboard** foundation (Linear/Vercel/Notion register), with selective **MFD-style accents** (monospace numerics, tighter visual rhythm) on the data-display elements where they earn their keep. v1.2 builds the foundation *and* commits to those accents per-card during implementation; if a particular MFD treatment ends up looking tacky, we ship that card in clean A-style instead. No runtime A/B toggle.

The release is intentionally narrow on backend surface: Simbrief parser gains four optional fields, types extend, nothing else server-side moves. The frontend is where almost all the work lives.

## 2. Goals

1. Adopt HeroUI + Tailwind CSS v4 as the styling layer; replace inline styles in touched components.
2. Ship a dark/light theme with a header toggle, dark as the default.
3. Restructure the DataPanel into three collapsible sections (*Aircraft state*, *Time*, *Route*).
4. Allow the side panel to be hidden for a full-map view, restored via an in-content button.
5. Default the map tiles to a clean, labelled style that auto-swaps with the theme.
6. Replace the plain Wind text rows with a circular compass widget (text rows preserved beneath it for a quick read).
7. Add a Flight Info card showing callsign, aircraft type, cruise altitude, total distance, and the route string.
8. Show the callsign + aircraft type as a tooltip when hovering the aircraft marker on the map.
9. Show position with multi-tier typography — major digits prominent, minor digits visually de-emphasized.
10. Refresh the existing map UI (ViewModeControl, AircraftMarker, Leaflet tooltips) to fit the new theme.
11. Move the Settings dialog to HeroUI's `Modal`, framing the existing single setting as a "Simbrief" section so future settings groups can land cleanly.

## 3. Non-goals (v1.2)

- No new server logic. The aggregator, route-math, transport, and recording subsystems stay exactly as v1.1 left them.
- No new server endpoints, no new WebSocket message types.
- No runtime map style switcher (the theme-driven swap is automatic; a user-facing dropdown stays in the backlog).
- No layers panel, no unit toggling, no flight phase classifier, no live ETA — those remain scheduled or backlogged.
- No tabs in the Settings modal — premature for one settings group.
- No animated theme transitions — instant swap is honest and avoids a 200 ms fade on every load.
- No big-bang inline-style purge across the entire codebase. Inline styles disappear progressively as we touch each file in scope.

## 4. Tech stack additions

### 4.1 Tailwind CSS v4

Tailwind v4 ships with a CSS-first configuration model — no `tailwind.config.ts` file. Setup:

- Add `@tailwindcss/vite` to `web/devDependencies` and to `vite.config.ts`'s plugins array.
- New file `web/src/index.css` containing:
  - `@import "tailwindcss";`
  - `@custom-variant dark (&:where(.dark, .dark *));` — enables Tailwind's `dark:` variant when the `<html>` element has class `dark`.
  - A `@theme` block defining the project's color tokens (foreground, background, muted, accent, MFD-amber/green/red, …) in both modes via CSS variables.
  - Project-specific utility extensions (e.g. tabular-nums helpers, the `.major` / `.minor` classes for multi-tier numerics, Leaflet tooltip overrides).

Content auto-detection means no `content: [...]` array is needed.

### 4.2 HeroUI

- Add `@heroui/react` and `@heroui/theme` to `web/dependencies`.
- Add `framer-motion` (HeroUI peer dep) to `web/dependencies`.
- In `index.css`, register HeroUI's plugin per its v4 setup docs (`@plugin "@heroui/theme/plugin";` or equivalent — exact directive per the version we install).
- Wrap the application root in `<HeroUIProvider>` inside `web/src/main.tsx`, with the `defaultColorScheme` reading from the theme store.

### 4.3 New / changed dependencies summary

| Package | Where | Why |
|---|---|---|
| `tailwindcss` | web dep | Styling layer |
| `@tailwindcss/vite` | web devDep | Vite plugin |
| `@heroui/react`, `@heroui/theme` | web dep | Component library |
| `framer-motion` | web dep | HeroUI peer dep |

No additions in `server` or `shared`.

## 5. Theme system

### 5.1 Store

New file `web/src/store/theme.ts`:

```ts
type ThemeStore = {
  theme: 'dark' | 'light';
  toggle: () => void;
  setTheme: (t: 'dark' | 'light') => void;
};
```

Backed by Zustand `persist` with **`localStorage`** (key `ff:theme`), default `'dark'`. A small `useEffect` in `App.tsx` adds/removes the `dark` class on `document.documentElement` whenever the theme changes — that's what flips Tailwind's `dark:` variants and HeroUI's color scheme together.

Theme persistence chosen `localStorage` over `sessionStorage` because day/night preference is more durable than session preferences (which is why view-mode and section-collapse use `sessionStorage`).

### 5.2 Toggle UI

A small icon button in the header — sun (`☀`) when in dark mode (clicking switches to light), moon (`☾`) when in light mode (clicking switches to dark). HeroUI `Button` with `isIconOnly` and a `Tooltip` wrapper for label.

Instant swap. No animated transition.

## 6. App shell

### 6.1 Header

```
[Flight Follower] ............ [ConnectionStatus]  [☀/☾]  [⚙]
```

- Title text on the left (typography upgraded with theme tokens).
- `ConnectionStatus`, theme toggle, settings — all icon buttons with tooltips, on the right.
- The previous "Settings" text button becomes a gear icon (`⚙`).
- Header row replaces inline styles with Tailwind utilities + theme tokens.

### 6.2 Side panel hide

Behavior:
- New field on `useViewStore`: `panelVisible: boolean` (default `true`), persisted in `sessionStorage` (existing `ff:map-view` key, added to `partialize`).
- A small icon button (chevron) lives at the **top-left of the panel** when the panel is open. Click → `panelVisible = false`.
- When the panel is hidden, the button moves to the **top-right of the map**, with a flipped chevron. Click → `panelVisible = true`.

Layout change:
- The grid in `App.tsx` switches between `gridTemplateColumns: '1fr 360px'` (panel visible) and `gridTemplateColumns: '1fr'` (panel hidden) via a Tailwind class swap.
- Map needs `map.invalidateSize()` after layout change. Add a `useEffect` in `Map.tsx` (or `MapController.tsx`) that watches `panelVisible` and calls `invalidateSize()` after the next frame.

The button uses absolute positioning relative to the map/panel container. Slight backdrop blur (`bg-background/70 backdrop-blur`) so it remains legible against the map tiles when the panel is hidden.

## 7. DataPanel layout

### 7.1 Section grouping

Three groups (in this order, all collapsible):

```
▾ Aircraft state
    PositionCard
    SpeedCard
    AltitudeCard
    WindCard       (compass + Dir/Speed rows)

▾ Time
    TimeCard

▾ Route
    RouteCard
    FlightInfoCard (new)
```

### 7.2 Section component

New file `web/src/components/DataPanel/Section.tsx`:

```tsx
type SectionProps = {
  title: string;
  sectionKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
};
```

- Header is a HeroUI `Button` (`variant="light"`) with the title and a chevron that rotates 90° when open.
- Body shows/hides via conditional render (no animation in v1.2 — keeps the markup simple).
- Open/closed state stored at `useViewStore.sections[sectionKey]: boolean`. Defaults to all open. Persisted in `sessionStorage`.

We do **not** use HeroUI's `Accordion` — its single-open semantics aren't what we want.

### 7.3 Why this layout, not B (instrument cluster)

The user explicitly preferred A's structure with the option to upgrade individual cards to B-style if they look right. v1.2 ships A's structure; the per-card MFD treatment lives in the wind compass and the multi-tier position number for now. Other cards stay clean A-style; if a future visual iteration wants more MFD flavor, it's a card-level change, not a layout change.

## 8. Map tiles

### 8.1 Default style — auto-swap with theme

In `web/src/components/Map/Map.tsx`:

```ts
const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};
```

Both are the **labelled** variants — cities, water bodies, country names visible. `react-leaflet`'s `<TileLayer key={url} ...>` re-creates the layer when `url` changes, so the theme toggle visibly swaps tiles within ~1 s (network-dependent).

### 8.2 Attribution

Both CartoDB sets require dual attribution:

```
© <a href="…">OpenStreetMap</a> contributors © <a href="…">CARTO</a>
```

Updated in the `<TileLayer>` `attribution` prop. Leaflet renders this in the bottom-right of the map; styled via a `.leaflet-control-attribution` override in `index.css` so it inherits theme colors.

### 8.3 ViewModeControl

`web/src/components/Map/ViewModeControl.tsx` becomes a HeroUI `ButtonGroup` of three `Button`s (`overview` / `follow` / `manual`). Active mode rendered with `variant="solid"`, inactive with `variant="flat"`. Same position (top-right of map), themed automatically.

## 9. Multi-tier position formatting

`web/src/components/DataPanel/fmt.ts` is renamed to `fmt.tsx` so it can return JSX nodes. `fmtLatHemi` / `fmtLonHemi` change return type from `string` to `ReactNode`:

```tsx
export function fmtLatHemi(v: number | null | undefined): ReactNode {
  if (v == null) return dash;
  const hemi = v >= 0 ? 'N' : 'S';
  const abs = Math.abs(v);
  const major = abs.toFixed(2);                       // "52.36"
  const minor = abs.toFixed(4).slice(major.length);   // "41"
  return (
    <span>
      <span className="major">{major}</span>
      <span className="minor">{minor}</span>
      ° {hemi}
    </span>
  );
}
```

Same shape for `fmtLonHemi`. CSS in `index.css`:

```css
.major { font-variant-numeric: tabular-nums; }
.minor {
  font-size: 0.75em;
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
}
```

Result: `52.36`<sub>`41`</sub>`° N`. Decimal precision is **2 + 2** (4 total).

`PositionCard.tsx` already passes the value into `fmtLatHemi/fmtLonHemi`; no change there beyond `import` paths if needed.

## 10. Wind compass widget

### 10.1 Component

New file `web/src/components/DataPanel/WindCompass.tsx`. Renders an inline SVG, ~80 px square:

- **Outer ring** with 8 ticks (4 cardinals N/E/S/W labelled, 4 unlabelled at the diagonals).
- **Wind arrow** — a triangle pointing toward the wind's source. Angle = `wind.direction` from north, rendered with `transform="rotate(${dir} 40 40)"`.
- **Aircraft heading triangle** — a smaller hollow triangle inside the ring at angle `heading.magnetic`. Visual cue for relative wind.
- **Center text** — `${dir.toFixed(0)}° / ${speed.toFixed(0)} kt`, monospace, small. Rendered as `—` when no telemetry.

Frame of reference: **North-up** (compass cardinal stays fixed; wind/aircraft arrows rotate around it). This is the more honest representation of the data and is easier to compare across flights than aircraft-up.

Wind direction is "where the wind is coming FROM" (aviation convention) — the arrowhead points to the source cardinal.

### 10.2 WindCard structure

```tsx
<Card title="Wind">
  <WindCompass />
  <Row label="Dir">{t ? `${fmtNum(t.wind.direction, 0)}°` : dash}</Row>
  <Row label="Speed">{t ? `${fmtNum(t.wind.speed, 0)} kt` : dash}</Row>
</Card>
```

Existing rows preserved beneath the compass (per the brainstorm — quick text scan still available).

## 11. Flight info card

### 11.1 Card content

New file `web/src/components/DataPanel/FlightInfoCard.tsx`. Lives in the *Route* section, beneath `RouteCard`.

Rows when a plan is loaded:

- **Header line:** `BAW123 · A320` — callsign + aircraft type, slightly larger / monospace.
- **Cruise altitude:** `FL360` — formatted from `cruiseAltitudeFt` as `'FL' + Math.round(ft / 100).toString().padStart(3, '0')`.
- **Distance:** `1085 nm` — from `totalDistanceNm`.
- **Route:** `EGLL DCT MID UN160 LMG ... LEMD` — monospace, truncated to one line with ellipsis when overflowing the card width. Click toggles between truncated and wrapped multi-line. Local component state, no store needed.

Render fallback: `Import a plan to see flight info.` when `plan == null` (matches RouteCard).

### 11.2 Hover state

No hover state on the card itself in v1.2 (the user explicitly said no hover for the card).

## 12. Aircraft marker hover

In `web/src/components/Map/AircraftMarker.tsx`:

- `interactive={true}` (currently `false`).
- Wrap with a `react-leaflet` `<Tooltip>`:

```tsx
<Marker position={[…]} icon={icon} interactive>
  <Tooltip direction="top" offset={[0, -16]}>
    {plan?.flightNumber || 'Aircraft'}{plan?.aircraftType ? ` · ${plan.aircraftType}` : ''}
  </Tooltip>
</Marker>
```

When neither field is set (no plan), tooltip reads `Aircraft`. Never blank.

The marker SVG already uses `currentColor`; we route the color through a CSS variable on the `divIcon` wrapper so it inherits the theme:

```css
.ff-aircraft { color: var(--ff-aircraft, #2563eb); }
```

`--ff-aircraft` is defined in both `:root` (light) and `.dark` (slightly different shade for contrast).

## 13. Settings modal

The hand-rolled `<div>` overlay is replaced with HeroUI:

```tsx
<Modal isOpen={open} onOpenChange={onOpenChange}>
  <ModalContent>
    <ModalHeader>Settings</ModalHeader>
    <ModalBody>
      <section aria-labelledby="simbrief-section">
        <h3 id="simbrief-section">Simbrief</h3>
        {/* user-id input + status text */}
      </section>
    </ModalBody>
    <ModalFooter>
      {/* Save / Fetch latest plan / Close buttons */}
    </ModalFooter>
  </ModalContent>
</Modal>
```

Inherits HeroUI's accessibility (focus trap, Escape-to-close, scroll-lock) for free.

The "Simbrief" `<section>` heading prepares the structure for additional settings groups in future versions; we don't add tabs yet (only one section exists today — YAGNI).

## 14. Data contract changes

In `shared/types.ts`:

```ts
export type FlightPlan = {
  // …existing v1.1 fields…
  flightNumber?: string;     // e.g. "BAW123"
  aircraftType?: string;     // e.g. "A320"
  cruiseAltitudeFt?: number; // 36000 (raw feet; FE formats as FL360)
  totalDistanceNm?: number;  // 1085
  routeString?: string;      // "EGLL DCT MID UN160 LMG ... LEMD"
};
```

All optional. No changes to `RawTelemetry`, `Airport`, `FlightProgress`, `FlightState`, or `WsMessage`.

Simbrief parser (`server/src/simbrief/parser.ts`) extracts:

| FlightPlan field | OFP path | Notes |
|---|---|---|
| `flightNumber` | `general.icao_airline + general.flight_number` | Concatenated, e.g. `"BAW" + "123" = "BAW123"`. Both required when present; field is `undefined` if either is missing. |
| `aircraftType` | `aircraft.icao_code` | E.g. `"A320"`. |
| `cruiseAltitudeFt` | `general.initial_altitude` | Already feet in OFP. Coerced via `numFromStr`. |
| `totalDistanceNm` | `general.air_distance` | Already nm in OFP. Coerced via `numFromStr`. Fallback to `general.route_distance` if `air_distance` is absent. |
| `routeString` | `general.route_navigraph` | Falls back to `general.route` when `route_navigraph` is absent. |

`server/src/simbrief/fixtures/minimal-ofp.json` is extended with these fields so the parser test asserts extraction.

## 15. Files touched

### New (web)
- `web/src/index.css`
- `web/tailwind.config — none (CSS-first config)`
- `web/src/store/theme.ts`
- `web/src/components/Header.tsx` (extracted from `App.tsx` for cleanliness)
- `web/src/components/ThemeToggle.tsx`
- `web/src/components/PanelToggle.tsx`
- `web/src/components/DataPanel/Section.tsx`
- `web/src/components/DataPanel/WindCompass.tsx`
- `web/src/components/DataPanel/FlightInfoCard.tsx`

### Modified (web)
- `web/package.json` (deps: `tailwindcss`, `@tailwindcss/vite`, `@heroui/react`, `@heroui/theme`, `framer-motion`)
- `web/vite.config.ts` (Tailwind plugin)
- `web/src/main.tsx` (HeroUIProvider, theme bootstrap)
- `web/src/App.tsx` (header layout, panel visibility, grid)
- `web/src/store/view.ts` (add `panelVisible`, `sections`, `setPanelVisible`, `setSectionOpen`)
- `web/src/components/SettingsDialog.tsx` (HeroUI Modal)
- `web/src/components/ConnectionStatus.tsx` (theme tokens)
- `web/src/components/Map/Map.tsx` (theme-aware tile URL, attribution, invalidateSize on panel toggle)
- `web/src/components/Map/ViewModeControl.tsx` (HeroUI ButtonGroup)
- `web/src/components/Map/AircraftMarker.tsx` (CSS variable for color, interactive Tooltip)
- `web/src/components/Map/PlannedRoute.tsx` (theme-friendly tooltip styling — overrides may suffice)
- `web/src/components/DataPanel/DataPanel.tsx` (replace flat stack with `<Section>` blocks)
- `web/src/components/DataPanel/PositionCard.tsx`, `SpeedCard.tsx`, `AltitudeCard.tsx`, `WindCard.tsx`, `TimeCard.tsx`, `RouteCard.tsx` (theme tokens, monospace numerics, Tailwind utilities; behavior unchanged where not specified)
- `web/src/components/DataPanel/fmt.ts` → renamed to `fmt.tsx` (multi-tier helpers)

### Modified (server)
- `server/src/simbrief/parser.ts` (parse the four new fields)
- `server/src/simbrief/parser.test.ts` (assert the four new fields)
- `server/src/simbrief/fixtures/minimal-ofp.json` (extend with new fields)

### Modified (shared)
- `shared/types.ts` (extend `FlightPlan`)

## 16. Tests

Per project pattern: server gets unit tests, frontend is verified manually against the replay fixture.

- **Parser** — extend the existing test to assert the four new fields are extracted from the fixture; add an "omits when absent" symmetric test for at least `flightNumber` and `routeString` (the most likely to be missing in real OFPs).
- **Frontend** — manual verification:
  - Theme toggle flips colors and tile style (~1 s tile network swap is acceptable).
  - Persists across reload via `localStorage`.
  - Section collapse persists across reload (`sessionStorage`); a fresh tab/session restores all sections to open.
  - Side panel hide expands map to full width; map remains usable (zoom, pan, all view modes still work). Re-showing the panel restores prior section-collapse state.
  - Wind compass arrow rotates with `wind.direction`; aircraft heading triangle rotates with `heading.magnetic`.
  - Flight info card shows `BAW123 · A320 / FL360 / 1085 nm / route string`. Click on truncated route expands; click again collapses.
  - Aircraft marker hover shows `BAW123 · A320`; with no plan loaded, shows `Aircraft`.
  - Position renders as `52.36`<sub>`41`</sub>`° N` with the minor digits visibly de-emphasized (smaller, dimmer).
  - Settings modal opens via gear icon, closes via Escape, traps focus, scroll-locks the body.

## 17. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| HeroUI v4 setup snags (its v4 plugin/theme has fewer online tutorials than v3) | Medium | Follow HeroUI's official v4 docs, not blog posts. Fall back to v3 setup if v4 setup is still rough at install time — v4 vs v3 is a config detail, not a feature delta. |
| CartoDB rate limits | Low | Single-user LAN app; well under any reasonable threshold. Browser caching covers most repeats. |
| `<TileLayer key={url}>` re-creation on theme swap causes a visible flash | Low | Acceptable for a sub-second flash; most users will toggle theme rarely. If annoying in practice, swap to a CSS-filter-based approach later. |
| Tailwind v4 + Vite plugin doesn't play nicely with our existing Vite config | Low | The plugin is officially supported by the Tailwind team and integrates cleanly. If we hit an issue, the worst-case is downgrading to Tailwind v3 setup (PostCSS) which is well-documented. |
| Renaming `fmt.ts` → `fmt.tsx` breaks something subtle (HMR, type imports) | Low | Vite handles `.ts`/`.tsx` interchangeably for ESM; named imports stay valid. We update import statements where needed; TypeScript will catch any miss. |
| Inline-style → Tailwind migration introduces visual regressions in cards we don't fully redesign | Medium | Touch only what's in the v1.2 scope; leave the rest alone. Manual visual verification on the replay fixture catches any obvious drift. |
| Dark map tiles look unfamiliar at first; user expects more visible labels | Low | We're using the `_all` (labelled) variants; user has seen and approved the choice. If labels feel too sparse mid-implementation, swap is a one-line change. |

## 18. Backlog updates

After v1.2 ships, mark the following as completed-from-backlog so the file stays accurate:
- Component library + dark mode
- DataPanel layout / grouping
- Wind compass widget
- Default map tile style refinement
- Flight info card
- Multi-tier position precision

The map style switcher, layers panel, unit toggling, flight phase classifier, and v2 candidates remain in the backlog as before.

## 19. Out of scope

Explicitly deferred:

- Live ETA, breadcrumb altitude gradient, skip-waypoint, TOC/TOD markers, progress timeline — scheduled for v1.3.
- Map-style runtime switcher, layers panel, unit switching, flight phase classifier — backlog.
- METAR per airport, live other aircraft, FE-controlled replay module — v2 candidates, backlog.
- Tabs in the Settings modal — premature for one settings group; revisit when ≥ 3 sections exist.
