(() => {
  'use strict';
  const $=id=>document.getElementById(id);let register=false,busy=false;
  const params=new URLSearchParams(location.search);
  const registrationOpen=globalThis.MidiShareConfig?.registration_open!==false;
  $('toggle').hidden=!registrationOpen;$('registration-notice').hidden=registrationOpen;
  const status=(text,error=false)=>{$('auth-status').textContent=text;$('auth-status').dataset.error=String(error);};
  function destination(){
    const value=params.get('next')||'/';
    try{const u=new URL(value,location.origin);return u.origin===location.origin&&!u.username&&!u.password&&u.pathname!='/login.html'?u.href:'/';}catch{return '/';}
  }
  function setMode(value){
    register=value&&registrationOpen;$('confirm-row').hidden=!register;$('confirm-password').required=register;
    $('confirm-password').value='';
    $('password').autocomplete=register?'new-password':'current-password';$('password').minLength=register?10:1;
    $('submit').textContent=register?'Criar conta':'Entrar';$('form-title').textContent=register?'Criar conta privada':'Entrar na conta';
    $('toggle').textContent=register?'Já tenho conta':'Criar uma conta';status('');
  }
  setMode(params.get('modo')==='cadastro');
  if(!register&&params.has('next')){
    fetch('/api/auth/session',{cache:'no-store',credentials:'same-origin'}).then(response=>{
      if(response.ok&&!register&&!busy&&!$('username').value&&!$('password').value)location.replace(destination());
    }).catch(()=>{});
  }
  $('toggle').onclick=()=>{
    if(busy)return;$('password').value='';setMode(!register);
  };
  $('auth-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    if(register&&$('password').value!==$('confirm-password').value){status('As senhas não coincidem.',true);return;}
    busy=true;$('submit').disabled=$('toggle').disabled=true;status(register?'Criando conta…':'Entrando…');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch('/api/auth/'+(register?'register':'login'),{method:'POST',cache:'no-store',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json','X-MIDI-Share':'1'},body:JSON.stringify({username:$('username').value,password:$('password').value,remember:$('remember').checked})});
      let data;
      try{data=await response.json();}
      catch{throw Error('Resposta inválida do servidor. Confira a conexão e tente novamente.');}
      if(!response.ok)throw Error(data.error||'Não foi possível entrar.');
      if(!data?.user?.id)throw Error('Resposta de login incompleta. Tente entrar novamente.');
      $('password').value=$('confirm-password').value='';
      try{const c=new BroadcastChannel('midishare-auth');c.postMessage({type:'login',user:data.user.id});c.close();}catch{}
      location.replace(destination());
    }catch(error){status(error.name==='AbortError'?'Tempo esgotado. Confira a conexão e tente novamente.':error instanceof TypeError?'Servidor indisponível.':error.message,true);}
    finally{clearTimeout(timeout);busy=false;$('submit').disabled=$('toggle').disabled=false;}
  };
})();
