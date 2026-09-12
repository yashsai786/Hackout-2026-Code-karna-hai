# Leakpoint — Full Site Test Report

**Date:** 12 September 2026 · **Version:** 1 · **Scope:** Frontend (9 routes), backend foundation, unit suites, accessibility, responsive behaviour

## Executive summary

The application passes every functional test executed. Static analysis, unit tests, and backend
tests all pass. All nine routes render, all nine edge-case routes degrade gracefully, and every
hardened business rule holds under live inspection.

One serious defect emerged: 36 WCAG 2.1 AA colour-contrast failures across six of the nine
routes. This blocks the accessibility target recorded in the product requirements.

| Suite | Result |
| --- | --- |
| TypeScript strict check (`tsc --noEmit`) | Pass |
| Production build (`vite build`) | Pass — 2,355 modules |
| Vitest unit suite | 16 of 16 pass |
| Backend pytest | 2 of 2 pass |
| Functional flows (browser-driven) | All pass |
| Edge-case routes | 9 of 9 handled |
| Accessibility (axe-core, WCAG 2.0/2.1 A and AA) | **36 violations** |
| Responsive (375 px) | Pass |

## Environment

- Node 26.6.0, Yarn 1.22.22 (installed on demand; no global Yarn present)
- Python 3.9.6 in an isolated virtual environment
- MongoDB 27017, local instance in a temporary directory
- Vite dev server on `127.0.0.1:3000`; FastAPI on `127.0.0.1:8001`
- `frontend/.env` and `backend/.env` created for the run; both are gitignored

## 1. Static analysis and unit tests

- `tsc --noEmit` under `strict: true`: no errors.
- `vite build`: succeeded in 3.18 s. Output: `index.js` 1,029.09 kB (312.74 kB gzip),
  `index.css` 132.05 kB (29.59 kB gzip). Rollup warned that the chunk exceeds 500 kB.
- Vitest: 16 of 16 cases pass in 47 ms, covering fixture invariants, scenario mathematics,
  adoption guardrails, portfolio deduplication, command parsing, CSV injection escaping,
  extraction bounds, and digest generation.

## 2. Backend foundation

| Check | Result |
| --- | --- |
| `GET /api/` | 200, typed payload |
| `GET /api/health` | 200, typed payload |
| CORS with allowed origin | `access-control-allow-origin` returned correctly |
| `POST /api/health` | 405, GET-only method list enforced |
| Unknown path | 404 |
| MongoDB stopped | 200 with `unavailable (demonstration unaffected)` |
| `pytest tests/` | 2 passed |

The service degrades correctly when the database is absent, which matches its stated contract.

## 3. Functional verification

### Command Map
12 markers plotted; stats read 12 factories in view, 4.13M tCO2e, 366.1k tCO2e/yr opportunity,
4 sectors. OpenStreetMap tiles render. Marker selection updates the URL, opens the drawer, and
populates the selected-factory card. The closed drawer is `inert`, `aria-hidden`, and
`pointer-events: none`, and its command input is not focusable. Zoom, fit-all, legend, and
attribution controls all present.

### Command bar — all six rule classes
| Input | Result |
| --- | --- |
| `Find Bhilai` | Selected Bhilai Steel Works |
| `Gujarat` | Ambiguous; 3 choices offered |
| `teleport to moon` | Helpful fallback guidance |
| `Show cement factories` | Filtered to cement; ranking updated |
| `Highest intensity` | Reranked to 2.47 tCO2e/t leader |
| `reset` | Filters cleared |
| `Go to ledger` | Navigated to `/ledger` |

### Data Intake
Cancellation mid-extraction returns to step one and reports that no record was saved. The full
flow produced arithmetically correct output: 420 tonnes coal x 2.42 = **1,016.4 tCO2e**, and
420 x 8,200 = **INR 34.44 L**. A negative quantity raised the validation message and disabled
confirmation. The success screen confirmed the annual baseline remains unchanged at 8,42,000 tCO2e.

### Factories and factory creation
Search, sector filter (3 cement), and both sort modes behave correctly; the empty state offers a
clear-filters action. Creation is blocked on empty fields and on duplicate names.

### Hardened business rules — all verified live
| Rule | Evidence |
| --- | --- |
| Capex fixed at every adoption level | INR 8.50 cr at 0 %, 50 %, and 100 % adoption |
| New factory starts Awaiting baseline | 13 in view / 12 with baselines; 12 markers; 12 ranked; no stats or recommendations |
| Overlapping measures never sum | Bundle options excluded `boiler` (same fuel source as `waste-heat`) |
| Ledger deduplicates by factory and source | Portfolio total 123.9k retained the larger 75,780 and discarded the 56,835 same-source entry |
| Export exposure limited to steel and cement | Steel INR 102.30 cr, cement INR 42.44 cr, textiles "N/A — outside this CBAM fixture scenario" |

### Scenario builder
Reduction scaled linearly (75.8k / 37.9k / 0), payback moved 4.5 → 9.1 months → "No break-even",
and the 36-month cash-flow endpoint tracked correctly. The `waste-heat + solar` bundle produced
112.8k tCO2e (13.4 % of baseline) and INR 20.50 cr capex. Recording an estimate raised a toast,
locked the button against duplicates, and produced a highlighted ledger row.

### Ledger
CSV export produced a correct 12-column header, CRLF line endings, quoted cells,
`text/csv;charset=utf-8`, and the "Registry verified: No" and "Simulation: Yes — illustrative
estimate only" labels. The status-advance dialog moved LP-2026-001 from Estimated to In review and
updated the progression counts.

### Credits
Bhilai: waste-heat 75.8k → 53.0k units → INR 3.18–7.96 cr, all arithmetically consistent with the
0.70 modelling factor and the INR 600–1,500 band. Satna: clinker substitution 37.4k → 26.2k units.
Readiness meters showed 3 of 4 and 2 of 4; independent verification remained outstanding for both.
Realised revenue stayed at INR 0.

### Alerts
Inbox held 3 items with 2 unread; the unread filter and read-marking worked. The generated digest
reflected live session state (13 factories, 12 baselines, 1 awaiting, 4 scenario records). Turning
off the digest preference correctly withheld inbox delivery and changed the status copy.

### Settings (OpenRouter)
The public model list loaded (62 shown), search narrowed to 32 Claude models, the visibility toggle
worked, Connect stayed disabled while the field was empty, and a deliberately invalid placeholder
surfaced the upstream error without connecting. No real credential was entered at any point.

### Edge cases — 9 of 9 handled, no crashes
`/nope-not-a-route`, `/factories/does-not-exist`, `/interventions/does-not-exist`,
`/interventions/waste-heat?factory=ghost`, `/credits?factory=ghost`, `/ledger?record=LP-GHOST`,
`/?factory=ghost`, `/intake?factory=ghost`, `/interventions?factory=ghost` each produced an
appropriate not-found state or inline notice with a recovery action.

### Responsive and semantics
At 375 px the nav capsule hides, the hamburger menu opens with all 7 routes, and no horizontal
scroll occurs. The page provides a working skip link, a single `h1`, `main`/`nav`/`footer`
landmarks, `lang="en"`, per-route document titles, `:focus-visible` outlines, and functional
`sr-only` text.

## 4. Defects

### D1 — WCAG AA colour contrast: 36 failing nodes (serious)
Every violation is the same rule: small grey text between 8 px and 11 px fails the 4.5:1 minimum.

| Route | Nodes | Worst ratio | Example |
| --- | --- | --- | --- |
| `/credits` | 8 | **2.43:1** | `#99a7bc` on `#ffffff`, 10 px |
| `/factories/:id` | 12 | 4.24:1 | `.back-link` `#6b7c96` on white, 10 px |
| `/` | 6 | 3.56:1 | ranking note `#7c8798` on `#fcfdfd`, 10 px |
| `/interventions/:id` | 6 | 4.24:1 | 10 px secondary text |
| `/factories` | 2 | 4.18:1 | chemicals sector tag, 8 px |
| `/ledger` | 2 | 3.12:1 | `#688ac6` on `#eef3fd`, 9 px |
| `/intake`, `/interventions`, `/alerts` | 0 | — | clean |

This blocks the "Lighthouse accessibility >= 95" objective in `memory/PRD.md`. The fix is confined
to token values in `styles.css` and `styles-nav.css`; no markup change is required.

### D2 — Recharts container warning (cosmetic)
`The width(-1) and height(-1) of chart should be greater than 0` fires roughly twice per chart
mount on every charted route. Charts render correctly. The existing `minHeight={180}` does not
suppress it, because the container measures zero width during mount.

### D3 — Digest pluralisation (copy)
The digest emits "1 simulated Issued labels". Singular and plural forms are not selected.

### D4 — Inconsistent number grouping (copy)
Hard-coded fixture copy uses Western grouping ("842,000 tCO2e" in the Alerts inbox) while computed
output uses Indian grouping ("8,42,000 tCO2e"). Both appear within one session.

### D5 — Single 1.03 MB bundle (performance)
Leaflet, Recharts, and the full Radix set load eagerly in one chunk. Route-level code splitting
would cut first load materially.

### D6 — No `.env.example` (developer experience)
`vite.config.ts` throws "Missing application environment" unless `REACT_APP_BACKEND_URL`,
`FRONTEND_HOST`, `FRONTEND_PORT`, and `FRONTEND_ALLOWED_HOSTS` are all present. Nothing in the
repository documents them, so a fresh clone cannot start the application.

### D7 — Partial backend installs break (low)
`motor 3.3.1` fails against pymongo newer than 4.6.x with
`ImportError: cannot import name '_QUERY_OPTIONS'`. The pin in `requirements.txt` prevents this, so
the defect only affects installs that skip the pinned file.

## 5. Not verified

- **Map tile-outage fallback.** The `map-outage` notice and retry control could not be exercised
  without blocking the tile host at the operating-system level. The code path was reviewed only.
- **Physical keyboard traversal.** The browser pane was not compositing frames, so synthetic
  events were used. Focus rings were confirmed through CSS inspection and programmatic focus.

## 6. Recommended order of work

1. Raise the failing grey tokens to at least 4.5:1 and re-run axe on all nine routes (D1).
2. Add `frontend/.env.example` and reference it in the README setup section (D6).
3. Correct the digest pluralisation and unify number grouping on computed and fixture copy (D3, D4).
4. Introduce route-level code splitting for Leaflet and Recharts (D5).
5. Suppress the Recharts mount warning by deferring chart render until the container has width (D2).
