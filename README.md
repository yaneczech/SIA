<img src="./figures/sia-logo.svg" alt="SIA" width="112" height="54">

# Semantic Interaction Architecture (SIA)

**A [Cars Making Sense](#about-cars-making-sense) initiative · v0.3.1 draft · May 2026**

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
  - `Alert` — safety-relevant, may require acknowledgement
  - `Notification` — informational, suppressible or deferrable
- `State` — runtime coordination state
- `Task` — composed multi-step flow

Each node carries machine-readable metadata for:

- **Trust** — permitted actor classes, signed origin, freshness window, replay protection, and runtime attestation.
- **Attention** — estimated glance time, task steps, cognitive load, and other audit-facing attention-demand proxies.
- **Context** — multi-axis driving context such as vehicle state, road type, driver state, autonomy state, and jurisdiction.
- **Capability negotiation** — renderer and input-device capabilities expressed as measurable constraints rather than informal labels.
- **Fallback and degradation** — explicit rules for what happens when the preferred renderer is unavailable or context is uncertain.

The architecture consists of three functional components and two cross-cutting policies:

| Part | Role |
|---|---|
| **Ontology Language + Schema Profile** | Defines the stable vocabulary, node types, metadata contracts, versioning, and compatibility rules. |
| **Translation Layer** | Maps verified semantic nodes to concrete renderers and input devices based on capabilities, context, and accessibility profile. |
| **Interaction Coordination Runtime** | Coordinates focus, acknowledgement, in-flight interaction state, and consistency across distributed renderers. |
| **Trust Policy** | Verifies that an emitted node is authorised, fresh, attributable, and protected against replay before it can reach any renderer. |
| **Context Policy** | Supplies the context vector and applies safe context-dependent modifiers to whitelisted numeric fields such as attention budgets. |

SIA sits **above** existing SDV data and service abstractions such as COVESA VSS, Eclipse Kuksa, uProtocol, and AUTOSAR Adaptive, and **below** concrete renderers such as cluster, IVI, HUD, voice, haptic, AR, and steering-wheel controls.

Renderers remain external to SIA. They declare capabilities into the Translation Layer and consume the resulting semantic rendering decisions.

---

## Minimal SIA Profile v1

The paper deliberately separates the full architecture from the first implementable profile.

The proposed **Minimal SIA Profile v1** is small enough to prototype and discuss concretely:

| Area | v1 scope |
|---|---|
| Node types | `Action`, `Alert`, `Notification` |
| Core nodes | Approximately 15 high-value nodes |
| Renderers | Cluster, IVI, voice |
| Actor classes | `human_direct`, `adas`, `service`, `third_party_app` |
| Context axes | `vehicle_state`, `road_type`, `driver_state` |
| Worked example | `Alert.Collision.Warning` end-to-end |

This keeps the first version narrow: it exercises trust verification, attention policy, context handling, capability negotiation, and runtime acknowledgement without trying to standardise the entire vehicle interaction surface at once.

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

- [**Position paper**](./01_Semantic-Interaction-Architecture-sdv.md) — the main proposal: motivation, related work, architecture, node taxonomy, metadata contracts, Trust Policy, Attention Policy, context model, capability negotiation, versioning, Minimal SIA Profile v1, and path forward.
- [**Appendix A: Worked example**](./02_Appendix-a-worked-example.md) — a concrete `Alert.Collision.Warning` traced end-to-end through ontology declaration, trust verification, translation, context handling, acknowledgement, and adversarial scenarios.
- [**Draft JSON Schema**](./schema/interaction-node.schema.json) — illustrative machine-readable encoding of the metadata contract. The paper treats schema formalism as an open design question: SHACL as authoring source of truth, JSON Schema / CBOR / Protobuf as possible runtime contracts, and a `.vspec`-style DSL as a candidate authoring surface.

---

## Key diagrams

- **Fig. 1** — Complexity comparison: before vs. after SIA
- **Fig. 2** — Position of SIA in the SDV stack
- **Fig. 3** — Mediation architecture
- **Fig. 4** — Node taxonomy
- **Fig. A.1** — `Alert.Collision.Warning` trust and translation flow

---

## Current status

This is **v0.3.1 — a draft for circulation, critique, and falsification**.

The document is not yet a standard and does not claim that no OEM-internal equivalent exists. Its absence claim is limited to publicly documented standards, open-source SDV projects, published automotive ontology work, and production-facing HMI frameworks available at the time of writing.

The immediate goal is to gather feedback before committing to:

- a schema formalism,
- a cryptographic substrate,
- a renderer capability vocabulary,
- attention-metric calibration constants,
- a reference implementation target.

---

## Open questions

The paper intentionally leaves several questions open:

1. **Schema formalism** — SHACL, JSON Schema, CBOR, Protobuf, OWL at authoring time, or a custom `.vspec`-style DSL.
2. **Trust substrate** — JWS, COSE, Verifiable Credentials, HMAC session tickets, HSM integration, and revocation policy.
3. **Attention validation** — how declared attention proxies should be calibrated against occlusion testing, eye-glance measurement, and simulator studies.
4. **Renderer arbitration** — how to ground deterministic selection among multiple valid renderer candidates.
5. **Reference implementation** — likely prototype path on top of Eclipse Kuksa or adjacent SDV infrastructure.
6. **Comparison with adjacent work** — especially VSS/VSSo, Android Automotive Car App Library, W3C MMI/EMMA, Onto-CMS, and AXIL.

---

## How to engage

Feedback is especially useful in the following forms:

- counterexamples from existing standards or production HMI frameworks,
- safety or cybersecurity objections,
- attention-model critique,
- schema formalism recommendations,
- minimal implementation proposals,
- candidate nodes for Minimal SIA Profile v1.

Feedback, counter-positions, and collaboration offers are welcome: **dizencz@gmail.com**

---

## About Cars Making Sense

Cars Making Sense is a research initiative focused on usability, UX, and interaction quality in the automotive industry. We analyse existing and historical HMI solutions, identify where they fall short, and propose better design paths — grounded in how people actually use vehicles, not only in how dashboards happen to be built.

SIA is our first concrete technical proposal: a formal answer to a recurring problem in current in-vehicle interaction design.

*Cars Making Sense — May 2026*
