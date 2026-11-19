import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import * as old from './baseline-dsp.js';
import {analyze,refineNotes} from '../../src/dsp.js';
import {predictNoteReliability} from '../../src/note-review.js';import model from '../../src/review-model.js';
const root=fileURLToPath(new URL('./work/',import.meta.url)),data=JSON.parse(fs.readFileSync(root+'review-dataset.json'));
function count(pred,truth){const choices=pred.map(n=>truth.map((t,i)=>({t,i})).filter(({t})=>n.pitch===t.pitch&&Math.abs(n.start-t.start)<=.05).map(v=>v.i)),match=new Map();function dfs(i,seen){for(const j of choices[i]){if(seen.has(j))continue;seen.add(j);if(!match.has(j)||dfs(match.get(j),seen)){match.set(j,i);return true;}}return false;}for(let i=0;i<pred.length;i++)dfs(i,new Set());return {tp:match.size,fp:pred.length-match.size,fn:truth.length-match.size};}
const totals={baseline:{tp:0,fp:0,fn:0},balanced:{tp:0,fp:0,fn:0},precise:{tp:0,fp:0,fn:0}},clips=[];
for(const c of data.corpus.filter(c=>c.split==='test')){
 const b=fs.readFileSync(root+'corpus/'+c.file),audio=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4),rows=data.rows.filter(n=>n.clip===c.id&&n.sensitivity===.55),raw=rows.map((n,i)=>({id:'n'+i,pitch:n.pitch,start:n.start,duration:n.duration,velocity:75,confidence:n.features[0]}));
 const p={engine:'hybrid',align:true,minPitch:21,maxPitch:108,minMs:70,gapMs:35};
 const before=old.refineNotes(raw,await old.analyze(audio),p,c.duration),analysis=await analyze(audio);const result={id:c.id,baseline:count(before,c.truth)};
 for(const mode of ['balanced','precise']){const threshold=mode==='balanced'?model.balancedThreshold:model.preciseThreshold,kept=raw.filter((n,i)=>n.pitch<model.minPitch||n.pitch>model.maxPitch||predictNoteReliability(rows[i].features)>=threshold);result[mode]=count(refineNotes(kept,analysis,p,c.duration),c.truth);}
 for(const mode of Object.keys(totals))for(const k of ['tp','fp','fn'])totals[mode][k]+=result[mode][k];clips.push(result);
}
for(const t of Object.values(totals)){t.precision=t.tp/(t.tp+t.fp);t.recall=t.tp/(t.tp+t.fn);t.f1=2*t.tp/(2*t.tp+t.fp+t.fn);}
const result={testClips:20,testFont:'GeneralUser-GS',onsetToleranceSeconds:.05,sensitivity:.55,totals,clips,scope:'Full hybrid refinement replay from identical stored neural predictions; no duration or instrument matching.'};fs.writeFileSync(root+'pipeline-metrics.json',JSON.stringify(result,null,2));console.log(JSON.stringify(totals,null,2));
