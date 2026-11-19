import {sanitizeNotes,clamp} from './dsp.js';

// Validate every collection before the UI commits a new project to the queue.
export function parseProject(obj,fallbackName='Project'){
  if(!obj||obj.format!=='auralis-project'||obj.version!==1)throw new Error('INVALID_PROJECT');
  const notes=sanitizeNotes(obj.notes),baseNotes=sanitizeNotes(obj.baseNotes??obj.notes);
  const candidates=sanitizeNotes(obj.candidates??[]).map(n=>({...n,id:'candidate-'+n.id}));
  const baseCandidates=sanitizeNotes(obj.baseCandidates??obj.candidates??[]).map(n=>({...n,id:'candidate-'+n.id}));
  if(notes.length+candidates.length>200000||baseNotes.length+baseCandidates.length>200000)throw new Error('INVALID_PROJECT');
  const number=(v,fallback,min,max)=>Number.isFinite(Number(v))?clamp(Number(v),min,max):fallback;
  return {
    name:(typeof obj.name==='string'&&obj.name?obj.name:String(fallbackName)).slice(0,200),notes,baseNotes,candidates,baseCandidates,
    duration:[...notes,...candidates].reduce((d,n)=>Math.max(d,n.start+n.duration),number(obj.duration,0,0,86400)),bpm:number(obj.bpm,120,20,300),
    programs:Array.from({length:16},(_,i)=>Math.round(number(obj.programs?.[i],0,0,127))),
    trackNames:Array.from({length:16},(_,i)=>typeof obj.trackNames?.[i]==='string'?obj.trackNames[i].slice(0,120):`Track ${i+1}`)
  };
}
