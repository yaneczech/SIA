import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
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
  'SOURCE_OF_TRUTH.md',
  'conformance/README.md',
  'conformance/crypto/README.md',
  'bench/README.md',
  'demo/README.md',
  'figures/REDRAW_REFERENCE.md',
  'notes/reference-architecture.md',
];
const textByFile = Object.fromEntries(await Promise.all(documents.map(async (file) => [file, await readFile(path.join(root, file), 'utf8')])));

test('published documentation and artifacts expose one exact SIA release version', async () => {
  const releaseVersion = '0.4.0';
  for (const [file, contents] of Object.entries(textByFile)) {
    assert.match(contents, new RegExp(releaseVersion.replaceAll('.', '\\.')), `${file} does not identify version ${releaseVersion}`);
    assert.doesNotMatch(contents, /(?<![.\d])0\.4(?![.\/\d])/, `${file} abbreviates the public release version`);
    assert.doesNotMatch(contents, /0\.4\.(?!0\b|x\b)/, `${file} abbreviates the public release version before punctuation`);
    assert.doesNotMatch(contents, /0\.4\.(?!0\b)\d+/, `${file} advertises a competing 0.4.x version`);
    assert.doesNotMatch(contents, /Minimal SIA Profile v1|Version:\s*0\.3\.1|\(v0\.3\.1\)/, `${file} still presents the retired contract as current`);
  }

  const exampleRoot = path.join(root, 'examples');
  assert.deepEqual((await readdir(exampleRoot)).sort(), [`v${releaseVersion}`]);
  const catalog = JSON.parse(await readFile(path.join(exampleRoot, `v${releaseVersion}`, 'catalog.json'), 'utf8'));
  assert.equal(catalog.spec_version, releaseVersion);
  assert.equal(catalog.profile_version, releaseVersion);
  assert.equal(catalog.catalog_version, releaseVersion);

  for (const schemaFile of await readdir(path.join(root, 'schema'))) {
    if (!schemaFile.endsWith('.json')) continue;
    const schema = await readFile(path.join(root, 'schema', schemaFile), 'utf8');
    const parsed = JSON.parse(schema);
    assert.match(parsed.$id, /\/schema\/v0\.4\.0\//, `${schemaFile} does not use the exact release namespace`);
    assert.doesNotMatch(schema, /\/schema\/v0\.4\//, `${schemaFile} retains the abbreviated release namespace`);
    for (const match of schema.matchAll(/"spec_version"\s*:\s*\{\s*"const"\s*:\s*"([^"]+)"/g)) {
      assert.equal(match[1], releaseVersion, `${schemaFile} exposes a different wire version`);
    }
  }

  for (const schemaFile of await readdir(path.join(root, 'schema', 'payloads'))) {
    if (!schemaFile.endsWith('.json')) continue;
    const schema = await readFile(path.join(root, 'schema', 'payloads', schemaFile), 'utf8');
    assert.match(JSON.parse(schema).$id, /\/schema\/v0\.4\.0\/payloads\//, `${schemaFile} does not use the exact release namespace`);
    assert.doesNotMatch(schema, /\/schema\/v0\.4\//, `${schemaFile} retains the abbreviated release namespace`);
  }

  const ci = await readFile(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /examples\/v0\.4\.0\/\*\.json/);
  assert.doesNotMatch(ci, /examples\/v0\.4\/\*\.json/);
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

test('reference architecture keeps implementation advice inside the evidence boundary', () => {
  const reference = textByFile['notes/reference-architecture.md'];
  assert.match(reference, /audit chain is evidence, not a recovery journal/);
  assert.match(reference, /Session establishment and HMAC provisioning are deployment-defined/);
  assert.match(reference, /cannot rank whole-vehicle bottlenecks/);
  assert.match(reference, /receipt is protocol evidence.*not independent/);
  assert.doesNotMatch(reference, /ranked by real size|The hash-linked audit log is the persistence|Public-key verification belongs in software|ASIL-friendly|few kLOC/);
});

test('draft 0.4.0 documents orthogonal context and the causally bound lifecycle', () => {
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

test('interactive documentation exposes the complete 0.4.0 learning path', async () => {
  const [html, script, css, demoHtml, demoCss] = await Promise.all([
    readFile(path.join(root, 'demo/docs.html'), 'utf8'),
    readFile(path.join(root, 'demo/docs.js'), 'utf8'),
    readFile(path.join(root, 'demo/docs.css'), 'utf8'),
    readFile(path.join(root, 'demo/index.html'), 'utf8'),
    readFile(path.join(root, 'demo/styles.css'), 'utf8'),
  ]);

  for (const section of ['overview', 'lifecycle', 'architecture', 'trust', 'time-context', 'feedback', 'contracts', 'operations', 'implementation', 'faq', 'source-map']) {
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
  assert.match(html, /src="\.\/docs\.js"/);
  assert.doesNotMatch(html, /[?&]v=/, 'asset cache keys must not masquerade as SIA versions');
  assert.doesNotMatch(demoHtml, /[?&]v=/, 'asset cache keys must not masquerade as SIA versions');
  assert.match(html, /data-reading-mode="essential"/);
  assert.match(html, /data-reading-mode="technical"/);
  assert.match(html, /id="docs-search"/);
  assert.match(html, /Source-of-truth map/);
  assert.match(html, /npm run benchmark:quick/);
  assert.match(html, /Measure now; claim only on target hardware\./);
  assert.match(html, /forbids production claims/);
  assert.match(html, /One release, exact artifact bindings/);
  assert.doesNotMatch(html, /fig4-node-taxonomy|early 0\.3 vocabulary|versions are negotiated separately|evolve separately/);
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
  assert.equal([...html.matchAll(/class="faq-item"/g)].length, 15);
  assert.match(html, /Action, State, and Task are reserved for future profiles/);
  assert.match(html, /session-establishment contract is future work/);
  assert.match(html, /not a production reference runtime/);
  assert.doesNotMatch(html, /weeks, not years|~30 lines|Every decision is deterministic and O\(1\)|ships a reference implementation/);
  assert.match(script, /faqOpenStateBeforeSearch/);
  assert.match(script, /matchingFaqItems\.includes\(item\)/);
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
  assert.match(demoHtml, /PROTOCOL TIMING · INDEPENDENT WINDOWS/);
  assert.match(demoHtml, /VISUAL ATTENTION COST/);
  assert.doesNotMatch(demoHtml, /<small>ATTENTION BUDGET<\/small>/);
});
