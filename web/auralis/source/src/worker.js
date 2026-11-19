import {analyze,transcribeMono,transcribeSpectral,transcribeDrums} from './dsp.js';
import {classifyInstrumentNotes} from './instruments.js';
import {reviewNotes} from './note-review.js';
let currentKey,source,analyses={},features=new Map(),spectra=new Map(),spectralCache={};
self.onmessage=async event=>{
  const {id,task,audio,cacheKey,params,analysis:existingAnalysis}=event.data;
  const progress=(stage,p)=>postMessage({id,type:'progress',stage,p});
  try{
    if(audio){source=audio;if(currentKey!==cacheKey){currentKey=cacheKey;analyses={};features.clear();spectra.clear();spectralCache={};}}
    if(!source)throw new Error('WORKER_AUDIO_MISSING');
    const kind=params.profile==='fast'?'fast':'full';
    const data=existingAnalysis||analyses[kind]||await analyze(source,22050,p=>progress('analysis',p),()=>false,params);analyses[kind]=data;
    let notes=null,candidates=[];
    if(task==='mono')notes=await transcribeMono(source,data,params,p=>progress('transcribe',p));
    if(task==='spectral')notes=await transcribeSpectral(source,data,params,p=>progress('transcribe',p),()=>false,spectralCache);
    if(task==='drums')notes=transcribeDrums(data,params);
    if(task==='instruments')notes=await classifyInstrumentNotes(source,params.notes,p=>progress('instruments',p),()=>false,params,features);
    if(task==='review'){const reviewed=await reviewNotes(source,params.notes,params,p=>progress('review',p),()=>false,spectra);notes=reviewed.notes;candidates=reviewed.candidates;}
    postMessage({id,type:'result',analysis:['instruments','review'].includes(task)?null:data,notes,candidates});
  }catch(e){postMessage({id,type:'error',message:e.message});}
};
