import {describe,expect,it,vi} from 'vitest';
import {createEmptyDraft} from '../../src/cv-builda/model/createDraft';
import {cvReducer} from '../../src/cv-builda/model/reducer';
import {validateForExport} from '../../src/cv-builda/model/validation';
const state=()=>({...createEmptyDraft(),file:{name:'cv.docx'},fragments:[{id:'f1',text:'COBOL',originalText:'COBOL',coverage:'unreviewed',location:{order:1}}]});
describe('factual review state',()=>{
 it('assigns source wording to the chosen destination and retains the original',()=>{const next=cvReducer(state(),{type:'ASSIGN_FRAGMENT',id:'f1',destination:'skills'});expect(next.fragments[0]).toMatchObject({originalText:'COBOL',coverage:'assigned',destination:'skills'});expect(next.skills[0].detail).toBe('COBOL')});
 it('marks assigned values as source content and links them to the original fragment',()=>{const next=cvReducer(state(),{type:'ASSIGN_FRAGMENT',id:'f1',destination:'skills'});expect(next.skills[0]).toMatchObject({provenance:'source',sourceFragmentId:'f1'})});
 it('does not duplicate a fragment that is already assigned',()=>{let next=cvReducer(state(),{type:'ASSIGN_FRAGMENT',id:'f1',destination:'skills'});next=cvReducer(next,{type:'ASSIGN_FRAGMENT',id:'f1',destination:'skills'});expect(next.skills).toHaveLength(1)});
 it('does not apply a suggestion until approval',()=>{let next=cvReducer(state(),{type:'RECEIVE_SUGGESTIONS',suggestions:[{fragmentId:'f1',originalText:'Led team',proposedText:'Led the team',destination:'summary'}]});expect(next.summary).toBe('');next=cvReducer(next,{type:'DECIDE_SUGGESTION',id:next.suggestions[0].id,decision:{status:'approved',destination:'summary'}});expect(next.summary).toBe('Led the team')});
 it('blocks export for unreviewed source and pending notes',()=>{const draft={...state(),notes:[{id:'n1',text:'Fact',status:'pending'}]};expect(validateForExport(draft)).toEqual({valid:false,errors:['Review every source fragment.','Decide every additional note.']})});
 it('fully resets memory state',()=>expect(cvReducer({...state(),summary:'private'}, {type:'RESET'})).toEqual(createEmptyDraft()));
});
