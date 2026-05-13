# Semantic Interaction Architecture (SIA)

**A Cars Making Sense initiative · v0.1 draft · May 2026**

> What if a collision warning could declare, in machine-readable terms, that it cannot be suppressed, must reach the driver within 200 ms, requires a signed origin, and degrades to voice if the HUD is unavailable, without any of that logic living inside a renderer?

This repository contains a draft position paper proposing a Semantic Interaction Architecture for software-defined vehicles. SIA decouples the meaning, trust requirements, attention cost, and context fitness of in-vehicle interactions from concrete screens, widgets, input devices, and renderers.

## The Problem

Modern vehicle HMI is screen-first and tightly coupled. The same intent, such as acknowledging an alert, increasing volume, or navigating back, is implemented separately for each screen size, input device, voice assistant, and OEM. When a new surface arrives, or an AI agent needs to emit an interaction, the logic is often rewritten in renderer-specific code.

This costs engineering time, produces inconsistent experiences, and creates a security gap: there is currently no common semantic layer that constrains whether a third-party app or cloud AI agent may emit, suppress, or spoof a safety-critical interaction.

## The Proposal

SIA defines a typed node ontology: Actions, Events, States, and Tasks. Each node carries machine-readable metadata for:

- **Attention**: predicted glance time, task steps, cognitive load, and auditable thresholds.
- **Trust**: required actor class, signed origin, freshness window, and replay protection.
- **Context**: a multi-axis vector such as SAE level, road type, driver state, and regulatory regime.
- **Capability negotiation**: measurable renderer and input-device capabilities used by the Translation Layer.

A six-layer architecture sits above existing SDV data and service abstractions such as COVESA VSS, Eclipse Kuksa, and uProtocol, and below concrete renderers. It is intended as connective tissue, not a replacement for existing SDV infrastructure.

## Who This Is For

| You are... | The relevant question |
| --- | --- |
| An HMI or UX engineer at an OEM or Tier-1 | Could my renderer consume a semantic stream instead of hard-coded widget logic? |
| An SDV platform architect | Where does the interaction layer live relative to Kuksa, uProtocol, and S-CORE? |
| A cybersecurity engineer | How do we prevent AI agents or third-party apps from spoofing safety-critical alerts? |
| An academic in AutomotiveUI, CHI, or escar | Is there a tractable formalisation of in-vehicle interaction semantics? |
| An Eclipse SDV contributor | How does this relate to AI agents, trustable software, and ongoing SDV projects? |

## Read The Paper

- [Position paper](./01_Semantic-Interaction-Architecture-sdv.md) — six-layer architecture, node taxonomy, metadata contracts, trust model, attention model, context model, versioning, relations to existing standards, and a path toward Eclipse SDV standardisation.
- [Appendix A: Worked example](./02_Appendix-a-worked-example.md) — `Alert.Collision.Warning` traced end-to-end through trust verification, translation, renderer dispatch, and adversarial scenarios.
- [Schema draft](./schema/interaction-node.schema.json) — minimal JSON Schema sketch for the metadata contract.

## Key Figures

| | |
| --- | --- |
| ![Stack position](./figures/fig1-stack-position.svg) | ![Six-layer architecture](./figures/fig2-six-layer-architecture.svg) |
| Figure 1: Where SIA sits in the SDV stack | Figure 2: The six layers and how they interact |
| ![Node taxonomy](./figures/fig3-node-taxonomy.svg) | ![Alert flow](./figures/figA1-alert-flow.svg) |
| Figure 3: Four node types and their metadata contracts | Figure A.1: Sequence flow for a collision warning |

## Status

Version 0.1 is a draft for circulation and critique. The proposal is not a standard, implementation, or safety-certified architecture. Open questions include schema language, cryptographic substrate, attention metric validation, renderer conflict resolution, and a reference implementation on top of Eclipse Kuksa.

## Citation

Citation metadata is available in [CITATION.cff](./CITATION.cff).

## License

This work is released under [CC0 1.0 Universal](./LICENSE).

## Contact

Feedback, counter-positions, and collaboration offers are welcome: <dizencz@gmail.com>.

## About Cars Making Sense

Cars Making Sense is a research initiative focused on usability and UX in the automotive industry. It analyses existing and historical HMI solutions, identifies where they fall short, and proposes better design paths grounded in how people use vehicles rather than in how dashboards happen to be built.
