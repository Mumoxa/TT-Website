import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestJson} from '../functions/lib/assessment-core.js';
test('oversized streaming bodies stop reading at the limit',async()=>{
 let chunks=0,cancelled=false;
 const stream=new ReadableStream({pull(c){chunks++; c.enqueue(new Uint8Array(10000).fill(32));if(chunks===100)c.close();},cancel(){cancelled=true;}});
 await assert.rejects(()=>requestJson(new Request('https://example.invalid',{method:'POST',body:stream,duplex:'half'})),/too large/i);
 assert.ok(chunks<15,'must not read an unbounded body');assert.ok(cancelled);
});
