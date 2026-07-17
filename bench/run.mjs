#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalSha256 } from '../tools/canonical.mjs';
import { signArtifact, verifyArtifact } from '../tools/crypto.mjs';
import { collectInvariantViolations } from '../tools/invariants.mjs';
import { bundleForArtifact, loadReferenceBundle } from '../tools/reference-bundle.mjs';
import { measureQueuedBurst, measureSync } from './metrics.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const values = {};
  const booleanOptions = new Set(['json', 'quick', 'help']);
  const valueOptions = new Set(['iterations', 'warmup', 'burst', 'concurrency', 'deadline-ms', 'synthetic-hsm-ms', 'synthetic-renderer-ms', 'target-label']);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const [rawName, inlineValue] = argument.slice(2).split('=', 2);
    if (!booleanOptions.has(rawName) && !valueOptions.has(rawName)) throw new Error(`Unknown option: --${rawName}`);
    if (booleanOptions.has(rawName)) values[rawName] = true;
    else {
      const value = inlineValue ?? argv[++index];
      if (value == null || value.startsWith('--')) throw new Error(`--${rawName} requires a value.`);
      values[rawName] = value;
    }
  }
  const number = (name, fallback, { minimum = 0, integer = true } = {}) => {
    const value = values[name] == null ? fallback : Number(values[name]);
    if (!Number.isFinite(value) || value < minimum || (integer && !Number.isInteger(value))) {
      throw new Error(`--${name} must be ${integer ? 'an integer' : 'a number'} >= ${minimum}.`);
    }
    return value;
  };
  const quick = Boolean(values.quick);
  return {
    help: Boolean(values.help),
    json: Boolean(values.json),
    iterations: number('iterations', quick ? 100 : 2000, { minimum: 1 }),
    warmup: number('warmup', quick ? 20 : 200, { minimum: 0 }),
    burst: number('burst', quick ? 25 : 250, { minimum: 1 }),
    concurrency: number('concurrency', 1, { minimum: 1 }),
    deadlineMs: values['deadline-ms'] == null ? null : number('deadline-ms', null, { minimum: 0, integer: false }),
    syntheticHsmMs: number('synthetic-hsm-ms', 0, { minimum: 0, integer: false }),
    syntheticRendererMs: number('synthetic-renderer-ms', 0, { minimum: 0, integer: false }),
    targetLabel: values['target-label'] || 'development-host',
  };
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const readJson = async (...parts) => JSON.parse(await readFile(path.join(root, ...parts), 'utf8'));
const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(`Usage: node bench/run.mjs [options]

  --quick                         small smoke run
  --json                          emit machine-readable JSON
  --iterations N                  timed CPU samples
  --warmup N                      untimed warmup samples
  --burst N                       jobs enqueued at once
  --concurrency N                 single-process async worker count
  --deadline-ms N                 diagnostic deadline comparison
  --synthetic-hsm-ms N            synthetic dependency delay per job
  --synthetic-renderer-ms N       synthetic renderer delay per job
  --target-label TEXT             environment label only; grants no evidence status`);
  process.exit(0);
}
const reference = await loadReferenceBundle(root);
const instancePath = path.join(root, 'examples', 'v0.4.0', 'collision-warning.instance.json');
const instanceText = await readFile(instancePath, 'utf8');
const instance = JSON.parse(instanceText);
const context = reference.context;
const receipt = reference.receipt;
const runtimeSchema = await readJson('schema', 'runtime-instance.schema.json');
const { keys } = await readJson('conformance', 'crypto', 'test-keys.json');
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validateInstance = ajv.compile(runtimeSchema);
const acceptedAtMs = reference.context.captured_at_ms;
const collisionNode = reference.catalog.nodes.find((node) => node.id === instance.node_id);

const assertTrue = (condition, message) => {
  if (!condition) throw new Error(message);
};
const validate = (artifact) => assertTrue(validateInstance(artifact), 'Runtime instance failed schema validation.');
const verifyEs256 = (artifact = instance) => assertTrue(verifyArtifact(artifact, 'attestation', keys[artifact.attestation.key_id]), 'ES256 verification failed.');
const verifyEdDsa = () => assertTrue(verifyArtifact(context, 'integrity', keys[context.integrity.key_id]), 'EdDSA verification failed.');
const verifyHmac = () => assertTrue(verifyArtifact(receipt, 'attestation', keys[receipt.attestation.key_id]), 'HMAC verification failed.');
const signEs256 = () => assertTrue(typeof signArtifact(instance, 'attestation', keys[instance.attestation.key_id]) === 'string', 'ES256 signing failed.');
const signEdDsa = () => assertTrue(typeof signArtifact(context, 'integrity', keys[context.integrity.key_id]) === 'string', 'EdDSA signing failed.');
const signHmac = () => assertTrue(typeof signArtifact(receipt, 'attestation', keys[receipt.attestation.key_id]) === 'string', 'HMAC signing failed.');
const verifyInvariants = (artifact = instance) => {
  const violations = collectInvariantViolations(
    bundleForArtifact('runtime-instance.schema.json', artifact, reference),
    { acceptedAtMs },
  );
  assertTrue(violations.length === 0, `Invariant validation failed: ${violations[0]?.code}`);
};
const cpuAcceptancePath = () => {
  const parsed = JSON.parse(instanceText);
  validate(parsed);
  verifyEs256(parsed);
  verifyInvariants(parsed);
};
const decisionCpuPath = () => {
  cpuAcceptancePath();
  verifyEdDsa();
};

// Assert correctness before collecting timing samples.
cpuAcceptancePath();
verifyEdDsa();
verifyHmac();
signEs256();
signEdDsa();
signHmac();

const measurementOptions = { iterations: options.iterations, warmup: options.warmup };
const segments = [
  measureSync('json_parse_runtime_instance', () => JSON.parse(instanceText), measurementOptions),
  measureSync('schema_validate_runtime_instance', () => validate(instance), measurementOptions),
  measureSync('jcs_sha256_runtime_instance', () => canonicalSha256(instance), measurementOptions),
  measureSync('sign_es256_runtime_instance', signEs256, measurementOptions),
  measureSync('sign_eddsa_context_snapshot', signEdDsa, measurementOptions),
  measureSync('sign_hmac_delivery_receipt', signHmac, measurementOptions),
  measureSync('verify_es256_runtime_instance', () => verifyEs256(), measurementOptions),
  measureSync('verify_eddsa_context_snapshot', verifyEdDsa, measurementOptions),
  measureSync('verify_hmac_delivery_receipt', verifyHmac, measurementOptions),
  measureSync('semantic_invariants_runtime_instance', () => verifyInvariants(), measurementOptions),
  measureSync('acceptance_cpu_path', cpuAcceptancePath, { ...measurementOptions, deadlineMs: options.deadlineMs }),
  measureSync('decision_cpu_path_with_context_auth', decisionCpuPath, { ...measurementOptions, deadlineMs: options.deadlineMs }),
];

const burst = await measureQueuedBurst('decision_cpu_burst', async () => decisionCpuPath(), {
  jobs: options.burst,
  concurrency: options.concurrency,
  deadlineMs: options.deadlineMs,
});

let synthetic = null;
if (options.syntheticHsmMs > 0 || options.syntheticRendererMs > 0) {
  synthetic = await measureQueuedBurst('synthetic_dependency_path', async () => {
    if (options.syntheticHsmMs > 0) await delay(options.syntheticHsmMs);
    decisionCpuPath();
    if (options.syntheticRendererMs > 0) await delay(options.syntheticRendererMs);
  }, {
    jobs: options.burst,
    concurrency: options.concurrency,
    deadlineMs: options.deadlineMs,
  });
}

const gitCommit = (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
})();
const gitDirty = (() => {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0;
  } catch {
    return null;
  }
})();
const cpus = os.cpus();
const report = {
  report_schema: 'sia-development-benchmark/1',
  generated_at: new Date().toISOString(),
  sia_release: reference.catalog.spec_version,
  evidence: {
    level: 'development_measurement_only',
    normative: false,
    production_claim_permitted: false,
    warning: 'Results are not production latency evidence unless repeated on representative target hardware under a reviewed workload and safety-case methodology.',
  },
  environment: {
    target_label: options.targetLabel,
    git_commit: gitCommit,
    git_dirty: gitDirty,
    node: process.version,
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    cpu_model: cpus[0]?.model || 'unknown',
    logical_cpu_count: cpus.length,
    total_memory_bytes: os.totalmem(),
  },
  configuration: {
    iterations: options.iterations,
    warmup: options.warmup,
    burst_jobs: options.burst,
    concurrency: options.concurrency,
    diagnostic_deadline_ms: options.deadlineMs,
    synthetic_hsm_ms: options.syntheticHsmMs,
    synthetic_renderer_ms: options.syntheticRendererMs,
  },
  profile_reference: {
    node_id: collisionNode.id,
    max_ingress_age_ms: collisionNode.trust_requirements.max_ingress_age_ms,
    semantic_validity_ms: collisionNode.semantic_validity_ms,
    delivery_timeout_ms: collisionNode.presentation_contract.delivery_timeout_ms,
    note: 'Reference values are independent contracts, not one additive end-to-end deadline.',
  },
  measured_scope: {
    included: ['JSON parse', 'JSON Schema validation', 'JCS/SHA-256', 'software ES256/EdDSA/HMAC signing and verification', 'repository semantic invariants', 'context authentication', 'single-process burst queue'],
    excluded: ['transport', 'real HSM queueing', 'OS/IPC integration', 'secure time', 'replay-store I/O', 'renderer wake-up', 'time-to-indication', 'thermal and mixed-workload contention'],
  },
  segments,
  burst,
  synthetic,
};

if (options.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log('SIA portable benchmark — DEVELOPMENT MEASUREMENT ONLY');
  console.log(report.evidence.warning);
  console.log(`Host: ${report.environment.target_label} · ${report.environment.cpu_model} · ${report.environment.platform}/${report.environment.architecture} · Node ${report.environment.node}`);
  console.log(`Samples: ${options.iterations} (+ ${options.warmup} warmup) · burst: ${options.burst} · concurrency: ${options.concurrency}`);
  console.log('');
  console.log('CPU segments');
  for (const segment of segments) {
    console.log(`${segment.name.padEnd(38)} p50 ${segment.p50_ms.toFixed(3)} ms · p99 ${segment.p99_ms.toFixed(3)} ms · p99.9 ${segment.p99_9_ms.toFixed(3)} ms · max ${segment.max_ms.toFixed(3)} ms`);
  }
  console.log('');
  console.log(`Burst end-to-end                    p50 ${burst.end_to_end.p50_ms.toFixed(3)} ms · p99 ${burst.end_to_end.p99_ms.toFixed(3)} ms · max ${burst.end_to_end.max_ms.toFixed(3)} ms`);
  console.log(`Burst queue residence               p50 ${burst.queue_residence.p50_ms.toFixed(3)} ms · p99 ${burst.queue_residence.p99_ms.toFixed(3)} ms · max ${burst.queue_residence.max_ms.toFixed(3)} ms`);
  if (synthetic) console.log(`Synthetic dependency path           p99 ${synthetic.end_to_end.p99_ms.toFixed(3)} ms · max ${synthetic.end_to_end.max_ms.toFixed(3)} ms`);
  if (options.deadlineMs != null) console.log(`Diagnostic deadline ${options.deadlineMs} ms: ${burst.end_to_end.deadline_misses}/${burst.jobs} burst misses (not a production verdict).`);
}
