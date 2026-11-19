from pathlib import Path
import urllib.request,hashlib
p=Path(__file__).resolve().parent/'FluidR3_GM.sf2'
expected='74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0'
url='https://github.com/pianobooster/fluid-soundfont/releases/download/v3.1/FluidR3_GM.sf2'
if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=expected:
    with urllib.request.urlopen(url,timeout=90) as response,p.open('wb') as f:
        while block:=response.read(1024*1024):f.write(block)
if p.stat().st_size!=148398306 or hashlib.sha256(p.read_bytes()).hexdigest()!=expected:
    raise RuntimeError('Download incompleto ou conteúdo divergente. Apague o SF2 incompleto e tente novamente.')
print('FluidR3 verificado:',p.name)
