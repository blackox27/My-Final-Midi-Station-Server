from pathlib import Path
import json,numpy as np
r=Path(__file__).resolve().parent/'work';data=json.loads((r/'review-dataset.json').read_text());rows=data['rows'];X=np.array([n['features'] for n in rows],dtype=np.float32);y=np.array([n['label'] for n in rows],dtype=np.float32);tr=np.array([n['split']=='train' for n in rows]);va=np.array([n['split']=='validation' for n in rows]);mean=X[tr].mean(0);std=np.maximum(X[tr].std(0),.025);Z=np.clip((X-mean)/std,-7,7);rng=np.random.default_rng(1209);H=24
W1=(rng.normal(size=(24,H))*np.sqrt(2/24)).astype(np.float32);b1=np.zeros(H,dtype=np.float32);W2=(rng.normal(size=H)*.1).astype(np.float32);b2=np.zeros(1,dtype=np.float32);P=[W1,b1,W2,b2];M=[np.zeros_like(p) for p in P];V=[np.zeros_like(p) for p in P];best=(1e9,None,0);step=0;idxTrain=np.where(tr)[0]
groupCounts={}
for n in rows:groupCounts[(n['clip'],n['sensitivity'])]=groupCounts.get((n['clip'],n['sensitivity']),0)+1
weight=np.array([1/np.sqrt(groupCounts[(n['clip'],n['sensitivity'])]) for n in rows],dtype=np.float32);weight/=weight[tr].mean()
for epoch in range(400):
 for _ in range(16):
  idx=rng.choice(idxTrain,192,replace=True);xx=Z[idx]+rng.normal(0,.025,(len(idx),24)).astype(np.float32);pre=xx@W1+b1;h=np.maximum(pre,0);drop=(rng.random(h.shape)>.08)/.92;hh=h*drop;logit=hh@W2+b2;prob=1/(1+np.exp(-np.clip(logit,-30,30)));err=(prob-y[idx])*weight[idx]/len(idx);dh=err[:,None]*W2*drop*(pre>0);grads=[xx.T@dh+.0008*W1,dh.sum(0),hh.T@err+.0008*W2,np.array([err.sum()])];step+=1;lr=.0018*(.3+.7*(1-epoch/400))
  for p,g,m,v in zip(P,grads,M,V):m*=.9;m+=.1*g;v*=.999;v+=.001*g*g;p-=lr*(m/(1-.9**step))/(np.sqrt(v/(1-.999**step))+1e-8)
 if epoch%10==0:
  p=1/(1+np.exp(-np.clip(np.maximum(Z[va]@W1+b1,0)@W2+b2,-30,30)));loss=float(np.mean(-y[va]*np.log(p+1e-8)-(1-y[va])*np.log(1-p+1e-8)))
  if loss<best[0]:best=(loss,[p.copy() for p in P],epoch)
  if epoch%100==0:print('epoch',epoch,'validation loss',loss,flush=True)
W1,b1,W2,b2=best[1];prob=1/(1+np.exp(-np.clip(np.maximum(Z@W1+b1,0)@W2+b2,-30,30)))
def metric(split,threshold,sensitivity=.55):
 tp=fp=fn=0
 for clip in data['corpus']:
  if clip['split']!=split:continue
  candidate=[(i,n) for i,n in enumerate(rows) if n['clip']==clip['id'] and n['sensitivity']==sensitivity and (n['pitch']<28 or n['pitch']>89 or prob[i]>=threshold)]
  adj=[[j for j,t in enumerate(clip['truth']) if n['pitch']==t['pitch'] and abs(n['start']-t['start'])<=.05] for i,n in candidate];match={}
  def visit(i,seen):
   for j in adj[i]:
    if j in seen:continue
    seen.add(j)
    if j not in match or visit(match[j],seen):match[j]=i;return True
   return False
  for i in range(len(candidate)):visit(i,set())
  matched=len(match);tp+=matched;fp+=len(candidate)-matched;fn+=len(clip['truth'])-matched
 precision=tp/max(1,tp+fp);recall=tp/max(1,tp+fn);f1=2*precision*recall/max(1e-9,precision+recall);return dict(tp=tp,fp=fp,fn=fn,precision=precision,recall=recall,f1=f1)
base=metric('validation',0);scores=[(float(t),metric('validation',float(t))) for t in np.linspace(0,.95,96)];safe=[v for v in scores if v[1]['recall']>=base['recall']*.98];balanced=max(safe,key=lambda v:(v[1]['f1'],v[1]['precision']));precise=max(scores,key=lambda v:((1+.5**2)*v[1]['precision']*v[1]['recall']/max(1e-9,.5**2*v[1]['precision']+v[1]['recall']),v[1]['f1']))
model={'version':1,'features':24,'hidden':H,'minPitch':28,'maxPitch':89,'balancedThreshold':balanced[0],'preciseThreshold':precise[0],'mean':mean.tolist(),'std':std.tolist(),'w1':W1.ravel().tolist(),'b1':b1.tolist(),'w2':W2.tolist(),'b2':float(b2[0])}
def rounded(o):
 if isinstance(o,float):return round(o,7)
 if isinstance(o,list):return [rounded(v) for v in o]
 if isinstance(o,dict):return {k:rounded(v) for k,v in o.items()}
 return o
out=Path(__file__).resolve().parents[2];(out/'src/review-model.js').write_text('// Auralis Note Reviewer v1. MIT. Synthetic training; see docs/REVISAO-IA.md.\nexport default '+json.dumps(rounded(model),separators=(',',':'))+';\n')
metrics={'seed':1209,'trainRows':int(tr.sum()),'validationRows':int(va.sum()),'testRows':int((~tr&~va).sum()),'bestEpoch':best[2],'validationLoss':best[0],'onsetToleranceSeconds':.05,'onsetLabelToleranceSeconds':.08,'trainingFont':'FluidR3_GM','testFont':'GeneralUser-GS','balancedThreshold':balanced[0],'preciseThreshold':precise[0],'validation':{'baseline':base,'balanced':balanced[1],'precise':precise[1]},'test':{'baseline':metric('test',0),'balanced':metric('test',balanced[0]),'precise':metric('test',precise[0])},'testSensitivity':{str(s):{'baseline':metric('test',0,s),'balanced':metric('test',balanced[0],s)} for s in [.35,.75]},'limitations':'Synthetic clips only. No real-recording accuracy claim. Test soundfont, compositions and note events were not used to train or choose thresholds. Pitch+onset matching ignores duration and instrument identity.'}
(r/'review-metrics.json').write_text(json.dumps(metrics,indent=2));print(json.dumps(metrics,indent=2),flush=True)
