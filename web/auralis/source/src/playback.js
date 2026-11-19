import {audioContext} from './audio.js';
import {hz,clamp} from './dsp.js';
export class Player{
  constructor(onTime=()=>{},onEnd=()=>{}){this.onTime=onTime;this.onEnd=onEnd;this.sources=[];this.voices=[];this.position=0;this.playing=false;this.volume=.65;this.lookahead=.3;}
  stop(keep=false){const p=this.current();this.playing=false;clearInterval(this.timer);cancelAnimationFrame(this.raf);for(const s of this.sources)try{s.stop();}catch{}for(const v of this.voices)try{v.stop();}catch{}this.sources=[];this.voices=[];if(this.master)try{this.master.disconnect();}catch{}this.position=keep?p:0;this.onTime(this.position);}
  current(){return this.playing?this.position+(audioContext().currentTime-this.started):this.position;}
  async play(project,mode='midi',position=0){
    this.stop();const ctx=audioContext();await ctx.resume();this.project=project;this.mode=mode;this.position=clamp(position,0,project.duration);this.started=ctx.currentTime+.035;this.playing=true;
    this.master=ctx.createGain();this.master.gain.value=this.volume;this.master.connect(ctx.destination);
    const sorted=[...project.notes].sort((a,b)=>a.start-b.start);let cursor=0;while(cursor<sorted.length&&sorted[cursor].start+sorted[cursor].duration<=this.position)cursor++;
    if(mode==='audio'||mode==='both')for(const layer of project.layers){if(!layer.buffer||position>=layer.buffer.duration)continue;const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=layer.buffer;g.gain.value=mode==='both'?.58:1;s.connect(g).connect(this.master);s.start(this.started,position);this.sources.push(s);}
    const schedule=()=>{if(!this.playing)return;const now=this.current(),until=now+this.lookahead;
      if(mode!=='audio')while(cursor<sorted.length&&sorted[cursor].start<=until){const n=sorted[cursor++];if(project.muted?.has(n.track||0)||n.start+n.duration<=Math.max(this.position,now))continue;
        const offset=Math.max(0,this.position-n.start,now-n.start),begin=Math.max(ctx.currentTime+.008,this.started+n.start-this.position),length=Math.max(.02,n.duration-offset);
        if(n.drum){this.drum(n,begin);continue;}const oscillator=ctx.createOscillator(),g=ctx.createGain(),program=project.programs[n.track||0]||0;
        oscillator.type=program>=80&&program<88?'sawtooth':program>=32&&program<40?'triangle':program>=16&&program<24?'square':'sine';oscillator.frequency.value=hz(n.pitch);
        const gain=(n.velocity/127)*.13*(mode==='both'?.7:1),release=Math.min(.08,length*.2);g.gain.setValueAtTime(0,begin);g.gain.linearRampToValueAtTime(gain,begin+.009);g.gain.setValueAtTime(gain*.8,begin+Math.max(.01,length-release));g.gain.linearRampToValueAtTime(0,begin+length);
        let initial=0;for(const b of n.bends||[])if(b.time<=offset)initial=b.cents;oscillator.detune.setValueAtTime(clamp(initial,-200,200),begin);for(const b of n.bends||[])if(b.time>offset&&b.time-offset<length)oscillator.detune.setValueAtTime(clamp(b.cents,-200,200),begin+b.time-offset);
        oscillator.connect(g).connect(this.master);oscillator.start(begin);oscillator.stop(begin+length+.01);oscillator.onended=()=>{oscillator.disconnect();g.disconnect();const i=this.voices.indexOf(oscillator);if(i>=0)this.voices.splice(i,1);};this.voices.push(oscillator);
      }
    };schedule();this.timer=setInterval(schedule,70);
    const draw=()=>{if(!this.playing)return;const p=this.current();if(p>=project.duration+.1){this.stop();this.onEnd();return;}this.onTime(Math.max(0,p));this.raf=requestAnimationFrame(draw);};draw();
  }
  drum(note,begin){const ctx=audioContext(),duration=note.pitch===42?.08:.18,g=ctx.createGain(),gain=note.velocity/127*.17;
    g.gain.setValueAtTime(gain,begin);g.gain.exponentialRampToValueAtTime(.0001,begin+duration);
    let source;if(note.pitch===36){source=ctx.createOscillator();source.frequency.setValueAtTime(135,begin);source.frequency.exponentialRampToValueAtTime(43,begin+duration);}
    else {source=ctx.createBufferSource();const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1);source.buffer=b;}
    source.connect(g).connect(this.master);source.start(begin);source.stop(begin+duration);source.onended=()=>{source.disconnect();g.disconnect();const i=this.voices.indexOf(source);if(i>=0)this.voices.splice(i,1);};this.voices.push(source);
  }
  setVolume(v){this.volume=v;if(this.master)this.master.gain.setTargetAtTime(v,audioContext().currentTime,.015);}
}
