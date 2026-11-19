const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../web/shared/auth-guard.js'),'utf8');
function environment(reply){
  const events={},domEvents={},timers=new Map(),channels=[],redirects=[],requests=[];let sequence=0;
  const doc={title:'Editor',hidden:false,documentElement:{dataset:{},style:{}},body:{children:[],append(n){this.children.push(n)}},
    addEventListener:(n,f)=>domEvents[n]=f,createElement:tag=>({tagName:tag.toUpperCase(),children:[],append(...n){this.children.push(...n)}})};
  class Channel {constructor(){channels.push(this)}postMessage(value){this.last=value}}
  const context=vm.createContext({document:doc,MidiShareSession:{user:{id:'a'.repeat(32),username:'alice'},csrf:'csrf-test'},
    location:{replace:url=>redirects.push(url)},confirm:()=>true,AbortController,BroadcastChannel:Channel,
    setTimeout:(fn,ms)=>{timers.set(++sequence,{fn,ms});return sequence},clearTimeout:id=>timers.delete(id),
    addEventListener:(n,f)=>events[n]=f,fetch:async(url,options)=>{requests.push({url,options});return reply(url,options)}});
  context.window=context;vm.runInContext(script,context);
  return {context,doc,events,domEvents,timers,channels,redirects,requests};
}
const valid=()=>({ok:true,status:200,json:async()=>({user:{id:'a'.repeat(32)},csrf:'csrf-test'})});

test('guard checks pinned account and stops polling on pagehide',async()=>{
  const e=environment(valid);assert.equal(await e.context.MidiShareAuth.check(),true);
  assert.equal(e.doc.documentElement.dataset.auth,'ready');assert.equal(e.requests[0].options.headers['X-MIDI-User'],'a'.repeat(32));
  assert.equal([...e.timers.values()].filter(t=>t.ms===15000).length,1);
  e.events.pagehide();assert.equal(e.timers.size,0);assert.equal(e.doc.documentElement.dataset.auth,'checking');
});

test('changed account or session hides old page and returns to login',async()=>{
  for(const data of [{user:{id:'b'.repeat(32)},csrf:'csrf-test'},{user:{id:'a'.repeat(32)},csrf:'new-session'}]){
    const e=environment(()=>({ok:true,status:200,json:async()=>data}));assert.equal(await e.context.MidiShareAuth.check(),false);
    assert.equal(e.doc.documentElement.style.visibility,'hidden');assert.equal(e.redirects[0],'/login.html?reason=session');
    assert.equal(e.timers.size,0);
  }
});

test('network failure blocks display and schedules bounded retry',async()=>{
  const e=environment(()=>{throw new TypeError('network')});assert.equal(await e.context.MidiShareAuth.check(),false);
  assert.equal(e.doc.documentElement.dataset.auth,'checking');assert.equal(e.redirects.length,0);
  assert.equal([...e.timers.values()].filter(t=>t.ms===15000).length,1);
});

test('logout broadcasts are scoped to the account',()=>{
  const e=environment(valid);e.channels[0].onmessage({data:{type:'logout',user:'b'.repeat(32)}});assert.equal(e.redirects.length,0);
  e.channels[0].onmessage({data:{type:'logout',user:'a'.repeat(32)}});assert.equal(e.redirects.length,1);
});

test('logout sends pinned identity and CSRF before navigation',async()=>{
  const e=environment(valid);e.domEvents.DOMContentLoaded();
  const logout=e.doc.body.children[0].children[2];await logout.onclick();
  const request=e.requests.find(r=>r.url==='/api/auth/logout');assert.ok(request);
  assert.equal(request.options.headers['X-CSRF-Token'],'csrf-test');assert.equal(request.options.headers['X-MIDI-User'],'a'.repeat(32));
  assert.equal(e.channels[0].last.user,'a'.repeat(32));assert.equal(e.redirects.length,1);
});

test('resume uses one fresh check and ignores replies from before navigation',async()=>{
  const resolveChecks=[];
  const e=environment(()=>new Promise(resolve=>resolveChecks.push(resolve)));
  const first=e.context.MidiShareAuth.check();
  assert.equal(e.context.MidiShareAuth.check(),first);
  assert.equal(e.requests.length,1);
  e.events.pagehide();
  assert.equal(e.requests[0].options.signal.aborted,true);
  assert.equal(e.timers.size,0);
  e.events.pageshow();e.events.focus();
  const resumed=e.context.MidiShareAuth.check();
  assert.equal(e.requests.length,2);
  resolveChecks[0]({ok:false,status:401});
  assert.equal(await first,false);
  assert.deepEqual(e.redirects,[]);
  assert.equal(e.doc.documentElement.dataset.auth,'checking');
  resolveChecks[1](valid());
  assert.equal(await resumed,true);
  assert.equal(e.doc.documentElement.dataset.auth,'ready');
  assert.equal([...e.timers.values()].filter(t=>t.ms===15000).length,1);
});
