# SIA Versioning Policy

SIA separates three version axes ([Core Specification §3](./03_Core-Specification.md#3-version-identifiers)). This document defines how each one is allowed to change, so an adopter can predict the cost of staying current.

## `spec_version` — the wire contract

Semantic versioning with wire-frozen patches:

- **Patch (0.4.0 → 0.4.1):** clarifications and tooling only. No schema field is added, removed, or re-typed; every artifact valid before is valid after, and vice versa. Implementations MAY accept any patch within their supported minor.
- **Minor (0.4 → 0.5):** additive, explicitly negotiated capability. Because runtime envelopes are closed, new fields never arrive silently: a 0.5 feature is used only after both sides prove support. A 0.4 implementation never receives a 0.5 envelope it cannot parse — it rejects the unsupported `spec_version` and the sender falls back or does not send.
- **Major:** reserved for changes that alter the meaning of existing fields or lifecycle states. Avoided by design; none is planned.

Pre-1.0 caveat: 0.x minors may still break, as 0.4 broke the illustrative 0.3 schema ([§15](./03_Core-Specification.md#15-compatibility)). The rules above are the discipline 0.x is converging toward and become binding at 1.0.

## `catalog_version` — the semantic vocabulary

Follows the evolution rules of the position paper (§10):

1. New nodes and new optional declaration fields are additive.
2. A subclass may strengthen, never weaken, safety, attention, or trust requirements.
3. Deprecated nodes remain resolvable for a declared support window (`deprecated_since`, `replaced_by`).
4. Unknown critical nodes fail closed; unknown non-critical nodes degrade to their known parent or are suppressed.
5. A profile accepts an older catalog only when its compatibility table proves every referenced node is understood.

## Registries

Reason codes ([`registry/reason-codes.json`](./registry/reason-codes.json)) are append-only: a code is never reused with a different meaning and is deprecated rather than deleted. Unknown codes are treated as the failure outcome for their phase.

## Conformance vectors

Vectors are only added or corrected, never silently changed in meaning. A vector whose expectation changes gets a new `name`; the old one is removed in the same minor release that changes the underlying normative rule.
