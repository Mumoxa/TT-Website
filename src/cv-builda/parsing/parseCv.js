const aliases={summary:['professional summary','profile','summary'],qualifications:['education','qualifications'],certifications:['certifications','certificates'],skills:['technical skills','skills'],experience:['work experience','employment history','career history']};
const heading=x=>Object.entries(aliases).find(([,a])=>a.includes(x.trim().replace(/:$/,'').toLowerCase()))?.[0];

// Experience is only recognised when employer, title, and a date range are
// explicitly separated. Ambiguous lines stay visible in Unclassified Information.
const experienceLine = text => {
  const parts=text.split(/\s*(?:\||\t)\s*/).map(x=>x.trim()).filter(Boolean);
  if(parts.length<3||!/^\d{4}\s*(?:-|\u2013|\u2014)\s*(?:\d{4}|present|current)$/i.test(parts[2]))return null;
  return {employer:parts[0],title:parts[1],duration:parts[2]};
};

export function parseCvFragments(fragments){
 const result={summary:'',qualifications:[],certifications:[],skills:[],experience:[],unclassified:[]};let section=null,currentExperience=null;
 for(const f of fragments){
  const h=heading(f.text);if(h){section=h;currentExperience=null;continue;}
  if(section==='summary')result.summary+=(result.summary?'\n\n':'')+f.text;
  else if(section==='skills')result.skills.push(...f.text.split(/[,;•]/).map(x=>x.trim()).filter(Boolean));
  else if(section==='certifications')result.certifications.push({id:f.id,name:f.text,provenance:'source',sourceFragmentId:f.id});
  else if(section==='qualifications')result.qualifications.push({id:f.id,detail:f.text,provenance:'source',sourceFragmentId:f.id});
  else if(section==='experience'){
   const parsed=experienceLine(f.text);
   if(parsed){currentExperience={id:f.id,...parsed,reason:'',responsibilities:[],provenance:'source',sourceFragmentIds:[f.id]};result.experience.push(currentExperience);}
   else if(currentExperience){currentExperience.responsibilities.push(f.text);currentExperience.sourceFragmentIds.push(f.id);}
   else result.unclassified.push(f);
  } else result.unclassified.push(f);
 }
 return result;
}
