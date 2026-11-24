import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateIdNumber,normalizePhone,validateStartDate,normalizeScreening,southAfricaToday} from '../src/assessments/screening.js';
import {syntheticId,screeningFixture} from './helpers/screening-fixture.mjs';
const now=new Date('2026-11-04T10:00:00Z');
test('ID requires13 digits, a valid birth date, citizenship digit and Luhn checksum',()=>{
 assert.equal(validateIdNumber(syntheticId(),now),syntheticId());
 for(const id of ['','123',syntheticId().slice(0,12)+'9','0002305000080','0013015000080','0001015000280'])assert.throws(()=>validateIdNumber(id,now));
});
test('South African phones normalize local and international formats and reject other numbers',()=>{
 assert.equal(normalizePhone('021 000 0000'),'+27210000000');
 assert.equal(normalizePhone('+27 82 000 0000'),'+27820000000');
 for(const phone of ['123','+12025550123','00271000000','+270820000000'])assert.throws(()=>normalizePhone(phone));
});
test('first day is a weekday from tomorrow through90 days, using South African dates',()=>{
 assert.equal(southAfricaToday(new Date('2026-11-04T22:30:00Z')),'2026-11-05');
 assert.equal(validateStartDate('2026-11-05',now),'2026-11-05');
 for(const date of ['2026-11-04','2026-11-07','2027-02-03','2026-02-30'])assert.throws(()=>validateStartDate(date,now));
 assert.equal(validateStartDate('2027-02-02',now),'2027-02-02');
});
test('screening requires confirmation and conditional travel details, with bounded optional notes',()=>{
 const data=screeningFixture(0,now);assert.equal(normalizeScreening(data,now).contact_number,'+27210000000');
 assert.throws(()=>normalizeScreening({...data,first_day_confirmed:false},now));
 assert.throws(()=>normalizeScreening({...data,travel_mode:'public_transport'},now));
 assert.equal(normalizeScreening({...data,travel_mode:'other',travel_description:'Synthetic route'},now).travel_description,'Synthetic route');
 // The 2-month assignment question was removed (owner decision 2026-11-24): not required, and ignored if an old page sends it.
 const {assignment_available:_a,assignment_note:_n,...withoutAssignment}=data;
 const cleaned=normalizeScreening(withoutAssignment,now);assert.equal(cleaned.assignment_available,null);assert.equal(cleaned.assignment_note,'');
 const stale=normalizeScreening({...data,assignment_available:'no',assignment_note:'x'.repeat(301)},now);assert.equal(stale.assignment_available,null);assert.equal(stale.assignment_note,'');
 assert.throws(()=>normalizeScreening({...data,own_transport:'unknown'},now));
});

test('result email omits the retired 2-month question for new candidates and keeps it for earlier answers',async()=>{
 const {buildResultEmail}=await import('../functions/lib/assessment-email.js');
 const args={candidate:{first_name:'Test',surname:'Person',email:'t@example.invalid'},title:'Synthetic',clientName:'Talent Tree',status:'completed',gradedAt:'2026-01-01',isBattery:true,mcqReview:[],attemptNumber:1,
  result:{overall_score:50,knowledge_score:20,reconciliation_score:30,breakdown:{},critical_flags:[],interpretation:'Synthetic.'}};
 const fresh=buildResultEmail({...args,screening:{earliest_start_date:'2026-12-01',travel_mode:'own_vehicle',own_transport:'yes',assignment_available:null}});
 assert.doesNotMatch(fresh.text,/2-month/);assert.doesNotMatch(fresh.html,/2-month/);
 const earlier=buildResultEmail({...args,screening:{earliest_start_date:'2026-12-01',travel_mode:'own_vehicle',own_transport:'yes',assignment_available:'yes'}});
 assert.match(earlier.text,/Available for a 2-month assignment: Yes/);
});
