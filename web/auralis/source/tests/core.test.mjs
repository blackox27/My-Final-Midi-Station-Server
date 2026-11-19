import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {SR,hz,pitch,fftMagnitude,yinFrame,analyze,transcribeMono,transcribeSpectral,refineNotes,arrangeNotes,sanitizeNotes} from '../src/dsp.js';
import {writeMidi} from '../src/midi.js';
import {decodeAudio} from '../src/audio.js';
const require=createRequire(import.meta.url),{Midi}=require('@tonejs/midi');
const sine=(p,duration=1)=>Float32Array.from({length:Math.round(duration*SR)},(_,i)=>Math.sin(2*Math.PI*hz(p)*i/SR)*.3);
const params={engine:'mono',minPitch:36,maxPitch:90,minMs:60,sensitivity:.55,maxPolyphony:8};
test('pitch mapping is invertible',()=>{for(let p=21;p<=108;p++)assert.ok(Math.abs(pitch(hz(p))-p)<1e-10);});
test('FFT identifies the main spectral peak',()=>{const a=sine(69),spec=fftMagnitude(a.subarray(0,4096)),peak=spec.indexOf(Math.max(...spec));assert.ok(Math.abs(peak*SR/4096-440)<SR/4096);});
test('YIN estimates pitches rather than overtones',()=>{for(const p of [40,48,57,69,81]){const a=sine(p).subarray(0,2048);for(let i=0;i<a.length;i++)a[i]+=.2*Math.sin(2*Math.PI*hz(p)*2*i/SR);const result=yinFrame(a,SR,36,90);assert.ok(result,`missing ${p}`);assert.ok(Math.abs(result.pitch-p)<.15,`${p} => ${result.pitch}`);}});
test('silence is never treated as a sustained MIDI note',async()=>{const a=new Float32Array(SR),data=await analyze(a);assert.equal(data.bpm,null);assert.deepEqual(await transcribeMono(a,data,params),[]);assert.deepEqual(await transcribeSpectral(a,data,params),[]);});
test('monophonic melody timing survives analysis',async()=>{const a=new Float32Array(SR*2),expected=[60,64,67];expected.forEach((p,i)=>a.set(sine(p,.35),Math.round((.1+i*.55)*SR)));const analysis=await analyze(a),notes=await transcribeMono(a,analysis,params);for(let i=0;i<expected.length;i++){const n=notes.find(n=>n.pitch===expected[i]);assert.ok(n,JSON.stringify(notes));assert.ok(Math.abs(n.start-(.1+i*.55))<.08);}});
test('spectral dictionary recovers a stable triad without extra pitches or repeated false attacks',async()=>{const a=new Float32Array(SR);for(const p of [60,64,67]){const wave=sine(p);for(let i=0;i<a.length;i++)a[i]+=wave[i]/3;}const analysis=await analyze(a),notes=await transcribeSpectral(a,analysis,{...params,engine:'spectral',minPitch:48,maxPitch:84});assert.deepEqual(notes.map(n=>n.pitch).sort((a,b)=>a-b),[60,64,67]);for(const n of notes)assert.ok(n.duration>.8);});
test('refinement preserves valid simultaneous octaves',()=>{const notes=refineNotes([{pitch:60,start:.1,duration:.4},{pitch:72,start:.1,duration:.4}],null,{...params,align:false},1);assert.equal(notes.length,2);});
test('quantization is optional and never mutates the raw transcription',()=>{const raw=[{pitch:60,start:.137,duration:.381,velocity:90}],copy=structuredClone(raw);assert.equal(arrangeNotes(raw,{bpm:120,quantize:0})[0].start,.137);assert.equal(arrangeNotes(raw,{bpm:120,quantize:16})[0].start,.125);assert.deepEqual(raw,copy);});
test('invalid imported projects are rejected',()=>{assert.throws(()=>sanitizeNotes([{pitch:60,start:-1,duration:1}]));assert.throws(()=>sanitizeNotes([{pitch:60,start:1,duration:NaN}]));assert.equal(sanitizeNotes([{pitch:60,start:1,duration:.2}])[0].pitch,60);});
test('MIDI round-trip preserves pitches, tracks and physical timing',()=>{const original=[{pitch:60,start:.137,duration:.381,velocity:90,track:0},{pitch:67,start:.137,duration:.6,velocity:70,track:1}];const {bytes}=writeMidi(original,{bpm:87,programs:[0,24]});const read=new Midi(bytes);const n=read.tracks.flatMap(t=>t.notes);assert.equal(n.length,2);for(const source of original){const target=n.find(n=>n.midi===source.pitch);assert.ok(Math.abs(target.time-source.start)<.002);assert.ok(Math.abs(target.duration-source.duration)<.003);}assert.equal(read.tracks.find(t=>t.notes.some(n=>n.midi===67)).instrument.number,24);});
test('pitch-bend channel overflow preserves every note',()=>{const notes=Array.from({length:20},(_,i)=>({pitch:48+i,start:0,duration:1,velocity:80,bends:[{time:0,cents:i*2}]}));const {bytes,stats}=writeMidi(notes,{bends:true});assert.equal(stats.mode,'notes-channel-budget');assert.equal(new Midi(bytes).tracks.flatMap(t=>t.notes).length,20);});
test('simultaneous independent bends use separate channels',()=>{const notes=[60,64].map((pitch,i)=>({pitch,start:0,duration:1,velocity:90,bends:[{time:0,cents:0},{time:.3,cents:i?100:-100}]}));const {bytes,stats}=writeMidi(notes,{bends:true});assert.equal(stats.mode,'independent-channel-bends');assert.equal(new Midi(bytes).tracks.flatMap(t=>t.notes).length,2);});
test('built-in WASM decoders read FLAC, MP3, Vorbis and Opus',async()=>{
  class MockContext{async decodeAudioData(){throw new Error('force WASM');}createBuffer(ch,length,sr){const data=Array.from({length:ch},()=>new Float32Array(length));return {numberOfChannels:ch,length,sampleRate:sr,duration:length/sr,copyToChannel:(a,i)=>data[i].set(a),getChannelData:i=>data[i]};}}
  globalThis.AudioContext=MockContext;
  const dir='/tmp/auralis-codec-tests';fs.mkdirSync(dir,{recursive:true});const fixtures=[['flac','flac'],['mp3','libmp3lame'],['ogg','libvorbis'],['opus','libopus']];
  for(const [extension,codec]of fixtures){const path=`${dir}/tone.${extension}`;execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=0.5','-ar',extension==='opus'?'48000':'44100','-c:a',codec,path]);const {buffer}=await decodeAudio(new Uint8Array(fs.readFileSync(path)),`tone.${extension}`,true);assert.ok(buffer.length>5000,extension);assert.ok(Math.abs(buffer.duration-.5)<.1,`${extension}: ${buffer.duration}`);}
});
