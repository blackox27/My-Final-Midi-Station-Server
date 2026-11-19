const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function interop(){let c=vm.createContext({TextDecoder});vm.runInContext(fs.readFileSync(path.join(root,'web/shared/midi-interop.js'),'utf8'),c);return c.MidiShareInterop;}
function sample(){return Uint8Array.from(fs.readFileSync(path.join(root,'exemplos/Estudo-em-Do.mid'))).buffer;}
test('Auralis reader receives Aurora/Tab MIDI with timing, programs and pitches',()=>{
 const d=interop().toAuralis(sample());assert.equal(d.notes.length,8);assert.equal(d.programs[0],24);assert.equal(d.notes[0].pitch,64);assert.equal(d.notes[0].duration,.4375);assert.equal(d.notes[1].start,.5);assert.equal(d.bpm,120);
});
test('tempo changes retain absolute note timing when imported into Auralis',()=>{
 const events=Buffer.from([0,0xff,0x51,3,7,0xa1,0x20,0,0x90,60,100,0x83,0x60,0x80,60,0,0,0xff,0x51,3,0x0f,0x42,0x40,0,0x90,64,100,0x83,0x60,0x80,64,0,0,0xff,0x2f,0]);
 const header=Buffer.from('4d546864000000060000000101e04d54726b00000000','hex');header.writeUInt32BE(events.length,18);const raw=Buffer.concat([header,events]);
 const d=interop().toAuralis(Uint8Array.from(raw).buffer);assert.equal(d.notes.length,2);assert.equal(d.notes[0].duration,.5);assert.equal(d.notes[1].start,.5);assert.equal(d.notes[1].duration,1);
});
test('Auralis bridge opens received MIDI as a new editable job and always unlocks failed imports',async()=>{
 const text=fs.readFileSync(path.join(root,'web/auralis/source/src/app.js'),'utf8');const seam=text.slice(text.indexOf('globalThis.MidiShareAuralis = {'));
 const jobs=[];let selected,rendered=0;
 const c=vm.createContext({state:{busy:false,importing:false},current:()=>jobs.at(-1),newJob:({name})=>{const j={id:'new',name};jobs.push(j);return j;},selectJob:id=>selected=id,renderAll:()=>rendered++,structuredClone,File,Error,MidiShareInterop:interop()});
 vm.runInContext(seam,c);await c.MidiShareAuralis.openFile(new File([sample()],'entrada.mid'));
 assert.equal(jobs.length,1);assert.equal(jobs[0].notes.length,8);assert.equal(jobs[0].baseNotes.length,8);assert.equal(jobs[0].state,'done');assert.equal(selected,'new');assert.equal(rendered,1);assert.equal(c.state.importing,false);
 await assert.rejects(c.MidiShareAuralis.openFile(new File(['oops'],'bad.mid')));assert.equal(jobs.length,1);assert.equal(c.state.importing,false);
 c.state.busy=true;await assert.rejects(c.MidiShareAuralis.openFile(new File([sample()],'x.mid')),/análise/);
});
test('MIDI Tab forwards exactly the original MIDI bytes',async()=>{
 const f=new File([sample()],'orig.mid'),c=vm.createContext({File,sourceMidiFile:f,load:async(file)=>file});c.window=c;vm.runInContext(fs.readFileSync(path.join(root,'web/shared/tab-bridge.js'),'utf8'),c);
 const result=c.MidiShareTab.exportFile();assert.equal(result.name,f.name);assert.deepEqual(Buffer.from(await result.arrayBuffer()),Buffer.from(await f.arrayBuffer()));c.sourceMidiFile=null;assert.throws(()=>c.MidiShareTab.exportFile(),/Abra um arquivo/);
});
test('Pages host connector rejects credentials, script URLs and remote HTTP',()=>{
 const c=vm.createContext({URL});vm.runInContext(fs.readFileSync(path.join(root,'ferramentas/pages/host-connect.js'),'utf8'),c);
 const fn=c.MidiShareHostOrigin;assert.equal(fn('https://my-host.trycloudflare.com/'),'https://my-host.trycloudflare.com');assert.equal(fn('http://localhost:8000'),'http://localhost:8000');assert.equal(fn('http://127.0.0.1:8000'),'http://127.0.0.1:8000');
 for(const x of ['javascript:alert(1)','http://evil.example','https://a:b@x.example','https://x.example/path','https://x.example/?token=secret','https://x.example/#x','https://blackox27.github.io/'])assert.throws(()=>fn(x),x);
});
test('Pages connector never collects a password, email or username and never fetches private API',()=>{
 const page=fs.readFileSync(path.join(root,'ferramentas/pages/conta.html'),'utf8'),script=fs.readFileSync(path.join(root,'ferramentas/pages/host-connect.js'),'utf8');assert.doesNotMatch(page,/<input[^>]+(?:password|email|username)/i);assert.doesNotMatch(script,/fetch\(/);assert.match(page,/host-address/);
});
test('compiled Auralis bridge also imports using the unchanged musical core',async()=>{
 const bundle=fs.readFileSync(path.join(root,'web/auralis/assets/app.js'),'utf8');const seam=bundle.slice(bundle.lastIndexOf('// MIDI_SHARE_AURALIS_BRIDGE'),bundle.lastIndexOf('})();'));
 let added,selected,rendered=0;const c=vm.createContext({st:{busy:false,importing:false},_C:({name})=>added={id:'job',name},ah:id=>selected=id,Us:()=>rendered++,structuredClone,File,MidiShareInterop:interop()});
 vm.runInContext(seam,c);await c.MidiShareAuralis.openFile(new File([sample()],'roundtrip.mid'));assert.equal(added.notes.length,8);assert.equal(added.state,'done');assert.equal(selected,'job');assert.equal(rendered,1);assert.equal(c.st.importing,false);
});
test('network file importer rejects a modified download before the app sees it',async()=>{
 const c=vm.createContext({location:{protocol:'https:'},MidiShareSession:{user:{id:'owner'},csrf:'csrf'},File,Blob,crypto:require('node:crypto').webcrypto,AbortController,setTimeout,clearTimeout,URLSearchParams,SyntaxError,TypeError});
 vm.runInContext(fs.readFileSync(path.join(root,'web/shared/network-api.js'),'utf8'),c);const api=new c.MidiShareAPI();api.download=async()=>sample();
 await assert.rejects(api.file({size:sample().byteLength,sha256:'0'.repeat(64),name:'x.mid'}),/integridade/);
 await assert.rejects(api.file({size:1,sha256:'0'.repeat(64),name:'x.mid'}),/tamanho/);
});
