import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/fraunces/latin-400.css';
import '@fontsource/fraunces/latin-400-italic.css';
import '@fontsource/fraunces/latin-500.css';
import talentTreeLogo from '../Talent Tree Logo 2026 (1).png';
import './styles.css';
import './landing.css';
import { Arrow, CTA, Icon } from './landing/Primitives.jsx';
import { LandingHeader, ExecutiveHero, ValueMetrics, PartnerBento, CapabilitiesSwitcher, CorePillars, DirectContact, LandingFooter } from './landing/ExecutiveSections.jsx';

/* Route-level pages are loaded on demand so a candidate opening a secure offer
   link never downloads the marketing site or the internal CV/specs tooling.
   The heavy CV/specs libraries (docx, pdfjs, xlsx) stay out of every other page. */
const CvBuilda = lazy(() => import('./cv-builda/CvBuilda.jsx'));
const SpecsApp = lazy(() => import('./specs/SpecsApp.jsx'));
const OfferApp = lazy(() => import('./offers/OfferApp.jsx'));
const AdminApp = lazy(() => import('./offers/AdminApp.jsx'));
const ProfileApp = lazy(() => import('./profile/ProfileApp.jsx'));
const FinanceApp = lazy(() => import('./profile/finance/FinanceApp.jsx'));
const DownloadsApp = lazy(() => import('./downloads/DownloadsApp.jsx'));

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--paper)',
        color: 'var(--ink-deep)',
        fontFamily: 'var(--sans)',
      }}
    >
      <p style={{ margin: 0 }}>Loading…</p>
    </div>
  );
}

const withFallback = (element) => <Suspense fallback={<RouteFallback />}>{element}</Suspense>;

const flagships = [
  {
    number: '01',
    client: 'JSE-listed retail group',
    mandate: 'Sole recruitment partner to the Data & Analytics division',
    tag: 'Sole mandate',
    note: 'Every analytics, engineering and data-leadership hire in that division runs through us.',
  },
  {
    number: '02',
    client: 'International automotive manufacturer',
    mandate: 'Preferred niche-skills talent partner',
    tag: 'Preferred partner',
    note: 'Called first when the skill is scarce and the deadline is real.',
  },
  {
    number: '03',
    client: 'Nasdaq-listed payments technology giant',
    mandate: 'Dedicated talent partner, South Africa',
    tag: 'Dedicated partner',
    note: 'Global engineering standards, hired out of the local market.',
  },
];

/* The wider mandate book. Client identities stay anonymised by descriptor, in line with
   the rest of the site and docs/talent-tree-growth-strategy.md ("keep identities anonymous
   until clients approve attribution"). Sector, heritage and volume claims below are supplied
   by Talent Tree from its own mandates and need client sign-off before publication.
   Entry shape is deliberately identical for every card: number / tag / client / meta /
   lead / focus / note — so wording, emphasis and colour stay uniform across the section. */
const mandateBook = [
  {
    number: '04',
    tag: 'Specialist talent partner',
    client: 'Historic JSE-listed financial conglomerate',
    meta: 'Cape Town · Established 1845',
    lead: 'Retained as the specialised talent acquisition partner to a historic, JSE-listed financial conglomerate established in Cape Town in 1845. We lead high-impact recruitment mandates that place niche technical talent into the functions at the centre of the business.',
    focus: ['Actuarial', 'Pricing', 'Underwriting', 'Data Analytics'],
    note: 'Capability built for Africa’s oldest and most iconic premier financial services group.',
  },
  {
    number: '05',
    tag: 'Specialist talent partner',
    client: 'Non-profit open medical scheme',
    meta: 'Self-administered · Operating since 1968',
    lead: 'We partner with one of South Africa’s oldest and most established self-administered, non-profit open medical schemes as its specialised talent acquisition consultant, leading high-impact mandates that place elite technical talent across the core risk functions.',
    focus: ['Actuarial', 'Pricing', 'Underwriting', 'Data Analytics'],
    note: 'Risk and sustainability frameworks shaped for a scheme covering over 250,000 lives.',
  },
  {
    number: '06',
    tag: 'Specialist talent partner',
    client: 'Dual-listed global fintech and IoT group',
    meta: 'Dual-listed · Global footprint',
    lead: 'Embedded as the specialised talent acquisition partner to a dual-listed global fintech and IoT powerhouse. Our mandates scale the specialist human capital driving its secure telemetry systems, cloud management suites and global transaction platforms.',
    focus: ['Secure telemetry', 'Cloud management', 'Transaction platforms'],
    note: 'The group famously known for dominating the unattended retail and cashless payment sector since 2005.',
  },
  {
    number: '07',
    tag: 'Trusted talent partner',
    client: 'Big data, valuation and spatial analytics enterprise',
    meta: 'Established 2005 · South Africa',
    lead: 'Serving as trusted talent acquisition partner to South Africa’s premier big data, valuation and spatial analytics enterprise. We lead high-impact recruitment mandates that source elite professionals for the teams behind the country’s most advanced predictive models.',
    focus: ['Data', 'Cloud AI', 'Analytics'],
    note: 'Modelling that drives decisions across the property, automotive and business intelligence sectors.',
  },
  {
    number: '08',
    tag: 'Trusted talent partner',
    client: 'Retail and value-based fintech platform',
    meta: 'Over 6,000 stores · Southern Africa',
    lead: 'The recruitment mandate behind Southern Africa’s largest retail and value-focused fintech platform. We place elite specialists across the teams that keep the transaction infrastructure moving.',
    focus: ['Data', 'Cloud AI', 'Analytics'],
    note: 'Infrastructure carrying more than 2 billion consumer transactions every year.',
  },
  {
    number: '09',
    tag: 'Trusted partner · Executive search',
    client: 'Group fintech and credit support division',
    meta: 'Division of a JSE-listed retail conglomerate',
    lead: 'Trusted by the highly specialised fintech and credit support division of Southern Africa’s largest retail conglomerate for top-tier technical hires. The same standing carries upward: high-profile executive search mandates for the overarching JSE-listed group holding structure.',
    focus: ['Data', 'Cloud AI', 'Analytics', 'Executive search'],
    note: 'Centralised tech systems, transactional scoring models and strategic data infrastructure behind two of the country’s most prominent consumer lending and retail store card brands — plus future-ready C-suite appointments.',
  },
  {
    number: '10',
    tag: 'Trusted talent partner',
    client: 'Human performance and loyalty technology group',
    meta: 'Founded 1981 · Globally accredited',
    lead: 'Working as the trusted talent acquisition partner to a globally accredited pioneer in human performance technology and corporate loyalty solutions, we place elite professionals across its IT and Finance teams.',
    focus: ['IT', 'Finance'],
    note: 'Proprietary platforms processing over 20 million behavioural and reward transactions every single day.',
  },
  {
    number: '11',
    tag: 'Trusted talent partner',
    client: 'Group logistics and supply chain division',
    meta: 'Division of a JSE-listed retail conglomerate',
    lead: 'Assigned to the centralised logistics and supply chain division of Southern Africa’s largest retail conglomerate, we source top-tier specialists who push its advanced digital supply chain journey forward.',
    focus: ['Transformation'],
    note: 'Predictive distribution centre operations and proprietary network optimisation algorithms.',
  },
  {
    number: '12',
    tag: 'Trusted talent partner',
    client: 'African food ingredient and processing technology group',
    meta: 'Over 110 years of heritage · Multi-brand',
    lead: 'Critical recruitment mandates for a prominent, multi-brand African food ingredient and processing technology powerhouse with over 110 years of heritage. We place elite professionals where the technology and the production line meet.',
    focus: ['Data', 'Cloud AI', 'Analytics'],
    note: 'Tech architecture behind advanced food manufacturing facilities, smart logistics grids and modern Centres of Excellence.',
  },
  {
    number: '13',
    tag: 'Trusted talent partner',
    client: 'Heavy industry investment vehicle',
    meta: 'Newly incorporated · International backing',
    lead: 'Tasked with the hiring agenda at a prominent, newly incorporated corporate investment vehicle backed by international technical partners. We lead critical mandates for its finance and management teams as the business is built around the acquisition.',
    focus: ['Finance', 'Management'],
    note: 'Supporting a historic JSE-announced R215 million carve-out — nine quarry and ready-mix concrete plants acquired from a major listed mining group to build a newly independent heavy industry giant.',
  },
];

const stats = [
  { value: 2013, suffix: '', label: 'Established' },
  { value: 10, suffix: '+', label: 'Years in niche-skills recruitment and executive search' },
  { value: 0, suffix: '', label: 'Job ads placed — every hire is headhunted' },
  { value: 100, suffix: '%', label: 'Driven by our own network and proprietary databases' },
];

const services = [
  {
    title: 'Specialist search',
    summary: 'Direct headhunting for the scarce, in-demand skills your market fights over.',
    detail: 'We work the brief through our own talent pools and networks — not a job ad. You get a shortlist of people who were not looking, with the context behind why each of them took the call.',
  },
  {
    title: 'Executive search',
    summary: 'Discreet, relationship-led search for leadership and business-critical appointments.',
    detail: 'Senior mandates are handled personally by specialists with more than ten years in executive search, with the confidentiality that leadership hiring demands on both sides of the table.',
  },
  {
    title: 'Market mapping',
    summary: 'A structured picture of where the talent actually sits before you commit.',
    detail: 'Availability, competing employers, compensation reality and realistic timelines — mapped up front so the hiring decision is made on evidence rather than assumption.',
  },
  {
    title: 'Selective team builds',
    summary: 'Coordinated hiring when several connected roles have to land together.',
    detail: 'Roles, sequencing and sourcing are scoped around the business outcome, so a team arrives in the right order instead of as a queue of unrelated vacancies.',
  },
];

const differentiators = [
  ['01', 'Proprietary databases, built over years', 'We do not rent lists or wait for applications. We have spent years building our own talent databases — and we actively network with them, personally, long before a brief exists.'],
  ['02', 'Headhunting, not advertising', 'Our approach reaches highly recommended, in-demand professionals who typically are not applying to roles — but who are open to the right conversation, from the right person.'],
  ['03', 'Storytellers, not CV-forwarders', 'We build interest, spark curiosity and position your opportunity so it creates real pull. The best candidates do not respond to vacancies; they respond to a story that fits where their career is going.'],
  ['04', 'An extension of your HR team', 'We represent your brand in the market with the same professionalism and discretion you would. Every approach, every conversation, every decline is handled as though it came from you.'],
  ['05', 'Ultra-proactive by design', 'We out-phone the competition. Proactive outreach, relentless follow-through and a bias to pick up the phone is why our mandates close when others stall.'],
  ['06', 'Cost-effective on mission-critical talent', 'Our model is deliberately cost-effective while delivering the mission-critical people traditional methods miss entirely.'],
];

const approach = [
  ['01', 'Define the brief', 'We start with the role, the business need and the decisions the hire has to unlock — not a job spec pasted into a portal.'],
  ['02', 'Map the market', 'We identify exactly where the relevant talent sits, who holds it and what it will take to move them.'],
  ['03', 'Headhunt and position', 'We approach the right people directly, tell your story properly and build genuine interest before a CV ever changes hands.'],
  ['04', 'Close with confidence', 'We stay in the detail through offer, resignation and counter-offer, so the person who said yes is the person who starts.'],
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

const marqueeItems = [
  'JSE-listed retail',
  'Nasdaq-listed payments',
  'International automotive',
  'Blue-chip enterprise',
  'Scaling startups',
  'SMME market',
];

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
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

function Logo() {
  return (
    <a href="#top" className="logo" aria-label="Talent Tree home">
      <img src={talentTreeLogo} alt="Talent Tree" width="132" height="108" />
      <span className="brand-lockup" aria-hidden="true">
        <span className="brand-name">Talent Tree</span>
        <span className="brand-line">Executive Search</span>
      </span>
    </a>
  );
}

function FAQItem({ item, index, openFaq, setOpenFaq }) {
  const expanded = openFaq === index;
  const panelId = `faq-panel-${index}`;
  return (
    <article className={expanded ? 'faq-item is-active' : 'faq-item'}>
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setOpenFaq(expanded ? -1 : index)}
        >
          <span>{item[0]}</span>
          <span className="toggle-mark" aria-hidden="true" />
        </button>
      </h3>
      <div id={panelId} className="faq-panel" hidden={!expanded}>
        <p>{item[1]}</p>
      </div>
    </article>
  );
}

function App() {
  const [activeStep, setActiveStep] = useState(0);
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);
  const [mandatesOpen, setMandatesOpen] = useState(false);

  const exploreMandate = (id) => {
    setMandatesOpen(true);
    requestAnimationFrame(() => {
      const card = document.getElementById(id);
      if (!card) return;
      card.scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth', block: 'start' });
      card.focus({ preventScroll: true });
    });
  };

  return (
    <div className="app executive" id="top">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <LandingHeader logo={<Logo />} />
      <main id="main-content">
        <ExecutiveHero />
        <ValueMetrics stats={stats} />
        <PartnerBento onExplore={exploreMandate} />
        <section className="section clients" id="mandate-book" aria-labelledby="clients-heading">
          <span className="section-numeral" aria-hidden="true">01</span>
          <div className="ex-shell">
            <details
              className="ex-mandate-disclosure"
              open={mandatesOpen}
              onToggle={(event) => setMandatesOpen(event.currentTarget.open)}
            >
              <summary>
                <span>Explore the full mandate book</span>
                <span>{flagships.length + mandateBook.length} mandates <span className="toggle-mark" aria-hidden="true" /></span>
              </summary>
              <div className="ex-ledger-content">
                <div className="section-heading-row">
                  <Reveal className="section-kicker"><span>01</span> Who we partner with</Reveal>
                  <Reveal delay={80}>
                    <h2 id="clients-heading">Sole. Preferred. Dedicated. <em>Earned.</em></h2>
                    <p>These are not vendor listings. They are the mandates companies hand to one partner — and they take years of delivery to win and a standard to keep.</p>
                  </Reveal>
                </div>

                <div className="flagship-list">
                  {flagships.map((item, index) => (
                    <Reveal delay={index * 90} key={item.client}>
                      <article className="flagship">
                        <div className="flagship-head">
                          <span className="flagship-number" aria-hidden="true">{item.number}</span>
                          <span className="flagship-tag">{item.tag}</span>
                        </div>
                        <h3>{item.client}</h3>
                        <p className="flagship-mandate">{item.mandate}</p>
                        <p className="flagship-note">{item.note}</p>
                      </article>
                    </Reveal>
                  ))}
                </div>

                <div className="mandate-book">
                  <Reveal className="mandate-book-head">
                    <h3>The wider mandate book.</h3>
                    <p>The specialist and executive search mandates we run across financial services, health, fintech, data, logistics, food manufacturing and heavy industry. Client names stay confidential; the weight of the work does not.</p>
                  </Reveal>

                  <div className="mandate-grid">
                    {mandateBook.map((item, index) => (
                      <Reveal delay={index * 60} key={item.number}>
                        <article className="mandate" id={`client-mandate-${item.number}`} tabIndex={-1}>
                          <div className="mandate-head">
                            <span className="mandate-number" aria-hidden="true">{item.number}</span>
                            <span className="mandate-tag">{item.tag}</span>
                          </div>
                          <h3>{item.client}</h3>
                          <p className="mandate-meta">{item.meta}</p>
                          <p className="mandate-lead">{item.lead}</p>
                          <ul className="mandate-focus">
                            {item.focus.map((area) => (
                              <li key={area}>{area}</li>
                            ))}
                          </ul>
                          <p className="mandate-note">{item.note}</p>
                        </article>
                      </Reveal>
                    ))}
                  </div>
                </div>

                <Reveal className="clients-tail" delay={120}>
                  <p>Alongside these mandates: an extensive client book across the SMME market, valued blue-chip companies, and scaling startups we grow with from first hire to first hundred.</p>
                </Reveal>
              </div>
            </details>
            <div className="ex-market-list" aria-label="Markets we work with">{marqueeItems.map((item) => <span key={item}>{item}</span>)}</div>
          </div>
        </section>

        <CapabilitiesSwitcher services={services} />

        <section className="section approach" id="approach" aria-labelledby="approach-heading">
          <span className="section-numeral" aria-hidden="true">04</span>
          <div className="ex-shell">
            <div className="section-heading-row compact">
              <Reveal className="section-kicker"><span>04</span> How a mandate runs</Reveal>
              <Reveal delay={80}><h2 id="approach-heading">Brief to signed offer.</h2></Reveal>
            </div>
            <div className="method-layout">
              <ol className="approach-list">
                {approach.map(([number, title], index) => (
                  <li key={number}>
                    <button
                      type="button"
                      id={`method-step-${index}`}
                      className={activeStep === index ? 'method-step is-active' : 'method-step'}
                      aria-pressed={activeStep === index}
                      aria-controls={`method-panel-${index}`}
                      onClick={() => setActiveStep(index)}
                    >
                      <span className="step-number">{number}</span>
                      <span><small>How a mandate runs</small><strong>{title}</strong></span>
                      <Arrow />
                    </button>
                  </li>
                ))}
              </ol>
              <div className="method-detail">
                {approach.map(([number, title, text], index) => (
                  <div
                    id={`method-panel-${index}`}
                    key={number}
                    role="region"
                    aria-labelledby={`method-step-${index}`}
                    hidden={activeStep !== index}
                  >
                    <span className="method-detail-number" aria-hidden="true">{number}</span>
                    <p className="eyebrow">Brief to signed offer.</p>
                    <h3>{title}</h3>
                    <p>{text}</p>
                    <div className="method-progress" aria-label={`Step ${index + 1} of ${approach.length}`}>
                      {approach.map(([step]) => (
                        <span className={Number(step) <= index + 1 ? 'is-complete' : ''} key={step} />
                      ))}
                    </div>
                    <CTA>Discuss a brief</CTA>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <CorePillars differentiators={differentiators} />

        <section className="section candidates" id="candidates" aria-labelledby="candidates-heading">
          <span className="section-numeral" aria-hidden="true">05</span>
          <div className="ex-shell candidates-grid">
            <Reveal>
              <div className="section-kicker"><span>05</span> For candidates</div>
              <h2 id="candidates-heading">Best of breed people deserve a specialist.</h2>
            </Reveal>
            <Reveal delay={110}>
              <p>The professionals we place are not job hunting. They are building careers — and they rely on us as subject-matter experts and true industry specialists to know which move is the right one, and when.</p>
              <p>We know your market, the companies worth your time and the ones that are not. Every conversation is confidential, and nothing moves without your say-so.</p>
              <CTA href="mailto:hello@talenttree.co.za" quiet>Start a confidential conversation</CTA>
            </Reveal>
          </div>
        </section>

        <section className="section about" id="about" aria-labelledby="about-heading">
          <span className="section-numeral" aria-hidden="true">06</span>
          <div className="ex-shell about-grid">
            <Reveal className="about-facts" aria-label="Talent Tree facts">
              <div className="fact-row">
                <span>Established</span>
                <strong>2013</strong>
              </div>
              <div className="fact-row">
                <span>Operating from</span>
                <strong>South Africa</strong>
              </div>
              <p>Our brand is powered by industry specialists with more than ten years of experience in niche-skills recruitment and executive search.</p>
            </Reveal>
            <Reveal className="about-copy" delay={120}>
              <div className="section-kicker"><span>06</span> About</div>
              <p className="ex-about-position">Your next hire is already working somewhere else.</p>
              <h2 id="about-heading">Specialists in the markets you are hiring from.</h2>
              <p>Talent Tree is a specialist recruitment and executive search firm, established in South Africa in 2013 and powered by industry specialists with more than ten years in niche-skills hiring.</p>
              <p>Talent Tree was built on a simple conviction: the best people are rarely available, and never advertised. So we spent years building our own talent databases and networking them personally, so that when a brief lands we already know who to call.</p>
              <p>Clients treat us as an extension of their HR team. Candidates treat us as the people who make the next move possible. Both relationships are built the same way — with discretion, market knowledge and a phone that never stops.</p>
              <blockquote className="pull-quote">
                <p>Specialist talent is not found on a job board. It is found in relationships built long before the role exists.</p>
              </blockquote>
              <CTA href="#contact" quiet>Start a conversation</CTA>
            </Reveal>
          </div>
        </section>

        {/* Quotes written in-house and signed off by Talent Tree for publication. */}
        <section className="section testimonials" id="testimonials" aria-labelledby="testimonials-heading">
          <span className="section-numeral" aria-hidden="true">07</span>
          <div className="ex-shell">
            <div className="section-heading-row compact">
              <Reveal className="section-kicker"><span>07</span> What partners say</Reveal>
              <Reveal delay={80}><h2 id="testimonials-heading">Trusted quietly. Repeatedly.</h2></Reveal>
            </div>
            <div className="testimonial-controls">
              <button type="button" aria-label="Previous testimonial" onClick={() => setActiveTestimonial((index) => (index + testimonials.length - 1) % testimonials.length)}>
                <span className="arrow-back"><Arrow /></span>
              </button>
              <button type="button" aria-label="Next testimonial" onClick={() => setActiveTestimonial((index) => (index + 1) % testimonials.length)}>
                <Arrow />
              </button>
            </div>
            <div className="testimonial-list" aria-live="polite" aria-atomic="true">
              {testimonials.map(([quote, person, org], index) => (
                <blockquote className="testimonial" key={person} hidden={index !== activeTestimonial}>
                  <span className="quote-mark" aria-hidden="true">“</span>
                  <p>“{quote}”</p>
                  <footer>
                    <span className="testimonial-avatar" aria-hidden="true">{person.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>
                    <div><strong>{person}</strong><span>{org}</span></div>
                  </footer>
                </blockquote>
              ))}
            </div>
            <div className="testimonial-pagination" aria-label="Choose a testimonial">
              {testimonials.map(([, person], index) => (
                <button
                  type="button"
                  key={person}
                  aria-label={`Show testimonial ${index + 1}`}
                  aria-pressed={index === activeTestimonial}
                  onClick={() => setActiveTestimonial(index)}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="section faq" id="faq" aria-labelledby="faq-heading">
          <span className="section-numeral" aria-hidden="true">08</span>
          <div className="ex-shell faq-grid">
            <Reveal>
              <div className="section-kicker"><span>08</span> FAQ</div>
              <h2 id="faq-heading">Straight answers before you brief us.</h2>
              <a className="faq-contact" href="mailto:hello@talenttree.co.za"><Icon name="mail" /><span><strong>Start a conversation</strong><span>hello@talenttree.co.za</span></span><Arrow /></a>
            </Reveal>
            <div className="faq-list">
              {faqs.map((item, index) => (
                <Reveal delay={index * 70} key={item[0]}>
                  <FAQItem item={item} index={index} openFaq={openFaq} setOpenFaq={setOpenFaq} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <DirectContact />
      </main>
      <LandingFooter logo={<Logo />} />
    </div>
  );
}

/* Path-based routing without a router library.
   Trailing slashes are stripped so /cv-builda and /cv-builda/ are the same page.
   /profile is the public, interactive company profile.
   /profile/finance is the public Accounting & Finance search capability profile.
   /downloads is the public client document library (terms of business PDF).
   /specs is the internal job brief sanitizer.
   /offer/1 is the public offer-page preview.
   /offer/<secure-token> is the confidential employment offer delivery flow.
   /admin/offers is the internal offer-creation tool (server-side key gate). */
function Root() {
  const path = window.location.pathname.replace(/\/+$/, '');
  /* /profiles/... is a common mistyping of the canonical singular /profile/...
     public/_redirects handles it at the edge; this is the in-app safety net for
     client-side navigation, where no server redirect runs. */
  if (path === '/profiles/finance') return withFallback(<FinanceApp />);
  if (path === '/profiles') return withFallback(<ProfileApp />);
  if (path === '/profile/finance') return withFallback(<FinanceApp />);
  if (path === '/profile') return withFallback(<ProfileApp />);
  if (path === '/downloads') return withFallback(<DownloadsApp />);
  if (path === '/cv-builda') return withFallback(<CvBuilda />);
  if (path === '/specs') return withFallback(<SpecsApp />);
  if (path === '/offer/1') return withFallback(<OfferApp token="1" preview />);
  if (path === '/offer' || path.startsWith('/offer/')) {
    const token = path.slice('/offer/'.length);
    return withFallback(<OfferApp token={token} />);
  }
  if (path === '/admin' || path.startsWith('/admin')) {
    return withFallback(<AdminApp />);
  }
  return <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
