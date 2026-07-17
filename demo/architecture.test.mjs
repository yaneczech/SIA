import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The interactive architecture diagram (docs.js #architecture) renders its
// trust-check count, context axes, and output surfaces from data so it cannot
// silently drift from the specification. These tests are that guard: they fail
// if the diagram's data sources diverge from the schema, registry, or engine.
// docs.js uses top-level await and touches the DOM, so it is parsed as source
// rather than imported.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = async (...p) => readFile(path.join(root, ...p), 'utf8');
const readJson = async (...p) => JSON.parse(await read(...p));

const docsSource = await read('demo', 'docs.js');
const engineSource = await read('demo', 'sia-engine.js');

test('the generated demo profile exactly matches its canonical sources', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await promisify(execFile)(process.execPath, [path.join(root, 'tools', 'build-demo-profile.mjs'), '--check']);
});

test('the diagram context axes exactly match the context-snapshot schema', async () => {
  const schema = await readJson('schema', 'context-snapshot.schema.json');
  const schemaAxes = Object.keys(schema.properties.axes.properties).sort();
  const { CONTEXT_AXES: generatedAxes } = await import('./generated-profile.js');
  const diagramAxes = [...generatedAxes].sort();

  assert.deepEqual(diagramAxes, schemaAxes, 'diagram axes must equal the schema axes');
  assert.equal(diagramAxes.length, 6, 'the 0.4 core profile has six context axes');
});

test('every trust-check failure code the diagram shows is registered', async () => {
  const registry = await readJson('registry', 'reason-codes.json');
  const registered = new Set(registry.phases.trust.map((entry) => entry.code));

  const failureCodes = [...docsSource.matchAll(/failure: '([A-Z_]+)'/g)].map((m) => m[1]);
  assert.equal(failureCodes.length, 8, 'the diagram claims eight trust checks');
  assert.equal(new Set(failureCodes).size, 8, 'trust failure codes must be distinct');
  for (const code of failureCodes) {
    assert.ok(registered.has(code), `trust failure code ${code} is not in registry/reason-codes.json`);
  }
});

test('the diagram output surfaces match the engine renderer set', async () => {
  const { RENDERERS } = await import('./sia-engine.js');
  const engineRenderers = Object.keys(RENDERERS).sort();

  // The diagram lists surfaces via Object.keys(RENDERERS) at runtime; assert the
  // engine still exposes the three 0.4 surfaces the diagram narrates.
  assert.deepEqual(engineRenderers, ['cluster', 'ivi', 'voice'], 'engine must expose the three v0.4 renderer surfaces');
});

test('the engine contains presentation labels but no hand-copied normative profile values', () => {
  assert.match(engineSource, /generated-profile\.js\?v=0\.4\.1/);
  assert.match(docsSource, /sia-engine\.js\?v=0\.4\.2/);
  assert.doesNotMatch(engineSource, /semanticValidityMs:\s*\d|maxIngressAgeMs:\s*\d|deliveryTimeoutMs:\s*\d|maxGlanceBudgetMs:\s*\d/);
});

test('interactive documentation renders generated artifact excerpts', () => {
  const contractsBlock = docsSource.match(/const contracts = \{([\s\S]*?)\n\};\n\n\/\/ Documentation metadata/);
  assert.ok(contractsBlock, 'documentation contract metadata block not found');
  assert.doesNotMatch(contractsBlock[1], /^\s+value:/m, 'contract metadata must not contain hand-copied artifact values');
  assert.match(docsSource, /Object\.entries\(DOC_EXCERPTS\)/);
  assert.match(docsSource, /lifecycle\[0\]\.code = DOC_EXCERPTS\.node/);
});
