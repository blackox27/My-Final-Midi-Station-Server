import * as tf from '@tensorflow/tfjs';
import {setWasmPaths,setThreadsCount} from '@tensorflow/tfjs-backend-wasm';
import {outputToNotesPoly,addPitchBendsToNoteEvents} from '@spotify/basic-pitch';
import {SR,hz,clamp,yieldTask,fftMagnitude} from './dsp.js';
import {decodeActivations} from './note-decoder.js';
import {attachNeuralEvidence} from './note-evidence.js';
let modelPromise,backend='',cacheHit=false;
export function aiStatus(){return {loaded:!!modelPromise,backend,tensors:tf.memory().numTensors,cacheHit};}
export async function loadModel(onStatus=()=>{}){
  if(!modelPromise)modelPromise=(async()=>{
    onStatus('loading');const candidates=[];
    if(globalThis.AURALIS_WASM_PATH||globalThis.AURALIS_WASM){
      setThreadsCount(1);tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT',false);
      setWasmPaths(globalThis.AURALIS_WASM_PATH||globalThis.AURALIS_WASM,!!globalThis.AURALIS_WASM);
      candidates.push('wasm');
    }
    candidates.push('webgl','cpu');
    const data=globalThis.AURALIS_MODEL;if(!data)throw new Error('MODEL_MISSING');
    const raw=atob(data.weights),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    let lastError;
    for(const name of candidates){let model;
      try{
        if(!await tf.setBackend(name))continue;await tf.ready();
        model=await tf.loadGraphModel(tf.io.fromMemory({modelTopology:data.modelTopology,weightSpecs:data.weightSpecs,weightData:bytes.buffer,format:'graph-model',signature:data.signature}));
        // Probe every graph operation before committing to a backend.
        const probe=tf.tidy(()=>model.execute(tf.zeros([1,43844,1]),['Identity_1','Identity_2','Identity']));
        try{await Promise.all(probe.map(t=>t.data()));}finally{probe.forEach(t=>t.dispose());}
        backend=name==='wasm'?'WASM'+(tf.env().getBool('WASM_HAS_SIMD_SUPPORT')?' · SIMD':''):name==='webgl'?'WebGL':'CPU';return model;
      }catch(e){lastError=e;model?.dispose();}
    }
    throw lastError||new Error('MODEL_MISSING');
  })().catch(e=>{modelPromise=null;throw e;});return modelPromise;
}

export async function inferActivations(audio,params,progress=()=>{},cancelled=()=>false){
  const model=await loadModel(),windowSize=43844,half=3840,hop=36164,rows=142;
  const count=Math.max(1,Math.ceil((audio.length+half-windowSize)/hop)+1),maxRows=count*rows;
  const frames=new Float32Array(maxRows*88),onsets=new Float32Array(maxRows*88),contours=params.bends?new Float32Array(maxRows*264):null,times=new Float64Array(maxRows);
  let cursor=0,skipped=0;
  for(let i=0;i<count;i++){
    if(cancelled())throw new Error('CANCELLED');const start=i*hop-half,block=new Float32Array(windowSize);
    const lo=Math.max(0,start),hi=Math.min(audio.length,start+windowSize);if(hi>lo)block.set(audio.subarray(lo,hi),lo-start);
    let peak=0;for(let k=0;k<block.length;k++)peak=Math.max(peak,Math.abs(block[k]));
    const valid=Math.max(0,Math.min(rows,Math.ceil((audio.length-i*hop)/256)));
    if(peak>1e-6){
      const tensors=tf.tidy(()=>{
        const out=model.execute(tf.tensor3d(block,[1,windowSize,1]),['Identity_1','Identity_2','Identity']);
        return out.map(t=>t.slice([0,15,0],[1,rows,t.shape[2]]).reshape([rows,t.shape[2]]));
      });
      try{
        frames.set((await tensors[0].data()).subarray(0,valid*88),cursor*88);
        onsets.set((await tensors[1].data()).subarray(0,valid*88),cursor*88);
        if(contours)contours.set((await tensors[2].data()).subarray(0,valid*264),cursor*264);
      }finally{tensors.forEach(t=>t.dispose());}
    }else skipped++;
    for(let j=0;j<valid;j++)times[cursor+j]=(i*hop+j*256)/SR;
    cursor+=valid;progress((i+1)/count);await yieldTask();
  }
  return {frames:frames.subarray(0,cursor*88),onsets:onsets.subarray(0,cursor*88),contours:contours?.subarray(0,cursor*264),times:times.subarray(0,cursor),duration:audio.length/SR,skippedWindows:skipped};
}

export async function transcribeAI(audio,params,progress=()=>{},cancelled=()=>false,cache={}){
  if(!audio.length){cache.activations=null;cacheHit=false;return [];}
  cacheHit=cache.audioRef===audio&&!!cache.activations&&(!params.bends||!!cache.activations.contours);
  const a=cacheHit?cache.activations:await inferActivations(audio,params,progress,cancelled);
  if(cancelled())throw new Error('CANCELLED');cache.activations=a;cache.audioRef=audio;progress(1);
  if(params.profile!=='detailed')return attachNeuralEvidence(a,decodeActivations(a,params));
  // Original residual decoder retained for detailed comparison.
  const matrix=(flat,width)=>Array.from({length:a.times.length},(_,i)=>Array.from(flat.subarray(i*width,(i+1)*width)));
  let events=outputToNotesPoly(matrix(a.frames,88),matrix(a.onsets,88),.7-params.sensitivity*.42,.46-params.sensitivity*.29,Math.max(2,Math.round(params.minMs/1000*SR/256)),true,hz(params.maxPitch+.49),hz(params.minPitch-.49),true,Math.max(1,Math.round(params.gapMs/1000*SR/256)));
  if(params.bends&&a.contours)events=addPitchBendsToNoteEvents(matrix(a.contours,264),events,6);
  const timeAt=index=>a.times[Math.min(index,a.times.length-1)]+Math.max(0,index-a.times.length+1)*256/SR;
  return attachNeuralEvidence(a,events.map(n=>{const start=timeAt(n.startFrame);return {pitch:n.pitchMidi,start,duration:Math.min(a.duration,timeAt(n.startFrame+n.durationFrames))-start,velocity:clamp(Math.round(n.amplitude**.65*127),12,124),confidence:clamp(n.amplitude,0,1),source:'basic-pitch',bends:(n.pitchBends||[]).filter((_,i)=>i%3===0).map((b,i)=>({time:Math.max(0,timeAt(n.startFrame+i*3)-start),cents:b*100/3}))};}));
}

export async function validateSpectralSupport(audio,notes,progress=()=>{}){
  const result=[],spectra=new Map();
  for(let index=0;index<notes.length;index++){
    const n=notes[index],at=Math.max(0,Math.round(((n.start+Math.min(.06,n.duration*.3))*SR-1024)/128)*128);
    let s=spectra.get(at);if(!s){s=fftMagnitude(audio.subarray(at,at+2048),2048);if(spectra.size>256)spectra.delete(spectra.keys().next().value);spectra.set(at,s);}
    let support=0,noise=0;for(let h=1;h<=5;h++){const k=hz(n.pitch)*h*2048/SR;if(k>=s.length-2)break;const b=Math.round(k);support+=Math.max(s[b-1]||0,s[b]||0,s[b+1]||0)/h;noise+=(s[b-3]||0)+(s[b+3]||0);}
    result.push({...n,spectralSupport:support/(support+noise*.5+1e-8)});
    if(index%100===0){progress(index/notes.length);await yieldTask();}
  }progress(1);return result;
}
