// Server-only WPP v2 reasoning package utilities. This module is not a launch gate or route.
// Never put real item content or keys in the repository, logs, browser bundles, or error messages.
const SECTIONS = ['numeric', 'cognitive'];
const OPTION_IDS = ['a', 'b', 'c', 'd'];
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2000;
const invalid = () => { throw new Error('Invalid private reasoning package.'); };

/** Validate and project only the exact fields required by the server. */
export function validateReasoningPackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.version !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.version) ||
      !Array.isArray(value.sections) || value.sections.length !== 2) invalid();
  const seen = new Set();
  const sections = SECTIONS.map(name => {
    const matches = value.sections.filter(s => s?.id === name);
    if (matches.length !== 1) invalid();
    const section = matches[0];
    if (!text(section.title) || !text(section.instructions) || !Array.isArray(section.items) || section.items.length !== 6) invalid();
    const items = section.items.map((item, index) => {
      const id = (name === 'numeric' ? 'n' : 'c') + (index + 1);
      if (!item || item.id !== id || seen.has(id) || !text(item.prompt) || !Array.isArray(item.options) || item.options.length !== 4 || !OPTION_IDS.includes(item.key)) invalid();
      seen.add(id);
      const options = OPTION_IDS.map((optionId, i) => {
        const option = item.options[i];
        if (!option || option.id !== optionId || !text(option.label)) invalid();
        return {id: optionId, label: option.label};
      });
      return {id, prompt: item.prompt, options, key: item.key};
    });
    return {id: name, title: section.title, instructions: section.instructions, items};
  });
  return {version: value.version, sections};
}

/** Public view must be a whitelist, never an object spread of private content. */
export function publicReasoningPackage(value) {
  const pkg = validateReasoningPackage(value);
  return {version: pkg.version, sections: pkg.sections.map(s => ({id:s.id, title:s.title, instructions:s.instructions,
    items:s.items.map(item => ({id:item.id, prompt:item.prompt, options:item.options.map(o => ({id:o.id,label:o.label}))}))}))};
}

/** Only permit the current package's IDs and known option IDs; omitted items are null. */
export function normalizeReasoningAnswers(value, input) {
  const pkg = validateReasoningPackage(value);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid reasoning answers.');
  const items = pkg.sections.flatMap(s => s.items);
  const ids = new Set(items.map(i => i.id));
  for (const [id, answer] of Object.entries(input)) if (!ids.has(id) || (answer !== null && !OPTION_IDS.includes(answer))) throw new Error('Invalid reasoning answers.');
  return Object.fromEntries(items.map(item => [item.id, input[item.id] ?? null]));
}

/** Raw item counts only. Not norms, ability estimates, cutoffs, or selection recommendations. */
export function scoreReasoningPackage(value, input) {
  const pkg = validateReasoningPackage(value), answers = normalizeReasoningAnswers(pkg, input);
  return Object.fromEntries(pkg.sections.map(section => [section.id, {
    title: section.title,
    correct: section.items.filter(item => answers[item.id] === item.key).length,
    attempted: section.items.filter(item => answers[item.id] !== null).length,
    total: section.items.length,
  }]));
}

/** Read only from the server environment; malformed or absent content fails closed. */
export function loadReasoningPackage(env) {
  if (typeof env?.WPP_REASONING_PACKAGE !== 'string' || env.WPP_REASONING_PACKAGE.length > 100000) invalid();
  let parsed;
  try { parsed = JSON.parse(env.WPP_REASONING_PACKAGE); } catch { invalid(); }
  return validateReasoningPackage(parsed);
}

/** Server-only keyed fingerprint; an unkeyed hash could expose low-entropy answer keys to guessing. */
export async function reasoningPackageFingerprint(value, secret) {
  const pkg = validateReasoningPackage(value);
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Private fingerprint key unavailable.');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify(pkg)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
