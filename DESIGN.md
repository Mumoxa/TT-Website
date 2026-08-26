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
