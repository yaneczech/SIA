# Toward a Semantic Mediation Layer for In-Vehicle Interaction

*An architecture of meaning that survives the displays, the agents, and the decade.*

*Work-in-Progress — AutomotiveUI 2026*
*[ANONYMOUS FOR REVIEW]*

---

## Abstract

The software-defined vehicle is reshaping every layer of the in-cabin stack — except the one that matters most to the occupant. Industry effort concentrates on pixels, frameworks, and ever-larger displays, while no shared abstraction defines what an in-vehicle interaction *means*, independent of which screen renders it or which AI agent emits it. We argue that the SDV stack is missing a *mediation boundary*: a vendor-neutral layer in which interactions are described by their meaning, attention demand, contextual fitness, and authority of origin, rather than by buttons, screens, or widgets. This paper sketches such a layer — a Semantic Interaction Architecture (SIA) — with a typed node taxonomy (Actions, Events, States, Tasks), declarative metadata contracts encoding predicted attention demand and trust provenance, and a policy architecture for context-driven renderer selection. We trace a safety-critical alert through verification, context-aware translation, and adversarial rejection. The architecture opens concrete handles for AutomotiveUI research: empirical calibration of attention metrics, cross-modal equivalence studies, and trust calibration in AI-augmented vehicles. It also identifies a near-term specification agenda — ontology formalism, multi-hop trust provenance, and certified-vs-inferred acknowledgement — that this community is positioned to drive. The argument is provocative but structurally simple: existing standards cover what lives *below* the interaction (signals, transports, services) and what lives *above* it (renderers, widgets, frameworks). The thing in the middle — *what an interaction is, in itself* — has no name, no contract, and no audit trail. SIA proposes one.

---

## 1. Introduction

The software-defined vehicle is reshaping every layer of the in-cabin stack except the one that matters most to the occupant. Industry investment flows into pixels, GPUs, larger displays, voice models, gesture recognition, and AI agents — each fighting at the surface. But there is no shared abstraction that defines what an in-vehicle interaction *means*, independent of which screen happens to render it today, or which AI agent happens to emit it tomorrow.

This is not a tooling gap; it is a categorical one. The SDV stack has rich abstractions for signals (COVESA VSS), transports (uProtocol, Zenoh, SOME/IP), data brokering (Kuksa), and middleware (AUTOSAR Classic and Adaptive). It has rich vendor-specific frameworks for rendering (Qt Automotive, Kanzi, Android Automotive). What it does not have is a layer *between* them — a mediation boundary in which the meaning, attention demand, trust provenance, and contextual fitness of an interaction are described independently of its surface form. The interaction layer is where the value of the SDV becomes perceptible, where regulatory exposure concentrates, and where the marginal cost of change is highest — yet it remains the least abstracted layer of the stack.

Current HMI stacks are screen-first. A graphical layout binds a fixed widget to a fixed input device; voice and haptic modalities are added as alternatives after the fact. When a new surface arrives — or an AI agent needs to emit an interaction — the logic must be rewritten. Engineering cost rises with each new screen size or modality. User experience cost rises as the same intent (*acknowledge an alert*, *increase volume*, *navigate back*) acquires inconsistent behaviour across vehicles, generations, and contexts. Security cost rises as AI agents and third-party applications gain the ability to emit interactions that are indistinguishable, from the occupant's standpoint, from safety-critical subsystems. These costs are symptoms of the missing boundary — not a tooling deficit, not a renderer deficit, but an absent layer of architecture.

A vehicle in service for fifteen years will outlive its displays, its voice models, its compute hardware, and quite possibly its operating system. What it cannot afford to outlive is the *meaning* of `Alert.Collision.Warning`. We propose that meaning — not pixels — is the right unit of design at the interaction layer, because meaning is what must survive the turnover of every other component. The Semantic Interaction Architecture (SIA) is a vendor-neutral layer in which selected in-vehicle interactions are described by their meaning, attention demand, contextual fitness, and authority of origin, rather than by buttons, screens, or widgets. Its central claim is uncomfortable but precise: while the industry has spent two decades building the surface, the structure underneath has remained implicit. SIA names it.

The first version of such a layer should be deliberately narrow. We scope the proposal to three cores: *intent/action abstraction* for high-value commands and events, *attention policy* for priority, interruptibility, and driving context, and *trust provenance* for determining which actors may emit which interaction types with which authority. The ontology language is designed for incremental adoption and long lifecycle compatibility.

---

## 2. Related Work

**SDV data and service layers.** COVESA VSS defines a vendor-neutral catalogue of vehicle signals [COVESA]. Eclipse Kuksa, uProtocol, and Chariott abstract data brokering, messaging, and service discovery [Eclipse SDV]. None of these projects model what an interaction *means to the occupant*; they model how services and signals communicate.

**HMI frameworks.** Android Automotive's Car App Library is the closest production-grade analogue to a semantic interaction model: applications declare templates and a host renders them with built-in distraction optimisation [Google]. Its scope is bounded to supported app categories within the host-controlled Android Automotive OS ecosystem. Qt Automotive and Kanzi offer renderer-side abstractions without cross-renderer interaction semantics.

**Multimodal interaction.** The W3C MMI Recommendation and EMMA annotation format define a generic semantic model for multimodal input [W3C MMI, W3C EMMA]. Automotive uptake has been limited; the vocabulary remains a candidate substrate for the input side of SIA.

**Adjacent domains.** Unreal's Enhanced Input and Unity's Input System abstract actions from devices in game engines. ARIA performs an analogous role for web accessibility. These precedents demonstrate tractability; they have not been adapted to automotive constraints (ASIL, regulated distraction limits, multi-renderer safety requirements, 15-year vehicle lifecycles).

SIA occupies the gap above SDV service abstractions and below concrete renderers — the missing connective tissue that none of the above projects addresses.

---

## 3. Mediation Architecture

We propose a mediation architecture of three functional components and two cross-cutting policy functions. Renderers and input devices are external to SIA and interface with it through capability declarations. This is not a complete HMI platform; it defines what crosses the semantic boundary and how policy is applied, leaving renderer implementation and GUI framework behaviour to existing stacks.

```mermaid
flowchart TB
    EXT2(["<b>Agents · Services · ADAS</b><br/>SDV transport — Kuksa · uProtocol · service registry"])

    subgraph SIA ["Semantic Interaction Architecture"]
        direction TB
        O["<b>Ontology Language + Schema Profile</b><br/>Typed primitives · metadata contracts · compatibility<br/><i>— long-term language of meaning —</i>"]

        subgraph FLOW [" "]
            direction LR
            TL["<b>Trust Policy</b><br/>Req. vs attestation<br/>actor_class · freshness · replay · provenance"]
            T["<b>Translation Layer</b><br/>node × capabilities × context → modality decision"]
            RT["<b>Interaction Coordination Runtime</b><br/>focus · task-flow · acknowledgement · cross-renderer consistency"]
        end

        CE["<b>Context Policy</b><br/>SAE level · Road type · Vehicle state · Driver state · Market jurisdiction"]
    end

    EXT_R(["<b>Renderers and input devices — external</b><br/>HUD · Cluster · IVI · Voice · Haptic · AR · Steering wheel"])
    EXT1(["<b>Occupant</b><br/>input/output"])

    EXT2 -->|"emit node + attestation"| TL
    O -.->|"schema"| TL
    O -.->|"contract"| T
    TL -->|"verified"| T
    T --> RT
    CE -.->|"modulates"| T
    CE -.->|"modulates"| RT
    RT -->|"modality decision · dispatch"| EXT_R
    EXT_R -.->|"capabilities"| T
    EXT_R <-->|"render · input · ack"| EXT1

    style O fill:#454ADE,stroke:#454ADE,stroke-width:2px,color:#ffffff
    style TL fill:#fde047,stroke:#1a1a1a,stroke-width:1.5px,color:#1a1a1a
    style CE fill:#fde047,stroke:#1a1a1a,stroke-width:1.5px,color:#1a1a1a
    style T fill:#ffffff,stroke:#1a1a1a,stroke-width:1.5px,color:#1a1a1a
    style RT fill:#ffffff,stroke:#1a1a1a,stroke-width:1.5px,color:#1a1a1a
    style EXT2 fill:#7a5d4d,stroke:#1a1a1a,stroke-width:1.5px,color:#ffffff
    style EXT_R fill:#a85555,stroke:#1a1a1a,stroke-width:1.5px,color:#ffffff
    style EXT1 fill:#a85555,stroke:#1a1a1a,stroke-width:1.5px,color:#ffffff
    style SIA fill:#c7d2fe,stroke:#454ADE,stroke-width:2px
    style FLOW fill:none,stroke:none
```

*Figure 1. Mediation architecture. SIA contains three functional components (Ontology, Translation, Runtime) and two cross-cutting policies (Trust, Context). Emitters and renderers are external; they interface with SIA through Trust Policy (entry) and capability/dispatch flows (exit).*

**Ontology Language and Schema Profile.** A stable language defines the long-term vocabulary of interaction meaning, inheritance, metadata contracts, and compatibility rules. The first standardisation target is a small typed event/command schema profile for high-value interactions — tractable to implement without locking in a deep class hierarchy.

**Translation Layer.** A bidirectional adaptor that maps semantic nodes to concrete modalities given a capability set and context. Inputs: the node, declared renderer and input device capabilities, the active context vector, and user accessibility profile. Output: a candidate modality set and rendering or input mapping decision.

**Interaction Coordination Runtime.** A coordination function for focus, in-flight task flows, acknowledgement timers, and consistency across distributed renderers. It does not replace a GUI framework; it coordinates semantic state that multiple renderers must share.

**Trust Policy** verifies message origin, freshness, and authority before semantic propagation. **Context Policy** supplies a continuously updated vector of driving context that modulates priority, modality preference, and suppression rules.

**Renderers and input devices are external to SIA.** Concrete output and input surfaces — HUD, cluster, IVI touchscreen, voice, haptic, AR, steering wheel controls — are vendor-specific implementations that consume modality decisions from the Runtime and declare measurable capabilities into the Translation Layer. They are not components of SIA; keeping them external is what allows SIA to remain vendor-neutral. Renderers are interchangeable; the ontology is not.

---

## 4. Node Taxonomy and Metadata Contracts

A common failure mode in interaction schemas is conflating semantically different node types into a single generic message model. SIA separates four primary semantic primitives, each with its own metadata contract.

```mermaid
graph TB
    I(["<b>Interaction</b>"])
    A["<b>Action</b><br/><i>user → system</i>"]
    E["<b>Event</b><br/><i>system → user</i>"]
    S["<b>State</b><br/><i>runtime-internal</i>"]
    T["<b>Task</b><br/><i>composed flow</i>"]
    AL["<b>Alert</b>"]
    N["<b>Notification</b>"]

    I --> A & E & S & T
    E --> AL & N

    style I fill:#eef0ff,stroke:#454ADE,stroke-width:2px,color:#454ADE
```

*Figure 2. Node taxonomy. Four primary types with distinct metadata contracts; Event splits into Alert and Notification. Subclasses may strengthen but not weaken contracts.*

**Action** — occupant-initiated; discrete, sustained, or continuous. Carries `attention_metrics`, `temporal_type`, `recommended_modality`.

**Event** — system-initiated; splits into **Alert** (safety-relevant, may require acknowledgement) and **Notification** (informational, suppressible). Alerts carry `priority`, `requires_ack`, `trust_requirements`.

**State** — focus, mode, and context transitions consumed by the coordination runtime. Carries `scope`, `target_role`, `consistency_class`.

**Task** — a composed multi-step flow over Actions and States with resumption semantics. Carries `step_count`, `interruptible_at`, `resumable_across_contexts`.

Every node carries two categories of metadata fields: **declarative** fields defined in the ontology and stable across deployments (e.g., `attention_metrics`, `trust_requirements`, `fallback_chain`), and **runtime** fields filled by the emitter at the moment of emission (e.g., attestation, instance payload). Table 1 summarises mandatory (●), optional (○), and not-applicable (—) fields for each type.

| Field | Action | Alert | Notification | State | Task |
| --- | --- | --- | --- | --- | --- |
| `since_version` | ● | ● | ● | ● | ● |
| `attention_metrics` | ● | ● | ● | — | ● |
| `priority` | — | ● | ● | — | — |
| `requires_ack` | — | ● | ○ | — | — |
| `trust_requirements` | ○ | ● | ○ | ○ | ○ |
| `suppression_class` | — | ● | ● | — | — |
| `fallback_chain` | ● | ● | ● | — | ● |
| `degradation_policy` | ● | ● | ● | — | ● |

*Table 1. Partial metadata contract by node type (abbreviated). Full contract in the companion position paper.*

---

## 5. Trust and Attention Policy

### 5.1 Trust

Current SDV cybersecurity practice — ISO/SAE 21434 [ISO 21434], UNECE R155 [UNECE R155] — addresses firmware integrity, ECU authentication, and transport security. These are necessary but insufficient: they do not constrain what an authenticated actor is *authorised to say* at the interaction level. An attacker who cannot compromise the brakes can still suppress a collision warning, inject a fake alert, or elevate the priority of a benign notification to displace a critical one.

SIA separates trust into two artefacts. **Trust requirements** are declared on the node in the ontology — what consumers must verify before propagating or rendering. **Trust attestation** is attached to the instance by the emitter — cryptographic and provenance evidence that requirements are met. The Trust Policy verifies attestation satisfies requirements before the node propagates. Trust failures are **fail-closed**: the node is rejected and a `SecurityEvent` is logged; it never reaches Translation or a renderer. This is distinct from `degradation_policy`, which governs only renderer capability fallback (e.g., routing to voice when the HUD is unavailable) *after* a trust check has already passed.

An `actor_class` taxonomy drives policy mechanically: `adas` and `vsc` may emit safety-critical alerts; `agent_local` and `agent_cloud` may not — regardless of how the agent was prompted. This is a structurally stronger property than service-level authentication: it constrains what kinds of things an authenticated actor may say, not merely whether it may speak.

### 5.2 Attention

Contemporary HMI guidelines (NHTSA, ISO 15005, JAMA) prescribe measurable thresholds — total eyes-off-road time (TEORT), single glance duration, task step count. Most software-side frameworks operate on qualitative tags (`distraction-optimised: true/false`) not directly auditable against those thresholds.

SIA attaches predicted attention-demand proxies to every interaction-bearing node:

```yaml
attention_metrics:
  glance_time_estimated_ms: 1500
  mean_single_glance_ms: 400
  task_steps: 3
  voice_alt_available: true
  cognitive_load: moderate
```

The Translation Layer composes node metrics with a context modifier from Context Policy (`effective_cost = base_metric × context_modifier`). Budgets are configured **per node class and per context** — e.g., ≤ 1500 ms TEORT for `Alert.*` (safety-critical) and ≤ 2000 ms TEORT for general `Action.*` under manual highway driving — enabling explicit, mechanical policy decisions to reject, defer, or transform interactions that exceed them.

---

## 6. Worked Example: Alert.Collision.Warning

We trace a single safety-critical alert end-to-end to make the contracts concrete.

**Ontology declaration (abbreviated):**

```yaml
node: Interaction.Event.Alert.Collision.Warning
priority: 95
requires_ack: true
ack_authority: driver_only
trust_requirements:
  permitted_actor_classes: [adas, vsc]
  max_age_ms: 200
  replay_protection: required
attention_metrics:
  glance_time_estimated_ms: 600
suppression_class: safety_critical
fallback_chain: [hud, cluster, voice, haptic]
```

**Trust verification:**

```mermaid
sequenceDiagram
    participant ADAS as ADAS (emitter)
    participant Trust as Trust Policy (verifier)
    participant Trans as Translation + Context
    participant Runtime as Runtime
    participant Renderers as Renderers

    ADAS->>Trust: emit instance + attestation
    alt trust verification fails
        Trust-->>ADAS: reject + log SecurityEvent
    else trust verification passes
        Trust->>Trans: verified node propagates
        Trans->>Runtime: allocate focus slot · arm ack timer
        Runtime->>Renderers: dispatch (multicast)
        Renderers->>Runtime: ack (input | gaze | timeout)
        Runtime->>Trust: close interaction · log outcome
    end
```

*Figure 3. Sequence flow for Alert.Collision.Warning. Trust Policy is a chokepoint before Translation. Renderer dispatch is multicast; acknowledgement is tracked by Runtime.*

**Context-dependent translation.** Under manual highway driving (`sae_level: 1`, `vehicle_state: moving`, `traffic_density: dense`), the Translation Layer selects HUD as primary with concurrent cluster and haptic, and rejects IVI touchscreen (off-axis, exceeds attention budget under dense-traffic modifier). Under L4 autonomous driving (`sae_level: 4`, `driver_state: not_monitoring`), HUD is de-prioritised in favour of cluster and full-sentence voice prompt; Context Policy scales the effective `ack_timeout_ms` from a base of 3000 ms to 6000 ms via its published modifier rule (the node's declarative value is unchanged).

**Adversarial rejection.** A third-party application addressing `Alert.Collision.Warning` is rejected as an unauthorised emission (`third_party_app ∉ permitted_actor_classes`), even when its own app-store signature is valid. A class-spoofing attempt — the same app falsely attesting `actor_class: adas` — fails at signature verification because the app lacks the ADAS signing key. A replay of a 1100 ms-old instance is rejected because age exceeds `max_age_ms: 200`. A local LLM agent is rejected on the same class basis. Priority injection — an adversary emitting a notification with `priority: 99` — is defeated because priority is a property of the ontology declaration, not the instance.

---

## 7. Implications for AutomotiveUI Research

SIA's value depends on empirical foundations that the AutomotiveUI community is uniquely positioned to provide. We identify five concrete research handles, each addressable with methods this community already practices.

**Attention as a first-class research variable.** The `attention_metrics` contract makes declared attention cost comparable across HMI designs, OEMs, and evaluation studies — without requiring every comparison to be grounded in a new user study. Researchers could evaluate whether declared proxies predict empirical TEORT, and how context modifiers should be calibrated. This creates a feedback loop between user studies and the ontology itself.

**Cross-renderer semantic equivalence.** By expressing the same interaction node across modalities (visual, voice, haptic), SIA enables controlled studies of cross-modal equivalence — does `Alert.Collision.Warning` delivered via voice versus HUD produce equivalent driver response? Currently such comparisons are confounded by differing implementations; a shared semantic node removes that confound.

**Trust and agency in AI-augmented vehicles.** The `actor_class` taxonomy provides a vocabulary for the growing AutomotiveUI literature on in-vehicle agents. Empirical work on driver trust calibration, appropriate reliance, and agent transparency can be grounded in the structural distinction between `agent_local`, `agent_cloud`, `adas`, and `human_direct` — classes that carry different implied authority and verifiability.

**Context-adaptive interaction design.** The multi-axis context vector (`sae_level`, `driver_state`, `road_type`, `vehicle_state`, `market_jurisdiction`) formalises the context space that AutomotiveUI researchers use informally. Experiments can be designed against explicit context predicates rather than bespoke scenario definitions, improving replicability.

**Standardisation input.** AutomotiveUI researchers regularly engage with industry and standards bodies. Empirical validation of the attention metric composition formula, the priority scale, and the ack_kind distinction (certified versus inferred acknowledgement) are directly actionable contributions to a future standardisation process.

None of these threads requires the architecture be standardised first; on the contrary, the standardisation effort itself depends on this work happening early. We invite collaboration on any of them — from individual empirical studies to multi-site replications — and treat AutomotiveUI as the principal venue where SIA's empirical foundations should be developed.

---

## 8. Open Questions

This work is scoped to a position paper. We surface the following as the most urgent open questions, where community contribution would directly shape the standard's first version.

1. *Schema formalism.* JSON Schema, OWL/SHACL, or a VSS-style custom format generating to JSON Schema. The choice has long-term tooling and adoption consequences.
2. *Empirical validation of attention metric composition.* The `effective_cost = base × context_modifier` formula requires user study evidence. The composition law is likely not scalar.
3. *Certified versus inferred acknowledgement.* `ack_kind: gaze` mixes deterministic input with probabilistic inference; the ontology may need to distinguish certified from inferred acknowledgement, with different safety implications.
4. *Multi-hop trust provenance.* In agentic deployments, the provenance chain may have multiple hops (`sensor → adas → trust_verifier → runtime`); chain-level trust composition is not yet specified.
5. *Reference implementation and tooling roadmap.* Architecture adoption is gated not only on specification quality but on the availability of a supporting toolchain. Prior art from W3C MMI and related efforts suggests that well-specified interfaces without reference tooling consistently fail to achieve adoption. We identify three tooling layers, each a prerequisite for the next.

   **Core layer.** A machine-readable schema (JSON Schema or Protobuf) for Action, Event, State, and Task nodes with their full metadata contracts; a validation engine that answers "may this node be rendered in this context?" given the active context vector; and a declarative policy engine (OPA/Rego-style) encoding rules such as "`agent_local` actors may not emit `safety_critical` nodes" and "a `fallback_chain` with no `voice` entry is invalid during L4 autonomy."

   **Integration layer.** Thin adaptors to COVESA VSS, Eclipse Kuksa, and uProtocol so that SIA is a plug-in layer over existing SDV transports rather than a replacement. A renderer capability interface — analogous to Android's capability detection or React Native's platform abstraction — through which concrete surfaces declare what they can render and at what attention cost. An agent interface that accepts semantic node payloads from LLM-based agents and routes them through trust verification before any UI surface is reached.

   **Developer tooling.** A context simulator that exercises the Translation Layer against scripted driving contexts and failure modes; a structured debugger that makes suppression decisions transparent (*"collision warning suppressed — reason: `actor_class agent_local` ∉ `permitted_actor_classes`"*); and a declarative test harness expressing automotive certification scenarios as given/when/then predicates against the schema and policy engine. The test harness is likely the most direct contribution to ASIL-relevant certification workflows and the tool most likely to determine whether practitioners adopt SIA or not.

Each of these is approachable through methods already standard in this community: simulator studies for attention calibration (#2), controlled experiments for the certified-vs-inferred acknowledgement distinction (#3), mixed-methods work on multi-hop trust scenarios (#4), and reference-implementation contributions for the tooling roadmap (#5). Short empirical studies and full specification contributions are equally welcome — and equally needed to shape the standard before it freezes.

---

## References

- COVESA. *Vehicle Signal Specification.* https://covesa.global/project/vehicle-signal-specification/
- Eclipse Foundation. *Eclipse SDV Working Group.* https://sdv.eclipse.org/
- W3C. *Multimodal Architecture and Interfaces 1.0.* W3C Recommendation, 2012.
- W3C. *EMMA: Extensible MultiModal Annotation Markup Language.* W3C Recommendation, 2009.
- ISO 15005:2017. *Road vehicles — Ergonomic aspects of transport information and control systems.*
- ISO/SAE 21434:2021. *Road vehicles — Cybersecurity engineering.*
- UNECE Regulation No. 155. *Cybersecurity and cybersecurity management system.*
- NHTSA. *Visual-Manual NHTSA Driver Distraction Guidelines for In-Vehicle Electronic Devices.* 2012.
- Google. *Android for Cars App Library.* https://developer.android.com/training/cars/apps
- Ebel, P., Lingenfelder, C., Vogelsang, A. *Measuring Interaction-based Secondary Task Load.* arXiv:2108.13243, 2021.
- Demir, C., Meschtscherjakov, A., Gärtner, M. *Unlocking Trust and Acceptance in Tomorrow's Ride.* MTI 8(12):111, 2024.
- Gomaa, A. *Adaptive user-centered multimodal interaction towards reliable and trusted automotive interfaces.* ICMI 2022.
- *Agent2Agent Threats in Safety-Critical LLM Assistants: A Human-Centric Taxonomy.* arXiv:2602.05877, 2026.

---

*Work in progress. Comments and counter-positions invited.*
