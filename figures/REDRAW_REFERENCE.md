# SIA 0.4.0 figure redraw reference

These diagrams are the editable semantic source for redrawing the remaining
0.3-era raster figures. They are explanatory, not a second normative source.
When a label or relationship is uncertain, the precedence order is:

1. [`../03_Core-Specification.md`](../03_Core-Specification.md)
2. [`../schema/`](../schema/) and [`../examples/v0.4.0/`](../examples/v0.4.0/)
3. these redraw diagrams

The final artwork may change layout, typography, colour, and iconography, but it
must preserve the labelled nodes, edge direction, loop separation, and profile
scope stated below. Each panel answers one question. Do not merge panels merely
to reduce the published figure count; a multi-panel figure or two consecutive
figures are both preferable to one unreadable surface.

## Figure 1 — Complexity comparison

### Figure 1A — Without SIA

```mermaid
flowchart LR
  subgraph E["Emitters"]
    E1["ADAS"]
    E2["Service"]
    E3["Application / agent"]
  end
  subgraph R["Renderers"]
    R1["Cluster"]
    R2["IVI"]
    R3["Voice"]
  end
  E1 --> R1
  E1 --> R2
  E1 --> R3
  E2 --> R1
  E2 --> R2
  E2 --> R3
  E3 --> R1
  E3 --> R2
  E3 --> R3
```

Shared caption/callout outside the graph: **every direct path repeats trust,
context, attention, fallback, evidence, and audit logic — N × M integrations.**

### Figure 1B — With SIA

```mermaid
flowchart LR
  subgraph E["Emitters"]
    E1["ADAS"]
    E2["Service"]
    E3["Application / agent"]
  end
  SIA["SIA mediation boundary<br/>verify · decide · coordinate · evidence"]
  subgraph R["External renderers"]
    R1["Cluster"]
    R2["IVI"]
    R3["Voice"]
  end
  E1 --> SIA
  E2 --> SIA
  E3 --> SIA
  SIA --> R1
  SIA --> R2
  SIA --> R3
```

Redraw constraints:

- 1A communicates duplicated policy/evidence per emitter–renderer pairing.
- 1B communicates one mediation boundary with N emitter adapters and M renderer
  adapters.
- Do not expand SIA internals here; Figure 3 owns that explanation.
- Renderers stay outside the SIA boundary.

## Figure 3 — Mediation architecture

### Figure 3A — Forward decision path

```mermaid
flowchart LR
  E["Emitter"] -->|"runtime instance"| T["Trust Policy<br/>8 fail-closed checks"]
  T --> C["Context Policy<br/>applicability + blocked disposition"]
  C --> X["Translation Layer<br/>capabilities + attention"]
  X --> R["Coordination Runtime<br/>ordered dispatch"]
  R --> O["External renderer"]
```

Place three small input callouts beneath the relevant stage, not inside its box:

- Trust: signed catalog + actor registry.
- Context: authenticated snapshot with six core axes.
- Translation: attested renderer capabilities.

### Figure 3B — Context outcome branch

```mermaid
flowchart LR
  C["Context Policy"] --> Q{"Applicable and unblocked?"}
  Q -->|"yes / never_block"| P["Continue to Translation"]
  Q -->|"drop"| D["Terminal audit"]
  Q -->|"defer"| H["Bounded hold<br/>TTL + quotas"]
  Q -->|"coalesce"| K["Keep newest canonical key"]
  H -->|"context change"| C
  K -->|"context change"| C
```

### Figure 3C — Delivery and human feedback

```mermaid
flowchart LR
  R["Coordination Runtime"] -->|"dispatch attempt"| V["Renderer"]
  V -->|"received / presented / failed"| R
  R -->|"runtime-only timed_out"| R
  R -->|"delivery success proven"| W["Occupant-response window"]
  U["Occupant / authorised input"] -->|"authenticated response"| W
  W --> R
```

Redraw constraints:

- 3A owns the architectural forward path; it must remain readable without the
  other panels.
- 3B owns retention and overload meaning. The six context-axis names belong in
  one compact callout or legend, not inside the flow.
- 3C owns the two feedback loops. `failed` comes from a renderer; `timed_out`
  comes only from Coordination Runtime.
- Add one shared footer across the three panels: every terminal decision produces
  hash-linked audit evidence, but persistence never blocks critical dispatch
  without a bound.

## Figure 4 — Semantic node taxonomy

```mermaid
flowchart TB
  I["Interaction"]
  E["Event"]
  A["Alert"]
  N["Notification"]
  AC["Action<br/>future profile"]
  S["State<br/>future profile"]
  T["Task<br/>future profile"]

  I --> E
  E --> A
  E --> N
  I --> AC
  I --> S
  I --> T
```

Keep contract details in a two-row legend beside or below the tree:

| Emitted family in `sia-minimal` 0.4.0 | Contract emphasis |
|---|---|
| Alert | safety relevance · `never_block` where declared · presentation contract · separate occupant response |
| Notification | informational · blocked disposition: `drop`, `defer`, or `coalesce` |

Redraw constraints:

- The architecture contains four top-level families: Event, Action, State, and
  Task; Event has Alert and Notification subtypes.
- The `sia-minimal` 0.4.0 profile emits only Alert and Notification.
- Do not put field lists inside taxonomy nodes. Do not restore `requires_ack`,
  `ack_kind`, `suppression_class`, or `merges_with`.
- Action must not reuse the output-renderer delivery contract as an input or
  execution-result contract.

## Figure A.1 — Collision-warning trust and delivery sequence

### Figure A.1A — Acceptance and planning

```mermaid
sequenceDiagram
  autonumber
  participant ADAS as ADAS emitter
  participant Trust as Trust Policy
  participant Context as Context Policy
  participant Translate as Translation Layer
  participant Runtime as Coordination Runtime

  ADAS->>Trust: Signed Collision.Warning runtime instance
  Trust->>Trust: Validate envelope + payload and 8 trust requirements
  alt trust rejected
    Trust-->>ADAS: Stable TRUST_REJECTED_* outcome
    Note over Trust,Runtime: Rejected instance never reaches Translation
  else trust accepted
    Trust->>Context: Verified instance
    Context->>Context: Evaluate applicability from 6-axis snapshot
    Context->>Translate: Eligible instance + policy outcome
    Translate->>Translate: Filter capabilities + attention constraints
    Translate->>Runtime: Deterministic render plan
  end
```

### Figure A.1B — Delivery, fallback, and response

```mermaid
sequenceDiagram
  autonumber
  participant Runtime as Coordination Runtime
  participant Primary as Primary renderer
  participant Fallback as Fallback renderer
  participant Occupant as Occupant / responder

  Runtime->>Primary: Dispatch attempt 1 with bounded deadline
  alt primary presented
    Primary-->>Runtime: Authenticated presented receipt
  else primary failed or deadline expires
    Primary-->>Runtime: Authenticated failed receipt
    Note right of Runtime: Runtime alone may issue timed_out
    Runtime->>Fallback: Attempt 2 bound to terminal predecessor
    Fallback-->>Runtime: Authenticated presented receipt
  end
  alt delivery success proven and response required
    Runtime->>Occupant: Open occupant-response window
    alt authenticated response received
      Occupant-->>Runtime: Separate occupant response
    else response deadline expires
      Runtime->>Runtime: Occupant-response timeout
    end
  else delivery not proven or response not required
    Note over Runtime,Occupant: Response stays not_started or not_applicable
  end
```

Redraw constraints:

- A.1A ends at the render plan. A.1B starts from that plan; do not reconnect all
  nine lifelines into one sequence.
- The dispatch deadline is bounded by semantic validity; neither fallback nor
  queueing silently extends freshness or validity.
- A `received` receipt alone is not delivery success. The applicable success
  policy requires `presented` evidence.
- Fallback dispatch requires a terminal failed/timed-out predecessor and a
  still-valid instance.
- Delivery timeout never substitutes for occupant-response timeout, and a
  renderer receipt never proves awareness or comprehension.
- Show audit as one shared footer or side annotation: rejected trust, delivery
  outcome, and occupant-response outcome each produce terminal evidence. Audit
  does not need its own lifeline.

## Export checklist

Before replacing a raster figure, verify that the artwork:

- says `0.4.0` wherever a public release version is shown;
- contains no retired fields (`requires_ack`, `ack_kind`, `suppression_class`,
  `merges_with`);
- preserves the eight trust requirements and six core context axes;
- keeps renderers outside SIA;
- distinguishes render plan, dispatch attempt, delivery receipt, and occupant
  response;
- labels uncertainty and overload outcomes as explicit, bounded, and auditable;
- remains legible in the paper at its final rendered width.
