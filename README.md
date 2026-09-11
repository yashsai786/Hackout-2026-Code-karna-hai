# Leakpoint — Industrial Emission Leak-Point Detector & Circular Alternative Recommender

**HackOut 2026 · Team "Code Karna hai" · Team Leader: Gangwani Yash**

> Your factory is leaking money. We show you exactly where.

Leakpoint identifies where an industrial site's carbon and cash escape, recommends circular
and efficiency alternatives, quantifies each one in rupees and tonnes, and ranks every
enrolled factory on one live map.

---

## 1. The problem

Small and medium industries cannot see where their carbon originates.

- MSMEs account for an estimated **25 percent of India's industrial emissions**, yet only
  **31 percent** use energy-efficient products.
- Owners cannot identify which process, fuel, or material drives their footprint, so no
  action follows.
- Exporters face carbon border taxes that already translate into lost orders and
  compliance risk.

*Sources cited in the pitch: CSEP (2026); Business Standard, January 2026.*

## 2. The proposition

Photograph a bill. Receive a ranked, costed action plan. No integrations, no consultants,
no delay.

| Stage | Outcome |
| --- | --- |
| **Identify** | Top emission sources across energy, materials, and waste |
| **Recommend** | Circular interventions with capital cost and CO2 saved |
| **Quantify** | Loss avoided, payback month, and carbon-credit potential |
| **Rank** | Every factory on one live carbon leaderboard |

### The five-step pipeline

1. **Extract** — read invoices, bills, and records; normalise vendor, line item, date, and quantity.
2. **Detect** — match entities to asset, site, and category records; benchmark against the CEA CO2 baseline to flag hotspots.
3. **Recommend** — rank interventions by feasibility, impact, and fit.
4. **Quantify** — translate each action into savings, emissions avoided, cost, payback, and credit upside.
5. **Track** — monitor milestones and KPI targets, and verify realised impact.

## 3. What the application does today

Leakpoint is a browser-only, session-scoped decision console. Every figure derives from
typed fixtures and deterministic TypeScript calculations, and every screen labels its
output as an illustrative estimate.

| Route | Screen | Capability |
| --- | --- | --- |
| `/` | **Command Map** | Full-page Leaflet map over OpenStreetMap tiles, sector and state filters, total-versus-intensity ranking, natural-language command bar, tile-outage fallback |
| `/intake` | **Data Intake** | Three-stage source capture with simulated extraction, editable factors, and per-source estimates |
| `/factories` | **Factories** | Twelve-site index with search and sector filters |
| `/factories/:id` | **Factory Detail** | Hotspots by source, twelve-month history chart, intensity, export exposure, process flow, recommended starting points |
| `/interventions` | **Interventions** | Catalogue of six measures with sector eligibility |
| `/interventions/:id` | **Scenario Builder** | Adoption slider (0–100 percent), compatible bundles, reduction, payback, and a 36-month cash-flow chart |
| `/credits` | **Credits** | Conditional credit volume, reference price band, and a four-step verification readiness meter |
| `/ledger` | **Ledger** | Session record of estimates, status progression, deduplicated portfolio totals, and CSV export |
| `/alerts` | **Alerts** | In-app inbox, notification preferences, and a rule-based portfolio digest |

### Feature highlights from the pitch

- **God-Eye map with carbon ranking** — implemented on Leaflet and OpenStreetMap, no API key required.
- **Current versus recommended comparison** — implemented as the adoption slider and comparison bars.
- **Payback and break-even timeline** — implemented as a 36-month cumulative cash-flow projection.
- **Price impact and loss estimation** — implemented as gross export-exposure scenarios for steel and cement.
- **Carbon credit potential** — implemented as a conditional volume and reference price band, explicitly not issuance.
- **Bill and meter photo auto-extraction** — **not yet implemented**; see section 5.

## 4. Architecture

### Current repository

```
frontend/               React 19 + TypeScript + Vite
  src/pages/            9 route components
  src/components/       Shell, FactoryMap, CommandBar, Charts, shadcn/ui primitives
  src/domain/           Types, fixtures, calculations, extraction, digest, commands, validation
  src/state/            Session, UI, and settings React contexts (in memory only)
  src/lib/openrouter.ts Optional session-only OpenRouter key validation and model listing
backend/                FastAPI health-check foundation (not called by the application)
  server.py             GET /api/ and GET /api/health, with a MongoDB ping
tests/, test_reports/   Automated UI sweep artefacts and pytest output
memory/PRD.md           Product requirements and change log
```

| Layer | Technology in this repository |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router 7 |
| Styling | Tailwind CSS plus hand-authored editorial CSS, shadcn/ui and Radix primitives |
| Map | Leaflet and react-leaflet over OpenStreetMap tiles |
| Charts | Recharts |
| Calculations | Deterministic TypeScript in `src/domain/calculations.ts` |
| Backend | Python FastAPI (health endpoints only) |
| Storage | None. React state only; a refresh restores the demonstration dataset |

### Hardened business rules

Encoded in [`calculations.ts`](frontend/src/domain/calculations.ts) and enforced by
[`validation.ts`](frontend/src/domain/validation.ts):

- Capital expenditure remains **fixed at every adoption level**; it is never annualised away.
- Overlapping interventions **never sum**. Only compatible measures on different emission
  sources combine, verified symmetrically.
- A new factory starts as **Awaiting baseline** with no coordinates, emissions, rank, or
  recommendation.
- The portfolio ledger **deduplicates** by factory and source, retaining the largest
  reduction and its matching savings.
- Export exposure applies to steel and cement only, and reports gross scenarios rather
  than tax liability.

### Reference constants

Fixture-dated 01 February 2026, and not live quotations: EUR 75 per tCO2, INR 90 per EUR,
credits INR 600–1,500 per unit, grid factor 0.000716 tCO2e/kWh, coal 2.42 tCO2e/tonne,
mixed waste 0.45 tCO2e/tonne.

## 5. Pitch deck compared with the current build

The deck describes the target product. The table below states, without embellishment, what
the repository implements today.

| Deck claim | Status in this repository |
| --- | --- |
| React, Leaflet, OpenStreetMap frontend | **Implemented.** D3.js is not used; Recharts covers the charting need |
| Python FastAPI REST services | **Foundation only.** `backend/server.py` exposes health endpoints; the application never calls it |
| Vision model with OCR fallback | **Simulated.** `domain/extraction.ts` supplies three editable fixture samples, and the Intake screen discloses that no document content is read |
| scikit-learn ranking model | **Not implemented.** Ranking is a deterministic, rule-based sort over fixture data |
| Cloud PostgreSQL with PostGIS | **Not implemented.** No persistence layer; the FastAPI stub pings MongoDB only |
| 62,868 tCO2 avoided and INR 58.58 crore saved across 345 MSMEs | **External benchmark, not product output.** The build ships 12 illustrative factories, and every export is labelled "illustrative estimate only" |
| CCTS credit generation, 490 obligated entities, EUR 87–90 per tonne at the EU border | **Contextual market references.** Credit figures in the application are conditional illustrations, never issuance |

**Nothing in this repository is registry verified, and no credits, revenue, or realised
savings are created.**

## 6. Running the project

### Prerequisites

- Node.js 20 or later with Yarn 1.22
- Python 3.11 or later (only if the backend foundation is required)

### Frontend

Create `frontend/.env`. Vite fails fast when these variables are absent:

```bash
cat > frontend/.env <<'EOF'
REACT_APP_BACKEND_URL=http://localhost:8001
FRONTEND_HOST=0.0.0.0
FRONTEND_PORT=3000
FRONTEND_ALLOWED_HOSTS=localhost,127.0.0.1
EOF
```

Then install and start the application:

```bash
cd frontend && yarn install && yarn start
```

| Command | Purpose |
| --- | --- |
| `yarn start` | Vite development server on `FRONTEND_PORT` |
| `yarn build` | TypeScript check (`tsc --noEmit`) followed by a production build |
| `yarn test` | Vitest unit suite over `src/domain` |

### Backend (optional)

```bash
cd backend && pip install -r requirements.txt && uvicorn server:app --port 8001
```

Requires `MONGO_URL`, `DB_NAME`, and `CORS_ORIGINS` in `backend/.env`. The frontend
functions fully without it.

## 7. Testing

- **Unit** — 16 Vitest cases over scenario mathematics, compatibility, portfolio
  deduplication, and CSV injection escaping: `frontend/src/domain/calculations.test.ts`.
- **Fixture invariants** — `validateFixtures()` asserts unique identifiers, hotspot totals
  matching baselines, twelve-month history sums, coordinate bounds, and symmetric
  intervention compatibility.
- **Backend** — `backend/tests/test_health.py` verifies both health endpoints, skipping
  when `REACT_APP_BACKEND_URL` is unset.
- **Automated UI sweeps** — `test_reports/iteration_1.json` (55 of 55 checks) and
  `test_reports/iteration_2.json` (all core flows across the nine routes), with
  screenshots in `test_reports/screenshots/`.

Run the frontend suite:

```bash
cd frontend && yarn test
```

## 8. Privacy and data handling

- No account, authentication, or credential storage exists.
- Document uploads capture the **file name and size only**. Contents are never read,
  parsed, or transmitted.
- An optional OpenRouter API key is held in memory for the session, never persisted, and
  never sent to a Leakpoint server.
- Session state clears on refresh, which restores the demonstration dataset.

## 9. Roadmap

Sequenced to close the gap in section 5:

1. Replace simulated extraction with a vision model and an OCR fallback for bills, meters, and manifests.
2. Introduce PostgreSQL with PostGIS, and move fixtures behind FastAPI endpoints.
3. Train the scikit-learn ranking model on cluster outcome data, replacing the rule-based sort.
4. Integrate the CEA CO2 baseline as a live benchmark rather than a fixture constant.
5. Add the Track stage: milestone monitoring, adoption verification, and realised-impact reconciliation.
6. Raise Lighthouse accessibility to 95 or above on the Command Map and Data Intake screens.

## 10. Disclaimer

Leakpoint is a hackathon demonstration. All emissions, savings, exposure, payback, and
credit figures are illustrative estimates produced from dated fixtures and simplified
assumptions. They do not constitute an emissions inventory, a CBAM tax assessment, a
verified reduction claim, financial advice, or an offer to sell carbon credits.
Site-specific engineering and independent verification remain mandatory before any
investment decision.
