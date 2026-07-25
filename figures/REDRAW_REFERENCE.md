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

Shared caption/callout outside the graph: **trust, context, attention, fallback,
evidence, and audit logic must be handled independently on each direct path —
N × M integrations.**

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

- Trust: bounded structural admission, then signed catalog + actor registry.
- Context: authenticated snapshot with six core axes.
- Translation: attested renderer capabilities.

### Figure 3B — Context outcome branch

```mermaid
flowchart LR
  C["Context Policy"] --> A{"Applicable?"}
  A -->|"no"| N["Not applicable<br/>terminal audit"]
  A -->|"yes"| B{"Blocked now?"}
  B -->|"no / never_block"| P["Continue to Translation"]
  B -->|"drop"| D["Drop<br/>terminal audit"]
  B -->|"defer"| H["Bounded hold<br/>TTL + quotas"]
  B -->|"coalesce"| K["Keep newest canonical key"]
  H -->|"declared trigger"| V["Full re-evaluation<br/>trust · validity · context<br/>capabilities · policy"]
  K -->|"declared trigger"| V
  V -->|"release only on success"| P
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
- 3B owns applicability, blocking, and bounded retention. The six context-axis
  names belong in one compact callout or legend, not inside the flow.
- 3C owns the two feedback loops. `failed` comes from a renderer; `timed_out`
  comes only from Coordination Runtime.
- Add one compact overload callout outside the flows: reserved critical capacity
  protects `never_block`; deadline-infeasible work terminates only through its
  declared disposition, timeout, or safety fallback, with audit evidence.
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
| Notification | informational · disposition declared per node; reference nodes exercise `drop`, `defer`, and `coalesce` |

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

  ADAS->>Trust: Signed Alert.Collision.Warning runtime instance
  Trust->>Trust: Structural pre-auth admission + bounded quota
  alt admission rejected
    Trust->>Trust: Terminal TRUST_REJECTED_ADMISSION outcome
    Note over Trust,Runtime: Unverified claims get no priority; flood audit is bounded and aggregated
  else admitted for verification
    Trust->>Trust: Perform 8 trust checks, including envelope + payload
    alt trust rejected
      Trust->>Trust: Terminal registered trust-rejection outcome
      Note over Trust,Runtime: Rejected instance never reaches Translation
    else trust accepted
      Trust->>Context: Verified instance
      Context->>Context: Evaluate applicability from 6-axis snapshot
      Context->>Translate: Eligible instance + policy outcome
      Translate->>Translate: Filter capabilities + attention constraints
      Translate->>Runtime: Deterministic render plan
    end
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
  else primary did not present
    alt renderer reports failure
      Primary-->>Runtime: Authenticated failed receipt
    else primary deadline expires
      Runtime->>Runtime: Runtime-issued timed_out receipt
    end
    Runtime->>Fallback: Attempt 2 bound to terminal predecessor
    alt fallback presented
      Fallback-->>Runtime: Authenticated presented receipt
    else renderer reports failure
      Fallback-->>Runtime: Authenticated failed receipt
    else fallback deadline expires
      Runtime->>Runtime: Runtime-issued timed_out receipt
    end
  end
  alt delivery success proven and response required
    Runtime->>Runtime: Open occupant-response window
    alt authenticated response received
      Occupant-->>Runtime: Separate occupant response
    else response deadline expires
      Runtime->>Runtime: Occupant-response timeout
    end
  else delivery not proven
    Note over Runtime,Occupant: Occupant response remains not_started
  else delivery success proven and response not required
    Note over Runtime,Occupant: No response window; interaction closes
  end
```

Redraw constraints:

- A.1A ends at the render plan. A.1B starts from that plan; do not reconnect all
  nine lifelines into one sequence.
- The dispatch deadline is bounded by semantic validity; neither fallback nor
  queueing silently extends freshness or validity.
- A structural admission rejection is terminal; under sustained flood its audit
  evidence is bounded and aggregated rather than emitted once per packet.
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
- shows structural pre-authentication admission without granting priority from
  an unverified node claim;
- keeps renderers outside SIA;
- separates `not_applicable` from blocking and its declared disposition;
- distinguishes render plan, dispatch attempt, delivery receipt, and occupant
  response;
- labels uncertainty and overload outcomes as explicit, bounded, and auditable;
- remains legible in the paper at its final rendered width.
