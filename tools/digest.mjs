#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { canonicalSha256 } from './canonical.mjs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node tools/digest.mjs <file.json> [more.json ...]');
  console.error('Prints the SHA-256 of the RFC 8785 canonical form of each JSON document.');
  process.exit(2);
}

for (const file of files) {
  const value = JSON.parse(await readFile(file, 'utf8'));
  console.log(`${canonicalSha256(value)}  ${file}`);
}
