# Leakpoint — User-Perspective Review and Fixes

**Date:** 12 September 2026 · **Version:** 2 · **Supersedes:** `2026-09-12_Leakpoint_Full_Site_Test_v1.md`

## Executive summary

Every page and component was driven with real mouse and keyboard input at desktop (1400 px),
tablet (685 px), and phone (375 px) widths. Eleven defects were found and all eleven are fixed
and verified. The application now reports **zero WCAG 2.1 A/AA violations** across all nine
routes and all three dialogs, **zero console warnings or errors**, and a **60 % smaller entry
bundle**.

| Metric | Before | After |
| --- | --- | --- |
| WCAG 2.1 A/AA violations (9 routes) | 36 nodes | **0** |
| WCAG violations (3 dialogs) | 11 nodes | **0** |
| Console warnings per chart mount | 2 | **0** |
| Entry JS chunk | 1,029.60 kB (312.99 kB gzip) | **416.65 kB (133.67 kB gzip)** |
| Rollup >500 kB warning | present | **gone** |
| Unit tests | 16 pass | 16 pass |
| TypeScript strict check | pass | pass |

## Defects found and fixed

### 1. Map controls collided with the navbar (visual, desktop and phone)
The Leaflet zoom control sat at the top-right with a 14 px offset while the fixed navbar occupies
the top 66 px, so the zoom-in button was completely hidden behind the hamburger and zoom-out was
half covered. Measured overlap: control y 14–72 against hamburger y 14–52.
**Fix** — `styles-nav.css`: zoom control offset to 78 px, fit-all to 148 px. Below 680 px both tuck
inside the drawer footprint so no half-clickable sliver protrudes. Verified: zero overlap at both
widths, 26 px clearance from the navbar.

### 2. Dropdown menu painted behind the navbar (visual)
`.nav-dropdown` carried `z-index: 50` against the navbar's `1000`, clipping the panel's top corner
and the first menu item.
**Fix** — `z-index: 1100`. Verified by hit-testing the menu's top edge.

### 3. Dialogs painted behind the navbar (visual)
Radix renders the overlay and content as fixed children of `<body>` at `z-index: 50`. The tall
Settings dialog therefore slid under the navbar and its "Settings" title was cut off.
**Fix** — `styles-nav.css`: overlay `1190`, content `1200`, targeted by Radix's own `data-state`
attributes. The overlay now dims the navbar as a modal should.

### 4. Settings dialog had two nested scroll regions (UX)
`.settings-body` and `.model-list` were both scrollers. The list's bottom extended past the body's
visible area, so the last model row was cut mid-row and the "Showing first N of M" note and
"Default model" line were unreachable — the mouse wheel was trapped in the inner list.
**Fix** — one scroll region: the dialog is a bounded flex column (`max-height: min(88vh, 760px)`),
the body is the single scroller with a header divider, the model list grows naturally, and the
rendered row count dropped from 60 to 25 behind the existing search. Verified: one scroll region,
the footer lines reachable, fits a 375 px phone.

### 5. Selecting a factory gave no visible feedback (UX)
The "Selected factory" card renders above a 12-row ranking list. Clicking a rank row or a map
marker while scrolled down left the card 101 px above the viewport, so the only feedback was a
faint row highlight.
**Fix** — `CommandMap.tsx` scrolls the card into view on selection, honouring
`prefers-reduced-motion`.

### 6. Opened inbox messages landed below the fold (UX)
The Alerts detail pane sits below the whole inbox list; only 33 % of an opened message was visible.
**Fix** — `Alerts.tsx` applies the same scroll-into-view treatment.

### 7. Process flow wrapped with a dangling arrow (visual)
`.process-flow` used `flex-wrap: wrap` while each step's connector arrow is absolutely positioned at
`right: -16px`. The fourth card's arrow pointed off the container edge into nothing and the wrapped
fifth card had no incoming arrow.
**Fix** — single non-wrapping row with `overflow-x: auto` and `flex: 1 0 130px`. Verified: one row,
every arrow connects two cards, zero dangling arrows.

### 8. The new scroll region was not keyboard reachable (accessibility — self-inflicted, fixed)
Fix 7 introduced an `axe` `scrollable-region-focusable` violation.
**Fix** — the container takes `tabIndex={0}`, `role="group"`, a descriptive `aria-label`, and a
`:focus-visible` ring in both `FactoryDetail` and `InterventionDetail`.

### 9. The Controls button was unnamed below 1040 px (accessibility)
The responsive rule `.nav-controls span{display:none}` hides the label, leaving an icon-only button
with no accessible name.
**Fix** — `Shell.tsx` adds a state-aware `aria-label` ("Show/Hide map controls").

### 10. Thirty-six WCAG AA contrast failures (accessibility)
Small grey text between 8 px and 11 px failed the 4.5:1 minimum on six of nine routes; the worst was
2.43:1 on Credits. Eleven more failed inside the Settings dialog.
**Fix** — 16 tokens darkened algorithmically, preserving hue and saturation, each to at least
4.59:1 against its measured background. Examples: `#99a7bc` → `#627695` (2.43 → 4.62),
`#92a2b9` → `#607696` (2.60 → 4.64), `#a78c4e` → `#826d3d` (2.99 → 4.64). Verified: 0 violations
on all nine routes and all three dialogs.

### 11. Recharts logged `width(-1) and height(-1)` on every chart mount (console noise)
Recharts 3.x `ResponsiveContainer` renders once at -1 before its own observer fires, so gating on the
parent's size did not help.
**Fix** — `Charts.tsx` measures the wrapper with a `ResizeObserver` and passes real pixel dimensions
straight to `AreaChart`, `LineChart`, and `BarChart`, dropping `ResponsiveContainer`. Verified: 0
warnings across all three chart types, and the SVG still tracks the container exactly (478 px → 287 px
on resize).

## Also addressed

- **Form error placement** — the duplicate-name error appeared below the Sector field, far from the
  input it described. Moved directly beneath the Factory name input.
- **Digest pluralisation** — "1 simulated Issued labels" now reads "1 simulated Issued label"; a
  `plural()` helper covers scenario records and intake records too.
- **Digest currency format** — was `₹27,76,89,106.15`; now `₹27.77 cr`, matching every screen.
- **Number grouping** — the inbox fixture used Western grouping ("842,000") against the app's Indian
  grouping; now "8,42,000" throughout.
- **Ledger table clipped on phones** — `.ledger-table-wrap` had `overflow: hidden` with wider content,
  making the row actions unreachable. Now `overflow-x: auto`.
- **Missing environment templates** — added `frontend/.env.example` and `backend/.env.example`, with a
  `!.env.example` negation so real `.env` files stay ignored. README now says `cp frontend/.env.example
  frontend/.env`.
- **Bundle size** — nine routes are now `React.lazy` with a `Suspense` fallback. Leaflet moved to a
  173.72 kB route chunk and Recharts to a 363.83 kB chunk, both loaded on demand.

## Verification after all changes

- `tsc --noEmit` (strict): pass. `vite build`: pass, no size warning.
- Vitest: 16 of 16 pass (one digest assertion updated for the corrected singular).
- axe-core, WCAG 2.0/2.1 A + AA: 0 violations on all 9 routes; 0 in the Settings, Add-factory, and
  Advance-status dialogs.
- All 10 routes render after code splitting, no crashes, no stuck fallbacks, no JS errors.
- Re-ran the core flows end to end with a clean console: intake extract → confirm, scenario at 60 %
  (45.5k tCO2e, 7.6-month payback), record estimate, ledger export (4 records), digest generation,
  factory detail charts.
- Phone (375 px): no navbar collision, dialog fits the viewport with one scroll region, no page-level
  horizontal scroll.

## Still open

- **Map tile-outage fallback** — the `map-outage` notice and retry control could not be exercised
  without blocking the tile host at the operating-system level. Code path reviewed only.
- **Backend partial installs** — `motor 3.3.1` breaks against pymongo newer than 4.6.x. The pin in
  `requirements.txt` already prevents this; no change made.
