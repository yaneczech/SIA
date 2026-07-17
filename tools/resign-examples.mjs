#!/usr/bin/env node
/**
 * Refreshes every derived digest binding and signature in examples/v0.4.0.
 * Dependency order is intentional: authorities -> declarations -> catalog ->
 * runtime artifacts. Run after changing a policy, registry, declaration, or
 * signed example.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSha256 } from './canonical.mjs';
import { signArtifact, verifyArtifact } from './crypto.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examplesDir = path.join(root, 'examples', 'v0.4.0');
const { keys } = JSON.parse(await readFile(path.join(root, 'conformance/crypto/test-keys.json'), 'utf8'));
const nodeFiles = [
  'collision-warning.node.json',
  'lane-departure-warning.node.json',
  'diagnostic.node.json',
  'now-playing.node.json',
  'assistant-suggestion.node.json',
];

const readExample = async (file) => JSON.parse(await readFile(path.join(examplesDir, file), 'utf8'));
const writeExample = async (file, artifact) => writeFile(path.join(examplesDir, file), `${JSON.stringify(artifact, null, 2)}\n`);

async function signAndWrite(file, container) {
  const artifact = await readExample(file);
  const keyId = artifact[container].key_id;
  const key = keys[keyId];
  if (!key) throw new Error(`${file}: no test key for key_id ${keyId}`);
  artifact[container].algorithm = key.algorithm;
  artifact[container].signature = signArtifact(artifact, container, key);
  if (!verifyArtifact(artifact, container, key)) throw new Error(`${file}: self-verification failed`);
  await writeExample(file, artifact);
  console.log(`✓ ${file} signed with ${keyId} (${key.algorithm})`);
  return artifact;
}

const policy = await signAndWrite('core.context-policy.json', 'integrity');
const actorRegistry = await signAndWrite('actor-registry.json', 'integrity');
const policyDigest = canonicalSha256(policy);
const actorRegistryDigest = canonicalSha256(actorRegistry);

const nodes = [];
for (const file of nodeFiles) {
  const node = await readExample(file);
  node.context_policy.policy_ref = policy.policy_id;
  node.context_policy.policy_sha256 = policyDigest;
  await writeExample(file, node);
  nodes.push(node);
}
const nodeById = new Map(nodes.map((node) => [node.id, node]));

const catalog = {
  spec_version: '0.4.0',
  profile_id: 'sia-minimal',
  profile_version: '0.4.0',
  catalog_version: '0.4.0',
  generated_at_ms: 1784116800000,
  nodes,
  integrity: {
    issuer: 'SIA Test Catalog Authority',
    key_id: 'vehicle-hsm:catalog:1',
    algorithm: keys['vehicle-hsm:catalog:1'].algorithm,
    signature: 'pending',
  },
};
catalog.integrity.signature = signArtifact(catalog, 'integrity', keys[catalog.integrity.key_id]);
if (!verifyArtifact(catalog, 'integrity', keys[catalog.integrity.key_id])) throw new Error('catalog.json: self-verification failed');
await writeExample('catalog.json', catalog);
console.log(`✓ catalog.json signed with ${catalog.integrity.key_id} (${catalog.integrity.algorithm})`);
const catalogDigest = canonicalSha256(catalog);

const credential = actorRegistry.credentials.find((item) => item.actor_id === 'ADAS_v2.3.1');
if (!credential) throw new Error('actor-registry.json: ADAS_v2.3.1 credential is missing');

const instance = await readExample('collision-warning.instance.json');
const declaration = nodeById.get(instance.node_id);
instance.catalog_version = catalog.catalog_version;
instance.catalog_sha256 = catalogDigest;
instance.node_schema_sha256 = canonicalSha256(declaration);
instance.attestation.actor_registry_version = actorRegistry.registry_version;
instance.attestation.actor_registry_sha256 = actorRegistryDigest;
instance.attestation.actor_credential_id = credential.credential_id;
instance.attestation.actor_credential_sha256 = canonicalSha256(credential);
await writeExample('collision-warning.instance.json', instance);
await signAndWrite('collision-warning.instance.json', 'attestation');

const context = await readExample('context-attentive.json');
context.policy_ref = policy.policy_id;
context.policy_version = policy.policy_version;
context.policy_sha256 = policyDigest;
await writeExample('context-attentive.json', context);
await signAndWrite('context-attentive.json', 'integrity');

const plan = await readExample('collision.render-plan.json');
plan.spec_version = catalog.spec_version;
plan.profile_version = catalog.profile_version;
plan.catalog_version = catalog.catalog_version;
plan.catalog_sha256 = catalogDigest;
plan.node_schema_sha256 = canonicalSha256(declaration);
plan.policy_ref = policy.policy_id;
plan.policy_version = policy.policy_version;
plan.policy_sha256 = policyDigest;
await writeExample('collision.render-plan.json', plan);

const retention = await readExample('now-playing.retention-record.json');
retention.spec_version = catalog.spec_version;
retention.profile_version = catalog.profile_version;
retention.catalog_version = catalog.catalog_version;
retention.catalog_sha256 = catalogDigest;
retention.node_schema_sha256 = canonicalSha256(nodeById.get('Interaction.Event.Notification.Media.NowPlaying'));
retention.policy_ref = policy.policy_id;
retention.policy_version = policy.policy_version;
retention.policy_sha256 = policyDigest;
await writeExample('now-playing.retention-record.json', retention);

const audit = await readExample('collision.audit-record.json');
audit.node_schema_sha256 = canonicalSha256(declaration);
audit.catalog_sha256 = catalogDigest;
audit.policy_ref = policy.policy_id;
audit.policy_version = policy.policy_version;
audit.policy_sha256 = policyDigest;
const hashInput = structuredClone(audit);
delete hashInput.record_sha256;
audit.record_sha256 = canonicalSha256(hashInput);
await writeExample('collision.audit-record.json', audit);

await signAndWrite('collision.dispatch-attempt.json', 'integrity');
for (const file of ['cluster.renderer.json', 'ivi.renderer.json', 'voice.renderer.json']) {
  await signAndWrite(file, 'attestation');
}
await signAndWrite('collision.delivery-receipt.json', 'attestation');
await signAndWrite('collision.occupant-response.json', 'evidence');

console.log(`✓ derived bindings refreshed (catalog ${catalogDigest}, policy ${policyDigest})`);
