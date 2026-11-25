// Invented testing data only. This is not the restricted Form A content or key.
export function syntheticHrPackage() {
  const source = Array.from({length: 5}, (_, i) => ({ id: `EMP-${201+i}`, surname: `Example${i}`, start_date: '2027-01-01', employment_type: 'Permanent', monthly_salary_cents: 1000000 + i * 10000 }));
  const initial = structuredClone(source);
  initial[0].surname = 'Typo'; initial[0].start_date = '2027-01-02'; initial[0].monthly_salary_cents = 1;
  initial[1].surname = 'Other'; initial[1].employment_type = 'Fixed-term'; initial[2].monthly_salary_cents = 1;
  const file_inventory = source.map((row) => ({ id: row.id, signed_contract: 'Present', identity_verification: 'Present', banking_confirmation: 'Present' }));
  const base = (id, renderer, seconds, max_points) => ({id, renderer, seconds, max_points, title: `${id} synthetic task`, instructions: 'Synthetic testing instructions only.'});
  const options = [{id:'A',text:'First choice'}, {id:'B',text:'Second choice'}, {id:'C',text:'Third choice'}];
  const scenarios = Array.from({length:5}, (_, i) => ({id:`S${i+1}`, prompt:'A synthetic scenario prompt.', options}));
  const priorities = {prompt:'Select two synthetic priorities.', options:Array.from({length:5},(_,i)=>({id:`P${i+1}`,text:`Priority number ${i+1}`}))};
  const items = Array.from({length:6}, (_,i)=>({id:`Q${i+1}`, prompt:'A synthetic question prompt.', type:'single', options}));
  const rule_items = Array.from({length:3}, (_,i)=>({id:`R${i+1}`, prompt:'A synthetic rule question.', type:'single', options}));
  const workbook = { source: { B2:'1', C2:'2', D2:'1', B3:'3', C3:'1', D3:'2', B4:'4', C4:'2', D4:'1' } };
  const question_payload = { format:'hr-generalist-v1', assessment_id:'HR-GEN-001', form_id:'A', status:'pilot', validation_status:'unvalidated', max_standard_seconds:1200, intro_seconds:60, modules:[
    {...base('HR01','record_verification',240,25), source, initial, file_inventory},
    {...base('HR02','situational_judgement',240,25), procedure:'Synthetic fictional procedure for testing.', scenarios, priorities},
    {...base('HR03','applied_reasoning',240,20), items, procedure:{codes:['A','B','C','D'].map(code=>({code,label:`Code ${code}`})),restriction:'Synthetic restriction applies.'}, rule_items},
    {...base('HR04','audio_to_email',240,15), recipient:'Example recipient', audio:{asset_id:'synthetic-audio',duration_seconds:30,replays_allowed:1,max_subject_chars:500,max_body_chars:4000}},
    {...base('HR05','spreadsheet_reconciliation',180,15), workbook, payroll:{approved:100,draft:110,items:[{id:'PAY03',prompt:'Select a synthetic action.',type:'single',options}]}},
  ]};
  const scoring_key = {rubric_id:'HR04-EMAIL-V1', modules:{
    HR01:{expected:Object.fromEntries(source.map(({id,...row})=>[id,row])),file_expected:Object.fromEntries(source.map(({id})=>[id,{status:'complete',missing:[]}]))},
    HR02:{scenarios:Object.fromEntries(scenarios.map(({id})=>[id,{answer:'A',option_points:{A:4,B:2,C:0},flag_for:{C:'SYNTHETIC_FLAG'}}])),priorities:{points:{P1:3,P2:2}}},
    HR03:{items:Object.fromEntries([...items.map(i=>[i.id,{answer:'A',points:2}]),...rule_items.map((i,n)=>[i.id,{answer:'A',points:n===0?4:2}])])},
    HR04:{transcript:'Private synthetic instruction.',criteria:Array.from({length:9},(_,i)=>({id:`C${i+1}`,label:`Test criterion ${i+1}`,max:i<6?2:1,allowed:i<6?[0,1,2]:[0,1]}))},
    HR05:{cells:{E2:{value:2,value_points:1,formula_points:1},E3:{value:2,value_points:1,formula_points:1},E4:{value:5,value_points:1,formula_points:1},E5:{value:9,value_points:2,formula_points:2}},payroll:{PAY01:{answer_cents:1000,points:2},PAY02:{answer_percent:10,points:2},PAY03:{answer:'A',points:1,flag_for:{C:'SYNTHETIC_PAY_FLAG'}}}},
  }};
  return { question_payload, scoring_key };
}
