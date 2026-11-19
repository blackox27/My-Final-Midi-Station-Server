// The cache owns only reproducible analysis, never the user's edits or source audio.
export class AnalysisCache{
  constructor(limit=96*1024*1024){this.limit=limit;this.map=new Map();}
  get(key){const value=this.map.get(key);if(value){this.map.delete(key);this.map.set(key,value);}return value;}
  set(key,value){this.map.delete(key);this.map.set(key,value);this.trim(key);return value;}
  trim(protectedKey){let size=this.bytes();for(const [key,value]of this.map){if(size<=this.limit)break;if(key===protectedKey)continue;size-=bytes(value);this.map.delete(key);}if(size>this.limit)this.map.delete(protectedKey);}
  deletePrefix(prefix){for(const k of this.map.keys())if(k.startsWith(prefix))this.map.delete(k);}
  clear(){this.map.clear();}
  bytes(){let sum=0;for(const value of this.map.values())sum+=bytes(value);return sum;}
}
function bytes(value,seen=new Set()){
  if(!value||typeof value!=='object'||seen.has(value))return 0;seen.add(value);
  if(ArrayBuffer.isView(value)){if(seen.has(value.buffer))return 0;seen.add(value.buffer);return value.buffer.byteLength;}
  if(value instanceof ArrayBuffer)return value.byteLength;
  let size=0;for(const v of Object.values(value))size+=bytes(v,seen);return size;
}
export const preparationKey=p=>JSON.stringify([p.regionStart,p.regionEnd,p.channel,!!p.normalize,!!p.highpass]);
