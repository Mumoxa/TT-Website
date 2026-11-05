export const RESULT_CAVEAT='This is a short practical screening. It shows how you did on the items tested, not your overall ability.';
const percent=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Math.round(Number(value)*100)/100)):0;
// Feedback is banded by the percentage shown beside it. It never repeats or re-cases the section
// title, so acronyms such as VAT keep their capitals and numbered titles read cleanly.
export function sectionFeedback(value){
 if(value>=75)return 'A strong result in this section.';
 if(value>=50)return 'A reasonable result. There is room to improve in this section.';
 return 'This section needs more practice.';
}
// Deliberate allowlist: never expose the grader's item review, keys or interpretation.
export function candidateResult(row) {
 if(!row||row.overall_score===null||row.overall_score===undefined)return null;
 let breakdown;try{breakdown=JSON.parse(row.breakdown_json);}catch{breakdown={};}
 const sections=Array.isArray(breakdown.sections)?breakdown.sections.map(section=>({title:String(section.title),percentage:percent(section.percent)})):[{title:'Accounting questions',percentage:percent(row.knowledge_score/40*100)},{title:'Practical workbook',percentage:percent(row.reconciliation_score/60*100)}];
 return {overall_score:percent(row.overall_score),sections:sections.map(section=>({...section,feedback:sectionFeedback(section.percentage)})),caveat:RESULT_CAVEAT};
}
