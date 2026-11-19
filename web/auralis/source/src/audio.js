import {FLACDecoder} from '@wasm-audio-decoders/flac';
import {OggVorbisDecoder} from '@wasm-audio-decoders/ogg-vorbis';
import {OggOpusDecoder} from 'ogg-opus-decoder';
import {MPEGDecoder} from 'mpg123-decoder';
import {clamp,SR,hz} from './dsp.js';
let context;
export function audioContext(){if(!context)context=new AudioContext({latencyHint:'interactive'});return context;}
export async function decodeAudio(bytes,name='audio',forceWasm=false){
  let nativeError;const raw=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),ctx=audioContext();
  if(!forceWasm)try{const buffer=await ctx.decodeAudioData(raw.slice().buffer);return {buffer,decoder:'Web Audio',warnings:[]};}catch(e){nativeError=e;}
  const head=new TextDecoder().decode(raw.subarray(0,100));let Class;
  if(head.startsWith('fLaC')||(head.startsWith('OggS')&&head.includes('FLAC')))Class=FLACDecoder;
  else if(head.startsWith('OggS'))Class=head.includes('OpusHead')?OggOpusDecoder:OggVorbisDecoder;
  else if(/\.(mp3|mp2|mpeg)$/i.test(name)||head.startsWith('ID3')||raw[0]===255)Class=MPEGDecoder;
  if(!Class)throw new Error('DECODE_UNSUPPORTED');
  const decoder=new Class();try{
    await decoder.ready;const result=await (typeof decoder.decodeFile==='function'?decoder.decodeFile(raw):decoder.decode(raw));
    if(!result.samplesDecoded||!result.channelData?.length)throw new Error('DECODE_EMPTY');
    const buffer=ctx.createBuffer(result.channelData.length,result.samplesDecoded,result.sampleRate);
    result.channelData.forEach((d,i)=>buffer.copyToChannel(d,i));
    return {buffer,decoder:Class.name+' / WASM',warnings:result.errors?.length?['DECODE_GAPS']:[]};
  }catch(e){throw new Error('DECODE_UNSUPPORTED',{cause:nativeError||e});}finally{decoder.free();}
}

export async function prepareAudio(buffer,params){
  const start=clamp(Number(params.regionStart)||0,0,buffer.duration),end=clamp(Number(params.regionEnd)||buffer.duration,start,buffer.duration);
  if(end-start<.06)throw new Error('REGION_SHORT');if(end-start>600)throw new Error('REGION_LONG');
  const first=Math.floor(start*buffer.sampleRate),last=Math.min(buffer.length,Math.ceil(end*buffer.sampleRate)),mono=new Float32Array(last-first);
  const channels=Array.from({length:Math.min(buffer.numberOfChannels,8)},(_,i)=>buffer.getChannelData(i));
  let correlation=0,powerL=0,powerR=0,repairedSamples=0;
  if(channels.length>1)for(let i=first;i<last;i+=8){const l=channels[0][i],r=channels[1][i];if(Number.isFinite(l)&&Number.isFinite(r)){correlation+=l*r;powerL+=l*l;powerR+=r*r;}}
  const read=(ch,at)=>{const x=ch[at];if(Number.isFinite(x))return x;repairedSamples++;return 0;};
  const antiPhase=channels.length>1&&correlation/Math.sqrt(powerL*powerR||1)<-.7;
  const mode=params.channel||'mix',chosen=mode==='right'?Math.min(1,channels.length-1):0,useSingle=antiPhase&&mode==='mix';
  for(let i=0;i<mono.length;i++){
    const at=first+i;if(mode==='left'||mode==='right'||useSingle)mono[i]=read(channels[chosen],at);
    else if(mode==='side'&&channels.length>1)mono[i]=(read(channels[0],at)-read(channels[1],at))*.5;
    else {let sum=0;for(const ch of channels)sum+=read(ch,at);mono[i]=sum/channels.length;}
  }
  // OfflineAudioContext uses the browser's band-limited resampler.
  const off=new OfflineAudioContext(1,Math.ceil(mono.length*SR/buffer.sampleRate),SR),source=off.createBufferSource();
  source.buffer=off.createBuffer(1,mono.length,buffer.sampleRate);source.buffer.copyToChannel(mono,0);let node=source;
  if(params.highpass){const filter=off.createBiquadFilter();filter.type='highpass';filter.frequency.value=30;node.connect(filter);node=filter;}
  node.connect(off.destination);source.start();const rendered=await off.startRendering(),audio=rendered.getChannelData(0).slice();
  let peak=0;for(let i=0;i<audio.length;i++){if(!Number.isFinite(audio[i])){audio[i]=0;repairedSamples++;}peak=Math.max(peak,Math.abs(audio[i]));}
  let gain=1;if(params.normalize&&peak>.0001){gain=Math.min(6,.85/peak);for(let i=0;i<audio.length;i++)audio[i]*=gain;}
  return {audio,offset:start,duration:audio.length/SR,antiPhase:useSingle,gain,repairedSamples};
}

export function makeDemo(type='piano'){
  const ctx=audioContext(),sr=22050,duration=6,buffer=ctx.createBuffer(1,sr*duration,sr),a=buffer.getChannelData(0),reference=[];
  const sequence=type==='chords'?[[60,64,67],[62,65,69],[59,62,67],[60,64,67]]:[[60],[64],[67],[72],[67],[64],[62],[60]];
  const step=type==='chords'?1.25:.62;
  for(let s=0;s<sequence.length;s++)for(const p of sequence[s]){const start=.2+s*step,len=type==='chords'?.98:.48;
    reference.push({pitch:p,start,duration:len});for(let j=0;j<len*sr;j++){const t=j/sr,env=Math.min(1,t/.008)*Math.exp(-t*3.2)*Math.min(1,(len-t)/.04);let x=0;
      for(let h=1;h<=7;h++)x+=Math.sin(2*Math.PI*hz(p)*h*t)*Math.exp(-t*h*.6)/(h*h);
      const i=Math.round(start*sr)+j;if(i<a.length)a[i]+=.23*x*env/(type==='chords'?1.5:1);}}
  return {buffer,reference,name:type==='chords'?'Demo — chords.wav':'Demo — melody.wav',decoder:'Synthetic fixture',warnings:[]};
}

export function wavBytes(buffer){
  const samples=buffer.length,ch=buffer.numberOfChannels,out=new ArrayBuffer(44+samples*ch*2),v=new DataView(out),str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  str(0,'RIFF');v.setUint32(4,out.byteLength-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples*ch*2,true);
  for(let i=0;i<samples;i++)for(let c=0;c<ch;c++)v.setInt16(44+(i*ch+c)*2,clamp(buffer.getChannelData(c)[i],-1,1)*32767,true);return new Uint8Array(out);
}
