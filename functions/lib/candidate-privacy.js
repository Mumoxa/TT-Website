// Restricted identity protection. This module is server-only; never import it in UI.
const encoder=new TextEncoder();
const bytes=value=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));
const base64=value=>btoa(String.fromCharCode(...new Uint8Array(value)));
export class PrivacyConfigurationError extends Error {}
export async function identityHash(env,definitionId,idNumber) {
 if(typeof env.ASSESSMENT_ID_HASH_KEY!=='string'||env.ASSESSMENT_ID_HASH_KEY.length<32)throw new PrivacyConfigurationError('Identity matching is not configured.');
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.ASSESSMENT_ID_HASH_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,encoder.encode('assessment-id-v1:'+definitionId+':'+idNumber));
 return [...new Uint8Array(signature)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
export async function encryptId(env,idNumber) {
 let material;
 try{material=bytes(env.ASSESSMENT_PII_KEY);}catch{throw new PrivacyConfigurationError('Private identity storage is not configured.');}
 if(material.length!==32)throw new PrivacyConfigurationError('Private identity storage is not configured.');
 const key=await crypto.subtle.importKey('raw',material,{name:'AES-GCM'},false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(idNumber));
 return 'v1.'+base64(iv)+'.'+base64(ciphertext);
}
export function maskId(idNumber) {return idNumber.slice(0,6)+'***'+idNumber.slice(-4);}
export function maskContact(phone) {
 const digits=String(phone||'').replace(/\D/g,'');
 return digits.length>=4?'+27•••••'+digits.slice(-4):'Not recorded';
}
export function publicScreening(row) {
 return {
  contact_number_masked:maskContact(row.contact_number),
  id_number_masked:/^\d{6}\*{3}\d{4}$/.test(row.id_number_masked||'')?row.id_number_masked:'Not recorded',
  earliest_start_date:row.earliest_start_date||null,
  first_day_confirmed:row.first_day_confirmed===1||row.first_day_confirmed===true,
  travel_mode:row.travel_mode||null,
  travel_description:row.travel_description||'',
  own_transport:row.own_transport||null,
  assignment_available:row.assignment_available||null,
  assignment_note:row.assignment_note||'',
 };
}
