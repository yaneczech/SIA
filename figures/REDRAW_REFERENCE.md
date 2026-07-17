# SIA 0.4.0 figure redraw reference

These diagrams are the editable semantic source for redrawing the remaining
0.3-era raster figures. They are explanatory, not a second normative source.
When a label or relationship is uncertain, the precedence order is:

1. [`../03_Core-Specification.md`](../03_Core-Specification.md)
2. [`../schema/`](../schema/) and [`../examples/v0.4.0/`](../examples/v0.4.0/)
3. these redraw diagrams

The final artwork may change layout, typography, colour, and iconography, but it
must preserve the labelled nodes, edge direction, loop separation, and profile
scope stated below.

## Figure 1 — Complexity comparison

```mermaid
flowchart LR
  subgraph BEFORE["Without SIA · N × M direct integrations"]
    direction LR
    subgraph BE["Emitters"]
      BE1["ADAS"]
      BE2["Vehicle service"]
      BE3["Application / agent"]
    end
    subgraph BR["Renderers"]
      BR1["Cluster"]
      BR2["IVI"]
      BR3["Voice"]
    end
    DUP["Each direct path reimplements<br/>trust · context · attention · fallback<br/>delivery evidence · occupant response · audit"]
    BE1 --> BR1
    BE1 --> BR2
    BE1 --> BR3
    BE2 --> BR1
    BE2 --> BR2
    BE2 --> BR3
    BE3 --> BR1
    BE3 --> BR2
    BE3 --> BR3
    DUP -.-> BR2
  end

  subgraph AFTER["With SIA · N + M integrations"]
    direction LR
    subgraph AE["Emitters"]
      AE1["ADAS"]
      AE2["Vehicle service"]
      AE3["Application / agent"]
    end
    subgraph SIA["Semantic Interaction Architecture"]
      TG["Trust gate<br/>8 fail-closed checks"]
      CP["Context policy<br/>6 core axes"]
      TL["Deterministic translation<br/>capability + attention"]
      CR["Coordination runtime<br/>ordered dispatch + fallback"]
      RT["Bounded retention<br/>drop · defer · coalesce"]
      EV["Evidence<br/>delivery receipt ≠ occupant response<br/>hash-linked audit"]
      TG --> CP --> TL --> CR --> EV
      CP --> RT
      RT --> TL
    end
    subgraph AR["Thin external renderers"]
      AR1["Cluster"]
      AR2["IVI"]
      AR3["Voice"]
    end
    AE1 --> TG
    AE2 --> TG
    AE3 --> TG
    CR --> AR1
    CR --> AR2
    CR --> AR3
  end
```

Redraw constraints:

- The left side communicates duplicated policy/evidence per emitter–renderer
  pairing; it must not imply that only one shared pre-SIA component exists.
- The right side communicates one mediation boundary with N emitter adapters and
  M renderer adapters.
- Trust is labelled as eight checks, retention is bounded, and delivery receipt
  and occupant response remain visibly distinct.
- Renderers stay outside the SIA boundary.

## Figure 3 — Mediation architecture

```mermaid
flowchart LR
  subgraph SOURCES["External producers and policy authorities"]
    EM["Emitters<br/>ADAS · services · applications · agents"]
    CA["Signed catalog + actor registry"]
    CS["Authenticated context snapshot<br/>motion_state · operating_mode · energy_state<br/>road_type · driver_state · occupancy"]
  end

  subgraph SIA["SIA mediation boundary"]
    TG["Trust Policy<br/>closed envelope + payload<br/>declaration digest · actor authority · signature<br/>ingress freshness · nonce replay · revocation<br/>semantic validity"]
    CP["Context Policy<br/>applicability · unknown-context rule<br/>blocked disposition + bounded retention"]
    TR["Translation Layer<br/>capability filtering · attention estimate<br/>deterministic render plan"]
    CR["Coordination Runtime<br/>ordered dispatch attempt<br/>deadline · fallback · idempotency"]
    OR["Occupant-response contract<br/>opens only after delivery success"]
    AU["Hash-linked audit evidence"]
    TG --> CP --> TR --> CR
    CR --> OR
    TG -.-> AU
    CP -.-> AU
    TR -.-> AU
    CR -.-> AU
    OR -.-> AU
  end

  subgraph SURFACES["External interaction surfaces"]
    RC["Renderer capabilities<br/>attested + safety evidence"]
    RE["Renderers<br/>cluster · IVI · voice"]
    OC["Occupant / authorised responder"]
  end

  EM -->|"runtime instance"| TG
  CA --> TG
  CS --> CP
  RC -->|"capability declarations"| TR
  CR -->|"ordered, deadline-bounded dispatch attempt"| RE
  RE -->|"authenticated delivery receipt<br/>received · presented · failed"| CR
  CR -->|"runtime-issued timed_out"| CR
  OC -->|"separate authenticated response"| OR
  OR --> CR
```

Redraw constraints:

- Trust Policy is the mandatory chokepoint before context, translation, or
  dispatch; claimed urgency never bypasses it.
- The six context axes are orthogonal observations, not a single vehicle-state
  enum.
- Renderer capabilities flow into Translation; render plans and attempts flow
  out through Coordination Runtime.
- `failed` comes from a renderer; `timed_out` comes only from Coordination
  Runtime.
- Delivery evidence and occupant response are two separate authenticated loops.
- Audit observes every terminal decision but must not become an unbounded
  prerequisite for critical dispatch.

## Figure 4 — Semantic node taxonomy

```mermaid
flowchart TB
  I["Interaction"]
  E["Event<br/>system-initiated"]
  A["Alert<br/>safety-relevant<br/>never_block · presentation contract<br/>occupant_response: kind · authority · timeout"]
  N["Notification<br/>informational<br/>context_policy.on_blocked<br/>drop · defer · coalesce"]
  AC["Action<br/>occupant-initiated<br/>reserved for a future input/execution profile"]
  S["State<br/>runtime-internal transition<br/>reserved for a future profile"]
  T["Task<br/>composed multi-step flow<br/>reserved for a future profile"]

  I --> E
  E --> A
  E --> N
  I --> AC
  I --> S
  I --> T
```

Redraw constraints:

- The architecture contains four top-level families: Event, Action, State, and
  Task; Event has Alert and Notification subtypes.
- The `sia-minimal` 0.4.0 profile emits only Alert and Notification.
- Do not restore `requires_ack`, `ack_kind`, `suppression_class`, or
  `merges_with`. Use the structured occupant-response and blocked-disposition
  contracts shown above.
- Action must not reuse the output-renderer delivery contract as an input or
  execution-result contract.

## Figure A.1 — Collision-warning trust and delivery sequence

```mermaid
sequenceDiagram
  autonumber
  participant ADAS as ADAS emitter
  participant Trust as Trust Policy
  participant Context as Context Policy
  participant Translate as Translation Layer
  participant Runtime as Coordination Runtime
  participant Primary as Primary renderer
  participant Fallback as Fallback renderer
  participant Occupant as Occupant / responder
  participant Audit as Audit evidence

  ADAS->>Trust: Signed Collision.Warning runtime instance
  Trust->>Trust: Validate envelope + payload and 8 trust requirements
  alt trust rejected
    Trust-->>Audit: Stable TRUST_REJECTED_* terminal record
    Note over Trust,Primary: Rejected instance never reaches translation or a renderer
  else trust accepted
    Trust->>Context: Verified instance
    Context->>Context: Evaluate 6-axis snapshot and applicability
    Context->>Translate: Eligible instance + policy outcome
    Translate->>Translate: Filter attested capabilities and attention constraints
    Translate->>Runtime: Deterministic render plan
    Runtime->>Primary: Dispatch attempt 1 with bounded deadline
    alt primary presented
      Primary-->>Runtime: Authenticated presented receipt
    else primary failed or runtime deadline expires
      Primary-->>Runtime: Authenticated failed receipt
      Note right of Runtime: Runtime alone may issue timed_out
      Runtime->>Fallback: Dispatch attempt 2, bound to terminal predecessor
      Fallback-->>Runtime: Authenticated presented receipt
    end
    Runtime-->>Audit: Attempts + receipts + delivery outcome
    alt delivery-success policy satisfied and response required
      Runtime->>Occupant: Open occupant-response window
      alt authenticated response received
        Occupant-->>Runtime: Separate occupant response
      else response deadline expires
        Runtime->>Runtime: Occupant-response timeout
      end
    else delivery not proven or response not required
      Note over Runtime,Occupant: Occupant response remains not_started or not_applicable
    end
    Runtime-->>Audit: Occupant-response outcome + terminal record
  end
```

Redraw constraints:

- The dispatch deadline is bounded by semantic validity; neither fallback nor
  queueing silently extends freshness or validity.
- A `received` receipt alone is not delivery success. The applicable success
  policy requires `presented` evidence.
- Fallback dispatch requires a terminal failed/timed-out predecessor and a
  still-valid instance.
- Delivery timeout never substitutes for occupant-response timeout, and a
  renderer receipt never proves awareness or comprehension.

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
