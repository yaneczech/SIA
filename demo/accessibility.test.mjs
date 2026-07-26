import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const readDemoFile = (name) => readFile(path.join(here, name), 'utf8');
const [demoHtml, demoScript, demoCss, docsHtml, docsScript, docsCss] = await Promise.all([
  readDemoFile('index.html'),
  readDemoFile('app.js'),
  readDemoFile('styles.css'),
  readDemoFile('docs.html'),
  readDemoFile('docs.js'),
  readDemoFile('docs.css'),
]);

test('interaction lab tabs expose the complete keyboard and ARIA relationship', () => {
  assert.equal([...demoHtml.matchAll(/id="phase-tab-[^"]+"/g)].length, 6);
  assert.equal([...demoHtml.matchAll(/aria-controls="phase-panel"/g)].length, 6);
  assert.equal([...demoHtml.matchAll(/id="phase-tab-[^"]+"[^>]*tabindex="0"/g)].length, 1);
  assert.match(demoHtml, /id="phase-panel" role="tabpanel" aria-labelledby="phase-tab-ontology"/);
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.match(demoScript, new RegExp(`event\.key === '${key}'`));
  assert.match(demoScript, /button\.tabIndex = selected \? 0 : -1/);
  assert.match(demoScript, /phase-panel.*aria-labelledby/);
});

test('decision announcements are stable and do not include the running timer', () => {
  assert.doesNotMatch(demoHtml, /class="decision-panel"[^>]*aria-live/);
  assert.match(demoHtml, /id="decision-announcement" role="status" aria-atomic="true"/);
  assert.match(demoHtml, /id="decision-title" tabindex="-1"/);
  assert.match(demoScript, /function announceDecision\(\)/);
  assert.doesNotMatch(demoScript, /decision-announcement'\)\.textContent = `\$\{\$\('#runtime-time'/);
});

test('mobile documentation navigation cannot retain focus while off canvas', () => {
  assert.match(docsScript, /window\.matchMedia\('\(max-width: 900px\)'\)/);
  assert.match(docsScript, /sidebar\.inert = true/);
  assert.match(docsScript, /sidebar\.inert = false/);
  assert.match(docsScript, /if \(restoreFocus && focusWasInside\) menuButton\.focus\(\)/);
  assert.match(docsScript, /!sidebar\.classList\.contains\('is-open'\)\) openSidebar\(\)/);
});

test('miniweb maintains an 11px annotation floor and explicit focus treatment', () => {
  for (const [name, css] of [['Interaction Lab', demoCss], ['Documentation', docsCss]]) {
    const fixedFontSizes = [...css.matchAll(/(?:font-size:\s*|font:\s*(?:400\s+|700\s+)?)(\d+(?:\.\d+)?)px/g)]
      .map((match) => Number(match[1]));
    assert.equal(fixedFontSizes.filter((size) => size < 11).length, 0, `${name} renders explicit text below 11px`);
    assert.match(css, /:focus-visible\s*\{[^}]*outline:/);
  }
  assert.match(demoCss, /--control-line:\s*#64687d/);
  assert.match(docsCss, /--control-line:\s*#64687d/);
  assert.match(demoCss, /select\s*\{[^}]*border:\s*1px solid var\(--control-line\)/);
  assert.match(demoCss, /\.switch\s*\{[^}]*background:\s*var\(--control-line\)/);
  assert.match(docsCss, /\.search-field\s*\{[^}]*border:\s*1px solid var\(--control-line\)/);
  assert.match(docsCss, /--muted-2:\s*#858899/);
  assert.match(demoCss, /\.stage\.is-muted\s*\{[^}]*background:/);
  assert.doesNotMatch(demoCss, /\.stage\.is-muted\s*\{[^}]*opacity:/);
});

test('decorative documentation counters are excluded from the accessibility tree', () => {
  assert.match(docsHtml, /class="detail-number"[^>]*aria-hidden="true"/);
  assert.equal([...docsHtml.matchAll(/class="clock-number" aria-hidden="true"/g)].length, 3);
});

test('renderer cards stay in the content column at narrow breakpoints', () => {
  assert.match(demoCss, /\.renderer-grid\s*\{[^}]*grid-column:\s*2/);
  assert.match(demoCss, /@media \(max-width:\s*680px\)[\s\S]*?\.renderer-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
});
