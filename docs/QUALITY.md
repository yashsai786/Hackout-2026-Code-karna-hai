# Quality evidence

What was tested, how, and what it found. Every figure here is reproducible with the commands given.

## Summary

| | Result | Reproduce |
| --- | --- | --- |
| Frontend tests | **70 passing** | `cd frontend && npm test` |
| Model tests | **7 passing** | `cd ai && python -m pytest` |
| API contract tests | **27 passing** against a live service (MongoDB as the store), including an independent recomputation of every displayed figure | `cd backend && LEAKPOINT_API_URL=http://127.0.0.1:8001 python -m pytest` |
| Accessibility | **0 WCAG 2.1 A/AA violations** across 11 routes | axe-core 4.10 in-browser |
| Types | `strict: true`, clean | `cd frontend && npm run typecheck` |
| Formatting | Prettier clean | `cd frontend && npm run format:check` |
| Clean-clone install | `npm ci` then `npm run build` succeeds | see below |
| Production bundle | `vite preview` of `dist/` on port 4173 against the live API: 11 routes render, alerts computed, clean console | `cd frontend && npm run build && npm run preview` |

All of it runs in CI on every push.

## What the tests actually assert

Test count is a weak signal, so here is what the tests are for.

**`frontend/src/domain/calculations.test.ts`** — the arithmetic the product's credibility rests on:
scenario compatibility rules, capex scaling, ROI, credit potential, portfolio de-duplication across
overlapping scenarios, CSV injection escaping, and the invariants in the fixture data.

**`frontend/src/copilot/tools.test.ts`** — the Copilot's tool contracts: that `runTool` never throws,
that unknown or malformed arguments return described failures rather than exceptions, and that a
ledger write is refused without a valid confirmation token.

**`ai/tests/test_model.py`** — model behaviour, not model numbers. Shares form a valid distribution;
the artefact declares its own provenance; unseen categories degrade instead of crashing; and two
assertions that guard the product's central claim:

```python
def test_two_steel_plants_get_materially_different_splits(bundle):
    """The sector table gave these two identical advice. They are not alike."""
```

```python
def test_it_names_the_right_primary_hotspot_more_often(bundle):
    assert m["model_top_hotspot_accuracy"] > m["sector_table_top_hotspot_accuracy"]
```

CI additionally **retrains the model and fails the build** if the improvement over the sector table
drops below 50%. The claim in the README cannot rot silently.

## Defects these tests caught

Worth stating plainly, because tests that never fail prove nothing.

- **Displayed tonnage was rounded but its cost was not**, so two numbers on the same screen disagreed.
  Fixed by deriving cost from the rounded figure.
- **A new intervention blanked four routes.** Its icon lookup returned `undefined` and React rendered
  nothing. Notably, axe reported "0 violations" on the crashed pages — an empty page is perfectly
  accessible. A render probe now runs alongside every axe sweep for exactly this reason.
- **A capex test asserted a literal** rather than the invariant it meant, so it would have passed
  through a real regression. Rewritten to assert that capex is constant across adoption and scales
  sub-linearly with opportunity size.

## Accessibility

axe-core 4.10, tags `wcag2a, wcag2aa, wcag21a, wcag21aa`, run against the live app on every route.
The starting point was **36 violations**; it is now **0**, verified after the most recent changes:

| Route | Violations | Rendered |
| --- | --- | --- |
| `/` | 0 | ✓ |
| `/intake` | 0 | ✓ |
| `/factories` | 0 | ✓ |
| `/factories/:id` | 0 | ✓ |
| `/factories/:id/profile` | 0 | ✓ |
| `/interventions` | 0 | ✓ |
| `/interventions/:id` | 0 | ✓ |
| `/credits` | 0 | ✓ |
| `/ledger` | 0 | ✓ |
| `/alerts` | 0 | ✓ |
| `/analysis/:id` | 0 | ✓ |

"Rendered" is the render probe: the route must produce substantive text, so a crashed page cannot
pass as accessible.

Non-modal panels use the `inert` + `aria-hidden` + `.open` triad, so keyboard focus cannot land in a
closed drawer.

## Clean-clone verification

The failure mode that matters most for a hackathon submission is a repository that does not start.
Three defects were found and fixed by testing this explicitly:

1. **The frontend could not start from a clone.** `vite.config.ts` threw `Missing application
   environment` unless four variables were set, and the `.env.example` the README told you to copy
   was itself untracked. Every variable now has a working default.
2. **The backend could not install from a clone.** `requirements.txt` pinned a vendor package that is
   not on PyPI, so `pip install -r` failed before reaching the model. Twenty of thirty-one lines were
   never imported at all. Removed and split into `backend/` and `ai/` sets.
3. **The committed model could not be loaded.** The artefact was pickled by scikit-learn 1.6.1, while
   `scikit-learn>=1.4.0` resolves to 1.9.x today — so a fresh install produced a model that raised on
   unpickle, silently stripping the product of its machine learning. scikit-learn is now pinned
   narrowly, the artefact was retrained against that pin, and `run.sh` retrains automatically if the
   artefact ever fails to load.

Each was verified by deleting `node_modules` and the virtualenv and installing from the lockfiles.

## Manual walkthrough

The full path was driven end to end in a browser: add factory → estimate split → declare materials →
save baseline → ranked costed recommendations → record to ledger, with **zero console errors**.

Two steel plants were entered to confirm they receive materially different advice — the check that
the model is doing real work rather than decorating a lookup table.

Intake was exercised with a real two-row CSV bill: the API summed the "Units consumed (kWh)" column
to 185,000, read the amount and billing period, showed the evidence for each, and the confirmed
record was read back from `GET /api/v1/state` — server-side, not from the browser.

OCR was exercised with a rendered photo of a coal register: the local engine (RapidOCR on ONNX
Runtime, no system binary, no network) read four lines at 98% mean confidence and the extractor took
420 MT and ₹3,444,000 from them. A scanned, image-only PDF is rasterised and read the same way; both
are contract tests.

## Every figure recomputed independently

`backend/tests/test_arithmetic.py` imports nothing from the frontend or the domain layer. It rebuilds
each number from the raw inputs the API exposes — state, reference table, catalogue — using the
formulas in `docs/ARCHITECTURE.md`, and compares with what the API reports: the cost model's unit
consistency for all twelve plants, every ledger record against the scenario formula, the flagship
Bhilai figures (75,780 tCO₂e, ₹191,941,271 six-tenths capex, 9.06-month payback, 132% return, 53,046
credit units, ₹1,023,030,000 CBAM exposure), the model's split summing to one, declared-vs-model
deltas and flags, percentile interpolation, what-if percentages and the computed CBAM alert. Fifty-four
checks; all agree. It runs in CI against the live service, which now serves the seed dataset itself.

## AI surfaces, verified live

With an OpenRouter key connected (`cohere/north-mini-code:free`, a small model chosen to be
unforgiving), each surface was driven from the UI:

- **Copilot, four tool-using turns in one conversation** — compare two plants, navigate to the worst
  cement plant, portfolio starting point with cost, then a ledger write with its confirmation step.
  Every figure quoted was a tool result; the write appeared in MongoDB.
- **Command bar model fallback** — "the plant that makes alloys" (no rule matches) → the model
  answered `{"action":"factory","factory":"angul-aluminium"}` and the map selected Angul.
- **AI analysis → Narrate with the Copilot** — confirmed the page's figures it could check with
  tools and said plainly which it could not (the peer benchmark and what-ifs have no tool).

Three defects this found, all fixed:

1. `capHistory` could cut the conversation window between an assistant's `tool_calls` and their
   results; strict providers rejected every later request ("tool call id not found"). It now cuts
   only at a user turn, and a test sweeps every cut point.
2. On a provider error the wire history had its tool results stripped but not the calls that
   declared them, so one transient failure poisoned the rest of the conversation. The last valid
   history is now left untouched.
3. A reasoning model spent the command bar's 120-token budget before emitting its JSON and returned
   nothing. The cap is 400 and an empty reply is handed to the Copilot instead of dead-ending.

And one structural addition: every answer is scanned for numbers no tool returned in the
conversation; any such figure is shown beneath the answer as the model's own arithmetic. The first
live run produced exactly one — "~112%" — which is what the check exists to catch.

## What is still authored rather than measured

Stated so a judge does not discover it. The 12 seed plants, their annual figures and the three seed
ledger records are authored starting points, persisted in MongoDB and editable like anything added
later. The measure catalogue is authored engineering assumptions, served from the API. The monthly
chart is a modelled profile of the annual baseline and its caption says so. The model is trained on a
synthetic cohort. Nothing else on any screen is a constant: factors, catalogue, alerts, state and
settings all come from the API at run time.

## Deliberately not done

- **No end-to-end browser test suite.** Time went to the domain layer, where a wrong number does more
  damage than a broken click path.
- **No load testing.** The API serves one model on one machine; concurrency is not a claim being made.
- **No real-data validation of the model.** Not possible with redistributable data. Stated plainly in
  [`ai/README.md`](../ai/README.md) rather than papered over.
