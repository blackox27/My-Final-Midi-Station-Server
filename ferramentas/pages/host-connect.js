/* GitHub Pages só guarda o endereço do host. Credenciais são digitadas no host. */
(()=>{
'use strict';
function hostOrigin(value){
  if(typeof value!=='string'||value.length>300)throw Error('Informe o endereço do host.');
  const u=new URL(value.trim());
  if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!['http:','https:'].includes(u.protocol))throw Error('Use somente o endereço do host, sem caminho, usuário ou senha.');
  const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if(u.protocol==='http:'&&!local)throw Error('Use HTTPS para um host remoto. HTTP só é permitido no próprio computador.');
  if(u.hostname==='github.io'||u.hostname.endsWith('.github.io'))throw Error('O GitHub Pages é o portal público. Informe o endereço do host de contas.');
  if(!local&&(!u.hostname.includes('.')||u.hostname.length>253||!u.hostname.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))))throw Error('Informe um domínio válido do host.');
  return u.origin;
}
globalThis.MidiShareHostOrigin=hostOrigin;
if(typeof document==='undefined')return;
const form=document.getElementById('host-form');if(!form)return;
const input=document.getElementById('host-address'),status=document.getElementById('host-status'),forget=document.getElementById('host-forget');
const base=new URL('./',location.href),key='midishare.host:'+base.pathname;
try{input.value=new URLSearchParams(location.hash.slice(1)).get('host')||localStorage.getItem(key)||'';}catch{}
form.addEventListener('submit',event=>{
  event.preventDefault();
  try{const origin=hostOrigin(input.value);status.textContent='Abrindo '+origin+'. Entre com usuário e senha na página do host.';try{localStorage.setItem(key,origin);}catch{}location.assign(origin+'/login.html?next=%2F');}
  catch(error){status.textContent=error.message;input.focus();}
});
forget.addEventListener('click',()=>{try{localStorage.removeItem(key);}catch{}input.value='';history.replaceState(null,'',location.pathname+location.search);status.textContent='Endereço esquecido neste navegador.';});
})();
