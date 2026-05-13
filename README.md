# Semantic Interaction Architecture (SIA)

**A [Cars Making Sense](#about-cars-making-sense) initiative · v0.1 draft · May 2026**

> **What if a collision warning could declare, in machine-readable terms, that it cannot be suppressed, must reach the driver within 200 ms, requires a signed origin, and degrades to voice if the HUD is unavailable — without any of that logic living inside a renderer?**

This repository contains a position paper proposing exactly that: a semantic interaction layer for Software-Defined Vehicles that separates *what an interaction means* from *how it is rendered*.

This repository contains a draft position paper proposing a semantic mediation layer for high-value interactions in software-defined vehicles. SIA decouples the meaning, trust requirements, attention demand, and context fitness of in-vehicle interactions from concrete screens, widgets, input devices, and renderers.

## The problem

Modern vehicle HMI is screen-first and tightly coupled. The same intent — *acknowledge an alert*, *increase volume*, *navigate back* — is implemented separately for each screen size, each input device, each voice assistant, and each OEM. When a new surface arrives, or an AI agent needs to emit an interaction, the logic has to be rewritten from scratch.

This costs engineering time. It produces inconsistent experiences. And it creates a security gap: there is currently no standard way to prevent a third-party app or a cloud AI agent from spoofing the priority or origin of a safety-critical alert.

## The proposal

SIA defines a **typed node ontology** — Actions, Events, States, Tasks — where every node carries machine-readable metadata for:

- **Attention** — predicted glance time, task steps, cognitive load; auditable against NHTSA/JAMA/ISO thresholds
- **Trust** — required actor class, signed origin, freshness window, replay protection
- **Context** — a multi-axis vector (SAE level, road type, driver state, regulatory regime) that modulates rendering policy
- **Capability negotiation** — renderers declare measurable capabilities; the Translation Layer picks the right surface mechanically

A six-layer architecture (Ontology → Translation → Runtime → Renderer, with Trust and Context Engine spanning the stack) sits above existing SDV data and service abstractions (COVESA VSS, Eclipse Kuksa, uProtocol) and below concrete renderers. Nothing in the current SDV stack needs to be replaced — SIA is the missing connective tissue.

## Who this is for

| You are… | The relevant question |
|---|---|
| An HMI or UX engineer at an OEM or Tier-1 | Could my renderer consume a semantic stream instead of being hard-coded to a widget set? |
| An SDV platform architect | Where does the interaction layer live relative to Kuksa, uProtocol, and S-CORE? |
| A cybersecurity engineer | How do we prevent AI agents or third-party apps from spoofing safety-critical alerts? |
| An academic in AutomotiveUI, CHI, or escar | Is there a tractable formalisation of in-vehicle interaction semantics? |
| An Eclipse SDV contributor | How does this relate to the 2026 AI SIG and ongoing work in Ankaios, Symphony, and LMOS? |

## Read the paper

- [**Position paper**](./01_Semantic-Interaction-Architecture-sdv.md) — six-layer architecture, node taxonomy, metadata contracts, trust model, attention model, context as a multi-axis vector, versioning, relations to existing standards, and a path toward Eclipse SDV standardisation.
- [**Appendix A: Worked example**](./02_Appendix-a-worked-example.md) — a single `Alert.Collision.Warning` traced end-to-end: ontology declaration, trust verification, translation under three contexts (highway/manual, parked, L4/autonomous), and four adversarial scenarios (spoofed actor class, expired freshness, AI agent attempting a critical alert, priority injection).

## Key figures

| | |
|---|---|
| ![Stack position](./figures/fig1-stack-position.svg) | ![Six-layer architecture](./figures/fig2-six-layer-architecture.svg) |
| *Fig 1 — Where SIA sits in the SDV stack* | *Fig 2 — The six layers and how they interact* |
| ![Node taxonomy](./figures/fig3-node-taxonomy.svg) | ![Alert flow](./figures/figA1-alert-flow.svg) |
| *Fig 3 — Four node types and their metadata contracts* | *Fig A.1 — Sequence flow for a collision warning* |

## Status and how to engage

This is **v0.1 — a draft for circulation and critique**. The goal is to gather feedback before committing to a schema formalism, a cryptographic substrate, or a reference implementation.

Open questions the paper flags: schema language (JSON Schema vs. OWL/SHACL), cryptographic substrate for the Trust Layer, empirical validation of the attention metric composition formula, conflict resolution between renderers, and a prototype on top of Eclipse Kuksa.

Feedback, counter-positions, and collaboration offers are welcome: **dizencz@gmail.com**

---

## About Cars Making Sense

Cars Making Sense is a research initiative focused on usability and UX in the automotive industry. We analyse existing and historical HMI solutions, identify where they fall short, and propose better design paths — grounded in how people actually use vehicles, not in how dashboards happen to be built.

SIA is our first concrete technical proposal: a formal answer to a problem we kept running into while studying current in-vehicle interaction design.

*Cars Making Sense — May 2026*
