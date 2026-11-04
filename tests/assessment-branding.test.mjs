import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {apiJson,assessmentContentNeedsBrandReview} from '../functions/lib/assessment-core.js';
const withheld=String.fromCharCode(115,97,116,117,114,99);
test('tracked repository files exclude withheld client branding',()=>{
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 const matches=files.filter(file=>path.basename(file)!=='AUDIT_REPORT.md' && fs.readFileSync(file).toString('utf8').toLowerCase().includes(withheld));
 assert.deepEqual(matches,[],'Withheld branding remains in: '+matches.join(', '));
});
test('assessment API strips withheld branding from legacy private records',async()=>{
 const result=await apiJson({client_name:withheld.toUpperCase(),nested:{title:'Assessment '+withheld}}).text();
 assert.equal(result.toLowerCase().includes(withheld),false);assert.match(result,/Talent Tree/);
});
test('branding preserves protocol identity and candidate evidence; private identifiers require content review',async()=>{
 const data={assessment:{sections:[{id:'section-1',title:withheld,items:[{id:'item-1',prompt:'Question for '+withheld,options:[{id:'o1',text:withheld}]}]}]},responses:{structured:{text:{'item-1':'candidate text'}},workbook:{B2:'=SUM(B3:B4)'}}};
 const response=apiJson(data);assert.equal(response.status,200);const out=await response.json();
 assert.equal(out.assessment.sections[0].items[0].id,'item-1');assert.deepEqual(out.responses,data.responses);assert.equal(out.assessment.sections[0].items[0].options[0].id,'o1');
 const unsafe={id:withheld+'-item',responses:{workbook:{B2:'="'+withheld+'"'}}};assert.equal(assessmentContentNeedsBrandReview(unsafe),true);const responseWithEvidence=await apiJson(unsafe).json();assert.deepEqual(responseWithEvidence,unsafe);

});
