const nowNs = () => process.hrtime.bigint();
const elapsedMs = (startedAt) => Number(nowNs() - startedAt) / 1e6;

export function percentile(samples, quantile) {
  if (!samples.length) throw new RangeError('At least one sample is required.');
  if (quantile < 0 || quantile > 1) throw new RangeError('Quantile must be between 0 and 1.');
  const sorted = [...samples].sort((a, b) => a - b);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function summarize(samples, deadlineMs = null) {
  if (!samples.length) throw new RangeError('At least one sample is required.');
  const total = samples.reduce((sum, value) => sum + value, 0);
  const deadlineMisses = deadlineMs == null ? null : samples.filter((value) => value > deadlineMs).length;
  return {
    samples: samples.length,
    mean_ms: total / samples.length,
    p50_ms: percentile(samples, 0.5),
    p95_ms: percentile(samples, 0.95),
    p99_ms: percentile(samples, 0.99),
    p99_9_ms: percentile(samples, 0.999),
    max_ms: samples.reduce((maximum, value) => Math.max(maximum, value), -Infinity),
    deadline_ms: deadlineMs,
    deadline_misses: deadlineMisses,
    deadline_miss_rate: deadlineMisses == null ? null : deadlineMisses / samples.length,
  };
}

export function measureSync(name, operation, { iterations, warmup, deadlineMs = null }) {
  for (let index = 0; index < warmup; index += 1) operation();
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = nowNs();
    operation();
    samples.push(elapsedMs(startedAt));
  }
  return { name, kind: 'cpu_segment', ...summarize(samples, deadlineMs) };
}

export async function measureQueuedBurst(name, operation, { jobs, concurrency = 1, deadlineMs = null }) {
  if (!Number.isInteger(jobs) || jobs < 1) throw new RangeError('jobs must be a positive integer.');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be a positive integer.');
  const enqueuedAt = nowNs();
  const queueSamples = new Array(jobs);
  const serviceSamples = new Array(jobs);
  const totalSamples = new Array(jobs);
  let next = 0;

  const worker = async () => {
    while (next < jobs) {
      const index = next;
      next += 1;
      const startedAt = nowNs();
      queueSamples[index] = Number(startedAt - enqueuedAt) / 1e6;
      await operation(index);
      const finishedAt = nowNs();
      serviceSamples[index] = Number(finishedAt - startedAt) / 1e6;
      totalSamples[index] = Number(finishedAt - enqueuedAt) / 1e6;
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs) }, worker));
  return {
    name,
    kind: 'queued_burst',
    jobs,
    concurrency,
    queue_residence: summarize(queueSamples),
    service: summarize(serviceSamples),
    end_to_end: summarize(totalSamples, deadlineMs),
  };
}
