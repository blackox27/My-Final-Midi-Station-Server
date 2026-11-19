/* Múltiplos navegadores simulados com sessões diferentes e um servidor HTTP real. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.disabled=false;this._value='';this.open=false;this.classList={add(){},remove(){}};}
 get value(){return this._value||((this.tagName==='SELECT'&&this.children[0]?.value)||'');}set value(x){this._value=x;}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];this._value='';}
 setAttribute(){}addEventListener(n,fn){this['on'+n]=fn;}click(){if(!this.disabled)return this.onclick?.();}showModal(){this.open=true;}close(){this.open=false;}
}
async function until(fn){for(let n=0;n<300;n++){if(fn())return;await sleep(10);}throw Error('Condição de UI não foi atingida');}
function client(base,app,context,cookie){
 const body=new Element('body'),events={};
 const find=(node,id)=>node.id===id?node:node.children.map(n=>find(n,id)).find(Boolean);
 const document={body,hidden:false,readyState:'complete',documentElement:{lang:'pt-BR'},createElement:t=>new Element(t),getElementById:id=>find(body,id),addEventListener(n,fn){events[n]=fn;}};
 const deferred=new Map();let t=0;
 const c=vm.createContext({document,location:{origin:base,protocol:'http:',pathname:'/'+app+'/',search:''},File,Blob,URL,URLSearchParams,ArrayBuffer,Uint8Array,AbortController,TypeError,TextDecoder,console,Date,confirm:()=>true,crypto:require('node:crypto').webcrypto,
 setTimeout:(fn,ms)=>ms===3000||ms===10000?(deferred.set(++t,fn),t):setTimeout(fn,ms),clearTimeout:id=>{if(!deferred.delete(id))clearTimeout(id);},addEventListener(n,fn){events[n]=fn;},fetch:(p,o={})=>fetch(new URL(p,base),{...o,headers:{...o.headers,Cookie:cookie}})});
 c.window=c;c.MidiShareSession=context;c.get=id=>document.getElementById(id);c.events=events;
 for(const script of ['lan-compat.js','network-api.js','studio.js'])vm.runInContext(fs.readFileSync(path.join(root,'web/shared',script),'utf8'),c);
 return c;
}
test('estúdio entrega MIDI entre três ferramentas, recupera resposta perdida e isola a outra conta',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'midi24-studio-'));
 const child=spawn(process.env.PYTHON||'python',['iniciar.py','--host','127.0.0.1','--port','0','--data',temp],{cwd:root,stdio:['ignore','pipe','pipe']});
 const clients=[];
 try{
 const base=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('Host não iniciou')),8000);child.stdout.on('data',b=>{out+=b;const m=out.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});child.on('error',reject);});
 async function account(action,name){const r=await fetch(base+'/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-MIDI-Share':'1'},body:JSON.stringify({username:name,password:'studio-test-password'})});assert.ok(r.ok);return {ctx:await r.json(),cookie:r.headers.get('set-cookie').split(';')[0]};}
 const alice=await account('register','alice'),alice2=await account('login','alice'),bob=await account('register','bob');
 const a=client(base,'aurora',alice.ctx,alice.cookie),b=client(base,'midi-tab',alice2.ctx,alice2.cookie),c=client(base,'auralis',alice.ctx,alice.cookie),foreign=client(base,'aurora',bob.ctx,bob.cookie);clients.push(a,b,c,foreign);
 const bytes=fs.readFileSync(path.join(root,'exemplos/Estudo-em-Do.mid')),file=new File([bytes],'Estudo.mid',{type:'audio/midi'});
 let bImports=0,cImports=0,bFile,cFile;
 a.MidiShareAurora={exportFile:()=>file};b.MidiShareTab={openFile:async f=>{bImports++;bFile=f;},exportFile:()=>bFile};c.MidiShareAuralis={openFile:async f=>{cImports++;cFile=f;}};
 await until(()=>clients.every(x=>x.get('ms-studio-status').textContent.startsWith('Host conectado')));
 a.get('ms-studio-launch').click();await until(()=>a.get('ms-studio-source').children.length>0&&!a.get('ms-studio-send').disabled);
 a.MidiShareStudio.refresh();await until(()=>a.get('ms-studio-target').children.length===2);
 assert.equal(foreign.get('ms-studio-target').children.length,0);
 a.get('ms-studio-target').value=b.MidiShareStudio.clientId;
 await a.get('ms-studio-send').click();assert.match(a.get('ms-studio-status').textContent,/MIDI enviado/);
 b.MidiShareStudio.refresh();await until(()=>b.get('ms-studio-inbox').children[0]?.tagName==='ARTICLE');
 const realFetch=b.fetch;let loseAck=true;b.fetch=async(p,o)=>{const r=await realFetch(p,o);if(p==='/api/studio/ack'&&loseAck){loseAck=false;throw new TypeError('resposta perdida');}return r;};
 await b.get('ms-studio-inbox').children[0].children[1].click();assert.equal(bImports,1);
 assert.deepEqual(Buffer.from(await bFile.arrayBuffer()),bytes);assert.match(b.get('ms-studio-status').textContent,/indisponível/);
 await b.get('ms-studio-inbox').children[0].children[1].click();assert.equal(bImports,1);assert.equal(b.get('ms-studio-inbox').children[0].tagName,'P');
 // Tab reencaminha o mesmo arquivo ao Auralis usando a biblioteca.
 b.get('ms-studio-launch').click();await until(()=>b.get('ms-studio-source').children.length>1&&!b.get('ms-studio-send').disabled);
 b.get('ms-studio-target').value=c.MidiShareStudio.clientId;
 const original=b.fetch;let loseSend=true;b.fetch=async(p,o)=>{const r=await original(p,o);if(p==='/api/studio/send'&&loseSend){loseSend=false;throw new TypeError('resposta perdida');}return r;};
 await b.get('ms-studio-send').click();assert.match(b.get('ms-studio-status').textContent,/indisponível/);
 await b.get('ms-studio-send').click();assert.match(b.get('ms-studio-status').textContent,/MIDI enviado/);
 c.MidiShareStudio.refresh();await until(()=>c.get('ms-studio-inbox').children[0]?.tagName==='ARTICLE');
 await c.get('ms-studio-inbox').children[0].children[1].click();assert.equal(cImports,1);assert.deepEqual(Buffer.from(await cFile.arrayBuffer()),bytes);
 // Somente dois uploads e duas entregas, mesmo com respostas perdidas.
 const list=await (await fetch(base+'/api/midis',{headers:{Cookie:alice.cookie}})).json();assert.equal(list.items.length,2);
 const outsider=await (await fetch(base+'/api/midis',{headers:{Cookie:bob.cookie}})).json();assert.equal(outsider.items.length,0);
 const peers=await (await fetch(base+'/api/studio?client_id='+a.MidiShareStudio.clientId,{headers:{Cookie:alice.cookie}})).json();assert.equal(peers.clients.length,3);
 a.events.pagehide();a.document.hidden=true;a.events.visibilitychange();
 }finally{
 for(const c of clients)c.MidiShareStudio.stop();
 child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));fs.rmSync(temp,{recursive:true,force:true});
 }
});
