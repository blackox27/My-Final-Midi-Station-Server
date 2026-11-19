import {dict,GM} from './i18n.js';
import {clamp,hz,refineNotes,arrangeNotes,analyze,transcribeMono,transcribeSpectral,transcribeDrums,yieldTask} from './dsp.js';
import {decodeAudio,prepareAudio,makeDemo,audioContext} from './audio.js';
import {transcribeAI,aiStatus} from './ai.js';
import {reviewNotes} from './note-review.js';
import {captureEditState,restoreEditState,includeCandidates} from './project-state.js';
import {parseProject} from './project-file.js';
import {writeMidi} from './midi.js';
import {Player} from './playback.js';
import workerSource from './worker-source.txt';
import {AnalysisCache,preparationKey} from './cache.js';
import {FAMILIES} from './timbre-features.js';
const cache=new AnalysisCache(),MAX_TRACKS=16;

const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#8ce6ce','#b0a0f6','#f0bc7b','#82b5ed','#ee9bbb','#bddd8a','#ef9d7f','#80d7dd','#e5da80','#b8b1df','#d29ee5','#adb8bd','#f79b98','#97d3a4','#c1c98f','#aaa9e0'];
const state={jobs:[],current:null,busy:false,importing:false,cancel:false,worker:null,selected:null,view:'roll',position:0,logs:[],lang:'pt',zoom:65,geometry:null,toastTimer:null};
try{state.lang=localStorage.getItem('auralis.lang')||'pt';document.documentElement.dataset.theme=localStorage.getItem('auralis.theme')||'dark';}catch{}
if(!dict[state.lang])state.lang='pt';
const t=key=>dict[state.lang][key]||dict.en[key]||key;
const current=()=>state.jobs.find(j=>j.id===state.current);
const time=s=>{s=Math.max(0,s||0);return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;};
const noteName=p=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][p%12]+(Math.floor(p/12)-1);
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>$('toast').classList.remove('show'),5500);}
function log(message){state.logs.push(`${new Date().toLocaleTimeString()}  ${message}`);if(state.logs.length>150)state.logs.shift();$('logContent').textContent=state.logs.join('\n');}
function status(key,p=0,error=false){$('statusText').textContent=t(key);$('progress').value=clamp(p,0,1);$('progressNumber').textContent=Math.round(p*100)+'%';$('statusDot').className='status-dot'+(state.busy?' busy':'')+(error?' error':'');}
function fail(error){console.error(error);const message=t(error.message);log(`ERROR: ${error.message}`);status(message===error.message?'error':error.message,0,true);toast(`${t('error')}: ${message}`);}
function translate(){document.documentElement.lang=state.lang==='pt'?'pt-BR':'en';document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});$('langBtn').textContent=state.lang==='pt'?'EN':'PT';$('playBtn').title=t(player.playing?'pause':'play');$('stopBtn').title=t('stop');$('helpBtn').title=t('help');renderQueue();renderStats();renderTracks();renderInspector();draw();}
function setBusy(b){state.busy=b;for(const id of ['transcribeBtn','batchBtn','importBtn','demoBtn','chordsBtn','openBtn','stemBtn','exportBtn','saveBtn','arrangeBtn','restoreBtn','undoBtn','redoBtn','noteApply','noteDelete','deleteBtn','playBtn','clearCacheBtn','csvBtn','candidatesBtn','bpm','quantize','split','transpose'])$(id).disabled=b;
  $('cancelBtn').disabled=!b;for(const el of document.querySelectorAll('.settings-panel input,.settings-panel select'))el.disabled=b;renderQueue();renderTracks();$('statusDot').classList.toggle('busy',b);}
function params(){
  const number=(id,lo,hi)=>{const v=Number($(id).value);if(!Number.isFinite(v)||v<lo||v>hi)throw new Error('INVALID_SETTINGS');return v;};
  const p={noteReview:$('noteReview').value,profile:$('profile').value,preset:$('preset').value,engine:$('engine').value,sensitivity:number('sensitivity',0,100)/100,minMs:number('minMs',25,1500),gapMs:number('gapMs',0,250),minPitch:Math.round(number('minPitch',21,108)),maxPitch:Math.round(number('maxPitch',21,108)),regionStart:number('regionStart',0,86400),regionEnd:number('regionEnd',0,86400),channel:$('channel').value};
  if(p.minPitch>p.maxPitch)throw new Error('INVALID_SETTINGS');for(const id of ['normalize','highpass','align','bends','recover','temporalTracking','adaptiveTuning'])p[id]=$(id).checked;
  if(p.regionEnd-p.regionStart<.06)throw new Error('REGION_SHORT');
  return p;
}
function arrangement(){return {bpm:clamp(Number($('bpm').value)||120,20,300),quantize:Number($('quantize').value)||0,transpose:clamp(Number($('transpose').value)||0,-48,48),split:$('split').value,engine:$('engine').value,preserveTracks:current()?.layers.length>1};}
function newJob(data){const id='j'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),job={id,name:data.name,duration:data.buffer?.duration||0,layers:data.buffer?[{name:data.name,buffer:data.buffer,decoder:data.decoder,offset:0,warnings:data.warnings||[]}]:[],notes:[],baseNotes:[],candidates:[],baseCandidates:[],editVersion:0,programs:Array(MAX_TRACKS).fill(0),trackNames:Array(MAX_TRACKS).fill('').map((_,i)=>`Track ${i+1}`),muted:new Set(),bpm:120,state:'ready',history:[],future:[],analysis:null,params:null,demo:!!data.reference};
  job.trackNames[0]=data.name.replace(/\.[^.]+$/,'');for(let i=0;i<3;i++)job.trackNames[13+i]=state.lang==='pt'?['Graves · registro','Médios · registro','Agudos · registro'][i]:['Low register','Middle register','High register'][i];state.jobs.push(job);return job;
}
function selectJob(id){if(state.busy)return;player.stop();state.current=id;state.position=0;state.selected=null;const j=current();if(!j)return;
  j.editBase=structuredClone(j.notes);j.candidateEditBase=structuredClone(j.candidates||[]);
  $('analysisInfo').textContent=j.lastRun?`${j.lastRun.seconds.toFixed(2)} s · ${t(j.lastRun.reused?'cacheUsed':'newAnalysis')}`:'';$('regionStart').value=j.params?.regionStart||0;$('regionEnd').value=j.params?.regionEnd||j.duration.toFixed(2);$('bpm').value=j.bpm||120;$('transpose').value=0;$('quantize').value=0;$('split').value=j.notes.length?'keep':'instruments';
  renderQueue();renderStats();renderTracks();renderInspector();fit();draw();}
function renderQueue(){
  $('queueCount').textContent=state.jobs.length;const root=$('queue');root.replaceChildren();if(!state.jobs.length){const p=document.createElement('p');p.className='hint';p.textContent=t('emptyQueue');root.append(p);return;}
  for(const j of state.jobs){const row=document.createElement('div');row.className='queue-item'+(j.id===state.current?' active':'');row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label',j.name);
    row.innerHTML=`<span class="queue-icon">${j.notes.length?'♬':'♪'}</span><span class="queue-text"><strong>${esc(j.name)}</strong><small>${time(j.duration)} · ${j.notes.length} ${esc(t('notes').toLowerCase())}${j.layers.length>1?` · ${j.layers.length} stems`:''}</small></span><button class="queue-remove" aria-label="${esc(t('remove'))}" ${state.busy?'disabled':''}>×</button>`;
    row.addEventListener('click',()=>selectJob(j.id));row.addEventListener('keydown',e=>{if(e.key==='Enter')selectJob(j.id);});
    row.querySelector('button').addEventListener('click',e=>{e.stopPropagation();if(state.busy)return;player.stop();state.jobs=state.jobs.filter(x=>x!==j);cache.deletePrefix(j.id+':');if(state.current===j.id){state.current=state.jobs[0]?.id||null;state.selected=null;if(state.current)selectJob(state.current);else{$('regionStart').value=0;$('regionEnd').value=0;$('bpm').value=120;state.position=0;}}renderAll();});root.append(row);}
}
function renderStats(){const j=current(),notes=j?.notes||[];const count=j?.candidates?.length||0;$('candidatePanel').hidden=!count;$('candidateCount').textContent=`${count} ${t('filteredCandidates')}`;$('candidatesBtn').disabled=state.busy||!count;if(j&&(j._indexedNotes!==j.notes||j._indexedVersion!==j.editVersion)){j._indexedNotes=j.notes;j._indexedVersion=j.editVersion;let min=127,max=0;for(const n of notes){min=Math.min(min,n.pitch);max=Math.max(max,n.pitch);}j.pitchBounds=notes.length?[min,max]:null;j.renderNotes=[...notes].sort((a,b)=>a.start-b.start);j.prefixEnd=new Float64Array(notes.length);let end=0;for(let i=0;i<j.renderNotes.length;i++){end=Math.max(end,j.renderNotes[i].start+j.renderNotes[i].duration);j.prefixEnd[i]=end;}}$('statNotes').textContent=notes.length.toLocaleString();$('statDuration').textContent=time(j?.duration||0);$('statTracks').textContent=new Set(notes.map(n=>n.track||0)).size;$('statBpm').firstChild.textContent=String(j?.bpm||120);$('bpmHint').textContent=j?.analysis?.bpm?t('detected'):'';$('projectTitle').textContent=j?.name||t('selectAudio');$('emptyOverlay').hidden=!!j;$('seek').max=j?.duration||1;$('timeLabel').textContent=`${time(state.position)} / ${time(j?.duration||0)}`;}
function renderTracks(){const j=current(),root=$('trackList');root.replaceChildren();if(!j)return;
  const ids=[...new Set([...j.notes.map(n=>n.track||0),...(j.notes.length?[]:j.layers.map((_,i)=>i))])].sort((a,b)=>a-b);if(!ids.length)ids.push(0);
  for(const idx of ids){const row=document.createElement('div');row.className='track-row';row.innerHTML=`<span class="track-color" style="background:${colors[idx%colors.length]}"></span><input type="text" aria-label="${esc(t('trackName'))}" maxlength="120" value="${esc(j.trackNames[idx]||`Track ${idx+1}`)}"><select aria-label="${esc(t('track'))}">${GM.map((g,i)=>`<option value="${i}" ${j.programs[idx]===i?'selected':''}>${i+1}. ${esc(g)}</option>`).join('')}</select><button aria-label="${esc(t(j.muted.has(idx)?'unmute':'mute'))}" title="${esc(t(j.muted.has(idx)?'unmute':'mute'))}">${j.muted.has(idx)?'○':'●'}</button><button class="track-export" title="${esc(t('exportTrack'))}" aria-label="${esc(t('exportTrack'))} ${idx+1}">⇩</button>`;
    for(const control of row.querySelectorAll('input,select,button'))control.disabled=state.busy;
    row.querySelector('.track-export').onclick=()=>exportTrack(idx);
    row.querySelector('input').addEventListener('change',e=>{j.trackNames[idx]=e.target.value||`Track ${idx+1}`;renderInspector();});row.querySelector('select').addEventListener('change',e=>{j.programs[idx]=Number(e.target.value);});
    row.querySelector('button').addEventListener('click',()=>{if(j.muted.has(idx))j.muted.delete(idx);else j.muted.add(idx);player.stop(true);renderTracks();draw();});root.append(row);}
}
function snapshot(){const j=current();if(!j)return;j.history.push(captureEditState(j));const limit=Math.max(1,Math.min(30,Math.floor(180000/Math.max(1,j.notes.length+(j.candidates?.length||0)))));while(j.history.length>limit)j.history.shift();j.future=[];}
function commitEdit(){const j=current();if(j){j.editVersion=(j.editVersion||0)+1;j.editBase=structuredClone(j.notes);j.candidateEditBase=structuredClone(j.candidates||[]);}$('transpose').value=0;$('quantize').value=0;$('split').value='keep';}
function history(redo=false){const j=current();if(!j||state.busy)return;const source=redo?j.future:j.history,destination=redo?j.history:j.future;if(!source.length)return;player.stop(true);destination.push(captureEditState(j));restoreEditState(j,source.pop());commitEdit();state.selected=null;renderAll();}
function renderInspector(){const j=current(),n=j?.notes.find(n=>n.id===state.selected);$('inspectorFields').hidden=!n;$('inspectorEmpty').hidden=!!n;if(!n)return;
  $('noteName').textContent=noteName(n.pitch);$('notePitch').value=n.pitch;$('noteVelocity').value=n.velocity;$('noteStart').value=n.start.toFixed(3);$('noteDuration').value=n.duration.toFixed(3);$('noteDrum').checked=!!n.drum;
  $('noteTrack').innerHTML=Array.from({length:MAX_TRACKS},(_,i)=>`<option value="${i}" ${i===(n.track||0)?'selected':''}>${i+1}. ${esc(j.trackNames[i]||`Track ${i+1}`)}</option>`).join('');
  $('noteEvidence').textContent=`${n.instrumentFamily?`${t('instrumentEvidence')}: ${FAMILIES.find(f=>f.id===n.instrumentFamily)?.[state.lang]||n.instrumentFamily} (${(n.instrumentConfidence||0).toFixed(2)}). `:''}${Number.isFinite(n.noteReliability)?`${t('noteReliability')}: ${n.noteReliability.toFixed(2)} · `:''}${t('confidence')}: ${(n.confidence??.5).toFixed(2)}${Number.isFinite(n.spectralSupport)?` · ${t('support')}: ${n.spectralSupport.toFixed(2)}`:''}. ${t('notCalibrated')}`;
}
function renderAll(){renderQueue();renderStats();renderTracks();renderInspector();draw();}

async function importFiles(files,stem=false){if(state.busy||state.importing)return toast(t('busy'));state.importing=true;setBusy(true);let chosen=current();
  try{for(const file of files){if(file.size>256*1024*1024){toast(t('sizeError'));continue;}status('loading');
      try{const data=await decodeAudio(await file.arrayBuffer(),file.name);data.name=file.name;log(`${file.name}: ${data.decoder}; ${data.buffer.sampleRate} Hz; ${data.buffer.numberOfChannels} ch; ${data.buffer.duration.toFixed(3)} s`);
        if(stem&&chosen){if(chosen.layers.length>=8){toast(t('limitStems'));break;}if(chosen.layers.length===1&&chosen.instrumentSetup){const first=chosen.layers[0];chosen.trackNames[0]=first.name.replace(/\.[^.]+$/,'');const counts=new Map();for(const n of chosen.notes)counts.set(n.track||0,(counts.get(n.track||0)||0)+1);const dominant=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||0;chosen.programs[0]=chosen.programs[dominant];chosen.instrumentSetup=false;}chosen.layers.push({name:file.name,buffer:data.buffer,decoder:data.decoder,offset:0,warnings:data.warnings});const i=chosen.layers.length-1;chosen.trackNames[i]=file.name.replace(/\.[^.]+$/,'');chosen.duration=Math.max(chosen.duration,data.buffer.duration);}
        else chosen=newJob(data);for(const w of data.warnings)toast(t(w));
      }catch(e){fail(e);}
    }
  }finally{setBusy(false);state.importing=false;if(chosen)selectJob(chosen.id);status('statusReady');$('audioInput').value='';$('stemInput').value='';}
}
function demo(chords=false){if(state.busy)return;const data=makeDemo(chords?'chords':'piano'),j=newJob(data);selectJob(j.id);log(`${j.name}: generated synthetic fixture, not an accuracy benchmark.`);}

function runDSP(audio,task,p,baseProgress=0,span=.2,existingAnalysis=null){
  return new Promise((resolve,reject)=>{
    let worker=state.dspWorker,url;try{if(!worker){url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);state.dspWorker=worker;}}catch(e){if(url)URL.revokeObjectURL(url);log('Worker unavailable; yielding main-thread DSP fallback.');
      (async()=>{const a=existingAnalysis||await analyze(audio,22050,v=>status('analyzing',baseProgress+v*span*.3),()=>state.cancel,p);let notes=null;
        const cb=v=>status(task==='mono'?'runningMono':'runningSpectral',baseProgress+span*(.3+.7*v));if(task==='mono')notes=await transcribeMono(audio,a,p,cb,()=>state.cancel);if(task==='spectral')notes=await transcribeSpectral(audio,a,p,cb,()=>state.cancel);if(task==='drums')notes=transcribeDrums(a,p);if(task==='review'){const reviewed=await reviewNotes(audio,p.notes,p,v=>status('reviewing',baseProgress+v*span),()=>state.cancel);return {analysis:null,...reviewed};}if(task==='instruments'){const {classifyInstrumentNotes}=await import('./instruments.js');notes=await classifyInstrumentNotes(audio,p.notes,v=>status('classifying',baseProgress+v*span),()=>state.cancel,p);}return {analysis:a,notes};})().then(resolve,reject);return;}
    const finish=()=>{if(state.worker?.worker===worker)state.worker=null;};state.worker={worker,reject:()=>{worker.terminate();state.dspWorker=null;finish();reject(new Error('CANCELLED'));}};
    worker.onmessage=e=>{const m=e.data;if(m.type==='progress'){const key=m.stage==='review'?'reviewing':m.stage==='instruments'?'classifying':m.stage==='analysis'?'analyzing':task==='mono'?'runningMono':task==='drums'?'runningDrums':'runningSpectral';status(key,baseProgress+span*(m.stage==='analysis'?m.p*.3:.3+.7*m.p));}
      if(m.type==='result'){finish();resolve(m);}if(m.type==='error'){finish();reject(new Error(m.message));}};
    worker.onerror=e=>{worker.terminate();state.dspWorker=null;finish();reject(new Error(e.message||'WORKER_ERROR'));};const sendAudio=!p.cacheId||worker.audioKey!==p.cacheId;worker.postMessage({id:1,task,audio:sendAudio?audio:null,cacheKey:p.cacheId,params:p,analysis:sendAudio?existingAnalysis:null});worker.audioKey=p.cacheId;
  });
}
async function processJob(job,p){
  const combined=[],rejected=[],started=performance.now();status('analyzing',0);let summary=null,reused=false;
  for(let idx=0;idx<job.layers.length;idx++){
    if(state.cancel)throw new Error('CANCELLED');const layer=job.layers[idx];if(!layer.buffer||p.regionStart>=layer.buffer.duration)continue;
    const base=idx/job.layers.length,span=1/job.layers.length,key=job.id+':'+idx+':'+preparationKey(p);
    let entry=cache.get(key);if(!entry){status('loading',base);entry=cache.set(key,{prep:await prepareAudio(layer.buffer,p),analyses:{}});}
    const prep=entry.prep;if(prep.antiPhase)log(t('antiphase'));if(prep.repairedSamples)log(`${prep.repairedSamples} non-finite audio values replaced before analysis.`);
    const selected={...p,cacheId:key},task=['mono','spectral','drums'].includes(p.engine)?p.engine:'analysis',analysisKey=p.profile==='fast'?'fast':'full';
    const dsp=await runDSP(prep.audio,task,selected,base,span*(task==='analysis'?.16:.85),entry.analyses[analysisKey]);entry.analyses[analysisKey]=dsp.analysis;
    if(!summary)summary=dsp.analysis;if(dsp.analysis.rmsTotal<.0005){log(`${layer.name}: ${t('silent')}`);continue;}
    let notes=dsp.notes;
    if(task==='analysis'){
      status('loadingModel',base+.16*span);await yieldTask();notes=await transcribeAI(prep.audio,p,v=>{status('runningAI',base+span*(.16+(p.recover?.51:.61)*v));$('modelStatus').textContent=`Basic Pitch · ${aiStatus().backend}`;},()=>state.cancel,entry);
      reused ||= aiStatus().cacheHit;
      if(p.engine==='hybrid'&&p.recover){const extra=await runDSP(prep.audio,'spectral',selected,base+span*.67,span*.12,dsp.analysis);
        for(const n of extra.notes||[]){if(n.confidence<.72||!dsp.analysis.onsets.some(t=>Math.abs(t-n.start)<.035))continue;
          if(!notes.some(q=>q.pitch===n.pitch&&Math.max(q.start,n.start)<Math.min(q.start+q.duration,n.start+n.duration)))notes.push({...n,source:'spectral-recovery'});}}
    }
    if(state.cancel)throw new Error('CANCELLED');
    notes=(notes||[]).map((n,i)=>({...n,id:`proposal-${i+1}`}));
    const reviewed=await runDSP(prep.audio,'review',{...selected,notes},base+span*.79,span*.1,dsp.analysis);
    const refinement={...p,align:p.engine==='hybrid'&&p.align};
    const accepted=refineNotes(reviewed.notes||[],dsp.analysis,refinement,prep.duration),candidates=refineNotes(reviewed.candidates||[],dsp.analysis,refinement,prep.duration);
    const acceptedIds=new Set(accepted.map(n=>n.id));
    const classified=(await runDSP(prep.audio,'instruments',{...selected,notes:[...accepted,...candidates]},base+span*.9,span*.1,dsp.analysis)).notes;
    for(const n of classified){const placed={...n,start:n.start+prep.offset+(layer.offset||0),track:job.layers.length>1?idx:n.instrumentTrack,id:`${idx}-${n.id}`};(acceptedIds.has(n.id)?combined:rejected).push(placed);}
    notes=accepted;
    cache.trim(key);
    log(`${layer.name}: ${p.engine}/${p.profile}, ${notes.length} notes, ${aiStatus().backend||'DSP'}, BPM=${dsp.analysis.bpm||'?'}.`);
  }
  if(state.cancel)throw new Error('CANCELLED');
  if(job.layers.length===1&&!job.instrumentSetup){for(let i=0;i<FAMILIES.length;i++){job.programs[i]=FAMILIES[i].program;job.trackNames[i]=FAMILIES[i][state.lang];}job.instrumentSetup=true;}
  job.baseNotes=structuredClone(combined);job.editBase=structuredClone(combined);job.notes=arrangeNotes(combined,arrangement());job.baseCandidates=structuredClone(rejected);job.candidateEditBase=structuredClone(rejected);job.candidates=arrangeNotes(rejected,arrangement());job.analysis=summary;job.params={...p};job.state='ready';job.history=[];job.future=[];
  if(summary?.bpm&&summary.beatConfidence>.12&&!Number($('quantize').value)){job.bpm=summary.bpm;$('bpm').value=job.bpm;}else job.bpm=arrangement().bpm;
  job.duration=job.notes.reduce((d,n)=>Math.max(d,n.start+n.duration),Math.max(...job.layers.map(l=>(l.buffer?.duration||0)+(l.offset||0)),0));
  const seconds=(performance.now()-started)/1000;job.lastRun={seconds,reused};
  $('analysisInfo').textContent=`${seconds.toFixed(2)} s · ${t(reused?'cacheUsed':'newAnalysis')}`;
  log(`Completed in ${seconds.toFixed(2)} s; ${job.notes.length} notes; ${rejected.length} review candidates; cache ${(cache.bytes()/1048576).toFixed(1)} MiB; reused AI=${reused}; tensors=${aiStatus().tensors}.`);
}
async function transcribe(batch=false){if(state.busy)return;const job=current();if(!job?.layers.some(l=>l.buffer))return toast(t('needAudio'));let p;try{p=params();}catch(e){return fail(e);}
  player.stop();setBusy(true);state.cancel=false;state.selected=null;
  try{const jobs=batch?state.jobs.filter(j=>j.layers.some(l=>l.buffer)):[job];for(const j of jobs){state.current=j.id;renderStats();const selectedParams={...p};if(batch){selectedParams.regionStart=0;selectedParams.regionEnd=Math.min(600,j.duration);if(j.duration>600)throw new Error('REGION_LONG');}
      await processJob(j,selectedParams);renderAll();}status('finished',1);if(!current().notes.length)toast(t('noNotesFound'));else toast(t('finished'));fit();
  }catch(e){if(e.message==='CANCELLED'){status('cancelled');toast(t('cancelled'));}else fail(e);}
  finally{state.cancel=false;setBusy(false);renderAll();}
}
function cancel(){if(!state.busy||state.importing)return;state.cancel=true;if(state.worker)state.worker.reject();}

function fit(){const j=current(),width=$('rollScroll').clientWidth-70;state.zoom=clamp(width/Math.max(2,j?.duration||12),10,300);$('zoom').value=state.zoom;$('rollScroll').scrollLeft=0;draw();}
function draw(){
  const canvas=$('rollCanvas'),viewport=$('rollScroll'),j=current(),width=Math.max(220,viewport.clientWidth),height=$('rollSpace').clientHeight||366,scale=state.zoom,scroll=viewport.scrollLeft;
  const dpr=Math.min(window.devicePixelRatio||1,2);if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';}
  $('rollSpace').style.width=Math.max(width,(j?.duration||12)*scale+70)+'px';const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
  const css=getComputedStyle(document.documentElement),bg=css.getPropertyValue('--bg').trim(),line=css.getPropertyValue('--grid').trim(),text=css.getPropertyValue('--muted').trim(),surface=css.getPropertyValue('--surface').trim(),mint=css.getPropertyValue('--mint').trim();
  c.fillStyle=bg;c.fillRect(0,0,width,height);const header=25,keyWidth=52,notes=j?.notes||[],startTime=scroll/scale,endTime=(scroll+width-keyWidth)/scale;
  let min=48,max=83;if(notes.length){min=(j.pitchBounds?.[0]??48)-3;max=(j.pitchBounds?.[1]??83)+3;if(max-min<23){const mid=(min+max)/2;min=Math.floor(mid-12);max=min+23;}min=clamp(min,0,126);max=clamp(Math.max(min+1,max),1,127);}
  const row=(height-header)/(max-min+1);state.geometry={width,height,scale,scroll,header,keyWidth,min,max,row,startTime};
  if(state.view==='roll'){
    for(let p=min;p<=max;p++){const y=header+(max-p)*row,isBlack=[1,3,6,8,10].includes(p%12);c.fillStyle=isBlack?'#0000000b':'#ffffff03';c.fillRect(keyWidth,y,width-keyWidth,row);c.strokeStyle=line;c.globalAlpha=p%12===0?.8:.3;c.beginPath();c.moveTo(keyWidth,y);c.lineTo(width,y);c.stroke();c.globalAlpha=1;}
  }
  const bpm=j?.bpm||120,beat=60/bpm,gridStep=scale*beat<18?beat*4:beat;
  for(let time=Math.floor(startTime/gridStep)*gridStep;time<endTime+gridStep;time+=gridStep){const x=keyWidth+time*scale-scroll;c.strokeStyle=line;c.lineWidth=1;c.beginPath();c.moveTo(x,header);c.lineTo(x,height);c.stroke();}
  c.font='9px ui-monospace, monospace';c.textBaseline='middle';const tickStep=scale<25?10:scale<60?5:scale<130?2:1;
  for(let time=Math.ceil(startTime/tickStep)*tickStep;time<endTime+tickStep;time+=tickStep){const x=keyWidth+time*scale-scroll;c.fillStyle=text;c.fillText(time.toFixed(0)+'s',x+4,12);}
  if(state.view==='wave'&&j?.layers[0]?.buffer){const b=j.layers[0].buffer,a=b.getChannelData(0),sr=b.sampleRate,mid=header+(height-header)/2,amplitude=(height-header)*.43;c.strokeStyle=mint;c.beginPath();
    for(let x=keyWidth;x<width;x++){const s=Math.floor((startTime+(x-keyWidth)/scale)*sr),e=Math.min(a.length,Math.ceil((startTime+(x-keyWidth+1)/scale)*sr));let lo=0,hi=0;for(let k=Math.max(0,s);k<e;k++){lo=Math.min(lo,a[k]);hi=Math.max(hi,a[k]);}c.moveTo(x,mid+lo*amplitude);c.lineTo(x,mid+hi*amplitude);}c.stroke();
    c.fillStyle=text;c.fillText('−1',9,height-12);c.fillText('+1',9,header+12);
  }else{
    c.save();c.beginPath();c.rect(keyWidth,header,width-keyWidth,height-header);c.clip();
    const sorted=dragNote?notes:(j?.renderNotes||notes);let lo=0,hi=dragNote?0:sorted.length;while(lo<hi){const mid=(lo+hi)>>1;if(j.prefixEnd[mid]<startTime)lo=mid+1;else hi=mid;}for(let idx=lo;idx<sorted.length;idx++){const n=sorted[idx];if(n.start>endTime){if(dragNote)continue;break;}if(n.start+n.duration<startTime)continue;const x=keyWidth+n.start*scale-scroll,y=header+(max-n.pitch)*row+1,w=Math.max(3,n.duration*scale),h=Math.max(3,row-2),selected=n.id===state.selected,active=player.playing&&state.position>=n.start&&state.position<n.start+n.duration;
      c.globalAlpha=j.muted.has(n.track||0)?.24:.55+n.velocity/127*.45;c.fillStyle=colors[(n.track||0)%colors.length];c.beginPath();c.roundRect(x,y,w,h,Math.min(3,h/3));c.fill();c.globalAlpha=1;
      if(selected||active){c.strokeStyle=active?'#ffffff':'#f3e6a7';c.lineWidth=selected?2:1;c.stroke();}
      if(w>25&&row>=11){c.fillStyle='#0d1c24';c.font=`${Math.min(10,row-3)}px ui-monospace, monospace`;c.fillText(noteName(n.pitch),x+4,y+h/2);}
    }c.restore();c.fillStyle=surface;c.fillRect(0,header,keyWidth,height-header);c.strokeStyle=line;
    for(let p=min;p<=max;p++){const y=header+(max-p)*row;c.fillStyle=[1,3,6,8,10].includes(p%12)?bg:surface;c.fillRect(0,y,keyWidth,row);c.globalAlpha=.5;c.beginPath();c.moveTo(0,y);c.lineTo(keyWidth,y);c.stroke();c.globalAlpha=1;if(p%12===0||row>18){c.fillStyle=text;c.font='9px ui-monospace,monospace';c.fillText(noteName(p),10,y+row/2);}}
  }
  const px=keyWidth+state.position*scale-scroll;if(px>=keyWidth&&px<=width){c.strokeStyle=mint;c.lineWidth=1.5;c.beginPath();c.moveTo(px,header);c.lineTo(px,height);c.stroke();c.fillStyle=mint;c.beginPath();c.moveTo(px-4,header-6);c.lineTo(px+4,header-6);c.lineTo(px,header);c.fill();}
}

const player=new Player(p=>{state.position=p;$('seek').value=p;$('timeLabel').textContent=`${time(p)} / ${time(current()?.duration||0)}`;if(player.playing){const g=state.geometry;if(g&&p*state.zoom-$('rollScroll').scrollLeft>$('rollScroll').clientWidth-90)$('rollScroll').scrollLeft=Math.max(0,p*state.zoom-100);}draw();},()=>{$('playBtn').textContent='▶';});
async function togglePlay(){const j=current();if(!j)return toast(t('needAudio'));if(player.playing){player.stop(true);$('playBtn').textContent='▶';return;}if(!j.notes.length&&$('listenMode').value==='midi')$('listenMode').value='audio';
  try{await player.play(j,$('listenMode').value,state.position);$('playBtn').textContent='Ⅱ';}catch(e){fail(e);}}

let activeDownloadUrl;
function saveBlob(bytes,name,type){
  const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob);
  if(activeDownloadUrl){const retired=activeDownloadUrl;setTimeout(()=>URL.revokeObjectURL(retired),60000);}activeDownloadUrl=url;
  const link=$('downloadLink');link.href=url;link.download=name;link.textContent=`${name} · ${(blob.size/1024).toFixed(1)} KB`;
  $('downloadPanel').hidden=false;link.click();
}
const safeName=name=>(name||'audio').replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,110);
function exportTrack(idx){const j=current(),notes=j?.notes.filter(n=>(n.track||0)===idx);if(!notes?.length)return toast(t('noTrackNotes'));try{const {bytes}=writeMidi(notes,{bpm:j.bpm,name:j.trackNames[idx],programs:j.programs,trackNames:j.trackNames,bends:$('bends').checked});saveBlob(bytes,safeName(j.name)+'-'+safeName(j.trackNames[idx])+'.mid','audio/midi');toast(t('exported'));}catch(e){fail(e);}}
function exportMidi(){try{const j=current();if(!j?.notes.length)return toast(t('needNotes'));const {bytes,stats}=writeMidi(j.notes,{bpm:j.bpm,name:j.name,programs:j.programs,trackNames:j.trackNames,bends:$('bends').checked});saveBlob(bytes,safeName(j.name)+'.mid','audio/midi');log(`MIDI prepared: ${bytes.length} bytes; ${JSON.stringify(stats)}`);toast(t(stats.mode==='notes-channel-budget'?'bendsFallback':'exported'));}catch(e){fail(e);}}
function saveProject(){const j=current();if(!j)return;const obj={format:'auralis-project',version:1,name:j.name,duration:j.duration,bpm:j.bpm,notes:j.notes,baseNotes:j.baseNotes,candidates:j.candidates,baseCandidates:j.baseCandidates,programs:j.programs,trackNames:j.trackNames,params:j.params,sourceFiles:j.layers.map(l=>({name:l.name,offset:l.offset||0})),engine:'Basic Pitch 1.0.1 + Auralis 1.2.0',savedAt:new Date().toISOString()};saveBlob(JSON.stringify(obj,null,2),safeName(j.name)+'.auralis.json','application/json');toast(t('projectSaved'));}
async function openProject(file){if(!file)return;try{if(file.size>50*1024*1024)throw new Error('INVALID_PROJECT');
    const data=parseProject(JSON.parse(await file.text()),file.name),j=newJob({name:data.name});Object.assign(j,data);j.instrumentSetup=true;j.editBase=structuredClone(j.notes);j.candidateEditBase=structuredClone(j.candidates);j.params=null;selectJob(j.id);toast(t('projectOpened'));log(`Opened project: ${j.name}, ${j.notes.length} notes, ${j.candidates.length} review candidates.`);
  }catch(e){fail(new Error('INVALID_PROJECT'));}$('projectInput').value='';}

function exportCSV(){const j=current();if(!j?.notes.length)return toast(t('needNotes'));const header='track,pitch,start_seconds,duration_seconds,velocity,source,instrument_family,instrument_evidence,note_review_evidence\n',body=j.notes.map(n=>[n.track||0,n.pitch,n.start.toFixed(6),n.duration.toFixed(6),n.velocity,String(n.source||'edited').replace(/[^a-zA-Z0-9_-]/g,''),String(n.instrumentFamily||'').replace(/[^a-zA-Z0-9_]/g,''),(n.instrumentConfidence||0).toFixed(4),Number.isFinite(n.noteReliability)?n.noteReliability.toFixed(4):''].join(',')).join('\n');saveBlob(header+body,safeName(j.name)+'.csv','text/csv;charset=utf-8');}
function deleteNote(){const j=current();if(state.busy||!j||!state.selected)return;snapshot();j.notes=j.notes.filter(n=>n.id!==state.selected);commitEdit();state.selected=null;player.stop(true);renderAll();}
function applyNote(){const j=current(),n=j?.notes.find(n=>n.id===state.selected);if(!n||state.busy)return;const values=['notePitch','noteVelocity','noteStart','noteDuration','noteTrack'].map(id=>Number($(id).value));if(!values.every(Number.isFinite)||values[2]<0||values[3]<.025||values[2]>86400||values[3]>86400)return toast(t('INVALID_PROJECT'));
  snapshot();Object.assign(n,{pitch:clamp(Math.round(values[0]),0,127),velocity:clamp(Math.round(values[1]),1,127),start:values[2],duration:values[3],track:clamp(Math.round(values[4]),0,MAX_TRACKS-1),drum:$('noteDrum').checked});j.duration=Math.max(j.duration,n.start+n.duration);commitEdit();player.stop(true);renderAll();}

$('importBtn').onclick=()=>$('audioInput').click();$('audioInput').onchange=e=>importFiles(e.target.files);$('stemBtn').onclick=()=>{if(!current())return toast(t('needAudio'));$('stemInput').click();};$('stemInput').onchange=e=>importFiles(e.target.files,true);
$('demoBtn').onclick=()=>demo();$('chordsBtn').onclick=()=>{$('helpDialog').close();demo(true);};$('openBtn').onclick=()=>$('projectInput').click();$('projectInput').onchange=e=>openProject(e.target.files[0]);
$('candidatesBtn').onclick=()=>{const j=current();if(!j?.candidates?.length||state.busy)return;snapshot();const added=includeCandidates(j);commitEdit();state.selected=added[0]?.id||null;player.stop(true);renderAll();toast(t('candidatesRestored'));};
$('clearCacheBtn').onclick=()=>{if(state.busy)return;cache.clear();if(state.dspWorker){state.dspWorker.terminate();state.dspWorker=null;}$('analysisInfo').textContent='';toast(t('cacheCleared'));};
$('transcribeBtn').onclick=()=>transcribe();$('batchBtn').onclick=()=>transcribe(true);$('cancelBtn').onclick=cancel;$('saveBtn').onclick=saveProject;$('exportBtn').onclick=exportMidi;$('csvBtn').onclick=exportCSV;
$('playBtn').onclick=togglePlay;$('stopBtn').onclick=()=>{player.stop();$('playBtn').textContent='▶';};$('volume').oninput=e=>player.setVolume(Number(e.target.value)/100);
$('listenMode').onchange=()=>{const was=player.playing;player.stop(true);if(was)togglePlay();};$('seek').oninput=e=>{const was=player.playing;player.stop(true);state.position=Number(e.target.value);draw();renderStats();if(was)togglePlay();};
$('sensitivity').oninput=e=>$('sensitivityValue').textContent=e.target.value+'%';$('zoom').oninput=e=>{state.zoom=Number(e.target.value);draw();};$('rollScroll').onscroll=draw;$('fitBtn').onclick=fit;
$('rollTab').onclick=()=>{state.view='roll';$('rollTab').classList.add('active');$('waveTab').classList.remove('active');draw();};$('waveTab').onclick=()=>{state.view='wave';$('waveTab').classList.add('active');$('rollTab').classList.remove('active');draw();};
$('undoBtn').onclick=()=>history();$('redoBtn').onclick=()=>history(true);$('deleteBtn').onclick=deleteNote;$('noteDelete').onclick=deleteNote;$('noteApply').onclick=applyNote;
$('arrangeBtn').onclick=()=>{const j=current();if(!j?.notes.length)return toast(t('needNotes'));snapshot();j.notes=arrangeNotes(structuredClone(j.editBase||j.baseNotes||j.notes),arrangement());j.candidates=arrangeNotes(structuredClone(j.candidateEditBase||j.candidates||[]),arrangement());j.bpm=arrangement().bpm;j.duration=j.notes.reduce((d,n)=>Math.max(d,n.start+n.duration),j.duration);state.selected=null;player.stop(true);renderAll();};
$('restoreBtn').onclick=()=>{const j=current();if(!j||(!j.baseNotes.length&&!j.baseCandidates?.length))return;snapshot();j.notes=arrangeNotes(structuredClone(j.baseNotes),{...arrangement(),quantize:0,transpose:0,split:'keep'});j.candidates=structuredClone(j.baseCandidates||[]);commitEdit();state.selected=null;renderAll();};
$('bpm').onchange=()=>{const j=current();if(j){j.bpm=clamp(Number($('bpm').value)||120,20,300);$('bpm').value=j.bpm;renderStats();draw();}};
$('preset').onchange=e=>{const v=e.target.value,sets={general:[21,108,'hybrid',0],piano:[21,108,'hybrid',0],guitar:[40,96,'hybrid',24],bass:[28,76,'mono',33],voice:[45,90,'mono',53],percussion:[21,108,'drums',0]},s=sets[v];$('minPitch').value=s[0];$('maxPitch').value=s[1];$('engine').value=s[2];if(current()){current().programs[0]=s[3];renderTracks();}};
$('langBtn').onclick=()=>{state.lang=state.lang==='pt'?'en':'pt';try{localStorage.setItem('auralis.lang',state.lang);}catch{}translate();};$('themeBtn').onclick=()=>{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=theme;try{localStorage.setItem('auralis.theme',theme);}catch{}draw();};
$('helpBtn').onclick=()=>$('helpDialog').showModal();$('logBtn').onclick=()=>$('logDialog').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
let dragNote=null;
function point(event){const g=state.geometry,rect=$('rollCanvas').getBoundingClientRect();return {time:Math.max(0,(event.clientX-rect.left-g.keyWidth+g.scroll)/g.scale),pitch:clamp(g.max-Math.floor((event.clientY-rect.top-g.header)/g.row),0,127),x:event.clientX-rect.left,y:event.clientY-rect.top};}
$('rollCanvas').onpointerdown=e=>{if(state.busy||state.view!=='roll')return;const j=current();if(!j)return;const p=point(e);if(p.x<state.geometry.keyWidth||p.y<state.geometry.header)return;
  const matches=j.notes.filter(n=>n.pitch===p.pitch&&p.time>=n.start&&p.time<=n.start+n.duration);const n=matches.at(-1);state.selected=n?.id||null;renderInspector();draw();if(n){player.stop(true);dragNote={id:n.id,time:p.time,pitch:p.pitch,start:n.start,originalPitch:n.pitch,duration:n.duration,resize:Math.abs(p.time-n.start-n.duration)*state.zoom<9};$('rollCanvas').setPointerCapture(e.pointerId);}};
$('rollCanvas').onpointermove=e=>{if(!dragNote)return;const j=current(),n=j?.notes.find(n=>n.id===dragNote.id);if(!n)return;const p=point(e);if(!dragNote.saved&&Math.abs(p.time-dragNote.time)*state.zoom<2&&p.pitch===dragNote.pitch)return;if(!dragNote.saved){dragNote.previousFuture=j.future;snapshot();dragNote.saved=true;}if(dragNote.resize)n.duration=Math.max(.025,dragNote.duration+p.time-dragNote.time);else{n.start=Math.max(0,dragNote.start+p.time-dragNote.time);n.pitch=clamp(dragNote.originalPitch+p.pitch-dragNote.pitch,0,127);}draw();renderInspector();};
$('rollCanvas').onpointerup=()=>{if(dragNote){if(dragNote.saved){const j=current();j.duration=j.notes.reduce((d,n)=>Math.max(d,n.start+n.duration),j.duration);commitEdit();}dragNote=null;renderAll();}};$('rollCanvas').onpointercancel=()=>{if(dragNote?.saved){const j=current(),n=j?.notes.find(n=>n.id===dragNote.id);if(n)Object.assign(n,{start:dragNote.start,pitch:dragNote.originalPitch,duration:dragNote.duration});j.history.pop();j.future=dragNote.previousFuture||[];}dragNote=null;renderAll();};
$('rollCanvas').ondblclick=e=>{if(state.busy||state.view!=='roll')return;const j=current();if(!j)return;const p=point(e);if(p.x<state.geometry.keyWidth||p.y<state.geometry.header)return;const existing=j.notes.find(n=>n.pitch===p.pitch&&p.time>=n.start&&p.time<=n.start+n.duration);if(existing){state.selected=existing.id;renderInspector();draw();return;}snapshot();const n={id:'manual-'+Date.now(),pitch:p.pitch,start:p.time,duration:.25,velocity:80,track:0,source:'manual',confidence:1,bends:[]};j.notes.push(n);j.duration=Math.max(j.duration,n.start+n.duration);commitEdit();state.selected=n.id;renderAll();};
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;if(e.code==='Space'){e.preventDefault();togglePlay();}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteNote();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey);}if(e.key==='Escape'){state.selected=null;renderInspector();draw();}});
for(const type of ['dragenter','dragover'])document.addEventListener(type,e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();document.body.classList.add('dragover');}});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('dragover');});document.addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('dragover');if(e.dataTransfer?.files?.length)importFiles(e.dataTransfer.files);});
new ResizeObserver(()=>draw()).observe($('rollScroll'));window.addEventListener('beforeunload',()=>{player.stop();if(state.worker)state.worker.reject();});
translate();status('statusReady');log('Auralis 1.2.0. Offline package; no audio uploads. Basic Pitch 1.0.1 (Spotify) + trained note reviewer + TensorFlow.js + local DSP.');
// Diagnostics are deliberately read-only. No application or test code reads local files without file-picker input.
globalThis.AuralisDiagnostics=()=>({version:'1.0.0',jobs:state.jobs.length,notes:current()?.notes.length||0,ai:aiStatus(),busy:state.busy});

// MIDI_SHARE_AURALIS_BRIDGE — somente o MIDI; áudio e projetos não são enviados.
globalThis.MidiShareAuralis = {
  async openFile(file) {
    if (state.busy || state.importing) throw Error('Aguarde a análise terminar antes de receber.');
    state.importing=true;
    try {
      const data=globalThis.MidiShareInterop.toAuralis(await file.arrayBuffer());
      if(state.busy)throw Error('Aguarde a análise terminar antes de receber.');
      const job=newJob({name:file.name});
      Object.assign(job,data,{baseNotes:structuredClone(data.notes),state:'done'});
      selectJob(job.id);renderAll();
      return {warnings:data.warnings};
    } finally {state.importing=false;}
  },

  exportFile() {
    if (state.busy || state.importing) throw Error('Aguarde a análise terminar antes de enviar.');
    const job = current();
    if (!job?.notes.length) throw Error('Gere ou abra uma transcrição com notas antes de enviar.');
    const {bytes} = writeMidi(job.notes, {bpm:job.bpm,name:job.name,programs:job.programs,trackNames:job.trackNames,bends:$('bends').checked});
    return new File([bytes],safeName(job.name)+'.mid',{type:'audio/midi'});
  }
};
