/* Sessão em memória, verificação de conta e saída coordenada entre abas. */
(() => {
  'use strict';
  const context=globalThis.MidiShareSession;
  if(!context?.user?.id){location.replace('/login.html');return;}
  const id=context.user.id;
  let blocked=false,timer=null,channel,active=null,suspended=false;
  const originalTitle=document.title;
  function stop(){if(timer!==null)clearTimeout(timer);timer=null;}
  function cancelCheck(){
    const current=active;active=null;
    if(current){clearTimeout(current.timeout);current.controller.abort();}
  }
  function leave(){
    if(blocked)return;
    blocked=true;stop();cancelCheck();document.documentElement.style.visibility='hidden';
    location.replace('/login.html?reason=session');
  }
  function busy(){document.documentElement.dataset.auth='checking';}
  function suspend(){suspended=true;busy();stop();cancelCheck();}
  function resume(){
    if(document.hidden||blocked)return;
    suspended=false;busy();check();
  }
  async function verify(current){
    try{
      const r=await fetch('/api/auth/session',{signal:current.controller.signal,cache:'no-store',credentials:'same-origin',headers:{'X-MIDI-User':id}});
      if(active!==current)return false;
      if(!r.ok){if(r.status===401||r.status===409){leave();return false;}throw Error();}
      const session=await r.json();
      if(active!==current)return false;
      if(session.user?.id!==id||session.csrf!==context.csrf){leave();return false;}
      document.documentElement.dataset.auth='ready';document.title=originalTitle;return true;
    }catch{
      if(active===current){busy();document.title='Sessão sem conexão — '+originalTitle;}
      return false;
    }finally{
      clearTimeout(current.timeout);
      if(active===current){
        active=null;
        if(!blocked&&!suspended&&!document.hidden)timer=setTimeout(check,15000);
      }
    }
  }
  function check(){
    if(blocked||suspended||document.hidden)return Promise.resolve(false);
    if(active)return active.promise;
    stop();
    const controller=new AbortController();
    const current={controller,timeout:setTimeout(()=>controller.abort(),8000)};
    active=current;
    current.promise=verify(current);
    return current.promise;
  }
  busy();
  try{
    channel=new BroadcastChannel('midishare-auth');
    channel.onmessage=e=>{if((e.data?.type==='logout'&&e.data.user===id)||e.data?.type==='login')leave();};
  }catch{}
  window.MidiShareAuth={user:context.user,csrf:context.csrf,check,leave};
  window.addEventListener('pageshow',resume);
  window.addEventListener('pagehide',suspend);
  window.addEventListener('focus',()=>{if(!suspended&&!document.hidden&&!blocked){busy();check();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else resume();});
  document.addEventListener('DOMContentLoaded',()=>{
    const bar=document.createElement('div');bar.id='ms-account';
    const home=document.createElement('a');home.href='/';home.textContent='MIDI Share';
    const user=document.createElement('span');user.textContent=context.user.username;
    const logout=document.createElement('button');logout.type='button';logout.textContent='Sair';logout.id='ms-logout';
    logout.onclick=async()=>{
      if(!confirm('Salve seus projetos antes de sair. Encerrar esta sessão?'))return;
      logout.disabled=true;
      try{
        const r=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-MIDI-Share':'1','X-MIDI-User':id,'X-CSRF-Token':context.csrf}});
        if(r.status===409){leave();return;}
        if(!r.ok&&r.status!==401)throw Error();
        channel?.postMessage({type:'logout',user:id});leave();
      }catch{logout.disabled=false;logout.textContent='Sem conexão. Tentar sair';}
    };
    bar.append(home,user,logout);document.body.append(bar);check();
  });
})();
