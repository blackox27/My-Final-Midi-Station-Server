/* Troca direta por referências da biblioteca. Cada aba pertence a uma sessão do host. */
(()=>{
'use strict';
function boot(){
  if(!globalThis.MidiShareSession?.user?.id)return;
  const api=new MidiShareAPI(),app=location.pathname.startsWith('/aurora/')?'aurora':location.pathname.startsWith('/auralis/')?'auralis':location.pathname.startsWith('/midi-tab/')?'midi-tab':'portal';
  const names={aurora:'Aurora',auralis:'Auralis','midi-tab':'MIDI Tab',portal:'Biblioteca'};
  const tr=(a,b)=>document.documentElement.lang.startsWith('en')?b:a;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const id=()=>globalThis.MidiShareUUID().replaceAll('-','');
  const client=id(),launch=el('button','Estúdio conectado'),dialog=el('dialog'),title=el('h2',tr('Estúdio conectado','Connected studio'));
  launch.id='ms-studio-launch';launch.type='button';dialog.id='ms-studio';dialog.setAttribute('aria-labelledby','ms-studio-title');title.id='ms-studio-title';
  const close=el('button',tr('Fechar','Close'));close.type='button';close.onclick=()=>dialog.close();
  const status=el('p',tr('Conectando ao host…','Connecting to host…'));status.id='ms-studio-status';status.setAttribute('role','status');
  const who=el('label',tr('Nome desta aba','Name of this tab')),label=el('input');label.maxLength=64;label.value=names[app]+' · '+client.slice(-4);who.append(label);
  const desc=el('p',tr('Envie um MIDI para outra ferramenta aberta na mesma conta, neste ou em outro computador. O destino confirma antes de abrir.','Send MIDI to another tool signed into the same account, on this or another computer. The recipient confirms before opening.'));
  const links=el('nav');for(const name of ['auralis','aurora','midi-tab']){const a=el('a',tr('Abrir ','Open ')+names[name]);a.href='/'+name+'/';a.target='_blank';a.rel='noopener';links.append(a);}
  const fromLabel=el('label',tr('MIDI para enviar','MIDI to send')),from=el('select');from.id='ms-studio-source';fromLabel.append(from);
  const toLabel=el('label',tr('Aplicativo conectado de destino','Connected destination app')),to=el('select');to.id='ms-studio-target';toLabel.append(to);
  const send=el('button',tr('Enviar para o aplicativo','Send to app')),refresh=el('button',tr('Atualizar biblioteca','Refresh library'));send.type=refresh.type='button';send.id='ms-studio-send';
  const inboxTitle=el('h3',tr('MIDIs recebidos','Received MIDIs')),inbox=el('div');inbox.id='ms-studio-inbox';
  const hint=el('p',tr('Só os MIDIs passam pela API. Áudio, SoundFonts e projetos completos permanecem em cada ferramenta. O MIDI Tab reencaminha o MIDI original; o Auralis importa notas para um novo projeto.','Only MIDI is transferred through the API. Audio, SoundFonts and full projects stay in each tool. MIDI Tab forwards the original MIDI; Auralis imports notes into a new project.'));
  dialog.append(close,title,desc,who,status,links,fromLabel,toLabel,send,refresh,inboxTitle,inbox,hint);document.body.append(launch,dialog);
  let timer=null,controller=null,epoch=0,lastBeat=0,ready=false,peers=[],offers=[],busy=false,pending=null,keepStatus=0;
  const finished=new Map(),resolved=new Set();
  function settled(id){resolved.add(id);if(resolved.size>512)resolved.delete(resolved.values().next().value);}
  const bridge=()=>app==='auralis'?globalThis.MidiShareAuralis:app==='aurora'?globalThis.MidiShareAurora:globalThis.MidiShareTab;
  const post=async(action,data,signal)=>(await api.request('/api/studio/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-MIDI-Share':'1'},body:JSON.stringify(data),signal})).data;
  async function library(){const old=from.value;from.replaceChildren();if(app!=='portal'){const o=el('option',tr('Música atual deste aplicativo','Current song in this app'));o.value='current';from.append(o);}const result=await api.list();for(const item of result.items.slice(0,2000)){const o=el('option',item.name);o.value=item.id;from.append(o);}if([...from.children].some(o=>o.value===old))from.value=old;}
  function update(){
    const old=to.value;to.replaceChildren();for(const peer of peers){if(peer.id===client||peer.app==='portal')continue;const o=el('option',names[peer.app]+' — '+peer.label);o.value=peer.id;to.append(o);}if([...to.children].some(o=>o.value===old))to.value=old;
    send.disabled=busy||!ready||!to.value||!from.value;refresh.disabled=busy;from.disabled=to.disabled=busy;
    launch.textContent=offers.length?tr('Estúdio · '+offers.length+' recebido(s)','Studio · '+offers.length+' received'):tr('Estúdio conectado','Connected studio');
    launch.dataset.incoming=String(offers.length>0);inbox.replaceChildren();
    if(!offers.length)inbox.append(el('p',tr('Nenhum MIDI aguardando.','No MIDI waiting.')));
    for(const offer of offers){const row=el('article'),text=el('p',tr('MIDI de ','MIDI from ')+(offer.source_label||names[offer.source_app]));row.dataset.id=offer.id;
      const receive=el('button',finished.has(offer.id)?tr('Confirmar recebimento','Confirm receipt'):tr('Receber e abrir','Receive and open')),dismiss=el('button',tr('Dispensar','Dismiss'));
      receive.type=dismiss.type='button';receive.disabled=dismiss.disabled=busy;dismiss.disabled=busy||finished.has(offer.id);
      receive.onclick=()=>operate(async()=>{
        if(app==='portal')throw Error(tr('Abra uma ferramenta para receber.','Open a tool to receive.'));
        if(!finished.has(offer.id)){
          const item=await api.item(offer.midi_id);
          if(!confirm(tr('Receber “'+item.name+'”? Salve seu trabalho atual antes de abrir. No Auralis será criado um novo projeto.','Receive “'+item.name+'”? Save your work before opening. Auralis creates a new project.')))return;
          const file=await api.file(item);if(!bridge()?.openFile)throw Error(tr('Aguarde o aplicativo carregar.','Wait for the app to load.'));
          await bridge().openFile(file);finished.set(offer.id,'accepted');
        }
        await post('ack',{client_id:client,delivery_id:offer.id,state:finished.get(offer.id)});
        settled(offer.id);offers=offers.filter(x=>x.id!==offer.id);finished.delete(offer.id);status.textContent=tr('MIDI recebido e aberto.','MIDI received and opened.');
      });
      dismiss.onclick=()=>operate(async()=>{await post('ack',{client_id:client,delivery_id:offer.id,state:'dismissed'});settled(offer.id);offers=offers.filter(x=>x.id!==offer.id);});
      row.append(text,receive,dismiss);inbox.append(row);
    }
  }
  async function operate(fn){if(busy)return;busy=true;update();try{await fn();}catch(e){status.textContent=e.message;}finally{busy=false;keepStatus=Date.now()+10000;update();}}
  send.onclick=()=>operate(async()=>{
    const key=from.value+':'+to.value;
    if(!pending||pending.key!==key)pending={key,request_id:id(),target:to.value,source:from.value,upload_id:id()};
    const outgoing=pending;
    if(!ready)throw Error(tr('Aguarde a conexão.','Wait for connection.'));
    if(!outgoing.midi_id){
      if(outgoing.source==='current'){
        if(!bridge()?.exportFile)throw Error(tr('Aguarde o aplicativo carregar.','Wait for the app to load.'));
        outgoing.file=outgoing.file||await bridge().exportFile();
        const uploaded=await api.upload({file:outgoing.file,source:names[app],id:outgoing.upload_id});outgoing.midi_id=uploaded.item.id;
      }else outgoing.midi_id=outgoing.source;
    }
    const sent=await post('send',{client_id:client,target:outgoing.target,midi_id:outgoing.midi_id,request_id:outgoing.request_id});
    status.textContent=tr('MIDI enviado. Aguarde a confirmação na ferramenta de destino.','MIDI sent. Confirm it in the receiving tool.')+' ('+sent.state+')';pending=null;
  });
  from.onchange=to.onchange=()=>{pending=null;};label.onchange=()=>{lastBeat=0;};
  refresh.onclick=()=>operate(library);
  launch.onclick=()=>{dialog.showModal();operate(library);};
  function stop(){epoch++;if(timer!==null)clearTimeout(timer);timer=null;controller?.abort();controller=null;}
  async function tick(generation){
    if(generation!==epoch||document.hidden)return;
    controller=new AbortController();const signal=controller.signal;
    let delay=3000;
    try{
      if(!ready||Date.now()-lastBeat>20000){await post('heartbeat',{client_id:client,app,label:label.value.trim()||names[app]},signal);if(generation!==epoch)return;lastBeat=Date.now();ready=true;}
      const data=(await api.request('/api/studio?'+new URLSearchParams({client_id:client}),{signal})).data;
      if(generation!==epoch)return;peers=data.clients;offers=data.incoming.filter(x=>!resolved.has(x.id));
      for(const key of finished.keys())if(!offers.some(x=>x.id===key))finished.delete(key);
      if(!busy&&Date.now()>=keepStatus)status.textContent=tr('Host conectado · ','Host connected · ')+peers.filter(p=>p.id!==client&&p.app!=='portal').length+tr(' ferramenta(s) disponível(is).',' tool(s) available.');
      update();
    }catch(e){if(generation!==epoch)return;ready=false;status.textContent=e.message;delay=10000;update();}
    finally{if(generation===epoch&&!document.hidden)timer=setTimeout(()=>tick(generation),delay);}
  }
  function resume(){stop();if(!document.hidden)tick(epoch);}
  document.addEventListener('visibilitychange',resume);addEventListener('pagehide',stop);addEventListener('pageshow',resume);
  // A conta é fixa para a vida da página; o guardião interrompe páginas de outra conta.
  globalThis.MidiShareStudio={clientId:client,stop,refresh:resume};resume();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
