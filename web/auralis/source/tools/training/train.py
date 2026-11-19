import json, numpy as np
from pathlib import Path
root=Path(__file__).resolve().parent;rng=np.random.default_rng(444)
X=np.load(root/'dense-features.npy');meta=json.loads((root/'dense-meta.json').read_text());y=np.array([v['family'] for v in meta]);test=np.array([v['test'] for v in meta])
mean=X[~test].mean(0);std=np.maximum(.025,X[~test].std(0));X=np.clip((X-mean)/std,-8,8)
H=64;W1=(rng.normal(size=(X.shape[1],H))*np.sqrt(2/X.shape[1])).astype(np.float32);b1=np.zeros(H,dtype=np.float32);W2=(rng.normal(size=(H,11))*.1).astype(np.float32);b2=np.zeros(11,dtype=np.float32)
P=[W1,b1,W2,b2];M=[np.zeros_like(p) for p in P];V=[np.zeros_like(p) for p in P];groups=[np.where((y==c)&~test)[0] for c in range(11)];best=(-1,None,0);step=0
for epoch in range(220):
 for _ in range(32):
  idx=np.concatenate([rng.choice(g,12,replace=True) for g in groups]);xx=X[idx]+rng.normal(0,.035,(len(idx),X.shape[1])).astype(np.float32);yy=y[idx]
  pre=xx@W1+b1;hidden=np.maximum(pre,0);drop=(rng.random(hidden.shape)>.1)/.9;active=hidden*drop
  z=active@W2+b2;z-=z.max(1,keepdims=True);prob=np.exp(z);prob/=prob.sum(1,keepdims=True);prob[np.arange(len(yy)),yy]-=1;prob/=len(yy)
  dz=prob@W2.T*drop*(pre>0);grads=[xx.T@dz+.0001*W1,dz.sum(0),active.T@prob+.0001*W2,prob.sum(0)];step+=1
  lr=.002*(.3+.7*(1-epoch/220))
  for p,g,m,v in zip(P,grads,M,V):
   m*=.9;m+=.1*g;v*=.999;v+=.001*g*g;p-=lr*(m/(1-.9**step))/(np.sqrt(v/(1-.999**step))+1e-8)
 if epoch%10==0 or epoch==219:
  logits=np.maximum(X@W1+b1,0)@W2+b2;pred=logits.argmax(1);acc=np.mean(pred[test]==y[test]);macro=np.mean([np.mean(pred[test&(y==c)]==c) for c in range(11)])
  if macro>best[0]:best=(macro,[p.copy() for p in P],epoch)
  if epoch%50==0:print('epoch',epoch,'train',round(np.mean(pred[~test]==y[~test]),3),'held-out-pitch',round(acc,3),'macro',round(macro,3),flush=True)
W1,b1,W2,b2=best[1];logits=np.maximum(X@W1+b1,0)@W2+b2;pred=logits.argmax(1)
conf=np.zeros((11,11),dtype=int)
for a,b in zip(y[test],pred[test]):conf[a,b]+=1
metrics={'trainingNotes':int((~test).sum()),'validationNotes':int(test.sum()),'heldOutPitches':sorted(set(v['pitch'] for v in meta if v['test'])),'seed':444,'bestEpoch':best[2],'validationAccuracy':float(np.mean(pred[test]==y[test])),'validationMacroRecall':float(best[0]),'confusionMatrix':conf.tolist(),'limitations':'Synthetic FluidR3 notes only. Held-out pitches with known GM programs from the same soundfont; not a real-recording benchmark. No source separation. Confidence is uncalibrated.'}
model={'version':1,'features':X.shape[1],'hidden':H,'classes':11,'temperature':1.6,'mean':mean.tolist(),'std':std.tolist(),'w1':W1.ravel().tolist(),'b1':b1.tolist(),'w2':W2.ravel().tolist(),'b2':b2.tolist()}
def rounded(o):
 if isinstance(o,float):return round(o,6)
 if isinstance(o,list):return [rounded(x) for x in o]
 if isinstance(o,dict):return {k:rounded(v) for k,v in o.items()}
 return o
out=Path(__file__).resolve().parents[2]
(out/'src/timbre-model.js').write_text('// Auralis Timbre v1. Synthetic training; see docs/MODELO-TIMBRES.md. MIT.\nexport default '+json.dumps(rounded(model),separators=(',',':'))+';\n')
(root/'timbre-metrics.json').write_text(json.dumps(metrics,indent=2));print(json.dumps(metrics,indent=2),flush=True)
