<img src="./figures/sia-logo.svg" alt="SIA" width="112" height="54">

# Semantic Interaction Architecture (SIA)

**A [Cars Making Sense](#about-cars-making-sense) initiative · v0.4.0 draft · July 2026**

> **What if a collision warning could declare, in machine-readable terms, who is allowed to emit it, how fresh its attestation must be, what attention budget it consumes, and which renderer may present it — without that logic being duplicated inside every screen, widget, or assistant?**

This repository contains a draft position paper proposing **Semantic Interaction Architecture (SIA)**: a narrow semantic mediation layer for high-value interactions in software-defined vehicles.

SIA decouples the **meaning**, **trust requirements**, **attention demand**, **context fitness**, and **renderer capability requirements** of an in-vehicle interaction from its concrete presentation on a screen, voice channel, cluster, HUD, or other HMI surface.

The proposal is intentionally framed as a **mediation contract**, not as a replacement for existing SDV platforms, HMI frameworks, or vehicle middleware.

---

## The problem

Modern vehicle HMI is still largely renderer-first and tightly coupled. The same intent — *acknowledge an alert*, *increase volume*, *navigate back*, *warn the driver* — is often implemented separately for each screen size, input device, voice assistant, application surface, and vehicle generation.

That creates three recurring costs:

- **Engineering cost:** each new surface or modality triggers duplicated implementation logic.
- **User experience cost:** the same intent behaves differently across vehicles, OTA versions, and renderers.
- **Interaction-integrity cost:** third-party apps, cloud services, and AI agents may become able to emit occupant-facing messages without a shared semantic authority model.

SIA starts from the claim that the missing abstraction is not another graphical toolkit, transport layer, or vehicle data model. The missing layer is a shared vocabulary for **what an interaction means**, **who is authorised to emit it**, **what attention it demands**, and **how it should be translated into available renderers**.

---

## The proposal

SIA defines a typed semantic vocabulary for in-vehicle interactions. In the full architecture, interaction nodes are organised as:

- `Action` — occupant-initiated interaction
- `Event` — system-initiated interaction
  - `Alert` — safety-relevant, may declare a separate occupant response
  - `Notification` — informational, with explicit drop, defer, or coalesce behaviour when blocked
- `State` — runtime coordination state
- `Task` — composed multi-step flow

Each node carries machine-readable metadata for:

- **Trust** — signed catalog and authority registry, declaration/credential binding, permitted actor classes, signed origin, freshness, semantic validity, revocation, and replay protection.
- **Attention** — estimated glance time, task steps, cognitive load, and other audit-facing attention-demand proxies.
- **Context** — multi-axis driving context such as vehicle state, road type, driver state, autonomy state, and jurisdiction.
- **Capability negotiation** — renderer and input-device capabilities expressed as measurable constraints rather than informal labels.
- **Lifecycle and feedback** — applicability, bounded retention, deterministic render plans, renderer delivery receipts, and separate occupant responses.

The architecture consists of three functional components and two cross-cutting policies:

| Part | Role |
|---|---|
| **Ontology Language + Schema Profile** | Defines the stable vocabulary, node types, metadata contracts, versioning, and compatibility rules. |
| **Translation Layer** | Maps verified semantic nodes to concrete renderers and input devices based on capabilities, context, and accessibility profile. |
| **Interaction Coordination Runtime** | Coordinates bounded retention, renderer delivery, occupant response, in-flight state, and consistency across distributed renderers. |
| **Trust Policy** | Verifies all eight requirements against the signed catalog and current actor credential before a node can reach any renderer. |
| **Context Policy** | Supplies signed per-axis rules and an authenticated context snapshot; decides applicability or the declaration's blocked disposition without changing semantic identity. |

SIA sits **above** existing SDV data and service abstractions such as COVESA VSS, Eclipse Kuksa, uProtocol, and AUTOSAR Adaptive, and **below** concrete renderers such as cluster, IVI, HUD, voice, haptic, AR, and steering-wheel controls.

Renderers remain external to SIA. They declare capabilities into the Translation Layer and consume the resulting semantic rendering decisions.

---

## Minimal SIA Profile 0.4.0

The paper deliberately separates the full architecture from the first implementable profile.

The proposed **Minimal SIA Profile 0.4.0** is small enough to implement and test concretely:

| Area | 0.4.0 scope |
|---|---|
| Emitted node types | `Alert`, `Notification` (`Action` awaits a complete input/execution profile) |
| Published reference nodes | Five executable declarations (two Alerts, three Notifications); the catalog remains extensible |
| Renderers | Cluster, IVI, voice |
| Actor classes | `human_direct`, `adas`, `service`, `third_party_app`, `agent_local`, `agent_cloud` |
| Context axes | `motion_state`, `operating_mode`, `energy_state`, `road_type`, `driver_state`, `occupancy` |
| Worked example | `Alert.Collision.Warning` end-to-end |

This keeps the first profile narrow while exercising trust verification, attention policy, explicit context outcomes, bounded retention, capability negotiation, renderer delivery, and separate occupant response.

---

## What SIA is not

SIA is not:

- a GUI framework,
- an infotainment operating system,
- a replacement for COVESA VSS, Kuksa, uProtocol, AUTOSAR, Android Automotive, Qt, Kanzi, or other HMI tooling,
- a proof that an interaction is compliant with NHTSA, ISO, UNECE, or JAMA guidelines,
- a system that determines whether a physical hazard is real.

SIA addresses **interaction integrity**: whether an occupant-facing interaction claim is authorised, fresh, attributable, context-appropriate, and eligible for presentation.

For example, SIA does not decide whether a collision is physically imminent. It decides whether an emitted `Alert.Collision.Warning` is allowed to enter the interaction pipeline and which renderer may present it under the current context.

---

## Who this is for

| You are… | The relevant question |
|---|---|
| An HMI or UX engineer at an OEM or Tier-1 | Could my renderer consume a semantic stream instead of duplicating interaction logic? |
| An SDV platform architect | Where should the interaction layer live relative to Kuksa, uProtocol, S-CORE, and AUTOSAR Adaptive? |
| A cybersecurity engineer | How do we prevent AI agents or third-party apps from spoofing safety-critical alerts? |
| A safety or ergonomics researcher | Can attention demand be represented in a way that is testable, auditable, and context-aware? |
| An AutomotiveUI, CHI, HCII, or escar researcher | Is there a tractable formalisation of in-vehicle interaction semantics? |
| An Eclipse SDV contributor | Could this become a complement to existing SDV service, trust, and AI-agent work? |

---

## Read the paper

- [**Position paper**](./01_Semantic-Interaction-Architecture-sdv.md) — motivation, related work, architecture, node taxonomy, policy model, Minimal SIA Profile 0.4.0, and path forward.
- [**Appendix A: Worked example**](./02_Appendix-a-worked-example.md) — a concrete `Alert.Collision.Warning` traced end-to-end through declaration, trust, context, translation, renderer delivery, occupant response, retention, and adversarial scenarios.
- [**Core Specification**](./03_Core-Specification.md) — the normative 0.4.0 lifecycle, retention, delivery, security, compatibility, and conformance requirements.
- [**JSON Schema contracts**](./schema/) — strict contracts for signed catalogs, policies, actor credentials, declarations, instances, context, capabilities, retention, render plans, dispatch attempts, delivery, occupant response, and audit.
- [**Validated examples**](./examples/v0.4.0/) — executable positive conformance material used by automated tests.
- [**Interactive demo**](./demo/) — a dark-mode visual walkthrough and test lab using the same 0.4.0 outcomes and feedback loops as the engine tests.
- [**Threat model**](./04_Threat-Model.md) — the consolidated threat-to-mitigation table, non-goals, and residual risks accepted in 0.4.0.
- [**Reason-code registry**](./registry/reason-codes.json) — the normative machine-readable codes for trust, context, retention, translation, delivery, and occupant-response outcomes.
- [**Conformance vectors**](./conformance/) — language-neutral positive and negative test vectors, tagged by conformance class (`emitter`, `renderer`, `runtime`) so a supplier tests only the side of the boundary it owns.
- [**Cryptographic vectors**](./conformance/crypto/) — published test keys and really-signed examples, so implementers can verify both their signing and their verification code, including tamper and algorithm-confusion rejections.
- [**Versioning policy**](./VERSIONING.md) — how the wire contract, the node catalog, registries, and vectors are allowed to evolve.
- [**Source-of-truth map**](./SOURCE_OF_TRUTH.md) — which artifact owns each concept and how schemas, examples, demo, and documentation are kept aligned.
- [**Node authoring guide**](./05_Node-Authoring-Guide.md) — the checklist for designing a new interaction node, from meaning to payload.
- [**Glossary**](./GLOSSARY.md) — every normative term on one page.
- [**Runtime reference architecture**](./notes/reference-architecture.md) — non-normative implementation guidance for bounded queues, scheduling, authentication placement, and the target-hardware evidence campaign.

---

## Validate your first artifact in two minutes

```bash
npm ci
npm test                                                    # full conformance suite
npm run check:demo-profile                                  # generated demo data matches canonical artifacts
npm run validate -- examples/v0.4.0/collision-warning.instance.json
npm run conformance -- emitter                              # vectors for your conformance class
npm run benchmark:quick                                     # development-host timing; never production evidence
```

The [portable benchmark harness](./bench/) measures the repository implementation and burst queue behaviour while target hardware is unavailable. Its results are explicitly non-normative; production latency claims require the same methodology on representative ECU/SoC, HSM, OS, transport, renderer, and mixed-load conditions.

The [runtime reference architecture](./notes/reference-architecture.md) connects those measurements to a bounded implementation shape: isolated traffic classes, reserved critical capacity, deadline-ordered work, pre-authentication admission, explicit overload outcomes, and deployment-owned authentication placement. It remains guidance rather than a second normative contract.

The validator auto-detects the contract, validates it in JSON Schema 2020-12 strict mode, verifies payload digests and signatures made with published test keys, and evaluates cross-artifact authority, time, context, and lifecycle invariants against the published dependency set. Production trust anchors remain deployment-owned. `npm run digest -- <file.json>` prints the RFC 8785 canonical SHA-256 used by every digest binding. The same suite runs in CI on every push.

---

## Key diagrams

- **Fig. 1** — Complexity comparison: before vs. after SIA
- **Fig. 2** — Position of SIA in the SDV stack
- **Fig. 3** — Mediation architecture
- **Fig. 4** — Node taxonomy
- **Fig. A.1** — `Alert.Collision.Warning` trust and translation flow

---

## Current status

This is **v0.4.0 — a pre-standard draft for implementation, critique, and falsification**.

The document is not yet a standard and does not claim that no OEM-internal equivalent exists. Its absence claim is limited to publicly documented standards, open-source SDV projects, published automotive ontology work, and production-facing HMI frameworks available at the time of writing.

Version 0.4.0 makes the previously illustrative runtime contract executable. The immediate goal is to validate:

- the lifecycle and reason-code vocabulary,
- the production cryptographic and canonical-encoding profile,
- renderer capability attestations and delivery semantics,
- attention-metric calibration constants,
- safety fallback behaviour and a reference implementation target.

---

## Open questions

The paper intentionally leaves several questions open:

1. **Production encoding** — canonical JSON, deterministic CBOR/COSE, or generated Protobuf for constrained paths.
2. **Trust-anchor operations** — production key provisioning, HSM integration, rollover, recovery, and algorithm agility; the artifact and revocation bindings are defined in 0.4.0.
3. **Attention validation** — calibration against occlusion testing, eye-glance measurement, and simulator studies.
4. **Safety case** — bounded latency, fail-operational fallback, and coexistence with certified legacy alert paths.
5. **Reference implementation** — likely prototype path on Eclipse Kuksa or adjacent SDV infrastructure.
6. **Comparison with adjacent work** — especially VSS/VSSo, Android Automotive Car App Library, W3C MMI/EMMA, Onto-CMS, and AXIL.

---

## How to engage

Feedback is especially useful in the following forms:

- counterexamples from existing standards or production HMI frameworks,
- safety or cybersecurity objections,
- attention-model critique,
- schema and interoperability counterexamples,
- minimal implementation proposals,
- candidate nodes and conformance vectors for Minimal SIA Profile 0.4.0.

Feedback, counter-positions, and collaboration offers are welcome: **dizencz@gmail.com**

---

## About Cars Making Sense

Cars Making Sense is a research initiative focused on usability, UX, and interaction quality in the automotive industry. We analyse existing and historical HMI solutions, identify where they fall short, and propose better design paths — grounded in how people actually use vehicles, not only in how dashboards happen to be built.

SIA is our first concrete technical proposal: a formal answer to a recurring problem in current in-vehicle interaction design.

*Cars Making Sense — July 2026*
