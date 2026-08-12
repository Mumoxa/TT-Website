import httpx,pytest
@pytest.mark.asyncio
async def test_health_and_auth_and_strict_body(app):
 async with app.router.lifespan_context(app):
  async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as c:
   assert (await c.get('/health')).json()=={'status':'ok','ollama':'configured','model':'test-model'}
   body={'task':'refine_bullet','fragments':[{'id':'x','text':'secret'}]}
   for auth in [None,'broken','Bearer wrong']:
    assert (await c.post('/v1/suggestions',json=body,headers={'Authorization':auth} if auth else {})).status_code==401
   assert (await c.post('/v1/suggestions',json={**body,'extra':1},headers={'Authorization':'Bearer 0123456789abcdef'})).status_code==422
@pytest.mark.asyncio
async def test_request_id_and_no_candidate_in_response(app):
 async with app.router.lifespan_context(app):
  async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as c:
   r=await c.post('/v1/suggestions',json={'task':'refine_bullet','fragments':[{'id':'x','text':'PRIVATE-CANDIDATE-MARKER-7391'}]},headers={'Authorization':'Bearer 0123456789abcdef','X-Client-Key':'hash','X-Request-Id':'req-1'})
   assert r.status_code==200 and r.headers['X-Request-Id']=='req-1' and 'PRIVATE-CANDIDATE' not in r.text

@pytest.mark.asyncio
async def test_rejects_missing_or_oversized_client_key(app):
 async with app.router.lifespan_context(app):
  async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as c:
   body={'task':'refine_bullet','fragments':[{'id':'x','text':'candidate'}]}
   headers={'Authorization':'Bearer 0123456789abcdef'}
   assert (await c.post('/v1/suggestions',json=body,headers=headers)).status_code==400
   assert (await c.post('/v1/suggestions',json=body,headers={**headers,'X-Client-Key':'x'*129})).status_code==400

@pytest.mark.asyncio
async def test_replaces_unsafe_request_id(app):
 async with app.router.lifespan_context(app):
  async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as c:
   r=await c.post('/v1/suggestions',json={'task':'refine_bullet','fragments':[{'id':'x','text':'candidate'}]},headers={'Authorization':'Bearer 0123456789abcdef','X-Client-Key':'hash','X-Request-Id':'candidate text with spaces'})
   assert r.status_code==200 and r.headers['X-Request-Id']!='candidate text with spaces'
