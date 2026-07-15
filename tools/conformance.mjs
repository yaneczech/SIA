#!/usr/bin/env node
/**
 * SIA conformance vector runner.
 *
 *   npm run conformance              # all vectors
 *   npm run conformance -- emitter   # only vectors required for one class
 *
 * Resolves each vector (base example + RFC 7386 merge patch, or inline
 * artifact), validates it against its contract in strict mode, and compares
 * the outcome with the vector's expectation.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadJson = async (...parts) => JSON.parse(await readFile(path.join(root, ...parts), 'utf8'));

/** RFC 7386 JSON Merge Patch. */
function mergePatch(target, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const result = target === null || typeof target !== 'object' || Array.isArray(target) ? {} : { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = mergePatch(result[key], value);
  }
  return result;
}

const schemaFiles = [
  'interaction-node.schema.json',
  'catalog.schema.json',
  'runtime-instance.schema.json',
  'context-snapshot.schema.json',
  'renderer-capability.schema.json',
  'render-plan.schema.json',
  'delivery-receipt.schema.json',
  'occupant-response.schema.json',
  'retention-record.schema.json',
  'audit-record.schema.json',
];
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const schemaIds = {};
for (const file of schemaFiles) {
  const schema = await loadJson('schema', file);
  ajv.addSchema(schema);
  schemaIds[file] = schema.$id;
}

const classFilter = process.argv[2] || null;
const { vectors } = await loadJson('conformance', 'vectors.json');
const selected = classFilter ? vectors.filter((vector) => vector.classes.includes(classFilter)) : vectors;
if (selected.length === 0) {
  console.error(`No vectors for class "${classFilter}". Known classes: emitter, renderer, runtime.`);
  process.exit(2);
}

let failures = 0;
for (const vector of selected) {
  const base = vector.base ? await loadJson('examples', 'v0.4', vector.base) : vector.artifact;
  const artifact = vector.patch ? mergePatch(base, vector.patch) : base;
  const validate = ajv.getSchema(schemaIds[vector.contract]);
  const outcome = validate(artifact) ? 'valid' : 'invalid';
  const pass = outcome === vector.expect;
  if (!pass) {
    failures += 1;
    console.error(`✗ ${vector.name}: expected ${vector.expect}, got ${outcome}. ${vector.reason}`);
    if (outcome === 'invalid') console.error(`    ${ajv.errorsText(validate.errors, { separator: '\n    ' })}`);
  } else {
    console.log(`✓ ${vector.name}`);
  }
}

console.log(`\n${selected.length - failures}/${selected.length} vectors passed${classFilter ? ` for class "${classFilter}"` : ''}.`);
process.exit(failures === 0 ? 0 : 1);
