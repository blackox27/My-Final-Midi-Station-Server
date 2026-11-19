import model from './review-model.js';
import {annotateNoteEvidence} from './note-evidence.js';
import {clamp} from './dsp.js';

export function predictNoteReliability(features){
  if(features.length!==model.features||features.some(v=>!Number.isFinite(v)))throw new Error('REVIEW_FEATURES');
  const x=features.map((v,i)=>clamp((v-model.mean[i])/model.std[i],-7,7));let z=model.b2;
  for(let j=0;j<model.hidden;j++){let h=model.b1[j];for(let i=0;i<x.length;i++)h+=x[i]*model.w1[i*model.hidden+j];z+=Math.max(0,h)*model.w2[j];}
  return 1/(1+Math.exp(-clamp(z,-30,30)));
}

export async function reviewNotes(audio,input,params={},progress=()=>{},cancelled=()=>false,cache=new Map()){
  const mode=params.noteReview||'balanced';
  if(mode==='off')return {notes:input.map(n=>({...n})),candidates:[]};
  const annotated=await annotateNoteEvidence(audio,input,progress,cancelled,cache),notes=[],candidates=[];
  const threshold=mode==='precise'?model.preciseThreshold:model.balancedThreshold;
  for(const annotatedNote of annotated){
    const {reviewFeatures,...n}=annotatedNote;
    // This critic was trained on neural proposals within this pitch range.
    // Classical engines and unrepresented extremes are never silently rejected.
    if(!n.neuralEvidence||n.drum||n.pitch<model.minPitch||n.pitch>model.maxPitch){notes.push({...n,reviewMethod:'acoustic-only'});continue;}
    const noteReliability=predictNoteReliability(reviewFeatures),candidate={...n,noteReliability,reviewMethod:'note-reviewer-v1'};
    if(noteReliability>=threshold)notes.push(candidate);else candidates.push({...candidate,reviewReason:'low-model-evidence'});
  }
  return {notes,candidates};
}
