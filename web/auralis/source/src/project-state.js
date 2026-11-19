export const captureEditState=job=>structuredClone({notes:job.notes,candidates:job.candidates||[]});
export function restoreEditState(job,value){
  const data=Array.isArray(value)?{notes:value,candidates:[]}:value;
  job.notes=structuredClone(data.notes);job.candidates=structuredClone(data.candidates||[]);
}
export function includeCandidates(job){
  const ids=new Set(job.notes.map(n=>n.id)),added=[];
  for(const n of job.candidates||[])if(!ids.has(n.id)){ids.add(n.id);added.push({...n,reviewReason:'restored-by-user'});}
  job.notes=[...job.notes,...added].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);job.candidates=[];
  return added;
}
