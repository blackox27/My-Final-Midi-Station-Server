import model from './timbre-model.js';
import {FAMILIES,timbreFeatures} from './timbre-features.js';
import {clamp,yieldTask} from './dsp.js';
export {FAMILIES};

export function predictTimbre(features){
  if(features.length!==model.features)throw new Error('TIMBRE_FEATURES');
  const x=features.map((v,i)=>clamp((v-model.mean[i])/model.std[i],-8,8)),h=new Float64Array(model.hidden),z=new Float64Array(model.classes);
  for(let j=0;j<h.length;j++){let sum=model.b1[j];for(let i=0;i<x.length;i++)sum+=x[i]*model.w1[i*h.length+j];h[j]=Math.max(0,sum);}
  for(let k=0;k<z.length;k++){let sum=model.b2[k];for(let j=0;j<h.length;j++)sum+=h[j]*model.w2[j*z.length+k];z[k]=sum/model.temperature;}
  const max=Math.max(...z);let total=0;for(let k=0;k<z.length;k++){z[k]=Math.exp(z[k]-max);total+=z[k];}for(let k=0;k<z.length;k++)z[k]/=total;
  return Array.from(z);
}

export async function classifyInstrumentNotes(audio,notes,progress=()=>{},cancelled=()=>false,params={},cache=new Map()){
  const result=[],spectra=new Map(),prior={piano:0,guitar:3,bass:4,voice:6}[params.preset];
  for(let i=0;i<notes.length;i++){
    if(cancelled())throw new Error('CANCELLED');const n=notes[i];let family,confidence,method='timbre-network';
    if(n.drum){family=12;confidence=n.confidence||.5;method='percussion';}
    else if(prior!==undefined){family=prior;confidence=0;method='selected-material';}
    else{
      const key=`${n.pitch}:${n.start.toFixed(4)}:${n.duration.toFixed(4)}`;let probs=cache.get(key);
      if(!probs){probs=predictTimbre(timbreFeatures(audio,n,spectra));if(cache.size>=12000)cache.delete(cache.keys().next().value);cache.set(key,probs);}
      const ranking=probs.map((p,k)=>({p,k})).sort((a,b)=>b.p-a.p);family=ranking[0].k;confidence=ranking[0].p;
      // An uncertain label is preferable to forcing every note into a named instrument.
      if(confidence<.42||ranking[0].p-ranking[1].p<.1)family=11;
    }
    result.push({...n,instrumentFamily:FAMILIES[family].id,instrumentConfidence:confidence,instrumentMethod:method,instrumentTrack:family});
    if(i%64===0){progress(i/Math.max(1,notes.length));await yieldTask();}
  }
  progress(1);return result;
}
