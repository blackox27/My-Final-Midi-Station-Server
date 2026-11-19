from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=re.sub(r'<link\b[^>]*href="assets/css/app\.css"[^>]*>',lambda _: '<style>'+ (root/'assets/css/app.css').read_text()+'</style>',html)
for path in re.findall(r'<script defer src="([^"]+)"></script>',html):
    html=html.replace('<script defer src="'+path+'"></script>','<script>'+ (root/path).read_text().replace('</script','<\\/script')+'</script>')
(root.parent/'MIDI-Tab.html').write_text(html)
print(root.parent/'MIDI-Tab.html')
