// Numeric and cognitive reasoning items for the Workplace Personality Profile (form wpp-2026-v2).
// Original items (no third-party test content). The keys were solved independently by hand and in
// code in the earlier HPIS review; tests/hpi-reasoning.test.mjs recomputes every computable key.
// Server-side only: the browser receives prompts and option labels, never `key`.
// Scores are raw counts: no norms, percentiles, IQ or cut-offs.

const item = (id, section, prompt, labels, key) => ({
  id, section, prompt,
  options: labels.map((label, i) => ({ id: `o${i + 1}`, label })),
  key: `o${key + 1}`,
});

export const REASONING_SECTIONS = Object.freeze([
  { id: 'numeric', title: 'Numeric reasoning', instruction: 'Work out each answer from the figures given. You may use a calculator.' },
  { id: 'cognitive', title: 'Cognitive reasoning', instruction: 'Find the pattern or work out what must follow from the stated rules.' },
]);

export const REASONING_ITEMS = Object.freeze([
  item('n1', 'numeric', 'A batch contains 120 records; 18 need correction. What percentage needs correction?', ['12%', '15%', '18%', '20%'], 1),
  item('n2', 'numeric', 'Team A: 96 correct out of 120. Team B: 85 correct out of 100. Which team has the higher accuracy?', ['Team A', 'They are equal', 'Team B', 'Cannot be determined'], 2),
  item('n3', 'numeric', 'A supplier charges R480 for 12 units. At the same unit price, what do 17 units cost?', ['R640', 'R720', 'R600', 'R680'], 3),
  item('n4', 'numeric', 'Revenue: North R80 000, South R60 000. Costs: North R60 000, South R42 000. Which region has the larger profit margin?', ['South', 'North', 'They are equal', 'Cannot be determined'], 0),
  item('n5', 'numeric', 'A machine completes 36 items in 9 minutes at a constant rate. How many items does it complete in 15 minutes?', ['45', '60', '54', '72'], 1),
  item('n6', 'numeric', 'A budget of R2 400 allocates 35% to materials. How much remains for other costs?', ['R1 560', 'R840', 'R1 440', 'R1 680'], 0),
  item('c1', 'cognitive', 'What number comes next: 2, 5, 11, 23, …?', ['46', '47', '35', '48'], 1),
  item('c2', 'cognitive', 'What number comes next: 1, 4, 2, 8, 3, 12, …?', ['16', '6', '9', '4'], 3),
  item('c3', 'cognitive', 'ABC becomes BCA, and PQR becomes QRP. Apply the same rule to XYZ.', ['ZXY', 'YZX', 'ZYX', 'XZY'], 1),
  item('c4', 'cognitive', 'Rule: every approved file receives a seal. File X has no seal. Which conclusion follows?', ['File X is approved', 'File X is a draft', 'File X is not approved', 'File X is missing'], 2),
  item('c5', 'cognitive', 'Three desks are numbered 1 to 3. Ben must sit at desk 3, Ana cannot sit at desk 1, and each person has one desk. Where must Ana sit?', ['Desk 1', 'Desk 2', 'Desk 3', 'It cannot be determined'], 1),
  item('c6', 'cognitive', 'Every approved request is logged. Some logged requests are not approved. Request 7 is logged. What can be concluded?', ['It is approved', 'It cannot be determined whether it is approved', 'It is not approved', 'It should not have been logged'], 1),
]);

export const REASONING_IDS = new Set(REASONING_ITEMS.map(i => i.id));

export function publicReasoningItems() {
  return REASONING_ITEMS.map(({ id, section, prompt, options }) => ({ id, section, kind: 'reasoning', prompt, options: options.map(o => ({ ...o })) }));
}

export function validReasoningAnswer(id, value) {
  const it = REASONING_ITEMS.find(i => i.id === id);
  return !!it && (value === null || it.options.some(o => o.id === value));
}

// Raw counts per section. Blank answers count as attempted = false, never as wrong-and-attempted.
export function scoreReasoning(answers) {
  return Object.fromEntries(REASONING_SECTIONS.map(({ id, title }) => {
    const its = REASONING_ITEMS.filter(i => i.section === id);
    const attempted = its.filter(i => answers[i.id] != null).length;
    const correct = its.filter(i => answers[i.id] === i.key).length;
    return [id, { title, correct, attempted, total: its.length }];
  }));
}
