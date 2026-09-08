/* Talent Tree — confidential employment offer delivery.
   Candidate-facing flow at /offer/<secure-token>.
   Copy here follows the approved 2026-09-08 wording exactly. */

import { useCallback, useEffect, useRef, useState } from 'react';
import talentTreeLogo from '../../Talent Tree Logo 2026 (1).png';
import './offer.css';

const UNAVAILABLE_TEXT =
  'This offer link is no longer available. Please contact your Talent Tree consultant.';

const FIRST_NAME = (full) => {
  const token = (full || '').trim().split(/\s+/)[0] || '';
  return token.replace(/[.,;:]+$/g, '');
};

const formatWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

function Logo() {
  return (
    <div className="tt-lockup">
      <img src={talentTreeLogo} alt="Talent Tree" width="132" height="108" />
    </div>
  );
}

function Unavailable() {
  return (
    <main className="offer-shell">
      <section className="offer-panel offer-panel--slim" aria-live="polite">
        <p className="offer-eyebrow">Secure offer delivery</p>
        <h1 className="offer-title">{UNAVAILABLE_TEXT}</h1>
      </section>
    </main>
  );
}

function Loading() {
  return (
    <main className="offer-shell">
      <section className="offer-panel offer-panel--slim" aria-live="polite">
        <p className="offer-muted">Opening your secure offer…</p>
      </section>
    </main>
  );
}

/* ------------------------------------------------ pre-agreement (locked) -- */

function Locked({ offer, onAgree, busy, error }) {
  const [checked, setChecked] = useState(false);

  return (
    <main className="offer-shell">
      <article className="offer-panel">
        <p className="offer-eyebrow">Talent Tree · Secure offer delivery</p>
        <h1 className="offer-title">Your Confidential Employment Offer</h1>

        <dl className="offer-facts">
          <div>
            <dt>Candidate</dt>
            <dd>{offer.candidate_name}</dd>
          </div>
          <div>
            <dt>Position</dt>
            <dd>{offer.position_title}</dd>
          </div>
          <div>
            <dt>Client</dt>
            <dd>{offer.client_name}</dd>
          </div>
        </dl>

        <p className="offer-intro">
          Congratulations. A formal employment offer has been made available to you through Talent
          Tree.
        </p>
        <p className="offer-intro">
          Employment offers contain private remuneration, employment and commercial information and
          are therefore delivered through Talent Tree’s secure offer process.
        </p>

        <h2 className="offer-h2">Confidentiality Undertaking</h2>
        <div className="undertaking">
          <p>
            The employment offer you are about to access contains confidential information belonging
            to the prospective employer and has been provided to you solely for the purpose of
            considering the employment opportunity presented to you through Talent Tree.
          </p>
          <p>
            By continuing, you agree to keep the offer and its contents confidential and not to copy,
            forward, publish, distribute or disclose the offer, or any screenshot, photograph or
            reproduction of it, to your current employer, another prospective employer, recruitment
            agency or other third party for the purpose of obtaining or negotiating a counter-offer
            or competing offer.
          </p>
          <p>
            This undertaking does not prevent you from obtaining confidential professional, legal,
            tax or financial advice, discussing the decision with your spouse or immediate family in
            confidence, or making any disclosure required by law.
          </p>
          <p>You remain entirely free to accept or decline the employment offer.</p>
          <p>
            By selecting “I have read, understood and agree” and continuing, you confirm that you
            have read, understood and voluntarily accepted this confidentiality undertaking before
            accessing the employment offer.
          </p>
        </div>

        <label className="agree-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={busy}
          />
          <span>I have read, understood and agree to the Confidentiality Undertaking.</span>
        </label>

        {error && (
          <p className="offer-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="button offer-cta"
          disabled={!checked || busy}
          onClick={onAgree}
        >
          <span>{busy ? 'Recording your agreement…' : 'Agree & View Offer'}</span>
        </button>

        <p className="offer-subtle">
          Talent Tree facilitates the secure delivery of this employment offer on behalf of the
          prospective employer. The employment offer itself is made by the employer identified in
          the offer document.
        </p>
      </article>
    </main>
  );
}

/* ----------------------------------------------------- post-agreement ------ */

function Confirmed({ offer, acceptedAt, downloadUrl, downloadReady }) {
  return (
    <main className="offer-shell">
      <article className="offer-panel">
        <p className="offer-eyebrow">Talent Tree · Secure offer delivery</p>
        <h1 className="offer-title">Confidentiality Confirmed</h1>
        <p className="offer-thanks">
          Thank you, {FIRST_NAME(offer.candidate_name)}.
        </p>
        <p className="offer-intro">
          Your confidentiality undertaking was recorded on {formatWhen(acceptedAt)}. You may now
          access your formal employment offer.
        </p>

        <div className="offer-details">
          <p className="offer-muted">
            {offer.position_title} · {offer.client_name}
          </p>
        </div>

        <a
          className={`button offer-cta${downloadReady ? '' : ' offer-cta--pending'}`}
          href={downloadUrl}
          aria-disabled={!downloadReady}
          onClick={(e) => {
            if (!downloadReady) e.preventDefault();
          }}
        >
          <span>View / Download Offer</span>
        </a>

        <p className="offer-subtle">
          Please contact your Talent Tree consultant if you have any questions regarding the offer
          before responding to it.
        </p>
      </article>
    </main>
  );
}

/* ------------------------------------------------------------- app --------- */

export default function OfferApp({ token }) {
  const [phase, setPhase] = useState('loading'); // loading | locked | confirmed | unavailable
  const [offer, setOffer] = useState(null);
  const [acceptedAt, setAcceptedAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloadReady, setDownloadReady] = useState(false);
  const downloadUrl = `/api/offer/${token}/download`;
  const accessFired = useRef(false);

  useEffect(() => {
    document.title = 'Your Confidential Employment Offer — Talent Tree';
  }, []);

  const load = useCallback(async () => {
    setPhase('loading');
    setError('');
    try {
      const res = await fetch(`/api/offer/${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setPhase('unavailable');
        return;
      }
      setOffer(data.offer);
      if (data.accepted) {
        setAcceptedAt(data.accepted.accepted_at);
        setPhase('confirmed');
      } else {
        setPhase('locked');
      }
    } catch {
      setPhase('unavailable');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  /* Log OFFER_ACCESSED once per confirmed visit, then enable the download link. */
  useEffect(() => {
    if (phase !== 'confirmed' || accessFired.current) return;
    accessFired.current = true;
    let cancelled = false;
    fetch(`/api/offer/${encodeURIComponent(token)}/access`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 403 || res.status === 404 || res.status === 410) {
          setPhase('unavailable');
          return;
        }
        setDownloadReady(true);
      })
      .catch(() => {
        if (!cancelled) setDownloadReady(true); // acceptance itself is server-verified on download
      });
    return () => {
      cancelled = true;
    };
  }, [phase, token]);

  const agree = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/offer/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        if (res.status === 404 || res.status === 410) {
          setBusy(false);
          setPhase('unavailable');
          return;
        }
        setError(data && data.message ? data.message : 'Something went wrong. Please try again.');
        setBusy(false);
        return;
      }
      setAcceptedAt(data.accepted_at);
      setBusy(false);
      setPhase('confirmed');
    } catch {
      setError('Something went wrong. Please check your connection and try again.');
      setBusy(false);
    }
  }, [token]);

  if (phase === 'unavailable') {
    return (
      <div className="offer-page">
        <Logo />
        <Unavailable />
      </div>
    );
  }
  if (phase === 'loading' || !offer) {
    return (
      <div className="offer-page">
        <Logo />
        <Loading />
      </div>
    );
  }
  if (phase === 'confirmed') {
    return (
      <div className="offer-page">
        <Logo />
        <Confirmed
          offer={offer}
          acceptedAt={acceptedAt}
          downloadUrl={downloadUrl}
          downloadReady={downloadReady}
        />
      </div>
    );
  }
  return (
    <div className="offer-page">
      <Logo />
      <Locked offer={offer} onAgree={agree} busy={busy} error={error} />
    </div>
  );
}
