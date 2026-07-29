import pytest
from app.rate_limit import InMemoryRateLimiter
@pytest.mark.asyncio
async def test_limits_resets_isolates_and_bounds():
 r=InMemoryRateLimiter(30,600,2)
 for _ in range(30): assert (await r.allow('a',0)).allowed
 d=await r.allow('a',0); assert not d.allowed and d.retry_after==600
 assert (await r.allow('a',601)).allowed and (await r.allow('b',601)).allowed
 assert (await r.allow('c',601)).allowed and len(r.entries)<=2
 assert not (await r.allow('',601)).allowed

@pytest.mark.asyncio
async def test_never_stores_the_relay_client_key_verbatim():
 r=InMemoryRateLimiter()
 await r.allow('relay-provided-client-key',0)
 assert 'relay-provided-client-key' not in r.entries
