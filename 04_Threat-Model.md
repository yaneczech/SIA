<img src="./figures/sia-logo.svg" alt="SIA" width="112" height="54">

# SIA Threat Model

**Version 0.4.0 — companion to the [Core Specification](./03_Core-Specification.md) · July 2026**

SIA defends one property: **interaction integrity** — the meaning, priority, and origin of an occupant-facing interaction is what it claims to be. This document consolidates the threats the 0.4 contracts are designed to stop, where each defence lives, and which conformance vector exercises it.

## Threats and mitigations

| # | Threat | Attack example | Mitigation | Where enforced |
|---|---|---|---|---|
| 1 | Alert spoofing by a lower-authority actor | Music app or AI agent emits `Alert.Collision.Warning` | Actor-class permission is declared on the node, verified against attested identity; authentication alone grants no semantic authority | `trust_requirements.permitted_actor_classes` · Spec §6 · vector `emitter-valid-instance` family |
| 2 | Priority or policy injection via payload | Instance carries `priority: critical` or `preferred_renderers` | Closed runtime envelope; injection is rejected, preserving attack evidence | `runtime-instance` `additionalProperties: false` · vectors `emitter-priority-injection-rejected`, `emitter-renderer-override-rejected` |
| 3 | Replay of a legitimate warning | Captured emission re-sent later | Per-`(actor_id, key_id)` nonce uniqueness within the ingress window; bounded cache fails closed on overflow | Spec §6 |
| 4 | Stale message presented as current | Delayed transport delivers an expired alert | Ingress freshness, semantic validity, and retention TTL are three separate clocks | Spec §7 · `max_ingress_age_ms`, `valid_until_ms` |
| 5 | Algorithm downgrade | Attestation claims a weak or unknown algorithm | Fixed algorithm profile; identifiers outside it are rejected | Spec §6 · vector `emitter-unknown-algorithm-rejected` |
| 6 | Renderer self-promotion to safety surface | IVI claims `safety_relevant` to receive critical alerts | Capability claims are attested by a registry and require assurance evidence | `renderer-capability` schema · vector `renderer-safety-claim-needs-evidence` |
| 7 | Fabricated delivery evidence | Component claims an alert was presented, or a renderer hides a failure behind a timeout | Authenticated receipts; `presented` only from the renderer, `timed_out` only from Coordination Runtime; idempotent receipt IDs | `delivery-receipt` schema · vectors `renderer-cannot-issue-timeout`, `renderer-success-carries-no-failure-reason` |
| 8 | Fabricated acknowledgement | Timeout or synthetic input recorded as a driver action | Explicit responses need verified input evidence and declared authority; a timeout is runtime evidence and can never impersonate an occupant | `occupant-response` schema · vector `runtime-timeout-is-not-an-occupant-action` |
| 9 | Notification flooding and queue exhaustion | Compromised app floods retention or nonce state | Per-node, per-actor, per-key, and global quotas; deterministic audited eviction; emitter rate limits | Spec §8, §14 |
| 10 | Context spoofing | Fake `parked` state relaxes attention policy | Context snapshots are authenticated by a trusted vehicle authority; unknown or stale axes map to the stricter policy | `context-snapshot` schema · Spec §9 · vector `runtime-context-requires-all-core-axes` |
| 11 | Audit tampering | Decision evidence altered after an incident | Hash-linked records; signed checkpoints where non-repudiation is required | `audit-record` schema · Spec §14 |
| 12 | Valid session, malicious behaviour | Authenticated actor starts policy-violating emissions mid-session | Semantic authority checked per emission; sessions are revocable before expiry; repeated violations are audited | Spec §6, §14 |

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
