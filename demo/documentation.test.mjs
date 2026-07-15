import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const documents = [
  'README.md',
  '01_Semantic-Interaction-Architecture-sdv.md',
  '02_Appendix-a-worked-example.md',
  '03_Core-Specification.md',
  '04_Threat-Model.md',
  '05_Node-Authoring-Guide.md',
  'GLOSSARY.md',
  'SECURITY.md',
  'VERSIONING.md',
  'conformance/README.md',
  'conformance/crypto/README.md',
  'demo/README.md',
];
const textByFile = Object.fromEntries(await Promise.all(documents.map(async (file) => [file, await readFile(path.join(root, file), 'utf8')])));

test('published documentation identifies the 0.4 contract consistently', () => {
  for (const file of documents.slice(0, 5)) {
    assert.match(textByFile[file], /0\.4\.0/, `${file} does not identify version 0.4.0`);
  }
  for (const [file, contents] of Object.entries(textByFile)) {
    assert.doesNotMatch(contents, /Minimal SIA Profile v1|Version:\s*0\.3\.1|\(v0\.3\.1\)/, `${file} still presents the retired contract as current`);
  }
});

test('all relative Markdown links and image targets in published docs exist', async () => {
  const missing = [];
  for (const [file, contents] of Object.entries(textByFile)) {
    const sourceDir = path.dirname(path.join(root, file));
    for (const match of contents.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) {
      let target = match[1].trim();
      if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
      target = target.split(/\s+["']/)[0].split('#')[0];
      if (!target || /^(?:https?:|mailto:|data:)/.test(target)) continue;
      const resolved = path.resolve(sourceDir, decodeURIComponent(target));
      try {
        await access(resolved);
      } catch {
        missing.push(`${file} -> ${target}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('normative documentation names both feedback loops and bounded retention', () => {
  const core = textByFile['03_Core-Specification.md'];
  assert.match(core, /Renderer delivery and occupant response are separate feedback loops\./);
  assert.match(core, /Retention storage MUST be bounded/);
  assert.match(core, /not_applicable/);
  assert.match(core, /coalesce/);
});
