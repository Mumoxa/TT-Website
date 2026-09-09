/* Talent Tree — public client downloads at /downloads.
   Public route: talenttree.co.za/downloads
   -----------------------------------------------------------------------
   A download-focused client folder, restyled as a file browser that stays
   inside the Talent Tree system (src/styles.css / DESIGN.md). Original
   document files live in public/downloads/ and are served as real files at
   /downloads/<filename> — this SPA page is the folder that fronts them.

   The folder currently holds the Terms of Business in two genuine formats:
   the archival PDF (also used by the marketing site) and an editable Word
   copy generated from ./terms.json by scripts/build-terms-docx.mjs. No fee
   percentages, registration numbers or invented documents appear here.

   Design: scoped `td-` extension of the site tokens — one ink, one paper,
   one accent, Fraunces + Inter, 2px radius, --ease. Reuses the shared
   skip-link / logo / eyebrow / section-kicker classes already in styles.css.
   This page is download-forward: clause text lives in the documents, not as
   a second accordion here. */

import { useCallback, useEffect, useRef, useState } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import terms from './terms.json';
import './downloads.css';

const EMAIL = terms.email;
const mailto = (subject) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;

/* The documents held in the open folder. Each href is a real static file in
   public/downloads/. Sizes are the live byte sizes of those files. */
const FILES = [
  {
    id: 'pdf',
    ext: 'PDF',
    label: 'Terms of Business — PDF',
    fileName: terms.fileName,
    href: terms.href,
    size: '30 KB',
    hint: 'Archival copy — print it or drop it in a vendor folder.',
  },
  {
    id: 'docx',
    ext: 'DOC',
    label: 'Terms of Business — Word',
    fileName: 'Talent-Tree-Terms-of-Business.docx',
    href: '/downloads/Talent-Tree-Terms-of-Business.docx',
    size: '15 KB',
    hint: 'Editable copy — for letterhead or a mandate variation.',
  },
];

/* Short, honest orientation cards for the light band. Copy is drawn from the
   published terms content (summary / preamble / Application clause), never
   invented here. The full clause text lives only in the downloadable files. */
const DOCX_HREF = '/downloads/Talent-Tree-Terms-of-Business.docx';
const DOCX_NAME = 'Talent-Tree-Terms-of-Business.docx';

const scopeItems = [
  {
    number: '01',
    title: 'Specialist search',
    text: 'Direct headhunting for the scarce, niche skills clients fight over — people who were not looking and do not answer job ads.',
  },
  {
    number: '02',
    title: 'Executive search',
    text: 'Discreet search for senior and executive appointments, run as an extension of the client’s own team with the discretion they would use themselves.',
  },
  {
    number: '03',
    title: 'Market mapping',
    text: 'Mapping the relevant market as a standalone deliverable, charged on the basis confirmed when the brief is accepted.',
  },
  {
    number: '04',
    title: 'Team builds & advisory',
    text: 'Selective team builds and related talent-advisory work — each governed by these same terms unless a signed mandate varies them.',
  },
];

const chapters = [
  ['folder', 'Folder'],
  ['scope', 'What it covers'],
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

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const FileIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M14 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 13h6M9 17h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* Small utility components for the folder window */
const WindowDots = () => (
  <span className="td-window-dots" aria-hidden="true">
    <i /><i /><i />
  </span>
);

const ChevronRight = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
  const [activeChapter, setActiveChapter] = useState('folder');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Downloads — Talent Tree | Terms of Business';
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta ? meta.getAttribute('content') : null;
    if (meta) {
      meta.setAttribute(
        'content',
        'Download Talent Tree Consulting’s terms of business. A public client folder with the Terms as a PDF and an editable Word copy — specialist and executive search, South Africa.'
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

  const announceDownload = useCallback((label) => {
    setStatus(`${label} should begin downloading now.`);
    window.setTimeout(() => setStatus(''), 3600);
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
            onClick={() => announceDownload('The terms of business PDF')}
          >
            <DownloadIcon />
            Download terms
          </a>
        </div>
      </header>

      <main id="downloads-main" tabIndex={-1}>
        {/* ── Cover — the client downloads folder ───────────────────────── */}
        <section className="td-cover" aria-labelledby="downloads-heading">
          <div className="td-shell">
            <Reveal>
              <p className="eyebrow">Talent Tree · Client downloads</p>
            </Reveal>
            <Reveal delay={60}>
              <h1 id="downloads-heading">
                The folder our clients keep <em>on file.</em>
              </h1>
              <p className="td-lead">
                A public folder for the documents that sit next to a mandate. No login, no forms —
                just download. It opens with the Terms of Business that govern every specialist
                search, executive search, market mapping and selective team build we run.
              </p>
            </Reveal>

            <Reveal className="td-pathline" delay={120}>
              <FolderIcon />
              <span className="td-pathline-sep">talenttree.co.za</span>
              <span className="td-pathline-slashes">/</span>
              <span className="td-pathline-sep">downloads</span>
              <span className="td-pathline-slashes">/</span>
              <span className="td-pathline-here">terms-of-business</span>
            </Reveal>

            <Reveal className="td-cover-actions" delay={160}>
              <a
                className="td-button td-button-light"
                href={terms.href}
                download={terms.fileName}
                onClick={() => announceDownload('The terms of business PDF')}
              >
                <span>Download terms of business</span>
                <DownloadIcon />
              </a>
              <a
                className="td-button td-button-ghost"
                href={DOCX_HREF}
                download={DOCX_NAME}
                onClick={() => announceDownload('The terms of business Word copy')}
              >
                <span>Get the Word copy</span>
                <DownloadIcon />
              </a>
              <a className="td-button td-button-ghost td-button-arrow" href="#folder">
                <span>Open the folder</span>
                <Arrow />
              </a>
            </Reveal>

            <Reveal delay={200}>
              <dl className="td-cover-facts">
                <div>
                  <dt>Folder</dt>
                  <dd>Client downloads</dd>
                </div>
                <div>
                  <dt>Document</dt>
                  <dd>Terms of Business</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{terms.version}</dd>
                </div>
                <div>
                  <dt>Formats</dt>
                  <dd>PDF + Word</dd>
                </div>
              </dl>
            </Reveal>
          </div>
        </section>

        {/* ── The folder window — file browser ───────────────────────────── */}
        <section className="td-section td-paper-soft" id="folder" aria-labelledby="folder-heading">
          <span className="section-numeral" aria-hidden="true">01</span>
          <div className="td-shell">
            <div className="td-heading-row">
              <Reveal className="section-kicker"><span>01</span> Downloads</Reveal>
              <Reveal delay={80}>
                <h2 id="folder-heading">One folder, opened. <em>Ready when you are.</em></h2>
                <p>
                  The same terms as a print-and-archive PDF and an editable Word copy — each sitting
                  at a stable public URL under <code>/downloads/</code>, so they can be attached to a
                  mandate email or filed in your vendor folder.
                </p>
              </Reveal>
            </div>

            {/* Folder window chrome */}
            <Reveal>
              <div className="td-window">
                <div className="td-window-bar">
                  <WindowDots />
                  <p className="td-window-loc" aria-hidden="true">
                    <span>Downloads</span>
                    <ChevronRight />
                    <span className="td-window-loc-cur">Terms of Business</span>
                  </p>
                </div>

                <div className="td-window-body">
                  <div className="td-window-folderhead">
                    <span className="td-window-foldericon"><FolderIcon /></span>
                    <span className="td-window-foldertext">
                      <strong>Terms of Business</strong>
                      <small>{FILES.length} files · Version {terms.version} · Effective {terms.effective}</small>
                    </span>
                  </div>

                  <div className="td-files" role="list" aria-label="Documents in this folder">
                    {FILES.map((file) => (
                      <article className="td-file" role="listitem" key={file.id}>
                        <span className="td-file-type" aria-hidden="true">{file.ext}</span>
                        <div className="td-file-body">
                          <h3>
                            <a
                              href={file.href}
                              download={file.fileName}
                              onClick={() => announceDownload(`The terms of business ${file.id === 'pdf' ? 'PDF' : 'Word copy'}`)}
                            >
                              {file.label}
                            </a>
                          </h3>
                          <p className="td-file-hint">{file.hint}</p>
                        </div>
                        <dl className="td-file-meta">
                          <div><dt>Size</dt><dd>{file.size}</dd></div>
                          <div><dt>File</dt><dd>.{file.id}</dd></div>
                        </dl>
                        <div className="td-file-action">
                          <a
                            className="td-button td-button-quiet td-button-sm"
                            href={file.href}
                            download={file.fileName}
                            onClick={() => announceDownload(`The terms of business ${file.id === 'pdf' ? 'PDF' : 'Word copy'}`)}
                          >
                            <span>Download</span>
                            <DownloadIcon />
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>

                  <p className="td-window-foot">
                    {FILES.length} items · {FILES.reduce((sum, f) => sum + (f.size === '30 KB' ? 30 : 15), 0)} KB total.
                    Need a signed copy on letterhead, or a variation for a specific brief?{' '}
                    <a className="td-inline-link" href={mailto('Terms of business — signed copy or variation')}>
                      Email us
                    </a>.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal className="td-directurls" delay={60}>
              <span>Stable file URLs</span>
              <div>
                {FILES.map((file) => (
                  <code key={file.id}>
                    <a href={file.href} download={file.fileName}>{`talenttree.co.za${file.href}`}</a>
                  </code>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Scope — short orientation, not a second accordion ─────────── */}
        <section className="td-section td-paper" id="scope" aria-labelledby="scope-heading">
          <span className="section-numeral" aria-hidden="true">02</span>
          <div className="td-shell">
            <div className="td-heading-row">
              <Reveal className="section-kicker"><span>02</span> What it covers</Reveal>
              <Reveal delay={80}>
                <h2 id="scope-heading">Plain-language terms, <em>kept brief here.</em></h2>
                <p>
                  Download the folder to keep the full sixteen clauses on file. Before you do, a short
                  orientation to the work those terms govern — and two points worth knowing up front.
                </p>
              </Reveal>
            </div>

            <div className="td-scope-grid">
              {scopeItems.map((item, i) => (
                <Reveal delay={Math.min(i, 6) * 40} key={item.title}>
                  <article className="td-scope">
                    <span className="td-scope-number" aria-hidden="true">{item.number}</span>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </article>
                </Reveal>
              ))}
            </div>

            <Reveal className="td-notice" delay={60}>
              <div className="td-notice-mark" aria-hidden="true"><FolderIcon /></div>
              <div>
                <p>
                  Instructing us, accepting a shortlist, or interviewing a candidate we have
                  introduced constitutes acceptance of these terms, unless a signed mandate says
                  otherwise. An introduction stays valid for twelve months.
                </p>
                <a
                  className="td-button td-button-dark td-button-sm"
                  href={terms.href}
                  download={terms.fileName}
                  onClick={() => announceDownload('The terms of business PDF')}
                >
                  <span>Keep the full terms on file</span>
                  <DownloadIcon />
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Contact ───────────────────────────────────────────────────── */}
        <section className="td-contact" id="contact" aria-labelledby="contact-heading">
          <div className="td-shell">
            <Reveal>
              <p className="eyebrow">Questions</p>
              <h2 id="contact-heading">Want a signed copy, or a clause to move?</h2>
              <p className="td-lead">
                We will put any variation for a particular brief in writing before work starts — then
                add it to the folder so your procurement team has one source of truth.
              </p>
            </Reveal>

            <Reveal className="td-contact-card" delay={80}>
              <h3>Client documents</h3>
              <p>Terms, mandate wording and anything your vendor desk needs on file.</p>
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
                  onClick={() => announceDownload('The terms of business PDF')}
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
              <a href={DOCX_HREF} download={DOCX_NAME}>Terms of business (Word)</a>
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
