// Synthetic-only report fixtures. No candidate data or production results.
import {DIMENSIONS} from '../../src/assessments/personality-report-model.js';
function report(scores, options={}) {
  const factors = scores === null ? null : DIMENSIONS.map((d,i)=>({name:d.name,mean:scores[i],answered:scores[i]===null?0:10,total:10}));
  return {candidate:{first_name:options.first || 'QA',surname:options.last || 'Mockrunner',email:'not-for-report@example.invalid'},
    screening:{id_number_masked:'***9876',contact_number_masked:'***1111',travel_mode:'private transport'},
    assessment:{format:'personality-v1',version:'v1',form_version:'hpi-2026-pilot-2',scoring_version:'hpi-raw-v2'},
    attempt:{id:'synthetic-attempt-001',attempt_number:1,status:'completed'},
    personality:{status:'submitted',submitted_at:'2026-11-25T15:11:00.000Z',factors,attempted:factors?factors.reduce((n,f)=>n+f.answered,0):null,total:50}};
}
const partial = report([3,2.8,3,2.4,3.8]); partial.personality.factors[1].answered=4; partial.personality.attempted=44;
export const samples={
  mock:report([3,2.8,3,2.4,3.8]), midpoint:report([3,3,3,3,3]), lower:report([1.1,1.2,1.1,1.2,1.1]), upper:report([4.9,4.8,4.9,4.8,4.9]),
  mixed:report([1,5,2,4,3]), incomplete:partial, unavailable:report(null),
  longname:report([3,2.8,3,2.4,3.8],{first:'Alexander-Tsholofelo',last:'van der Merwe-Ndlovu-Montgomery'}),
  multilingual:report([3,2.8,3,2.4,3.8],{first:'Αλέξανδρος',last:'Александрова Élodie'}),
  maxname:report([3,2.8,3,2.4,3.8],{first:'Alexander'.repeat(11),last:'Montgomery'.repeat(10)}),
};
export const invalid=report([0,3,3,3,3]);
