# Appendix A — Worked Example: `Alert.Collision.Warning` End-to-End

*Companion to "Toward a Semantic Interaction Architecture for Software-Defined Vehicles" (v0.1).*

This appendix traces a single safety-critical alert from its emission by the ADAS subsystem to its delivery across multiple renderers, under varying contexts and adversarial conditions. The goal is to make the proposed metadata contracts and trust model concrete enough to evaluate. All field names match Sections 4–10 of the main paper.

---

## A.1 Ontology declaration

The node is declared once in the ontology and frozen against a version. The following declaration is what every vehicle, regardless of OEM, sees as the canonical definition.

```yaml
node: Interaction.Event.Alert.Collision.Warning
since_version: 1.0.0
inherits_from: Interaction.Event.Alert
direction: output

priority: 95                       # 0–100, integer
interruptibility: false
requires_ack: true
ack_kind: explicit_input | gaze
ack_timeout_ms: 3000
ack_authority: driver_only

attention_metrics:
  glance_time_estimated_ms: 600    # short, single-glance design intent
  mean_single_glance_ms: 600
  task_steps: 1
  voice_alt_available: true
  cognitive_load: high

trust_requirements:
  signed_origin_required: true
  permitted_actor_classes: [adas, vsc]
  max_age_ms: 200
  replay_protection: required

temporal_type: discrete
temporal_freshness_ms: 500
suppression_class: safety_critical
merges_with: []                    # never merged
fallback_chain: [hud, cluster, voice, haptic]
degradation_policy: escalate       # if preferred renderer unavailable, escalate

target_role: driver
accessibility_alt:
  low_vision: [voice, haptic]
  hearing_impaired: [hud, cluster, haptic]
  motor_limited:
    ack_kind: gaze
regulatory_basis: [UNECE_R152, ISO_15623]
assessment_basis: [NHTSA_FCW_NCAP]
pii_class: none
```

Several properties are worth noting. `priority: 95` places this alert above almost every other interaction; `merges_with: []` forbids aggregation with other events; `suppression_class: safety_critical` prevents any policy from silencing it; and `requires_ack` with `ack_authority: driver_only` ensures that a passenger cannot dismiss the warning.

---

## A.2 Runtime instance — legitimate emission

At runtime, the ADAS subsystem emits an instance carrying its attestation. Trust Policy verifies the attestation against the semantic declaration before propagation.

```yaml
instance_of: Interaction.Event.Alert.Collision.Warning
ontology_version: 1.0.0
instance_id: c8e1f4b2-...                # for ack correlation
timestamp_ms: 1778803920123              # ≈ 2026-05-14 12:12 UTC

payload:
  ttc_seconds: 1.4                       # time to collision
  threat_bearing_deg: 12                 # right of vehicle heading
  threat_range_m: 18

attestation:
  actor_class: adas
  actor_id: ADAS_v2.3.1
  signature: <JWS over canonical form>
  timestamp_ms: 1778803920123
  nonce: <random-per-emission>
  provenance_chain: [adas]
```

The trust and provenance policy checks: signature validity, `actor_class ∈ permitted_actor_classes`, age ≤ `max_age_ms`, `nonce` not seen before (replay protection), and signed `ontology_version` resolvable. All checks pass; the instance enters the Runtime.

---

## A.3 Trust verification flow

```mermaid
sequenceDiagram
    participant ADAS as ADAS (emitter)
    participant Trust as Trust Policy (verifier)
    participant Trans as Translation + Context
    participant Runtime as Runtime (state · focus · ack)
    participant Renderers as Renderers (HUD · Cluster · Voice · Haptic)

    ADAS->>Trust: emit instance + attestation

    alt trust verification fails
        Trust-->>ADAS: reject + log State.SecurityEvent.UnauthorisedEmission
    else trust verification passes
        Trust->>Trans: verified node propagates
        Trans->>Runtime: allocate focus slot · arm ack timer
        Runtime->>Renderers: dispatch (multicast)
        Renderers->>Runtime: ack (explicit input | gaze | timeout)
        Runtime->>Trust: close interaction · log outcome
    end
```

*Figure A.1. Sequence flow for Alert.Collision.Warning. Trust verification is a chokepoint before Translation. Renderer dispatch is multicast; acknowledgement is tracked by Runtime.*

Trust Policy is the chokepoint at which interaction integrity is enforced. Importantly, verification operates *before* Translation — a node that fails verification never reaches a renderer, regardless of its declared priority.

---

## A.4 Translation under three contexts

The same instance is translated differently depending on the active Context vector. Below we show three representative contexts and the resulting renderer assignment. Capability profiles for renderers are taken from Section 9 of the main paper.

### A.4.1 Highway, manual driving

```yaml
context:
  sae_level: 1
  road_type: highway
  vehicle_state: moving
  traffic_density: dense
  weather: clear
  autonomy_engaged: false
  driver_state: attentive
  market_jurisdiction: DE
```

Translation Layer decision:

- **Primary:** HUD (glance-optimised, in driver's forward field of view, ≤ `glance_time_estimated_ms`)
- **Concurrent:** Cluster (redundant visual), Haptic on driver seat (sub-second TTI)
- **Concurrent:** Voice short prompt (250 ms)
- **Not selected:** IVI touchscreen (off-axis, exceeds glance budget under dense traffic context modifier)

Effective attention cost: `600 ms × 1.2 (dense traffic modifier) = 720 ms` — within the 1500 ms TEORT budget configured for `Alert.*` in manual highway driving (Section 7).

### A.4.2 Parked, charging

```yaml
context:
  sae_level: 0
  road_type: urban
  vehicle_state: charging
  traffic_density: free
  autonomy_engaged: false
  driver_state: unknown
  market_jurisdiction: EU
```

The alert is suppressed by an upstream rule: ADAS does not emit `Collision.Warning` while `vehicle_state ≠ moving`. If emitted anyway (e.g., during sensor diagnostics), the Translation Layer renders to IVI only with a static override label "Diagnostic mode — not a real warning", bound to a policy rule of the form `context.vehicle_state ∈ {parked, charging, service} ∧ actor_class = adas → inject_override_label: "Diagnostic mode — not a real warning"`. This is policy-encoded behaviour, not designer judgement.

Note: the preferred design for diagnostic and test emission is a distinct node type — e.g., `Notification.Diagnostic.CollisionSensorTest` — rather than a live `Alert.Collision.Warning` with an injected label. Reusing the safety-critical node in a degraded context conflates two semantically different events and risks training occupants to dismiss genuine alerts. The parked scenario is included here to illustrate Translation Layer override capability; it does not represent recommended practice.

### A.4.3 Autonomous L4, highway

```yaml
context:
  sae_level: 4
  road_type: highway
  vehicle_state: moving
  autonomy_engaged: true
  driver_state: not_monitoring
  market_jurisdiction: DE
```

Translation Layer decision:

- **Primary:** Cluster (driver may be looking away; sustained display)
- **Concurrent:** Voice prompt full sentence (driver context recovery)
- **Concurrent:** Haptic on seat
- **Not selected:** HUD (driver not assumed to be looking forward)

At L4 autonomy, the ADS handles the collision response autonomously; the occupant alert serves as an awareness notification rather than an emergency response trigger. Accordingly, `ack_kind` shifts from `explicit_input` toward a logged awareness signal, and Context Policy applies its published modifier rule to scale the effective `ack_timeout_ms` from a base of 3000 ms to 6000 ms — within the whitelist of context-modulable numeric fields defined in Section 8. The base declarative value on the node itself is unchanged; only the effective runtime value is adjusted. After this extended window the interaction is closed as `timeout_logged` rather than `unacknowledged`. The occupant is not expected to prevent the collision; the ADS is. The extended timeout reflects a different semantic for `ack` at this autonomy level, not a relaxed safety response window.

---

## A.5 Adversarial scenarios

### A.5.1 Unauthorised actor class

A third-party application emits a message addressed as `Alert.Collision.Warning`. It attests its actual class truthfully, signed with its valid app-store certificate:

```yaml
attestation:
  actor_class: third_party_app
  actor_id: com.example.musicapp
  signature: <valid app-store signature>
```

Even with a cryptographically valid signature, Trust Policy rejects the instance: `third_party_app ∉ permitted_actor_classes`. A `State.SecurityEvent.UnauthorisedEmission` is generated for logging. The complementary case — a third-party app falsely claiming `actor_class: adas` to bypass this check — is defeated at signature verification: the app cannot produce a JWS signed by an ADAS key it does not possess. The two together (unauthorised class with valid signature, and class spoofing with invalid signature) cover both ways an unsanctioned actor might try to emit a safety-critical alert.

### A.5.2 Expired freshness

A replay of a 1-second-old legitimate instance arrives for verification.

```yaml
attestation.timestamp_ms: 1778803919023
current_time_ms:           1778803920123  # 1100 ms later
```

Trust Policy rejects: age `1100 ms > max_age_ms (200)`. The instance does not propagate. This protects against captured-and-replayed warnings designed to desensitise the driver.

### A.5.3 AI agent attempting to issue critical alert

A local LLM agent (`actor_class: agent_local`), having parsed a misleading input, emits:

```yaml
instance_of: Interaction.Event.Alert.Collision.Warning
attestation:
  actor_class: agent_local
  # (remaining attestation fields omitted for brevity)
```

Trust Policy rejects: `agent_local ∉ permitted_actor_classes`. The agent may emit lower-authority nodes (`Notification.Suggestion.*`), but the integrity of safety-critical alerts is structurally protected from agentic emission, regardless of how the agent was prompted. This complements service-level authentication by constraining what an authenticated actor is authorised to say.

### A.5.4 Priority injection

An adversary attempts to emit a benign notification with elevated `priority: 99` to displace a real alert. Because `priority` is a property of the semantic node declaration, not the instance, the runtime `priority` is recomputed from the declaration and the spoofed value is discarded.

---

## A.6 What this example demonstrates

1. **A single declarative node** governs behaviour across heterogeneous renderers, contexts, and accessibility profiles, without per-vehicle, per-screen redesign.
2. **Attention checks are more auditable.** A regulator or safety team can inspect the declared attention-demand proxies and verify that policy decisions are traceable to explicit thresholds.
3. **Trust is enforced at a chokepoint** before rendering, and the policy is expressed in the semantic schema rather than embedded in renderer code.
4. **AI agents are not categorically blocked from interaction**, but they cannot impersonate safety-critical subsystems. This is a different and stronger property than service-level authentication: it constrains *what kinds of things an authenticated agent may say*, not merely *whether it may speak*.
5. **Adversarial cases reduce to schema checks.** Unauthorised emission, class spoofing, replay, and priority injection are caught by mechanical validation of declared contracts rather than ad-hoc detection.

---

## A.7 Open issues raised by this example

- The numerical priority scale (0–100) is convenient but arbitrary. Comparative semantics across OEMs require either a shared scale or per-vehicle calibration policy.
- `context.attention_modifier` is presented as a scalar in the formula `effective_cost = base × modifier`. In practice it is likely a function of multiple context axes; any composition rule deserves empirical validation.
- `ack_kind: explicit_input | gaze` mixes a deterministic input with a probabilistic inference (gaze detection has error rates). The ontology may need to distinguish certified from inferred acknowledgement.
- `provenance_chain` in this example contains a single hop. In realistic agentic deployments the chain may be multi-hop (`sensor → adas → trust_verifier → runtime`), and the semantics of chain-level trust composition are not yet specified.

These issues are intentionally listed: they are the next units of specification work after the position paper is circulated.

---

*This appendix is normative for the worked example only. The main paper (v0.1) carries the definitional weight.*
