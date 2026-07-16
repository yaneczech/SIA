<img src="./figures/sia-logo.svg" alt="SIA" width="112" height="54">

# SIA Threat Model

**Version 0.4.0 — companion to the [Core Specification](./03_Core-Specification.md) · July 2026**

SIA defends one property: **interaction integrity** — the meaning, priority, and origin of an occupant-facing interaction is what it claims to be. This document consolidates the threats the 0.4 contracts are designed to stop, where each defence lives, and which conformance vector exercises it.

## Threats and mitigations

| # | Threat | Attack example | Mitigation | Where enforced |
|---|---|---|---|---|
| 1 | Alert spoofing by a lower-authority actor | Music app or AI agent emits `Alert.Collision.Warning` | Actor-class permission is declared on the node and bound to an authority-issued actor credential; authentication alone grants no semantic authority | `actor-registry` · `trust_requirements.permitted_actor_classes` · vector `emitter-target-role-escalation-rejected` family |
| 2 | Priority or policy injection via payload | Instance carries `priority: critical` or `preferred_renderers` | Closed runtime envelope; injection is rejected, preserving attack evidence | `runtime-instance` `additionalProperties: false` · vectors `emitter-priority-injection-rejected`, `emitter-renderer-override-rejected` |
| 3 | Replay of a legitimate warning | Captured emission re-sent later | Per-`(actor_id, key_id)` nonce uniqueness within the ingress window; bounded cache fails closed on overflow | Spec §6 |
| 4 | Stale message presented as current | Delayed transport delivers an expired alert or emitter extends `valid_until_ms` | Ingress freshness, declaration-bounded semantic validity, and retention TTL are three separate clocks | Spec §7 · vector `emitter-validity-extension-rejected` |
| 5 | Algorithm downgrade | Attestation claims a weak or unknown algorithm | Fixed algorithm profile; identifiers outside it are rejected | Spec §6 · vector `emitter-unknown-algorithm-rejected` |
| 6 | Renderer self-promotion to safety surface | IVI claims `safety_relevant` to receive critical alerts | Capability claims are attested by a registry and require assurance evidence | `renderer-capability` schema · vector `renderer-safety-claim-needs-evidence` |
| 7 | Fabricated or out-of-order delivery evidence | Receipt exists before dispatch, binds another attempt, or a renderer hides failure behind timeout | Signed ordered dispatch attempts; receipts bind attempt ID and sequence; `presented` only from renderer, `timed_out` only from Runtime | `dispatch-attempt`, `delivery-receipt` · vector `renderer-receipt-before-dispatch-rejected` |
| 8 | Fabricated or premature acknowledgement | ACK opens before presentation, binds another context, or synthetic input is recorded as driver action | Response binds presented receipt proof, decision, context, occupied subject role, declared authority, and exact response window | `occupant-response` · vectors `runtime-response-before-presentation-rejected`, `runtime-timeout-is-not-an-occupant-action` |
| 9 | Notification flooding and queue exhaustion | Compromised app floods retention or nonce state | Per-node, per-actor, per-key, and global quotas; deterministic audited eviction; emitter rate limits | Spec §8, §14 |
| 10 | Context spoofing or ambiguity | Fake `parked` relaxes policy, composite `charging` hides motion, or confidence is omitted | Signed policy and snapshot; orthogonal axes with source/time/confidence; stale, low-confidence, impossible, and unknown combinations fail closed or use declared worst case | `context-policy`, `context-snapshot` · vector `runtime-stale-context-observation-rejected` |
| 11 | Audit tampering | Decision evidence altered after an incident | Hash-linked records; signed checkpoints where non-repudiation is required | `audit-record` schema · Spec §14 |
| 12 | Valid session, malicious behaviour | Authenticated actor starts policy-violating emissions mid-session | Semantic authority checked per emission; sessions are revocable before expiry; repeated violations are audited | Spec §6, §14 |
| 13 | Declaration or catalog substitution | Attacker swaps in a node that weakens priority, applicability, or permitted actors | Signed catalog plus instance bindings to catalog and declaration canonical digests; duplicate and unknown node IDs fail closed | `catalog`, `runtime-instance` · vector `runtime-duplicate-catalog-node-rejected` |
| 14 | Context-policy substitution | Decision uses permissive freshness, confidence, or unknown handling after a policy swap | Declarations, snapshots, plans, retention, and audit bind one signed policy ID, version, and digest | `context-policy` · vector `runtime-unknown-context-must-be-worst-case` |
| 15 | Revoked credential reuse | Stolen key still produces valid signatures | Instance binds current signed actor registry and credential; status and validity are checked at acceptance and re-evaluation | `actor-registry` · vector `runtime-revoked-credential-rejected` |
| 16 | Occupant retargeting | Driver-only warning instance changes `target_role` to a passenger or response claims an absent driver | Runtime role may only preserve or narrow declaration authority; response role must be occupied in the bound context | semantic invariants · vector `emitter-target-role-escalation-rejected` |
| 17 | Renderer bypass | Runtime dispatches directly to an IVI omitted from the verified render plan | Each signed attempt binds an eligible selected renderer and exact declaration-owned deadline | `dispatch-attempt` · vector `runtime-dispatch-to-unselected-renderer-rejected` |
| 18 | Retention resurrection | Held notification outlives semantic meaning, policy, or authority | Retention expiry is bounded by semantic validity; release rechecks validity, policy digest, revocation, and fresh context | `retention-record` · vector `runtime-retention-past-semantic-validity-rejected` |

## Non-goals

SIA does not defend against, and must be composed with platform controls for:
sensor spoofing and ADAS decision quality, renderer compromise after dispatch,
operating-system and hypervisor integrity, transport security below the semantic
layer (UNECE R155 / ISO 21434 territory), and factual correctness of verified
content. A correctly attested but factually wrong warning is a sensing fault,
not an interaction-integrity failure.

## Residual risks accepted in 0.4

- **HMAC session provisioning is deployment-defined.** The symmetric per-interaction
  tier assumes a session established out of band; a session-establishment contract
  is deferred to a future profile. Deployments using `HMAC-SHA-256` MUST document
  their provisioning and revocation path.
- **Multi-hop provenance is carried but not composed.** `provenance_chain` is
  recorded for audit; a trust-composition model for agent-to-agent chains is
  future work.
- **Availability is deployment-scoped.** SIA fails closed for unauthorised claims;
  keeping a certified fallback path for critical alerts when SIA itself is
  unavailable is a deployment obligation (Spec §13).
- **Trust-anchor distribution is deployment-scoped.** The draft defines what is
  signed and digest-bound, while OEM provisioning, rollover, recovery, and HSM
  ownership remain part of the deployment security case.
