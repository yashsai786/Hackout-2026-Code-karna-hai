# Demo script

Four minutes, one continuous story. The point to land is that **this is one system, not a set of
screens** — everything after step 2 is derived from what was typed in step 2.

```bash
./run.sh          # then open http://localhost:3000
```

Works offline. No API key needed for anything below except the optional Copilot section.

---

## 0 · Before you start (30 seconds, off-stage)

- Run `./run.sh` and leave it running.
- Open <http://localhost:3000>.
- If you want the Copilot section, paste an OpenRouter key into **Settings** first.
- If a previous run left data behind, clear it in Settings so the numbers below match.

---

## 1 · The problem (20 seconds)

> "India has about 63 million MSMEs. For an industrial SME the question isn't *what are my total
> emissions* — it's *which part of my process is leaking, and what do I do instead*. An audit costs
> lakhs and takes months, so most plants never get one."

Land on the **Command Map**. 15 plants, 4.28M tCO₂e, four sectors.

> "This is the view a decision-maker starts from. But the product isn't the map — watch what happens
> when a plant that isn't on it walks in."

## 2 · The moment that matters (90 seconds)

**Factories → + Add factory.** Name it, pick Steel, and you land on its profile. Enter a coal blast furnace:

| Field | Value |
| --- | --- |
| Sector / route | Steel / BF-BOF |
| Primary fuel | Coal |
| Production | 850,000 t |
| Plant age | 28 years |

Press **Estimate my split**.

> "This is the question the operator can't answer — *where is my carbon?* — and it's the one thing an
> audit is really for. A model trained on eight things any plant manager knows returns the split
> across thermal fuel, electricity, process and waste. It names the right primary hotspot for 90.9%
> of held-out plants. The lookup table we used before managed 78%."

Point at the on-screen disclosure:

> "And it says on the screen that it's an estimate from synthetic training data. Every figure in this
> product tells you how much to trust it."

Declare a material stream. **Save baseline.**

## 3 · Why the ranking is now different (45 seconds)

Go to **Interventions**.

> "These measures are ranked for *this* plant's hotspots. Reduction, operating savings, the return
> per year on the capital, and the capital itself — which scales with the size of the opportunity,
> not linearly, so a small mill isn't quoted a steelworks price."

Open one. Move the **adoption slider**.

> "Reduction, payback and a three-year cashflow recompute live. Nothing here is a static mock."

## 4 · The comparison that proves the model earns its place (45 seconds)

This is the strongest 45 seconds in the demo. Add a second steel plant — an **EAF** mini-mill,
electric, 120,000 t, 9 years old — and put the two side by side.

| Plant | Primary hotspot | Top recommendation |
| --- | --- | --- |
| BF-BOF, coal, 850,000 t, 28 yrs | thermal fuel, **57%** | waste-heat recovery |
| EAF, electric, 120,000 t, 9 yrs | electricity, **84%** | on-site solar |

> "Same sector. Before the model, both of these were handed an identical 50/20/27/3 split and an
> identical list of recommendations. That was the single thing stopping this from being useful, and
> it is not fixable with better arithmetic — the split isn't a function of anything the plant knows.
> That is why there's a trained model in this repository and not just a spreadsheet."

## 5 · Committing to it (20 seconds)

**Record to ledger** → **Ledger**.

> "Portfolio totals, CSV export, and every row marked as an estimate not verified by any registry.
> We'd rather be trusted than impressive."

## 6 · The Copilot (40 seconds, optional)

Open it, bottom right. Ask:

> *"Which plant should I fix first and why?"*

> "It's reading, not calculating. It has no calculator — it calls the same functions these screens
> call and reports what they return. It cannot invent a number because it never computes one, and
> every figure it quotes links to the screen that proves it."

Click a cited figure to jump to its source.

Then ask it to record something:

> "And it can't commit on your behalf — a write needs explicit confirmation."

## 7 · Close (20 seconds)

> "One command to run. Fifty-eight tests. Zero accessibility violations across ten routes. And CI
> retrains the model on every push — if it ever stops beating the lookup table it replaced, the build
> fails. Our central claim is a test, not a sentence in a README."

---

## Questions you will be asked

**"Is the model real, or is it a formula?"**
Real. `ai/train.py`, `HistGradientBoostingRegressor`, five heads, eight features, 8,000 plants, a 20%
held-out split, scored against the exact baseline it replaced. Retrain it live in thirty seconds.

**"Is the training data real?"**
No, and we say so everywhere — in the script, in the API response, in a test, and on screen. Real
plant-level Indian disclosures (BEE PAT, CEA) aren't redistributable. The synthetic fit doesn't prove
accuracy on real plants; it proves the model recovers structure the constant table can't, scored on
the same held-out plants. Swapping in real data means replacing one function.

**"What stops the LLM hallucinating a number?"**
It has no arithmetic. Its tools wrap the domain functions the screens use. Structure, not prompting.

**"What if the backend is down during the demo?"**
The app computes its own arithmetic and says the estimate is unavailable. Try it — pull the plug.

**"How much of this is real versus hardcoded?"**
Add a factory that isn't in the seed data and follow it through to a recorded ledger entry. Nothing
on that path is static.
