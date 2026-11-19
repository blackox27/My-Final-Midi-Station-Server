import {clamp,SR} from './dsp.js';

// One scan per pitch; repeated attacks split a sustained pitch. No residual scans.
export function decodeActivations(a,p){
  const out=[],frames=a.frames,onsets=a.onsets,T=a.times.length,F=88;
  const sensitivity=clamp(p.sensitivity,0,1),on=.7-sensitivity*.42,off=.46-sensitivity*.29;
  const minFrames=Math.max(2,Math.round(p.minMs/1000*SR/256));
  const gap=Math.max(0,Math.round(p.gapMs/1000*SR/256));
  const timeAt=i=>i<T?a.times[i]:(a.times[T-1]||0)+(i-T+1)*256/SR;
  for(let pitch=Math.max(21,p.minPitch);pitch<=Math.min(108,p.maxPitch);pitch++){
    const k=pitch-21;let start=-1,last=-1,sum=0,count=0;
    const close=()=>{
      if(start<0)return;
      if(last-start+1>=minFrames){
        const begin=timeAt(start),end=Math.min(a.duration,timeAt(last+1));
        if(end-begin>=p.minMs/1000)out.push({pitch,start:begin,duration:end-begin,velocity:clamp(Math.round((sum/Math.max(1,count))**.65*127),12,124),confidence:clamp(sum/Math.max(1,count),0,1),source:'basic-pitch',startFrame:start,endFrame:last+1,bends:[]});
      }
      start=-1;last=-1;sum=0;count=0;
    };
    for(let t=0;t<T;t++){
      const f=frames[t*F+k],o=onsets[t*F+k],before=t?onsets[(t-1)*F+k]:0,after=t+1<T?onsets[(t+1)*F+k]:0;
      const attack=o>=on&&o>before&&o>=after;
      if(attack&&start>=0&&t-start>=Math.max(3,minFrames)&&t-last<=gap+1){last=Math.min(last,t-1);close();}
      const supported=f>=off||(attack&&f>=off*.55);
      if(supported){
        if(start<0){
          if(!attack&&f<off*1.18)continue;
          start=t;if(attack)while(start>0&&t-start<3&&frames[(start-1)*F+k]>=off*.75)start--;
        }
        last=t;sum+=f;count++;
      }else if(start>=0&&t-last>gap)close();
    }
    close();
  }
  if(p.bends&&a.contours){
    for(const n of out){const center=(n.pitch-21)*3;
      for(let t=n.startFrame;t<n.endFrame;t+=3){let index=center,best=-1;
        for(let j=Math.max(0,center-5);j<=Math.min(263,center+5);j++){const v=a.contours[t*264+j];if(v>best){best=v;index=j;}}
        n.bends.push({time:Math.max(0,timeAt(t)-n.start),cents:(index-center)*100/3});
      }
    }
  }
  return out.sort((a,b)=>a.start-b.start||a.pitch-b.pitch).map(({startFrame,endFrame,...n})=>n);
}
