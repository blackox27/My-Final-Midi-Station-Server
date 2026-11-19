import ctypes,json,math
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parent/'work';out=root/'corpus';out.mkdir(exist_ok=True);lib=ctypes.CDLL(str(root/'render.so'));lib.auralis_load.argtypes=[ctypes.c_char_p];lib.auralis_load.restype=ctypes.c_void_p;lib.auralis_render.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_float,ctypes.c_float,ctypes.c_void_p,ctypes.c_int]
fonts={n:lib.auralis_load(str(root/(n+'.sf2')).encode()) for n in ['FluidR3_GM','GeneralUser-GS']};assert all(fonts.values());rng=np.random.default_rng(1207);SR=22050;manifest=[]
programs=[0,2,4,8,11,16,19,24,25,27,30,32,33,35,40,42,48,52,56,60,65,68,71,73,75,80,81,88]
def render(font,program,pitch,duration,velocity):
 wave=np.zeros(round((duration+1.0)*SR),dtype=np.float32);ok=lib.auralis_render(font,program,pitch,velocity,duration,wave.ctypes.data,len(wave));return wave if ok else None
for clip in range(72):
 split='train' if clip<40 else 'validation' if clip<52 else 'test';fontName='GeneralUser-GS' if split=='test' else 'FluidR3_GM';font=fonts[fontName];length=7.5;audio=np.zeros(round(length*SR),dtype=np.float32);truth=[];voices=1 if clip%5==0 else 2 if clip%5<=3 else 3
 chosen=rng.choice(programs,voices,replace=False)
 for voice,program in enumerate(chosen):
  rootPitch=int(rng.integers(42,67));lo,hi=(28,58) if 32<=program<40 else (55,89) if 72<=program<80 else (40,88)
  at=.17+voice*.06
  last=int(np.clip(rootPitch,lo,hi));index=0
  while at<6.7:
   duration=float(rng.uniform(.18,.85)) if clip%4 else float(rng.uniform(.55,1.25));pitch=int(np.clip(last+rng.choice([-7,-5,-3,-2,0,0,2,3,5,7]),lo,hi));velocity=float(rng.uniform(.4,.96));pitches=[pitch]
   if voices==1 and clip%10==0:pitches=[pitch,min(hi,pitch+12)]
   elif clip%9==0 and voice==0:pitches=[pitch,min(hi,pitch+4),min(hi,pitch+7)]
   for p in sorted(set(pitches)):
    wave=render(font,int(program),p,duration,velocity)
    if wave is None:continue
    detune=float(rng.uniform(-.004,.004));wave=np.interp(np.arange(len(wave))*(1+detune),np.arange(len(wave)),wave,right=0).astype(np.float32);start=round(at*SR);count=min(len(wave),len(audio)-start);audio[start:start+count]+=wave[:count]*(.5 if voices==1 else .34)
    truth.append({'pitch':p,'start':at,'duration':duration,'program':int(program),'voice':voice})
   last=pitch;at+=duration+float(rng.uniform(-.04,.16));index+=1
 if clip%7==0:audio=np.tanh(audio*1.4).astype(np.float32)
 if clip%3==0:
  delay=int(.09*SR);audio[delay:]+=.11*audio[:-delay]
 if clip%4==1:audio+=rng.normal(0,.0006,len(audio)).astype(np.float32)
 peak=np.max(np.abs(audio));audio*=min(6,.85/max(peak,1e-6));path=f'clip-{clip:03d}.f32';audio.tofile(out/path);manifest.append({'id':clip,'split':split,'font':fontName,'file':path,'truth':truth,'duration':length})
 if clip%12==0:print('generated',clip,flush=True)
(root/'corpus.json').write_text(json.dumps(manifest));print('Corpus',len(manifest),'clips',sum(len(c['truth']) for c in manifest),'notes',flush=True)
