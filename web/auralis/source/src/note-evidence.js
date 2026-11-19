import {SR,hz,clamp,fftMagnitude} from './dsp.js';
const bound=(a,t)=>{let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m]<t)lo=m+1;else hi=m;}return Math.min(lo,Math.max(0,a.length-1));};

// Compact statistics are passed to the DSP worker instead of copying all logits.
export function attachNeuralEvidence(a,notes){
  return notes.map(n=>{
    const k=n.pitch-21,lo=bound(a.times,Math.max(0,n.start)),hi=Math.max(lo+1,bound(a.times,n.start+n.duration));
    let peak=0,occupied=0,head=0,tail=0,headN=0,tailN=0;
    for(let t=lo;t<Math.min(hi,a.times.length);t++){const f=a.frames[t*88+k];peak=Math.max(peak,f);if(f>=.3)occupied++;if(t<lo+5){head+=f;headN++;}if(t>=hi-5){tail+=f;tailN++;}}
    const nearLo=bound(a.times,Math.max(0,n.start-.04)),nearHi=Math.min(a.times.length,bound(a.times,Math.min(n.start+.12,n.start+n.duration)));
    let onset=0,onsetTime=n.start,slope=0,parentFrame=0,parentOnset=0,competition=0;
    for(let t=nearLo;t<nearHi;t++){
      const o=a.onsets[t*88+k];if(o>onset){onset=o;onsetTime=a.times[t];}
      slope=Math.max(slope,a.frames[t*88+k]-(t>=3?a.frames[(t-3)*88+k]:0));
      for(const semitones of [12,19,24,28,31]){const p=k-semitones;if(p>=0){parentFrame=Math.max(parentFrame,a.frames[t*88+p]);parentOnset=Math.max(parentOnset,a.onsets[t*88+p]);}}
      for(let p=0;p<88;p++)if(p!==k)competition=Math.max(competition,a.frames[t*88+p]);
    }
    return {...n,neuralEvidence:{peak,onset,occupancy:occupied/Math.max(1,hi-lo),slope,parentFrame,parentOnset,onsetOffset:onsetTime-n.start,tailRatio:(tail/Math.max(1,tailN))/(head/Math.max(1,headN)+1e-6),competition}};
  });
}

export function reviewFeatures(audio,n,cache=new Map()){
  const N=4096,f0=hz(n.pitch),centers=[n.start-.085,n.start+Math.min(.05,n.duration*.25),n.start+Math.min(.22,n.duration*.55),n.start+n.duration-.03];
  const measurements=centers.map(time=>{
    const center=Math.round(time*SR/128)*128;let s=cache.get(center);
    if(!s){const at=center-N/2,block=new Float32Array(N),lo=Math.max(0,at),hi=Math.min(audio.length,at+N);if(hi>lo)block.set(audio.subarray(lo,hi),lo-at);s=fftMagnitude(block,N);if(cache.size>=512)cache.delete(cache.keys().next().value);cache.set(center,s);}
    let total=0,max=0;for(let i=1;i<s.length;i++){total+=s[i]*s[i];max=Math.max(max,s[i]);}
    let harmonic=0,noise=0,energy=0,fund=0,upper=0;
    for(let h=1;h<=8;h++){
      const k=Math.round(f0*h*N/SR);if(k>=s.length-4)break;
      const amp=Math.max(s[k-1]||0,s[k]||0,s[k+1]||0),floor=((s[k-3]||0)+(s[k+3]||0))*.5;
      harmonic+=amp/h;noise+=floor/h;energy+=amp*amp;
      if(h===1)fund=amp;else upper+=amp/(h-1);
    }
    return {level:harmonic,noise,support:harmonic/(harmonic+noise+1e-9),fraction:clamp(energy/(total+1e-12),0,1),fundamental:fund/(max+1e-9),fundShare:fund/(harmonic+1e-9),upper:upper/(harmonic+1e-9),rms:Math.sqrt(total),flat:noise/(harmonic+1e-9)};
  });
  const [before,early,middle,end]=measurements,e=n.neuralEvidence||{},ratio=(a,b)=>clamp(Math.log((a+1e-7)/(b+1e-7)),-5,5)/5;
  const x=[
    n.confidence??.5,e.onset||0,e.peak||0,e.occupancy||0,e.slope||0,e.parentFrame||0,e.parentOnset||0,
    clamp(Math.log(Math.max(.025,n.duration)/.4),-3,3)/3,(n.pitch-64)/48,clamp((e.onsetOffset||0)/.12,-1,1),
    middle.fundamental,middle.support,middle.fraction,clamp(middle.fundShare,0,1),
    ratio(early.level,before.level),ratio(middle.level,early.level),ratio(end.level,middle.level),
    Math.log1p(middle.level*100)/5,Math.log1p(middle.rms*100)/5,clamp(middle.flat,0,2)/2,
    clamp(middle.upper,0,4)/4,clamp(e.tailRatio||0,0,3)/3,e.competition||0,early.support
  ];
  return x.map(v=>Number.isFinite(v)?v:0);
}

export async function annotateNoteEvidence(audio,notes,progress=()=>{},cancelled=()=>false,cache=new Map()){
  const out=[];
  for(let i=0;i<notes.length;i++){
    if(cancelled())throw new Error('CANCELLED');const n=notes[i],features=reviewFeatures(audio,n,cache);
    out.push({...n,reviewFeatures:features,spectralSupport:features[11]});
    if(i%64===0){progress(i/Math.max(1,notes.length));await new Promise(r=>setTimeout(r,0));}
  }progress(1);return out;
}
