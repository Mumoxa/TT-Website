// Synthetic test data only. Never publish as a real assessment.
export const SYNTHETIC = {
  slug: 'synthetic-test-only',
  client_name: 'Demo',
  title: 'Synthetic accounting test',
  question_payload: {
    questions: Array.from({ length: 5 }, (_, i) => ({
      id: 'q' + (i + 1),
      prompt: 'Synthetic accounting exercise number ' + (i + 1),
      options: [
        { id: 'a', text: 'Synthetic A', hidden_key_for_test: true },
        { id: 'b', text: 'Synthetic B' },
        { id: 'c', text: 'Synthetic C' },
        { id: 'd', text: 'Synthetic D' },
      ],
    })),
    scenario: {
      instructions: 'Compare these synthetic ledger entries.',
      supplier: [
        { ref: 'AA1', amount: 100 }, { ref: 'AA2', amount: 200 },
        { ref: 'AA3', amount: 300 }, { ref: 'AA4', amount: -50 },
      ],
      ledger: [
        { ref: 'AA1', amount: 100 }, { ref: 'AA2', amount: 200 },
        { ref: 'DD5', amount: 25 }, { ref: 'DD6', amount: 5 },
      ],
      action_options: [
        { id: 'investigate', text: 'Trace and verify supporting documentation' },
        { id: 'reverse', text: 'Verify and reverse the duplicated entry' },
        { id: 'note', text: 'Document the reconciling item' },
        { id: 'force', text: 'Force a balancing journal' },
      ],
      private_answer_key: 'DO_NOT_LEAK',
    },
  },
  scoring_key: {
    mcq: { q1: 'a', q2: 'a', q3: 'b', q4: 'c', q5: 'd' },
    discrepancies: ['AA3', 'AA4', 'DD5'],
    actions: { AA3: 'investigate', AA4: 'note', DD5: 'reverse' },
    unsafe_actions: ['force'],
    corrected_balance: 550,
  },
};
