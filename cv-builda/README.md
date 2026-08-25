# cv-builda — staging folder

The CV-Builda source, staged here so it survives outside a working session.
Nothing in the site imports it yet: `src/main.jsx` is unchanged, so the folder
is inert until the routing step in `INSTALL.md` is done.

**This is a partial drop.** Only the files below have been committed, because
only these were supplied:

```
cv-builda/
  CvBuilda.jsx              the page
  cv/validate.js            the house-rule checker
  cv/redact.js              the blind-profile transform
  anonymous-example.json    worked example, blind
  INSTALL.md                integration notes
```

Still missing, and needed before the folder can be wired up:

- `cv/compose.js` — builds the `.docx`
- `cv-builda.css` — the page styles
- `test-page.js`, `test-bundle.js` — the test pair described in `INSTALL.md`
- the sample `.docx` files, which need rebuilding anyway (see below)

## Open item: the referees section

Formal recruitment profiles carry no referees section, so the field has been
removed from the record, the empty state and the worked example, and the
validator now flags any data file that still carries it. `cv/compose.js` is the
last place it lives — it still emits a `Referees / Available on request.` block
at the end of the document, and that block has to go for the rule to hold in
what a client actually reads. The sample profiles were built before this change
and end with that block.
