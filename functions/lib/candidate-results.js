export const RESULT_CAVEAT='This is a short practical screening. It shows how you did on the items tested, not your overall ability.';
const percent=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Math.round(Number(value)*100)/100)):0;
// Deliberate allowlist: never expose the grader's item review, keys or interpretation.
export function candidateResult(row) {
 if(!row||row.overall_score===null||row.overall_score===undefined)return null;
 let breakdown;try{breakdown=JSON.parse(row.breakdown_json);}catch{breakdown={};}
 const sections=Array.isArray(breakdown.sections)?breakdown.sections.map(section=>({title:String(section.title),percentage:percent(section.percent)})):[{title:'Accounting questions',percentage:percent(row.knowledge_score/40*100)},{title:'Practical workbook',percentage:percent(row.reconciliation_score/60*100)}];
 return {overall_score:percent(row.overall_score),sections:sections.map(section=>({...section,feedback:section.percentage>=75?`At ${section.percentage}%, your responses show strength in ${section.title.toLowerCase()}.`:`At ${section.percentage}%, ${section.title.toLowerCase()} is an area to develop through further practice.`})),caveat:RESULT_CAVEAT};
}
