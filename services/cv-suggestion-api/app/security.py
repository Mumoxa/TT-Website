import secrets
from fastapi import Header, HTTPException
async def authenticate(authorization: str|None=Header(default=None), expected_token: str=''):
    prefix='Bearer '
    if not authorization or not authorization.startswith(prefix) or not secrets.compare_digest(authorization[len(prefix):], expected_token):
        raise HTTPException(status_code=401,detail='Unauthorized')
