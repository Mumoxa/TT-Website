# Talent Tree — Frontend Design System

The system lives in the token block at the top of `src/styles.css`. Change a
token there and the whole site (including the CV-Builda tool, which reads the
same tokens) follows. Nothing below is a second source of truth — it is a map
of decisions already encoded in the CSS.

## Principles

1. **One ink, one paper, one accent.** Monochrome discipline with a single
   deep-petrol accent. The accent is a signal, not decoration.
2. **Type carries the design.** Fraunces (editorial serif) speaks; Inter
   (grotesque) works. No imagery competes with the headline.
3. **Dark bands anchor the story.** Hero → numbers → approach → contact form
   one continuous deep-ink thread through a warm-paper page.
4. **Every motion is felt, not noticed.** One easing curve, short durations,
   everything disabled under `prefers-reduced-motion`.

## Color

| Token | Value | Role |
| --- | --- | --- |
| `--ink` | `#12303d` | primary text on light surfaces |
| `--ink-deep` | `#0a222d` | dark bands; primary button fill on light |
| `--ink-abyss` | `#071923` | footer — the deepest surface |
| `--paper` | `#f4f1ea` | warm paper band |
| `--paper-soft` | `#fbf9f4` | elevated paper band |
| `--white` | `#ffffff` | cards, primary button on dark |
| `--accent` | `#136579` | the one accent (links, chips, hover, rules) |
| `--accent-bright` | `#8fd0e2` | accent for dark surfaces (9.6:1 on ink) |
| `--accent-soft` | `#ddebee` | quiet accent wash (CV-Builda consumes it) |
| `--muted` | `#566b76` | secondary text on light (≈5:1 on paper) |
| `--muted-on-dark` | `#a7bfca` | secondary text on ink (≈8.6:1) |
| `--line` | `rgba(18,48,61,.16)` | hairline on light |
| `--line-strong` | `rgba(18,48,61,.42)` | list rules that must lead |
| `--line-invert` | `rgba(255,255,255,.14)` | hairline on dark |

All body-text pairs meet WCAG AA (≥4.5:1); large display pairs meet AAA.

## Typography

- Display: Fraunces 500, tight tracking (`-0.035em`), balanced wrapping.
  `--fs-900` hero `clamp(3.3rem → 6.4rem)`; `--fs-800` section h2
  `clamp(2.25rem → 3.8rem)`.
- Subheads: Fraunces 500 — `--fs-700` (cards), `--fs-600` (list items).
- Body: Inter 400, 1rem / 1.65, measure capped 56–64ch.
- Labels/eyebrows: Inter 600–700, `--fs-100` (0.72rem), `0.16em` tracking,
  uppercase, with a hairline rule.
- Numerals are `tabular-nums` everywhere they align (stats, ledger, steps).

## Spacing & layout

- 4-point discipline; section rhythm `--section-y: clamp(88px → 148px)`.
- Container: `--shell: 1200px`, gutters `--gutter: clamp(20px → 48px)`.
- Header rail is wider (1280px) so the brand aligns with, but does not crowd,
  the content grid.
- Radius: `--radius: 2px` (chips, buttons, cards) — deliberately sharp;
  only the toggle control is a full circle.
- Elevation: `--shadow-soft` (resting cards), `--shadow-lift` (hover),
  `--shadow-header` (scrolled glass bar). No other shadows exist.

## Header & navigation

- **Fixed and transparent over the hero** — the navigation is part of the
  hero, not a bar above it. There is no white strip anywhere on the site.
- Past 16px of scroll it becomes a single dark-glass bar (blur + saturate,
  hairline, soft shadow) that reads correctly over both light and dark
  sections. Height 84px → 64px, mark 42px → 34px.
- Brand lockup: original mark + “Talent Tree” (Fraunces) + micro descriptor,
  separated by a hairline — aligned to the header grid, never floating.
- Links: underline draws on hover; the active section carries
  `aria-current` and a persistent accent underline (scrollspy).
- ≤1000px: full-height drawer under the header rail, serif links, solid
  CTA, scroll locked, Escape closes, focus returns to the toggle.

## Buttons

| Tier | Rest | Hover | Active/Focus |
| --- | --- | --- | --- |
| Primary (light bg) | ink fill, white text | accent fill | accent-deep / accent ring |
| Primary (dark bg) | white fill, ink text | accent-bright fill | accent fill |
| Quiet | 1px outline, transparent | surface-inverted fill | accent ring |
| Small (`button-sm`) | 44px min-height | — | — |

Min-height 50px (44px small, 54px drawer CTA), 2px radius, arrow glyph
slides 4px on hover. All states have visible `:focus-visible` rings that
switch color per surface.

## Sections

Ghost numerals (01–08) anchor each section top-right at 5% opacity.
Kicker column + headline column (`0.42fr / 1.28fr`) collapses to a stacked
kicker at 900px. Light bands alternate `paper-soft / paper`; dark bands
(hero, numbers, approach, contact, footer) share grain + a single radial
glow.

The clients section is two tiers on one card language: three flagship cards
in a 3-up grid, then the wider mandate book in a 2-up grid. `.flagship` and
`.mandate` share the frame, serif ledger number, outlined relationship tag,
hover accent rule and bottom-pinned note (grouped selectors — the density
changes, the vocabulary does not). Mandate cards add a `--muted` uppercase
meta line (heritage, scale) and `--accent-soft` skill chips; no other colour
is introduced. Client identities stay anonymised by descriptor.

## Client downloads (`/downloads`)

`src/downloads/downloads.css` is a scoped `td-` extension of the same tokens.
The page is a download-first client folder styled as a file browser: a dark
cover with a folder path line, then a light band holding an open "folder
window" (window chrome, location bar, file rows) listing the Terms of Business
in two real formats, a short scope band, and a dark contact band. The page is
deliberately download-forward — the full clause text lives in the documents,
not as an on-page accordion. The documents are static files in
`public/downloads/` so clients can link them directly (`...Terms-of-
Business.pdf` / `.docx`) without opening the SPA. Clause copy lives in
`src/downloads/terms.json`, the single source of truth for both generated
formats: the PDF via `scripts/build-terms-pdf.py` and the editable Word copy
via `scripts/build-terms-docx.mjs`.

## Company profile (`/profile`)

`src/profile/profile.css` is a scoped extension of this system, not a second
one: every colour, face, radius and duration resolves to the tokens above
(`tp-` prefix so nothing collides with the marketing site). It reuses the
site classes for the brand lockup, eyebrow, section kicker, ghost numerals
and skip link.

- Chapters alternate `paper-soft / paper` with dark `ink-deep` bands for the
  cover, the mandate method, the fee section and contact — the same
  light-dark thread the home page uses.
- The fee calculator is a white card inside a dark band: bars use `--accent`
  (Talent Tree) against a 28% ink wash (market benchmark), and the saving
  panel is the one `--accent-soft` moment on the page.
- Interaction: sticky chapter rail with scrollspy + a 2px `--accent-bright`
  reading-progress bar, accordions (`aria-expanded`/`aria-controls`), a
  roving-tabindex stepper (`role="tablist"`), filter chips (`aria-pressed`),
  clipboard buttons with `role="status"` feedback.
- `@media print` flattens the dark bands to paper, opens every collapsed
  panel and hides the controls, so the page doubles as the PDF profile.

## Motion

- One curve: `--ease: cubic-bezier(.22, 1, .36, 1)`; durations 180/320/640ms.
- Scroll reveals: 16px rise + fade, staggered per list item.
- Panels/accordion: 300ms fade-and-settle when opened.
- Marquee: 46s linear, edge-masked, aria-hidden.
- `prefers-reduced-motion: reduce` disables all of the above.

## Breakpoints

`1100` (4-col → 2-col steps/cards/stats) · `1000` (nav drawer, hero row
stacks) · `900` (heading rows & split sections stack, FAQ sticky off) ·
`640` (grids to single column) · `560` (type floor, full-width actions).

## Accessibility contract

Skip link, semantic landmarks, `aria-expanded`/`aria-controls` on every
disclosure, keyboard-operable accordion and drawer, focus-visible rings on
every interactive element, AA contrast throughout, honest form status
messaging (`role="status"/"alert"`).
