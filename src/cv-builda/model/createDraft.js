export function createEmptyDraft() {
  return { file:null, fragments:[], personal:{name:'',contact:'',details:[]}, summary:'', qualifications:[], certifications:[], skills:[], experience:[], notes:[], suggestions:[], templateId:'standard', warnings:[], acknowledgedWarnings:[], generation:{status:'idle',error:null} };
}
