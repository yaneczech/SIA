# Appendix A — Worked Example: `Alert.Collision.Warning` End to End

*Companion to “Toward a Semantic Interaction Architecture for Software-Defined Vehicles” (v0.4.0).*<br>
*The normative lifecycle and requirements are defined in [`03_Core-Specification.md`](./03_Core-Specification.md). The JSON files in [`examples/v0.4/`](./examples/v0.4/) are executable conformance material.*

This appendix follows one safety-critical interaction from declaration through trust, context, translation, renderer delivery and occupant response. The example uses the Minimal SIA Profile 0.4: `Alert` and `Notification`; cluster, IVI and voice output; six actor classes; and the core vehicle-state, road-type and driver-state axes. `Action` awaits a future input/execution profile.

---

## A.1 Node declaration

The declaration defines what the interaction means and owns every policy-relevant property. A runtime instance cannot override priority, actor permissions, context handling, retention, rendering or occupant response.

```yaml
id: Interaction.Event.Alert.Collision.Warning
inherits_from: Interaction.Event.Alert
since_version: 0.4.0
direction: system_to_occupant
target_role: driver
temporal_type: discrete
priority: critical
interruptibility: non_interruptible
semantic_validity_ms: 500
payload_schema_ref: sia:payload:collision-warning:1
payload_schema_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

trust_requirements:
  signed_origin_required: true
  permitted_actor_classes: [adas]
  max_ingress_age_ms: 200
  replay_protection: required
  session_revocation_required: true

attention_metrics:
  glance_time_estimated_ms: 800
  mean_single_glance_ms: 300
  task_steps: 0
  voice_alt_available: true
  cognitive_load: minimal

context_policy:
  applicability: moving_only
  unknown_context: safe_worst_case
  on_blocked:
    disposition: never_block

presentation_contract:
  preferred_renderers: [cluster, voice]
  required_renderers: []
  delivery_success_policy: any_selected_presented
  delivery_timeout_ms: 300
  degradation_policy: next_eligible

occupant_response:
  kind: explicit_or_timeout
  authority: driver_only
  timeout_ms: 2000

pii_class: none
accessibility_alternatives: [visual, auditory]
regulatory_basis: [ISO_15623, UNECE_R152]
```

The alert is meaningful only while moving. If it is applicable, context cannot silently drop or retain it: `never_block` sends it to capability negotiation and the documented safety fallback. Delivery succeeds when any selected renderer proves presentation. Only then does the independent two-second occupant-response wait begin.

---

## A.2 Legitimate runtime instance

```yaml
spec_version: 0.4.0
profile_id: sia-minimal
profile_version: 0.4.0
catalog_version: 0.4.0
node_id: Interaction.Event.Alert.Collision.Warning
node_schema_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
instance_id: c8e1f4b2-7bd0-4c44-9a8e-0a9c7c2c4b21
occurred_at_ms: 1784116800000
valid_until_ms: 1784116800500
target_role: driver

payload:
  time_to_collision_s: 1.4
  threat_bearing_deg: 12
  threat_range_m: 18
  relative_speed_kmh: 42

attestation:
  actor_class: adas
  actor_id: ADAS_v2.3.1
  key_id: vehicle-hsm:adas:7
  algorithm: ES256
  timestamp_ms: 1784116800000
  nonce: cmFuZG9tLW5vbmNlLTE
  provenance_chain: [ADAS_v2.3.1]
  signature: ZXhhbXBsZS1zaWduYXR1cmU
```

The three version axes are explicit. `node_schema_sha256` binds the instance to the reviewed declaration. `occurred_at_ms` and `valid_until_ms` define semantic validity, while the attestation timestamp is evaluated against the separate 200 ms ingress-freshness limit.

---

## A.3 Trust verification

![Figure A.1 — Alert.Collision.Warning trust and translation flow](./figures/figA1-alert-flow.png)

*Figure A.1. Trust verification is a chokepoint before Translation. A failed instance never reaches a renderer, regardless of claimed urgency.*

Trust Policy performs these checks before context or rendering:

1. validate the closed runtime envelope and node-specific payload;
2. resolve the catalog declaration and verify its digest;
3. verify that `adas` is an authorised actor class;
4. verify signature or negotiated session authenticator and algorithm;
5. check ingress freshness, semantic validity, nonce replay and revocation status;
6. record a stable pass or rejection reason.

SIA does not determine whether a physical collision is real. It determines whether the interaction claim crossing the HMI boundary is authorised, fresh, attributable and structurally valid.

---

## A.4 Context decision

### A.4.1 Moving, highway, attentive driver

```yaml
context_id: 1a2b3c4d-1111-4aaa-8bbb-1234567890ab
captured_at_ms: 1784116800040
policy_version: 0.4.0
axes:
  vehicle_state:
    value: moving
    source_id: Vehicle.SpeedState
    observed_at_ms: 1784116800036
    confidence: 100
  road_type:
    value: highway
    source_id: Navigation.RoadClass
    observed_at_ms: 1784116799800
    confidence: 96
  driver_state:
    value: attentive
    source_id: DMS.AttentionState
    observed_at_ms: 1784116800028
    confidence: 92
integrity:
  key_id: vehicle-hsm:context:3
  algorithm: HMAC-SHA-256
  signature: Y29udGV4dC1zaWduYXR1cmU
```

The alert is applicable because the vehicle is moving. It proceeds directly to renderer capability negotiation. Context inputs are immutable, sourced, timed and authenticated; the audit record binds the decision to this exact `context_id`.

### A.4.2 Charging

```yaml
axes:
  vehicle_state: {value: charging, source_id: Vehicle.SpeedState, observed_at_ms: 1784116800036, confidence: 100}
  road_type: {value: urban, source_id: Navigation.RoadClass, observed_at_ms: 1784116799800, confidence: 96}
  driver_state: {value: unknown, source_id: DMS.AttentionState, observed_at_ms: 1784116800028, confidence: 70}
```

`moving_only` evaluates false. The instance transitions to `not_applicable`, emits a `CONTEXT_NOT_APPLICABLE` audit record and closes without a render plan, renderer receipt or occupant response.

The live alert is not “suppressed for later,” and it is not transformed. If diagnostics are needed, the producer emits a separate typed instance such as `Notification.Diagnostic.CollisionSensorTest`. This separation prevents a safety alert from becoming a semantic shape-shifter.

### A.4.3 Unknown vehicle state

An unknown or stale core axis cannot make the system more permissive. The declaration uses `safe_worst_case`, so an unknown vehicle state is evaluated as the stricter applicable case for safety and attention. Capability negotiation continues; the uncertainty and source evidence remain visible in the audit trail.

---

## A.5 Deterministic render plan

```yaml
decision_id: d8e1f4b2-7bd0-4c44-9a8e-0a9c7c2c4b22
instance_id: c8e1f4b2-7bd0-4c44-9a8e-0a9c7c2c4b21
context_id: 1a2b3c4d-1111-4aaa-8bbb-1234567890ab
policy_version: 0.4.0
created_at_ms: 1784116800060
selected:
  - {renderer_id: Renderer.Cluster.Primary, role: primary}
  - {renderer_id: Renderer.Voice.Primary, role: concurrent}
rejected:
  - {renderer_id: Renderer.IVI.Primary, reason_code: SAFETY_PROFILE_INELIGIBLE}
delivery_success_policy: any_selected_presented
delivery_timeout_ms: 300
reason_code: PRIMARY_AND_CONCURRENT_SELECTED
```

Cluster is selected as the safety-relevant visual surface and voice as a concurrent low-glance path. IVI is explicitly rejected. Repeating the decision with the same declaration, context, capabilities and policy version must produce the same plan.

---

## A.6 Renderer delivery feedback

Dispatch is not proof of delivery. The selected renderer sends authenticated, idempotent feedback:

```yaml
receipt_id: e8e1f4b2-7bd0-4c44-9a8e-0a9c7c2c4b23
decision_id: d8e1f4b2-7bd0-4c44-9a8e-0a9c7c2c4b22
instance_id: c8e1f4b2-7bd0-4c44-9a8e-0a9c7c2c4b21
renderer_id: Renderer.Cluster.Primary
issuer: renderer
state: presented
observed_at_ms: 1784116800132
elapsed_ms: 72
reason_code: null
attestation:
  key_id: vehicle-hsm:cluster:4
  algorithm: HMAC-SHA-256
  signature: ZGVsaXZlcnktcmVjZWlwdA
```

`received` would prove only that the renderer accepted the request. `presented` proves occupant-facing output. `failed` is renderer-originated; `timed_out` is emitted only by Coordination Runtime after the 300 ms deadline. Because the success policy is `any_selected_presented`, the cluster receipt satisfies delivery even if voice later fails. The alternative policies `primary_presented` and `all_required_presented` are stricter.

SIA assumes at-least-once transport. Duplicate receipts are ignored by `receipt_id`; the architecture does not claim distributed exactly-once delivery.

---

## A.7 Occupant response

Only after delivery succeeds does the response wait begin. An explicit driver response is a separate authenticated artifact:

```yaml
response_id: f8e1f4b2-7bd0-4c44-9a8e-0a9c7c2c4b24
decision_id: d8e1f4b2-7bd0-4c44-9a8e-0a9c7c2c4b22
instance_id: c8e1f4b2-7bd0-4c44-9a8e-0a9c7c2c4b21
state: acknowledged
authority: driver_only
occurred_at_ms: 1784116800552
input_channel: InputDevice.SteeringWheel.Right.Press
evidence:
  kind: verified_input
  key_id: vehicle-hsm:input:5
  algorithm: HMAC-SHA-256
  signature: b2NjdXBhbnQtcmVzcG9uc2U
```

If no valid response arrives within 2000 ms, Coordination Runtime emits `response_timed_out`; it must not forge a human action. Presented, noticed, understood and acknowledged are four different claims. Version 0.4 encodes only what can be evidenced.

---

## A.8 What happens to a distracted-driver notification?

The answer is declaration-specific, never implicit. `Notification.Media.NowPlaying` declares `coalesce`, 30 s TTL and the key fields `node_id`, `target_role`, `actor_id` and `payload.session_id`.

While the driver is distracted:

1. the first applicable instance becomes `held` and gets a retention record;
2. each newer equivalent instance supersedes the older retained entry;
3. the store keeps only the newest state for that canonical key;
4. expiry, quota eviction and supersession are all audited;
5. when driver state changes, the newest instance is revalidated against current trust, semantic validity, context, capabilities and policy;
6. only a successful re-evaluation produces a render plan and delivery receipts.

A held instance has not fallen into a black hole, and it has not failed delivery. Delivery has not started. By contrast, `Assistant.Suggestion` declares `drop` and closes with an audit record, while `Notification.Diagnostic.CollisionSensorTest` declares `defer` and retains each bounded item. This is why “suppressed” is too ambiguous for a robust model.

---

## A.9 Adversarial scenarios

### A.9.1 Unauthorised actor

A correctly signed third-party application is still rejected when it emits `Alert.Collision.Warning`, because authentication proves identity, not semantic authority. `third_party_app` is absent from `permitted_actor_classes`.

### A.9.2 Stale or replayed warning

An otherwise valid warning arriving after `max_ingress_age_ms: 200`, outside `valid_until_ms`, or with a reused nonce is rejected before Translation. These are separate failure reasons because transport delay, stale meaning and replay are different faults.

### A.9.3 Priority injection

An adversary adds `priority: critical` to a benign runtime instance. The closed envelope fails schema validation. The field is rejected and logged; it is not silently ignored. Declaration-owned policy therefore cannot be smuggled through the payload.

### A.9.4 Valid session, malicious behaviour

A valid symmetric session ticket does not grant new semantic authority. Individual policy violations are rejected, counted and rate-limited. Repeated violations may revoke the session before expiry. Queue, nonce-cache and audit-storage bounds prevent an authenticated actor from turning retention or replay protection into an exhaustion attack.

### A.9.5 Renderer failure

If no selected renderer meets `any_selected_presented` within 300 ms, delivery closes through the declared failure policy. The occupant-response wait remains `not_started`. A deployment must document its fail-operational safety path, watchdog behaviour and duplicate-prevention strategy; SIA must not become an undocumented single point of failure.

---

## A.10 What this example demonstrates

1. A single declaration governs semantic authority, context, retention, presentation and response policy.
2. Trust and payload validation occur before context and rendering.
3. Applicability is distinct from temporary blocking.
4. Retained notifications are bounded, observable and re-evaluated rather than forgotten.
5. Renderer delivery and occupant acknowledgement are independent feedback loops.
6. Failure and timeout issuers are explicit, so audit evidence cannot overclaim.
7. Closed envelopes reject policy injection.
8. Stable reason codes and machine-readable records make the lifecycle testable.

---

## A.11 Remaining production work

- Standardise canonical signing representations and algorithm profiles.
- Publish payload schemas instead of illustrative digest placeholders.
- Define deployment latency budgets and certified safety fallbacks.
- Calibrate attention estimates with simulator and in-vehicle evidence.
- Specify privacy policy for retained personal notifications and audit redaction.
- Add interoperability vectors for duplicate, out-of-order and missing receipts.
- Validate context and renderer attestation chains against the vehicle trust architecture.

These are explicit profile and deployment tasks, not reasons to leave lifecycle semantics ambiguous.

---

*End of Appendix A · SIA 0.4.0 · July 2026*
