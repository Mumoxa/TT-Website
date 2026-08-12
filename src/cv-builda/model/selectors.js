export const selectUnreviewedFragments = s => s.fragments.filter(f=>f.coverage==='unreviewed');
export const selectPendingNotes = s => s.notes.filter(n=>n.status==='pending');
export const selectPendingSuggestions = s => s.suggestions.filter(n=>n.status==='pending');
export const selectApprovedDraft = s => ({...s, fragments:s.fragments.filter(f=>f.coverage==='assigned'), suggestions:s.suggestions.filter(x=>x.status==='approved')});
