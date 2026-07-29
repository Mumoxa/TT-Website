import pytest
from app.models import SuggestionRequest,SuggestionResponse
from app.safeguards import validate_suggestions
def response(text,id='x'): return SuggestionResponse.model_validate({'task':'refine_bullet','suggestions':[{'fragmentId':id,'proposedText':text,'reason':'grammar','confidence':'high','warnings':[]}]})
def test_valid_and_unknown_and_invented_tokens():
 req=SuggestionRequest(task='refine_bullet',fragments=[{'id':'x','text':'managed team'}]); assert validate_suggestions(req,response('Managed team'))
 with pytest.raises(ValueError): validate_suggestions(req,response('Managed team at Acme Ltd'))
 with pytest.raises(ValueError): validate_suggestions(req,response('Managed team','unknown'))
 with pytest.raises(ValueError): validate_suggestions(req,response('Managed 20 staff'))
