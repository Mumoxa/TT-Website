import json, httpx
from pydantic import ValidationError
from .models import SuggestionRequest, SuggestionResponse
from .prompts import build_messages,response_schema_for
from .safeguards import validate_suggestions
class OllamaUnavailable(Exception): pass
class UnsafeModelResponse(Exception): pass
class OllamaClient:
 def __init__(self,http_client,base_url,model): self.client=http_client; self.base_url=base_url.rstrip('/'); self.model=model
 async def suggest(self,request:SuggestionRequest):
  payload={'model':self.model,'messages':build_messages(request),'stream':False,'format':response_schema_for(request.task),'options':{'temperature':0}}
  try: response=await self.client.post(f'{self.base_url}/api/chat',json=payload)
  except (httpx.TimeoutException,httpx.NetworkError) as exc: raise OllamaUnavailable() from exc
  if response.status_code!=200: raise OllamaUnavailable()
  try:
   envelope=response.json(); content=envelope['message']['content']; raw=json.loads(content); result=SuggestionResponse.model_validate(raw)
   if result.task!=request.task: raise ValueError('task mismatch')
   return validate_suggestions(request,result)
  except (ValueError,KeyError,TypeError,json.JSONDecodeError,ValidationError) as exc: raise UnsafeModelResponse() from exc
