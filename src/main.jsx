import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/fraunces/latin-400.css';
import '@fontsource/fraunces/latin-400-italic.css';
import '@fontsource/fraunces/latin-500.css';
import talentTreeLogo from '../Talent Tree Logo 2026 (1).png';
import CvBuilda from './cv-builda/CvBuilda.jsx';
import './styles.css';

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

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

function Counter({ value, suffix, label }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
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
  }, [value]);

  return (
    <div className="stat" ref={ref}>
      <strong>{shown}{suffix}</strong>
      <span>{label}</span>
    </div>
  );
}

function Logo() {
  return (
    <a href="#top" className="logo" aria-label="Talent Tree home">
      <img src={talentTreeLogo} alt="Talent Tree" width="132" height="108" />
      <span className="brand-lockup" aria-hidden="true">
        <span className="brand-name">Talent Tree</span>
        <span className="brand-line">Niche skills · Executive search</span>
      </span>
    </a>
  );
}

function CTA({ children, href = '#contact', quiet = false, small = false }) {
  return (
    <a className={`button${quiet ? ' button-quiet' : ''}${small ? ' button-sm' : ''}`} href={href}>
      <span>{children}</span>
      <Arrow />
    </a>
  );
}

function FAQItem({ item, index, openFaq, setOpenFaq }) {
  const expanded = openFaq === index;
  const panelId = `faq-panel-${index}`;
  return (
    <article className="faq-item">
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeService, setActiveService] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [formStatus, setFormStatus] = useState({ type: 'idle', message: '' });
  const navToggleRef = useRef(null);

  const closeMenu = () => setMenuOpen(false);

  const navSections = ['clients', 'services', 'why', 'about', 'faq'];

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 16);
      const marker = window.innerHeight * 0.38;
      let current = '';
      navSections.forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= marker) current = id;
      });
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll while the mobile drawer is open, and close it cleanly.
  useEffect(() => {
    document.body.classList.toggle('menu-open', menuOpen);
    return () => document.body.classList.remove('menu-open');
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        if (navToggleRef.current) navToggleRef.current.focus({ preventScroll: true });
      }
    };
    const onResize = () => {
      if (window.innerWidth > 1000) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  const submitEnquiry = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const email = String(data.get('email') || '').trim();
    const service = String(data.get('service') || '').trim();
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (name.length < 2 || !emailLooksValid || !service) {
      setFormStatus({
        type: 'error',
        message: 'Please add your name, a valid work email and the service you want to discuss.',
      });
      return;
    }

    setFormStatus({
      type: 'ready',
      message: 'Your details are complete. This form is frontend-only and is not connected to a backend or CRM yet — please email hello@talenttree.co.za and we will come back to you.',
    });
  };

  return (
    <div className="app" id="top">
      <a className="skip-link" href="#main-content">Skip to content</a>

      <header className={`site-header${scrolled ? ' is-scrolled' : ''}${menuOpen ? ' is-open' : ''}`}>
        <div className="header-inner">
          <Logo />
          <nav id="primary-navigation" className={menuOpen ? 'primary-nav is-open' : 'primary-nav'} aria-label="Primary navigation">
            <a href="#clients" onClick={closeMenu} aria-current={activeSection === 'clients' ? 'true' : undefined}>Clients</a>
            <a href="#services" onClick={closeMenu} aria-current={activeSection === 'services' ? 'true' : undefined}>Services</a>
            <a href="#why" onClick={closeMenu} aria-current={activeSection === 'why' ? 'true' : undefined}>Why us</a>
            <a href="#about" onClick={closeMenu} aria-current={activeSection === 'about' ? 'true' : undefined}>About</a>
            <a href="#faq" onClick={closeMenu} aria-current={activeSection === 'faq' ? 'true' : undefined}>FAQ</a>
            <a className="nav-contact" href="#contact" onClick={closeMenu}>Discuss a brief</a>
          </nav>
          <button
            ref={navToggleRef}
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-controls="primary-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>

      <main id="main-content">
        <section className="hero" aria-labelledby="hero-heading">
          <div className="shell hero-grid">
            <div className="hero-intro">
              <p className="eyebrow">Niche skills · Executive search · South Africa</p>
              <h1 id="hero-heading">Your next hire is already <em>working somewhere else.</em></h1>
            </div>
            <div className="hero-row">
              <div className="hero-copy">
                <p className="hero-lead">We headhunt the in-demand professionals who never answer job ads — and position your opportunity so the right person takes the call.</p>
                <p>Talent Tree is a specialist recruitment and executive search firm, established in South Africa in 2013 and powered by industry specialists with more than ten years in niche-skills hiring.</p>
              </div>
              <div className="hero-ctas">
                <CTA>Discuss a brief</CTA>
                <CTA href="#clients" quiet>Who we partner with</CTA>
              </div>
            </div>
          </div>
          <div className="marquee" aria-hidden="true">
            <div className="marquee-track">
              {[0, 1].map((group) => (
                <span className="marquee-group" key={group}>
                  {marqueeItems.map((item) => (
                    <span className="marquee-item" key={item}>
                      {item}
                      <span className="marquee-dot" aria-hidden="true">·</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="section clients" id="clients" aria-labelledby="clients-heading">
          <span className="section-numeral" aria-hidden="true">01</span>
          <div className="shell">
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

            <Reveal className="clients-tail" delay={120}>
              <p>Alongside the flagship mandates: an extensive client book across the SMME market, valued blue-chip companies, and scaling startups we grow with from first hire to first hundred.</p>
            </Reveal>
          </div>
        </section>

        <section className="stats-band" aria-label="Talent Tree in numbers">
          <div className="shell stats-grid">
            {stats.map((stat) => (
              <Counter key={stat.label} value={stat.value} suffix={stat.suffix} label={stat.label} />
            ))}
          </div>
        </section>

        <section className="section services" id="services" aria-labelledby="services-heading">
          <span className="section-numeral" aria-hidden="true">02</span>
          <div className="shell">
            <div className="section-heading-row">
              <Reveal className="section-kicker"><span>02</span> Services</Reveal>
              <Reveal delay={80}>
                <h2 id="services-heading">Four ways we put scarce skills in your business.</h2>
                <p>Select a service to see how the mandate runs.</p>
              </Reveal>
            </div>

            <div className="service-list">
              {services.map((service, index) => {
                const expanded = activeService === index;
                return (
                  <Reveal delay={index * 70} key={service.title}>
                    <article className={expanded ? 'service-row is-active' : 'service-row'}>
                      <button
                        className="service-toggle"
                        type="button"
                        aria-expanded={activeService === index}
                        aria-controls={`service-panel-${index}`}
                        onClick={() => setActiveService(expanded ? -1 : index)}
                      >
                        <span className="service-number">{String(index + 1).padStart(2, '0')}</span>
                        <span className="service-title">{service.title}</span>
                        <span className="service-summary">{service.summary}</span>
                        <span className="toggle-mark" aria-hidden="true" />
                      </button>
                      <div id={`service-panel-${index}`} className="service-panel" hidden={!expanded}>
                        <p>{service.detail}</p>
                        <CTA href="#contact" quiet small>Discuss {service.title.toLowerCase()}</CTA>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section why" id="why" aria-labelledby="why-heading">
          <span className="section-numeral" aria-hidden="true">03</span>
          <div className="shell">
            <div className="section-heading-row">
              <Reveal className="section-kicker"><span>03</span> Why Talent Tree</Reveal>
              <Reveal delay={80}>
                <h2 id="why-heading">A headhunting model, not a job-board model.</h2>
                <p>Six reasons our clients stop advertising roles and start briefing us instead.</p>
              </Reveal>
            </div>
            <div className="why-grid">
              {differentiators.map(([number, title, text], index) => (
                <Reveal delay={index * 60} key={number}>
                  <article className="why-item">
                    <span className="why-number" aria-hidden="true">{number}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section approach" id="approach" aria-labelledby="approach-heading">
          <span className="section-numeral" aria-hidden="true">04</span>
          <div className="shell">
            <div className="section-heading-row compact">
              <Reveal className="section-kicker"><span>04</span> How a mandate runs</Reveal>
              <Reveal delay={80}><h2 id="approach-heading">Brief to signed offer.</h2></Reveal>
            </div>
            <ol className="approach-list">
              {approach.map(([number, title, text], index) => (
                <Reveal as="li" delay={index * 80} key={number}>
                  <span className="step-number">{number}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="section candidates" id="candidates" aria-labelledby="candidates-heading">
          <span className="section-numeral" aria-hidden="true">05</span>
          <div className="shell candidates-grid">
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
          <div className="shell about-grid">
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
              <h2 id="about-heading">Specialists in the markets you are hiring from.</h2>
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
          <div className="shell">
            <div className="section-heading-row compact">
              <Reveal className="section-kicker"><span>07</span> What partners say</Reveal>
              <Reveal delay={80}><h2 id="testimonials-heading">Trusted quietly. Repeatedly.</h2></Reveal>
            </div>
            <div className="testimonial-list">
              {testimonials.map(([quote, person, org], index) => (
                <Reveal delay={index * 90} key={person}>
                  <blockquote className="testimonial">
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

        <section className="section faq" id="faq" aria-labelledby="faq-heading">
          <span className="section-numeral" aria-hidden="true">08</span>
          <div className="shell faq-grid">
            <Reveal>
              <div className="section-kicker"><span>08</span> FAQ</div>
              <h2 id="faq-heading">Straight answers before you brief us.</h2>
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

        <section className="contact" id="contact" aria-labelledby="contact-heading">
          <div className="shell contact-grid">
            <Reveal delay={60}>
              <p className="eyebrow">Contact</p>
              <h2 id="contact-heading">Tell us the role nobody can fill.</h2>
              <p>Share enough context to make the first conversation useful — the skill, the market and the deadline. We will tell you honestly whether we can reach the people you need.</p>
              <a className="email-link" href="mailto:hello@talenttree.co.za">hello@talenttree.co.za</a>
            </Reveal>

            <Reveal as="form" className="enquiry-form" noValidate onSubmit={submitEnquiry} delay={140}>
              <label>
                <span>Your name</span>
                <input name="name" autoComplete="name" required />
              </label>
              <label>
                <span>Work email</span>
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                <span>What would you like to discuss?</span>
                <select name="service" defaultValue="" required>
                  <option value="" disabled>Select a service</option>
                  <option value="Specialist search">Specialist search</option>
                  <option value="Executive search">Executive search</option>
                  <option value="Market mapping">Market mapping</option>
                  <option value="Selective team builds">Selective team builds</option>
                  <option value="Other">Something else</option>
                </select>
              </label>
              <label>
                <span>Brief context <small>Optional</small></span>
                <textarea name="message" rows="4" />
              </label>
              <button className="submit-button" type="submit">
                <span>Check enquiry</span>
                <Arrow />
              </button>
              <p className="form-note">Frontend-only form. Secure backend / CRM wiring is still required for production sending.</p>
              {formStatus.type !== 'idle' && (
                <div
                  className={`form-status ${formStatus.type}`}
                  role={formStatus.type === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                >
                  {formStatus.message}
                </div>
              )}
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell">
          <div className="footer-top">
            <div>
              <Logo />
              <p className="footer-line">Talent Tree Consulting · Established 2013 · South Africa · Niche-skills recruitment and executive search</p>
            </div>
            <div className="footer-email">
              <a className="email-link" href="mailto:hello@talenttree.co.za">hello@talenttree.co.za</a>
            </div>
          </div>
          <div className="footer-legal">
            <p>© 2026 Talent Tree Consulting</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* The site has one other page and does not need a router for it. Trailing
   slashes are stripped so /cv-builda and /cv-builda/ are the same page. */
function Root() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/cv-builda') return <CvBuilda />;
  return <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
