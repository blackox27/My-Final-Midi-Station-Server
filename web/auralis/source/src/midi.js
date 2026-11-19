import {clamp} from './dsp.js';
const ascii=s=>Array.from(s,c=>c.charCodeAt(0));
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function vlq(n){n=Math.max(0,Math.min(0x0fffffff,Math.round(n)));const a=[n&127];while((n>>>=7))a.unshift((n&127)|128);return a;}
const text=(type,s)=>{const a=[...new TextEncoder().encode(s)];return [255,type,...vlq(a.length),...a];};
function track(events){events.sort((a,b)=>a.tick-b.tick||a.priority-b.priority);const out=[];let previous=0;
  for(const e of events){while(e.tick-previous>0x0fffffff){out.push(...vlq(0x0fffffff),255,1,0);previous+=0x0fffffff;}out.push(...vlq(e.tick-previous),...e.bytes);previous=e.tick;}
  out.push(0,255,47,0);return [...ascii('MTrk'),...u32(out.length),...out];}
export function writeMidi(notes,options={}){
  if(!Array.isArray(notes)||notes.some(n=>!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||!Number.isFinite(n.start)||n.start<0||n.start>86400||!Number.isFinite(n.duration)||n.duration<=0||n.duration>86400))throw new Error('MIDI_INVALID_NOTES');
  const velocity=n=>clamp(Math.round(Number.isFinite(n.velocity)?n.velocity:75),1,127);
  const ppq=960,bpm=clamp(Number(options.bpm)||120,20,300),tempo=Math.round(60000000/bpm),ticks=t=>Math.max(0,Math.round(t*ppq*bpm/60));
  const conductor=track([{tick:0,priority:0,bytes:text(3,'Auralis — '+(options.name||'Audio to MIDI'))},
    {tick:0,priority:0,bytes:[255,81,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255]},
    {tick:0,priority:0,bytes:text(1,'Performance timing preserved; BPM is a reference unless quantization is enabled.')}]);
  const groups=new Map();for(const n of notes){const k=n.drum?'drums':String(n.track||0);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(n);}
  const tracks=[conductor],stats={bendsWritten:0,bendsSkipped:0,mode:options.bends?'independent-channel-bends':'notes'};
  const channels=[0,1,2,3,4,5,6,7,8,10,11,12,13,14,15];let nextChannel=0;
  if([...groups.keys()].filter(k=>k!=='drums').length>15)throw new Error('MIDI_TRACK_LIMIT');
  // In expressive mode every simultaneous note receives its own channel. Fixed two-semitone bend range.
  if(options.bends){
    const eventGroups=new Map(),pool=channels.map(ch=>({ch,end:-1,program:-1}));
    for(const n of [...notes].sort((a,b)=>a.start-b.start)){
      const key=n.drum?'drums':String(n.track||0),idx=n.track||0;
      if(!eventGroups.has(key))eventGroups.set(key,[{tick:0,priority:-1,bytes:text(3,options.trackNames?.[idx]||(n.drum?'Percussion':`Track ${idx+1}`))}]);
      const events=eventGroups.get(key);
      const program=clamp(options.programs?.[n.track||0]??options.program??0,0,127),begin=ticks(n.start),end=Math.max(begin+1,ticks(n.start+n.duration));
      if(n.drum){events.push({tick:begin,priority:3,bytes:[0x99,n.pitch,velocity(n)]},{tick:end,priority:0,bytes:[0x89,n.pitch,0]});continue;}
      const slot=pool.find(s=>s.end<begin||(s.end===begin&&s.key===key));if(!slot){stats.bendsSkipped++;continue;}slot.end=end;slot.key=key;const ch=slot.ch;
      events.push({tick:begin,priority:1,bytes:[0xc0|ch,program]},{tick:begin,priority:1,bytes:[0xb0|ch,101,0]},{tick:begin,priority:1,bytes:[0xb0|ch,100,0]},{tick:begin,priority:1,bytes:[0xb0|ch,6,2]},{tick:begin,priority:1,bytes:[0xb0|ch,38,0]});
      events.push({tick:begin,priority:1,bytes:[0xe0|ch,0,64]});
      const bends=(n.bends||[]).filter(b=>b.time>=0&&b.time<n.duration);if(!bends.length)bends.push({time:0,cents:0});
      for(const b of bends){const v=clamp(Math.round(8192+clamp(b.cents,-200,200)/200*8192),0,16383);events.push({tick:ticks(n.start+b.time),priority:2,bytes:[0xe0|ch,v&127,(v>>7)&127]});stats.bendsWritten++;}
      events.push({tick:begin,priority:3,bytes:[0x90|ch,n.pitch,velocity(n)]},{tick:end,priority:0,bytes:[0x80|ch,n.pitch,0]});
    }
    // Never lose notes when expression exceeds the channel budget: fall back to conventional MIDI for the whole file.
    if(stats.bendsSkipped)return {...writeMidi(notes,{...options,bends:false}),stats:{...stats,mode:'notes-channel-budget',bendsWritten:0}};
    for(const events of eventGroups.values())tracks.push(track(events));
  }else{
    for(const [key,list]of groups){const isDrum=key==='drums',ch=isDrum?9:channels[nextChannel++],idx=isDrum?(list[0].track||0):Number(key),program=clamp(options.programs?.[idx]??options.program??0,0,127);
      const events=[{tick:0,priority:-1,bytes:text(3,options.trackNames?.[idx]||(isDrum?'Percussion':`Track ${idx+1}`))},{tick:0,priority:1,bytes:[0xc0|ch,program]}];
      // A conventional channel cannot safely address overlapping occurrences of the same key.
      const byPitch=new Map();for(const n of list){if(!byPitch.has(n.pitch))byPitch.set(n.pitch,[]);byPitch.get(n.pitch).push(n);}
      for(const [p,sequence]of byPitch){sequence.sort((a,b)=>a.start-b.start);for(let i=0;i<sequence.length;i++){const n=sequence[i],begin=ticks(n.start),next=sequence[i+1],end=Math.max(begin+1,Math.min(ticks(n.start+n.duration),next?ticks(next.start):Infinity));
        events.push({tick:begin,priority:3,bytes:[0x90|ch,p,velocity(n)]},{tick:end,priority:0,bytes:[0x80|ch,p,0]});}}
      tracks.push(track(events));
    }
  }
  const header=[...ascii('MThd'),0,0,0,6,0,1,(tracks.length>>8)&255,tracks.length&255,(ppq>>8)&255,ppq&255];
  const total=header.length+tracks.reduce((a,b)=>a+b.length,0),bytes=new Uint8Array(total);bytes.set(header);let offset=header.length;for(const t of tracks){bytes.set(t,offset);offset+=t.length;}
  return {bytes,stats};
}
