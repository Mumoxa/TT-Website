import asyncio
import hashlib
from dataclasses import dataclass
@dataclass(frozen=True)
class RateDecision: allowed: bool; retry_after: int=0
class InMemoryRateLimiter:
 def __init__(self,limit=30,window_seconds=600,max_keys=10_000): self.limit=limit; self.window=window_seconds; self.max_keys=max_keys; self.entries={}; self.lock=asyncio.Lock()
 async def allow(self,key,now):
  if not key: return RateDecision(False,self.window)
  key=hashlib.sha256(key.encode('utf-8')).hexdigest()
  async with self.lock:
   self.entries={k:v for k,v in self.entries.items() if now-v[0]<self.window}
   if key not in self.entries and len(self.entries)>=self.max_keys:
    del self.entries[min(self.entries,key=lambda k:self.entries[k][0])]
   start,count=self.entries.get(key,(now,0))
   if now-start>=self.window: start,count=now,0
   if count>=self.limit: return RateDecision(False,max(1,int(self.window-(now-start))))
   self.entries[key]=(start,count+1); return RateDecision(True)
