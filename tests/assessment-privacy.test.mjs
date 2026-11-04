import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identityHash,encryptId,maskId,maskContact,publicScreening} from '../functions/lib/candidate-privacy.js';
import {syntheticId} from './helpers/screening-fixture.mjs';
const env={ASSESSMENT_ID_HASH_KEY:'synthetic-only-hmac-key-with-at-least32-characters',ASSESSMENT_PII_KEY:btoa('0'.repeat(32))};
test('identity matching is keyed, deterministic and scoped per assessment',async()=>{
 const id=syntheticId();const hash=await identityHash(env,'one',id);
 assert.equal(hash,await identityHash(env,'one',id));assert.notEqual(hash,await identityHash(env,'two',id));assert.notEqual(hash,await identityHash({...env,ASSESSMENT_ID_HASH_KEY:'different-synthetic-hmac-key-at-least32'},'one',id));
 await assert.rejects(()=>identityHash({},'one',id));
});
test('ID ciphertext uses a fresh nonce and decrypts only with the server secret',async()=>{
 const id=syntheticId(),first=await encryptId(env,id),second=await encryptId(env,id);assert.notEqual(first,second);assert.equal(first.includes(id),false);
 const [version,iv,cipher]=first.split('.');assert.equal(version,'v1');
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('raw',bytes(env.ASSESSMENT_PII_KEY),{name:'AES-GCM'},false,['decrypt']);
 assert.equal(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv)},key,bytes(cipher))),id);
});
test('screening report projection masks ID/contact and excludes restricted columns',()=>{
 const id=syntheticId();assert.equal(maskId(id),id.slice(0,6)+'***'+id.slice(-4));assert.equal(maskContact('+27210000000'),'+27•••••0000');
 const output=publicScreening({id_number_masked:maskId(id),id_number_encrypted:'restricted',contact_number:'+27210000000',earliest_start_date:'2026-11-05',travel_mode:'own_vehicle',own_transport:'yes',assignment_available:'yes'});
 const json=JSON.stringify(output);assert.equal(json.includes(id),false);assert.equal(json.includes('+27210000000'),false);assert.equal(json.includes('restricted'),false);assert.equal(output.earliest_start_date,'2026-11-05');
});
