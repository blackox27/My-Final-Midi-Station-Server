import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';
import {transcribeAI} from '../../src/ai.js';import {annotateNoteEvidence} from '../../src/note-evidence.js';
const root=fileURLToPath(new URL('./work/',import.meta.url));
vm.runInThisContext(fs.readFileSync(new URL('../../dist/assets/model.js',import.meta.url),'utf8'));
globalThis.AURALIS_WASM_PATH=path.dirname(createRequire(import.meta.url).resolve('@tensorflow/tfjs-backend-wasm/package.json'))+'/dist/';
const corpus=JSON.parse(fs.readFileSync(root+'corpus.json')),rows=[];
for(const clip of corpus){
 const b=fs.readFileSync(root+'corpus/'+clip.file),audio=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4),cache={};
 for(const sensitivity of [.35,.55,.75]){
  const p={profile:'balanced',sensitivity,minMs:70,gapMs:35,minPitch:21,maxPitch:108,bends:false};
  const notes=await transcribeAI(audio,p,()=>{},()=>false,cache),annotated=await annotateNoteEvidence(audio,notes);
  const matches=[];for(let i=0;i<annotated.length;i++)for(let j=0;j<clip.truth.length;j++)if(annotated[i].pitch===clip.truth[j].pitch&&Math.abs(annotated[i].start-clip.truth[j].start)<=.08)matches.push({i,j,d:Math.abs(annotated[i].start-clip.truth[j].start)});
  matches.sort((a,b)=>a.d-b.d);const usedNotes=new Set(),usedTruth=new Set();for(const m of matches)if(!usedNotes.has(m.i)&&!usedTruth.has(m.j)){usedNotes.add(m.i);usedTruth.add(m.j);}
  for(let i=0;i<annotated.length;i++){const n=annotated[i];rows.push({clip:clip.id,split:clip.split,font:clip.font,sensitivity,pitch:n.pitch,start:n.start,duration:n.duration,features:n.reviewFeatures,label:usedNotes.has(i)?1:0});}
 }
 console.log('clip',clip.id,clip.split,'rows',rows.length);
 fs.writeFileSync(root+'review-dataset.json',JSON.stringify({corpus,rows}));
}
console.log('COMPLETE',rows.length);
