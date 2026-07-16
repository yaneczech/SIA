# SIA Conformance Vectors

Language-neutral test vectors for SIA 0.4.0. Each vector is one entry in
[`vectors.json`](./vectors.json):

| Field | Meaning |
|---|---|
| `name` | Stable identifier of the vector. |
| `contract` | Schema file in [`../schema/`](../schema/) the artifact is validated against. |
| `classes` | Conformance classes that MUST pass this vector: `emitter`, `renderer`, `runtime`. |
| `expect` | `valid` or `invalid` — the required validation outcome. |
| `base` | Optional file in [`../examples/v0.4/`](../examples/v0.4/) used as the starting artifact. |
| `patch` | Optional [RFC 7386 JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7386) applied to `base`. |
| `operations` | Optional RFC 6902 `replace` or `copy` operations for addressable array mutations. |
| `artifact` | Inline artifact, used when there is no `base`. |
| `semantic` | When `true`, also evaluate the normative cross-artifact invariant set against the published dependency bundle. |
| `reason` | Human explanation of what the vector proves. |

To run a vector: resolve the artifact (`base` + `patch` + `operations`, or
`artifact`), validate it against the `contract` schema in JSON Schema 2020-12
strict mode, apply semantic invariants when requested, and compare the combined
outcome with `expect`. Schema-valid but semantically contradictory artifacts are
`invalid`. RFC 7386 objects merge recursively, `null` deletes a member, and
everything else replaces.

Reference runner: `npm run conformance` (see [`../tools/conformance.mjs`](../tools/conformance.mjs)).
An implementation claims a conformance class only if it passes every vector tagged
with that class, in addition to the class requirements in
[`../03_Core-Specification.md`](../03_Core-Specification.md) §16.
