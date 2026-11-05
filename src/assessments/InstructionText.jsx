/* Renders plain instruction text written by an author: blank-line or line-break separated paragraphs,
   and lines starting with "- " as a bulleted list. Text only; no HTML is interpreted. */
import React from 'react';

export function InstructionText({ text = '' }) {
  const blocks = [];
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('- ')) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'list') last.items.push(trimmed.slice(2));
      else blocks.push({ type: 'list', items: [trimmed.slice(2)] });
    } else blocks.push({ type: 'p', text: trimmed });
  }
  return blocks.map((b, i) => (b.type === 'list'
    ? <ul key={i}>{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
    : <p key={i}>{b.text}</p>));
}
