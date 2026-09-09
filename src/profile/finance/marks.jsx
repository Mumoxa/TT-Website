/* Talent Tree — Accounting & Finance search page: client marks.
   -----------------------------------------------------------------------
   These are Talent Tree-drawn geometric marks, NOT the clients' registered
   logos. We do not hold reproduction rights to third-party trademarks, so
   each client is represented by an original monogram built from the same
   2px-radius, single-accent vocabulary as the rest of the site (DESIGN.md).
   Every mark is 48x48, stroke-based, and inherits `currentColor` so it
   sits correctly on both paper and ink bands.

   The accompanying name is always rendered next to the mark for clarity —
   the mark carries the visual weight, the name carries the fact. */

const base = {
  viewBox: '0 0 48 48',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
};

/* Retail group — stacked shelves rising into a peak (multi-brand scale). */
export const MarkPepkor = (props) => (
  <svg {...base} {...props}>
    <path d="M8 34h32M8 26h24M8 18h16" />
    <path d="M8 40h32" strokeOpacity=".35" />
    <path d="M32 22l8-8" />
    <circle cx="40" cy="14" r="3" />
  </svg>
);

/* Grocery group across Africa — a continent-facing arc over a basket line. */
export const MarkShoprite = (props) => (
  <svg {...base} {...props}>
    <path d="M9 20a15 15 0 0 1 30 0" />
    <path d="M12 24h24l-3 14H15z" />
    <path d="M20 24v-6M28 24v-6" strokeOpacity=".5" />
  </svg>
);

/* Retail group — two interlocking arcs (pick / pay). */
export const MarkPicknPay = (props) => (
  <svg {...base} {...props}>
    <path d="M20 12a10 10 0 1 0 0 20" />
    <path d="M28 36a10 10 0 1 0 0-20" />
    <path d="M24 22v4" strokeOpacity=".5" />
  </svg>
);

/* Print & media group — folded sheets on a press axis. */
export const MarkNovus = (props) => (
  <svg {...base} {...props}>
    <path d="M10 34V14l14 20 14-20v20" />
    <path d="M10 40h28" strokeOpacity=".4" />
  </svg>
);

/* Mobility & logistics — a chevron fleet in motion. */
export const MarkSuperGroup = (props) => (
  <svg {...base} {...props}>
    <path d="M8 30l8-10 8 10" />
    <path d="M20 34l8-10 8 10" strokeOpacity=".55" />
    <path d="M14 38h26" strokeOpacity=".35" />
  </svg>
);

/* International aviation — a wing arc crossing a meridian. */
export const MarkLufthansa = (props) => (
  <svg {...base} {...props}>
    <circle cx="24" cy="24" r="14" />
    <path d="M10 24h28" />
    <path d="M24 10c5 4 5 24 0 28-5-4-5-24 0-28z" />
  </svg>
);

/* Banking group — a vault column with a ledger rule. */
export const MarkFnb = (props) => (
  <svg {...base} {...props}>
    <path d="M8 20l16-9 16 9" />
    <path d="M13 20v14M24 20v14M35 20v14" />
    <path d="M8 38h32" />
  </svg>
);

/* Fintech / unattended retail — a terminal with a contactless wave. */
export const MarkNayax = (props) => (
  <svg {...base} {...props}>
    <rect x="10" y="12" width="18" height="24" rx="2" />
    <path d="M14 18h10M14 24h10" strokeOpacity=".5" />
    <path d="M33 19a8 8 0 0 1 0 10" />
    <path d="M37 15a14 14 0 0 1 0 18" strokeOpacity=".55" />
  </svg>
);

/* Packaging & manufacturing — a formed cylinder under a crown line. */
export const MarkCrown = (props) => (
  <svg {...base} {...props}>
    <path d="M10 18l4-8 5 6 5-8 5 8 5-6 4 8z" />
    <path d="M12 24h24v12a12 4 0 0 1-24 0z" />
  </svg>
);

/* Nonprofit sector — a governance circle around a shared centre. */
export const MarkNonprofit = (props) => (
  <svg {...base} {...props}>
    <circle cx="24" cy="24" r="14" strokeDasharray="4 4" />
    <path d="M24 30c-4-3-7-5-7-9a4 4 0 0 1 7-2.5A4 4 0 0 1 31 21c0 4-3 6-7 9z" />
  </svg>
);

/* Professional designation marks — used on the pathway tiles. */
export const MarkCa = (props) => (
  <svg {...base} {...props}>
    <path d="M34 16a12 12 0 1 0 0 16" />
    <path d="M24 40h16" strokeOpacity=".4" />
  </svg>
);
export const MarkAga = (props) => (
  <svg {...base} {...props}>
    <path d="M12 34l12-22 12 22" />
    <path d="M17 27h14" />
  </svg>
);
export const MarkSaipa = (props) => (
  <svg {...base} {...props}>
    <path d="M34 17a9 9 0 0 0-13 1c-3 4 0 8 4 9s7 5 4 9a9 9 0 0 1-13-1" />
  </svg>
);
export const MarkCima = (props) => (
  <svg {...base} {...props}>
    <path d="M10 36V16M19 36V24M28 36V20M37 36V12" />
    <path d="M8 40h32" strokeOpacity=".4" />
  </svg>
);
export const MarkAcca = (props) => (
  <svg {...base} {...props}>
    <circle cx="24" cy="24" r="13" />
    <path d="M11 24h26M24 11c6 7 6 19 0 26-6-7-6-19 0-26z" strokeOpacity=".6" />
  </svg>
);
