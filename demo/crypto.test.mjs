import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signArtifact, verifyArtifact } from '../tools/crypto.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadJson = async (...parts) => JSON.parse(await readFile(path.join(root, ...parts), 'utf8'));

const { keys } = await loadJson('conformance', 'crypto', 'test-keys.json');
const { vectors } = await loadJson('conformance', 'crypto', 'vectors.json');

/** RFC 7386 JSON Merge Patch (same semantics as tools/conformance.mjs). */
function mergePatch(target, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const result = target === null || typeof target !== 'object' || Array.isArray(target) ? {} : { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = mergePatch(result[key], value);
  }
  return result;
}

test('every cryptographic conformance vector produces its required outcome', async () => {
  for (const vector of vectors) {
    const base = await loadJson('examples', 'v0.4.0', vector.base);
    const artifact = vector.patch ? mergePatch(base, vector.patch) : base;
    const keyId = vector.verify_with_key_id || artifact[vector.container].key_id;
    const key = keys[keyId];
    assert.ok(key, `${vector.name}: missing test key ${keyId}`);
    const verified = verifyArtifact(artifact, vector.container, key);
    assert.equal(verified, vector.expect === 'verify', `${vector.name}: expected ${vector.expect}. ${vector.reason}`);
  }
});

test('deterministic algorithms are byte-stable so vectors are reproducible', async () => {
  for (const [file, container] of [
    ['core.context-policy.json', 'integrity'],
    ['actor-registry.json', 'integrity'],
    ['catalog.json', 'integrity'],
    ['collision.dispatch-attempt.json', 'integrity'],
  ]) {
    const artifact = await loadJson('examples', 'v0.4.0', file);
    const key = keys[artifact[container].key_id];
    assert.equal(signArtifact(artifact, container, key), artifact[container].signature, `${file}: deterministic signature changed`);
    assert.ok(verifyArtifact(artifact, container, key), `${file}: signature does not verify`);
  }

  const snapshot = await loadJson('examples', 'v0.4.0', 'context-attentive.json');
  const contextKey = keys['vehicle-hsm:context:3'];
  assert.equal(signArtifact(snapshot, 'integrity', contextKey), snapshot.integrity.signature, 'EdDSA re-signing must reproduce the published signature');

  const receipt = await loadJson('examples', 'v0.4.0', 'collision.delivery-receipt.json');
  const receiptKey = keys['vehicle-hsm:cluster:4'];
  assert.equal(signArtifact(receipt, 'attestation', receiptKey), receipt.attestation.signature, 'HMAC re-signing must reproduce the published signature');
});

test('ES256 signatures are randomized but always verify under the published public key', async () => {
  const instance = await loadJson('examples', 'v0.4.0', 'collision-warning.instance.json');
  const key = keys['vehicle-hsm:adas:7'];
  const resigned = structuredClone(instance);
  resigned.attestation.signature = signArtifact(resigned, 'attestation', key);
  assert.ok(verifyArtifact(resigned, 'attestation', key));
  assert.ok(verifyArtifact(instance, 'attestation', key));
});
