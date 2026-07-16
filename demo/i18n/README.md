# Documentation translations

The interactive documentation ([`../docs.html`](../docs.html)) is translation-ready. English is the source language and lives directly in `docs.html` and `docs.js`; every other language is **one JSON file in this directory**, named `docs.<locale>.json` (e.g. `docs.cs.json`, `docs.de.json`).

A translation file has two parts, both optional:

```json
{
  "lang": "cs",
  "selectors": {
    "#overview .hero-content h1": "Translated page title…"
  },
  "data": {
    "lifecycle": { "0": { "title": "…", "summary": "…", "story": "…", "why": "…" } },
    "trustChecks": { "0": { "title": "…", "description": "…" } }
  }
}
```

- **`selectors`** overrides static page text. Each key is a CSS selector resolved with `querySelector`; the value replaces that element's text content. Selectors keep translations out of the markup entirely.
- **`data`** deep-merges over the dynamic teaching content in `docs.js` (`lifecycle`, `trustChecks`, `contextCases`, `feedbackCases`, `contracts`). Arrays are addressed by index (`"0"`, `"1"`, …); provide whole strings, never fragments. Field names, JSON examples, and reason codes are part of the wire contract and stay in English.
- **Fallback is per key.** Anything a translation omits keeps its English text, so partial translations ship safely and never break the page.

## Activating a language

`docs.html?lang=cs` selects a locale and remembers it in `localStorage` (`sia-docs-lang`). A visible language switcher should be added to the header once the first translation is complete.

## Status

| Locale | File | Coverage |
|---|---|---|
| `en` | built-in | source language |
| `cs` | [`docs.cs.json`](./docs.cs.json) | sample: hero, problem block, lifecycle phase 01 |

Remaining known gap: `aria-label` attributes are not yet covered by the `selectors` mechanism; add an `attributes` section (selector → attribute → text) when the first full translation lands.
