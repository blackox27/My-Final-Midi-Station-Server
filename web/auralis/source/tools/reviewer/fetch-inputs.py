from pathlib import Path
import urllib.request,hashlib,json,zipfile,sys
root=Path(__file__).resolve().parent/'work';root.mkdir(exist_ok=True)
files=[('FluidR3_GM.sf2','https://github.com/pianobooster/fluid-soundfont/releases/download/v3.1/FluidR3_GM.sf2',148398306,'74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0'),('GeneralUser-GS.sf2','https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2',32319396,'9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe')]
for name,url,size,digest in files:
 p=root/name
 if p.exists() and p.stat().st_size==size and hashlib.sha256(p.read_bytes()).hexdigest()==digest:continue
 part=p.with_suffix('.part')
 with urllib.request.urlopen(url,timeout=120) as response,part.open('wb') as f:
  while block:=response.read(1024*1024):f.write(block)
 if part.stat().st_size!=size or hashlib.sha256(part.read_bytes()).hexdigest()!=digest:raise RuntimeError('Download incompleto ou hash divergente: '+name)
 part.replace(p);print('Verificado:',name,flush=True)
if '--vocals' in sys.argv:
 record=json.load(urllib.request.urlopen('https://zenodo.org/api/records/5578807',timeout=60));item=next(f for f in record['files'] if f['key']=='vocadito.zip');p=root/'vocadito.zip'
 if not p.exists() or p.stat().st_size!=item['size']:
  with urllib.request.urlopen(item['links']['self'],timeout=120) as response,p.open('wb') as f:
   while block:=response.read(1024*1024):f.write(block)
 with zipfile.ZipFile(p) as z:
  desired=['Annotations/README.txt']+[f'Audio/vocadito_{i}.wav' for i in [10,14]]+[f'Annotations/Notes/vocadito_{i}_notes{a}.csv' for i in [10,14] for a in ['A1','A2']]
  for name in desired:
   destination=root/'vocadito-selected'/name;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(z.read(name))
 print('Vocadito 10 e 14 preparados. Crédito: Bittner et al., 2021; CC BY 4.0.')
