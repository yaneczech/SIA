import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalSha256 } from '../tools/canonical.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const schemaDir = path.join(root, 'schema');
const examplesDir = path.join(root, 'examples', 'v0.4');

const loadJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
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
const schemas = Object.fromEntries(await Promise.all(schemaFiles.map(async (file) => [file, await loadJson(path.join(schemaDir, file))])));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
Object.values(schemas).forEach((schema) => ajv.addSchema(schema));

const exampleContracts = {
  'collision-warning.node.json': 'interaction-node.schema.json',
  'diagnostic.node.json': 'interaction-node.schema.json',
  'now-playing.node.json': 'interaction-node.schema.json',
  'assistant-suggestion.node.json': 'interaction-node.schema.json',
  'collision-warning.instance.json': 'runtime-instance.schema.json',
  'context-attentive.json': 'context-snapshot.schema.json',
  'cluster.renderer.json': 'renderer-capability.schema.json',
  'collision.render-plan.json': 'render-plan.schema.json',
  'collision.delivery-receipt.json': 'delivery-receipt.schema.json',
  'collision.occupant-response.json': 'occupant-response.schema.json',
  'now-playing.retention-record.json': 'retention-record.schema.json',
  'collision.audit-record.json': 'audit-record.schema.json',
};
const examples = Object.fromEntries(await Promise.all(Object.keys(exampleContracts).map(async (file) => [file, await loadJson(path.join(examplesDir, file))])));
const publishedCatalog = {
  spec_version: '0.4.0',
  profile_id: 'sia-minimal',
  profile_version: '0.4.0',
  catalog_version: '0.4.0',
  generated_at_ms: 1784116800000,
  nodes: [
    examples['collision-warning.node.json'],
    examples['diagnostic.node.json'],
    examples['now-playing.node.json'],
    examples['assistant-suggestion.node.json'],
  ],
};

function assertValid(schemaFile, value) {
  const validate = ajv.getSchema(schemas[schemaFile].$id);
  assert.ok(validate(value), ajv.errorsText(validate.errors, { separator: '\n' }));
}

function assertCanonicalInvariants({ catalog, instance, context, plan, retention, audit }) {
  if (catalog) {
    const ids = catalog.nodes.map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length, 'catalog node IDs must be unique');
  }
  if (instance) assert.ok(instance.occurred_at_ms < instance.valid_until_ms, 'valid_until_ms must be later than occurred_at_ms');
  if (context) {
    for (const [axis, observation] of Object.entries(context.axes)) {
      assert.ok(observation.observed_at_ms <= context.captured_at_ms, `${axis} observation cannot be newer than its snapshot`);
    }
  }
  if (plan) {
    const selected = plan.selected.map((item) => item.renderer_id);
    const rejected = plan.rejected.map((item) => item.renderer_id);
    assert.equal(new Set(selected).size, selected.length, 'a renderer may appear only once in selected');
    assert.equal(plan.selected.filter((item) => item.role === 'primary').length, 1, 'a render plan must have exactly one primary');
    assert.equal(selected.some((id) => rejected.includes(id)), false, 'selected and rejected renderer sets must be disjoint');
    if (plan.delivery_success_policy === 'all_required_presented') {
      assert.ok(plan.selected.some((item) => item.role === 'required'), 'all_required_presented needs at least one required renderer');
    }
  }
  if (retention?.expires_at_ms != null) assert.ok(retention.retained_at_ms < retention.expires_at_ms, 'retention expiry must be after retention time');
  if (audit) assert.equal(audit.previous_record_sha256 === null, audit.sequence === 0, 'only the first audit record may omit its predecessor hash');
}

test('every v0.4 schema compiles under JSON Schema 2020-12 strict mode', () => {
  for (const schema of Object.values(schemas)) assert.doesNotThrow(() => ajv.getSchema(schema.$id));
});

test('every published v0.4 example validates against its declared contract', () => {
  for (const [exampleFile, schemaFile] of Object.entries(exampleContracts)) assertValid(schemaFile, examples[exampleFile]);
});

test('node catalog manifest validates the four published nodes', () => {
  assertValid('catalog.schema.json', publishedCatalog);
});

test('published examples satisfy cross-field and collection invariants', () => {
  assertCanonicalInvariants({
    catalog: publishedCatalog,
    instance: examples['collision-warning.instance.json'],
    context: examples['context-attentive.json'],
    plan: examples['collision.render-plan.json'],
    retention: examples['now-playing.retention-record.json'],
    audit: examples['collision.audit-record.json'],
  });
});

test('untyped Event subclasses are rejected', () => {
  const invalid = structuredClone(examples['collision-warning.node.json']);
  invalid.id = 'Interaction.Event.Generic.Message';
  const validate = ajv.getSchema(schemas['interaction-node.schema.json'].$id);
  assert.equal(validate(invalid), false);
});

test('Action declarations and instances are deferred from the 0.4 profile', () => {
  const declaration = structuredClone(examples['collision-warning.node.json']);
  declaration.id = 'Interaction.Action.Media.Control';
  declaration.inherits_from = 'Interaction.Action';
  declaration.direction = 'occupant_to_system';
  const validateDeclaration = ajv.getSchema(schemas['interaction-node.schema.json'].$id);
  assert.equal(validateDeclaration(declaration), false);

  const instance = structuredClone(examples['collision-warning.instance.json']);
  instance.node_id = 'Interaction.Action.Media.Control';
  const validateInstance = ajv.getSchema(schemas['runtime-instance.schema.json'].$id);
  assert.equal(validateInstance(instance), false);
});

test('empty trust contracts are rejected', () => {
  const invalid = structuredClone(examples['now-playing.node.json']);
  invalid.trust_requirements = {};
  const validate = ajv.getSchema(schemas['interaction-node.schema.json'].$id);
  assert.equal(validate(invalid), false);
});

test('coalesce requires a TTL and canonical key fields', () => {
  const invalid = structuredClone(examples['now-playing.node.json']);
  delete invalid.context_policy.on_blocked.ttl_ms;
  delete invalid.context_policy.on_blocked.coalescing_key_fields;
  const validate = ajv.getSchema(schemas['interaction-node.schema.json'].$id);
  assert.equal(validate(invalid), false);
});

test('retention TTL cannot exceed semantic validity', () => {
  for (const node of Object.values(examples).filter((value) => value?.context_policy?.on_blocked)) {
    const ttl = node.context_policy.on_blocked.ttl_ms;
    if (ttl != null) assert.ok(ttl <= node.semantic_validity_ms, `${node.id}: retention TTL exceeds semantic validity`);
  }
});

test('runtime envelope rejects payload-authoritative priority injection', () => {
  const invalid = structuredClone(examples['collision-warning.instance.json']);
  invalid.priority = 'critical';
  const validate = ajv.getSchema(schemas['runtime-instance.schema.json'].$id);
  assert.equal(validate(invalid), false);
});

test('renderer delivery timeout can only be issued by Coordination Runtime', () => {
  const invalid = structuredClone(examples['collision.delivery-receipt.json']);
  invalid.state = 'timed_out';
  invalid.reason_code = 'DELIVERY_TIMEOUT';
  invalid.issuer = 'renderer';
  const validate = ajv.getSchema(schemas['delivery-receipt.schema.json'].$id);
  assert.equal(validate(invalid), false);
});

test('successful delivery receipts cannot carry failure reasons', () => {
  const invalid = structuredClone(examples['collision.delivery-receipt.json']);
  invalid.reason_code = 'MISLEADING_FAILURE';
  const validate = ajv.getSchema(schemas['delivery-receipt.schema.json'].$id);
  assert.equal(validate(invalid), false);
});

test('renderer failure receipts cannot be issued by Coordination Runtime', () => {
  const invalid = structuredClone(examples['collision.delivery-receipt.json']);
  invalid.state = 'failed';
  invalid.reason_code = 'RENDERER_OUTPUT_FAILED';
  invalid.issuer = 'coordination_runtime';
  const validate = ajv.getSchema(schemas['delivery-receipt.schema.json'].$id);
  assert.equal(validate(invalid), false);
});

test('safety-relevant renderer capability requires assurance evidence', () => {
  const invalid = structuredClone(examples['cluster.renderer.json']);
  invalid.safety_assurance.evidence_ref = null;
  const validate = ajv.getSchema(schemas['renderer-capability.schema.json'].$id);
  assert.equal(validate(invalid), false);
});

const payloadSchemaByRef = {
  'sia:payload:collision-warning:1': 'collision-warning.v1.schema.json',
  'sia:payload:collision-sensor-test:1': 'collision-sensor-test.v1.schema.json',
  'sia:payload:now-playing:1': 'now-playing.v1.schema.json',
  'sia:payload:assistant-suggestion:1': 'assistant-suggestion.v1.schema.json',
};

test('every declared payload digest matches the canonical form of its published payload schema', async () => {
  for (const node of publishedCatalog.nodes) {
    const payloadFile = payloadSchemaByRef[node.payload_schema_ref];
    assert.ok(payloadFile, `${node.id}: payload_schema_ref ${node.payload_schema_ref} has no published payload schema`);
    const payloadSchema = JSON.parse(await readFile(path.join(schemaDir, 'payloads', payloadFile), 'utf8'));
    assert.equal(node.payload_schema_sha256, canonicalSha256(payloadSchema), `${node.id}: payload_schema_sha256 does not match the canonical digest of ${payloadFile}`);
  }
});

test('the runtime instance binds the canonical digest of its declaration and a schema-valid payload', async () => {
  const instance = examples['collision-warning.instance.json'];
  const declaration = examples['collision-warning.node.json'];
  assert.equal(instance.node_schema_sha256, canonicalSha256(declaration), 'node_schema_sha256 must be the canonical digest of the declaration');

  const payloadSchema = JSON.parse(await readFile(path.join(schemaDir, 'payloads', payloadSchemaByRef[declaration.payload_schema_ref]), 'utf8'));
  const payloadAjv = new Ajv2020({ allErrors: true, strict: true });
  const validatePayload = payloadAjv.compile(payloadSchema);
  assert.ok(validatePayload(instance.payload), payloadAjv.errorsText(validatePayload.errors));
});

test('every reason and outcome code used on the wire is registered', async () => {
  const registry = JSON.parse(await readFile(path.join(root, 'registry', 'reason-codes.json'), 'utf8'));
  const registered = new Set(Object.values(registry.phases).flat().map((entry) => entry.code));
  for (const entry of Object.values(registry.phases).flat()) {
    assert.match(entry.code, /^[A-Z][A-Z0-9_]+$/, `registry code ${entry.code} violates the allocation pattern`);
  }

  const usedCodes = [];
  const plan = examples['collision.render-plan.json'];
  usedCodes.push(plan.reason_code, ...plan.rejected.map((item) => item.reason_code));
  usedCodes.push(examples['collision.audit-record.json'].outcome_code);
  usedCodes.push(examples['now-playing.retention-record.json'].reason_code);
  const receiptReason = examples['collision.delivery-receipt.json'].reason_code;
  if (receiptReason) usedCodes.push(receiptReason);

  for (const code of usedCodes) {
    assert.ok(registered.has(code), `code ${code} appears on the wire but is not in registry/reason-codes.json`);
  }
});

test('semantic invariants reject ambiguous plans and invalid time ordering', () => {
  const duplicatePlan = structuredClone(examples['collision.render-plan.json']);
  duplicatePlan.selected.push({ renderer_id: duplicatePlan.selected[0].renderer_id, role: 'fallback' });
  assert.throws(() => assertCanonicalInvariants({ plan: duplicatePlan }), /only once/);

  const invalidInstance = structuredClone(examples['collision-warning.instance.json']);
  invalidInstance.valid_until_ms = invalidInstance.occurred_at_ms;
  assert.throws(() => assertCanonicalInvariants({ instance: invalidInstance }), /later than/);
});
