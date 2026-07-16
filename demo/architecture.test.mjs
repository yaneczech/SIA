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

test('the diagram context axes exactly match the context-snapshot schema', async () => {
  const schema = await readJson('schema', 'context-snapshot.schema.json');
  const schemaAxes = Object.keys(schema.properties.axes.properties).sort();

  const match = docsSource.match(/const CORE_AXES = \[([^\]]*)\]/);
  assert.ok(match, 'CORE_AXES array not found in docs.js');
  const diagramAxes = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

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
  const engineSource = await read('demo', 'sia-engine.js');
  const rendererBlock = engineSource.match(/export const RENDERERS = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(rendererBlock, 'RENDERERS export not found in sia-engine.js');
  const engineRenderers = [...rendererBlock[1].matchAll(/^\s*(\w+):\s*\{/gm)].map((m) => m[1]).sort();

  // The diagram lists surfaces via Object.keys(RENDERERS) at runtime; assert the
  // engine still exposes the three 0.4 surfaces the diagram narrates.
  assert.deepEqual(engineRenderers, ['cluster', 'ivi', 'voice'], 'engine must expose the three v0.4 renderer surfaces');
});
