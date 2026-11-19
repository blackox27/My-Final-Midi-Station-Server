/* Transporte HTTP separado da apresentação. Nenhuma dependência externa. */
(() => {
  'use strict';
  class NetworkError extends Error {
    constructor(message,status=0,transient=false){super(message);this.status=status;this.transient=transient;}
  }
  class MidiShareAPI {
    constructor(){this.etag=null;this.cached=null;this.context=globalThis.MidiShareSession;this.maxBytes=globalThis.MidiShareLimits?.max_bytes||32*1024*1024;}
    async request(path,{binary=false,signal,...options}={}){
      if(!/^https?:$/.test(location.protocol))throw new NetworkError('Abra o programa pelo endereço HTTP do servidor.');
      if(!this.context?.user?.id)throw new NetworkError('Entre na sua conta para continuar.',401);
      const headers={...options.headers,'X-MIDI-User':this.context.user.id};
      if(options.method&&options.method!=='GET'&&options.method!=='HEAD')headers['X-CSRF-Token']=this.context.csrf;
      options={...options,headers};
      const controller=new AbortController();let timedOut=false;
      const cancel=()=>controller.abort();if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
      const transfer=binary||options.headers?.['Content-Type']==='audio/midi';
      const timeoutMs=transfer?150000:30000;
      const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
      try{
        const response=await fetch(path,{...options,signal:controller.signal,cache:'no-store',credentials:'same-origin'});
        if(response.status===304)return {notModified:true};
        if(!response.ok){const payload=await response.json().catch(()=>({}));if(response.status===401||payload.code==='account_changed'||payload.code==='csrf_invalid'){this.cached=null;this.etag=null;globalThis.MidiShareAuth?.leave();}throw new NetworkError(payload.error||`HTTP ${response.status}`,response.status,[408,429,500,502,503,504].includes(response.status));}
        let data;
        try{data=binary?await response.arrayBuffer():await response.json();}
        catch(error){
          if(error instanceof SyntaxError)throw new NetworkError('Resposta inválida do servidor. Tente novamente.',response.status,true);
          throw error;
        }
        return {data,etag:response.headers.get('ETag')};
      }catch(error){
        if(timedOut)throw new NetworkError(transfer&&options.body
          ?'Tempo de conexão esgotado. Use Repetir pendentes para confirmar o mesmo envio.'
          :'Tempo de conexão esgotado. Tente novamente.',0,true);
        if(signal?.aborted)throw new NetworkError('Operação cancelada. O servidor pode já ter recebido o arquivo.',0,true);
        if(error instanceof TypeError)throw new NetworkError('Servidor indisponível. Confira a conexão e tente novamente.',0,true);
        throw error;
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    }
    async list(){
      const result=await this.request('/api/midis',{headers:this.etag?{'If-None-Match':this.etag}:{}});
      if(result.notModified){if(!this.cached)throw new NetworkError('Lista ainda não disponível.');return {...this.cached,changed:false};}
      if(!Array.isArray(result.data.items))throw new NetworkError('Resposta inválida do servidor.');
      this.cached=result.data;this.etag=result.etag;return {...result.data,changed:true};
    }
    async item(id){return (await this.request('/api/midis/'+id+'/meta')).data.item;}
    async download(item){return (await this.request('/api/midis/'+item.id,{binary:true})).data;}
    async file(item){
      const buffer=await this.download(item);
      if(buffer.byteLength!==item.size)throw new NetworkError('Arquivo recebido com tamanho incorreto.');
      if(globalThis.crypto?.subtle){
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==item.sha256)throw new NetworkError('Falha de integridade do MIDI recebido.');
      }
      return new File([buffer],item.name,{type:'audio/midi'});
    }
    async remove(id){
      await this.request('/api/midis/'+encodeURIComponent(id)+'/delete',{
        method:'POST',headers:{'X-MIDI-Share':'1'}});
      this.etag=null;this.cached=null;
    }
    async upload(job,signal){
      if(!job.file.size||job.file.size>this.maxBytes)throw new NetworkError('O arquivo excede o limite deste servidor.');
      const result=await this.request('/api/midis?'+new URLSearchParams({name:job.file.name,source:job.source}),{
        method:'POST',headers:{'Content-Type':'audio/midi','X-MIDI-Share':'1','X-MIDI-Upload-ID':job.id},body:job.file,signal});
      this.etag=null;return result.data;
    }
  }
  globalThis.MidiShareAPI=MidiShareAPI;
})();
