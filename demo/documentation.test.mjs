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

test('draft 0.4 documents orthogonal context and the causally bound lifecycle', () => {
  const core = textByFile['03_Core-Specification.md'];
  for (const axis of ['motion_state', 'operating_mode', 'energy_state', 'road_type', 'driver_state', 'occupancy']) assert.match(core, new RegExp(`\\b${axis}\\b`));
  assert.match(core, /Collision\.Warning` is `always`/);
  assert.match(core, /Lane\.Departure\.Warning` is `moving_only`/);
  assert.match(core, /dispatch-attempt/);
  assert.match(core, /presented` receipt IDs/);
  assert.doesNotMatch(core, /`vehicle_state`/);
});

test('walkthrough keeps six core scenarios and points advanced cases to the Test Lab', async () => {
  const html = await readFile(path.join(root, 'demo/index.html'), 'utf8');
  assert.equal([...html.matchAll(/data-scenario=/g)].length, 6);
  assert.match(html, /exposes all eight trust checks/);
  assert.match(html, /href="#lab">Test Lab below<\/a>/);
  assert.match(html, /<section class="lab" id="lab"/);
});

test('interactive documentation exposes the complete 0.4 learning path', async () => {
  const [html, script, css, demoHtml, demoCss] = await Promise.all([
    readFile(path.join(root, 'demo/docs.html'), 'utf8'),
    readFile(path.join(root, 'demo/docs.js'), 'utf8'),
    readFile(path.join(root, 'demo/docs.css'), 'utf8'),
    readFile(path.join(root, 'demo/index.html'), 'utf8'),
    readFile(path.join(root, 'demo/styles.css'), 'utf8'),
  ]);

  for (const section of ['overview', 'lifecycle', 'trust', 'time-context', 'feedback', 'contracts', 'operations', 'implementation', 'source-map']) {
    assert.match(html, new RegExp(`id="${section}"`), `interactive docs are missing #${section}`);
  }
  assert.match(html, /use\.typekit\.net\/cyy0vwc\.css/);
  assert.match(css, /font-family:\s*"akagi-pro"/);
  assert.doesNotMatch(css, /letter-spacing:\s*-/);
  const fixedFontSizes = [...css.matchAll(/(?:font-size:\s*|font:\s*(?:700\s+)?)(\d+(?:\.\d+)?)px/g)]
    .map((match) => Number(match[1]));
  assert.equal(
    fixedFontSizes.filter((size) => size < 11).length,
    0,
    'interactive docs must not render explicit text below the 11px annotation floor',
  );
  assert.match(html, /lucide@0\.468\.0/);
  assert.match(html, /data-reading-mode="essential"/);
  assert.match(html, /data-reading-mode="technical"/);
  assert.match(html, /id="docs-search"/);
  assert.match(html, /data-copy-target="contract-code"/);
  assert.match(html, /Renderer receipt means/);
  assert.match(html, /Occupant response means/);
  assert.match(html, /thirteen top-level machine-readable contracts/);
  assert.equal([...html.matchAll(/data-contract="/g)].length, 13);
  assert.equal([...html.matchAll(/aria-controls="contract-panel"/g)].length, 13);
  for (const schema of [
    'catalog',
    'actor-registry',
    'context-policy',
    'interaction-node',
    'runtime-instance',
    'context-snapshot',
    'renderer-capability',
    'retention-record',
    'render-plan',
    'dispatch-attempt',
    'delivery-receipt',
    'occupant-response',
    'audit-record',
  ]) assert.match(script, new RegExp(`schema: '${schema}\\.schema\\.json'`));
  assert.match(script, /const trustChecks = \[/);
  assert.equal([...script.matchAll(/failure: 'TRUST_REJECTED_/g)].length, 8);
  assert.doesNotMatch(script, /role="listitem"/);
  assert.doesNotMatch(script, /must confirm it within 2 seconds/);
  assert.match(html, /does not claim distributed exactly-once delivery/);
  assert.match(html, /Fail closed and fail operational/);
  assert.match(script, /applicability: \"always\"/);
  assert.match(script, /applicability: \"moving_only\"/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /--content-max:\s*1320px/);
  assert.match(css, /max-width:\s*var\(--content-max\)/);
  assert.match(demoCss, /--content-max:\s*1440px/);
  assert.match(demoCss, /\.explainer > \*, \.matrix-section > \*, \.lab > \*/);
  assert.match(demoHtml, /href="\.\/docs\.html"/);
});
