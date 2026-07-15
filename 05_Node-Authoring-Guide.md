<img src="./figures/sia-logo.svg" alt="SIA" width="112" height="54">

# Node Authoring Guide

**Version 0.4.0 — how to design a new interaction node, in order.**

A declaration is a safety and policy artifact, not a message format. Work through the checklist top-down; every question maps to a field validated by [`interaction-node.schema.json`](./schema/interaction-node.schema.json). Validate as you go: `npm run validate -- my-node.json`.

## 1. Meaning first

- **Is this one meaning, or two?** If diagnostics and live safety share a name, split them (`Alert.Collision.Warning` vs `Notification.Diagnostic.CollisionSensorTest`). A node with two audiences or two urgencies is two nodes.
- **Type:** occupant safety consequence → `Alert` (priority `critical`/`high`, may never be silently droppable). Informational → `Notification`.
- **ID:** `Interaction.Event.<Alert|Notification>.<Domain>.<Name>`, segments in UpperCamelCase. The ID is forever; renames are a new node with `replaced_by`.

## 2. Who may say it

- `permitted_actor_classes`: smallest set that has legitimate business emitting this meaning. Start with one. Adding a class later is additive; removing one is not.
- `max_ingress_age_ms`: how stale may transport make this before it is a lie? Safety: low hundreds of ms. Ambient status: seconds.
- Keep `session_revocation_required: true` unless you can argue why mid-session revocation may be ignored.

## 3. What it costs the driver

- Measure or estimate `attention_metrics` honestly — they are auditable estimates, calibrated later against occlusion/eye-glance testing, not marketing numbers.
- `voice_alt_available` and `accessibility_alternatives` decide degraded-mode behaviour; declare them from day one.

## 4. When it applies, and what blocking does

- `applicability`: is the meaning itself context-bound (`moving_only`), universal (`always`), or deployment-specific (`profile_defined` + `policy_ref`)?
- Blocked disposition, exactly one: safety alerts → `never_block`. Value streams where only the latest matters (media, charge status) → `coalesce` with a canonical key. Discrete events worth showing late → `defer` with honest TTL. Ephemeral suggestions → `drop`.
- Rule of thumb: TTL ≤ `semantic_validity_ms`; if you want a longer TTL, your validity is wrong or your disposition is.

## 5. How it reaches the occupant

- `preferred_renderers` in preference order; `required_renderers` only for regulatory must-show surfaces.
- `delivery_success_policy`: default `any_selected_presented`; use `primary_presented` when only one surface is meaningful; `all_required_presented` only with non-empty `required_renderers`.
- `delivery_timeout_ms`: how long may the vehicle try before delivery counts as failed? For critical alerts this is small (hundreds of ms) — the fallback path must have time to run within semantic validity.

## 6. What closes it

- `occupant_response.kind: none` for anything the driver need not confirm. `explicit_or_timeout` only when an unacknowledged interaction is itself a hazard; then choose `authority` (`driver_only` vs `any_occupant`) and a timeout you can defend.

## 7. Payload last

- Author the payload schema (`schema/payloads/<name>.v1.schema.json`), closed (`additionalProperties: false`), every field bounded. No priority, renderer, or policy fields — the envelope rejects them anyway.
- Bind it: `payload_schema_ref: sia:payload:<name>:1` and `payload_schema_sha256` = canonical digest (`npm run digest -- schema/payloads/<name>.v1.schema.json`).
- Set `pii_class` by the most sensitive field the payload can carry; `personal`+ constrains audit logging (digest, not copy).

## 8. Before shipping

- `npm run validate -- my-node.json` — schema + digest check.
- Add the node to the catalog; catalog rules: additive only, subclasses may strengthen but never weaken parent contracts ([VERSIONING.md](./VERSIONING.md)).
- Regulatory anchor known? Record it in `regulatory_basis` — auditors look there first.
- Ask the two adversarial questions from the [threat model](./04_Threat-Model.md): who profits from spoofing this node, and who profits from suppressing it? Your trust requirements must answer both.
