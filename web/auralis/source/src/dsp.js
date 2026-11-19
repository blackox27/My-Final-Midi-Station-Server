/* Auralis DSP — MIT. Analysis uses seconds, not an assumed tempo grid. */
export const SR = 22050;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const hz = p => 440 * 2 ** ((p - 69) / 12);
export const pitch = f => 69 + 12 * Math.log2(f / 440);
export const median = a => { if (!a.length) return 0; const b = [...a].sort((x,y)=>x-y); return b[Math.floor(b.length/2)]; };
export const yieldTask = () => new Promise(r => setTimeout(r, 0));

const fftPlans=new Map();
export function fftMagnitude(input, size = input.length) {
  if(size<2||(size&(size-1)))throw new Error('FFT_SIZE');
  let plan=fftPlans.get(size);
  if(!plan){const window=new Float64Array(size),reverse=new Uint32Array(size),stages=[];
    for(let i=0,j=0;i<size;i++){reverse[i]=j;window[i]=.5-.5*Math.cos(2*Math.PI*i/(size-1));let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;}
    for(let len=2;len<=size;len<<=1)stages.push([Math.cos(-2*Math.PI/len),Math.sin(-2*Math.PI/len)]);
    plan={window,reverse,stages,re:new Float64Array(size),im:new Float64Array(size)};if(fftPlans.size>=8)fftPlans.delete(fftPlans.keys().next().value);fftPlans.set(size,plan);
  }
  const {re,im}=plan;im.fill(0);for(let i=0;i<size;i++)re[plan.reverse[i]]=(input[i]||0)*plan.window[i];
  let stage=0;
  for(let len=2;len<=size;len<<=1){ const angle=-2*Math.PI/len;
    const [cr,ci]=plan.stages[stage++];for(let i=0;i<size;i+=len){ let wr=1,wi=0;
      for(let j=0;j<len/2;j++){ const k=i+j,h=k+len/2,tr=wr*re[h]-wi*im[h],ti=wr*im[h]+wi*re[h];
        re[h]=re[k]-tr;im[h]=im[k]-ti;re[k]+=tr;im[k]+=ti;
        const nwr=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=nwr;
      }
    }
  }
  const out = new Float32Array(size/2+1); for(let i=0;i<out.length;i++) out[i]=Math.hypot(re[i],im[i])*2/size; return out;
}

export async function analyze(audio, sr=SR, progress=()=>{}, cancelled=()=>false, options={}) {
  const hop=options.profile==='fast'?512:256,size=1024,count=Math.ceil(audio.length/hop),rms=new Float32Array(count),flux=new Float32Array(count),bands=[];
  let prev=new Float32Array(size/2+1),peak=0,total=0,clipped=0;
  for(let i=0;i<audio.length;i++){const x=audio[i];peak=Math.max(peak,Math.abs(x));total+=x*x;if(Math.abs(x)>=0.999)clipped++;}
  for(let t=0;t<count;t++){
    if(cancelled())throw new Error('CANCELLED');
    const at=t*hop; let energy=0;for(let j=at;j<Math.min(at+hop,audio.length);j++)energy+=audio[j]*audio[j];
    rms[t]=Math.sqrt(energy/hop);
    let block;if(at>=size/2&&at+size/2<=audio.length)block=audio.subarray(at-size/2,at+size/2);
    else {block=new Float32Array(size);const lo=Math.max(0,at-size/2),hi=Math.min(audio.length,at+size/2);if(hi>lo)block.set(audio.subarray(lo,hi),lo-at+size/2);}
    const spec=fftMagnitude(block,size);
    let diff=0,lo=0,mid=0,hi=0;
    for(let k=1;k<spec.length;k++){const x=Math.log1p(40*spec[k]);diff+=Math.max(0,x-prev[k]);prev[k]=x;
      const f=k*sr/size;if(f<180)lo+=spec[k]*spec[k];else if(f<2800)mid+=spec[k]*spec[k];else hi+=spec[k]*spec[k];}
    flux[t]=diff;bands.push([lo,mid,hi]);
    if(t%100===0){progress(t/count);await yieldTask();}
  }
  const onsets=[];let last=-1;
  for(let i=2;i<count-2;i++){
    const local=[];for(let j=Math.max(0,i-12);j<=Math.min(count-1,i+12);j++)local.push(flux[j]);
    const threshold=Math.max(0.07,median(local)*1.8);
    if(flux[i]>threshold&&flux[i]>=flux[i-1]&&flux[i]>flux[i+1]&&rms[i]>0.002){const time=i*hop/sr;if(time-last>0.055){onsets.push(time);last=time;}}
  }
  // Beat hypothesis: normalized autocorrelation of onset strength, with a mild 120-BPM prior.
  const minLag=Math.floor(60*sr/(hop*200)),maxLag=Math.ceil(60*sr/(hop*55)),scores=[];
  const mean=flux.reduce((a,b)=>a+b,0)/Math.max(1,count);let best=-1,bestLag=0;
  for(let lag=minLag;lag<=maxLag;lag++){
    let score=0,norm1=0,norm2=0;
    for(let i=lag;i<count;i++){const a=Math.max(0,flux[i]-mean),b=Math.max(0,flux[i-lag]-mean);score+=a*b;norm1+=a*a;norm2+=b*b;}
    score/=Math.sqrt(norm1*norm2)||1;const bpm=60*sr/(lag*hop);score*=0.9+0.1*Math.exp(-0.5*(Math.log2(bpm/120)/0.9)**2);
    scores.push({bpm:Math.round(bpm*10)/10,score});if(score>best){best=score;bestLag=lag;}
  }
  let tuning=[];
  // Tuning is descriptive, not a forced transposition. Only isolated, dominant peaks vote.
  const tuneStep=Math.max(4096,Math.floor(audio.length/90));
  for(let at=0;options.profile!=='fast'&&at+4096<audio.length;at+=tuneStep){const s=fftMagnitude(audio.subarray(at,at+4096));let k=1;for(let j=2;j<s.length;j++)if(s[j]>s[k])k=j;
    if(k>3&&k<s.length-1&&s[k]>0.004){const a=Math.log(s[k-1]+1e-12),b=Math.log(s[k]+1e-12),c=Math.log(s[k+1]+1e-12),d=clamp(.5*(a-c)/(a-2*b+c||1),-.5,.5);
      const p=pitch((k+d)*sr/4096);if(p>36&&p<96)tuning.push((p-Math.round(p))*100);}}
  progress(1);
  return {sr,hop,rms,flux,onsets,bands,peak,clippedFraction:clipped/Math.max(1,audio.length),rmsTotal:Math.sqrt(total/Math.max(1,audio.length)),
    bpm:best>0.06&&bestLag?Math.round(60*sr/(bestLag*hop)):null,beatConfidence:Math.max(0,best),bpmCandidates:scores.sort((a,b)=>b.score-a.score).slice(0,5),tuningCents:median(tuning),tuningSamples:tuning.length,tuningConfidence:tuning.length>=4?clamp(1-median(tuning.map(v=>Math.abs(v-median(tuning))))/25,0,1):0};
}

export function yinCandidates(audio,sr,minPitch=36,maxPitch=96){
  const minTau=Math.max(2,Math.floor(sr/hz(maxPitch))),maxTau=Math.min(Math.floor(audio.length/2)-2,Math.ceil(sr/hz(minPitch)));
  if(maxTau<minTau)return [];let energy=0;for(const x of audio)energy+=x*x;const rms=Math.sqrt(energy/audio.length);if(rms<.002)return [];
  const n=audio.length-maxTau,d=new Float64Array(maxTau+2);let running=0,preferred=-1,lowest=1;
  for(let tau=1;tau<=maxTau+1;tau++){let sum=0;for(let i=0;i<n;i++){const delta=audio[i]-audio[i+tau];sum+=delta*delta;}running+=sum;d[tau]=running?sum*tau/running:1;}
  for(let tau=minTau;tau<=maxTau;tau++){if(d[tau]<lowest){lowest=d[tau];preferred=tau;}if(d[tau]<.15){while(tau<maxTau&&d[tau+1]<d[tau])tau++;preferred=tau;break;}}
  if(preferred<0||d[preferred]>.35)return [];
  const troughs=[preferred];for(let tau=minTau;tau<=maxTau;tau++)if(tau!==preferred&&d[tau]<.45&&d[tau]<=d[tau-1]&&d[tau]<d[tau+1])troughs.push(tau);
  return troughs.map(tau=>{const a=d[tau-1],b=d[tau],c=d[tau+1],delta=clamp(.5*(a-c)/(a-2*b+c||1),-.5,.5);return {pitch:pitch(sr/(tau+delta)),confidence:1-b,rms,cost:2*b+.16*Math.abs(Math.log2(tau/preferred)),preferred:tau===preferred};}).filter(o=>o.pitch>=minPitch-.5&&o.pitch<=maxPitch+.5).sort((a,b)=>Number(b.preferred)-Number(a.preferred)||a.cost-b.cost).slice(0,6);
}
export function yinFrame(audio,sr,minPitch=36,maxPitch=96){const first=yinCandidates(audio,sr,minPitch,maxPitch)[0];return first||null;}

export function trackPitchCandidates(frames,onsets=[],hopSeconds=.01){
  if(!frames.length)return [];const candidates=frames.map(c=>[...c,{pitch:null,confidence:0,rms:0,cost:c.length?1.45:.04}]);
  const costs=[],back=[];let onsetIndex=0;
  for(let t=0;t<candidates.length;t++){
    const now=t*hopSeconds;while(onsetIndex<onsets.length&&onsets[onsetIndex]<now-.035)onsetIndex++;
    const attack=onsetIndex<onsets.length&&Math.abs(onsets[onsetIndex]-now)<.035;
    const row=new Float64Array(candidates[t].length),links=new Int8Array(row.length);
    for(let k=0;k<row.length;k++){
      const current=candidates[t][k];let best=Infinity,previous=0;
      if(t===0)best=0;
      else for(let j=0;j<candidates[t-1].length;j++){
        const old=candidates[t-1][j];let transition=0;
        if((current.pitch===null)!==(old.pitch===null))transition=.23;
        else if(current.pitch!==null&&old.pitch!==null){const distance=Math.abs(current.pitch-old.pitch);transition=(attack?.018:.075)*Math.min(24,distance);}
        const value=costs[t-1][j]+transition;if(value<best){best=value;previous=j;}
      }
      row[k]=best+current.cost;links[k]=previous;
    }
    const min=Math.min(...row);for(let k=0;k<row.length;k++)row[k]-=min;costs.push(row);back.push(links);
  }
  let state=costs.at(-1).indexOf(Math.min(...costs.at(-1)));const path=new Array(frames.length);
  for(let t=frames.length-1;t>=0;t--){const c=candidates[t][state];path[t]=c.pitch===null?null:c;state=back[t][state];}
  return path;
}

function observationsToNotes(observations, hop, sr, params, onsetTimes=[]) {
  const out=[],active=new Map(),minDuration=params.minMs/1000,gapFrames=Math.max(0,Math.round((params.gapMs??35)/1000*sr/hop));
  const close=(p,event,end)=>{const start=event.start*hop/sr,duration=end*hop/sr-start;if(duration>=minDuration)out.push({pitch:p,start,duration,velocity:clamp(Math.round(Math.sqrt(event.energy/Math.max(1,event.count))*1.8*127),18,120),confidence:event.confidence/event.count,bends:event.bends,source:params.engine});};
  let onsetIndex=0;
  for(let t=0;t<observations.length;t++){
    const time=t*hop/sr;let attack=false;while(onsetIndex<onsetTimes.length&&onsetTimes[onsetIndex]<=time){if(time-onsetTimes[onsetIndex]<hop/sr*1.2)attack=true;onsetIndex++;}
    const seen=new Set();
    for(const o of observations[t]){const p=o.pitch;seen.add(p);let event=active.get(p);
      if(event&&attack&&(t-event.start)*hop/sr>.11&&(o.amplitude||.15)>(event.lastAmplitude||.15)*1.6){close(p,event,t);active.delete(p);event=null;}
      if(!event){event={start:t,last:t,count:0,energy:0,confidence:0,bends:[]};active.set(p,event);}
      event.last=t;event.count++;event.energy+=(o.amplitude||.15)**2;event.confidence+=o.confidence||.5;event.lastAmplitude=o.amplitude||.15;
      if(Number.isFinite(o.cents))event.bends.push({time:time-event.start*hop/sr,cents:o.cents});
    }
    for(const [p,event]of active)if(!seen.has(p)&&t-event.last>gapFrames){close(p,event,event.last+1);active.delete(p);}
  }
  for(const [p,event]of active)close(p,event,event.last+1);
  return out;
}

export async function transcribeMono(audio, analysis, params, progress=()=>{},cancelled=()=>false) {
  // Band-limited decimation halves the lag range and the comparison window.
  const factor=params.maxPitch>96?1:2,sr=SR/factor,step=220/factor,window=2048/factor,decimated=factor===1?audio:new Float32Array(Math.ceil(audio.length/2)),fir=[-.0017,0,.012,.0,-.052,0,.2917,.5,.2917,0,-.052,0,.012,0,-.0017];
  if(factor===2)for(let i=0;i<decimated.length;i++){let x=0;for(let k=0;k<fir.length;k++)x+=(audio[i*2+k-7]||0)*fir[k];decimated[i]=x;}
  const frames=Math.ceil(decimated.length/step),observations=[],candidates=[],block=new Float32Array(window);let lastPitch=null;
  for(let t=0;t<frames;t++){
    if(cancelled())throw new Error('CANCELLED');const center=t*step,start=center-window/2;
    for(let j=0;j<window;j++)block[j]=decimated[start+j]||0;
    candidates.push(yinCandidates(block,sr,params.minPitch,params.maxPitch));
    if(t%24===0){progress(t/frames);await yieldTask();}
  }
  const path=params.temporalTracking===false?candidates.map(c=>c[0]||null):trackPitchCandidates(candidates,analysis.onsets,step/sr);
  for(const o of path){if(o){let p=Math.round(o.pitch);if(lastPitch!==null&&Math.abs(o.pitch-lastPitch)<.65)p=lastPitch;lastPitch=p;observations.push([{pitch:p,confidence:o.confidence,amplitude:o.rms,cents:(o.pitch-p)*100}]);}else{observations.push([]);lastPitch=null;}}
  progress(1);return observationsToNotes(observations,step,sr,params,analysis.onsets);
}

const spectralDictionaries=new Map();
export async function transcribeSpectral(audio,analysis,params,progress=()=>{},cancelled=()=>false,cache={}){
  const size=4096,hop=512,binHz=SR/size,slots=18,frames=Math.ceil(audio.length/hop);
  const tuning=params.adaptiveTuning!==false&&analysis.tuningConfidence>.65&&Math.abs(analysis.tuningCents)<=40?Math.round(analysis.tuningCents):0;
  const key=JSON.stringify([params.minPitch,params.maxPitch,tuning]);let dictionary=spectralDictionaries.get(key);
  if(!dictionary){const templates=[];
    for(let p=params.minPitch;p<=params.maxPitch;p++){
      const map=new Map();for(let h=1;h<=8;h++){const k=hz(p+tuning/100)*h/binHz;if(k>=size/2-2)break;
        for(let bin=Math.max(1,Math.floor(k)-2);bin<=Math.ceil(k)+2;bin++){const value=Math.exp(-.5*((bin-k)/.75)**2)/h**.9;map.set(bin,(map.get(bin)||0)+value);}}
      const norm=Math.sqrt([...map.values()].reduce((a,b)=>a+b*b,0));templates.push({p,entries:[...map].map(([k,v])=>[k,v/norm]),map:new Map([...map].map(([k,v])=>[k,v/norm]))});
    }
    const gram=templates.map(a=>templates.map(b=>a.entries.reduce((sum,[k,v])=>sum+v*(b.map.get(k)||0),0)));
    dictionary={templates,gram};if(spectralDictionaries.size>=8)spectralDictionaries.delete(spectralDictionaries.keys().next().value);spectralDictionaries.set(key,dictionary);
  }
  const {templates,gram}=dictionary;let raw=cache.audio===audio&&cache.key===key?cache.raw:null;
  if(!raw){
    raw={pitches:new Uint8Array(frames*slots),weights:new Float32Array(frames*slots),counts:new Uint8Array(frames),max:new Float32Array(frames),rms:new Float32Array(frames)};
    const block=new Float32Array(size);
    for(let t=0;t<frames;t++){
      if(cancelled())throw new Error('CANCELLED');const start=t*hop-size/2;let energy=0;
      for(let j=0;j<size;j++){block[j]=audio[start+j]||0;energy+=block[j]*block[j];}const rms=Math.sqrt(energy/size);raw.rms[t]=rms;if(rms<.002)continue;
      const spec=fftMagnitude(block,size);for(let k=0;k<spec.length;k++)spec[k]=Math.sqrt(spec[k]);
      const dots=templates.map(a=>a.entries.reduce((sum,[k,v])=>sum+v*spec[k],0));
      const shortlist=dots.map((score,i)=>({score,i})).sort((a,b)=>b.score-a.score).slice(0,Math.min(slots,dots.length)),weights=new Float32Array(shortlist.length);
      for(let iter=0;iter<10;iter++)for(let j=0;j<shortlist.length;j++){let fitted=0;for(let k=0;k<shortlist.length;k++)fitted+=gram[shortlist[j].i][shortlist[k].i]*weights[k];weights[j]=Math.max(0,weights[j]+shortlist[j].score-fitted-.018);}
      const max=Math.max(...weights),maxSpectral=spec.reduce((a,b)=>Math.max(a,b),0);raw.max[t]=max;let count=0;
      for(let j=0;j<weights.length;j++){
        const atom=templates[shortlist[j].i],fund=hz(atom.p+tuning/100)/binHz,k=Math.round(fund),fundamental=Math.max(spec[k-1]||0,spec[k]||0,spec[k+1]||0),flanks=Math.max(spec[k-3]||0,spec[k+3]||0);
        if(fundamental<Math.max(.015,maxSpectral*.13)||fundamental<flanks*1.15)continue;
        const offset=t*slots+count++;raw.pitches[offset]=atom.p;raw.weights[offset]=weights[j];
      }
      raw.counts[t]=count;
      if(t%40===0){progress(t/frames*.9);await yieldTask();}
    }
    cache.audio=audio;cache.key=key;cache.raw=raw;cache.reused=false;
  }else cache.reused=true;
  const observations=[],threshold=.4-clamp(params.sensitivity??.55,0,1)*.22;
  for(let t=0;t<frames;t++){
    if(cancelled())throw new Error('CANCELLED');const events=[];
    for(let j=0;j<raw.counts[t];j++){const k=t*slots+j,w=raw.weights[k];if(w>Math.max(.022,raw.max[t]*threshold))events.push({pitch:raw.pitches[k],confidence:clamp(w/(raw.max[t]||1),0,1)*.8,amplitude:raw.rms[t]});}
    observations.push(events.sort((a,b)=>b.confidence-a.confidence).slice(0,params.maxPolyphony||10));
  }
  progress(1);return observationsToNotes(observations,hop,SR,params,analysis.onsets);
}

export function transcribeDrums(analysis,params){
  return analysis.onsets.map(t=>{const i=Math.round(t*SR/analysis.hop),b=analysis.bands[i]||[0,0,0];
    const p=b[0]>b[1]*1.2&&b[0]>b[2]*2?36:b[2]>b[1]*.7?42:38;
    return {pitch:p,start:t,duration:.08,velocity:clamp(Math.round((analysis.rms[i]||.1)*400),25,120),confidence:.5,source:'drums',drum:true,bends:[]};});
}

export function refineNotes(input,analysis,params,duration){
  let notes=input.filter(n=>Number.isFinite(n.pitch)&&Number.isFinite(n.start)&&Number.isFinite(n.duration)&&n.duration>0)
    .map(n=>({...n,pitch:clamp(Math.round(n.pitch),0,127),start:Math.max(0,n.start),velocity:clamp(Math.round(n.velocity||75),1,127),bends:(n.bends||[]).map(b=>({...b}))}));
  if(params.engine!=='drums')notes=notes.filter(n=>n.pitch>=params.minPitch&&n.pitch<=params.maxPitch);
  for(const n of notes){
    if(params.align&&analysis){let best=n.start,dist=.024;for(const onset of analysis.onsets){const d=Math.abs(onset-n.start);if(d<dist){dist=d;best=onset;}if(onset>n.start+.025)break;}const end=n.start+n.duration;best=Math.min(best,end-Math.min(n.duration,(params.minMs||25)/1000));const delta=n.start-best;n.start=best;n.duration=Math.max(.025,end-best);n.bends=n.bends.map(b=>({...b,time:Math.max(0,b.time+delta)})).filter(b=>b.time<n.duration);}
    n.duration=Math.min(n.duration,duration-n.start);
  }
  notes=notes.filter(n=>n.start<duration&&n.duration>=params.minMs/1000*.95);
  notes.sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  // Only merge true duplicate events. Never delete an octave just because a lower note exists.
  const clean=[],latest=new Map();
  for(const n of notes){const key=`${n.track??0}:${n.pitch}:${!!n.drum}`,q=latest.get(key),overlap=q?Math.min(q.start+q.duration,n.start+n.duration)-n.start:0;
    if(q&&n.start-q.start<=.004&&overlap>=Math.min(q.duration,n.duration)*.8){q.duration=Math.max(q.duration,n.start+n.duration-q.start);q.velocity=Math.max(q.velocity,n.velocity);}
    else {clean.push(n);latest.set(key,n);}}
  return clean.map((n,i)=>({...n,id:n.id||`n${i+1}`}));
}

export function arrangeNotes(input, params){
  const bpm=clamp(Number(params.bpm)||120,20,300),step=params.quantize?60/bpm*(4/Number(params.quantize)):0;
  return input.map(n=>{let start=n.start,duration=n.duration;
    if(step){const end=Math.round((start+duration)/step)*step;start=Math.max(0,Math.round(start/step)*step);duration=Math.max(step/4,end-start);}
    const register=n.pitch<48?0:n.pitch<72?1:2;
    const track=params.preserveTracks?(n.track??0):params.split==='register'?13+register:params.split==='instruments'?(n.instrumentTrack??n.track??0):params.split==='single'?0:(n.track??0);
    return {...n,start,duration,pitch:clamp(n.pitch+Math.round(Number(params.transpose)||0),0,127),track,drum:!!n.drum};});
}

export function sanitizeNotes(input){
  if(!Array.isArray(input)||input.length>200000)throw new Error('INVALID_PROJECT');
  return input.map((n,i)=>{
    if(!Number.isFinite(n.start)||!Number.isFinite(n.duration)||!Number.isFinite(n.pitch)||n.start<0||n.start>86400||n.duration<=0||n.duration>86400)throw new Error('INVALID_PROJECT');
    const finite=(v,fallback,lo,hi)=>Number.isFinite(Number(v))?clamp(Number(v),lo,hi):fallback,track=Math.round(finite(n.track,0,0,15));
    return {id:`n${i+1}`,start:n.start,duration:n.duration,pitch:clamp(Math.round(n.pitch),0,127),velocity:Math.round(finite(n.velocity,75,1,127)),track,instrumentTrack:Math.round(finite(n.instrumentTrack,track,0,15)),instrumentFamily:typeof n.instrumentFamily==='string'?n.instrumentFamily.slice(0,40):undefined,instrumentConfidence:finite(n.instrumentConfidence,0,0,1),noteReliability:Number.isFinite(n.noteReliability)?clamp(n.noteReliability,0,1):undefined,reviewMethod:typeof n.reviewMethod==='string'?n.reviewMethod.slice(0,40):undefined,reviewReason:typeof n.reviewReason==='string'?n.reviewReason.slice(0,40):undefined,instrumentMethod:typeof n.instrumentMethod==='string'?n.instrumentMethod.slice(0,40):undefined,drum:!!n.drum,confidence:finite(n.confidence,.5,0,1),source:'project',bends:Array.isArray(n.bends)?n.bends.filter(b=>Number.isFinite(b.time)&&Number.isFinite(b.cents)&&b.time>=0&&b.time<=n.duration).slice(0,10000).map(b=>({time:b.time,cents:clamp(b.cents,-2400,2400)})):[]};
  });
}
