import React from 'react';
const sectors = [
  'Financial Services',
  'Retail Groups',
  'Technology',
  'Professional Services',
  'Startups & Scale-ups',
  'Remote & Offshore Teams',
];

const strengths = [
  ['01', 'Market judgement', 'We do not sell volume. We build credible shortlists from real market knowledge, relationship depth and direct search.'],
  ['02', 'Specialist focus', 'Talent Tree supports niche hiring where quality matters more than database quantity.'],
  ['03', 'Trusted delivery', 'Established in 2013, with a South African foundation and selective international reach.'],
];

const solutions = [
  ['Specialist Search', 'Direct sourcing for hard-to-find professionals and leadership talent.'],
  ['Market Mapping', 'Structured intelligence on where relevant talent sits and how accessible the market is.'],
  ['Selective Team Builds', 'Practical support when a broader hiring model makes commercial sense.'],
];

export default function MarketingSite() {
  return (
    <div className="site-shell">
      <header className="nav">
        <a href="#top" className="brand" aria-label="Talent Tree home">
          <span className="brand-main">TALENT TREE</span>
          <span className="brand-sub">EST. 2013</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#approach">Approach</a>
          <a href="#solutions">Solutions</a>
          <a href="#why">Why Talent Tree</a>
          <a href="#contact">Contact</a>
          <a href="/cv-builda">CV Builda</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero section">
          <div className="hero-copy">
            <p className="eyebrow">Specialist recruitment · South African roots</p>
            <h1>Specialist recruitment built on reputation.</h1>
            <p className="lead">
              Talent Tree is a focused recruitment partner for businesses that need judgement,
              discretion and credible shortlists, not noisy candidate volume.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#contact">Start the conversation</a>
              <a className="button secondary" href="#solutions">View solutions</a>
            </div>
          </div>
          <aside className="hero-card" aria-label="Talent Tree proof points">
            <p className="card-kicker">Why businesses choose Talent Tree</p>
            <h2>Clear positioning, specialist focus and trusted long-term delivery.</h2>
            <div className="stat-grid">
              <div><strong>2013</strong><span>Established</span></div>
              <div><strong>10+ yrs</strong><span>Trusted SA delivery</span></div>
              <div><strong>Niche</strong><span>Specialist hiring</span></div>
            </div>
          </aside>
        </section>

        <section id="approach" className="section split">
          <div>
            <p className="eyebrow">01 · Approach</p>
            <h2>We start with the role, then the market.</h2>
          </div>
          <div className="panel">
            <p>
              Strong recruitment is not just sending CVs. It is understanding the business need,
              clarifying the hiring trade-offs, finding the right pools of talent, and presenting a
              shortlist with context the client can actually use.
            </p>
          </div>
        </section>

        <section id="solutions" className="section">
          <p className="eyebrow">02 · Solutions</p>
          <h2 className="section-title">Focused hiring support.</h2>
          <div className="cards three">
            {solutions.map(([title, body]) => (
              <article className="card" key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="why" className="section dark-band">
          <p className="eyebrow">03 · Why Talent Tree</p>
          <h2 className="section-title">A boutique partner with practical market feel.</h2>
          <div className="cards three">
            {strengths.map(([number, title, body]) => (
              <article className="card dark-card" key={title}>
                <span className="number">{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <p className="eyebrow">04 · Sectors & Reach</p>
          <h2 className="section-title">Trusted across growth and enterprise hiring.</h2>
          <div className="sector-grid">
            {sectors.map((sector) => <div className="sector" key={sector}>{sector}</div>)}
          </div>
        </section>

        <section id="contact" className="section contact">
          <div>
            <p className="eyebrow">05 · Contact</p>
            <h2>A credible first conversation.</h2>
            <p className="lead small">
              Share the role, market challenge or hiring objective. We will respond honestly if it
              fits our focus, and directly if it does not.
            </p>
          </div>
          <div className="contact-card">
            <a href="mailto:hello@talenttree.co.za">hello@talenttree.co.za</a>
            <span>Cape Town · Johannesburg · South Africa</span>
          </div>
        </section>
      </main>

      <footer>
        <span>© 2013 — 2026 Talent Tree Consulting</span>
        <span>Judgement · Discretion · Delivery</span>
      </footer>
    </div>
  );
}

