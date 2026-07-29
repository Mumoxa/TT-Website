import asyncio,time,uuid,httpx,re
from contextlib import asynccontextmanager
from fastapi import FastAPI,Header,HTTPException,Request
from fastapi.responses import JSONResponse
from .config import Settings
from .logging_config import log_metadata
from .models import SuggestionRequest
from .ollama_client import OllamaClient,OllamaUnavailable,UnsafeModelResponse
from .rate_limit import InMemoryRateLimiter

def create_app(settings=None,ollama=None):
 settings=settings or Settings()
 @asynccontextmanager
 async def lifespan(app):
  client=httpx.AsyncClient(timeout=httpx.Timeout(connect=3,read=15,write=3,pool=3))
  app.state.ollama=ollama or OllamaClient(client,settings.ollama_base_url,settings.ollama_model)
  yield
  await client.aclose()
 app=FastAPI(lifespan=lifespan)
 app.state.limiter=InMemoryRateLimiter(settings.rate_limit_requests,settings.rate_limit_window_seconds,settings.max_client_keys)
 app.state.semaphore=asyncio.Semaphore(settings.ollama_concurrency)
 @app.exception_handler(Exception)
 async def safe_exception(_request, _exc): return JSONResponse({'detail':'Suggestion service unavailable.'},status_code=500)
 @app.get('/health')
 async def health(): return {'status':'ok','ollama':'configured','model':settings.ollama_model}
 @app.post('/v1/suggestions')
 async def suggestions(body:SuggestionRequest,request:Request,authorization:str|None=Header(None),x_client_key:str|None=Header(None),x_request_id:str|None=Header(None)):
  request_id=x_request_id if x_request_id and re.fullmatch(r'[A-Za-z0-9._-]{1,120}',x_request_id) else str(uuid.uuid4())
  started=time.monotonic(); status=200; error=None
  import secrets
  if not authorization or not authorization.startswith('Bearer ') or not secrets.compare_digest(authorization[7:],settings.cv_relay_token): raise HTTPException(401,'Unauthorized')
  try:
   if not x_client_key or len(x_client_key)>128:
    status,error=400,'invalid_client_key'; raise HTTPException(400,'Invalid request.')
   decision=await app.state.limiter.allow(x_client_key,time.monotonic())
   if not decision.allowed:
    status,error=429,'rate_limited'; raise HTTPException(429,'Rate limited',headers={'Retry-After':str(decision.retry_after)})
   try: await asyncio.wait_for(app.state.semaphore.acquire(),settings.concurrency_wait_seconds)
   except TimeoutError: status,error=503,'queue_unavailable'; raise HTTPException(503,'Suggestion service unavailable.')
   try: result=await app.state.ollama.suggest(body)
   finally: app.state.semaphore.release()
   return JSONResponse(result.model_dump(exclude_none=True),headers={'X-Request-Id':request_id,'Cache-Control':'no-store'})
  except OllamaUnavailable: status,error=503,'ollama_unavailable'; raise HTTPException(503,'Suggestion service unavailable.')
  except UnsafeModelResponse: status,error=422,'unsafe_model_response'; raise HTTPException(422,'Suggestion could not be validated.')
  finally: log_metadata(request_id=request_id,task=body.task,fragment_count=len(body.fragments),character_count=sum(len(f.text) for f in body.fragments),status_code=status,duration_ms=round((time.monotonic()-started)*1000),error_code=error)
 return app
