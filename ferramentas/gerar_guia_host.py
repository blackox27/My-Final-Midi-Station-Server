"""Gera o guia HTML independente sem instalar dependências adicionais."""
from pathlib import Path
import html
import re

ROOT = Path(__file__).resolve().parents[1]

def inline(text):
    # Fontes locais controladas: escape HTML e preserve apenas a marcação simples.
    text=html.escape(text)
    text=re.sub(r'`([^`]+)`',r'<code>\1</code>',text)
    text=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',text)
    text=re.sub(r'https?://[^\s<]+',lambda m:'<a href="'+m[0]+'" rel="noreferrer">'+m[0]+'</a>',text)
    return text

def build():
    lines=(ROOT/'COMECE-AQUI-HOST.md').read_text(encoding='utf-8').splitlines()
    parts=[];toc=[];i=0;heading=0
    while i<len(lines):
        line=lines[i]
        if not line.strip():i+=1;continue
        if line.startswith('```'):
            code=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):code.append(lines[i]);i+=1
            parts.append('<pre><code>'+html.escape('\n'.join(code))+'</code></pre>');i+=1;continue
        if line.startswith('#'):
            level=len(line)-len(line.lstrip('#'));title=line[level:].strip();heading+=1;anchor='sec-'+str(heading)
            if level==2:toc.append((anchor,title))
            parts.append(f'<h{level} id="{anchor}">{inline(title)}</h{level}>');i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                cells=[x.strip() for x in lines[i].strip('|').split('|')]
                if not all(re.fullmatch(r'[-: ]+',x) for x in cells):rows.append(cells)
                i+=1
            parts.append('<div class="table"><table>')
            for n,row in enumerate(rows):
                tag='th' if n==0 else 'td';parts.append('<tr>'+''.join('<'+tag+'>'+inline(c)+'</'+tag+'>' for c in row)+'</tr>')
            parts.append('</table></div>');continue
        if line.startswith('- ') or re.match(r'^\d+\. ',line):
            ordered=bool(re.match(r'^\d+\. ',line));tag='ol' if ordered else 'ul';parts.append('<'+tag+'>')
            while i<len(lines) and ((bool(re.match(r'^\d+\. ',lines[i])) if ordered else lines[i].startswith('- '))):
                parts.append('<li>'+inline(re.sub(r'^\d+\. |^- ','',lines[i]))+'</li>');i+=1
            parts.append('</'+tag+'>');continue
        paragraph=[line];i+=1
        while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','|','- ','```')) and not re.match(r'^\d+\. ',lines[i]):paragraph.append(lines[i]);i+=1
        parts.append('<p>'+inline(' '.join(paragraph))+'</p>')
    nav='<nav aria-label="Conteúdo"><h2>Ir direto ao que precisa</h2><ol>'+''.join('<li><a href="#'+a+'">'+inline(t)+'</a></li>' for a,t in toc)+'</ol></nav>'
    css='''body{font:16px/1.7 system-ui,sans-serif;color:#23324a;background:#f2f5f9;margin:0}main{max-width:1000px;margin:32px auto;background:white;padding:42px;border-radius:18px}h1{font-size:2.2rem;line-height:1.2;color:#152b49}h2{margin-top:2.4em;color:#17395f}h3{color:#304b69}a{color:#164f9b;overflow-wrap:anywhere}nav{padding:18px 28px;background:#edf4fc;border-radius:12px}nav h2{margin-top:0}pre{padding:18px;background:#16243a;color:#eef5ff;border-radius:9px;overflow:auto}code{font-family:ui-monospace,monospace}p code,li code,td code{background:#edf1f6;padding:2px 4px;border-radius:3px;overflow-wrap:anywhere}li{padding:4px 0}.table{overflow:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #c1ccda;padding:12px;text-align:left;vertical-align:top}th{background:#edf4fc}.stamp{color:#596d86;font-size:14px}@media(max-width:650px){main{margin:0;padding:20px;border-radius:0}h1{font-size:1.8rem}}@media print{body{background:white}main{margin:0;padding:0}pre{white-space:pre-wrap;background:#edf1f6;color:#111}a{color:#111}h2{break-after:avoid}tr{break-inside:avoid}}'''
    output=ROOT/'Guia-Host-e-GitHub-Pages-v2.4.0.html'
    output.write_text('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guia do host MIDI Share 2.4.0</title><style>'+css+'</style><main><p class="stamp">Guia de uso e implantação · versão 2.4.0 · 19 de novembro de 2026</p>'+nav+''.join(parts)+'</main></html>',encoding='utf-8')
    print(output)

if __name__=='__main__':build()
