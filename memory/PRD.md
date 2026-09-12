# Leakpoint — Product Requirements (PRD)

## Overview
Leakpoint is a **static, session-only** React + TypeScript demonstration for industry judges to inspect factories, emissions, and interventions across India. All data lives in typed fixtures / in-memory session state — **no backend, no database**. Refreshing restores the demo dataset.

## Tech Stack
- React 19 + TypeScript + Vite
- React Router (9 routes)
- Tailwind + hand-authored editorial CSS (`styles.css`, `styles-accessibility.css`, `styles-nav.css`)
- Leaflet / react-leaflet (map, free OpenStreetMap tiles — no API key)
- Recharts (history / cash-flow / reduction charts)
- lucide-react (icons), shadcn/ui primitives

## Routes (9)
Command Map (`/`), Data Intake (`/intake`), Factories (`/factories`), Factory Detail (`/factories/:id`), Interventions (`/interventions`), Intervention Detail (`/interventions/:id`), Credits (`/credits`), Ledger (`/ledger`), Alerts (`/alerts`).

## Design direction
Restrained white/blue editorial base. As of the navbar redesign, floating panels use soft shadows + backdrop-blur (glass-morphism) with rounded edges, while keeping the white/blue palette (no purple, no dark mode).

## Hardened business rules (in `domain/calculations.ts`)
- Capex is **fixed** at every adoption level (not annualised via payback).
- Overlapping interventions never sum; only compatible measures on different sources combine.
- New factories start as **Awaiting baseline** (no coordinates/emissions/rank/recommendation).
- Portfolio ledger dedups: largest reduction per factory/source.

---

## Implemented

### 2026-06 — Navigation & Command Map redesign (this session)
- **Removed the left sidebar**; replaced with a **transparent fixed top navbar** (`Shell.tsx`):
  - `leakpoint` wordmark (left), center **capsule pill** with all 7 routes, right cluster (India, alerts bell, Demo pill, avatar).
  - Hamburger **dropdown menu** (`open-navigation` / `nav-dropdown`) serves as the mobile menu (< 1040px the capsule hides).
  - Navbar is fully transparent on the map route; translucent glass (blur) on content pages.
- **Command Map is now full-page** (`CommandMap.tsx`): map fills the viewport; a **floating rounded glass drawer** (`map-panel`) holds stats, command bar, sector/state filters, emissions ranking, and the selected-factory card.
  - Drawer opens/closes from the navbar **Controls** button (`toggle-map-panel`) + a close button; opens automatically when a marker/rank row is selected. State via `state/ui.tsx` (`useMapPanel`).
  - `FactoryMap` gained a `full` prop (height 100%, zoom control top-right, country-label/footnote hidden).
- **Decluttered pages**: removed verbose secondary disclaimer/footnote blocks from Intake, FactoryDetail, Interventions, InterventionDetail, Ledger (kept core data + key one-line notices).
- Content pages now render full-width (max 1500px, centered) below the fixed navbar.
- Verified: `yarn build` passes; testing agent 55/55 frontend checks (100%).

### 2026-06 — Rounded UI, UX polish & Controls bug fix (this session)
- **Bug fix**: the navbar **Controls** button rendered "fully white" (white text on white) when active on the map. Root cause was a CSS specificity conflict (`.app-shell.is-map .nav-controls` beating `.nav-controls.active`); fixed with a higher-specificity `.app-shell.is-map .nav-controls.active` rule (solid blue + white text). Verified via computed style `rgb(36,88,229)`.
- **Rounded components** across the app (buttons, inputs/selects, cards, dialogs, notices, tags, tables, map controls) + **UX polish**: hover-lift/shadow on cards, press feedback on buttons.
- **Drawer accessibility**: closed map drawer is now `inert` + `pointer-events:none` (inner controls not focusable/clickable when hidden).
- Recharts `minHeight` added (console warning persists but charts render fine — benign).
- Verified: `yarn build` passes; testing agent `iteration_2.json` — 100% on primary bug + all core flows, no UI/contrast regressions across 9 routes.

### Earlier (prior forks)
- Scaffolding of all 9 routes, Leaflet map, Recharts, typed fixtures, session state, intake simulation, ledger, alerts/digest. TS build errors resolved.

---

## Backlog / Next
- **P1** Lighthouse accessibility ≥ 95 on Command Map + Data Intake (re-verify after redesign; navbar now transparent — check contrast of nav text over map).
- **P2** Cosmetic: silence Recharts `width/height(-1)` console warning (chart mounted at 0-size during transitions).
- **P3** Optional: proper `.d.ts` for `dropdown-menu.jsx` instead of `as any` cast in `Shell.tsx`.
- **P3** Edge-case sweep (invalid IDs, map outage, cancelled extraction, empty filters) — mostly covered.

## Testing
- `/app/test_reports/iteration_1.json` — 100% (55/55) frontend redesign checks.
- No auth / no credentials (static demo).
