<img src="./figures/sia-logo.svg" alt="SIA" width="112" height="54">

# SIA Core Specification

**Version 0.4.0 — pre-standard draft · July 2026**

This document is the normative implementer contract for the Semantic Interaction Architecture. The position paper explains the motivation and architecture; this specification defines the interoperable behaviour.

## 1. Conformance language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** are to be interpreted as described in BCP 14 when, and only when, they appear in capitals.

An implementation conforms to SIA 0.4 only if it validates the applicable contracts in `schema/`, implements the lifecycle and invariants below, and passes the published conformance vectors.

## 2. Scope and profiles

SIA 0.4 standardises a narrow mediation boundary for typed interactions. The `sia-minimal` profile contains:

- node families: `Event.Alert` and `Event.Notification`;
- actor classes: `human_direct`, `adas`, `service`, `third_party_app`, `agent_local`, and `agent_cloud`;
- output renderers: cluster, IVI, and voice;
- core context axes: motion state, operating mode, energy state, road type, driver state, and occupancy;
- signed catalogs, context policies, and actor-credential registries;
- dispatch attempts, renderer delivery receipts, retention records, occupant responses, and audit records.

`Action`, `State`, and `Task` remain architectural types for future profiles and MUST NOT be emitted by a `sia-minimal` 0.4 implementation. In particular, 0.4 does not reuse the output-renderer delivery contract as a substitute for an input/execution contract for `Action`.

## 3. Version identifiers

Three version axes are intentionally separate:

| Identifier | Meaning |
|---|---|
| `spec_version` | Wire-contract and lifecycle version defined by this document. |
| `profile_id` + `profile_version` | A bounded conformance subset such as `sia-minimal` 0.4.0. |
| `catalog_version` | Version of the installed semantic-node catalog. |

Runtime instances MUST carry all three. An implementation MUST reject an unsupported `spec_version`. A profile MAY accept an older catalog only when its compatibility table proves that every referenced node and required feature is understood.

Unknown fields are not a compatibility mechanism. Normative runtime envelopes use closed schemas. New behaviour-changing fields require a compatible profile revision or an explicitly negotiated feature.

## 4. Contract set

SIA 0.4 defines the following machine-readable contracts:

| Contract | Purpose |
|---|---|
| `catalog.schema.json` | Versioned collection of semantic declarations. |
| `actor-registry.schema.json` | Signed actor credentials, authority classes, validity, and revocation state. |
| `context-policy.schema.json` | Signed axis freshness, confidence, unknown-handling, and attention rules. |
| `interaction-node.schema.json` | One declarative Alert or Notification node. |
| `runtime-instance.schema.json` | Emitted payload plus immutable identity and attestation. |
| `context-snapshot.schema.json` | Provenanced inputs used for one policy decision. |
| `renderer-capability.schema.json` | Attested renderer capabilities and safety assurance. |
| `retention-record.schema.json` | Drop, defer, coalesce, supersede, expiry, or release evidence. |
| `render-plan.schema.json` | Deterministic renderer selection and rejection reasons. |
| `dispatch-attempt.schema.json` | One ordered, authenticated attempt to dispatch a plan to a renderer. |
| `delivery-receipt.schema.json` | Machine evidence for received, presented, failed, or timed-out output. |
| `occupant-response.schema.json` | Separate human acknowledgement or runtime response timeout. |
| `audit-record.schema.json` | Hash-linked decision evidence. |

Payload schemas are node-specific. A declaration MUST bind its payload contract by both reference and SHA-256 digest. A runtime MUST validate the payload before Trust Policy accepts the instance.

A payload reference uses the URI form `sia:payload:<name>:<major>` and resolves to `schema/payloads/<name>.v<major>.schema.json` in the catalog distribution. Every SIA artifact digest, including payload, declaration, catalog, policy, registry, credential, and audit-record digests, is SHA-256 over the RFC 8785 (JCS) canonical form of the complete referenced JSON document, encoded as lowercase hex. Digests over raw file bytes are non-conformant because formatting would change identity.

## 5. Normative lifecycle

An instance follows this state model:

```text
received
  ├─ trust_rejected
  └─ verified
       ├─ not_applicable
       ├─ dropped
       ├─ held ─┬─ superseded
       │         ├─ expired
       │         └─ released → planned
       └─ planned → dispatch_attempted ─┬─ fallback_attempted ─┐
                                       ├─ delivery_failed     │
                                       └─ presented ←─────────┘
                           ├─ closed
                           └─ awaiting_occupant
                                ├─ acknowledged → closed
                                └─ response_timed_out → closed
```

Every terminal transition MUST emit an audit record. A retained instance is not closed while it is `held`. The absence of a render request or delivery receipt for a held instance is intentional and MUST NOT be reported as delivery failure.

Implementations MUST use stable reason codes for state transitions. The normative code set is published in [`registry/reason-codes.json`](./registry/reason-codes.json); codes are never reused with a different meaning and are deprecated rather than deleted. A consumer that encounters an unknown code MUST treat it as the failure outcome for its phase and MUST NOT relax any policy because of it. Human-readable explanations MAY be localised, but MUST NOT replace the machine reason code.

## 6. Trust and runtime authority

Node declarations, not runtime payloads, are authoritative for priority, actor permissions, context handling, presentation, and occupant-response policy.

The installed catalog, actor registry, and context policy MUST each be authenticated from a deployment trust anchor before use. A runtime instance MUST bind the exact signed catalog and declaration digests plus the exact actor-registry and credential digests used at acceptance. A declaration and every derived lifecycle artifact MUST bind the signed context-policy identity, version, and digest. A signature from a known key is insufficient when its credential is expired or revoked.

A runtime instance MUST NOT contain a top-level priority, renderer, suppression, retention, or acknowledgement override. Closed envelope validation MUST reject such fields before semantic processing. Rejection is preferred to silently ignoring a security-relevant override because it preserves attack evidence.

Trust Policy MUST verify:

1. the canonical runtime envelope and node-specific payload schema;
2. the declaration digest referenced by the instance;
3. actor class and actor identity against `permitted_actor_classes`;
4. signature or verified session authenticator;
5. ingress age against `max_ingress_age_ms`;
6. nonce replay protection;
7. current key and session revocation status;
8. semantic validity at the time of acceptance.

An instance `target_role` MUST equal the declaration role, except that `any_occupant` MAY be narrowed to one currently occupied role. It MUST NOT be widened or retargeted. An unknown node ID, duplicate node ID in a catalog, unresolved policy reference, or any digest mismatch MUST fail closed before Translation; a runtime MUST NOT reinterpret an unknown node as a known parent.

Replay protection is scoped: a nonce MUST be unique per `(actor_id, key_id)` within the node's `max_ingress_age_ms` window extended by the permitted clock skew. The replay cache MUST be bounded; on overflow the verifier MUST fail closed for new emissions from the affected identity and emit an audit record, rather than silently forgetting old nonces.

The canonical signing representation is RFC 8785 (JSON Canonicalization Scheme). The signing input for an artifact is its JCS serialization with the `signature` member removed from its evidence block (`attestation.signature`, `integrity.signature`, or `evidence.signature`); the signature is computed over the UTF-8 bytes of that serialization. The algorithm profile is fixed to the identifiers enumerated by the schemas (`ES256` in JOSE raw `r||s` encoding, `EdDSA`, `HMAC-SHA-256`). A deployment MAY restrict this set further, but MUST NOT accept algorithm identifiers outside it, and MUST NOT accept `none` for any artifact other than a runtime-issued timeout event.

Every signed example in `examples/v0.4/` carries a real signature verifiable with the published test keys; the cryptographic conformance vectors — including tamper, wrong-key, and algorithm-confusion rejections — are in [`conformance/crypto/`](./conformance/crypto/).

## 7. Time semantics

SIA separates three clocks:

- **Ingress freshness** limits total age between the signed attestation timestamp and Trust Policy acceptance. Any signing, HSM queueing, transport, validation, and verification performed after that timestamp consumes this window; it is not a pure network allowance.
- **Semantic validity** defines the latest instant at which the interaction still represents useful current meaning.
- **Retention TTL** limits how long a context-blocked instance may remain held.

`valid_until_ms` MUST be later than `occurred_at_ms` and MUST NOT exceed `occurred_at_ms + declaration.semantic_validity_ms`. The attestation timestamp MUST be between occurrence and semantic expiry. Acceptance MUST be no later than semantic expiry and MUST reject timestamps beyond the permitted future skew. A retention expiry and every dispatch-attempt deadline MUST NOT be later than `valid_until_ms`. Re-evaluation MUST check semantic validity, policy version and digest, actor/session revocation, and a fresh current context snapshot before release.

Timeout arithmetic SHOULD use a monotonic local clock. Wall-clock timestamps remain REQUIRED for correlation and audit. The RECOMMENDED default permitted clock skew between attestor and verifier is ±50 ms for in-vehicle emitters; a deployment that overrides this value MUST document it, and off-board emitters MUST have an explicitly documented skew and freshness budget. Deployments MUST define behaviour when secure time is unavailable.

Ingress freshness, semantic validity, delivery timeout, occupant-response timeout, and attention metrics are independent contracts. Their numeric values MUST NOT be presented as one additive end-to-end guarantee. A deployment safety case must prove that its worst-case authentication, queueing, decision, dispatch, renderer time-to-indication, and required fallback reserve fit inside semantic validity.

## 8. Applicability, blocking, and retention

Applicability answers whether a semantic node is meaningful in the current context. Blocking answers whether an applicable interaction may be presented now. They are not interchangeable.

Applicability MUST be written from the meaning of the hazard, not inferred from one convenient vehicle-state label. `Alert.Collision.Warning` is `always` in the reference catalog because an external vehicle can strike or reverse into a stationary or charging vehicle. `Alert.Lane.Departure.Warning` is `moving_only`; while parked, charging, or in service mode it transitions to `not_applicable`. Neither outcome may be transformed into `Notification.Diagnostic.CollisionSensorTest`; diagnostics remain a separate typed instance.

An applicable interaction blocked by Context Policy uses exactly one declared disposition:

| Disposition | Normative behaviour |
|---|---|
| `never_block` | Context Policy MUST continue to capability negotiation and use the declared safety fallback. |
| `drop` | Runtime MUST create an audit record and MUST NOT retain or dispatch the instance. |
| `defer` | Runtime retains each instance within TTL and bounded queue limits. |
| `coalesce` | Runtime retains only the newest instance for the canonical coalescing key. |

A coalescing key MUST be derived from declared, validated fields. It MUST include `node_id` and SHOULD include target and verified source identity where multiple sessions or occupants can coexist. Raw secret or personal values MUST NOT be used as storage keys; the runtime stores a keyed digest.

Retention storage MUST be bounded by per-node, per-actor, per-key, and global quotas. Quota exhaustion MUST use a deterministic eviction rule and MUST emit an audit record. Memory-only retention is the default. Persistent retention requires encrypted storage, integrity protection, and an explicit privacy policy.

A newer coalesced instance transitions the older entry to `superseded`. A context trigger does not guarantee presentation: it starts re-evaluation under the current trust, validity, context, capability, and policy state.

## 9. Context integrity

Every decision MUST bind to one immutable `context_id` and the exact signed policy used to interpret it. The minimal profile keeps orthogonal axes for `motion_state`, `operating_mode`, `energy_state`, `road_type`, `driver_state`, and `occupancy`; a composite label such as `charging` MUST NOT erase motion or operating mode. Each axis carries a value, observation time, source identity, and confidence. The snapshot MUST be authenticated by a trusted vehicle context authority.

The signed context policy defines `max_age_ms`, `min_confidence`, and `unknown_handling` per axis. A runtime MUST reject observations from the future, stale or under-confidence observations according to that policy, and impossible combinations such as `motion_state: moving` with `energy_state: charging` in the minimal profile. Occupancy is a set of verified roles, not a substitute for target authority.

Unknown or stale core axes MUST NOT relax a restriction. `safe_worst_case` maps uncertainty to the stricter applicable policy. `fail_closed` stops non-critical processing and invokes the safety-profile fallback defined by the deployment.

Context Policy MUST be deterministic. The minimal profile uses enumerated rules or versioned policy references; arbitrary runtime scripts are non-conformant.

## 10. Renderer capability and translation

Renderer capability claims MUST be attested by a trusted renderer registry. A renderer MUST NOT self-promote to `safety_relevant` without evidence accepted by the deployment.

Translation MUST produce a render plan containing:

- selected renderer IDs and their roles;
- rejected renderer IDs with stable reason codes;
- specification, profile, catalog, declaration, context, and policy identities and digests;
- delivery success policy and timeout;
- a deterministic selection reason.

Selection MUST use a stable tie-breaker. Identical declaration, context, capabilities, and policy versions MUST produce the same render plan.

A render plan MUST contain exactly one `primary` renderer. A fallback renderer is standby until a prior dispatch attempt fails or times out; it MUST NOT be labeled `concurrent` merely because it is eligible. Selected and rejected renderer sets MUST be disjoint, and every declaration-required renderer MUST be selected.

Attention or load budgets MAY reject a renderer only for interactions whose declaration permits blocking (`drop`, `defer`, or `coalesce`). For a `never_block` declaration, renderer eligibility is determined by safety assurance and the presentation contract; a budget calculation MUST NOT leave such an interaction without an eligible renderer while a declared surface is available.

## 11. Delivery contract

Renderer delivery and occupant response are separate feedback loops.

`received` proves that a renderer accepted a request. Only `presented` proves successful occupant-facing output. `failed` is emitted by the renderer. `timed_out` is emitted only by Coordination Runtime after the declared delivery deadline.

Every dispatch MUST create an ordered `dispatch-attempt` binding the decision, instance, selected renderer and role, attempt sequence, predecessor, dispatch time, and deadline. The deadline is `min(dispatched_at_ms + delivery_timeout_ms, valid_until_ms)`; a non-positive remaining window forbids the attempt. A fallback attempt requires a terminal failed or timed-out predecessor and a still-valid instance.

A renderer receipt MUST bind `receipt_id`, `attempt_id`, receipt sequence, `decision_id`, `instance_id`, `renderer_id`, state, observation time, elapsed time, and authenticated evidence. It MUST NOT predate dispatch or arrive after the attempt deadline; elapsed time MUST equal the interval from dispatch. Processing MUST be idempotent by receipt ID and monotonic by `(attempt_id, receipt_sequence)`. SIA assumes at-least-once transport and does not claim distributed exactly-once delivery.

The render plan declares one success policy:

- `any_selected_presented` — any selected or fallback renderer may satisfy delivery;
- `primary_presented` — the primary renderer must present;
- `all_required_presented` — every renderer marked required must present.

Occupant response MUST NOT start until the applicable delivery-success policy is satisfied. If it is never satisfied, occupant response remains `not_started` and delivery closes through failure or timeout policy.

## 12. Occupant response

`occupant_response.kind: none` closes the interaction after delivery succeeds. `explicit_or_timeout` opens a separate wait only after delivery success.

An explicit response MUST bind to the interaction, decision, context, and the `presented` receipt IDs that opened the response window; identify subject role and input channel; satisfy the declared authority and bound occupancy snapshot; and carry authenticated input evidence. `opened_at_ms` MUST be no earlier than delivery success, and the deadline MUST equal the declaration-owned timeout. A response timeout occurs exactly at that deadline and is a Coordination Runtime event; it MUST NOT be represented as an occupant action.

Presentation, awareness, comprehension, and acknowledgement are distinct claims. A renderer receipt MUST NOT imply that an occupant noticed or understood the interaction.

## 13. Availability and safety fallback

SIA security gates fail closed for unauthorised claims. Safety-relevant delivery must additionally fail operational through a deployment-defined path. A conforming deployment MUST document:

- the maximum SIA decision latency per priority band;
- watchdog and restart behaviour;
- behaviour when Context Policy, capability registry, secure time, or audit storage is unavailable;
- the certified fallback or legacy safety path for critical alerts;
- how duplicate presentation is prevented when normal and fallback paths overlap.

The documented latency bound MUST include bounded queue residence and contention for shared CPU, HSM, transport, storage, and renderer resources. Overload MUST produce an explicit, audited outcome or enter the declared safety fallback; it MUST NOT silently extend freshness or semantic validity. Audit persistence MUST NOT become an unbounded prerequisite for critical dispatch.

SIA MUST NOT become an undocumented single point of failure for a safety-relevant indication.

## 14. Abuse resistance and privacy

The consolidated threat-to-mitigation mapping, non-goals, and residual risks accepted in 0.4 are published in [`04_Threat-Model.md`](./04_Threat-Model.md).

Implementations MUST rate-limit emitters, bound nonce caches and retained queues, and audit repeated policy violations. Session authentication does not grant semantic authority and MUST remain revocable.

Audit details MUST follow data minimisation. Payloads classified as personal or sensitive SHOULD be referenced by digest or redacted projection rather than copied into logs. Hash linking provides tamper evidence; deployments requiring non-repudiation SHOULD additionally sign audit checkpoints.

## 15. Compatibility

The 0.4 draft intentionally breaks the illustrative 0.3 schema:

- declaration key `node` becomes the canonical `id`;
- ambiguous `suppression_class`, `merges_with`, `requires_ack`, and `ack_kind` fields are replaced by structured contracts;
- ingress freshness, semantic validity, and retention TTL are distinct;
- runtime envelopes are closed and priority injection is invalid;
- catalogs, policies, registries, and derived decisions are digest-bound;
- composite vehicle state is split into orthogonal context axes;
- dispatch attempt, delivery receipt, and occupant response are causally bound separate schemas.

No automatic migration may infer safety semantics. A migration tool MAY map syntactically unambiguous fields, but MUST require review for context policy, delivery success, coalescing keys, and occupant authority.

## 16. Conformance

Conformance is claimed per class, so a supplier implements only the side of the boundary it owns. An implementation MAY claim more than one class; the `runtime` class subsumes the verification duties of the other two.

| Class | Who | MUST implement |
|---|---|---|
| `emitter` | ADAS, services, apps, agents | Produce runtime instances that validate against the closed envelope, reference an installed declaration by canonical digest, validate their own payload before emission, sign per §6, and use a fresh nonce per emission. |
| `renderer` | Cluster, IVI, voice suppliers | Declare attested capabilities, consume render plans without reinterpreting policy, present within the declared timeout, and return authenticated, idempotent delivery receipts; never issue `timed_out`. |
| `runtime` | The mediation boundary owner | The complete lifecycle: trust gate, context integrity, retention, deterministic translation, delivery coordination, occupant response, and the hash-linked audit chain. |

A conforming `runtime` implementation MUST:

1. validate all declarations and runtime artifacts against their schemas and cross-artifact invariants;
2. pass positive and negative conformance vectors;
3. implement the complete lifecycle and stable reason codes;
4. prove deterministic decisions for repeated identical inputs;
5. reject reserved-field injection and unauthorised actors;
6. bound retention and replay state;
7. authenticate catalogs, actor credentials, context policy and snapshots, capabilities, dispatch attempts, receipts, and explicit occupant responses;
8. document safety fallback, clock, privacy, and audit policies.

`emitter` and `renderer` implementations MUST pass every conformance vector tagged with their class in [`conformance/vectors.json`](./conformance/vectors.json); the vector format is language-neutral and documented in [`conformance/README.md`](./conformance/README.md).

The reference examples in `examples/v0.4/` are executable conformance material. Continuous integration validates every schema and example in JSON Schema 2020-12 strict mode, evaluates cross-artifact authority, time, context, and lifecycle invariants, recomputes canonical digests, verifies example signatures, and checks that every reason code used on the wire is registered. The same checks are available locally: `npm test` for the full suite, `npm run validate -- <file>` for schema plus semantic validation of one artifact against the published dependency set, and `npm run conformance` for the language-neutral vectors.

---

*SIA Core Specification 0.4.0 · pre-standard draft · July 2026*
