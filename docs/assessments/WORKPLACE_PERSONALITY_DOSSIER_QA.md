# Synthetic dossier QA — 25 November 2026

**Scope:** engineering checks, not scientific validation or an independent professional audit. The automated marker calculations in the QA script are separate from the report model; the visual and source review was performed by the implementer, not a second reviewer. No real candidate data was used. Approval for live use remains outstanding.

## Evidence

- `npm test`: 421 passed, 0 failed.
- `npm run build`: passed.
- Local assessment server: `npm run assessments:dev` started using local D1; Wrangler reported a failed external Request.cf fetch and used its placeholder. No production data or deployment.
- `LD_LIBRARY_PATH=/tmp/dist/Release/lib CHROMIUM_PATH=/tmp/chromium npx playwright test tests/browser/personality-report.spec.mjs`: 2 passed. This uses mocked synthetic admin responses in the real recruiter UI and confirms four printed pages and invalid-payload refusal; it does not test real authenticated retrieval end to end.
- Full `npm run test:browser` exceeded the 180-second command limit but its child continued to completion: **26 passed, 7 failed**. The first failure is an existing browser fixture request missing the required admin write header (403); six failures are catalogue/design locator/timeouts. The run does not establish whether the latter failures predate this change. Treat the full browser suite as failing, not a release pass. Test-generated changes to existing screenshots were reverted.
- Synthetic PDF generator, Chromium 158, Playwright and pdfjs-dist: all 10 valid cases generated four A4 portrait pages; page dimensions, selectable text, page numbers, text page bounds, content-container overflow and both sets of five marker positions were checked. Invalid out-of-range payload was refused. Exact synthetic privacy sentinels did not appear in extracted PDF text. The script checks DOM marker geometry independently against the fixture scores, rather than comparing to the model's position property; it does not independently measure the vector geometry in PDF operator streams.
- Manual visual review: all four mock pages, plus midpoint page 1, lower page 2, upper page 1, mixed pages 1 and 4, incomplete pages 1 and 4, unavailable page 1, long-name page 1, multilingual page 1, and maximum-length name page 1. Other generated previews were automatically checked but not individually visually reviewed. An initial midpoint overflow and a maximum-length name overflow were observed, fixed, regenerated and checked. The 200-character stress name is small but remains visible in the inspected image.
- Source comparison: all 50 existing 10-item IPIP statements and polarity signs were compared item-by-item with the official Big-Five Factor Markers page (https://ipip.ori.org/newBigFive5broadKey.htm); no mismatch observed. Reverse arithmetic and all-low/all-high factor means are covered by unit tests. The official scoring guide uses keyed sums; this implementation reports the established rescaled means, not norms or percentiles. No scoring logic was changed.
- Existing API inspection: the report path is under `requireAdmin`, uses a no-store/private JSON response, and logs metadata-only report-view events. Existing unit tests include rejection of anonymous/candidate access and unreadable encryption. This is not a penetration test.

## QA profile marker cross-check

| Dimension | Stored mean | Expected fraction of 1–5 axis |
|---|---:|---:|
| Extraversion | 3.00 | 0.500 |
| Agreeableness | 2.80 | 0.450 |
| Conscientiousness | 3.00 | 0.500 |
| Emotional Stability | 2.40 | 0.350 |
| Intellect/Imagination | 3.80 | 0.700 |

Synthetic PDFs and corresponding PNG page previews are in `deliverables/personality-report/`: mock, midpoint, lower, upper, mixed (including endpoints), incomplete, unavailable, longname, multilingual and maxname. Each case has a four-page PDF and four page previews. They are test data, not assessments or evidence of performance.

## Remaining checks / risks

- A separate reviewer should inspect all pages, multiple browsers/printers, 390px interaction, keyboard and screen-reader behavior, bidirectional/CJK and other non-Latin/Greek/Cyrillic characters, and atypical records. Browser/OS font coverage is not guaranteed. Tiny footer/methodology text should be reviewed at physical scale.
- PDF text bounds and container scroll dimensions are not exhaustive pixel-level clipping or overlap detection. Name testing is bounded by the existing input limits and uses one stress shape, not every possible glyph combination.
- Exact PDF bytes and layout depend on browser, fonts, print settings and revision. Historical template retrieval and immutable archival are not implemented. Local auth tests and source review are not proof of production controls.
- Psychometric interpretation, fairness, consent/POPIA, legal, authorized access and release decisions must be reviewed and approved independently before any real use. The report explicitly prohibits selection use until requirements are met.
