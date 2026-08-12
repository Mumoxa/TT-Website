# CV Builda data flow

1. The browser validates an upload (DOCX or text-based PDF) and extracts it locally.
2. Extracted fragments enter React memory and the source ledger. Unreviewed fragments and notes block export.
3. Staff classify, edit, add, exclude, or retain content. Original wording remains associated with edits.
4. A shared approved view model supplies the browser preview and both DOCX templates so their approved text is identical.
5. DOCX generation and download happen in the browser. Reset, refresh, and close are intended to discard working state.
6. Only after an explicit staff action, selected fragments go to `/api/cv-suggestions`. The Cloudflare Function validates the bounded schema, derives a pseudonymous client key, and authenticates to the Oracle API.
7. The API validates again, rate-limits, constructs a constrained prompt, and calls local Ollama. A structured result returns through Oracle and Cloudflare. It is never applied automatically.

There is no candidate database or draft store. Runtime browser/network/log inspection is still required before release; source review alone does not prove infrastructure logging behaviour.
