# SIA source-of-truth map

SIA keeps normative meaning, executable artifacts, and teaching surfaces separate. A value is authored in exactly one layer; downstream representations are generated or tested against it.

## Authority order

1. [`03_Core-Specification.md`](./03_Core-Specification.md) defines normative lifecycle semantics and invariants.
2. [`schema/`](./schema/) and [`registry/reason-codes.json`](./registry/reason-codes.json) define the machine-readable wire contracts and stable codes.
3. [`examples/v0.4.0/`](./examples/v0.4.0/) defines the signed executable `sia-minimal` profile material: catalog declarations, policy, registry, renderer capabilities, and lifecycle examples.
4. [`conformance/`](./conformance/) defines observable positive and adversarial outcomes.
5. The position paper, appendix, authoring guide, demo, and interactive documentation explain those sources; they do not create new normative values.

If two layers disagree, the earlier layer wins and the downstream layer is a defect.

## Traceability

| Concept | Authored source | Executable source | Derived consumers |
|---|---|---|---|
| Lifecycle and time semantics | Core Specification | invariant validator and schemas | paper, appendix, demo, docs |
| Artifact shape and enums | JSON Schema | validated examples | tools, generated demo profile |
| Node authority and timing values | signed catalog declarations | `examples/v0.4.0/catalog.json` | engine, Lab, docs excerpts |
| Context axes and modifiers | context schema and signed context policy | `core.context-policy.json` | engine, diagrams, Lab |
| Renderer capabilities | renderer-capability schema | signed `*.renderer.json` files | engine, diagrams, Lab |
| Reason codes | reason-code registry | conformance vectors | engine and UI labels |
| Cryptographic bindings | Core Specification §6 | signed examples and crypto vectors | validator and documentation excerpts |
| Human-readable labels | demo presentation maps | n/a | demo and interactive docs only |

## Generated demo data

[`tools/build-demo-profile.mjs`](./tools/build-demo-profile.mjs) reads the schemas and signed examples and writes [`demo/generated-profile.js`](./demo/generated-profile.js). The generated file is committed so the static site needs no build service, but it MUST NOT be edited by hand.

```bash
npm run build:demo-profile   # refresh after canonical artifacts change
npm run check:demo-profile   # fail if the committed projection is stale
```

`npm test` runs the stale check, validates every published artifact, verifies signatures and digests, and checks cross-artifact invariants. Human-readable prose is additionally covered by focused consistency assertions, but prose remains explanatory rather than authoritative.

## Version boundary

The repository publishes one version: **0.4.0 – pre-standard draft**. Clarifications and tooling repairs remain part of that draft until a complete replacement bundle is deliberately released. Documentation, schemas, signed examples, conformance material, and demo MUST NOT advertise independent SIA versions. Machine-readable deployment latency, overload, session, or real-time contracts require a future negotiated release bundle rather than a silent change to 0.4.0.
