# SIA Glossary

Terms as used normatively in the [Core Specification](./03_Core-Specification.md). Version 0.4.0.

| Term | Meaning |
|---|---|
| **Declaration** (interaction node) | The catalog entry defining what an interaction means and every policy it carries: trust, attention, context, presentation, occupant response. Authored once, versioned, authoritative. |
| **Instance** (runtime instance) | One emission of a declared node: identity, payload, timing, attestation. Can never override declaration-owned policy. |
| **Catalog** | The signed, versioned collection of unique declarations installed in a vehicle; instances bind its canonical digest. |
| **Actor registry / credential** | Signed authority state mapping a credential and key to one actor identity/class, validity interval, and active or revoked status. |
| **Actor class** | The semantic authority category of an emitter (`adas`, `service`, `third_party_app`, `agent_local`, `agent_cloud`, `human_direct`). Authentication proves identity; actor class bounds what identity may say. |
| **Attestation** | The evidence block on an instance: actor identity, key, algorithm, timestamp, nonce, signature over the canonical form. |
| **Ingress freshness** | Maximum total age between the signed attestation timestamp and Trust Policy acceptance (`max_ingress_age_ms`). Signing, HSM queueing, transport, validation, and verification after that timestamp consume the window. |
| **Semantic validity** | The latest instant at which the interaction still represents useful current meaning (`valid_until_ms`). Second clock. |
| **Retention TTL** | How long a context-blocked instance may stay held before deterministic expiry. Third clock. |
| **Attention metric** | An estimated occupant-facing glance or cognitive cost used during renderer eligibility. It is not a protocol execution deadline and is empirically calibrated by the deployment. |
| **Delivery timeout** | The bounded lifetime of one dispatch attempt. It is independent of ingress freshness and is capped by remaining semantic validity. |
| **Applicability** | Whether a node is meaningful in the current context at all (`moving_only` lane-departure warning while charging → `not_applicable`; collision warning remains applicable). Not the same as blocking. |
| **Blocking** | An applicable interaction that context does not allow to present right now. Resolved by exactly one declared disposition. |
| **Disposition** | The declared answer to blocking: `never_block`, `drop`, `defer`, or `coalesce`. |
| **Coalescing key** | Canonical identity of a retained value stream; only the newest instance per key is held. Stored as a keyed digest, never raw values. |
| **Held / released / superseded / expired** | Retention states: waiting within TTL; re-entering translation after a context trigger; replaced by a newer coalesced instance; dropped at TTL. |
| **Context policy** | Signed rules defining per-axis freshness, confidence, unknown handling, attention modifiers, and policy identity. |
| **Context snapshot** | The authenticated, immutable set of orthogonal axis observations (`context_id`) and exact policy binding used by a decision. |
| **Render plan** | The deterministic output of Translation: selected renderers with roles, rejected renderers with reason codes, delivery policy. |
| **Dispatch attempt** | One ordered attempt to send a verified plan to a selected renderer, with predecessor, sequence, dispatch time, and bounded deadline. |
| **Delivery receipt** | Machine evidence from a renderer: `received` (transport acceptance) or `presented` (occupant-facing output produced). `timed_out` comes only from Coordination Runtime. |
| **Delivery success policy** | When delivery counts as done: `any_selected_presented`, `primary_presented`, or `all_required_presented`. |
| **Occupant response** | The separate human feedback loop. Opens only after delivery success; a timeout is runtime evidence, never an occupant action. |
| **Presented ≠ noticed** | Presentation, awareness, comprehension, and acknowledgement are distinct claims; SIA contracts only the first and last. |
| **Reason code** | Stable machine identifier of a transition outcome, allocated in [`registry/reason-codes.json`](./registry/reason-codes.json). Unknown code = failure outcome, never relaxation. |
| **Audit record** | Hash-linked evidence of one decision, binding instance, phase, outcome code, and all policy versions. |
| **Fail closed** | On any verification failure the interaction stops before renderers; criticality never overrides trust failure. |
| **Fail operational** | Deployment-owned ability to preserve a required safety indication when SIA or a dependency is unavailable, without creating duplicate presentation. |
| **Conformance class** | The subset of duties an implementation claims: `emitter`, `renderer`, or `runtime`. |
| **Interaction integrity** | The property SIA defends: meaning, priority, and origin of an occupant-facing interaction are what they claim to be. |
