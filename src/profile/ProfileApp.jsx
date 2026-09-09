/* Talent Tree — public company profile at /profile.
   An interactive version of the Talent Tree company profile: the same facts the
   marketing site publishes (src/main.jsx), restructured as a chaptered profile a
   client can read, filter and print.

   Content rules followed here (AGENTS.md rule zero — no invented facts):
   - Every company claim below already exists on the public site (src/main.jsx).
   - Client identities stay anonymised by descriptor (docs/talent-tree-growth-strategy.md).
   - Long mandate leads are trimmed for presentation only; no fact is added or
     altered, and the site voice (single spacing, no Oxford comma) is preserved.

   Design: no new colours, no new type. Everything resolves to the tokens in
   src/styles.css (DESIGN.md) — one ink, one paper, one accent. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import './profile.css';

/* ── Constants ──────────────────────────────────────────────────────────── */

const EMAIL = 'hello@talenttree.co.za';
const mailto = (subject, body) =>
  `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;

const chapters = [
  ['who-we-are', 'Who we are'],
  ['numbers', 'In numbers'],
  ['services', 'What we do'],
  ['method', 'How we work'],
  ['mandates', 'Mandates'],
  ['why', 'Why us'],
  ['faq', 'FAQ'],
  ['contact', 'Contact'],
];

const coverFacts = [
  ['Established', '2013'],
  ['Home', 'South Africa'],
  ['Model', 'Headhunting only'],
  ['Focus', 'Niche skills · Executive search'],
];

/* Anonymised trust strip for the cover ticker. Every descriptor is drawn from
   the mandate book below — no names, no new claims. */
const tickerItems = [
  'JSE-listed retail group',
  'Nasdaq-listed payments technology',
  'International automotive manufacturer',
  'Historic financial conglomerate · est. 1845',
  'Dual-listed fintech & IoT group',
  'Open medical scheme · since 1968',
  'Food technology · 110 years of heritage',
  'Heavy industry investment',
];

const stats = [
  { value: 2013, suffix: '', label: 'Established', plain: true },
  { value: 10, suffix: '+', label: 'Years in niche-skills recruitment and executive search' },
  { value: 0, suffix: '', label: 'Job ads placed — every hire is headhunted' },
  { value: 100, suffix: '%', label: 'Driven by our own network and proprietary databases' },
];

const services = [
  {
    title: 'Specialist search',
    summary: 'Direct headhunting for the scarce, in-demand skills your market fights over.',
    detail:
      'We work the brief through our own talent pools and networks — not a job ad. You get a shortlist of people who were not looking, with the context behind why each of them took the call.',
  },
  {
    title: 'Executive search',
    summary: 'Discreet, relationship-led search for leadership and business-critical appointments.',
    detail:
      'Senior mandates are handled personally by specialists with more than ten years in executive search, with the confidentiality that leadership hiring demands on both sides of the table.',
  },
  {
    title: 'Market mapping',
    summary: 'A structured picture of where the talent actually sits before you commit.',
    detail:
      'Availability, competing employers, compensation reality and realistic timelines — mapped up front so the hiring decision is made on evidence rather than assumption.',
  },
  {
    title: 'Selective team builds',
    summary: 'Coordinated hiring when several connected roles have to land together.',
    detail:
      'Roles, sequencing and sourcing are scoped around the business outcome, so a team arrives in the right order instead of as a queue of unrelated vacancies.',
  },
];

const method = [
  [
    'Define the brief',
    'We start with the role, the business need and the decisions the hire has to unlock — not a job spec pasted into a portal.',
    'Week 0',
  ],
  [
    'Map the market',
    'We identify exactly where the relevant talent sits, who holds it and what it will take to move them.',
    'Early',
  ],
  [
    'Headhunt and position',
    'We approach the right people directly, tell your story properly and build genuine interest before a CV ever changes hands.',
    'Core',
  ],
  [
    'Close with confidence',
    'We stay in the detail through offer, resignation and counter-offer, so the person who said yes is the person who starts.',
    'Offer',
  ],
];

/* Mandate book — identical shape to the public site, with a filter facet added.
   Client identities remain anonymised by descriptor. Leads are the public-site
   leads, trimmed for presentation only. */
const mandates = [
  {
    number: '01',
    tier: 'Flagship',
    tag: 'Sole mandate',
    client: 'JSE-listed retail group',
    meta: 'Data & Analytics division',
    lead: 'Sole recruitment partner to the Data & Analytics division. Every analytics, engineering and data-leadership hire in that division runs through us.',
    focus: ['Data', 'Analytics', 'Engineering'],
    sector: 'Retail',
  },
  {
    number: '02',
    tier: 'Flagship',
    tag: 'Preferred partner',
    client: 'International automotive manufacturer',
    meta: 'Preferred niche-skills talent partner',
    lead: 'Called first when the skill is scarce and the deadline is real.',
    focus: ['Niche skills'],
    sector: 'Industrial',
  },
  {
    number: '03',
    tier: 'Flagship',
    tag: 'Dedicated partner',
    client: 'Nasdaq-listed payments technology giant',
    meta: 'Dedicated talent partner, South Africa',
    lead: 'Global engineering standards, hired out of the local market.',
    focus: ['Engineering', 'Payments'],
    sector: 'Technology',
  },
  {
    number: '04',
    tier: 'Mandate book',
    tag: 'Specialist talent partner',
    client: 'Historic JSE-listed financial conglomerate',
    meta: 'Cape Town · Established 1845',
    lead: 'Specialised talent acquisition partner to a historic JSE-listed financial conglomerate established in Cape Town in 1845 — placing niche technical talent into the functions at the centre of the business.',
    focus: ['Actuarial', 'Pricing', 'Underwriting', 'Data Analytics'],
    sector: 'Financial services',
  },
  {
    number: '05',
    tier: 'Mandate book',
    tag: 'Specialist talent partner',
    client: 'Non-profit open medical scheme',
    meta: 'Self-administered · Operating since 1968',
    lead: 'Specialised talent acquisition consultant to one of South Africa’s oldest and most established self-administered, non-profit open medical schemes — elite technical talent across the core risk functions.',
    focus: ['Actuarial', 'Pricing', 'Underwriting', 'Data Analytics'],
    sector: 'Healthcare',
  },
  {
    number: '06',
    tier: 'Mandate book',
    tag: 'Specialist talent partner',
    client: 'Dual-listed global fintech and IoT group',
    meta: 'Dual-listed · Global footprint',
    lead: 'Specialised talent acquisition partner to a dual-listed global fintech and IoT powerhouse — scaling the specialist human capital behind its secure telemetry systems, cloud management suites and global transaction platforms.',
    focus: ['Secure telemetry', 'Cloud management', 'Transaction platforms'],
    sector: 'Technology',
  },
  {
    number: '07',
    tier: 'Mandate book',
    tag: 'Trusted talent partner',
    client: 'Big data, valuation and spatial analytics enterprise',
    meta: 'Established 2005 · South Africa',
    lead: 'Trusted talent acquisition partner to South Africa’s premier big data, valuation and spatial analytics enterprise — elite professionals for the teams behind the country’s most advanced predictive models.',
    focus: ['Data', 'Cloud AI', 'Analytics'],
    sector: 'Technology',
  },
  {
    number: '08',
    tier: 'Mandate book',
    tag: 'Trusted talent partner',
    client: 'Retail and value-based fintech platform',
    meta: 'Over 6,000 stores · Southern Africa',
    lead: 'The recruitment mandate behind Southern Africa’s largest retail and value-focused fintech platform — elite specialists across the teams that keep the transaction infrastructure moving.',
    focus: ['Data', 'Cloud AI', 'Analytics'],
    sector: 'Retail',
  },
  {
    number: '09',
    tier: 'Mandate book',
    tag: 'Trusted partner · Executive search',
    client: 'Group fintech and credit support division',
    meta: 'Division of a JSE-listed retail conglomerate',
    lead: 'Top-tier technical hires for the specialist fintech and credit support division of Southern Africa’s largest retail conglomerate — plus high-profile executive search for the overarching JSE-listed group holding structure.',
    focus: ['Data', 'Cloud AI', 'Analytics', 'Executive search'],
    sector: 'Financial services',
  },
  {
    number: '10',
    tier: 'Mandate book',
    tag: 'Trusted talent partner',
    client: 'Human performance and loyalty technology group',
    meta: 'Founded 1981 · Globally accredited',
    lead: 'Trusted talent acquisition partner to a globally accredited pioneer in human performance technology and corporate loyalty solutions — elite professionals across its IT and Finance teams.',
    focus: ['IT', 'Finance'],
    sector: 'Technology',
  },
  {
    number: '11',
    tier: 'Mandate book',
    tag: 'Trusted talent partner',
    client: 'Group logistics and supply chain division',
    meta: 'Division of a JSE-listed retail conglomerate',
    lead: 'Top-tier specialists for the centralised logistics and supply chain division of Southern Africa’s largest retail conglomerate — pushing its advanced digital supply chain journey forward.',
    focus: ['Transformation'],
    sector: 'Retail',
  },
  {
    number: '12',
    tier: 'Mandate book',
    tag: 'Trusted talent partner',
    client: 'African food ingredient and processing technology group',
    meta: 'Over 110 years of heritage · Multi-brand',
    lead: 'Critical recruitment mandates for a prominent multi-brand African food ingredient and processing technology powerhouse with over 110 years of heritage — elite professionals where technology and the production line meet.',
    focus: ['Data', 'Cloud AI', 'Analytics'],
    sector: 'Industrial',
  },
  {
    number: '13',
    tier: 'Mandate book',
    tag: 'Trusted talent partner',
    client: 'Heavy industry investment vehicle',
    meta: 'Newly incorporated · International backing',
    lead: 'The hiring agenda at a prominent, newly incorporated corporate investment vehicle backed by international technical partners — critical mandates for its finance and management teams as the business is built around the acquisition.',
    focus: ['Finance', 'Management'],
    sector: 'Industrial',
  },
];

const mandateFilters = ['All', 'Flagship', 'Financial services', 'Technology', 'Retail', 'Industrial', 'Healthcare'];

const differentiators = [
  ['01', 'Proprietary databases, built over years', 'We do not rent lists or wait for applications. We have spent years building our own talent databases — and we actively network with them, personally, long before a brief exists.'],
  ['02', 'Headhunting, not advertising', 'Our approach reaches highly recommended, in-demand professionals who typically are not applying to roles — but who are open to the right conversation, from the right person.'],
  ['03', 'Storytellers, not CV-forwarders', 'We build interest, spark curiosity and position your opportunity so it creates real pull. The best candidates do not respond to vacancies; they respond to a story that fits where their career is going.'],
  ['04', 'An extension of your HR team', 'We represent your brand in the market with the same professionalism and discretion you would. Every approach, every conversation, every decline is handled as though it came from you.'],
  ['05', 'Ultra-proactive by design', 'We out-phone the competition. Proactive outreach, relentless follow-through and a bias to pick up the phone is why our mandates close when others stall.'],
];

const testimonials = [
  ['They put people in front of us that we could never have reached ourselves — and every one of them was ready to have the conversation.', 'Head of Data & Analytics', 'JSE-listed retail group'],
  ['Talent Tree represents us in the market the way we would represent ourselves. Discreet, professional and relentlessly proactive.', 'Talent Acquisition Lead', 'Nasdaq-listed payments technology company'],
  ['They understood the skill, the market and the money before we did. The people they placed are still the backbone of the team.', 'Founder', 'Scaling technology startup'],
];

const faqs = [
  ['Why do you not use job ads or bought-in databases?', 'Because the people worth hiring are not answering them. Our model runs on proprietary databases we have built over years and networks we work every day, which is how we reach professionals before they ever start looking.'],
  ['What kind of hiring does Talent Tree focus on?', 'Niche-skills recruitment and executive search — the roles where the skill is scarce, the market is small and getting it wrong is expensive.'],
  ['How do you protect our brand while you are in the market?', 'We work as an extension of your HR team. Approaches are made with the professionalism and discretion you would use yourself, and your opportunity is positioned rather than broadcast.'],
  ['Can we discuss a role before the brief is final?', 'Yes — and it is usually the better starting point. An early conversation clarifies the role, the market reality and what information is still missing.'],
  ['Does Talent Tree work from South Africa?', 'Yes. Established in 2013 and operating from South Africa, working with local and international clients.'],
];

const briefChecklist = [
  ['01', 'The skill', 'The scarce capability you need, in plain terms.'],
  ['02', 'The market', 'Where that capability sits — or where you suspect it does.'],
  ['03', 'The deadline', 'When the hire has to be contributing, not just signed.'],
];

/* ── Small pieces ───────────────────────────────────────────────────────── */

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

const ArrowDown = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v13M6 13l6 6 6-6" />
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

function Counter({ value, suffix, label, plain }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(plain ? value : 0);

  useEffect(() => {
    if (plain) return undefined;
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      setShown(value);
      return undefined;
    }
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.disconnect();
          const duration = 1400;
          const start = performance.now();
          const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setShown(Math.round(value * eased));
            if (progress < 1) frame = requestAnimationFrame(step);
          };
          frame = requestAnimationFrame(step);
        });
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [value, plain]);

  return (
    <div className="tp-stat" ref={ref}>
      <strong>
        {shown}
        {suffix}
      </strong>
      <span>{label}</span>
    </div>
  );
}

/* The normalised section header: kicker column + headline column + lede.
   Keeps one hierarchy, one rhythm and one reading measure across chapters. */
function SectionHead({ index, eyebrow, id, title, lede }) {
  return (
    <div className="tp-section-head">
      <Reveal className="section-kicker"><span>{index}</span> {eyebrow}</Reveal>
      <Reveal delay={80}>
        <h2 id={id}>{title}</h2>
        {lede ? <p className="tp-section-lede">{lede}</p> : null}
      </Reveal>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function ProfileApp() {
  const [activeChapter, setActiveChapter] = useState('who-we-are');
  const [progress, setProgress] = useState(0);
  const [openService, setOpenService] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [mandateFilter, setMandateFilter] = useState('All');
  const [openFaq, setOpenFaq] = useState(0);
  const [copied, setCopied] = useState('');

  /* Page-level SEO for the SPA route: /profile is a public, indexable page. */
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Company Profile — Talent Tree | Niche Skills Recruitment & Executive Search';
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta ? meta.getAttribute('content') : null;
    if (meta) {
      meta.setAttribute(
        'content',
        'The Talent Tree company profile: a South African niche-skills recruitment and executive search firm established in 2013. Headhunting-only model, sole and preferred mandates with JSE- and Nasdaq-listed clients.'
      );
    }
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) meta.setAttribute('content', previousDescription);
    };
  }, []);

  /* Reading progress + chapter scrollspy in one scroll listener. */
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

  const visibleMandates = useMemo(() => {
    if (mandateFilter === 'All') return mandates;
    if (mandateFilter === 'Flagship') return mandates.filter((item) => item.tier === 'Flagship');
    return mandates.filter((item) => item.sector === mandateFilter);
  }, [mandateFilter]);

  const flagshipMandates = useMemo(
    () => visibleMandates.filter((item) => item.tier === 'Flagship'),
    [visibleMandates]
  );
  const bookMandates = useMemo(
    () => visibleMandates.filter((item) => item.tier !== 'Flagship'),
    [visibleMandates]
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

  const goStep = (direction) => {
    setActiveStep((index) => (index + direction + method.length) % method.length);
  };

  return (
    <div className="tp" id="profile-top">
      <a className="skip-link" href="#profile-main">Skip to profile content</a>

      <div className="tp-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>

      <header className="tp-header">
        <div className="tp-header-inner">
          <a className="logo" href="/" aria-label="Talent Tree home">
            <img src={talentTreeLogo} alt="Talent Tree" width="132" height="108" />
            <span className="brand-lockup" aria-hidden="true">
              <span className="brand-name">Talent Tree</span>
              <span className="brand-line">Company profile · 2026</span>
            </span>
          </a>
          <nav className="tp-chapters" aria-label="Profile chapters">
            {chapters.map(([id, label], index) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={activeChapter === id ? 'true' : undefined}
              >
                <span className="tp-chapter-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                {label}
              </a>
            ))}
          </nav>
          <a className="tp-header-cta" href={mailto('Mandate enquiry — Talent Tree profile')}>
            Contact us
          </a>
        </div>
      </header>

      <main id="profile-main">
        {/* ── Cover ─────────────────────────────────────────────────────── */}
        <section className="tp-cover" aria-labelledby="profile-heading">
          <div className="tp-shell">
            <div className="tp-cover-meta">
              <span>Company profile</span>
              <span>Est. 2013</span>
              <span>South Africa</span>
            </div>

            <div className="tp-cover-grid">
              <div className="tp-cover-main">
                <p className="eyebrow">Niche skills · Executive search · South Africa</p>
                <h1 id="profile-heading">
                  <span className="tp-h1-line">Niche skills.</span>
                  <span className="tp-h1-line">Executive search.</span>
                  <span className="tp-h1-line"><em>Headhunted, never advertised.</em></span>
                </h1>
                <p className="tp-lead">
                  Talent Tree is a specialist recruitment and executive search firm, established in South
                  Africa in 2013 and powered by industry specialists with more than ten years in
                  niche-skills hiring. We headhunt the in-demand professionals who never answer job ads —
                  and position your opportunity so the right person takes the call.
                </p>

                <div className="tp-cover-actions">
                  <a className="tp-button tp-button-light" href={mailto('Mandate enquiry — Talent Tree profile')}>
                    <span>Discuss a brief</span>
                    <Arrow />
                  </a>
                  <button className="tp-button tp-button-ghost" type="button" onClick={() => window.print()}>
                    <span>Print / save as PDF</span>
                    <Arrow />
                  </button>
                </div>
                <p className="tp-cover-alt">
                  <a href="#mandates">Read the mandate book <ArrowDown /></a>
                </p>
              </div>

              <nav className="tp-index" aria-label="Profile contents">
                <p className="tp-index-title">Contents</p>
                <ol>
                  {chapters.map(([id, label], index) => (
                    <li key={id}>
                      <a href={`#${id}`} aria-current={activeChapter === id ? 'true' : undefined}>
                        <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                        {label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>

            <dl className="tp-cover-facts">
              {coverFacts.map(([term, value]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="tp-ticker" aria-hidden="true">
            <div className="tp-ticker-track">
              {[0, 1].map((group) => (
                <span className="tp-ticker-group" key={group}>
                  {tickerItems.map((item) => (
                    <span className="tp-ticker-item" key={item}>
                      {item}
                      <span className="tp-ticker-dot">·</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Who we are ────────────────────────────────────────────────── */}
        <section className="tp-section tp-paper-soft" id="who-we-are" aria-labelledby="who-heading">
          <span className="section-numeral" aria-hidden="true">01</span>
          <div className="tp-shell tp-split">
            <Reveal className="tp-split-sticky">
              <div className="section-kicker"><span>01</span> Who we are</div>
              <h2 id="who-heading">Specialists in the markets you are hiring from.</h2>
              <a className="tp-inline-link tp-split-link" href={mailto('Introduction — Talent Tree profile')}>
                Start a conversation with us
              </a>
            </Reveal>
            <Reveal delay={110} className="tp-split-copy">
              <p className="tp-dropcap">
                Talent Tree was built on a simple conviction: the best people are rarely available,
                and never advertised. So we spent years building our own talent databases and
                networking them personally, so that when a brief lands we already know who to call.
              </p>
              <p>
                Clients treat us as an extension of their HR team. Candidates treat us as the people
                who make the next move possible. Both relationships are built the same way — with
                discretion, market knowledge and a phone that never stops.
              </p>
              <blockquote className="tp-quote">
                <p>
                  Specialist talent is not found on a job board. It is found in relationships built
                  long before the role exists.
                </p>
              </blockquote>
            </Reveal>
          </div>
        </section>

        {/* ── Numbers ───────────────────────────────────────────────────── */}
        <section className="tp-stats" id="numbers" aria-label="Talent Tree in numbers">
          <div className="tp-shell">
            <Reveal className="tp-stats-head">
              <span className="tp-stats-kicker"><span aria-hidden="true">02</span> In numbers</span>
            </Reveal>
            <div className="tp-stats-grid">
              {stats.map((stat) => (
                <Counter key={stat.label} {...stat} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Services ──────────────────────────────────────────────────── */}
        <section className="tp-section tp-paper" id="services" aria-labelledby="services-heading">
          <span className="section-numeral" aria-hidden="true">03</span>
          <div className="tp-shell">
            <SectionHead
              index="03"
              eyebrow="What we do"
              id="services-heading"
              title="Four ways we put scarce skills in your business."
              lede="Select a service to see how the mandate runs."
            />

            <div className="tp-services">
              {services.map((service, index) => {
                const expanded = openService === index;
                return (
                  <Reveal delay={index * 60} key={service.title}>
                    <article className={expanded ? 'tp-service is-open' : 'tp-service'}>
                      <button
                        type="button"
                        className="tp-service-toggle"
                        aria-expanded={expanded}
                        aria-controls={`tp-service-${index}`}
                        onClick={() => setOpenService(expanded ? -1 : index)}
                      >
                        <span className="tp-service-number">{String(index + 1).padStart(2, '0')}</span>
                        <span className="tp-service-title">{service.title}</span>
                        <span className="tp-service-summary">{service.summary}</span>
                        <span className="tp-mark" aria-hidden="true" />
                      </button>
                      <div className="tp-service-panel" id={`tp-service-${index}`} hidden={!expanded}>
                        <p>{service.detail}</p>
                        <a
                          className="tp-inline-link"
                          href={mailto(`${service.title} enquiry — Talent Tree profile`)}
                        >
                          Discuss {service.title.toLowerCase()}
                        </a>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Method ────────────────────────────────────────────────────── */}
        <section className="tp-section tp-dark" id="method" aria-labelledby="method-heading">
          <div className="tp-shell">
            <SectionHead
              index="04"
              eyebrow="How a mandate runs"
              id="method-heading"
              title="Brief to signed offer."
              lede="Four stages, one accountable thread. Select a stage — or step through the mandate in order."
            />

            <div className="tp-stepper">
              <div className="tp-steps" role="tablist" aria-label="Mandate stages" onKeyDown={onStepKeyDown}>
                <span className="tp-steps-rail" aria-hidden="true">
                  <span style={{ transform: `scaleX(${(activeStep + 1) / method.length})` }} />
                </span>
                {method.map(([title], index) => (
                  <button
                    key={title}
                    type="button"
                    role="tab"
                    id={`tp-step-tab-${index}`}
                    aria-selected={activeStep === index}
                    aria-controls={`tp-step-panel-${index}`}
                    tabIndex={activeStep === index ? 0 : -1}
                    className={activeStep === index ? 'is-active' : ''}
                    onClick={() => setActiveStep(index)}
                  >
                    <span className="tp-step-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="tp-step-title">{title}</span>
                  </button>
                ))}
              </div>

              {method.map(([title, text, phase], index) => (
                <div
                  key={title}
                  role="tabpanel"
                  id={`tp-step-panel-${index}`}
                  aria-labelledby={`tp-step-tab-${index}`}
                  className="tp-step-panel"
                  hidden={activeStep !== index}
                >
                  <span className="tp-step-phase">{phase}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <div className="tp-step-nav">
                    <button type="button" onClick={() => goStep(-1)}>
                      <span aria-hidden="true">←</span> Previous stage
                    </button>
                    <span aria-hidden="true">{String(index + 1).padStart(2, '0')} / {String(method.length).padStart(2, '0')}</span>
                    <button type="button" onClick={() => goStep(1)}>
                      Next stage <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Mandates ──────────────────────────────────────────────────── */}
        <section className="tp-section tp-paper-soft" id="mandates" aria-labelledby="mandates-heading">
          <span className="section-numeral" aria-hidden="true">05</span>
          <div className="tp-shell">
            <SectionHead
              index="05"
              eyebrow="Who we partner with"
              id="mandates-heading"
              title={<>Sole. Preferred. Dedicated. <em>Earned.</em></>}
              lede="These are not vendor listings. They are the mandates companies hand to one partner. Client names stay confidential; the weight of the work does not. Filter the book by tier or sector."
            />

            <div className="tp-filters" role="group" aria-label="Filter mandates">
              {mandateFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={mandateFilter === filter ? 'tp-chip is-active' : 'tp-chip'}
                  aria-pressed={mandateFilter === filter}
                  onClick={() => setMandateFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>

            <p className="tp-filter-count" role="status">
              Showing {visibleMandates.length} of {mandates.length} mandates
              {mandateFilter !== 'All' ? ` · ${mandateFilter}` : ''}
            </p>

            {flagshipMandates.length > 0 && (
              <div className="tp-flagships">
                {flagshipMandates.map((item, index) => (
                  <article
                    className="tp-flagship"
                    key={item.number}
                    style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  >
                    <span className="tp-flagship-number" aria-hidden="true">{item.number}</span>
                    <div className="tp-flagship-main">
                      <span className="tp-flagship-tag">{item.tag}</span>
                      <h3>{item.client}</h3>
                      <p className="tp-flagship-lead">{item.lead}</p>
                    </div>
                    <p className="tp-flagship-meta">{item.meta}</p>
                  </article>
                ))}
              </div>
            )}

            {bookMandates.length > 0 && (
              <div className="tp-book">
                <div className="tp-book-head" aria-hidden="true">
                  <span>No.</span>
                  <span>Client</span>
                  <span>Standing</span>
                  <span>Focus</span>
                </div>
                {bookMandates.map((item, index) => (
                  <article
                    className="tp-book-row"
                    key={item.number}
                    style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  >
                    <span className="tp-book-number" aria-hidden="true">{item.number}</span>
                    <div className="tp-book-client">
                      <h3>{item.client}</h3>
                      <p className="tp-book-meta">{item.meta}</p>
                      <p className="tp-book-lead">{item.lead}</p>
                    </div>
                    <span className="tp-book-tag">{item.tag}</span>
                    <ul className="tp-book-focus">
                      {item.focus.map((area) => (
                        <li key={area}>{area}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}

            <p className="tp-tail">
              Alongside these mandates: an extensive client book across the SMME market, valued
              blue-chip companies, and scaling startups we grow with from first hire to first hundred.{' '}
              <a className="tp-inline-link" href={mailto('Reference request — Talent Tree profile')}>
                Ask us for references
              </a>
            </p>
          </div>
        </section>

        {/* ── Why us ────────────────────────────────────────────────────── */}
        <section className="tp-section tp-paper" id="why" aria-labelledby="why-heading">
          <span className="section-numeral" aria-hidden="true">06</span>
          <div className="tp-shell">
            <SectionHead
              index="06"
              eyebrow="Why Talent Tree"
              id="why-heading"
              title="A headhunting model, not a job-board model."
              lede="Five reasons our clients stop advertising roles and start briefing us instead."
            />
            <div className="tp-why-list">
              {differentiators.map(([number, title, text], index) => (
                <Reveal delay={index * 50} key={number}>
                  <article className="tp-why">
                    <span className="tp-why-number" aria-hidden="true">{number}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>

            <div className="tp-testimonials">
              {testimonials.map(([quote, person, org], index) => (
                <Reveal delay={index * 70} key={person}>
                  <blockquote className="tp-testimonial">
                    <p>“{quote}”</p>
                    <footer>
                      <strong>{person}</strong>
                      <span>{org}</span>
                    </footer>
                  </blockquote>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <section className="tp-section tp-paper-soft" id="faq" aria-labelledby="faq-heading">
          <span className="section-numeral" aria-hidden="true">07</span>
          <div className="tp-shell tp-faq-grid">
            <Reveal className="tp-faq-sticky">
              <div className="section-kicker"><span>07</span> FAQ</div>
              <h2 id="faq-heading">Straight answers before you brief us.</h2>
              <p className="tp-faq-aside">
                Something not answered here?{' '}
                <a className="tp-inline-link" href={mailto('Question — Talent Tree profile')}>
                  Ask us directly
                </a>
                .
              </p>
            </Reveal>
            <div className="tp-faq-list">
              {faqs.map(([question, answer], index) => {
                const expanded = openFaq === index;
                return (
                  <Reveal delay={index * 50} key={question}>
                    <article className="tp-faq-item">
                      <h3>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={`tp-faq-${index}`}
                          onClick={() => setOpenFaq(expanded ? -1 : index)}
                        >
                          <span>{question}</span>
                          <span className="tp-mark" aria-hidden="true" />
                        </button>
                      </h3>
                      <div className="tp-faq-panel" id={`tp-faq-${index}`} hidden={!expanded}>
                        <p>{answer}</p>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Contact ───────────────────────────────────────────────────── */}
        <section className="tp-contact" id="contact" aria-labelledby="contact-heading">
          <div className="tp-shell">
            <Reveal>
              <p className="eyebrow">Contact us</p>
              <h2 id="contact-heading">Tell us the role nobody can fill.</h2>
              <p className="tp-lead">
                Share the skill, the market and the deadline. We will tell you honestly whether we can
                reach the people you need — and exactly what it will cost.
              </p>
            </Reveal>

            <div className="tp-contact-grid">
              <Reveal className="tp-contact-card" delay={60}>
                <h3>Hiring a specialist or an executive</h3>
                <p>Briefs, mandates and market mapping requests.</p>
                <a className="email-link" href={mailto('Mandate enquiry — Talent Tree profile')}>
                  {EMAIL}
                </a>
                <div className="tp-contact-actions">
                  <a className="tp-button tp-button-light" href={mailto('Mandate enquiry — Talent Tree profile')}>
                    <span>Email us about a brief</span>
                    <Arrow />
                  </a>
                  <button className="tp-button tp-button-ghost" type="button" onClick={() => copyEmail(EMAIL)}>
                    <span>{copied === EMAIL ? 'Address copied' : 'Copy address'}</span>
                  </button>
                </div>
              </Reveal>

              <Reveal className="tp-brief" delay={120}>
                <h3>What makes a good first brief</h3>
                <ol>
                  {briefChecklist.map(([number, title, text]) => (
                    <li key={number}>
                      <span aria-hidden="true">{number}</span>
                      <div>
                        <strong>{title}</strong>
                        <p>{text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Reveal>
            </div>

            <p className="tp-status" role="status" aria-live="polite">
              {copied === 'error'
                ? 'Copying is blocked in this browser — the address is on screen and the email links still work.'
                : copied
                  ? `${copied} copied to your clipboard.`
                  : ''}
            </p>

            <Reveal className="tp-contact-tail" delay={160}>
              <p>
                Prefer a form? Use the enquiry form on the{' '}
                <a className="tp-inline-link" href="/#contact">main site contact section</a>, or read
                more about{' '}
                <a className="tp-inline-link" href="/#clients">who we partner with</a> and{' '}
                <a className="tp-inline-link" href="/#services">what we do</a>.
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="tp-footer">
        <div className="tp-shell">
          <div className="tp-footer-top">
            <div className="tp-footer-brand">
              <a className="logo" href="/" aria-label="Talent Tree home">
                <img src={talentTreeLogo} alt="Talent Tree" width="132" height="108" />
                <span className="brand-lockup" aria-hidden="true">
                  <span className="brand-name">Talent Tree</span>
                  <span className="brand-line">Niche skills · Executive search</span>
                </span>
              </a>
              <p className="tp-footer-line">
                Talent Tree Consulting · Established 2013 · South Africa · Niche-skills recruitment
                and executive search
              </p>
              <p className="tp-footer-word" aria-hidden="true">Talent Tree</p>
            </div>
            <nav className="tp-footer-nav" aria-label="Profile chapters">
              <p>Profile</p>
              {chapters.map(([id, label]) => (
                <a key={id} href={`#${id}`}>{label}</a>
              ))}
            </nav>
            <nav className="tp-footer-nav" aria-label="Company">
              <p>Company</p>
              <a href="/">Home</a>
              <a href="/#clients">Clients</a>
              <a href="/#services">Services</a>
              <a href="/downloads">Downloads</a>
              <a href={mailto('Mandate enquiry — Talent Tree profile')}>Contact us</a>
            </nav>
          </div>
          <div className="tp-footer-legal">
            <p>© 2026 Talent Tree Consulting</p>
            <p>
              <a className="email-link" href={mailto('Mandate enquiry — Talent Tree profile')}>{EMAIL}</a>
            </p>
            <p><a className="tp-to-top" href="#profile-top">Back to top ↑</a></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
