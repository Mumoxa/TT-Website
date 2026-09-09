/* Talent Tree — public client downloads at /downloads.
   Public route: talenttree.co.za/downloads
   -----------------------------------------------------------------------
   A document library for clients. The first (and currently only) file is
   the Terms of Business. Static originals live in public/downloads/ and
   are served as real files at /downloads/<filename> — the SPA listing
   page is a separate route.

   Content: clauses are loaded from ./terms.json so the page, the print
   stylesheet and the generated PDF stay in lockstep. No fee percentages,
   registration numbers or addresses are invented here.

   Design: scoped `td-` extension of src/styles.css (DESIGN.md) — one ink,
   one paper, one accent, Fraunces + Inter, 2px radius, --ease. */

import { useCallback, useEffect, useRef, useState } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import terms from './terms.json';
import './downloads.css';

const EMAIL = terms.email;
const mailto = (subject) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;

const chapters = [
  ['library', 'Library'],
  ['terms', 'Terms of business'],
  ['contact', 'Contact'],
];

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 3v12M7 11l5 5 5-5M5 21h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FileIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 13h8M8 17h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

function Reveal({ as: Tag = 'div', children, delay = 0, className = '', ...rest }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export default function DownloadsApp() {
  const [activeChapter, setActiveChapter] = useState('library');
  const [progress, setProgress] = useState(0);
  const [openArticle, setOpenArticle] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Downloads — Talent Tree | Terms of Business';
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta ? meta.getAttribute('content') : null;
    if (meta) {
      meta.setAttribute(
        'content',
        'Download Talent Tree Consulting’s terms of business. The client document library for specialist and executive search engagements in South Africa.'
      );
    }
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) meta.setAttribute('content', previousDescription);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0);

      const marker = window.innerHeight * 0.34;
      let current = chapters[0][0];
      chapters.forEach(([id]) => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= marker) current = id;
      });
      setActiveChapter(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const announceDownload = useCallback(() => {
    setStatus('The terms of business PDF should begin downloading now.');
    window.setTimeout(() => setStatus(''), 3200);
  }, []);

  return (
    <div className="td" id="downloads-top">
      <a className="skip-link" href="#downloads-main">Skip to downloads</a>

      <div className="td-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>

      <header className="td-header">
        <div className="td-header-inner">
          <a className="logo" href="/" aria-label="Talent Tree home">
            <img src={talentTreeLogo} alt="Talent Tree" width="132" height="108" />
            <span className="brand-lockup" aria-hidden="true">
              <span className="brand-name">Talent Tree</span>
              <span className="brand-line">Client downloads</span>
            </span>
          </a>
          <nav className="td-chapters" aria-label="Downloads sections">
            {chapters.map(([id, label]) => (
              <a key={id} href={`#${id}`} aria-current={activeChapter === id ? 'true' : undefined}>
                {label}
              </a>
            ))}
          </nav>
          <a
            className="td-header-cta"
            href={terms.href}
            download={terms.fileName}
            onClick={announceDownload}
          >
            Download terms
          </a>
        </div>
      </header>

      <main id="downloads-main" tabIndex={-1}>
        <section className="td-cover" aria-labelledby="downloads-heading">
          <div className="td-shell">
            <p className="eyebrow">Client library · Talent Tree Consulting</p>
            <h1 id="downloads-heading">
              The documents our clients keep on file. <em>Ready to download.</em>
            </h1>
            <p className="td-lead">
              A public folder for the paperwork that sits next to a mandate. Start with our terms of
              business — the same terms that govern specialist search, executive search, market mapping
              and selective team builds.
            </p>

            <div className="td-cover-actions">
              <a
                className="td-button td-button-light"
                href={terms.href}
                download={terms.fileName}
                onClick={announceDownload}
              >
                <span>Download terms of business</span>
                <DownloadIcon />
              </a>
              <a className="td-button td-button-ghost" href="#terms">
                <span>Read on this page</span>
                <Arrow />
              </a>
            </div>

            <dl className="td-cover-facts">
              <div>
                <dt>Document</dt>
                <dd>Terms of Business</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{terms.version}</dd>
              </div>
              <div>
                <dt>Effective</dt>
                <dd>{terms.effective}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>PDF</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="td-section td-paper-soft" id="library" aria-labelledby="library-heading">
          <span className="section-numeral" aria-hidden="true">01</span>
          <div className="td-shell">
            <div className="td-heading-row">
              <Reveal className="section-kicker"><span>01</span> Library</Reveal>
              <Reveal delay={80}>
                <h2 id="library-heading">One place for the files clients ask for.</h2>
                <p>
                  Direct links, no login. Files in this library also live at a stable public URL under
                  {' '}<code>/downloads/</code>, so they can be attached to a mandate email or stored in
                  a client’s vendor folder.
                </p>
              </Reveal>
            </div>

            <Reveal>
              <article className="td-doc">
                <div className="td-doc-mark" aria-hidden="true">
                  <FileIcon />
                </div>
                <div className="td-doc-body">
                  <div className="td-doc-head">
                    <span className="td-doc-number">01</span>
                    <span className="td-doc-tag">Client terms</span>
                  </div>
                  <h3>{terms.title}</h3>
                  <p className="td-doc-meta">
                    Version {terms.version} · Effective {terms.effective} · PDF
                  </p>
                  <p className="td-doc-lead">{terms.summary}</p>
                  <div className="td-doc-actions">
                    <a
                      className="td-button td-button-dark"
                      href={terms.href}
                      download={terms.fileName}
                      onClick={announceDownload}
                    >
                      <span>Download PDF</span>
                      <DownloadIcon />
                    </a>
                    <a className="td-button td-button-quiet" href={terms.href} target="_blank" rel="noreferrer">
                      <span>Open in browser</span>
                      <Arrow />
                    </a>
                  </div>
                  <p className="td-doc-url">
                    Direct file:{' '}
                    <a href={terms.href}>{`talenttree.co.za${terms.href}`}</a>
                  </p>
                </div>
              </article>
            </Reveal>
          </div>
        </section>

        <section className="td-section td-paper" id="terms" aria-labelledby="terms-heading">
          <span className="section-numeral" aria-hidden="true">02</span>
          <div className="td-shell">
            <div className="td-heading-row">
              <Reveal className="section-kicker"><span>02</span> Terms of business</Reveal>
              <Reveal delay={80}>
                <h2 id="terms-heading">Sixteen clauses. <em>Plain language.</em></h2>
                <p>
                  Instructing us, accepting a shortlist or interviewing a candidate we have introduced
                  constitutes acceptance of these terms, unless a signed mandate says otherwise. Open a
                  clause to read it; print this page if you need a paper copy.
                </p>
              </Reveal>
            </div>

            <Reveal className="td-preamble" delay={40}>
              {terms.preamble.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </Reveal>

            <div className="td-articles">
              {terms.articles.map((article, index) => {
                const expanded = openArticle === index;
                const panelId = `td-article-${article.id}`;
                return (
                  <Reveal delay={Math.min(index, 8) * 40} key={article.id}>
                    <article className={expanded ? 'td-article is-open' : 'td-article'}>
                      <h3>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          onClick={() => setOpenArticle(expanded ? -1 : index)}
                        >
                          <span className="td-article-number">{article.number}</span>
                          <span className="td-article-title">{article.title}</span>
                          <span className="td-mark" aria-hidden="true" />
                        </button>
                      </h3>
                      <div className="td-article-panel" id={panelId} hidden={!expanded}>
                        {article.paragraphs.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>

            <Reveal className="td-print-note" delay={80}>
              <p>
                Need a signed copy on letterhead, or a variation for a specific mandate?{' '}
                <a className="td-inline-link" href={mailto('Terms of business — mandate variation')}>
                  Email us
                </a>
                . You can also{' '}
                <button type="button" className="td-text-button" onClick={() => window.print()}>
                  print or save this page as PDF
                </button>
                .
              </p>
            </Reveal>
          </div>
        </section>

        <section className="td-contact" id="contact" aria-labelledby="contact-heading">
          <div className="td-shell">
            <Reveal>
              <p className="eyebrow">Questions</p>
              <h2 id="contact-heading">A mandate should be as clear as the search.</h2>
              <p className="td-lead">
                If a clause needs to move for a particular brief, we will put the variation in writing
                before work starts.
              </p>
            </Reveal>

            <Reveal className="td-contact-card" delay={80}>
              <h3>Client documents</h3>
              <p>Terms, mandate wording and anything your procurement team needs on file.</p>
              <a className="email-link" href={mailto('Client documents — Talent Tree')}>{EMAIL}</a>
              <div className="td-contact-actions">
                <a className="td-button td-button-light" href={mailto('Client documents — Talent Tree')}>
                  <span>Email us</span>
                  <Arrow />
                </a>
                <a
                  className="td-button td-button-ghost"
                  href={terms.href}
                  download={terms.fileName}
                  onClick={announceDownload}
                >
                  <span>Download the PDF</span>
                  <DownloadIcon />
                </a>
              </div>
            </Reveal>

            <p className="td-status" role="status" aria-live="polite">{status}</p>
          </div>
        </section>
      </main>

      <footer className="td-footer">
        <div className="td-shell">
          <div className="td-footer-top">
            <div>
              <a className="logo" href="/" aria-label="Talent Tree home">
                <img src={talentTreeLogo} alt="Talent Tree" width="132" height="108" />
                <span className="brand-lockup" aria-hidden="true">
                  <span className="brand-name">Talent Tree</span>
                  <span className="brand-line">Niche skills · Executive search</span>
                </span>
              </a>
              <p className="td-footer-line">{terms.closing}</p>
            </div>
            <nav className="td-footer-nav" aria-label="Footer">
              <a href="/">Home</a>
              <a href="/profile">Company profile</a>
              <a href="/downloads">Downloads</a>
              <a href={terms.href} download={terms.fileName}>Terms of business (PDF)</a>
              <a href={mailto('Client documents — Talent Tree')}>Contact us</a>
            </nav>
          </div>
          <div className="td-footer-legal">
            <p>© 2026 Talent Tree Consulting</p>
            <p>
              <a className="email-link" href={mailto('Client documents — Talent Tree')}>{EMAIL}</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
