/* Talent Tree — Accounting & Finance Search capability profile.
   Public route: /profile/finance  (talenttree.co.za/profile/finance)
   -----------------------------------------------------------------------
   Content rule (AGENTS.md rule zero): every claim rendered below is taken
   verbatim, or condensed without addition, from the Accounting & Finance
   capability copy supplied by Talent Tree. No statistic, client, date,
   designation or role has been invented here.

   Client names on this page ARE published deliberately: the supplied
   capability content names them as track record. Each is represented by
   the organisation's real logo, served from public/logos/ (see ./logos.js).

   Design: scoped `tf-` extension of the system in src/styles.css
   (DESIGN.md) — one ink, one paper, one accent, Fraunces + Inter, 2px
   radius, a single easing curve, everything disabled under
   prefers-reduced-motion. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import talentTreeLogo from '../../../Talent Tree Logo 2026 (1).png';
import { bodyLogos, clientLogos } from './logos.js';
import './finance.css';

/* ── Constants ──────────────────────────────────────────────────────────── */

const EMAIL = 'hello@talenttree.co.za';
const mailto = (subject) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;

const chapters = [
  ['approach', 'The difference'],
  ['since-2010', 'Since 2010'],
  ['pathways', 'Pathways'],
  ['method', 'Search method'],
  ['track-record', 'Track record'],
  ['disciplines', 'What we recruit'],
  ['hidden-market', 'Why it matters'],
  ['contact', 'Contact'],
];

const coverFacts = [
  ['Since', '2010', 'Specialist finance recruitment experience'],
  ['Market', 'South Africa', 'Accounting and finance search'],
  ['Method', 'Proactive search', 'Not advertise and wait'],
];

/* Professional accounting pathways — verbatim from the supplied content. */
const pathways = [
  {
    id: 'ca',
    logo: bodyLogos.saica,
    short: 'CA(SA)',
    name: 'Chartered Accountant South Africa',
    lead:
      'The CA(SA) designation represents professionals who have progressed through SAICA’s rigorous academic, practical training and professional assessment pathway.',
    rolesLabel: 'Our searches may target CA(SA) professionals for positions including',
    roles: [
      'Financial Manager',
      'Group Financial Manager',
      'Financial Controller',
      'Finance Business Partner',
      'Head of Finance',
      'Financial Director',
      'CFO',
      'Commercial Finance and senior leadership appointments',
    ],
  },
  {
    id: 'aga',
    logo: bodyLogos.saica,
    short: 'AGA(SA)',
    name: 'Associate General Accountant South Africa',
    lead:
      'AGA(SA) is SAICA’s mid-tier professional accounting designation and is particularly relevant to the market Talent Tree frequently recruits within.',
    rolesLabel: 'An important talent pool for',
    roles: ['Financial Accountant', 'Senior Accountant', 'Financial Manager', 'Related appointments'],
    tail:
      'AGA(SA) professionals can combine strong technical accounting capability with operational and management responsibility.',
  },
  {
    id: 'saipa',
    logo: bodyLogos.saipa,
    short: 'SAIPA',
    name: 'Professional Accountant (SA)',
    lead:
      'The Professional Accountant (SA) pathway provides another substantial pool of professionally trained accounting talent. These professionals can bring experience across financial reporting, management accounting, financial control, taxation, business advisory and operational finance.',
    rolesLabel: 'A particularly valuable search population for',
    roles: ['Senior Accountant', 'Group Accountant', 'Financial Manager', 'Financial Controller'],
    tail: 'Depending on the environment and experience required.',
  },
  {
    id: 'cima',
    logo: bodyLogos.cima,
    short: 'CIMA / CGMA',
    name: 'Management Accounting',
    lead:
      'CIMA-trained and CGMA-qualified professionals provide a different but highly complementary talent pool. Their development has a strong management accounting, performance, commercial and strategic orientation.',
    rolesLabel: 'We consider CIMA talent particularly relevant to',
    roles: [
      'Management Accounting',
      'Cost Accounting',
      'FP&A',
      'Commercial Finance',
      'Finance Business Partnering',
      'Operational Finance',
      'Financial Analysis',
      'Performance Management',
      'Finance Leadership',
    ],
  },
  {
    id: 'acca',
    logo: bodyLogos.acca,
    short: 'ACCA',
    name: 'Internationally recognised pathway',
    lead:
      'ACCA provides an internationally recognised professional accounting pathway spanning financial accounting, management accounting, financial reporting, audit, taxation, financial management and ultimately strategic professional capability.',
    rolesLabel: 'Particularly relevant where',
    roles: [
      'Organisations operate internationally',
      'Broad technical finance capability is required',
      'Broad commercial finance capability is required',
    ],
  },
];

/* Our search approach — the six supplied steps. */
const method = [
  {
    title: 'Understand the requirement beyond the job title',
    lead: 'We establish what the person will actually need to deliver.',
    detail:
      'That includes the reporting environment, operational complexity, team structure, systems, industry exposure, professional training, technical accounting requirements, stakeholder environment and the problems the appointment needs to solve.',
  },
  {
    title: 'Map the relevant talent market',
    lead: 'We identify where comparable finance capability is likely to exist.',
    detail:
      'Rather than restricting the search to obvious competitors, we consider adjacent industries, comparable operating environments and organisations where professionals are exposed to similar financial complexity.',
  },
  {
    title: 'Identify the individuals',
    lead: 'We research the market to identify professionals whose profile indicates potential alignment.',
    detail:
      'Qualifications, career development, company exposure, responsibilities and progression are all read together before anyone is approached.',
  },
  {
    title: 'Approach passive talent directly',
    lead: 'Many of the strongest professionals we encounter are not actively applying for positions.',
    detail:
      'We approach them directly, introduce the opportunity and establish whether there is sufficient alignment to begin a conversation.',
  },
  {
    title: 'Qualify for fit',
    lead: 'Professional designation alone is never enough.',
    detail:
      'We assess the combination of qualification, training, technical capability, industry exposure, systems, leadership, commercial understanding, career progression and motivation.',
    chips: [
      'Qualification',
      'Training',
      'Technical capability',
      'Industry exposure',
      'Systems',
      'Leadership',
      'Commercial understanding',
      'Career progression',
      'Motivation',
    ],
  },
  {
    title: 'Bring the market to the client',
    lead: 'Instead of asking the client to choose from whoever happened to respond to an advert.',
    detail: 'Our objective is to systematically identify and engage the relevant market.',
  },
];

/* Proven finance search experience — named clients, as supplied. */
const clients = [
  {
    id: 'pepkor',
    logo: clientLogos.pepkor,
    name: 'Pepkor Group',
    sector: 'Retail',
    lead: 'Multiple accounting and finance appointments across the broader group.',
    roles: ['Accountants', 'Financial Managers', 'Financial Directors', 'Specialist finance appointments'],
  },
  {
    id: 'checkers',
    logo: clientLogos.checkers,
    name: 'Checkers Group',
    sector: 'Retail',
    lead: 'Finance recruitment across the group and its African operations.',
    roles: [
      'Accountants',
      'Financial Managers',
      'Finance professionals supporting complex multi-location and African operations',
    ],
  },
  {
    id: 'picknpay',
    logo: clientLogos.picknpay,
    name: 'Pick n Pay Group',
    sector: 'Retail',
    lead: 'Appointments across group and divisional finance.',
    roles: ['Financial Managers', 'Group Financial Managers', 'Senior finance professionals'],
  },
  {
    id: 'novus',
    logo: clientLogos.novus,
    name: 'Novus Holdings',
    sector: 'Manufacturing',
    lead: 'Appointments across accounting and group finance.',
    roles: ['Financial Managers', 'Group Financial Managers', 'Senior accounting and finance professionals'],
  },
  {
    id: 'supergroup',
    logo: clientLogos.supergroup,
    name: 'Super Group / Super Group Rent',
    sector: 'Logistics',
    lead: 'Appointments across commercial and operational finance.',
    roles: ['Financial Managers', 'Financial Analysts', 'Commercial and operational finance professionals'],
  },
  {
    id: 'lufthansa',
    logo: clientLogos.lufthansa,
    name: 'Lufthansa',
    sector: 'Aviation',
    lead: 'Experience recruiting finance professionals into an international corporate environment.',
    roles: ['Accountants', 'Financial Analysts'],
  },
  {
    id: 'fnb',
    logo: clientLogos.fnb,
    name: 'FNB',
    sector: 'Financial services',
    lead: 'Specialist accounting appointments inside a major banking group.',
    roles: ['Cost Accountants', 'Specialist accounting professionals'],
  },
  {
    id: 'nayax',
    logo: clientLogos.nayax,
    logoSecondary: clientLogos.otipetrosmart,
    name: 'Nayax / OTI PetroSmart',
    sector: 'Technology',
    lead:
      'Finance recruitment supporting OTI PetroSmart, subsequently acquired by international fintech group Nayax.',
    roles: ['Appointments across specialist accounting and finance requirements within a technology-led environment'],
  },
  {
    id: 'crownnational',
    logo: clientLogos.crownnational,
    name: 'Crown National',
    sector: 'Manufacturing',
    lead: 'Experience recruiting into operational, manufacturing and group finance environments.',
    roles: ['Financial Managers', 'Group Financial Managers'],
  },
  {
    id: 'oldmutual',
    logo: clientLogos.oldmutual,
    name: 'Old Mutual',
    sector: 'Financial services',
    lead: 'Finance appointments within a major South African financial services group.',
    roles: ['Financial Managers'],
  },
  {
    id: 'boschendal',
    logo: clientLogos.boschendal,
    name: 'Boschendal',
    sector: 'Agriculture & hospitality',
    lead: 'Finance appointments into a heritage farm, wine and hospitality environment.',
    roles: ['Financial Managers'],
  },
  {
    id: 'karoobioscience',
    logo: clientLogos.karoobioscience,
    name: 'Karoo Bioscience',
    sector: 'Life sciences',
    lead: 'Finance appointments into a licensed, science-led production environment.',
    roles: ['Financial Managers'],
  },
  {
    id: 'nonprofit',
    logo: null,
    name: 'Nonprofit Sector',
    sector: 'Nonprofit',
    lead:
      'Searches where financial governance, stakeholder management and organisational purpose require a different leadership profile from traditional corporate finance.',
    roles: ['Chief Financial Officers', 'Senior finance leadership'],
  },
];

const sectors = [
  'All',
  'Retail',
  'Manufacturing',
  'Logistics',
  'Aviation',
  'Financial services',
  'Technology',
  'Agriculture & hospitality',
  'Life sciences',
  'Nonprofit',
];

/* What we recruit. */
const disciplines = [
  {
    id: 'accounting',
    title: 'Accounting & Reporting',
    roles: [
      'Financial Accountant',
      'Senior Accountant',
      'Group Accountant',
      'Reporting Accountant',
      'Technical Accountant',
      'Group Reporting',
    ],
  },
  {
    id: 'management',
    title: 'Management & Operational Finance',
    roles: [
      'Management Accountant',
      'Cost Accountant',
      'Plant/Operational Accountant',
      'Financial Controller',
      'Financial Manager',
      'Group Financial Manager',
    ],
  },
  {
    id: 'commercial',
    title: 'Commercial Finance',
    roles: [
      'Financial Analyst',
      'Commercial Analyst',
      'Finance Business Partner',
      'FP&A',
      'Commercial Finance Manager',
      'Performance Management',
    ],
  },
  {
    id: 'leadership',
    title: 'Finance Leadership',
    roles: ['Head of Finance', 'Financial Director', 'Group Financial Director', 'CFO'],
  },
  {
    id: 'pools',
    title: 'Professional Talent Pools',
    roles: [
      'CA(SA)',
      'AGA(SA)',
      'SAICA-trained professionals',
      'SAIPA Professional Accountant (SA)',
      'SAIPA/SAICA articled professionals',
      'CIMA/CGMA',
      'ACCA',
      'Qualified and part-qualified professional accountants',
    ],
  },
];

/* Market evolution we have recruited through, since 2010. */
const evolution = [
  'Changing qualification structures',
  'New professional designations',
  'The growth of finance business partnering and commercial finance',
  'The increased importance of ERP and data capability',
  'The evolution of the modern finance function from primarily financial reporting into a much broader strategic and operational business partner',
];

const hiddenMarket = [
  'A high-performing Financial Manager who has spent six years building their career inside a competitor may never see your advertisement.',
  'A technically strong accountant completing a professional pathway may not consider themselves “on the market.”',
  'A future CFO may be performing exceptionally well one organisational level below the title being advertised.',
];

const research = [
  'Where does the required capability exist?',
  'Which companies develop it?',
  'Which professional accounting pathway best aligns with the requirement?',
  'Which adjacent industries produce transferable experience?',
  'Which professionals appear to be progressing?',
  'Who is likely to be accessible through conventional recruitment channels?',
];

/* ── Primitives ─────────────────────────────────────────────────────────── */

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

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

/* Runs a callback once the element first enters the viewport. */
function useInView(threshold = 0.35) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        });
      },
      { threshold }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function Counter({ value, suffix = '', label, plain = false }) {
  const [ref, inView] = useInView(0.4);
  const [shown, setShown] = useState(plain ? value : 0);

  useEffect(() => {
    if (plain || !inView) return undefined;
    if (prefersReducedMotion()) {
      setShown(value);
      return undefined;
    }
    let frame = 0;
    const duration = 1400;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [inView, plain, value]);

  return (
    <div className="tf-stat" ref={ref}>
      <strong>
        {shown}
        {suffix}
      </strong>
      <span>{label}</span>
    </div>
  );
}

/* ── Hero visual: the market radar ──────────────────────────────────────── */
/* A deterministic scatter of the market, with the identified professionals
   picked out in accent. Purely decorative — aria-hidden. */

const radarPoints = (() => {
  const points = [];
  let seed = 20100;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 68; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 34 + Math.sqrt(random()) * 150;
    points.push({
      x: 180 + Math.cos(angle) * radius,
      y: 180 + Math.sin(angle) * radius,
      r: 1.4 + random() * 1.8,
      found: random() > 0.82,
      delay: Math.round(random() * 4000),
    });
  }
  return points;
})();

function MarketRadar() {
  return (
    <div className="tf-radar" aria-hidden="true">
      <svg viewBox="0 0 360 360" role="presentation">
        <defs>
          <radialGradient id="tf-sweep" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.34" />
            <stop offset="70%" stopColor="currentColor" stopOpacity="0.04" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="tf-radar-rings">
          {[58, 96, 134, 172].map((r) => (
            <circle key={r} cx="180" cy="180" r={r} />
          ))}
          <path d="M180 8v344M8 180h344" />
        </g>
        <g className="tf-radar-sweep">
          <path d="M180 180 L180 8 A172 172 0 0 1 302 58 Z" fill="url(#tf-sweep)" />
        </g>
        <g className="tf-radar-points">
          {radarPoints.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={point.r}
              className={point.found ? 'is-found' : ''}
              style={{ animationDelay: `${point.delay}ms` }}
            />
          ))}
        </g>
        <g className="tf-radar-lock">
          <rect x="150" y="86" width="34" height="34" rx="1" />
          <rect x="214" y="196" width="34" height="34" rx="1" />
          <rect x="104" y="214" width="34" height="34" rx="1" />
        </g>
      </svg>
    </div>
  );
}

/* ── Advertise vs search visual ─────────────────────────────────────────── */

function PoolCompare() {
  const [ref, inView] = useInView(0.3);
  const cells = 96;
  return (
    <div className={`tf-pools${inView ? ' is-live' : ''}`} ref={ref}>
      <figure className="tf-pool">
        <figcaption>
          <span className="tf-pool-label">Advertising</span>
          <span className="tf-pool-note">Only the people who happen to be looking</span>
        </figcaption>
        <div className="tf-grid-dots" aria-hidden="true">
          {Array.from({ length: cells }, (_, index) => (
            <i key={index} className={index % 11 === 0 ? 'is-on' : ''} style={{ transitionDelay: `${index * 6}ms` }} />
          ))}
        </div>
      </figure>
      <div className="tf-pool-vs" aria-hidden="true">
        <span>vs</span>
      </div>
      <figure className="tf-pool is-search">
        <figcaption>
          <span className="tf-pool-label">Proactive search</span>
          <span className="tf-pool-note">The people the business actually needs</span>
        </figcaption>
        <div className="tf-grid-dots" aria-hidden="true">
          {Array.from({ length: cells }, (_, index) => (
            <i key={index} className="is-on" style={{ transitionDelay: `${index * 9}ms` }} />
          ))}
        </div>
      </figure>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function FinanceApp() {
  const [activeChapter, setActiveChapter] = useState('approach');
  const [progress, setProgress] = useState(0);
  const [activePathway, setActivePathway] = useState('ca');
  const [activeStep, setActiveStep] = useState(0);
  const [sector, setSector] = useState('All');
  const [openClient, setOpenClient] = useState(null);
  const [copied, setCopied] = useState('');

  /* Page-level SEO for the SPA route. */
  useEffect(() => {
    const previousTitle = document.title;
    document.title =
      'Accounting & Finance Search — Talent Tree | Specialist Finance Recruitment, South Africa';
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta ? meta.getAttribute('content') : null;
    if (meta) {
      meta.setAttribute(
        'content',
        'Talent Tree accounting and finance search: specialist finance recruitment experience since 2010. Proactive search, market mapping and passive talent across CA(SA), AGA(SA), SAIPA, CIMA/CGMA and ACCA pathways in South Africa.'
      );
    }
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) meta.setAttribute('content', previousDescription);
    };
  }, []);

  /* Reading progress + chapter scrollspy in one passive listener. */
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

  const visibleClients = useMemo(
    () => (sector === 'All' ? clients : clients.filter((client) => client.sector === sector)),
    [sector]
  );

  const copyEmail = useCallback(async (address) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(address);
        setCopied(address);
        window.setTimeout(() => setCopied(''), 2400);
        return;
      }
      throw new Error('clipboard unavailable');
    } catch {
      setCopied('error');
      window.setTimeout(() => setCopied(''), 2400);
    }
  }, []);

  const onStepKeyDown = (event) => {
    const last = method.length - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveStep((index) => (index === last ? 0 : index + 1));
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveStep((index) => (index === 0 ? last : index - 1));
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveStep(0);
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveStep(last);
    }
  };

  const onPathwayKeyDown = (event) => {
    const ids = pathways.map((item) => item.id);
    const current = ids.indexOf(activePathway);
    const last = ids.length - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      setActivePathway(ids[current === last ? 0 : current + 1]);
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActivePathway(ids[current === 0 ? last : current - 1]);
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActivePathway(ids[0]);
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActivePathway(ids[last]);
    }
  };

  const pathway = pathways.find((item) => item.id === activePathway) || pathways[0];
  const step = method[activeStep];
  const marqueeClients = [...clients, ...clients];

  return (
    <div className="tf" id="finance-top">
      <a className="skip-link" href="#finance-main">Skip to capability content</a>

      <div className="tf-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>

      <header className="tf-header">
        <div className="tf-header-inner">
          <a className="logo" href="/" aria-label="Talent Tree home">
            <img src={talentTreeLogo} alt="Talent Tree" width="132" height="108" />
            <span className="brand-lockup" aria-hidden="true">
              <span className="brand-name">Talent Tree</span>
              <span className="brand-line">Accounting &amp; Finance Search</span>
            </span>
          </a>
          <nav className="tf-chapters" aria-label="Capability chapters">
            {chapters.map(([id, label]) => (
              <a key={id} href={`#${id}`} aria-current={activeChapter === id ? 'true' : undefined}>
                {label}
              </a>
            ))}
          </nav>
          <a className="tf-header-cta" href={mailto('Finance search enquiry — Talent Tree')}>
            Brief us
          </a>
        </div>
      </header>

      <main id="finance-main">
        {/* ── Cover ─────────────────────────────────────────────────────── */}
        <section className="tf-cover" aria-labelledby="finance-heading">
          <MarketRadar />
          <div className="tf-shell tf-cover-grid">
            <div className="tf-cover-copy">
              <p className="eyebrow">Accounting &amp; Finance Search · South Africa</p>
              <h1 id="finance-heading">
                We don’t wait for the right finance professionals to apply.{' '}
                <em>We go and find them.</em>
              </h1>
              <p className="tf-lead">
                Talent Tree is a specialist search and recruitment business with deep roots in the
                South African accounting and finance market. For specialist and business-critical
                finance appointments we take a proactive search approach — researching the market,
                mapping the talent pool and approaching suitable professionals directly.
              </p>

              <div className="tf-cover-actions">
                <a className="tf-button tf-button-light" href={mailto('Finance search brief — Talent Tree')}>
                  <span>Brief a finance search</span>
                  <Arrow />
                </a>
                <a className="tf-button tf-button-ghost" href="#track-record">
                  <span>See the track record</span>
                  <Arrow />
                </a>
              </div>

              <dl className="tf-cover-facts">
                {coverFacts.map(([term, value, note]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                    <p>{note}</p>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* Named track record, moving. Decorative duplicate is aria-hidden. */}
          <div className="tf-marquee" aria-label="Selected finance recruitment track record">
            <div className="tf-marquee-track">
              {marqueeClients.map((client, index) => (
                <span className="tf-marquee-item" key={`${client.id}-${index}`} aria-hidden={index >= clients.length}>
                  {client.logo ? (
                    <span className={`tf-logo-tile tf-tone-${client.logo.tone}`}>
                      <img src={client.logo.src} alt={client.logo.alt} loading="lazy" decoding="async" />
                    </span>
                  ) : (
                    <span className="tf-logo-tile tf-logo-word">{client.name}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── The difference ────────────────────────────────────────────── */}
        <section className="tf-section tf-paper-soft" id="approach" aria-labelledby="approach-heading">
          <span className="section-numeral" aria-hidden="true">01</span>
          <div className="tf-shell">
            <div className="tf-heading-row">
              <Reveal>
                <div className="section-kicker"><span>01</span> The difference</div>
                <h2 id="approach-heading">
                  Our approach is <em>deliberately different</em> from traditional recruitment.
                </h2>
              </Reveal>
              <Reveal delay={110}>
                <p>
                  We do not build our searches around advertising a vacancy and waiting to see who
                  applies. This gives our clients access to a much broader market — including
                  experienced professionals who are performing well in their current organisations,
                  progressing in their careers and may never have applied for the vacancy themselves.
                </p>
              </Reveal>
            </div>

            <Reveal delay={60}>
              <PoolCompare />
            </Reveal>

            <Reveal className="tf-manifesto" delay={120}>
              <p className="tf-manifesto-label">The objective is simple</p>
              <blockquote>
                <p>
                  Don’t recruit from only the people who happen to be looking. Identify the people the
                  business actually needs — <em>and go and find them.</em>
                </p>
              </blockquote>
            </Reveal>
          </div>
        </section>

        {/* ── Numbers ───────────────────────────────────────────────────── */}
        <section className="tf-stats" aria-label="Talent Tree finance search in numbers">
          <div className="tf-shell tf-stats-grid">
            <Counter value={2010} label="Specialist finance recruitment experience since" plain />
            <Counter value={15} suffix="+" label="Years of change in the SA accounting profession recruited through" />
            <Counter value={5} label="Professional accounting pathways searched across" />
            <Counter value={13} label="Named organisations with finance appointments delivered" />
          </div>
        </section>

        {/* ── Since 2010 ────────────────────────────────────────────────── */}
        <section className="tf-section tf-paper" id="since-2010" aria-labelledby="since-heading">
          <span className="section-numeral" aria-hidden="true">02</span>
          <div className="tf-shell">
            <div className="tf-heading-row">
              <Reveal>
                <div className="section-kicker"><span>02</span> Since 2010</div>
                <h2 id="since-heading">Specialist finance recruitment, <em>since 2010</em>.</h2>
              </Reveal>
              <Reveal delay={110}>
                <p>
                  Our finance recruitment experience dates back to 2010, initially within the
                  niche-skills divisions of some of South Africa’s largest staffing groups and
                  subsequently through Talent Tree. That experience spans more than 15 years of change
                  in the South African accounting profession and finance employment market.
                </p>
              </Reveal>
            </div>

            <Reveal className="tf-timeline" delay={60}>
              <p className="tf-timeline-label">We have recruited through</p>
              <ol className="tf-timeline-list">
                {evolution.map((item, index) => (
                  <li key={item} style={{ '--i': index }}>
                    <span className="tf-timeline-node" aria-hidden="true" />
                    <p>{item}</p>
                  </li>
                ))}
              </ol>
            </Reveal>

            <Reveal className="tf-matters" delay={100}>
              <div className="tf-matters-copy">
                <h3>That history matters.</h3>
                <p>
                  A Financial Manager is not simply a Financial Manager. The right person may come
                  from a CA(SA), AGA(SA), SAIPA, CIMA or ACCA pathway. They may have developed through
                  audit, commercial finance, management accounting, cost accounting, financial control
                  or operational finance.
                </p>
                <p className="tf-matters-punch">
                  Our job is to understand the difference — and determine which background is relevant
                  to the client’s actual environment.
                </p>
              </div>
              <ul className="tf-matters-chips">
                {['Audit', 'Commercial finance', 'Management accounting', 'Cost accounting', 'Financial control', 'Operational finance'].map(
                  (chip, index) => (
                    <li key={chip} style={{ '--i': index }}>{chip}</li>
                  )
                )}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ── Pathways ──────────────────────────────────────────────────── */}
        <section className="tf-section tf-dark" id="pathways" aria-labelledby="pathways-heading">
          <span className="section-numeral" aria-hidden="true">03</span>
          <div className="tf-shell">
            <div className="tf-heading-row">
              <Reveal>
                <div className="section-kicker"><span>03</span> Professional pathways</div>
                <h2 id="pathways-heading">
                  Understanding the <em>South African accounting talent market</em>.
                </h2>
              </Reveal>
              <Reveal delay={110}>
                <p>
                  Talent Tree searches across the major professional accounting pathways represented
                  in the South African market.
                </p>
              </Reveal>
            </div>

            <div className="tf-pathways">
              <div className="tf-pathway-tabs" role="tablist" aria-label="Professional accounting pathways" onKeyDown={onPathwayKeyDown}>
                {pathways.map((item) => {
                  const selected = item.id === activePathway;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      id={`tf-pathway-tab-${item.id}`}
                      aria-selected={selected}
                      aria-controls={`tf-pathway-panel-${item.id}`}
                      tabIndex={selected ? 0 : -1}
                      className={`tf-pathway-tab${selected ? ' is-active' : ''}`}
                      onClick={() => setActivePathway(item.id)}
                    >
                      <span className={`tf-pathway-mark tf-logo-tile tf-tone-${item.logo.tone}`}>
                        <img src={item.logo.src} alt="" loading="lazy" decoding="async" />
                      </span>
                      <span className="tf-pathway-short">{item.short}</span>
                      <span className="tf-pathway-name">{item.name}</span>
                    </button>
                  );
                })}
              </div>

              <div
                className="tf-pathway-panel"
                role="tabpanel"
                id={`tf-pathway-panel-${pathway.id}`}
                aria-labelledby={`tf-pathway-tab-${pathway.id}`}
                key={pathway.id}
                tabIndex={-1}
              >
                <div className="tf-pathway-head">
                  <span className={`tf-pathway-panel-mark tf-logo-tile tf-tone-${pathway.logo.tone}`}>
                    <img src={pathway.logo.src} alt={`${pathway.logo.alt} logo`} loading="lazy" decoding="async" />
                  </span>
                  <div>
                    <p className="tf-pathway-panel-short">{pathway.short}</p>
                    <h3>{pathway.name}</h3>
                  </div>
                </div>
                <p className="tf-pathway-lead">{pathway.lead}</p>
                {pathway.tail && <p className="tf-pathway-tail">{pathway.tail}</p>}
                <p className="tf-pathway-roles-label">{pathway.rolesLabel}</p>
                <ul className="tf-pathway-roles">
                  {pathway.roles.map((role, index) => (
                    <li key={role} style={{ '--i': index }}>{role}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Search method ─────────────────────────────────────────────── */}
        <section className="tf-section tf-paper-soft" id="method" aria-labelledby="method-heading">
          <span className="section-numeral" aria-hidden="true">04</span>
          <div className="tf-shell">
            <div className="tf-heading-row">
              <Reveal>
                <div className="section-kicker"><span>04</span> Our search approach</div>
                <h2 id="method-heading">Six steps from brief to <em>engaged market</em>.</h2>
              </Reveal>
              <Reveal delay={110}>
                <p>
                  The same sequence runs on every specialist and business-critical finance mandate.
                  Select a step to read what happens inside it.
                </p>
              </Reveal>
            </div>

            <div className="tf-stepper">
              <div className="tf-steps" role="tablist" aria-label="Search approach steps" onKeyDown={onStepKeyDown}>
                <span className="tf-steps-rail" aria-hidden="true">
                  <span style={{ transform: `scaleY(${(activeStep + 1) / method.length})` }} />
                </span>
                {method.map((item, index) => {
                  const selected = index === activeStep;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      role="tab"
                      id={`tf-step-tab-${index}`}
                      aria-selected={selected}
                      aria-controls={`tf-step-panel-${index}`}
                      tabIndex={selected ? 0 : -1}
                      className={`tf-step${selected ? ' is-active' : ''}`}
                      onClick={() => setActiveStep(index)}
                    >
                      <span className="tf-step-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="tf-step-title">{item.title}</span>
                    </button>
                  );
                })}
              </div>

              <div
                className="tf-step-panel"
                role="tabpanel"
                id={`tf-step-panel-${activeStep}`}
                aria-labelledby={`tf-step-tab-${activeStep}`}
                key={activeStep}
                tabIndex={-1}
              >
                <p className="tf-step-phase">Step {String(activeStep + 1).padStart(2, '0')} of 06</p>
                <h3>{step.title}</h3>
                <p className="tf-step-lead">{step.lead}</p>
                <p>{step.detail}</p>
                {step.chips && (
                  <ul className="tf-step-chips">
                    {step.chips.map((chip, index) => (
                      <li key={chip} style={{ '--i': index }}>{chip}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Track record ──────────────────────────────────────────────── */}
        <section className="tf-section tf-paper" id="track-record" aria-labelledby="track-heading">
          <span className="section-numeral" aria-hidden="true">05</span>
          <div className="tf-shell">
            <div className="tf-heading-row">
              <Reveal>
                <div className="section-kicker"><span>05</span> Proven finance search experience</div>
                <h2 id="track-heading">Listed groups. Multinationals. <em>Complex finance functions.</em></h2>
              </Reveal>
              <Reveal delay={110}>
                <p>
                  Our finance recruitment track record spans listed groups, multinational
                  organisations, financial services, retail, manufacturing, technology, aviation,
                  logistics and nonprofit organisations.
                </p>
              </Reveal>
            </div>

            <Reveal className="tf-filters" delay={40}>
              {sectors.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`tf-chip${sector === item ? ' is-active' : ''}`}
                  aria-pressed={sector === item}
                  onClick={() => setSector(item)}
                >
                  {item}
                </button>
              ))}
            </Reveal>
            <p className="tf-filter-count" role="status" aria-live="polite">
              Showing {visibleClients.length} of {clients.length} named engagements
            </p>

            <ul className="tf-clients">
              {visibleClients.map((client, index) => {
                const expanded = openClient === client.id;
                return (
                  <Reveal as="li" className="tf-client" key={client.id} delay={index * 60}>
                    <div className="tf-client-mark">
                      {client.logo ? (
                        <>
                          <img src={client.logo.src} alt={`${client.logo.alt} logo`} loading="lazy" decoding="async" />
                          {client.logoSecondary && (
                            <img
                              className="tf-client-mark-second"
                              src={client.logoSecondary.src}
                              alt={`${client.logoSecondary.alt} logo`}
                              loading="lazy"
                              decoding="async"
                            />
                          )}
                        </>
                      ) : (
                        <span className="tf-client-mark-word">{client.name}</span>
                      )}
                    </div>
                    <div className="tf-client-body">
                      <p className="tf-client-sector">{client.sector}</p>
                      <h3>{client.name}</h3>
                      <p className="tf-client-lead">{client.lead}</p>
                      <button
                        type="button"
                        className="tf-client-toggle"
                        aria-expanded={expanded}
                        aria-controls={`tf-client-panel-${client.id}`}
                        onClick={() => setOpenClient(expanded ? null : client.id)}
                      >
                        <span>{expanded ? 'Hide appointments' : 'Appointments included'}</span>
                        <span className="tf-mark" aria-hidden="true" />
                      </button>
                      <div className="tf-client-panel" id={`tf-client-panel-${client.id}`} hidden={!expanded}>
                        <ul>
                          {client.roles.map((role, roleIndex) => (
                            <li key={role} style={{ '--i': roleIndex }}>{role}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ── What we recruit ───────────────────────────────────────────── */}
        <section className="tf-section tf-dark" id="disciplines" aria-labelledby="disciplines-heading">
          <span className="section-numeral" aria-hidden="true">06</span>
          <div className="tf-shell">
            <div className="tf-heading-row">
              <Reveal>
                <div className="section-kicker"><span>06</span> What we recruit</div>
                <h2 id="disciplines-heading">Across the <em>finance career spectrum</em>.</h2>
              </Reveal>
              <Reveal delay={110}>
                <p>
                  Our accounting and finance capability extends across the finance career spectrum,
                  with particular strength in specialist, professionally trained and leadership talent.
                </p>
              </Reveal>
            </div>

            <div className="tf-disciplines">
              {disciplines.map((group, index) => (
                <Reveal className="tf-discipline" key={group.id} delay={index * 70}>
                  <p className="tf-discipline-number">{String(index + 1).padStart(2, '0')}</p>
                  <h3>{group.title}</h3>
                  <ul>
                    {group.roles.map((role, roleIndex) => (
                      <li key={role} style={{ '--i': roleIndex }}>{role}</li>
                    ))}
                  </ul>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Why it matters ────────────────────────────────────────────── */}
        <section className="tf-section tf-paper-soft" id="hidden-market" aria-labelledby="hidden-heading">
          <span className="section-numeral" aria-hidden="true">07</span>
          <div className="tf-shell">
            <div className="tf-heading-row">
              <Reveal>
                <div className="section-kicker"><span>07</span> Why our approach matters</div>
                <h2 id="hidden-heading">
                  Who should we be speaking to, <em>whether they are looking or not?</em>
                </h2>
              </Reveal>
              <Reveal delay={110}>
                <p>
                  There is a fundamental difference between recruiting available candidates and
                  searching the market for the right candidate. Advertising primarily surfaces people
                  who see the vacancy and decide to apply. A proactive search asks a different
                  question — and that changes the size and quality of the potential talent pool.
                </p>
              </Reveal>
            </div>

            <Reveal className="tf-iceberg" delay={60}>
              <div className="tf-iceberg-visual" aria-hidden="true">
                <div className="tf-iceberg-above">
                  <span className="tf-iceberg-tag">Applicants</span>
                  <div className="tf-iceberg-dots">
                    {Array.from({ length: 12 }, (_, index) => (
                      <i key={index} style={{ '--i': index }} />
                    ))}
                  </div>
                </div>
                <div className="tf-iceberg-line"><span>Advertisement waterline</span></div>
                <div className="tf-iceberg-below">
                  <span className="tf-iceberg-tag">The rest of the market</span>
                  <div className="tf-iceberg-dots is-deep">
                    {Array.from({ length: 84 }, (_, index) => (
                      <i key={index} style={{ '--i': index }} />
                    ))}
                  </div>
                </div>
              </div>
              <ul className="tf-iceberg-list">
                {hiddenMarket.map((item, index) => (
                  <li key={item} style={{ '--i': index }}>{item}</li>
                ))}
                <li className="tf-iceberg-punch">
                  Those are precisely the people a search methodology is designed to uncover.
                </li>
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ── More than a CV database ───────────────────────────────────── */}
        <section className="tf-section tf-paper" aria-labelledby="research-heading">
          <span className="section-numeral" aria-hidden="true">08</span>
          <div className="tf-shell">
            <div className="tf-heading-row">
              <Reveal>
                <div className="section-kicker"><span>08</span> More than a CV database</div>
                <h2 id="research-heading">
                  Market knowledge, research, search methodology, technology and{' '}
                  <em>direct human engagement</em>.
                </h2>
              </Reveal>
              <Reveal delay={110}>
                <p>Before we approach anybody, we investigate:</p>
              </Reveal>
            </div>

            <ol className="tf-research">
              {research.map((question, index) => (
                <Reveal as="li" key={question} delay={index * 60}>
                  <span className="tf-research-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <p>{question}</p>
                </Reveal>
              ))}
            </ol>

            <Reveal className="tf-research-close" delay={120}>
              <p className="tf-research-and">And importantly:</p>
              <p className="tf-research-who">Who isn’t?</p>
              <p className="tf-research-tail">We then go after the market.</p>
            </Reveal>
          </div>
        </section>

        {/* ── Contact ───────────────────────────────────────────────────── */}
        <section className="tf-contact" id="contact" aria-labelledby="contact-heading">
          <div className="tf-shell">
            <Reveal>
              <p className="eyebrow">Accounting &amp; Finance Search | South Africa</p>
              <h2 id="contact-heading">
                When the right finance professional isn’t applying for the job,{' '}
                <em>we go and find them.</em>
              </h2>
              <p className="tf-contact-lead">
                Specialist finance recruitment experience since 2010. Proactive search. Market
                mapping. Passive talent. Professional accounting expertise.
              </p>
            </Reveal>

            <Reveal className="tf-contact-card" delay={80}>
              <h3>Brief a finance search</h3>
              <p>
                Tell us the appointment, the reporting environment and the deadline. We will tell you
                where that capability sits and how we would reach it.
              </p>
              <a className="email-link" href={mailto('Finance search brief — Talent Tree')}>{EMAIL}</a>
              <div className="tf-contact-actions">
                <a className="tf-button tf-button-light" href={mailto('Finance search brief — Talent Tree')}>
                  <span>Email us about a finance brief</span>
                  <Arrow />
                </a>
                <button className="tf-button tf-button-ghost" type="button" onClick={() => copyEmail(EMAIL)}>
                  <span>{copied === EMAIL ? 'Address copied' : 'Copy address'}</span>
                </button>
                <button className="tf-button tf-button-ghost" type="button" onClick={() => window.print()}>
                  <span>Print / save as PDF</span>
                </button>
              </div>
            </Reveal>

            <p className="tf-status" role="status" aria-live="polite">
              {copied === 'error'
                ? 'Copying is blocked in this browser — the address is on screen and the email links still work.'
                : copied
                  ? `${copied} copied to your clipboard.`
                  : ''}
            </p>
          </div>
        </section>
      </main>

      <footer className="tf-footer">
        <div className="tf-shell">
          <div className="tf-footer-top">
            <div>
              <a className="logo" href="/" aria-label="Talent Tree home">
                <img src={talentTreeLogo} alt="Talent Tree" width="132" height="108" />
                <span className="brand-lockup" aria-hidden="true">
                  <span className="brand-name">Talent Tree</span>
                  <span className="brand-line">Accounting &amp; Finance Search</span>
                </span>
              </a>
              <p className="tf-footer-line">
                Talent Tree · Accounting &amp; Finance Search | South Africa · Specialist finance
                recruitment experience since 2010
              </p>
            </div>
            <nav className="tf-footer-nav" aria-label="Footer">
              <a href="/">Home</a>
              <a href="/profile">Company profile</a>
              <a href="#track-record">Track record</a>
              <a href={mailto('Finance search enquiry — Talent Tree')}>Contact us</a>
            </nav>
          </div>
          <div className="tf-footer-legal">
            <p>© 2026 Talent Tree Consulting</p>
            <p>
              <a className="email-link" href={mailto('Finance search enquiry — Talent Tree')}>{EMAIL}</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
