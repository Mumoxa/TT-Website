import { useEffect, useRef, useState } from 'react';
import { Arrow, CTA, Icon } from './Primitives.jsx';

const navigation = [
  ['Capabilities', 'services'],
  ['Track Record', 'clients'],
  ['Why Us', 'why'],
];

export function LandingHeader({ logo }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const toggleRef = useRef(null);

  useEffect(() => {
    const update = () => {
      let current = '';
      for (const id of ['clients', 'services', 'why']) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= 180) current = id;
      }
      setActiveSection(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onResize = () => { if (window.innerWidth >= 900) setMenuOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  return (
    <header className="ex-header">
      <div className="ex-header-frame">
        {logo}
        <nav id="primary-navigation" className={`ex-navigation${menuOpen ? ' is-open' : ''}`} aria-label="Primary navigation">
          {navigation.map(([label, id]) => (
            <a key={id} href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined} onClick={() => setMenuOpen(false)}>{label}</a>
          ))}
          <a className="ex-nav-cta" href="#contact" onClick={() => setMenuOpen(false)}>Brief a Mandate <Arrow /></a>
        </nav>
        <button ref={toggleRef} className="ex-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-controls="primary-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <span /><span />
        </button>
      </div>
    </header>
  );
}

export function ExecutiveHero() {
  return (
    <section className="ex-hero" aria-labelledby="hero-heading">
      <div className="ex-shell">
        <div className="ex-hero-meta"><p className="ex-kicker">Talent Tree Consulting</p><span>Independent thinking. Direct search.</span></div>
        <h1 id="hero-heading">We Don't Post Job Ads.<br />We Headhunt<br className="ex-mobile-break" /> <em>the Unreachable.</em></h1>
        <div className="ex-hero-bottom">
          <div className="ex-hero-copy">
            <p>Executive search and niche technical hiring across actuarial, data, systems and cloud AI.</p>
            <p>We headhunt the in-demand professionals who never answer job ads — and position your opportunity so the right person takes the call.</p>
          </div>
          <div className="ex-hero-actions"><CTA>Brief a Mandate</CTA><CTA href="#approach" quiet>Our Methodology</CTA></div>
        </div>
        <div className="ex-hero-foot"><span>Niche skills · Executive search · South Africa</span><a href="#clients">Explore our track record <Arrow /></a></div>
      </div>
    </section>
  );
}

export function ValueMetrics({ stats }) {
  const metrics = [
    [String(stats[0].value), 'Established in South Africa'],
    [`${stats[3].value}${stats[3].suffix}`, 'Direct Sourcing & Headhunting'],
    [String(stats[2].value), 'Public Job Advertisements'],
  ];
  return (
    <section className="ex-metrics" aria-label="Talent Tree in numbers">
      <div className="ex-shell ex-metrics-grid">
        {metrics.map(([value, label]) => <div className="ex-metric" key={label}><strong>{value}</strong><span>{label}</span></div>)}
      </div>
    </section>
  );
}

const partnerSectors = [
  { title: 'JSE & Global Financial Institutions', description: 'Specialist talent at the centre of the business. Actuarial, pricing and risk mandates built on deep market relationships.', tags: ['Actuarial', 'Pricing', 'Risk'], icon: 'shield', anchor: 'client-mandate-04' },
  { title: 'Dual-Listed FinTech & IoT', description: 'The specialist people behind secure telemetry systems, cloud management suites and global transaction platforms.', tags: ['Telemetry', 'Cloud Infrastructure'], icon: 'network', anchor: 'client-mandate-06' },
  { title: 'Predictive AI & Analytics Hubs', description: 'Elite professionals for the teams behind advanced predictive models, data platforms and cloud AI.', tags: ['Data Science', 'Cloud AI'], icon: 'map', anchor: 'client-mandate-07' },
  { title: 'Niche Executive Mandates', description: 'Discreet, relationship-led search for leadership and business-critical appointments.', tags: ['C-Suite', 'Board Appointments'], icon: 'people', anchor: 'client-mandate-09' },
];

export function PartnerBento({ onExplore }) {
  return (
    <section className="ex-partners" id="clients" aria-labelledby="partners-heading">
      <div className="ex-shell">
        <div className="ex-heading-row"><div><p className="ex-kicker">Track record</p><h2 id="partners-heading">Who we<br /><em>partner with.</em></h2></div><p>Sole. Preferred. Dedicated. Earned. These are the mandates companies hand to one partner — and they take years of delivery to win.</p></div>
        <div className="ex-bento-grid">
          {partnerSectors.map((sector, index) => (
            <article className={`ex-bento-card ex-bento-${index + 1}`} key={sector.title}>
              <div className="ex-bento-top"><span>0{index + 1} / Expertise</span><Icon name={sector.icon} /></div>
              <div className="ex-bento-copy"><h3>{sector.title}</h3><p>{sector.description}</p></div>
              <div className="ex-bento-bottom"><ul>{sector.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul><a href={`#${sector.anchor}`} aria-label={`View mandates: ${sector.title}`} onClick={(event) => { event.preventDefault(); onExplore(sector.anchor); }}><Arrow /></a></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CapabilitiesSwitcher({ services }) {
  const [activeService, setActiveService] = useState(0);
  const tabs = useRef([]);
  const focusAreas = ['Direct headhunting for scarce skills', 'Discreet, relationship-led leadership search', 'Talent intelligence & salary benchmarking', 'Coordinated multi-role deployment'];
  const onKeyDown = (event, index) => {
    let next;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % services.length;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index + services.length - 1) % services.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = services.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setActiveService(next);
    tabs.current[next]?.focus();
  };
  return (
    <section className="ex-capabilities" id="services" aria-labelledby="services-heading">
      <div className="ex-shell">
        <div className="ex-heading-row"><div><p className="ex-kicker">Capabilities</p><h2 id="services-heading">The right search.<br /><em>For the right hire.</em></h2></div><p>Four ways we put scarce skills in your business. Select a capability to see how the mandate runs.</p></div>
        <div className="ex-capability-grid">
          <div className="ex-capability-tabs" role="tablist" aria-label="Search capabilities" aria-orientation="vertical">
            {services.map((service, index) => (
              <button ref={(node) => { tabs.current[index] = node; }} className="service-toggle ex-capability-tab" key={service.title} type="button" role="tab" id={`capability-tab-${index}`} aria-selected={activeService === index} aria-controls={`service-panel-${index}`} tabIndex={activeService === index ? 0 : -1} onClick={() => setActiveService(index)} onKeyDown={(event) => onKeyDown(event, index)}>
                <span>0{index + 1}</span><strong>{service.title}</strong><Arrow />
              </button>
            ))}
          </div>
          <div className="ex-capability-panels">
            {services.map((service, index) => (
              <div className="ex-capability-panel" key={service.title} id={`service-panel-${index}`} role="tabpanel" aria-labelledby={`capability-tab-${index}`} tabIndex={0} hidden={activeService !== index}>
                <div className="ex-capability-panel-top"><span>Capability / 0{index + 1}</span><Icon name={['search', 'people', 'map', 'network'][index]} /></div>
                <h3>{service.title}</h3><p className="ex-capability-focus">{focusAreas[index]}</p><p>{service.summary}</p><p>{service.detail}</p>
                <CTA href="#contact" small>Discuss {service.title.toLowerCase()}</CTA>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CorePillars({ differentiators }) {
  const pillars = [
    ['Proprietary Databases', differentiators[0][2], 'network'],
    ['Storytellers, Not CV-Forwarders', differentiators[2][2], 'people'],
    ['Ultra-Proactive Headhunting', differentiators[4][2], 'search'],
    ['Extension of HR', differentiators[3][2], 'check'],
    ['Cost-Effective Mission-Critical Sourcing', differentiators[5][2], 'map'],
    ['Discretion & Market Depth', `${differentiators[1][2]} Every conversation is confidential, and nothing moves without your say-so.`, 'shield'],
  ];
  return (
    <section className="ex-pillars" id="why" aria-labelledby="why-heading">
      <div className="ex-shell">
        <div className="ex-heading-row"><div><p className="ex-kicker">Why Talent Tree</p><h2 id="why-heading">Six reasons clients<br /><em>stop advertising.</em></h2></div><p>A headhunting model, not a job-board model. Built on relationships, discretion and the conviction that the best people are rarely looking.</p></div>
        <div className="ex-pillar-grid">
          {pillars.map(([title, text, icon], index) => <article className="ex-pillar" key={title}><div className="ex-pillar-top"><Icon name={icon} /><span>0{index + 1}</span></div><h3>{title}</h3><p>{text}</p></article>)}
        </div>
      </div>
    </section>
  );
}

export function DirectContact() {
  return (
    <section className="ex-contact" id="contact" aria-labelledby="contact-heading">
      <div className="ex-shell">
        <div className="ex-contact-top"><p className="ex-kicker">Your next appointment starts here</p><Icon name="mail" /></div>
        <h2 id="contact-heading">Initiate a<br /><em>Confidential Discussion.</em></h2>
        <div className="ex-contact-bottom"><div><h3>Tell us the role nobody can fill.</h3><p>Share enough context to make the first conversation useful — the skill, the market and the deadline. We will tell you honestly whether we can reach the people you need.</p></div><a className="ex-email" href="mailto:hello@talenttree.co.za">hello@talenttree.co.za <Arrow /></a></div>
      </div>
    </section>
  );
}

export function LandingFooter({ logo }) {
  return (
    <footer className="ex-footer">
      <div className="ex-shell">
        <div className="ex-footer-top">{logo}<p>Talent Tree Consulting · Established 2013 · South Africa · Niche-skills recruitment and executive search</p><nav aria-label="Company information"><a href="/profile">Company profile</a><a href="/profile/finance">Finance profile</a><a href="/downloads">Terms of business</a></nav></div>
        <div className="ex-footer-bottom"><p>© 2026 Talent Tree Consulting</p><a href="mailto:hello@talenttree.co.za">hello@talenttree.co.za <Arrow /></a></div>
      </div>
    </footer>
  );
}
