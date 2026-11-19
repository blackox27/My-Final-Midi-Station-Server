/* UI de rede: fila sequencial, consultas condicionais e atualização opcional. */
(() => {
  'use strict';
  const aurora=location.pathname.startsWith('/aurora/'),tab=location.pathname.startsWith('/midi-tab/'),auralis=location.pathname.startsWith('/auralis/');
  const tr=(pt,en)=>(document.documentElement.lang==='en'||document.getElementById('language')?.value==='en')?en:pt;
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const normalized=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function boot(){
    const api=new MidiShareAPI();
    const maxMiB=api.maxBytes/(1024*1024);
    const launch=make('button');launch.id='ms-launch';launch.type='button';
    const dialog=make('dialog');dialog.id='ms-dialog';dialog.setAttribute('aria-labelledby','ms-title');
    const close=make('button',null,'ms-close');close.id='ms-close';
    const title=make('h2');title.id='ms-title';
    const address=make('p',location.origin,'ms-muted');address.id='ms-address';
    const description=make('p');
    const controls=make('div',null,'ms-row');
    const send=make('button',null,'ms-primary');send.id='ms-send';
    const upload=make('button');upload.id='ms-upload';
    const input=make('input');input.id='ms-file';input.type='file';input.accept='.mid,.midi,audio/midi';input.multiple=true;input.hidden=true;
    const refresh=make('button');refresh.id='ms-refresh';
    const retry=make('button');retry.id='ms-retry';retry.hidden=true;
    const cancel=make('button');cancel.id='ms-cancel';cancel.hidden=true;
    controls.append(...((aurora||auralis||tab)?[send]:[]),upload,refresh,retry,cancel,input);
    const filters=make('div',null,'ms-row');
    const search=make('input');search.id='ms-search';search.type='search';
    const sort=make('select');sort.id='ms-sort';
    const sortOptions=[['new','Mais recentes','Newest first'],['name','Nome A–Z','Name A–Z'],['size','Menor tamanho','Smallest first']];
    for(const [v,pt,en] of sortOptions){const o=make('option',pt);o.value=v;sort.append(o);}sort.value='new';
    const autoLabel=make('label',null,'ms-auto');const auto=make('input');auto.id='ms-auto';auto.type='checkbox';
    const autoText=make('span');autoLabel.append(auto,autoText);filters.append(search,sort,autoLabel);
    const connection=make('p',null,'ms-muted');connection.id='ms-connection';
    const status=make('p');status.id='ms-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const summary=make('p',null,'ms-muted');summary.id='ms-summary';
    const progress=make('progress');progress.id='ms-progress';progress.max=1;progress.value=0;progress.hidden=true;
    const errors=make('ul');errors.id='ms-errors';errors.hidden=true;
    const list=make('ul');list.id='ms-list';
    const more=make('button');more.id='ms-more';more.hidden=true;
    const hint=make('p',null,'ms-muted');
    dialog.append(close,title,address,description,controls,filters,connection,status,progress,errors,summary,list,more,hint);document.body.append(launch,dialog);
    let busy=false,items=[],pending=[],timer=null,delay=5000,controller=null,limit=50,totalBytes=0,ignored=0,suspended=false;
    function msg(text,error=false){status.textContent=text;status.dataset.error=String(error);}
    function updateControls(){
      for(const b of dialog.querySelectorAll('button'))b.disabled=busy&&!['ms-close','ms-cancel'].includes(b.id);
      retry.hidden=!pending.length;cancel.hidden=!controller;search.disabled=busy;sort.disabled=busy;
    }
    function setBusy(value){busy=value;updateControls();}
    function stopPoll(){if(timer!==null)clearTimeout(timer);timer=null;}
    function schedule(){stopPoll();if(suspended||!auto.checked||!dialog.open||document.hidden)return;timer=setTimeout(async()=>{
      timer=null;if(!busy){setBusy(true);try{await reload(true);delay=5000;}catch(e){connection.textContent=translateError(e.message);delay=Math.min(30000,delay*2);}finally{setBusy(false);}}
      schedule();
    },delay);}
    function translateError(message){
      if(tr('pt','en')==='pt')return message;
      const map={
        'Servidor indisponível. Confira a conexão e tente novamente.':'Server unavailable. Check your connection and try again.',
        'Tempo de conexão esgotado. Use Repetir pendentes para confirmar o mesmo envio.':'Connection timed out. Use Retry pending to confirm the same upload.',
        'Tempo de conexão esgotado. Tente novamente.':'Connection timed out. Try again.',
        'Operação cancelada. O servidor pode já ter recebido o arquivo.':'Operation cancelled. The server may have received the file.',
        'Abra o programa pelo endereço HTTP do servidor.':'Open the app using the server HTTP address.',
        'MIDI inválido, truncado ou sem notas. Use MIDI tipo 0/1 com tempo PPQ.':'Invalid, truncated or empty MIDI. Use MIDI type 0/1 with PPQ timing.',
        'Identificador já utilizado para outro envio.':'This upload identifier was already used for different content.',
        'Limite de armazenamento atingido. Consulte o responsável pelo servidor.':'Storage limit reached. Contact the server operator.',
        'Arquivo MIDI não encontrado.':'MIDI file not found.',
        'Não foi possível gravar o arquivo no servidor.':'Unable to save the file on the server.',
        'O MIDI excede o limite de um milhão de eventos.':'MIDI exceeds the limit of one million events.'};
      return map[message]||message;
    }
    async function operation(fn){if(busy)return;stopPoll();setBusy(true);try{await fn();}catch(e){msg(translateError(e.message),true);}finally{controller=null;setBusy(false);schedule();}}
    function labels(){
      launch.textContent=tr('Rede MIDI','MIDI network');close.textContent=tr('Fechar','Close');title.textContent=tr('Meus arquivos MIDI','My MIDI files');
      send.textContent=tr('Enviar música atual','Send current song');upload.textContent=tr('Enviar arquivos MIDI','Upload MIDI files');refresh.textContent=tr('Atualizar lista','Refresh list');
      retry.textContent=tr('Repetir pendentes','Retry pending');cancel.textContent=tr('Cancelar fila','Cancel queue');more.textContent=tr('Mostrar mais 50','Show 50 more');
      search.placeholder=tr('Buscar música ou origem…','Search song or source…');search.setAttribute('aria-label',tr('Buscar músicas','Search songs'));
      sort.setAttribute('aria-label',tr('Ordenar músicas','Sort songs'));sortOptions.forEach((o,i)=>sort.children[i].textContent=tr(o[1],o[2]));
      autoText.textContent=tr('Atualizar a cada 5 s','Refresh every 5 s');
      description.textContent=auralis?tr('Envie o MIDI da transcrição atual e abra-o no Aurora ou no MIDI Tab. O áudio permanece no navegador.','Send the current transcription as MIDI to Aurora or MIDI Tab. Audio stays in your browser.'):aurora?tr('Envie sua música ou abra um MIDI compartilhado no Aurora.','Send your song or open a shared MIDI in Aurora.'):tab?tr('Receba uma música e confira a pista e a afinação da tablatura.','Receive a song and review the tablature track and tuning.'):tr('Compartilhe músicas com os aplicativos na rede local.','Share songs with the apps on your local network.');
      hint.textContent=tr(`Até ${maxMiB} MiB por arquivo e 50 arquivos por fila. Repetir pendentes confirma o mesmo envio sem criar uma cópia extra. Samples e SoundFonts não são transferidos.`,`Up to ${maxMiB} MiB per file and 50 files per queue. Retry pending confirms the same upload without creating another copy. Samples and SoundFonts are not transferred.`);
      render();updateControls();
    }
    function formatSize(size){return size<1024*1024?(size/1024).toFixed(1)+' KiB':(size/(1024*1024)).toFixed(1)+' MiB';}
    function render(){
      const query=normalized(search.value||'');let view=items.filter(i=>normalized(i.name+' '+i.source).includes(query));
      if(sort.value==='name')view.sort((a,b)=>a.name.localeCompare(b.name));
      if(sort.value==='size')view.sort((a,b)=>a.size-b.size||a.name.localeCompare(b.name));
      const counts=new Map();for(const i of items)counts.set(i.sha256,(counts.get(i.sha256)||0)+1);
      list.replaceChildren();
      summary.textContent=tr(`${view.length} de ${items.length} arquivo(s) · ${formatSize(totalBytes)} no catálogo`,`${view.length} of ${items.length} file(s) · ${formatSize(totalBytes)} in catalog`)+(ignored?tr(` · ${ignored} registro(s) inválido(s) ignorado(s)`,` · ${ignored} invalid record(s) ignored`):'');
      for(const item of view.slice(0,limit)){
        const row=make('li');row.dataset.id=item.id;row.append(make('strong',item.name));
        const date=new Date(item.created_at).toLocaleString(tr('pt-BR','en-US'));
        row.append(make('div',`${date} · ${item.source} · ${formatSize(item.size)} · ${item.notes} ${tr('notas','notes')} · ${item.tracks} ${tr('pista(s)','track(s)')}`,'ms-meta'));
        if(counts.get(item.sha256)>1)row.append(make('div',tr('Conteúdo MIDI repetido no catálogo','Repeated MIDI content in catalog'),'ms-duplicate'));
        const actions=make('div',null,'ms-row');
        if(tab||aurora||auralis){
          const open=make('button',tab?tr('Abrir no MIDI Tab','Open in MIDI Tab'):auralis?tr('Abrir no Auralis','Open in Auralis'):tr('Abrir no Aurora','Open in Aurora'),'ms-primary');open.type='button';open.classList.add('ms-open');open.disabled=busy;
          open.onclick=()=>operation(()=>openItem(item));actions.append(open);
        }
        for(const [route,pt,en] of [['/midi-tab/','MIDI Tab','MIDI Tab'],['/aurora/','Aurora','Aurora'],['/auralis/','Auralis','Auralis']]){
          if((route==='/midi-tab/'&&tab)||(route==='/aurora/'&&aurora)||(route==='/auralis/'&&auralis))continue;
          const link=make('a',tr('Abrir no '+pt,'Open in '+en),'ms-btn');link.href=route+'?midi='+encodeURIComponent(item.id);link.target='_blank';link.rel='noopener';actions.append(link);
        }
        const download=make('a',tr('Baixar MIDI','Download MIDI'),'ms-btn');download.href='/api/midis/'+item.id;download.download=item.name;actions.append(download);
        const remove=make('button',tr('Excluir','Delete'),'ms-delete');remove.type='button';
        remove.onclick=()=>operation(async()=>{
          if(!confirm(tr('Excluir este MIDI da sua biblioteca? A exclusão é permanente.','Delete this MIDI from your library? This cannot be undone.')))return;
          await api.remove(item.id);await reload(true);msg(tr('MIDI excluído.','MIDI deleted.'));
        });
        actions.append(remove);
        const details=make('details');const detailsTitle=make('summary',tr('Identificação e integridade','Identity and integrity'));details.append(detailsTitle,make('p','SHA-256: '+item.sha256,'ms-hash'),make('p','ID: '+item.id,'ms-hash'));
        row.append(actions,details);list.append(row);
      }
      more.hidden=view.length<=limit;
      if(!view.length)list.append(make('li',tr(items.length?'Nenhuma música corresponde à busca.':'Nenhuma música enviada ainda.',items.length?'No songs match your search.':'No songs uploaded yet.')));
    }
    async function reload(quiet=false){
      const result=await api.list();items=result.items;totalBytes=result.total_bytes??items.reduce((n,i)=>n+i.size,0);ignored=result.ignored||0;
      if(result.changed)render();connection.textContent=tr('Servidor conectado · consulta às ','Server connected · checked at ')+new Date().toLocaleTimeString(tr('pt-BR','en-US'));
      if(!quiet)msg(items.length?tr(`${items.length} arquivo(s) disponível(is).`,`${items.length} file(s) available.`):tr('Servidor conectado. Nenhuma música enviada ainda.','Server connected. No songs uploaded yet.'));
    }
    async function openItem(item){
      if(aurora&&!confirm(tr('Abrir este MIDI substitui o projeto atual do Aurora. Salve seu projeto antes de continuar. Abrir?', 'Opening this MIDI replaces the current Aurora project. Save your project first. Open?')))return;
      msg(tr('Recebendo música…','Receiving song…'));
      const buffer=await api.download(item);
      if(buffer.byteLength!==item.size)throw Error(tr('Arquivo recebido com tamanho incorreto. Tente novamente.','Received file has the wrong size. Try again.'));
      if(globalThis.crypto?.subtle){
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==item.sha256)throw Error(tr('Falha de integridade: o conteúdo recebido foi alterado.','Integrity check failed: received content has changed.'));
      }
      const file=new File([buffer],item.name,{type:'audio/midi'});
      if(tab)await window.MidiShareTab.openFile(file);else if(auralis)await window.MidiShareAuralis.openFile(file);else await window.MidiShareAurora.openFile(file);
      msg(tr('Música recebida.','Song received.'));dialog.close();stopPoll();
    }
    function job(file){return {file,source:aurora?'Aurora':tab?'MIDI Tab':auralis?'Auralis':'Portal',id:globalThis.MidiShareUUID().replaceAll('-','')};}
    async function runQueue(jobs){
      if(jobs.length>50)throw Error(tr('Envie no máximo 50 arquivos por fila.','Send at most 50 files per queue.'));
      controller=new AbortController();updateControls();pending=[];errors.replaceChildren();errors.hidden=true;
      progress.hidden=false;progress.max=jobs.length||1;progress.value=0;progress.setAttribute('aria-label',tr('Arquivos processados','Processed files'));
      let sent=0,failed=0;
      for(let i=0;i<jobs.length;i++){
        const current=jobs[i];
        if(controller.signal.aborted){pending.push(...jobs.slice(i));break;}
        msg(tr(`Enviando ${i+1}/${jobs.length}: ${current.file.name}`,`Uploading ${i+1}/${jobs.length}: ${current.file.name}`));
        try{
          if(!/\.midi?$/i.test(current.file.name)||!current.file.size||current.file.size>api.maxBytes)throw Error(tr(`Use .mid/.midi de até ${maxMiB} MiB, com conteúdo.`,`Use a non-empty .mid/.midi file up to ${maxMiB} MiB.`));
          const result=await api.upload(current,controller.signal);items=[result.item,...items.filter(i=>i.id!==result.item.id)];sent++;
        }catch(e){
          failed++;if(e.transient)pending.push(current);
          errors.append(make('li',current.file.name+': '+translateError(e.message)));errors.hidden=false;
        }
        progress.value=i+1;
      }
      totalBytes=items.reduce((n,i)=>n+i.size,0);render();
      msg(tr(`Enviado(s): ${sent}. Falha(s): ${failed}. Pendente(s): ${pending.length}.`,`Uploaded: ${sent}. Failed: ${failed}. Pending: ${pending.length}.`),failed>0||pending.length>0);
    }
    send.onclick=()=>operation(async()=>{const bridge=auralis?window.MidiShareAuralis:tab?window.MidiShareTab:window.MidiShareAurora;if(!bridge)throw Error(tr('Aguarde o aplicativo carregar.','Wait for the app to load.'));await runQueue([...pending,job(bridge.exportFile())]);});
    upload.onclick=()=>input.click();input.onchange=()=>{const files=Array.from(input.files||[]);input.value='';if(files.length)operation(()=>runQueue([...pending,...files.map(job)]));};
    retry.onclick=()=>operation(()=>runQueue(pending.slice()));cancel.onclick=()=>controller?.abort();
    refresh.onclick=()=>operation(()=>reload());
    search.oninput=()=>{limit=50;render();};sort.onchange=()=>{limit=50;render();};more.onclick=()=>{limit+=50;render();};
    auto.onchange=()=>{delay=5000;schedule();};
    close.onclick=()=>{dialog.close();stopPoll();};dialog.addEventListener('close',stopPoll);
    launch.onclick=()=>{labels();if(!dialog.open)dialog.showModal();operation(()=>reload());};
    document.getElementById('language')?.addEventListener('change',labels);document.getElementById('langBtn')?.addEventListener('click',()=>setTimeout(labels,0));
    document.getElementById('portal-network')?.addEventListener('click',()=>launch.click());
    document.addEventListener('visibilitychange',schedule);
    window.addEventListener('pagehide',()=>{suspended=true;stopPoll();controller?.abort();});
    window.addEventListener('pageshow',()=>{suspended=false;schedule();});
    labels();
    const incoming=new URLSearchParams(location.search).get('midi');
    if((tab||aurora||auralis)&&incoming){dialog.showModal();operation(async()=>{
      if(!/^[a-f0-9]{32}$/.test(incoming))throw Error(tr('Identificador de MIDI inválido.','Invalid MIDI identifier.'));
      await openItem(await api.item(incoming));
      const url=new URL(location.href);url.searchParams.delete('midi');history.replaceState(null,'',url.pathname+url.search+url.hash);
    });}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
