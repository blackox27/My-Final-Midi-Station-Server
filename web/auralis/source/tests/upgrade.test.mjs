import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {arrangeNotes,sanitizeNotes} from '../src/dsp.js';
import {decodeActivations} from '../src/note-decoder.js';
import {AnalysisCache,preparationKey} from '../src/cache.js';
import {writeMidi} from '../src/midi.js';
import {classifyInstrumentNotes,predictTimbre} from '../src/instruments.js';
import model from '../src/timbre-model.js';
import {SR,hz,analyze,transcribeMono} from '../src/dsp.js';
const {Midi}=createRequire(import.meta.url)('@tonejs/midi');
const params={sensitivity:.55,minMs:70,gapMs:35,minPitch:21,maxPitch:108};
test('linear decoder preserves repeated notes, true octaves, gap duration and region end',()=>{
  const T=110,F=88,frames=new Float32Array(T*F),onsets=new Float32Array(T*F),times=Float64Array.from({length:T},(_,i)=>i*.01);
  for(const [pitch,lo,hi]of [[60,5,35],[60,38,70],[72,5,35],[67,90,110]]){
    for(let t=lo;t<hi;t++)frames[t*F+pitch-21]=.8;onsets[lo*F+pitch-21]=.95;
  }
  const n=decodeActivations({frames,onsets,times,duration:1.095},params);
  assert.deepEqual(n.map(v=>v.pitch),[60,72,60,67]);assert.ok(n[3].start+n[3].duration<=1.095);
  assert.ok(Math.abs(n[0].duration-.30)<.015);
});
test('instrument arrangement is independent of pitch register and UI engine selection',()=>{
  const raw=[{pitch:60,start:0,duration:.5,track:0,instrumentTrack:3},{pitch:60,start:.5,duration:.5,track:0,instrumentTrack:9}];
  const arranged=arrangeNotes(raw,{split:'instruments',engine:'drums'});assert.deepEqual(arranged.map(n=>n.track),[3,9]);assert.ok(arranged.every(n=>!n.drum));
  assert.deepEqual(arrangeNotes(arranged,{split:'single'}).map(n=>n.track),[0,0]);assert.deepEqual(arrangeNotes(arranged,{split:'instruments',preserveTracks:true}).map(n=>n.track),[3,9]);
});
test('analysis cache evicts old entries, rejects oversized retention, and ignores decoding settings in preparation keys',()=>{
  const c=new AnalysisCache(32);c.set('a',{audio:new Float32Array(4)});c.set('b',{audio:new Float32Array(4)});c.get('a');c.set('c',{audio:new Float32Array(4)});assert.ok(c.get('a'));assert.equal(c.get('b'),undefined);assert.ok(c.bytes()<=32);
  c.set('oversized',{audio:new Float32Array(100)});assert.ok(c.bytes()<=32);assert.equal(c.get('oversized'),undefined);
  assert.equal(preparationKey({...params,sensitivity:.2}),preparationKey({...params,sensitivity:.8}));
});
test('project import preserves classified tracks and rejects non-finite metadata',()=>{
  const [n]=sanitizeNotes([{pitch:60,start:0,duration:1,velocity:Infinity,track:9,instrumentTrack:9,instrumentFamily:'flute',instrumentConfidence:.8}]);
  assert.equal(n.track,9);assert.equal(n.instrumentFamily,'flute');assert.ok(Number.isFinite(n.velocity));
});
test('expressive MIDI retains separate instrument tracks and conventional export never reuses an overflowing channel',()=>{
  const notes=[{pitch:60,start:0,duration:1,track:3,velocity:90,bends:[{time:.2,cents:35}]},{pitch:72,start:0,duration:1,track:9,velocity:70,bends:[{time:.2,cents:-40}]}];
  const {bytes}=writeMidi(notes,{bends:true,programs:Array.from({length:16},(_,i)=>i===3?24:73),trackNames:Array.from({length:16},(_,i)=>`Family ${i}`)});
  const midi=new Midi(bytes);assert.equal(midi.tracks.filter(t=>t.notes.length).length,2);assert.equal(midi.tracks.find(t=>t.name==='Family 3').instrument.number,24);assert.equal(midi.tracks.find(t=>t.name==='Family 9').instrument.number,73);
  assert.throws(()=>writeMidi(Array.from({length:16},(_,track)=>({pitch:60,start:0,duration:1,velocity:80,track}))),/MIDI_TRACK_LIMIT/);
});
test('timbre probabilities are finite, normalized and source materials override estimates explicitly',async()=>{
  const probs=predictTimbre(Array(model.features).fill(.2));assert.equal(probs.length,11);assert.ok(probs.every(Number.isFinite));assert.ok(Math.abs(probs.reduce((a,b)=>a+b,0)-1)<1e-9);
  const [n]=await classifyInstrumentNotes(new Float32Array(22050),[{pitch:60,start:0,duration:.5}],()=>{},()=>false,{preset:'guitar'});assert.equal(n.instrumentFamily,'guitar');assert.equal(n.instrumentTrack,3);assert.equal(n.instrumentMethod,'selected-material');
});
test('monophonic acceleration preserves the upper pitch range',async()=>{
  for(const pitch of [40,84,108]){const a=Float32Array.from({length:SR*.4},(_,i)=>.3*Math.sin(2*Math.PI*hz(pitch)*i/SR));const analysis=await analyze(a),notes=await transcribeMono(a,analysis,{...params,engine:'mono',minPitch:21,maxPitch:pitch<=96?96:108});assert.ok(notes.some(n=>n.pitch===pitch),`${pitch}: ${notes.map(n=>n.pitch)}`);}
});
