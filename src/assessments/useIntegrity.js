import { useEffect, useRef, useState } from 'react';

/* Page integrity while an attempt is active (see integrity.js). Copy, cut, the right-click menu and dragging are
   switched off everywhere except the candidate's own answer boxes. Leaving the page is reported to the server,
   which times it. Pastes into answer boxes are counted only when the text was not copied inside the assessment. */
const editable = (el) => el instanceof Element && el.matches('input:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])');
const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

function send(attemptId, event) {
  try {
    void fetch('/api/assessment/integrity', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attempt_id: attemptId, event }),
    }).catch(() => {});
  } catch { /* recording must never block the candidate */ }
}

export function useIntegrity(active, attemptId) {
  const [notice, setNotice] = useState('');
  const internal = useRef([]);
  useEffect(() => {
    if (!active || !attemptId) return undefined;
    let away = false, lastCopy = 0, timer;
    const isAway = () => document.visibilityState === 'hidden' || !document.hasFocus();
    const check = () => { const now = isAway(); if (now !== away) { away = now; send(attemptId, now ? 'left' : 'back'); } };
    // A reload or reopened tab closes any leave left open, then the current state is taken.
    send(attemptId, 'back'); away = false; check();
    const show = (text) => { setNotice(text); window.clearTimeout(timer); timer = window.setTimeout(() => setNotice(''), 4000); };
    const remember = (text) => { const t = norm(text); if (t) internal.current = [t, ...internal.current.filter((x) => x !== t)].slice(0, 30); };
    const onCopy = (e) => {
      if (editable(e.target)) {
        const el = e.target; const sel = typeof el.selectionStart === 'number' ? el.value.slice(el.selectionStart, el.selectionEnd) : '';
        remember(sel || el.value); return;
      }
      e.preventDefault();
      const now = Date.now(); if (now - lastCopy > 3000) { lastCopy = now; send(attemptId, 'copy'); }
      show('Copying is switched off for this assessment.');
    };
    const onPaste = (e) => {
      if (!editable(e.target)) return;
      const text = norm(e.clipboardData?.getData('text/plain'));
      if (text && !internal.current.includes(text)) send(attemptId, 'paste');
    };
    const onMenu = (e) => { if (!editable(e.target)) e.preventDefault(); };
    const onDrag = (e) => { if (!editable(e.target)) e.preventDefault(); };
    document.documentElement.classList.add('tta-integrity');
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCopy, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('contextmenu', onMenu, true);
    document.addEventListener('dragstart', onDrag, true);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('blur', check);
    window.addEventListener('focus', check);
    window.addEventListener('pagehide', check);
    return () => {
      document.documentElement.classList.remove('tta-integrity');
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCopy, true);
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('contextmenu', onMenu, true);
      document.removeEventListener('dragstart', onDrag, true);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('blur', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('pagehide', check);
      window.clearTimeout(timer);
    };
  }, [active, attemptId]);
  return notice;
}
