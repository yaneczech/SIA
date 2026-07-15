#!/usr/bin/env node
/**
 * Re-signs every published example artifact with the conformance test keys.
 * Run after any change to a signed example: node tools/resign-examples.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signArtifact, verifyArtifact } from './crypto.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { keys } = JSON.parse(await readFile(path.join(root, 'conformance/crypto/test-keys.json'), 'utf8'));

const signedExamples = [
  { file: 'collision-warning.instance.json', container: 'attestation' },
  { file: 'context-attentive.json', container: 'integrity' },
  { file: 'cluster.renderer.json', container: 'attestation' },
  { file: 'collision.delivery-receipt.json', container: 'attestation' },
  { file: 'collision.occupant-response.json', container: 'evidence' },
];

for (const { file, container } of signedExamples) {
  const filePath = path.join(root, 'examples/v0.4', file);
  const artifact = JSON.parse(await readFile(filePath, 'utf8'));
  const keyId = artifact[container].key_id;
  const key = keys[keyId];
  if (!key) throw new Error(`${file}: no test key for key_id ${keyId}`);
  artifact[container].algorithm = key.algorithm;
  artifact[container].signature = signArtifact(artifact, container, key);
  if (!verifyArtifact(artifact, container, key)) throw new Error(`${file}: self-verification failed`);
  await writeFile(filePath, JSON.stringify(artifact, null, 2) + '\n');
  console.log(`✓ ${file} signed with ${keyId} (${key.algorithm})`);
}
