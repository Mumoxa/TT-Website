/* Talent Tree — internal offer creation (MVP).
   Minimal protected tool at /admin/offers: upload a candidate's offer PDF,
   enter the offer details, copy the secure link, and verify acceptance /
   audit events. Access is gated by the shared ADMIN_KEY (server-side). */

import { useEffect, useMemo, useRef, useState } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import './admin.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatWhen = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

const datetimeLocal = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

const emptyForm = () => {
  const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return {
    candidateName: '',
    candidateEmail: '',
    clientName: '',
    positionTitle: '',
    expiresAt: datetimeLocal(expiry),
    file: null,
  };
};

function Field({ label, children, hint }) {
  return (
    <label className="adm-field">
      <span className="adm-field-label">{label}</span>
      {children}
      {hint && <span className="adm-field-hint">{hint}</span>}
    </label>
  );
}

export default function AdminApp() {
  const [state, setState] = useState('checking'); // checking | login | ready | error
  const [configMessage, setConfigMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authKey, setAuthKey] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [created, setCreated] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);

  const [offers, setOffers] = useState([]);
  const [listError, setListError] = useState('');
  const [eventsFor, setEventsFor] = useState(null); // offer id whose events are open
  const [eventsData, setEventsData] = useState(null);
  const [eventsError, setEventsError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    document.title = 'Offer Delivery — Talent Tree (Internal)';
  }, []);

  const loadOffers = async () => {
    try {
      const res = await fetch('/api/admin/offers');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setListError('Could not load offers.');
        return;
      }
      setOffers(data.offers || []);
      setListError('');
    } catch {
      setListError('Could not load offers.');
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/session');
        if (res.status === 503) {
          setConfigMessage('This deployment has not been given the internal ADMIN_KEY yet.');
          setState('error');
          return;
        }
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.loggedIn) {
          setState('ready');
          loadOffers();
        } else {
          setState('login');
        }
      } catch {
        setState('login');
      }
    })();
  }, []);

  const submitLogin = async (e) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: authKey }),
      });
      if (res.ok) {
        setAuthKey('');
        setState('ready');
        loadOffers();
      } else {
        setAuthError('That access key was not accepted.');
      }
    } catch {
      setAuthError('Could not reach the server. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setCopiedUrl(null);

    const f = form;
    if (!f.candidateName.trim() || !f.candidateEmail.trim() || !f.clientName.trim() || !f.positionTitle.trim()) {
      setFormError('Please complete all fields.');
      return;
    }
    if (!EMAIL_RE.test(f.candidateEmail.trim())) {
      setFormError('Please enter a valid candidate email address.');
      return;
    }
    if (!f.expiresAt) {
      setFormError('Please set an expiry date and time.');
      return;
    }
    if (!f.file) {
      setFormError('Please attach the offer PDF.');
      return;
    }
    if (f.file.type !== 'application/pdf' && !/\.pdf$/i.test(f.file.name)) {
      setFormError('The offer document must be a PDF.');
      return;
    }

    const fd = new FormData();
    fd.append('candidateName', f.candidateName.trim());
    fd.append('candidateEmail', f.candidateEmail.trim());
    fd.append('clientName', f.clientName.trim());
    fd.append('positionTitle', f.positionTitle.trim());
    fd.append('expiresAt', new Date(f.expiresAt).toISOString());
    fd.append('pdf', f.file, f.file.name);

    setFormBusy(true);
    try {
      const res = await fetch('/api/admin/offers', {
        method: 'POST',
        headers: { 'x-tt-offer-admin': '1' },
        body: fd,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setFormError(data && data.message ? data.message : 'The offer could not be created. Please try again.');
        return;
      }
      setCreated(data.offer);
      setForm(emptyForm());
      if (fileRef.current) fileRef.current.value = '';
      loadOffers();
    } catch {
      setFormError('The offer could not be created. Please check your connection and try again.');
    } finally {
      setFormBusy(false);
    }
  };

  const copyOfferLink = async (url) => {
    const full = window.location.origin + url;
    const ok = await copyText(full);
    setCopiedUrl(ok ? url : null);
    if (!ok) setFormError('Copy failed — please select and copy the link manually.');
  };

  const toggleEvents = async (offerId) => {
    if (eventsFor === offerId) {
      setEventsFor(null);
      setEventsData(null);
      return;
    }
    setEventsFor(offerId);
    setEventsData(null);
    setEventsError('');
    try {
      const res = await fetch(`/api/admin/events?offerId=${encodeURIComponent(offerId)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setEventsError('Could not load the audit trail.');
        return;
      }
      setEventsData(data);
    } catch {
      setEventsError('Could not load the audit trail.');
    }
  };

  const summary = useMemo(
    () =>
      offers.map((o) => ({
        ...o,
        expired: o.status === 'active' && o.expires_at && Date.parse(o.expires_at) <= Date.now(),
      })),
    [offers]
  );

  /* ---- states ------------------------------------------------------------ */

  if (state === 'checking') {
    return (
      <div className="adm-page">
        <Header />
        <p className="adm-hint">Checking access…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="adm-page">
        <Header />
        <div className="adm-card">
          <h1 className="adm-title">Offer delivery tool</h1>
          <p>{configMessage}</p>
          <p className="adm-hint">
            Set the <code>ADMIN_KEY</code> secret on the Cloudflare Pages project, then reload this
            page. See README “Confidential offers” for the one-time setup.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'login') {
    return (
      <div className="adm-page">
        <Header />
        <div className="adm-card adm-card--narrow">
          <h1 className="adm-title">Offer delivery — internal</h1>
          <p className="adm-hint">Enter the Talent Tree internal access key to continue.</p>
          <form onSubmit={submitLogin} className="adm-stack">
            <Field label="Access key">
              <input
                type="password"
                autoComplete="current-password"
                value={authKey}
                onChange={(e) => setAuthKey(e.target.value)}
                required
                autoFocus
              />
            </Field>
            {authError && (
              <p className="adm-error" role="alert">
                {authError}
              </p>
            )}
            <button type="submit" className="button adm-cta" disabled={authBusy || !authKey}>
              <span>{authBusy ? 'Checking…' : 'Unlock'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ---- ready -------------------------------------------------------------- */

  return (
    <div className="adm-page">
      <Header />

      <main className="adm-main">
        <section className="adm-card">
          <h1 className="adm-title">Create an offer</h1>
          <p className="adm-hint">
            The candidate will receive a secure, private link. The PDF is stored privately and is
            only released after the candidate agrees to the confidentiality undertaking.
          </p>

          <form onSubmit={submitCreate} className="adm-stack">
            <div className="adm-grid">
              <Field label="Candidate name">
                <input
                  value={form.candidateName}
                  onChange={(e) => setForm({ ...form, candidateName: e.target.value })}
                  autoComplete="off"
                  required
                />
              </Field>
              <Field label="Candidate email">
                <input
                  type="email"
                  value={form.candidateEmail}
                  onChange={(e) => setForm({ ...form, candidateEmail: e.target.value })}
                  autoComplete="off"
                  required
                />
              </Field>
              <Field label="Client / company">
                <input
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  autoComplete="off"
                  required
                />
              </Field>
              <Field label="Position">
                <input
                  value={form.positionTitle}
                  onChange={(e) => setForm({ ...form, positionTitle: e.target.value })}
                  autoComplete="off"
                  required
                />
              </Field>
            </div>

            <div className="adm-grid">
              <Field label="Offer expires" hint="After this time the secure link stops working.">
                <input
                  type="datetime-local"
                  value={form.expiresAt}
                  min={datetimeLocal(new Date(Date.now() + 60 * 60 * 1000))}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  required
                />
              </Field>
              <Field label="Offer PDF (client’s original file)">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) =>
                    setForm({ ...form, file: e.target.files && e.target.files[0] ? e.target.files[0] : null })
                  }
                  required
                />
              </Field>
            </div>

            {formError && (
              <p className="adm-error" role="alert">
                {formError}
              </p>
            )}

            <button type="submit" className="button adm-cta" disabled={formBusy}>
              <span>{formBusy ? 'Creating secure offer…' : 'Create offer & generate secure link'}</span>
            </button>
          </form>

          {created && (
            <div className="adm-created" aria-live="polite">
              <p className="adm-created-label">Offer created. Send this link to the candidate:</p>
              <p className="adm-link">{window.location.origin + created.url}</p>
              <div className="adm-created-actions">
                <button type="button" className="button adm-cta" onClick={() => copyOfferLink(created.url)}>
                  <span>{copiedUrl === created.url ? 'Copied ✓' : 'Copy link'}</span>
                </button>
                <a className="button button-quiet adm-cta" href={created.url} target="_blank" rel="noreferrer">
                  <span>Open as candidate</span>
                </a>
              </div>
              <p className="adm-hint">
                Expires {formatWhen(created.expires_at)} · sent to {created.candidate_email} ·{' '}
                {created.client_name} · {created.position_title}
              </p>
            </div>
          )}
        </section>

        <section className="adm-card">
          <h2 className="adm-title adm-title--sub">Recent offers</h2>
          {listError && (
            <p className="adm-error" role="alert">
              {listError}
            </p>
          )}
          {summary.length === 0 && !listError && <p className="adm-hint">No offers created yet.</p>}
          {summary.length > 0 && (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Client / position</th>
                    <th>Expiry</th>
                    <th>Confidentiality</th>
                    <th aria-label="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((o) => (
                    <OfferRow
                      key={o.id}
                      offer={o}
                      copiedUrl={copiedUrl}
                      onCopy={() => copyOfferLink(o.url)}
                      onEvents={() => toggleEvents(o.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {eventsFor && (
            <div className="adm-events" aria-live="polite">
              <h3 className="adm-events-title">
                Audit trail
                <button type="button" className="adm-close" onClick={() => toggleEvents(eventsFor)}>
                  Close
                </button>
              </h3>
              {eventsError && (
                <p className="adm-error" role="alert">
                  {eventsError}
                </p>
              )}
              {!eventsError && !eventsData && <p className="adm-hint">Loading…</p>}
              {eventsData && (
                <>
                  {eventsData.acceptances && eventsData.acceptances.length > 0 && (
                    <div className="adm-events-block">
                      <p className="adm-events-label">Confidentiality acceptance</p>
                      {eventsData.acceptances.map((a, i) => (
                        <p key={i} className="adm-events-line">
                          {a.accepted ? 'Accepted' : 'Declined'} · {formatWhen(a.accepted_at)} · terms{' '}
                          {a.terms_version} · IP {a.ip_address || 'unknown'}
                        </p>
                      ))}
                    </div>
                  )}
                  {eventsData.events && eventsData.events.length > 0 && (
                    <div className="adm-events-block">
                      <p className="adm-events-label">Events</p>
                      {eventsData.events.map((ev, i) => (
                        <p key={i} className="adm-events-line">
                          {ev.event_type} · {formatWhen(ev.created_at)} · IP {ev.ip_address || 'unknown'} ·{' '}
                          {(ev.user_agent || '').slice(0, 90)}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="adm-header">
      <div className="adm-header-inner">
        <img src={talentTreeLogo} alt="Talent Tree" width="132" height="108" />
        <span className="adm-header-name">
          Offer delivery <span className="adm-header-tag">internal</span>
        </span>
      </div>
    </header>
  );
}

function OfferRow({ offer, copiedUrl, onCopy, onEvents }) {
  const accepted = offer.accepted_at ? formatWhen(offer.accepted_at) : null;
  const stateLabel = offer.status !== 'active' ? 'closed' : offer.expired ? 'expired' : 'live';
  return (
    <tr>
      <td>
        <span className="adm-strong">{offer.candidate_name}</span>
        <span className="adm-cell-sub">{offer.candidate_email}</span>
      </td>
      <td>
        <span className="adm-strong">{offer.client_name}</span>
        <span className="adm-cell-sub">{offer.position_title}</span>
      </td>
      <td>
        <span className={offer.expired ? 'adm-state adm-state--closed' : 'adm-state'}>{stateLabel}</span>
        <span className="adm-cell-sub">{formatWhen(offer.expires_at)}</span>
      </td>
      <td>
        {accepted ? (
          <>
            <span className="adm-state adm-state--accepted">Accepted</span>
            <span className="adm-cell-sub">{accepted}</span>
          </>
        ) : (
          <span className="adm-cell-sub">Not yet accepted</span>
        )}
      </td>
      <td>
        <div className="adm-actions">
          <button type="button" className="adm-btn" onClick={onCopy}>
            {copiedUrl === offer.url ? 'Copied ✓' : 'Copy link'}
          </button>
          <button type="button" className="adm-btn" onClick={onEvents}>
            Audit
          </button>
        </div>
      </td>
    </tr>
  );
}
