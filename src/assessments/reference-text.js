/* Splits candidate-facing text into plain parts and reference codes such as INV-2214, JE-88417 or CN-0091.
   BatteryPanels renders each reference code with white-space: nowrap, so a line never breaks inside one.
   The text itself is unchanged: joining every part gives back the original string. */
const REFERENCE = /\b[A-Z]{2,}-\d+\b/g;

export function splitReferences(text) {
  const value = String(text ?? '');
  const parts = [];
  let last = 0;
  for (const match of value.matchAll(REFERENCE)) {
    if (match.index > last) parts.push({ text: value.slice(last, match.index), isRef: false });
    parts.push({ text: match[0], isRef: true });
    last = match.index + match[0].length;
  }
  if (last < value.length) parts.push({ text: value.slice(last), isRef: false });
  return parts;
}
