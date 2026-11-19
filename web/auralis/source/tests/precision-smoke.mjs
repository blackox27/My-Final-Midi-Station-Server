import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
import {transcribeAI,aiStatus} from '../src/ai.js';import {reviewNotes} from '../src/note-review.js';import {SR,hz} from '../src/dsp.js';
vm.runInThisContext(fs.readFileSync(new URL('../dist/assets/model.js',import.meta.url),'utf8'));globalThis.AURALIS_WASM_PATH=path.dirname(createRequire(import.meta.url).resolve('@tensorflow/tfjs-backend-wasm/package.json'))+'/dist/';
const manifest=JSON.parse(fs.readFileSync(new URL('./fixtures/review-reference.json',import.meta.url),'utf8'));
const counts={before:{tp:0,fp:0,fn:0},balanced:{tp:0,fp:0,fn:0}};
function match(pred,truth){const edges=pred.map(n=>truth.map((v,j)=>({v,j})).filter(({v})=>v.pitch===n.pitch&&Math.abs(v.start-n.start)<=.05).map(v=>v.j)),assigned=new Map();function dfs(i,seen){for(const j of edges[i]){if(seen.has(j))continue;seen.add(j);if(!assigned.has(j)||dfs(assigned.get(j),seen)){assigned.set(j,i);return true;}}return false;}for(let i=0;i<pred.length;i++)dfs(i,new Set());return {tp:assigned.size,fp:pred.length-assigned.size,fn:truth.length-assigned.size};}
const settings={profile:'balanced',sensitivity:.55,minMs:70,gapMs:35,minPitch:21,maxPitch:108};
for(const clip of manifest){const fixture=new URL(`./fixtures/review-${clip.id}.flac`,import.meta.url),b=execFileSync('ffmpeg',['-v','error','-i',fileURLToPath(fixture),'-f','f32le','-ar','22050','-ac','1','pipe:1']);const audio=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4),cache={};const raw=await transcribeAI(audio,settings,()=>{},()=>false,cache),reviewed=await reviewNotes(audio,raw,{noteReview:'balanced'});
 for(const [key,notes]of [['before',raw],['balanced',reviewed.notes]]){const c=match(notes,clip.truth);for(const k of ['tp','fp','fn'])counts[key][k]+=c[k];}
 await transcribeAI(audio,{...settings,minMs:80},()=>{},()=>false,cache);assert.equal(aiStatus().cacheHit,true);console.log('fixture',clip.id,'before',raw.length,'kept',reviewed.notes.length,'candidates',reviewed.candidates.length);
}
const F=c=>2*c.tp/(2*c.tp+c.fp+c.fn);assert.ok(F(counts.balanced)>=F(counts.before));assert.ok(counts.balanced.tp>=counts.before.tp*.95);
const octave=new Float32Array(SR*2);for(const pitch of [60,72])for(let i=0;i<SR*.65;i++){const t=i/SR;octave[Math.round(.2*SR)+i]+=.2*Math.sin(2*Math.PI*hz(pitch)*t)*Math.min(1,t/.01)*Math.min(1,(.65-t)/.04);}
const reuse={},raw=await transcribeAI(octave,settings,()=>{},()=>false,reuse),kept=(await reviewNotes(octave,raw,{noteReview:'balanced'})).notes;for(const pitch of [60,72])assert.ok(kept.some(n=>n.pitch===pitch&&Math.abs(n.start-.2)<.05),'true octave '+pitch);
const silent=await transcribeAI(new Float32Array(octave.length),settings,()=>{},()=>false,reuse);assert.equal(aiStatus().cacheHit,false);assert.equal(silent.length,0);assert.deepEqual(await transcribeAI(new Float32Array(),{...settings,profile:'detailed'}),[]);
console.log(JSON.stringify({counts,f1Before:F(counts.before),f1Balanced:F(counts.balanced),status:aiStatus()},null,2));
