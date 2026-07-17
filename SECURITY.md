# Security Policy

This policy applies to **SIA 0.4.0 — pre-standard draft**. Its trust model is the core of the proposal, so
security review is explicitly invited.

## Reporting

Report suspected vulnerabilities, spoofing paths, or spec-level security flaws to
**dizencz@gmail.com**. Please include the affected contract or specification
section and, where possible, a conformance-vector-style reproduction (see
[`conformance/README.md`](./conformance/README.md)).

There is no production deployment of this repository; coordinated disclosure
timelines are therefore short. Reports are acknowledged within 7 days.

## Scope

In scope: the normative contracts in [`schema/`](./schema/), the lifecycle and
trust requirements in [`03_Core-Specification.md`](./03_Core-Specification.md),
the reason-code registry, the conformance vectors, and the reference tooling in
[`tools/`](./tools/).

Out of scope: the interactive demo's visual layer, and platform security of any
host system (see the threat model's non-goals in
[`04_Threat-Model.md`](./04_Threat-Model.md)).
