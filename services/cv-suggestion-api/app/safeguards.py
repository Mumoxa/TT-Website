import re
from .models import SuggestionRequest, SuggestionResponse
PROTECTED=re.compile(r'''(?:\b\d[\d,./%-]*\b|[£$€]\s?\d[\d,.]*|\b[A-Z]{2,}\b|https?://\S+|\b[\w.+-]+@[\w.-]+\.\w+\b|\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b)''')
def protected_tokens(text): return set(PROTECTED.findall(text))
def validate_suggestions(request:SuggestionRequest,response:SuggestionResponse):
 sources={f.id:f.text for f in request.fragments}; ids=set(sources)
 for item in response.suggestions:
  if item.fragmentId not in ids: raise ValueError('unknown fragment ID')
  for duplicate in getattr(item,'duplicateFragmentIds',[]):
   if duplicate not in ids: raise ValueError('unknown duplicate fragment ID')
  proposed=getattr(item,'proposedText',None)
  if proposed:
   source=sources[item.fragmentId]
   if protected_tokens(proposed)-protected_tokens(source): raise ValueError('introduced protected token')
   if request.task=='refine_existing_summary' and protected_tokens(source)-protected_tokens(proposed): raise ValueError('removed protected token')
 return response
