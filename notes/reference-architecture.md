# SIA runtime reference architecture

Working note, **not normative**. The [Core Specification](../03_Core-Specification.md) defines *what* must hold; this note records the implementation shape that makes those requirements cheap to satisfy, plus the measured evidence behind the performance claims. Companion to the conformance `runtime` class.

## 1. The kernel: a deadline-carrying state machine

Every normative decision in SIA 0.4.0 is a deterministic function of signed inputs (§10: identical inputs MUST produce the identical plan). The natural implementation is therefore a **pure reducer**:

```
decide(state, event, now) → (state', effects[], audit[])
```

- **Events:** verified instance, context snapshot, delivery receipt, occupant response, timer expiry.
- **Effects:** dispatch request, timer arm, audit append. No I/O, no clock reads, no threads inside the kernel — `now` enters as a parameter, which makes replay and conformance vectors the natural test oracle.
- **Interactions carry absolute times**, never chains of relative timeouts: `accepted_at`, `valid_until`, the current attempt deadline, and the occupant-response deadline. Before every expensive stage the kernel asks one question — *can this interaction still complete its critical path?* — and expired work terminates through its declared disposition instead of consuming the stage (§13).
- **The hash-linked audit log is the persistence.** Replaying the event log reproduces every decision; a state snapshot is an optimisation, not a source of truth.
- **All state is bounded** (§8, §14), so fixed pools sized from the declared quotas replace dynamic allocation: no GC, no fragmentation, ASIL-friendly. The kernel is a few kLOC of C or Rust.

The demo engine (`demo/sia-engine.js`) already has this shape — pure functions, no I/O — which is why it doubles as the teaching model and the test substrate.

## 2. Queues are meanings, not a buffer

There is no general buffer and no unbounded FIFO. Each queue exists because the contract gives it a distinct overload meaning:

| Queue | Purpose | Overload behaviour |
|---|---|---|
| Ingress | packets awaiting the trust gate | per-actor/per-identifier quota → `TRUST_REJECTED_ADMISSION` |
| Critical lane | `never_block` interactions | reserved capacity; beyond it, the certified safety fallback (§13) |
| Deferred retention | context-blocked `defer` instances | declared TTL + bounded queue limits (§8) |
| Coalescing store | latest value per canonical key | atomic replacement, older entry → `superseded` |
| Dispatch | ready renderer attempts | deadline-aware ordering; non-positive window forbids the attempt (§11) |
| Receipt / response | returning evidence | high priority — state must not lag reality |
| Audit | persisted evidence | bounded ring, asynchronous flush, signed checkpoints; never a prerequisite for critical dispatch (§13) |

The queue never decides what to drop or merge. **Only the node's declared disposition decides** (`drop` / `defer` / `coalesce` / `never_block`); the queue merely enforces the bound and names the outcome.

## 3. Scheduling

Two-level discipline (normative skeleton in §13–§14):

1. **Isolated traffic classes** — `never_block` safety, ordinary alerts, notifications + deferred work, audit/telemetry. No lower class can delay the critical class beyond its documented latency band; the critical class has reserved queue slots, worker capacity, authentication capacity, transport credits, and its fallback path.
2. **Earliest-deadline-first within a class** (RECOMMENDED) — prevents blindly serving an older packet that still has more remaining time than a newer, tighter one.

**Pre-authentication admission is the subtle part.** The envelope carries no priority (closed schema), but the *claimed* `node_id` is still unverified text. A flood of forged critical claims must not exhaust the critical lane's verification capacity — hence admission to reserved capacity is rate-limited per session/claimed identifier *before* verify, with only cheap structural checks (size, version, algorithm identifier, required fields, syntactic timestamp, known session) allowed pre-auth. Flood-time audit is aggregated, not per packet.

## 4. Cryptography placement

Measured on the repository's real signed artifacts (1.2 kB instance, Node on desktop-class hardware — order-of-magnitude evidence, not an ECU benchmark; reproduce with `npm run benchmark:quick` (`bench/run.mjs`)):

| Operation | Cost |
|---|---|
| JCS canonicalisation | ~7 µs |
| SHA-256 canonical digest | ~8 µs |
| ES256 verify | ~90 µs |
| EdDSA verify | ~97 µs |
| HMAC-SHA-256 verify/sign | ~8 µs |

Placement rules that keep crypto out of the bottleneck conversation:

- **Catalogs, policies, registries, capabilities:** verified at install/boot/change, then held as immutable digest-pinned snapshots. The hot path compares SHA-256 digests (µs).
- **Public-key verification belongs in software.** A public key needs integrity, not secrecy — pin it by digest after boot verification. The HSM is the root of trust and the signer of runtime-issued artifacts, **not a serial processor of every packet**; an HSM round-trip on a slow bus (1–10 ms) must never sit in the ingress path per message.
- **Sessions:** asymmetric authentication establishes a revocable session; per-packet authentication uses the session-bound MAC (µs even on M-class cores with SHA acceleration). Packets still carry nonce, timestamp, validity binding, and session identity.
- Per-packet ES256 remains a supported path; a deployment choosing it must measure tail latency and HSM contention on its own hardware. The algorithm profile stays the closed enum of §6 — mechanism *placement* is free, primitive *choice* is not, because an open-ended "abstract crypto contract" is a downgrade surface and the end of interop review.

## 5. Hardware bottlenecks, ranked by real size

| # | Bottleneck | Typical cost | Mitigation |
|---|---|---|---|
| 1 | Renderer wake + compose + vsync + panel | 30–80 ms | budgeted by `delivery_timeout_ms`; measured for free by receipt `elapsed_ms` |
| 2 | Voice synthesis | 100s of ms | pre-rendered prompts for critical audio |
| 3 | Audit flash sync | 10–40 ms spikes | async ring + checkpoints; never in dispatch path |
| 4 | HSM round-trips | 1–10 ms per op | §4 placement rules above |
| 5 | Bus + gateway hops | Ethernet/TSN: bounded ms; classic CAN: 1.2 kB envelope ≈ 20+ ms ISO-TP | envelopes belong on Ethernet/IPC; CBOR profile is the listed future option for constrained links |
| 6 | CPU contention on shared IVI SoC | unbounded without isolation | runtime on safety island / cluster domain, or RT priority + partition |
| 7 | Cross-ECU time sync | ±50 ms skew assumes gPTP | CAN-only fleets document a larger skew budget |
| 8 | Parse/canonicalise/validate, locks, allocation, cache misses | µs–low ms | static pools, zero-copy staging, single-threaded kernel per lane |
| 9 | Crypto math | ~0.1 ms | noise |

Also worth measuring on target hardware: thermal throttling and DVFS transitions, and concurrency with boot, OTA, and diagnostics — tail latency lives there, not in the median.

The three-clock design turns every hardware delay into a *visible, named outcome* (`TRUST_REJECTED_FRESHNESS`, `DELIVERY_TIMEOUT` + fallback) instead of a stale warning pretending to be fresh.

## 6. Implementation shape checklist

- one immutable interaction envelope; pre-allocated bounded object pools
- zero-copy hand-off between stages where the platform allows
- a state machine per interaction; absolute deadlines, never relative timeout chains
- separate executors for critical and non-critical classes
- immutable snapshots of catalog, policy, and credential state
- asynchronous, hash-linked audit with signed checkpoints
- adapters for crypto, transport, clock, persistence, and renderers

The runtime stays a small coordinator. It must not grow into a message broker, a database, an RTOS, or HSM middleware.

## 7. Division of labour

**SIA owns claims** — who may say what, when it applies, where it may appear, what evidence closes it, and the audit chain. **The platform owns physics** — transport QoS, scheduling and isolation, key storage and provisioning, sensor truth, pixels and sound, and the whole-vehicle safety case.

| The spec defines | The deployment profile sets | The safety case proves |
|---|---|---|
| bounded queues + retention semantics | concrete queue sizes | worst-case and tail latency on target HW |
| permitted overload outcomes + codes | reserved critical-lane capacity | behaviour at exhausted queues |
| causal bindings + absolute deadlines | scheduling policy, worker/HSM counts | HSM/CPU/renderer contention |
| delivery ≠ occupant response | per-segment latency budgets | no unsafe duplicate presentation |
| fail-closed trust gate + admission rule | crypto mechanism placement | fallback survives partial failure |
| explicit safety-fallback requirement | renderer + fallback deadlines, audit persistence | |

One paragraph summary: **a buffer is explicit state with a ceiling and a declared outcome; overload is a normal protocol branch, not an exception; cryptography is session-bound with the HSM as root, not gatekeeper; the critical path has reserved resources; and every concrete capacity is proven on the target hardware, not in the spec.**
