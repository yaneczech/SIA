# Figure remediation plan (0.3 → 0.4.0)

Working note, not part of the published specification. Tracks what each figure in
[`../figures/`](../figures/) needs to match the 0.4.0 contract, and proposes an
interactive diagram that cannot drift from the spec again.

The checked-in Mermaid blueprints for the four outstanding redraws are in
[`../figures/REDRAW_REFERENCE.md`](../figures/REDRAW_REFERENCE.md). Use those as
the editable semantic source when producing replacement vector or raster artwork.

Status legend: ✅ accurate · ⚠️ structure fine, labels stale · ❌ conceptually behind 0.4.0.

## Per-figure verdict and fix

### fig2-stack-position.png — ✅ keep as is
Layer stack (Occupant → HMI surfaces → SIA layer → SDV stack → Data model →
Middleware → Hardware) still holds. The SIA-layer sub-labels (Ontology Language,
Translation, Interaction Coordination Runtime, Context Policy, Trust Policy) are
current. No change needed. Already embedded in the interactive docs overview.

### fig4-node-taxonomy.png — ⚠️ swap two family labels
Taxonomy tree (Interaction → Event{Alert, Notification}, Action, State, Task) is
correct; 0.4.0 emits only Alert and Notification. Only the per-family metadata
callouts are 0.3 vocabulary:
- Alert box: `requires_ack` → replace with `occupant_response` (kind · authority · timeout).
- Notification box: `suppression_class · merges_with` → replace with `context_policy.on_blocked`
  (disposition: drop · defer · coalesce).
- Leave Action/State/Task example IDs; mark the three as "reserved for future profiles".

### fig1-complexity-comparison.png — ⚠️ redraw the box contents, keep the layout
The N×M vs N+M story is timeless; only the "With SIA" column's inner labels are stale.
- Trust box shows 4 checks → 0.4.0 has **eight** (envelope+payload, declaration digest,
  actor authority, signature, ingress freshness, nonce replay, revocation, semantic validity).
- Add a **Retention** concern (bounded hold: drop/defer/coalesce) — absent in 0.3.
- Split the single feedback concept into **delivery receipt** (machine) and
  **occupant response** (human), two loops.
- Context Policy axis list → 0.4.0 core axes (see fig3 fix).

### fig3-mediation-architecture.png — ❌ three substantive corrections
Most out of date. Redraw:
1. **Context axes.** Replace `SAE level · Vehicle state · Market jurisdiction` with the
   0.4.0 core six: `motion_state · operating_mode · energy_state · road_type · driver_state · occupancy`.
2. **Trust Policy.** Now verifies eight requirements (list or "8 checks · fail-closed").
3. **Feedback.** The single `render / input / ack` arrow becomes **two authenticated
   return loops**: renderer → Coordination Runtime = *delivery receipt*; occupant →
   Coordination Runtime = *occupant response* (opens only on `presented`).
   Add the intermediate **dispatch attempt** (ordered, deadline-bounded) on the outbound path.

### figA1-alert-flow.png — ❌ conceptually behind 0.4.0
The sequence "ADAS → Trust → Translation → Runtime → Renderers, ack/timeout straight back"
predates the split. Redraw as:
- Trust gate still the chokepoint before Translation (keep).
- Runtime dispatches an **ordered attempt** with a deadline ≤ semantic validity.
- Renderer returns a **delivery receipt** (received / presented / failed / timed_out).
- Only on delivery success does the **occupant-response** window open, returning a
  separate authenticated response or a runtime timeout — never one standing in for the other.

## Recommended approach: one interactive diagram, generated from the engine

The figures went stale because they are hand-drawn PNGs disconnected from the contract.
The demo already contains a **single source of truth** for the lifecycle and the trust
model — [`../demo/sia-engine.js`](../demo/sia-engine.js) plus the docs data tables in
[`../demo/docs.js`](../demo/docs.js). Reuse it instead of redrawing pixels.

### Option A (recommended) — interactive SVG bound to the engine
Build one `architecture-explorer` component (an SVG or CSS-grid diagram) whose nodes and
edges are **rendered from data**, not drawn by hand:
- Emitters, Trust (8 checks), Context (6 axes), Translation, Runtime, Renderers, and the
  two feedback loops as SVG groups.
- Hovering/selecting the Trust node expands the eight checks pulled from the same
  `trustChecks` array the docs already use — so the count can never disagree with the spec.
- The context axis chips come from the context-snapshot schema enum, read at build time.
- Clicking "Run the collision story" animates a token along the path using the **actual**
  `evaluateInteraction` / `coordinateDelivery` / `coordinateAcknowledgement` output, so the
  drawn flow is the computed flow.
- Ships in both docs (replaces the static fig3/figA1 embeds) and stays theme-aware and
  keyboard-navigable like the existing explorers.

Why: a CI test can assert "diagram lists exactly the 8 registered trust checks and 6 core
axes", making figure drift a build failure rather than a manual review catch.

### Option B — regenerate PNGs from a checked-in vector source
If static images are still wanted for the paper/PDF, keep a single editable source
(`figures/src/*.svg` or a small D3/mermaid definition) checked in, and export PNGs from it.
At minimum, add a test that greps the figure **captions** for the 0.4.0 terms so a stale
caption fails CI (cheap interim guard until the redraw lands).

### Done — Option A shipped for fig3 + figA1
The interactive `#architecture` section in [`../demo/docs.html`](../demo/docs.html) now
replaces the static mediation-architecture (fig3) and alert-flow (figA1) concepts with an
engine-bound diagram: emitter → trust (8 checks) → context (6 axes) → translation → runtime
→ renderers, plus the two return loops. The trust-check count, context axes, and output
surfaces render from `trustChecks`, `CORE_AXES`, and the engine's `RENDERERS`; the run
animation uses real `evaluateInteraction` / `coordinateDelivery` / `coordinateAcknowledgement`
output. [`../demo/architecture.test.mjs`](../demo/architecture.test.mjs) fails CI if the axes
diverge from the context-snapshot schema, a trust code is unregistered, or the renderer set
changes — so this diagram cannot drift.

Still open: static PNG redraw of fig1 (inner labels) and fig4 (two labels) for the
paper/PDF, per the specs above. The paper/appendix captions already flag their 0.3→0.4.0
deltas in the interim.

## Suggested sequence
1. figA1 redraw (highest teaching value, most misleading) — or fold into Option A.
2. fig3 redraw (six axes, eight checks, two loops).
3. fig1 inner labels; fig4 two labels.
4. Land Option A interactive diagram; retire fig3/figA1 static embeds from the docs.
