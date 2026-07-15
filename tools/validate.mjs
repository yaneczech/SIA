#!/usr/bin/env node
/**
 * SIA artifact validator.
 *
 *   node tools/validate.mjs <file.json> [more.json ...]
 *   npm run validate -- examples/v0.4/collision-warning.instance.json
 *
 * Detects the contract from the document shape, validates it against the
 * v0.4 schema set in strict mode, and explains failures in plain language.
 * Node declarations additionally get their payload-schema digest verified
 * when the referenced payload schema ships in this repository.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalSha256 } from './canonical.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = path.join(root, 'schema');

const loadJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const contractFiles = [
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
const schemas = {};
for (const file of contractFiles) {
  schemas[file] = await loadJson(path.join(schemaDir, file));
  ajv.addSchema(schemas[file]);
}

function detectContract(doc) {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return null;
  if (Array.isArray(doc.nodes) && doc.catalog_version) return 'catalog.schema.json';
  if (doc.attestation && doc.node_id) return 'runtime-instance.schema.json';
  if (doc.axes && doc.context_id) return 'context-snapshot.schema.json';
  if (doc.capabilities && doc.renderer_id) return 'renderer-capability.schema.json';
  if (doc.selected && doc.rejected) return 'render-plan.schema.json';
  if (doc.receipt_id) return 'delivery-receipt.schema.json';
  if (doc.response_id) return 'occupant-response.schema.json';
  if (doc.retention_id) return 'retention-record.schema.json';
  if (doc.event_id && doc.phase) return 'audit-record.schema.json';
  if (typeof doc.id === 'string' && doc.id.startsWith('Interaction.')) return 'interaction-node.schema.json';
  return null;
}

function explain(error) {
  const where = error.instancePath || '(document root)';
  switch (error.keyword) {
    case 'additionalProperties':
      return `${where}: unexpected field "${error.params.additionalProperty}" — SIA envelopes are closed; a runtime instance must not carry policy overrides.`;
    case 'unevaluatedProperties':
      return `${where}: unexpected field "${error.params.unevaluatedProperty}" — not part of this contract.`;
    case 'required':
      return `${where}: missing required field "${error.params.missingProperty}".`;
    case 'enum':
      return `${where}: value must be one of ${JSON.stringify(error.params.allowedValues)}.`;
    case 'const':
      return `${where}: value must be ${JSON.stringify(error.params.allowedValue)}.`;
    case 'pattern':
      return `${where}: value does not match the required format (${error.params.pattern}).`;
    default:
      return `${where}: ${error.message}.`;
  }
}

async function payloadSchemaIndex() {
  const dir = path.join(schemaDir, 'payloads');
  const index = new Map();
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.schema.json')) continue;
    const match = file.match(/^(.+)\.v(\d+)\.schema\.json$/);
    if (!match) continue;
    index.set(`sia:payload:${match[1]}:${match[2]}`, path.join(dir, file));
  }
  return index;
}

async function verifyNodeDigest(doc) {
  const index = await payloadSchemaIndex();
  const payloadPath = index.get(doc.payload_schema_ref);
  if (!payloadPath) {
    return { ok: true, note: `payload schema ${doc.payload_schema_ref} is not published in this repository; digest not checked.` };
  }
  const digest = canonicalSha256(await loadJson(payloadPath));
  if (digest !== doc.payload_schema_sha256) {
    return { ok: false, note: `payload_schema_sha256 mismatch for ${doc.payload_schema_ref}: declaration says ${doc.payload_schema_sha256}, canonical digest is ${digest}.` };
  }
  return { ok: true, note: `payload schema digest verified (${doc.payload_schema_ref}).` };
}

const files = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
if (files.length === 0) {
  console.error('Usage: node tools/validate.mjs <file.json> [more.json ...]');
  process.exit(2);
}

let failures = 0;
for (const file of files) {
  let doc;
  try {
    doc = await loadJson(file);
  } catch (error) {
    console.error(`✗ ${file}: not valid JSON — ${error.message}`);
    failures += 1;
    continue;
  }
  const contract = detectContract(doc);
  if (!contract) {
    console.error(`✗ ${file}: does not look like any SIA v0.4 artifact.`);
    failures += 1;
    continue;
  }
  const validate = ajv.getSchema(schemas[contract].$id);
  if (!validate(doc)) {
    console.error(`✗ ${file} (${contract.replace('.schema.json', '')}):`);
    for (const error of validate.errors) console.error(`    ${explain(error)}`);
    failures += 1;
    continue;
  }
  const notes = [];
  if (contract === 'interaction-node.schema.json') {
    const digestResult = await verifyNodeDigest(doc);
    notes.push(digestResult.note);
    if (!digestResult.ok) {
      console.error(`✗ ${file} (interaction-node): ${digestResult.note}`);
      failures += 1;
      continue;
    }
  }
  console.log(`✓ ${file} (${contract.replace('.schema.json', '')})${notes.length ? ` — ${notes.join(' ')}` : ''}`);
}

process.exit(failures === 0 ? 0 : 1);
