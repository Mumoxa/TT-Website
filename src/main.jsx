import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/fraunces/latin-400.css';
import '@fontsource/fraunces/latin-500.css';
import talentTreeLogo from '../Talent Tree Logo 2026 (1).png';
import './styles.css';

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

const services = [
  {
    title: 'Specialist search',
    summary: 'A focused search for specialist or difficult-to-fill roles.',
    detail: 'Start with the brief, define the market to explore and agree the search scope before work begins.',
  },
  {
    title: 'Market mapping',
    summary: 'A structured view of relevant talent before or alongside a search.',
    detail: 'Useful when the role, target market or likely talent pool needs clearer definition before a hiring decision.',
  },
  {
    title: 'Selective team builds',
    summary: 'A coordinated approach when several related hires need to move together.',
    detail: 'The roles, sequencing and sourcing approach are scoped around the hiring need rather than treated as unrelated vacancies.',
  },
];

const approach = [
  ['01', 'Define the brief', 'Start with the role, the business need and the decisions that will shape the search.'],
  ['02', 'Read the market', 'Build a practical view of where relevant talent may sit and what needs to be tested.'],
  ['03', 'Engage carefully', 'Keep communication clear, relevant and respectful of both client and candidate time.'],
  ['04', 'Support the decision', 'Bring the conversation back to fit, trade-offs and what the role actually requires.'],
];

const faqs = [
  ['What kind of hiring does Talent Tree focus on?', 'Talent Tree is positioned as a specialist recruitment consultancy. The right starting point is a conversation about the role and whether the brief fits the service.'],
  ['Can we discuss a role before the brief is final?', 'Yes. An early conversation can be used to clarify the role, the market question and what information is still missing.'],
  ['Does Talent Tree work from South Africa?', 'Yes. Talent Tree was established in 2013 and operates from South Africa.'],
  ['Can this website form send my enquiry now?', 'Not yet. The form currently validates information in the browser only. Production submission still needs a secure backend or CRM integration.'],
];

const marqueeItems = ['Specialist search', 'Market mapping', 'Selective team builds'];

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
      <img src={talentTreeLogo} alt="Talent Tree" />
    </a>
  );
}

function CTA({ children, href = '#contact', quiet = false }) {
  return (
    <a className={`button${quiet ? ' button-quiet' : ''}`} href={href}>
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
          <span className="toggle-mark" aria-hidden="true">{expanded ? '−' : '+'}</span>
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
  const [formStatus, setFormStatus] = useState({ type: 'idle', message: '' });

  const closeMenu = () => setMenuOpen(false);

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
      message: 'Your details are complete. This form is frontend-only and is not connected to a backend or CRM yet. Please email hello@talenttree.co.za to send the enquiry.',
    });
  };

  return (
    <div className="app" id="top">
      <a className="skip-link" href="#main-content">Skip to content</a>

      <header className="site-header">
        <div className="header-inner">
          <Logo />
          <button
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
          <nav id="primary-navigation" className={menuOpen ? 'primary-nav is-open' : 'primary-nav'} aria-label="Primary navigation">
            <a href="#services" onClick={closeMenu}>Services</a>
            <a href="#approach" onClick={closeMenu}>Approach</a>
            <a href="#about" onClick={closeMenu}>About</a>
            <a href="#faq" onClick={closeMenu}>FAQ</a>
            <a className="nav-contact" href="#contact" onClick={closeMenu}>Discuss a brief</a>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="hero" aria-labelledby="hero-heading">
          <div className="shell hero-grid">
            <div>
              <p className="eyebrow">Specialist recruitment · South Africa</p>
              <h1 id="hero-heading">A clearer start to specialist hiring.</h1>
            </div>
            <div className="hero-copy">
              <p>Talent Tree is a South African specialist recruitment consultancy established in 2013.</p>
              <p>The starting point is simple: understand the role, understand the market and have a useful conversation about what comes next.</p>
              <CTA>Discuss a brief</CTA>
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

        <section className="section intro" aria-labelledby="intro-heading">
          <span className="section-numeral" aria-hidden="true">01</span>
          <div className="shell split-layout">
            <Reveal className="section-kicker"><span>01</span> Positioning</Reveal>
            <Reveal delay={90}>
              <h2 id="intro-heading">Clear thinking before candidate volume.</h2>
              <p className="lead">A specialist recruitment conversation should reduce uncertainty, not add more CVs to it.</p>
              <p>Talent Tree keeps the conversation focused on what the role needs, what the market can realistically offer and what should happen next.</p>
            </Reveal>
          </div>
        </section>

        <section className="section services" id="services" aria-labelledby="services-heading">
          <span className="section-numeral" aria-hidden="true">02</span>
          <div className="shell">
            <div className="section-heading-row">
              <Reveal className="section-kicker"><span>02</span> Services</Reveal>
              <Reveal delay={80}>
                <h2 id="services-heading">Choose the conversation you need.</h2>
                <p>Select a service to see what the discussion is intended to cover.</p>
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
                        <span className="toggle-mark" aria-hidden="true">{expanded ? '−' : '+'}</span>
                      </button>
                      <div id={`service-panel-${index}`} className="service-panel" hidden={!expanded}>
                        <p>{service.detail}</p>
                        <CTA href="#contact" quiet>Discuss {service.title.toLowerCase()}</CTA>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section approach" id="approach" aria-labelledby="approach-heading">
          <span className="section-numeral" aria-hidden="true">03</span>
          <div className="shell">
            <div className="section-heading-row compact">
              <Reveal className="section-kicker"><span>03</span> Approach</Reveal>
              <Reveal delay={80}><h2 id="approach-heading">Keep the process understandable.</h2></Reveal>
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

        <section className="section about" id="about" aria-labelledby="about-heading">
          <span className="section-numeral" aria-hidden="true">04</span>
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
              <p>The foundation is straightforward: an established South African recruitment business and a direct route into a specialist hiring conversation.</p>
            </Reveal>
            <Reveal className="about-copy" delay={120}>
              <div className="section-kicker"><span>04</span> About</div>
              <h2 id="about-heading">Established in 2013. Focused on specialist recruitment.</h2>
              <p>Talent Tree is a South African specialist recruitment consultancy established in 2013.</p>
              <p>Clients can explore the available services, understand the approach and start a conversation without unnecessary layers.</p>
              <blockquote className="pull-quote">
                <p>Specialist recruitment should reduce uncertainty — not add more CVs to it.</p>
              </blockquote>
              <CTA href="#contact" quiet>Start a conversation</CTA>
            </Reveal>
          </div>
        </section>

        <section className="section faq" id="faq" aria-labelledby="faq-heading">
          <span className="section-numeral" aria-hidden="true">05</span>
          <div className="shell faq-grid">
            <Reveal>
              <div className="section-kicker"><span>05</span> FAQ</div>
              <h2 id="faq-heading">Useful answers before you enquire.</h2>
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
              <h2 id="contact-heading">Start with the hiring question.</h2>
              <p>Share enough context to make the first conversation useful. No information is sent from this form until a production backend or CRM connection is added.</p>
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
        <div className="shell footer-inner">
          <Logo />
          <p>Talent Tree Consulting · Established 2013 · South Africa</p>
          <a href="mailto:hello@talenttree.co.za">hello@talenttree.co.za</a>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
