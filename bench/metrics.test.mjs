import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { measureQueuedBurst, percentile, summarize } from './metrics.mjs';

test('percentiles and deadline misses are deterministic', () => {
  assert.equal(percentile([4, 1, 3, 2], 0), 1);
  assert.equal(percentile([4, 1, 3, 2], 0.5), 2.5);
  assert.equal(percentile([4, 1, 3, 2], 1), 4);
  const result = summarize([1, 2, 3, 4], 2.5);
  assert.equal(result.samples, 4);
  assert.equal(result.mean_ms, 2.5);
  assert.equal(result.deadline_misses, 2);
  assert.equal(result.deadline_miss_rate, 0.5);
});

test('queued burst reports queue, service, and end-to-end distributions', async () => {
  const result = await measureQueuedBurst('test', async () => {}, { jobs: 4, concurrency: 1, deadlineMs: 1000 });
  assert.equal(result.jobs, 4);
  assert.equal(result.queue_residence.samples, 4);
  assert.equal(result.service.samples, 4);
  assert.equal(result.end_to_end.samples, 4);
  assert.equal(result.end_to_end.deadline_misses, 0);
});

test('quick JSON benchmark is machine-readable and refuses production claims', async () => {
  const runFile = fileURLToPath(new URL('./run.mjs', import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, [runFile, '--quick', '--json']);
  const report = JSON.parse(stdout);
  assert.equal(report.report_schema, 'sia-development-benchmark/1');
  assert.equal(report.sia_release, '0.4.0');
  assert.equal(report.evidence.normative, false);
  assert.equal(report.evidence.production_claim_permitted, false);
  assert.equal(typeof report.environment.git_dirty, 'boolean');
  assert.ok(report.segments.some((segment) => segment.name === 'acceptance_cpu_path'));
  assert.ok(report.segments.some((segment) => segment.name === 'sign_es256_runtime_instance'));
  assert.ok(report.segments.some((segment) => segment.name === 'decision_cpu_path_with_context_auth'));
  assert.equal(report.burst.jobs, 25);
});
