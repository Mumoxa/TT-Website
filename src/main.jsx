import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const Arrow = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
const Check = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;

const services = [
  { num: '01', title: 'Specialist search', text: 'For pivotal roles where the right person is not applying. We map, approach and engage the market with care.' },
  { num: '02', title: 'Market intelligence', text: 'A clear view of talent pools, availability and trade-offs—before you commit time or budget.' },
  { num: '03', title: 'Team build', text: 'A focused, repeatable hiring plan for growing teams that need quality without the chaos.' },
];

const cases = [
  { type: 'Financial services · Confidential', title: 'Finding conviction in a narrow market', challenge: 'A business-critical leadership brief with a highly specific combination of technical and commercial experience.', result: 'A considered search strategy built around fit, discretion and decision-ready context.' },
  { type: 'Technology · Confidential', title: 'Turning growth plans into a hiring roadmap', challenge: 'A scaling team needed to understand its addressable market before starting a multi-role hiring sprint.', result: 'A practical map of talent, priorities and sequencing to move with confidence.' },
  { type: 'Professional services · Confidential', title: 'Replacing volume with judgement', challenge: 'An overstretched internal team needed a credible partner for an exceptional, high-stakes hire.', result: 'A focused shortlist that made a difficult decision simpler, not noisier.' },
];

const faqs = [
  ['When is Talent Tree the right partner?', 'When a role matters, the market is nuanced and you want an experienced point of view—not a broad CV blast. We are candid about whether a brief fits our focus before any work begins.'],
  ['How do you price an engagement?', 'The right commercial model depends on the brief, seniority and level of market work required. We scope the work first and provide a clear, agreed engagement model before launch.'],
  ['Can you help us before we have a final job specification?', 'Yes. Market mapping and an initial consultation can help sharpen the role, compensation expectations and candidate profile before you commit to a search.'],
  ['Do you work with confidential briefs?', 'Yes. Discretion is built into how we qualify a brief, approach the market and communicate with candidates.'],
];

function Logo() { return <a href="#top" className="logo" aria-label="Talent Tree home"><img src="/Talent Tree Logo 2026 (1).png" alt="Talent Tree" /></a>; }
function Button({ children, secondary = false, href = '#contact' }) { return <a className={`button ${secondary ? 'secondary' : ''}`} href={href}>{children}<Arrow /></a>; }
function FAQ({ item, index, open, setOpen }) { return <article className={`faq ${open === index ? 'open' : ''}`}><button onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}><span>{item[0]}</span><b>+</b></button><div className="faq-answer"><p>{item[1]}</p></div></article>; }

function App() {
 const [open, setOpen] = useState(0);
 const [sent, setSent] = useState(false);
 return <div className="app" id="top">
   <header className="header">
    <div className="nav-wrap"><Logo /><nav aria-label="Primary navigation"><a href="#services">Services</a><a href="#approach">Approach</a><a href="#work">Our work</a><a href="#about">About</a></nav><a className="nav-cta" href="#contact">Discuss a brief <span>↗</span></a></div>
   </header>

   <main>
    <section className="hero">
      <div className="orb orb-one" /><div className="orb orb-two" />
      <div className="hero-inner">
       <p className="eyebrow">Specialist recruitment <i /> South Africa & beyond</p>
       <h1>Build the team<br /><em>your future</em> needs.</h1>
       <div className="hero-bottom"><p>Talent Tree brings clarity, market insight and human judgement to the hires that shape what comes next.</p><Button>Start a conversation</Button></div>
      </div>
      <div className="hero-scene" aria-hidden="true"><div className="tree-line tree-a"/><div className="tree-line tree-b"/><div className="tree-line tree-c"/><div className="tree-dot d1"/><div className="tree-dot d2"/><div className="tree-dot d3"/><span>EST. 2013</span></div>
      <div className="scroll-cue"><span>Scroll to explore</span><i /></div>
    </section>

    <section className="intro section" id="approach">
      <div className="section-label"><span>01</span> A better kind of search</div>
      <div className="intro-grid"><h2>Good hiring is not a numbers game. <em>It is a judgement call.</em></h2><div><p className="large-copy">The most valuable people are rarely waiting in your inbox. They are building, leading and making an impact elsewhere.</p><p>We get beyond the obvious to help ambitious businesses reach the talent that changes the trajectory of their teams.</p><a href="#services" className="text-link">See how we work <Arrow /></a></div></div>
    </section>

    <section className="signal-strip"><div><span>REPUTATION LED</span><span>MARKET INFORMED</span><span>HUMAN FIRST</span><span>REPUTATION LED</span><span>MARKET INFORMED</span></div></section>

    <section className="section services" id="services"><div className="section-top"><div className="section-label"><span>02</span> What we solve</div><p>Focused support at the moments when getting the people decision right matters most.</p></div><div className="service-list">{services.map((service) => <article className="service" key={service.num}><div className="service-number">{service.num}</div><h3>{service.title}</h3><p>{service.text}</p><a href="#contact" aria-label={`Discuss ${service.title}`}><Arrow /></a></article>)}</div></section>

    <section className="proof section"><div className="proof-card"><p className="eyebrow">The Talent Tree standard</p><h2>Less noise.<br /><em>More signal.</em></h2><p>Every search starts with the real question behind the vacancy—and ends with people you can picture doing the work.</p><ul><li><Check /> Honest market feedback, early</li><li><Check /> Carefully qualified, relevant introductions</li><li><Check /> A partner who protects your reputation</li></ul><Button secondary>Meet Talent Tree</Button></div><div className="proof-quote"><div className="quote-mark">“</div><blockquote>We believe a great recruitment partner should make a complex choice feel clear.</blockquote><p>That takes research, relationships and the confidence to tell the truth about the market.</p><div className="quote-caption">OUR POINT OF VIEW <span>—</span> TALENT TREE</div></div></section>

    <section className="section work" id="work"><div className="section-top"><div className="section-label"><span>03</span> Selected work</div><p>Confidential searches, thoughtful strategies and the moments that moved a team forward.</p></div><div className="case-grid">{cases.map((c, i) => <article className={`case case-${i + 1}`} key={c.title}><div className="case-visual"><span>{String(i + 1).padStart(2, '0')}</span><div className="visual-shape" /></div><div className="case-copy"><p className="case-type">{c.type}</p><h3>{c.title}</h3><div className="case-detail"><p><b>Challenge</b>{c.challenge}</p><p><b>Strategy & outcome</b>{c.result}</p></div><a className="text-link" href="#contact">Talk through your brief <Arrow /></a></div></article>)}</div></section>

    <section className="section process"><div className="process-intro"><div className="section-label"><span>04</span> Our approach</div><h2>Rigour behind<br />every <em>yes.</em></h2></div><ol>{[['Listen','We get beneath the job description to understand the business case, the culture and what great really looks like.'],['Map','We form a realistic view of the market, surfacing the opportunity and the constraints early.'],['Connect','We make thoughtful, credible approaches that represent your opportunity as carefully as our own.'],['Decide','You meet a concise, well-contextualised shortlist and make a decision with confidence.']].map(([title,text], i)=><li key={title}><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol></section>

    <section className="about section" id="about"><div className="about-image"><div className="about-monogram">T<span>T</span></div><p>ROOTED IN RELATIONSHIPS<br />BUILT FOR WHAT'S NEXT</p></div><div className="about-copy"><div className="section-label"><span>05</span> Why Talent Tree</div><h2>A boutique partner for people decisions with <em>weight.</em></h2><p>Talent Tree was founded on a simple belief: businesses deserve more from recruitment than a transaction. Since 2013, we have brought a more considered, commercially aware approach to specialist hiring.</p><p>Our work is personal by design. You get senior attention, clear communication and a search process that reflects well on your brand.</p><Button secondary>Our story</Button></div></section>

    <section className="section faq-section"><div><div className="section-label"><span>06</span> Common questions</div><h2>Clarity before<br /><em>commitment.</em></h2><p>Good partnerships begin with an open conversation. Here are a few useful places to start.</p></div><div className="faqs">{faqs.map((item,i)=><FAQ key={item[0]} item={item} index={i} open={open} setOpen={setOpen}/>)}</div></section>

    <section className="contact-section" id="contact"><div className="contact-inner"><div><p className="eyebrow">A first conversation</p><h2>Make your next<br />hire <em>matter.</em></h2><p>Tell us what you are building, replacing or trying to solve. If we are the right partner, we will say so. If we are not, we will be honest about that too.</p><div className="contact-details"><a href="mailto:hello@talenttree.co.za">hello@talenttree.co.za</a><span>Cape Town · Johannesburg · South Africa</span></div></div><form onSubmit={(e) => { e.preventDefault(); setSent(true); }}><label>Your name<input required placeholder="Jane Smith" /></label><label>Work email<input required type="email" placeholder="jane@company.com" /></label><label>What can we help with?<select defaultValue=""><option value="" disabled>Select an option</option><option>Specialist search</option><option>Market intelligence</option><option>Team build</option><option>Something else</option></select></label><label>Tell us a little more<textarea rows="3" placeholder="The brief, the challenge, the ambition..." /></label><button className="form-button" type="submit">{sent ? 'Thank you — we’ll be in touch.' : 'Send enquiry'} <Arrow /></button></form></div></section>
   </main>
   <footer><Logo /><span>© 2013 — 2026 Talent Tree Consulting</span><div><a href="#top">LinkedIn</a><a href="#top">Privacy</a></div></footer>
 </div>;
}
createRoot(document.getElementById('root')).render(<App />);
