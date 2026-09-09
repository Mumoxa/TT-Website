/* Talent Tree — Accounting & Finance Search: client and professional-body logos.
   -----------------------------------------------------------------------
   Real brand assets, served from public/logos/. They are referenced by URL
   (not bundled) so Vite emits no extra work for them and the browser can
   cache each independently.

   Every third-party mark renders on a uniform white tile with generous
   clear space — the one ground every trademark stays legible on — so the
   marquee, the track-record band and the pathway tiles share one rhythm.

   `tone` records how the artwork behaves on the dark ink bands, kept for
   documentation and for any future direct-on-ink use:
     'light' — the mark is light enough to sit directly on ink.
     'dark'  — the mark is dark/navy and needs a white tile behind it.

   QA notes (2026-09):
   - Old Mutual's deep-green wordmark is too dark for ink (≈2.5:1), hence
     tone 'dark'.
   - cima.png is quarantined (see FinanceApp.jsx): the file on disk carries
     black edge bars and stray pure-red pixels, so the pathways render a
     typographic tile until Talent Tree supplies a clean asset. The mapping
     below is kept so the file stays referenced and tested. */

const CLIENT_BASE = '/logos/clients';
const BODY_BASE = '/logos/bodies';

export const clientLogos = {
  pepkor: { src: `${CLIENT_BASE}/pepkor.png`, alt: 'Pepkor', tone: 'light' },
  checkers: { src: `${CLIENT_BASE}/checkers.png`, alt: 'Checkers', tone: 'light' },
  picknpay: { src: `${CLIENT_BASE}/picknpay.png`, alt: 'Pick n Pay', tone: 'dark' },
  novus: { src: `${CLIENT_BASE}/novus.png`, alt: 'Novus Holdings', tone: 'dark' },
  supergroup: { src: `${CLIENT_BASE}/supergroup.png`, alt: 'Super Group', tone: 'dark' },
  fnb: { src: `${CLIENT_BASE}/fnb.png`, alt: 'FNB', tone: 'light' },
  nayax: { src: `${CLIENT_BASE}/nayax.png`, alt: 'Nayax', tone: 'dark' },
  otipetrosmart: { src: `${CLIENT_BASE}/otipetrosmart.png`, alt: 'OTI PetroSmart', tone: 'dark' },
  crownnational: { src: `${CLIENT_BASE}/crownnational.png`, alt: 'Crown National', tone: 'light' },
  oldmutual: { src: `${CLIENT_BASE}/oldmutual.png`, alt: 'Old Mutual', tone: 'dark' },
  boschendal: { src: `${CLIENT_BASE}/boschendal.png`, alt: 'Boschendal', tone: 'dark' },
  /* Karoo Bioscience publishes its wordmark only as a Webflow-hosted SVG that
     cannot be redistributed from here, so the card falls back to a typographic
     tile until Talent Tree supplies the asset directly. */
  karoobioscience: null,
};

export const bodyLogos = {
  saica: { src: `${BODY_BASE}/saica.png`, alt: 'SAICA', tone: 'dark' },
  saipa: { src: `${BODY_BASE}/saipa.png`, alt: 'SAIPA', tone: 'dark' },
  cima: { src: `${BODY_BASE}/cima.png`, alt: 'CIMA', tone: 'light' },
  acca: { src: `${BODY_BASE}/acca.png`, alt: 'ACCA', tone: 'light' },
};
