import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {transcribeAI,aiStatus} from '../src/ai.js';
import {SR,hz} from '../src/dsp.js';
import {createRequire} from 'node:module';
import path from 'node:path';
globalThis.AURALIS_WASM_PATH=path.dirname(createRequire(import.meta.url).resolve('@tensorflow/tfjs-backend-wasm/package.json'))+'/dist/';
vm.runInThisContext(fs.readFileSync(new URL('../dist/assets/model.js',import.meta.url),'utf8'));
const a=new Float32Array(SR*3),reference=[60,64,67];
for(let n=0;n<3;n++){const p=reference[n],start=.2+n*.8,len=.55;for(let i=0;i<len*SR;i++){const t=i/SR,env=Math.min(1,t/.01)*Math.exp(-t*2)*Math.min(1,(len-t)/.04);let x=0;for(let h=1;h<=6;h++)x+=Math.sin(2*Math.PI*hz(p)*h*t)/(h*h);a[Math.round(start*SR)+i]=x*env*.3;}}
const params={engine:'hybrid',sensitivity:.55,minMs:70,gapMs:35,minPitch:21,maxPitch:108,bends:true};
const before=performance.now();let last=-1;
const notes=await transcribeAI(a,params,p=>{const x=Math.round(p*100);if(x!==last){console.log('AI',x+'%');last=x;}});
console.log('AI RESULT',JSON.stringify(notes.map(n=>({pitch:n.pitch,start:n.start,duration:n.duration,bends:n.bends.length}))));for(let i=0;i<reference.length;i++){const note=notes.find(n=>n.pitch===reference[i]);assert.ok(note,`Missing ${reference[i]}`);assert.ok(Math.abs(note.start-(.2+i*.8))<.13,`Timing ${note.start}`);}
console.log('AI timing verified; seconds:',((performance.now()-before)/1000).toFixed(2),'status:',aiStatus());
const memory=aiStatus().tensors;await transcribeAI(new Float32Array(SR),params);assert.ok(aiStatus().tensors<=memory+3,`Tensor leak: ${memory} => ${aiStatus().tensors}`);
console.log('Repeated inference tensor stability verified.');
