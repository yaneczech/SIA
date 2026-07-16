# SIA Interaction Lab

Interactive dark-mode explainer and test harness for the five-node Minimal SIA Profile 0.4 catalog: collision and lane-departure Alerts plus three Notifications.

The demo exercises the normative SIA 0.4 lifecycle: applicability, bounded retention, context-change re-evaluation, renderer delivery receipts, delivery-success policies, and their separation from occupant response.

```bash
cd demo
npm test
npm start
```

Then open <http://localhost:4173>. The decision model is isolated in `sia-engine.js`; the UI uses the same functions as the automated tests.

The demo covers: the ontology declaration itself; all eight trust checks (closed envelope, declaration digest, actor authority, signature, ingress freshness, replay, revocation, and semantic validity); a catalog-derived trust matrix; orthogonal motion/operating/energy context; applicability versus temporary blocking; attention budgeting; capability rejection; all four blocked dispositions; deterministic re-evaluation; priority injection; ordered renderer fallback; delivery receipts (`received`, `presented`, `failed`, and runtime timeout); delivery-success policies; separate occupant response and timeout; and the combined audit outcome. Collision warning deliberately remains applicable while charging because external collision threats remain possible; lane departure demonstrates a genuine `not_applicable` stationary case.
