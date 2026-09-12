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
| `/factories/:id/profile` | **Process & Baseline** | Enter production, per-source activity, factors, costs and material streams; optionally estimate the split with the model. This is what turns a new factory into an analysable one |
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
  src/pages/            10 route components, including the process & baseline page
  src/components/       Shell, FactoryMap, CommandBar, Charts, shadcn/ui primitives
  src/domain/           Types, fixtures, calculations, extraction, digest, commands, validation
  src/copilot/          Grounded tool registry, agent loop and system prompt for the Copilot
  src/state/            Session, UI, and settings React contexts (in memory only)
  src/lib/openrouter.ts Optional session-only OpenRouter key validation and model listing
backend/                FastAPI service
  server.py             health, model card, and the hotspot prediction endpoint
  train.py              fits the model, prints held-out error against the sector-table baseline
  models/               hotspots.joblib + metrics.json (committed so the demo runs offline)
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
| Backend | Python FastAPI serving the hotspot model (`/api/v1/hotspots`, `/api/v1/model`) |
| Machine learning | scikit-learn `HistGradientBoostingRegressor`, artefact in `backend/models/` |
| Storage | Browser `localStorage`; a reset control in Settings restores the demonstration dataset |

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

| Deck claim | Status |
| --- | --- |
| React, Leaflet, OpenStreetMap frontend | **Implemented.** D3.js is not used; Recharts covers the charting need |
| Python FastAPI REST services | **Implemented.** `POST /api/v1/hotspots` serves the model, `GET /api/v1/model` returns its card |
| scikit-learn model | **Implemented, with one honest caveat.** A `HistGradientBoostingRegressor` predicts the emission split from plant attributes. It is fitted on a **synthetic** cohort (see below), which is stated in the API response, on screen, and here |
| Vision model with OCR fallback | **Not implemented.** Intake extraction is a simulated flow over editable sample fixtures and says so on screen. Do not claim photo extraction on stage |
| Cloud PostgreSQL with PostGIS | **Not implemented.** Session state persists to browser `localStorage`; there is no server database and nothing geospatial |
| 62,868 tCO2 avoided and INR 58.58 crore saved across 345 MSMEs | **External benchmark, not product output.** Present it as sector context, never as something this build produced |
| CCTS credit generation, EUR 87–90/t at the EU border | **Contextual references.** Credit figures in the app are conditional illustrations, never issuance |

### The machine learning, stated plainly

**What it does.** Until now the split of emissions across thermal fuel, electricity, process and
waste came from a constant table keyed on sector alone, so every steel plant in the country received
an identical breakdown and therefore identical advice. The model predicts that split from what an
operator can actually answer — sector, process route, primary fuel, grid region, annual production,
energy spend, plant age, headcount — none of which determines the answer outright. That is a real
supervised learning problem, not arithmetic in disguise.

**How good it is.** Held-out mean absolute error per share, against the constant sector table it
replaces:

| | Model | Sector table |
| --- | --- | --- |
| Mean share MAE | **0.036–0.015 (mean 0.028)** | 0.093 |

That is **70.1% closer** than the table. Reproduce with `python backend/train.py`, which prints the
comparison and writes `backend/models/metrics.json`.

**What it was trained on — read this before presenting.** The right training source is plant-level
Indian disclosure (BEE PAT designated-consumer filings, the CEA CO2 baseline database, India GHG
Programme inventories, CDM and Gold Standard PDDs). That data is not redistributable and was not
assembled in the hackathon window. The shipped model is therefore fitted on a **synthetic cohort of
8,000 plants** generated from published per-tonne intensity ranges and process
archetypes with plant-to-plant variation. The API returns `training: "synthetic"`, and the app says
so wherever a prediction is shown. A disclosed synthetic fit survives questioning; an undisclosed
one does not.

## 6. Running the project

### Prerequisites

- Node.js 20 or later with Yarn 1.22
- Python 3.11 or later (only if the backend foundation is required)

### Frontend

Copy the tracked example. Vite fails fast when any of these variables are absent:

```bash
cp frontend/.env.example frontend/.env
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
cd backend && pip install -r requirements.txt
python train.py          # fits the model and prints its held-out error; writes models/hotspots.joblib
uvicorn server:app --port 8001
```

Copy `backend/.env.example` to `backend/.env`. MongoDB is optional and unused by the
application. **The frontend works fully without the backend** — the estimator is an optional
assist and every other figure is computed in the browser.

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

## 9. What is left

1. Replace the synthetic training cohort with real plant-level disclosures and re-fit.
2. Real document extraction for the Intake stage, replacing the simulated flow.
3. Server-side persistence and multi-user accounts; today the session lives in one browser.
4. Roles for the consultant and regulator users named in the brief — today everything is
   single-operator.
5. Calibrate the capex scale exponent against realised project costs rather than the six-tenths rule.

## 10. Disclaimer

Leakpoint is a hackathon demonstration. All emissions, savings, exposure, payback, and
credit figures are illustrative estimates produced from dated fixtures and simplified
assumptions. They do not constitute an emissions inventory, a CBAM tax assessment, a
verified reduction claim, financial advice, or an offer to sell carbon credits.
Site-specific engineering and independent verification remain mandatory before any
investment decision.
