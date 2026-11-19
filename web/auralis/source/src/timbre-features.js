import {SR,hz,clamp,fftMagnitude} from './dsp.js';
export const FAMILIES=[
  {id:'piano',pt:'Piano e teclas',en:'Piano & keys',program:0},
  {id:'mallet',pt:'Percussão melódica',en:'Tuned percussion',program:11},
  {id:'organ',pt:'Órgão e acordeão',en:'Organ & accordion',program:19},
  {id:'guitar',pt:'Violão e guitarra',en:'Guitar',program:24},
  {id:'bass',pt:'Baixo',en:'Bass',program:33},
  {id:'strings',pt:'Cordas',en:'Strings',program:48},
  {id:'voice',pt:'Voz e coro',en:'Voice & choir',program:52},
  {id:'brass',pt:'Metais',en:'Brass',program:56},
  {id:'reeds',pt:'Sopros de palheta',en:'Reeds',program:65},
  {id:'flute',pt:'Flautas',en:'Flutes',program:73},
  {id:'synth',pt:'Sintetizadores',en:'Synthesizers',program:80},
  {id:'unknown',pt:'Timbre incerto · revisar',en:'Uncertain timbre · review',program:0},
  {id:'drums',pt:'Bateria',en:'Drums',program:0}
];
const melFilters=(()=>{
  const toMel=f=>2595*Math.log10(1+f/700),fromMel=m=>700*(10**(m/2595)-1),lo=toMel(30),hi=toMel(10000),points=Array.from({length:26},(_,i)=>fromMel(lo+(hi-lo)*i/25)*4096/SR);
  return Array.from({length:24},(_,i)=>{const weights=[];for(let k=Math.ceil(points[i]);k<points[i+2];k++){const w=k<=points[i+1]?(k-points[i])/(points[i+1]-points[i]):(points[i+2]-k)/(points[i+2]-points[i+1]);if(w>0)weights.push([k,w]);}return weights;});
})();
const dct=Array.from({length:14},(_,i)=>Array.from({length:24},(_,j)=>Math.cos(Math.PI*(i+1)*(j+.5)/24)));

// Features follow the detected fundamental rather than fixed frequency bands.
// This allows different timbres at the same pitch to receive different labels.
export function timbreFeatures(audio,n,cache=new Map()){
  const N=4096,features=[],levels=[],centroids=[],flat=[],noise=[],cepstra=[];
  const offsets=[Math.min(.045,n.duration*.2),Math.min(.16,n.duration*.5),Math.min(.36,n.duration*.8)];
  for(const offset of offsets){
    const center=Math.round((n.start+offset)*SR/128)*128,at=center-N/2;
    let spectrum=cache.get(center);
    if(!spectrum){const block=new Float32Array(N);const lo=Math.max(0,at),hi=Math.min(audio.length,at+N);if(hi>lo)block.set(audio.subarray(lo,hi),lo-at);spectrum=fftMagnitude(block,N);if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(center,spectrum);}
    const harmonics=[],f0=hz(n.pitch);let energy=0,weighted=0,logSum=0,noiseSum=0;
    for(let h=1;h<=16;h++){
      const bin=f0*h*N/SR;
      if(bin>spectrum.length-3){harmonics.push(0);continue;}
      const k=Math.round(bin),peak=Math.max(spectrum[k-1]||0,spectrum[k]||0,spectrum[k+1]||0),floor=((spectrum[k-3]||0)+(spectrum[k+3]||0))*.5;
      const v=Math.max(0,peak-floor*.35);harmonics.push(v);energy+=v*v;weighted+=h*v*v;logSum+=Math.log(v+1e-7);noiseSum+=floor;
    }
    const norm=Math.sqrt(energy)+1e-8;levels.push(norm);
    for(const v of harmonics)features.push(Math.log1p(10*v/norm)/Math.log(11));
    centroids.push((weighted/(energy+1e-10)-1)/15);
    flat.push(clamp(Math.exp(logSum/16)/(harmonics.reduce((s,x)=>s+x,0)/16+1e-8),0,1));
    noise.push(clamp(noiseSum/(harmonics.reduce((s,x)=>s+x,0)+1e-8),0,2)/2);
    const logMel=melFilters.map(filter=>{let sum=0;for(const [k,w]of filter)sum+=spectrum[k]*spectrum[k]*w;return Math.log(sum+1e-12);});
    for(const row of dct){let sum=0;for(let k=0;k<24;k++)sum+=row[k]*logMel[k];cepstra.push(sum/24);}
  }
  features.push(...centroids,...flat,...noise);
  features.push(clamp(Math.log((levels[1]+1e-7)/(levels[0]+1e-7)),-4,4)/4,clamp(Math.log((levels[2]+1e-7)/(levels[0]+1e-7)),-4,4)/4);
  features.push(...cepstra);
  return features;
}
