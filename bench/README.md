# SIA portable benchmark harness

This harness measures the repository's current validation and cryptographic implementation. It is **development instrumentation, not a production latency claim and not part of the normative SIA 0.4.0 contract**.

## Run it

```bash
npm run benchmark:quick
npm run benchmark
npm run benchmark -- --deadline-ms 200 --burst 1000 --concurrency 1
npm run benchmark -- --quick --json > /tmp/sia-benchmark.json
```

The default run measures individual CPU segments and a burst through the combined acceptance CPU path. `--deadline-ms` adds diagnostic deadline-miss counts; it does not turn a development-host result into evidence that a vehicle meets the deadline.

Optional synthetic delays exercise the reporting and queue model while real dependencies are unavailable:

```bash
npm run benchmark -- --synthetic-hsm-ms 2 --synthetic-renderer-ms 20 --burst 250 --concurrency 1
```

Synthetic delay results MUST be labelled synthetic. They do not predict a particular HSM or renderer.

## What is measured

- JSON parsing and strict runtime-instance schema validation;
- RFC 8785 canonicalisation and SHA-256;
- the repository's software ES256, EdDSA, and HMAC signing and verification paths;
- cross-artifact semantic invariants;
- their combined acceptance CPU path;
- queue residence and completion latency for an instantaneous burst.

Each distribution reports sample count, mean, `p50`, `p95`, `p99`, `p99.9`, maximum, and optional deadline misses. Machine-readable output also records the Git commit, dirty-worktree state, Node version, OS, architecture, CPU, memory, workload parameters, measured scope, and explicit exclusions.

## Evidence levels

1. **Development host:** validates the harness, identifies gross regressions, and compares implementation alternatives. It cannot support a vehicle latency claim.
2. **Representative target:** the unchanged harness runs on the intended ECU/SoC, production OS and crypto integration. Results are candidate evidence only when the exact build, hardware, thermal state, power mode, scheduler, workload, and repetitions are recorded.
3. **Safety-case evidence:** reviewed target measurements include real HSM contention, transport and IPC, secure time, replay storage, mixed workloads, cold starts, thermal throttling, renderer wake-up/time-to-indication, audit backpressure, fallback reserve, fault injection, and the slowest supported configuration.

The target campaign must evaluate tails and deadline misses, not only averages. It must keep ingress freshness, semantic validity, delivery timeout, and renderer time-to-indication distinct. A useful feasibility check is:

```text
worst-case authentication
+ bounded queue residence
+ SIA decision
+ dispatch and renderer time-to-indication
+ required fallback reserve
<= semantic validity
```

## Interpretation boundary

Do not use development-host numbers to choose a new wire encoding. First run the same workload on representative target hardware. Prototype JSON/JCS and an alternative such as CBOR/COSE only if measured target tails show that encoding or cryptography is a material constraint. A new wire profile remains a separate, explicitly negotiated future release decision.
