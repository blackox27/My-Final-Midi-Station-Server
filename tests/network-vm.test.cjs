/* DOM simulado + HTTP real. Não substitui inspeção em navegador. Node 20+. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');let sessionContext,sessionCookie;
class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.disabled=false;this.value='';this.attributes={};this.open=false;this.classList={add(){},remove(){}};}
 append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=[...nodes];} setAttribute(k,v){this.attributes[k]=v;}
 querySelectorAll(){let found=[];for(const n of this.children){if(n.tagName==='BUTTON')found.push(n);found.push(...n.querySelectorAll());}return found;}
 click(){if(!this.disabled)return this.onclick?.();} showModal(){this.open=true;} close(){this.open=false;} addEventListener(name,handler){this['on'+name]=handler;}
}
function env(base,pathname){
 const body=new Element('body'),language=new Element('select');language.id='language';language.value='pt-BR';body.append(language);
 const find=(node,id)=>node.id===id?node:node.children.map(n=>find(n,id)).find(Boolean);
 const document={documentElement:{lang:'pt-BR'},addEventListener(){},body,readyState:'complete',getElementById:id=>find(body,id),createElement:t=>new Element(t)};
 const events={};
 const c=vm.createContext({document,location:{origin:base,protocol:'http:',pathname,search:''},history:{replaceState(){}},URL,confirm:()=>true,addEventListener(name,handler){events[name]=handler;},structuredClone,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,TypeError,File,Blob,URLSearchParams,AbortController,setTimeout,clearTimeout,console,crypto:require('node:crypto').webcrypto,fetch:(p,o={})=>fetch(new URL(p,base),{...o,headers:{...o.headers,Cookie:sessionCookie}})});
 c.MidiShareSession=sessionContext;c.events=events;c.window=c;c.get=id=>document.getElementById(id);return c;
}
const network=fs.readFileSync(path.join(root,'web/shared/network.js'),'utf8'),apiScript=fs.readFileSync(path.join(root,'web/shared/network-api.js'),'utf8'),lanScript=fs.readFileSync(path.join(root,'web/shared/lan-compat.js'),'utf8'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function idle(c){for(let i=0;i<200;i++){if(!c.get('ms-refresh').disabled)return;await sleep(10);}throw Error('UI did not finish');}
test('Aurora serialization → HTTP → MIDI Tab parser and network controls',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'midi-network-'));
 const child=spawn(process.env.PYTHON||'python',['iniciar.py','--host','127.0.0.1','--port','0','--data',temp],{cwd:root,stdio:['ignore','pipe','pipe']});
 try{
  const base=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('Server startup timeout')),5000);child.stdout.on('data',b=>{out+=b;const m=out.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});child.on('error',e=>{clearTimeout(timer);reject(e);});});
  const registration=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-MIDI-Share':'1'},body:JSON.stringify({username:'vmtester',password:'vm-test-password'})});
  assert.equal(registration.status,201);sessionContext=await registration.json();sessionCookie=registration.headers.get('set-cookie').split(';')[0];
  const httpFetch=(url,options={})=>fetch(url,{...options,headers:{...options.headers,Cookie:sessionCookie}});
  const aurora=env(base,'/aurora/');
  aurora.crypto={getRandomValues:values=>require('node:crypto').webcrypto.getRandomValues(values)};
  vm.runInContext(fs.readFileSync(path.join(root,'web/shared/lan-compat.js'),'utf8'),aurora);
  assert.match(aurora.MidiShareUUID(),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  
  for(const file of ['core/model.js','core/midi.js'])vm.runInContext(fs.readFileSync(path.join(root,'aurora-codigo-original/src',file),'utf8').replace('globalThis.crypto.randomUUID()', 'globalThis.MidiShareUUID()'),aurora);
  const sample=fs.readFileSync(path.join(root,'exemplos/Estudo-em-Do.mid'));aurora.input=sample.buffer.slice(sample.byteOffset,sample.byteOffset+sample.byteLength);
  vm.runInContext('var project=Midi.read(input);var restoring=false;var filename=()=>"Teste de rede";',aurora);
  const html=fs.readFileSync(path.join(root,'web/aurora/index.html'),'utf8');
  vm.runInContext(html.slice(html.lastIndexOf('// Adaptador de rede:'),html.indexOf('</script>',html.lastIndexOf('// Adaptador de rede:'))),aurora);
  const expected=Buffer.from(await aurora.MidiShareAurora.exportFile().arrayBuffer());assert.equal(expected.subarray(0,4).toString(),'MThd');
  vm.runInContext(apiScript,aurora);vm.runInContext(network,aurora);aurora.get('ms-launch').click();await idle(aurora);assert.match(aurora.get('ms-status').textContent,/Nenhuma música/);
  await aurora.get('ms-send').click();assert.match(aurora.get('ms-status').textContent,/Enviado\(s\):/);
  const {items}=await (await httpFetch(base+'/api/midis')).json();assert.equal(items.length,1);
  const downloaded=Buffer.from(await (await httpFetch(base+'/api/midis/'+items[0].id)).arrayBuffer());assert.deepEqual(downloaded,expected);
  const tab=env(base,'/midi-tab/');let received;tab.MidiShareTab={openFile:async f=>{received=f;}};
  vm.runInContext(lanScript,tab);vm.runInContext(apiScript,tab);vm.runInContext(network,tab);tab.get('ms-launch').click();await idle(tab);assert.equal(tab.get('ms-list').children.length,1);
  await tab.get('ms-list').children[0].children[2].children[0].click();assert.equal(received.name,'Teste de rede.mid');assert.equal(tab.get('ms-dialog').open,false);assert.deepEqual(Buffer.from(await received.arrayBuffer()),expected);
  vm.runInContext(fs.readFileSync(path.join(root,'web/midi-tab/assets/js/core/midi.js'),'utf8'),tab);tab.receivedBuffer=await received.arrayBuffer();
  const parsed=vm.runInContext('parseMidi(receivedBuffer)',tab);assert.equal(parsed.tracks.reduce((sum,t)=>sum+t.notes.length,0),8);
  tab.MidiShareTab.openFile=async()=>{throw Error('Conversão indisponível no teste');};tab.get('ms-launch').click();await idle(tab);
  await tab.get('ms-list').children[0].children[2].children[0].click();assert.equal(tab.get('ms-dialog').open,true);assert.equal(tab.get('ms-status').dataset.error,'true');assert.match(tab.get('ms-status').textContent,/Conversão indisponível/);
  tab.get('language').value='en';tab.get('language').onchange();assert.equal(tab.get('ms-refresh').textContent,'Refresh list');
  const goodFetch=tab.fetch;tab.fetch=async()=>{throw new TypeError('fetch failed');};await tab.get('ms-refresh').click();assert.match(tab.get('ms-status').textContent,/Server unavailable/);
  tab.fetch=goodFetch;await tab.get('ms-refresh').click();assert.equal(tab.get('ms-status').dataset.error,'false');assert.equal(network.includes('.innerHTML'),false);

  // A resposta do POST se perde depois do commit: repetir deve confirmar o mesmo ID.
  const realAuroraFetch=aurora.fetch;
  aurora.fetch=async(p,o)=>{const r=await realAuroraFetch(p,o);if(o?.method==='POST')throw new TypeError('response lost');return r;};
  await aurora.get('ms-send').click();
  assert.equal(aurora.get('ms-retry').hidden,false);
  assert.equal((await (await httpFetch(base+'/api/midis')).json()).items.length,2);
  aurora.fetch=realAuroraFetch;await aurora.get('ms-retry').click();
  assert.equal(aurora.get('ms-retry').hidden,true);
  assert.equal((await (await httpFetch(base+'/api/midis')).json()).items.length,2);
  // Busca sem acentos, ordenação e consulta 304 sem reconstruir a lista.
  await tab.get('ms-refresh').click();
  tab.get('ms-search').value='inexistente';tab.get('ms-search').oninput();
  assert.match(tab.get('ms-list').children[0].textContent,/No songs match/);
  tab.get('ms-search').value='REDE';tab.get('ms-search').oninput();assert.equal(tab.get('ms-list').children.length,2);
  tab.get('ms-sort').value='name';tab.get('ms-sort').onchange();
  const firstRow=tab.get('ms-list').children[0];await tab.get('ms-refresh').click();assert.equal(tab.get('ms-list').children[0],firstRow);
  // Múltiplos arquivos: o válido termina mesmo se outro for recusado.
  const second=new File([sample],'Segundo.mid',{type:'audio/midi'}),invalid=new File(['oops'],'invalido.mid');
  aurora.get('ms-file').files=[invalid,second];aurora.get('ms-file').onchange();await idle(aurora);
  assert.equal(aurora.get('ms-errors').children.length,1);
  assert.equal((await (await httpFetch(base+'/api/midis')).json()).items.length,3);
  // Aurora também recebe arquivos de rede; o adaptador substitui seu projeto somente após confirmação.
  let auroraReceived;aurora.MidiShareAurora.openFile=async f=>{auroraReceived=f;};
  aurora.get('ms-launch').click();await idle(aurora);
  await aurora.get('ms-list').children[0].children[2].children[0].click();assert.equal(auroraReceived.name,'Segundo.mid');
  // O agendamento automático é cancelado ao fechar o painel.
  const timers=new Map();let timerId=0;tab.setTimeout=(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;};tab.clearTimeout=id=>timers.delete(id);
  tab.get('ms-auto').checked=true;tab.get('ms-auto').onchange();assert.ok([...timers.values()].some(t=>t.ms===5000));
  tab.events.pagehide();assert.equal(timers.size,0);
  tab.events.pageshow();assert.ok([...timers.values()].some(t=>t.ms===5000));
  tab.get('ms-close').click();assert.equal(timers.size,0);
  // A exclusão usa autenticação real e limpa a lista e o cache do cliente.
  tab.get('ms-search').value='';tab.get('ms-search').oninput();
  tab.get('ms-auto').checked=false;tab.get('ms-auto').onchange();
  await tab.get('ms-launch').click();await idle(tab);
  const beforeDelete=(await (await httpFetch(base+'/api/midis')).json()).items;
  const row=tab.get('ms-list').children.find(r=>r.dataset.id===beforeDelete[0].id);
  const remove=row.children[2].children.find(n=>n.className==='ms-delete');
  assert.ok(remove);await remove.click();await idle(tab);
  assert.equal((await httpFetch(base+'/api/midis/'+beforeDelete[0].id)).status,404);
  assert.equal((await (await httpFetch(base+'/api/midis')).json()).items.length,beforeDelete.length-1);

  // Running status depois de um metaevento, interoperável com o parser do Aurora/Mido.
  const ev=Buffer.from([0,0x90,60,100,0,0xff,1,1,88,1,62,100,1,0x80,60,0,0,62,0,0,0xff,0x2f,0]);
  const h=Buffer.from('4d546864000000060000000101e04d54726b00000000','hex');h.writeUInt32BE(ev.length,18);
  const fixture=Buffer.concat([h,ev]);tab.runningFixture=fixture.buffer.slice(fixture.byteOffset,fixture.byteOffset+fixture.byteLength);
  assert.equal(vm.runInContext('parseMidi(runningFixture).tracks[0].notes.length',tab),2);

  const {writeMidi}=await import(require('node:url').pathToFileURL(path.join(root,'web/auralis/source/src/midi.js')).href);
  const auralis=env(base,'/auralis/');
  const transcription={name:'Audio transcrito.wav',bpm:120,notes:[{pitch:64,start:0,duration:.5,velocity:90,track:0},{pitch:67,start:.5,duration:.5,velocity:80,track:0}],programs:[24],trackNames:['Guitar']};
  auralis.st={busy:false,importing:false};auralis.$e=()=>transcription;auralis.S6=writeMidi;auralis.Jg=name=>name.replace(/\.[^.]+$/,'');auralis.X=()=>({checked:false});
  const bundle=fs.readFileSync(path.join(root,'web/auralis/assets/app.js'),'utf8');
  vm.runInContext(bundle.slice(bundle.lastIndexOf('// MIDI_SHARE_AURALIS_BRIDGE'),bundle.lastIndexOf('})();')),auralis);
  const fromAudio=auralis.MidiShareAuralis.exportFile();assert.equal(fromAudio.name,'Audio transcrito.mid');
  vm.runInContext(lanScript,auralis);vm.runInContext(apiScript,auralis);vm.runInContext(network,auralis);
  auralis.get('ms-launch').click();await idle(auralis);await auralis.get('ms-send').click();
  const listing=(await (await httpFetch(base+'/api/midis')).json()).items;
  const generated=listing.find(item=>item.source==='Auralis');assert.ok(generated);assert.equal(generated.notes,2);
  const generatedRow=auralis.get('ms-list').children.find(row=>row.dataset.id===generated.id);
  const otherTools=generatedRow.children[2].children.filter(n=>n.href?.startsWith('/aurora/')||n.href?.startsWith('/midi-tab/'));
  assert.equal(otherTools.length,2);for(const link of otherTools)assert.equal(link.target,'_blank');
  const midiBytes=await (await httpFetch(base+'/api/midis/'+generated.id)).arrayBuffer();
  assert.deepEqual(Buffer.from(midiBytes),Buffer.from(await fromAudio.arrayBuffer()));
  tab.audioMidi=midiBytes;assert.equal(vm.runInContext('parseMidi(audioMidi).tracks.reduce((s,t)=>s+t.notes.length,0)',tab),2);
  aurora.audioMidi=midiBytes;assert.equal(vm.runInContext('Midi.read(audioMidi).tracks.reduce((s,t)=>s+t.notes.length,0)',aurora),2);
  auralis.st.busy=true;assert.throws(()=>auralis.MidiShareAuralis.exportFile(),/análise/);
  auralis.st.busy=false;transcription.notes=[];assert.throws(()=>auralis.MidiShareAuralis.exportFile(),/notas/);
  console.log('Auralis → servidor privado → parsers Aurora/MIDI Tab; fila, recuperação e cache: OK');


 }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));fs.rmSync(temp,{recursive:true,force:true});}
});
