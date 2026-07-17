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
import { collectInvariantViolations } from './invariants.mjs';
import { bundleForArtifact, loadReferenceBundle } from './reference-bundle.mjs';
import { loadPayloadContracts, validateCatalogPayloadBindings, validateRuntimePayload } from './payload-validation.mjs';

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

function pointerParts(pointer) {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`Invalid JSON Pointer: ${pointer}`);
  return pointer.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function pointerGet(document, pointer) {
  return pointerParts(pointer).reduce((value, part) => value?.[part], document);
}

/** Minimal RFC 6902 support used by vectors that must address array members. */
function applyOperations(document, operations = []) {
  const result = structuredClone(document);
  for (const operation of operations) {
    const parts = pointerParts(operation.path);
    const key = parts.pop();
    const parent = parts.reduce((value, part) => value[part], result);
    const value = operation.op === 'copy'
      ? structuredClone(pointerGet(result, operation.from))
      : structuredClone(operation.value);
    if (operation.op === 'replace') parent[key] = value;
    else if (operation.op === 'copy' && key === '-' && Array.isArray(parent)) parent.push(value);
    else if (operation.op === 'copy') parent[key] = value;
    else throw new Error(`Unsupported vector operation: ${operation.op}`);
  }
  return result;
}

const schemaFiles = [
  'interaction-node.schema.json',
  'catalog.schema.json',
  'actor-registry.schema.json',
  'context-policy.schema.json',
  'runtime-instance.schema.json',
  'context-snapshot.schema.json',
  'renderer-capability.schema.json',
  'render-plan.schema.json',
  'dispatch-attempt.schema.json',
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
const payloadContracts = await loadPayloadContracts(root, ajv);

const classFilter = process.argv[2] || null;
const { vectors } = await loadJson('conformance', 'vectors.json');
const reference = await loadReferenceBundle(root);
const selected = classFilter ? vectors.filter((vector) => vector.classes.includes(classFilter)) : vectors;
if (selected.length === 0) {
  console.error(`No vectors for class "${classFilter}". Known classes: emitter, renderer, runtime.`);
  process.exit(2);
}

let failures = 0;
for (const vector of selected) {
  const base = vector.base ? await loadJson('examples', 'v0.4.0', vector.base) : vector.artifact;
  const patched = vector.patch ? mergePatch(base, vector.patch) : base;
  const artifact = applyOperations(patched, vector.operations);
  const validate = ajv.getSchema(schemaIds[vector.contract]);
  const schemaValid = validate(artifact);
  const violations = schemaValid && vector.semantic
    ? collectInvariantViolations(bundleForArtifact(vector.contract, artifact, reference), { acceptedAtMs: reference.context.captured_at_ms })
    : [];
  if (schemaValid && vector.semantic && vector.contract === 'catalog.schema.json') violations.push(...validateCatalogPayloadBindings(artifact, payloadContracts));
  if (schemaValid && vector.semantic && vector.contract === 'runtime-instance.schema.json') violations.push(...validateRuntimePayload(artifact, reference.catalog, payloadContracts));
  const outcome = schemaValid && violations.length === 0 ? 'valid' : 'invalid';
  const pass = outcome === vector.expect;
  if (!pass) {
    failures += 1;
    console.error(`✗ ${vector.name}: expected ${vector.expect}, got ${outcome}. ${vector.reason}`);
    if (!schemaValid) console.error(`    ${ajv.errorsText(validate.errors, { separator: '\n    ' })}`);
    else if (violations.length) console.error(`    ${violations.map((item) => `${item.code}: ${item.message}`).join('\n    ')}`);
  } else {
    console.log(`✓ ${vector.name}`);
  }
}

console.log(`\n${selected.length - failures}/${selected.length} vectors passed${classFilter ? ` for class "${classFilter}"` : ''}.`);
process.exit(failures === 0 ? 0 : 1);
