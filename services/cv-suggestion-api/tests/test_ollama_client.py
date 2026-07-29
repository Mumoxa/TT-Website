import json,httpx,pytest
from app.models import SuggestionRequest
from app.ollama_client import OllamaClient,OllamaUnavailable,UnsafeModelResponse
REQ=SuggestionRequest(task='refine_bullet',fragments=[{'id':'x','text':'managed team'}])
def client(handler): return OllamaClient(httpx.AsyncClient(transport=httpx.MockTransport(handler)),'http://ollama','installed-model')
@pytest.mark.asyncio
async def test_structured_call_and_valid_response():
 seen={}
 def handler(request):
  seen.update(json.loads(request.content)); return httpx.Response(200,json={'message':{'content':json.dumps({'task':'refine_bullet','suggestions':[{'fragmentId':'x','proposedText':'Managed team','reason':'grammar','confidence':'high','warnings':[]}]})}})
 c=client(handler)
 try: result=await c.suggest(REQ)
 finally: await c.client.aclose()
 assert result.suggestions[0].proposedText=='Managed team'; assert seen['model']=='installed-model' and seen['stream'] is False and seen['options']=={'temperature':0} and seen['format']['additionalProperties'] is False
@pytest.mark.asyncio
@pytest.mark.parametrize('response',[httpx.Response(500),httpx.ConnectError('down')])
async def test_unavailable(response):
 def handler(request):
  if isinstance(response,Exception): raise response
  return response
 c=client(handler)
 try:
  with pytest.raises(OllamaUnavailable): await c.suggest(REQ)
 finally: await c.client.aclose()
@pytest.mark.asyncio
@pytest.mark.parametrize('payload',[{}, {'message':{'content':'not json'}},{'message':{'content':'{}'}},{'message':{'content':json.dumps({'task':'refine_bullet','suggestions':[{'fragmentId':'unknown','proposedText':'Managed team','reason':'x','confidence':'high','warnings':[]}]})}}])
async def test_rejects_malformed_or_unsafe(payload):
 c=client(lambda request:httpx.Response(200,json=payload))
 try:
  with pytest.raises(UnsafeModelResponse): await c.suggest(REQ)
 finally: await c.client.aclose()
