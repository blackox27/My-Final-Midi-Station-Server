import ctypes,json,math
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parent;N=4096;SR=22050
window=.5-.5*np.cos(2*np.pi*np.arange(N)/(N-1));toMel=lambda f:2595*np.log10(1+f/700);fromMel=lambda m:700*(10**(m/2595)-1);points=fromMel(np.linspace(toMel(30),toMel(10000),26))*N/SR
filters=np.zeros((24,N//2+1))
for i in range(24):
 for k in range(math.ceil(points[i]),math.ceil(points[i+2])):
  filters[i,k]=max(0,(k-points[i])/(points[i+1]-points[i]) if k<=points[i+1] else (points[i+2]-k)/(points[i+2]-points[i+1]))
dct=np.cos(np.pi*np.arange(1,15)[:,None]*(np.arange(24)+.5)[None,:]/24)
def features(w,pitch,start=0,duration=.75):
 feat=[];levels=[];centroids=[];flat=[];noise=[];cepstra=[]
 for offset in [min(.045,duration*.2),min(.16,duration*.5),min(.36,duration*.8)]:
  center=math.floor((start+offset)*SR/128+.5)*128;at=center-N//2;block=np.zeros(N);lo=max(0,at);hi=min(len(w),at+N)
  if hi>lo:block[lo-at:hi-at]=w[lo:hi]
  spec=np.abs(np.fft.rfft(block*window))*2/N;harm=[];energy=0;weighted=0;logs=0;floorSum=0
  for h in range(1,17):
   b=440*2**((pitch-69)/12)*h*N/SR
   if b>len(spec)-3:harm.append(0);continue
   k=math.floor(b+.5);peak=max(spec[k-1:k+2]);floor=(spec[k-3]+spec[k+3])*.5;v=max(0,peak-floor*.35);harm.append(v);energy+=v*v;weighted+=h*v*v;logs+=math.log(v+1e-7);floorSum+=floor
  norm=math.sqrt(energy)+1e-8;levels.append(norm);feat.extend(np.log1p(10*np.array(harm)/norm)/math.log(11));centroids.append((weighted/(energy+1e-10)-1)/15);flat.append(np.clip(math.exp(logs/16)/(sum(harm)/16+1e-8),0,1));noise.append(np.clip(floorSum/(sum(harm)+1e-8),0,2)/2);cepstra.extend(dct@np.log(filters@(spec*spec)+1e-12)/24)
 feat.extend(centroids+flat+noise);feat.extend([np.clip(math.log((levels[1]+1e-7)/(levels[0]+1e-7)),-4,4)/4,np.clip(math.log((levels[2]+1e-7)/(levels[0]+1e-7)),-4,4)/4]);feat.extend(cepstra);return np.array(feat,dtype=np.float32)
if __name__=='__main__':
 lib=ctypes.CDLL(str(root/'render.so'));lib.auralis_load.argtypes=[ctypes.c_char_p];lib.auralis_load.restype=ctypes.c_void_p;lib.auralis_render.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_float,ctypes.c_float,ctypes.c_void_p,ctypes.c_int];font=lib.auralis_load(str(root/'FluidR3_GM.sf2').encode());assert font
 families=[list(range(0,8)),list(range(8,16))+[47,108],list(range(16,24)),list(range(24,32))+list(range(104,108)),list(range(32,40)),list(range(40,47))+list(range(48,52))+[110],list(range(52,55)),list(range(56,64)),list(range(64,72))+[109,111],list(range(72,80)),list(range(80,104))];X=[];meta=[]
 for family,programs in enumerate(families):
  for program in programs:
   for pitch in range(36,90):
    for velocity in [.5,.9]:
     wave=np.zeros(22050,dtype=np.float32)
     if not lib.auralis_render(font,program,pitch,velocity,.75,wave.ctypes.data,len(wave)) or np.max(np.abs(wave))<1e-5:continue
     for jitter,duration,gain in [(0,.75,1),(-.025,.65,.35),(.025,.9,.8)]:
      X.append(features(wave*gain,pitch,jitter,duration));meta.append(dict(family=family,program=program,pitch=pitch,velocity=velocity,test=pitch%4==1))
  print('family',family,'examples',len(X),flush=True)
 np.save(root/'dense-features.npy',np.array(X,dtype=np.float32));(root/'dense-meta.json').write_text(json.dumps(meta));print('Dense corpus ready',len(X),flush=True)
