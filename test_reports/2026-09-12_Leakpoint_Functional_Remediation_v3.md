# Leakpoint — functional remediation against the problem statement

**Date:** 12 September 2026 · **Version:** 3 · **Supersedes:** the v1 test report and v2 UI fixes

## Executive summary

An 11-agent audit scored the software clause by clause against the official problem statement and the
pitch deck, with an adversarial pass that refuted weak findings. It concluded that the product
satisfied **one** of five substantive clauses, and that a single severed seam explained most of it:
**no code path could ever write `Factory.baseline`**, so a judge who entered their own factory hit a
permanent dead end that four screens promised to resolve.

Every ship blocker is now fixed, the AI/ML clause is met with a real model, and the claims have been
brought back into line with what actually runs.

| | Before | After |
| --- | --- | --- |
| A new factory can get a baseline | **impossible** | Yes, via a dedicated page |
| Two same-sector plants get different advice | **never** | Yes, driven by a trained model |
| AI/ML in the product | none | scikit-learn model, served over FastAPI |
| Data survives a reload | no | Yes, with a reset control |
| Frontend tests | 16 | **41** |
| Backend tests | 2 (health only) | **6** (contract + model behaviour) |
| WCAG 2.1 A/AA violations across all routes | 0 | **0** (11 routes, including 2 new) |

## Ship blockers fixed

**1. No write path to a baseline.** `addFactory` wrote `baseline: null` and nothing could ever set
it, so `scenario()` threw for every user-created factory. Added `updateFactory` to the session and a
new route `/factories/:id/profile` that captures annual production, per-source activity with factors
and unit costs, material streams, export share and coordinates, then derives hotspots, costs,
baseline, history, confidence and readiness. `NewFactory` now lands there, and all four
awaiting-baseline calls to action point at it.

**2. Intake was write-only.** Source records went into an isolated array that changed no number
anywhere. The profile page now prefills from confirmed records (annualising monthly quantities), and
the Intake success screen states coverage and offers "Set the baseline" as its primary action.

**3. Every same-sector factory received identical advice.** Hotspots came from a constant table keyed
on sector, so all twelve factories collapsed to four ranked lists. Fixed by the model below, and by
replacing flat capex with a scale curve — a 58,000 tCO2e mill was being quoted the same ₹12 crore as
an 842,000 tCO2e steelworks.

**4. Cost units were inconsistent, and the penalty landed on the only circular measure.** `waste`
and `fuel` costs applied a rupees-per-tonne rate to tonnes of CO2, so Bhilai displayed 56,133 waste
tonnes beside a cost implying ₹63/tonne while the Intake screen quoted ₹1,400/tonne. Now every source
is converted to its physical unit before pricing, rates are shared with the extraction samples so the
two cannot drift, and a regression test pins it. Waste recovery at Bhilai moved from a 50.9-month
payback to roughly 21.

**5. Materials, one third of the stated input triple, did not exist.** `Factory` gained
`MaterialStream[]`; fixture tonnages are computed from each factory's own production rather than
hand-written; the profile page captures them; and a new circular measure, **recycled feedstock
substitution**, is gated on a declared stream through a single shared `eligibleFor` rule.

**6. Three visible truth defects.** A hardcoded "Twelve starting points" beside a live count; a map
call to action that dropped the selected factory; a Credits selector that omitted the
"Awaiting baseline" suffix every other selector carries.

## The machine learning

**What it predicts.** The split of annual emissions across thermal fuel, electricity, process and
waste, plus emissions intensity — from what an operator can actually answer: sector, process route,
primary fuel, grid region, annual production, energy spend, plant age, headcount. None of those
determines the answer outright, so this is genuine supervised learning rather than arithmetic.

**How good.** `HistGradientBoostingRegressor`, one head per share, normalised. Held-out mean absolute
share error **0.028 against 0.093** for the constant sector table it replaces — **70.1% closer**.
`python backend/train.py` reprints the comparison.

**Trained on what — state this on stage.** Plant-level Indian disclosures (BEE PAT, CEA, India GHG
Programme, CDM/Gold Standard PDDs) are the right source but are not redistributable and were not
assembled in the window. The shipped model is fitted on a **synthetic cohort of 8,000 plants** built
from published per-tonne intensity ranges and process archetypes. The API returns
`training: "synthetic"`, the UI repeats it beside every prediction, and the README explains it. A
disclosed synthetic fit survives questioning; an undisclosed one does not.

**Proof it changes the product.** Two steel plants, same sector, genuinely different advice:

| | Bhilai (BF-BOF, 842k tCO2e) | Raipur Mini Mill (EAF, 128.5k tCO2e) |
| --- | --- | --- |
| Top hotspot | Thermal energy 50% | **Electricity 78%** |
| Recommendations | waste-heat, solar, boiler | **solar, motor-efficiency, waste-recovery** |

Before this work both received an identical split and an identical ranked list.

## Also delivered

- **Persistence.** Factories, ledger, intake and inbox survive a reload via `localStorage`, with a
  "Reset demonstration data" control in Settings. Verified by hard reload.
- **Copilot parity.** The assistant can see material streams and route a user to the profile page,
  so it is not stranded on the journey that now matters most.
- **Alerts honesty.** Three preference toggles that were read nowhere have been removed.
- **Claims corrected.** The README now states plainly that vision extraction and PostgreSQL/PostGIS
  are not implemented, and that the benchmark figures are sector context rather than product output.

## Deliberately not done

- **Merging `/alerts` into `/ledger`.** The audit recommended it; removing the inert toggles achieves
  the honesty benefit at a fraction of the late-stage risk. The merge remains a sound follow-up.
- **Consultant and regulator roles.** No ownership or client scoping exists. Two of the four user
  types in the brief are unserved, and the pitch should say so rather than imply otherwise.
- **Real document extraction.** Intake remains a simulated flow and discloses that on screen.

## Verification

- `yarn build` — TypeScript strict passes; Copilot and every route code-split.
- `yarn test` — **41 passing**, including unit consistency, the capex invariant and its scaling,
  material gating, tool-executor agreement with the screens, and SSE parsing.
- `pytest` — **6 passing**, including that the model beats the sector table and that changing the
  process route changes the prediction.
- axe-core across **11 routes** plus the Copilot panel and dialogs: **0 violations**.
- Full demo rehearsal driven in a real browser: new factory → estimate split → declare materials →
  save baseline → ranked costed recommendations → circular scenario → ledger. **Zero JS errors.**

## One caught regression, disclosed

Adding the sixth intervention blanked four routes: it had no entry in the icon map, so React rendered
`undefined`. Caught by a render probe during the accessibility sweep — note that axe reported "0
violations" on the crashed pages, which is exactly why a render check runs alongside it. Fixed, and
icon lookups now fall back rather than throw.
