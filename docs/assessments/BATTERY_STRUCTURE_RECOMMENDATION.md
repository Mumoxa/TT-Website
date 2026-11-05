# Battery structure: recommendation after candidate feedback

Status: recommendation only. Nothing in this document changes a live assessment. Content changes need Talent Tree approval and a new published version through the admin publish step.

## What candidates reported

- Questions 2.4, 3.1 and 3.2 have no instructions. They refer to a reconciliation that has to be done.
- The workbook sits at the bottom of the page. It is not clear which question it belongs to, or which tab and cell to use.
- Cell text was cut off, so the working values could not be read in full.
- There were no links from a question to its cell.

## What the interface now does (branch changes, not yet merged)

- Each item can carry optional `instructions` (text, at most 600 characters). They appear under the prompt. Items without instructions show nothing extra.
- A cell activity has a "Go to cell …" button. It switches to the right tab, selects the cell and focuses it.
- A "Go to the workbook" button sits above the sections.
- Cell text wraps and the row grows to fit, so the whole value is visible. Read-only source cells stay disabled.

These fix the interface. They do not make the assessment content coherent.

## Recommended content structure

1. **One scenario per workbook.** Choose one realistic set of transactions (for example, one supplier account with 3 invoices and 2 payments). Every question and every workbook cell refers to that same set. Candidates then track one story from start to finish.
2. **Pair questions with their workbook.** If a second scenario is needed, put it in its own block: question, workbook, question, workbook. Do not place all workbooks at the bottom.
3. **Give every item instructions.** Each prompt says what to do, where to do it (tab and cell), and what result is expected in words. Example: "Use the Ledger tab. Total the amounts for supplier S-2 in cell B12."
4. **Keep the source data readable.** Source tabs use short, complete text per cell. Avoid long descriptions in one cell.
5. **Keep the workbook as the only place for calculations.** Questions refer to cells, not to values the candidate has to copy.

## Open items that need Talent Tree

- Instructions for 2.4, 3.1 and 3.2. These must be written by Talent Tree. They are not invented here.
- A decision on the single-scenario design above, before the content is rewritten.
- Approval of the rewritten battery, then publishing a new version. The live version stays as it is until then.
