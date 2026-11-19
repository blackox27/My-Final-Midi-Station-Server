const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../web/shared/network-api.js'),'utf8');
function client(fetch){
  const c=vm.createContext({location:{protocol:'https:'},MidiShareSession:{user:{id:'owner'},csrf:'csrf'},
    MidiShareLimits:{max_bytes:1024},fetch,AbortController,setTimeout,clearTimeout,URLSearchParams,SyntaxError,TypeError});
  vm.runInContext(script,c);return new c.MidiShareAPI();
}
test('invalid JSON after an upload is reported as retryable',async()=>{
  const api=client(async()=>({ok:true,status:200,json:async()=>JSON.parse('<html>Erro do proxy</html>')}));
  await assert.rejects(api.upload({file:{size:100,name:'musica.mid'},source:'Auralis',id:'request-123'}),
    e=>e.transient===true&&e.message==='Resposta inválida do servidor. Tente novamente.');
});
test('an upload above the configured limit is rejected before sending',async()=>{
  let sent=0;const api=client(async()=>{sent++});
  await assert.rejects(api.upload({file:{size:1025}}),/limite deste servidor/);
  assert.equal(sent,0);
});
