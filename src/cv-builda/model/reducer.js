import { createEmptyDraft } from './createDraft';
const updateById=(xs,id,fn)=>xs.map(x=>x.id===id?fn(x):x);
const addToDestination=(state,destination,value,metadata={})=>{
 const text=String(value||'').trim(); if(!text)return state;
 if(destination==='summary')return {...state,summary:state.summary?`${state.summary}\n\n${text}`:text};
 const id=`record-${Date.now()}-${Math.random()}`;
 const provenance=metadata.provenance||'staff', sourceFragmentId=metadata.sourceFragmentId;
 const provenanceFields={provenance,...(sourceFragmentId?{sourceFragmentId}:{})};
 if(destination==='skills')return {...state,skills:[...state.skills,{id,detail:text,...provenanceFields}]};
 if(destination==='education'||destination==='qualifications')return {...state,qualifications:[...state.qualifications,{id,detail:text,year:'',qualification:'',institution:'',...provenanceFields}]};
 if(destination==='employment')return {...state,experience:[...state.experience,{id,employer:'',title:'',duration:'',reason:'',responsibilities:[text],...provenanceFields}]};
 return {...state,certifications:[...state.certifications,{id,name:text,...provenanceFields}]};
};
export function cvReducer(state, action) {
 switch(action.type){
 case 'LOAD_EXTRACTION': return {...createEmptyDraft(),file:action.file,fragments:action.fragments,warnings:action.warnings||[]};
 case 'SET_FIELD': return {...state,[action.field]:action.value};
 case 'SET_PERSONAL': return {...state,personal:{...state.personal,[action.field]:action.value}};
 case 'ADD_RECORD': return {...state,[action.collection]:[...state[action.collection],action.record]};
 case 'UPDATE_RECORD': return {...state,[action.collection]:updateById(state[action.collection],action.id,x=>({...x,...action.changes}))};
 case 'REMOVE_RECORD': return {...state,[action.collection]:state[action.collection].filter(x=>x.id!==action.id)};
 case 'REORDER_RECORD': {const a=[...state[action.collection]],i=a.findIndex(x=>x.id===action.id),[x]=a.splice(i,1);a.splice(Math.max(0,Math.min(action.index,a.length)),0,x);return {...state,[action.collection]:a};}
 case 'ASSIGN_FRAGMENT': {const fragment=state.fragments.find(x=>x.id===action.id);if(!fragment||fragment.coverage!=='unreviewed')return state;const next={...state,fragments:updateById(state.fragments,action.id,x=>({...x,coverage:'assigned',destination:action.destination}))};return addToDestination(next,action.destination,fragment.originalText||fragment.text,{provenance:'source',sourceFragmentId:fragment.id});}
 case 'EXCLUDE_FRAGMENT': return {...state,fragments:updateById(state.fragments,action.id,x=>({...x,coverage:'excluded'}))};
 case 'RESTORE_FRAGMENT': return {...state,fragments:updateById(state.fragments,action.id,x=>({...x,coverage:'unreviewed',destination:null}))};
 case 'ADD_NOTES': return {...state,notes:[...state.notes,...action.notes]};
 case 'DECIDE_NOTE': {const note=state.notes.find(x=>x.id===action.id);const next={...state,notes:updateById(state.notes,action.id,x=>({...x,...action.decision}))};return action.decision.status==='approved'?addToDestination(next,action.decision.destination,note?.text):next;}
 case 'RECEIVE_SUGGESTIONS': return {...state,suggestions:[...state.suggestions,...action.suggestions.map((x,i)=>({...x,id:x.id||`suggestion-${Date.now()}-${i}`,status:'pending'}))]};
 case 'UPDATE_SUGGESTION': return {...state,suggestions:updateById(state.suggestions,action.id,x=>({...x,...action.changes}))};
 case 'DECIDE_SUGGESTION': {const suggestion=state.suggestions.find(x=>x.id===action.id);const next={...state,suggestions:updateById(state.suggestions,action.id,x=>({...x,...action.decision})),notes:updateById(state.notes,suggestion?.fragmentId,x=>({...x,status:action.decision.status,destination:action.decision.destination||suggestion?.destination}))};return action.decision.status==='approved'?addToDestination(next,action.decision.destination||suggestion?.destination,suggestion?.proposedText||suggestion?.originalText):next;}
 case 'SELECT_TEMPLATE': return {...state,templateId:action.templateId};
 case 'ACKNOWLEDGE_WARNING': return {...state,acknowledgedWarnings:[...state.acknowledgedWarnings,action.id]};
 case 'GENERATION_STATUS': return {...state,generation:{status:action.status,error:action.error||null}};
 case 'RESET': return createEmptyDraft(); default:return state;
 }
}
