# SIA Interaction Lab

Interactive dark-mode explainer and test harness for the Minimal SIA Profile 0.4 node catalog (`Alert.Collision.Warning` plus three `Notification` nodes).

The demo exercises the normative SIA 0.4 lifecycle: applicability, bounded retention, context-change re-evaluation, renderer delivery receipts, delivery-success policies, and their separation from occupant response.

```bash
cd demo
npm test
npm start
```

Then open <http://localhost:4173>. The decision model is isolated in `sia-engine.js`; the UI uses the same functions as the automated tests.

The demo covers: the ontology declaration itself, trust verification (closed envelope, actor class, signature, ingress freshness, replay), a full trust matrix across actor classes and node types, applicability versus temporary blocking, context-aware renderer selection, a computed attention budget (`base × road/driver modifier` vs. per-renderer glance budget), capability-based renderer rejection, fail-closed trust rejection, declared blocked dispositions (`drop`, finite-TTL `defer`, latest-state `coalesce`, and `never_block`), context-change re-evaluation of retained state, reserved-field injection rejection, renderer fallback, authenticated renderer delivery receipts (`received`, `presented`, `failed`, and runtime timeout), delivery-success policies, separate occupant response and response timeout, and the combined audit outcome.
