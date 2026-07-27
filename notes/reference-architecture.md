# SIA runtime reference architecture

Working note, **not normative**. The [Core Specification](../03_Core-Specification.md) defines *what* must hold; this note records an implementation shape that makes those requirements cheap to satisfy and the evidence plan needed to validate it. Development-host measurements come from the [portable benchmark harness](../bench/README.md); they are not ECU latency claims. Companion to the conformance `runtime` class.

## 1. The kernel: a deadline-carrying state machine

Every normative decision in SIA 0.4.0 is a deterministic function of authenticated, digest-bound inputs and explicit time (§10: identical declaration, context, capabilities, and policy versions MUST produce the identical plan). A natural implementation is therefore a **pure reducer**:

```
decide(state, event, now) → (state', effects[], audit[])
```

- **Events:** verified instance, context snapshot, delivery receipt, occupant response, timer expiry.
- **Effects:** dispatch request, timer arm, audit append. No I/O, no clock reads, no threads inside the kernel – `now` enters as a parameter, which makes replay and conformance vectors the natural test oracle.
- **Interactions carry absolute times**, never chains of relative timeouts: `accepted_at`, `valid_until`, the current attempt deadline, and the occupant-response deadline. Before an expensive stage, the runtime compares the remaining window with the deployment's reviewed worst-case bound for that **next stage**, including the required reserve. Work that cannot enter the stage terminates through the applicable rejection, disposition, timeout, or safety-fallback outcome (§13). The safety case separately proves that the complete worst-case path fits inside semantic validity.
- **The hash-linked audit chain is evidence, not a recovery journal.** The 0.4.0 audit record does not contain every input required to reconstruct runtime state. A deployment that requires replay uses a separate bounded event journal and/or authenticated state snapshots; neither may turn audit persistence into an unbounded prerequisite for critical dispatch.
- **Protocol-managed queues, replay caches, and retention stores are bounded** (§8, §13, §14). A deployment may therefore choose fixed pools or another allocation strategy whose worst-case behaviour it can prove. Pre-allocation can remove GC and fragmentation from the critical path, but language, code size, and safety-integrity qualification remain deployment choices rather than SIA claims.

The demo engine (`demo/sia-engine.js`) demonstrates the reducer shape through pure functions and no I/O. It is a teaching model and test substrate, not a complete reference runtime or recovery implementation.

## 2. Queues are meanings, not a buffer

There is no general buffer and no unbounded FIFO. Each queue exists because the contract gives it a distinct overload meaning:

| Queue | Purpose | Overload behaviour |
|---|---|---|
| Ingress | packets awaiting the trust gate | per-actor/per-identifier quota → `TRUST_REJECTED_ADMISSION` |
| Critical lane | `never_block` interactions | reserved capacity; beyond it, the certified safety fallback (§13) |
| Deferred retention | context-blocked `defer` instances | declared TTL + bounded queue limits (§8) |
| Coalescing store | latest value per canonical key | atomic replacement, older entry → `superseded` |
| Dispatch | ready renderer attempts | deadline-aware ordering; non-positive window forbids the attempt (§11) |
| Receipt / response | returning evidence | high priority – state must not lag reality |
| Audit | persisted evidence | bounded admission, asynchronous flush where used, optional signed checkpoints; never an unbounded prerequisite for critical dispatch (§13–§14) |

The queue must not invent a drop or merge semantic. **The node's declared disposition constrains the permitted outcomes** (`drop` / `defer` / `coalesce` / `never_block`); within those constraints, the deployment's reviewed overload policy enforces quotas, selects any eviction victim deterministically, and records the resulting outcome.

## 3. Scheduling

Two-level discipline (normative skeleton in §13–§14):

1. **Isolated traffic classes** – `never_block` safety, ordinary alerts, notifications + deferred work, audit/telemetry. No lower class can delay the critical class beyond its documented latency band; the critical class has reserved queue slots, worker capacity, authentication capacity, transport credits, and its fallback path.
2. **Earliest-deadline-first within a class** (RECOMMENDED) – prevents blindly serving an older packet that still has more remaining time than a newer, tighter one.

**Pre-authentication admission is the subtle part.** The envelope carries no priority (closed schema), but the *claimed* `node_id` is still unverified text. A flood of forged critical claims must not exhaust the critical lane's verification capacity – hence admission to reserved capacity is rate-limited per session/claimed identifier *before* verify, with only cheap structural checks (size, version, algorithm identifier, required fields, syntactic timestamp, known session) allowed pre-auth. Flood-time audit is aggregated, not per packet.

## 4. Cryptography placement

The portable harness measures the repository's real signed artifacts and reports
JSON/JCS/SHA-256, ES256, EdDSA, HMAC, semantic-validation, and queued-burst
distributions. It reports JCS plus SHA-256 as one segment; it does not measure
their costs separately. Results vary by build and host, so this note intentionally
does not copy transient microsecond values. Reproduce them with
`npm run benchmark:quick` or attach the JSON report from the exact reviewed
target run. The current harness excludes real HSM queueing, IPC, secure time,
renderer wake-up, and mixed-workload contention.

Placement options that prevent an accidental serial bottleneck:

- **Catalogs, policies, registries, capabilities:** verified at install/boot/change, then held as immutable digest-pinned snapshots. The hot path compares their bound SHA-256 digests; its target cost still belongs in the measured latency budget.
- **Public-key verification placement is deployment-defined.** Public keys require integrity rather than confidentiality, but verifier integrity, fault resistance, key provisioning, platform assurance, and measured contention determine whether verification runs in software, a secure execution environment, or an HSM.
- **Runtime-issued authentication is also a deployment choice.** An HSM may protect signing or MAC keys, but putting every dispatch attempt or receipt through one serial device can itself create the hot-path bottleneck. The deployment must document key custody, concurrency, queue bounds, and the timeout/fallback outcome when the authenticator is unavailable.
- **A revocable session with a per-packet MAC is an optional optimisation**, not a completed 0.4.0 protocol. Session establishment and HMAC provisioning are deployment-defined and explicitly deferred from the current profile; packets still require nonce, timestamp, validity binding, semantic authority checks, and current revocation state.
- Per-packet ES256 remains a supported path. A deployment choosing any path must measure tail latency and contention on target hardware. The algorithm profile stays the closed enum of §6 – mechanism *placement* is free, primitive *choice* is not, because an open-ended algorithm identifier is a downgrade surface and defeats interoperability review.

## 5. Target-hardware bottleneck campaign

The development harness cannot rank whole-vehicle bottlenecks. Treat the
following as measurement candidates, not ordered or portable latency claims:

| Candidate | What evidence is required | Typical mitigation to evaluate |
|---|---|---|
| Renderer wake, composition, scan-out, panel, or amplifier | instrumented dispatch-to-physical-output tail; compare with authenticated receipt timing | warm/reserved critical renderer path; bounded fallback |
| Voice synthesis | cold/warm prompt generation and audio-start tails | reviewed pre-rendered critical prompts |
| Audit persistence | flush, wear management, full-device, and backpressure faults | bounded in-memory admission, asynchronous persistence, optional signed checkpoints |
| HSM or secure-element use | operation and queue-residence tails under mixed key traffic | parallel sessions, cached verified state, software/TEE verification where justified, bounded fallback |
| Transport, IPC, and gateways | exact payload, framing, bus load, gateway, retry, and failover measurements | suitable transport class, reserved credits, compact future profile only if evidence justifies it |
| Shared CPU and memory | scheduler interference, lock contention, allocation, cache, and memory-pressure tails | traffic isolation, reviewed priorities, bounded pools, reduced copying |
| Secure time and cross-ECU synchronisation | measured offset, holdover, loss-of-sync, and recovery under the selected clock architecture | deployment skew budget and explicit unavailable-time behaviour |
| Parsing, canonicalisation, validation, and crypto math | target build distributions under realistic concurrency | cache immutable artifacts, bounded work, hardware acceleration where justified |
| Power and lifecycle state | cold boot, suspend/resume, DVFS, thermal throttling, OTA, and diagnostic contention | reserved resources and tested degraded/fallback modes |

A delivery receipt is protocol evidence from the renderer, not independent
physical instrumentation of pixels or sound. Target validation must establish
what event the renderer calls `presented` and correlate that evidence with
physical time-to-indication.

Hardware delay therefore consumes one of several independent windows – ingress
freshness, semantic validity, retention TTL, delivery deadline, or occupant-response
deadline – and must end in the corresponding explicit outcome. It must never be
hidden by silently extending a timestamp or validity window.

## 6. Implementation shape checklist

- one immutable interaction envelope; bounded storage with pre-allocated pools where justified
- zero-copy hand-off between stages where the platform allows
- a state machine per interaction; absolute deadlines, never relative timeout chains
- separate executors for critical and non-critical classes
- immutable snapshots of catalog, policy, and credential state
- bounded, hash-linked audit admission; asynchronous persistence and signed checkpoints where required
- adapters for crypto, transport, clock, persistence, and renderers

The runtime stays a small coordinator. It must not grow into a message broker, a database, an RTOS, or HSM middleware.

## 7. Division of labour

**SIA owns claims** – who may say what, when it applies, where it may appear, what evidence closes it, and the audit chain. **The platform owns physics** – transport QoS, scheduling and isolation, key storage and provisioning, sensor truth, pixels and sound, and the whole-vehicle safety case.

| The spec defines | The deployment profile sets | The safety case proves |
|---|---|---|
| bounded queues + retention semantics | concrete queue sizes | worst-case and tail latency on target HW |
| permitted overload outcomes + codes | reserved critical-lane capacity | behaviour at exhausted queues |
| causal bindings + absolute deadlines | scheduling policy, worker/HSM counts | HSM/CPU/renderer contention |
| delivery ≠ occupant response | per-segment latency budgets | no unsafe duplicate presentation |
| fail-closed trust gate + admission rule | crypto mechanism placement | authentication remains bounded under contention |
| explicit safety-fallback requirement | renderer + fallback deadlines, audit persistence | fallback survives partial failure without unsafe duplication |

One paragraph summary: **a buffer is explicit state with a ceiling and a declared outcome; overload is a normal protocol branch, not an exception; authentication placement is a measured deployment choice; the critical path has reserved resources; and every concrete capacity is proven on the target hardware, not in the spec.**
