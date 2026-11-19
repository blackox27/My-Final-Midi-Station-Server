import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const source=path.join(root,'src'),dist=path.join(root,'dist');await fs.mkdir(path.join(dist,'assets'),{recursive:true});
await fs.cp(path.join(root,'web'),dist,{recursive:true});
const worker=await build({entryPoints:[path.join(source,'worker.js')],bundle:true,format:'iife',platform:'browser',target:'es2022',write:false,minify:true,legalComments:'inline'});
await fs.writeFile(path.join(source,'worker-source.txt'),worker.outputFiles[0].text);
const basicRoot=path.dirname(require.resolve('@spotify/basic-pitch/package.json')),model=JSON.parse(await fs.readFile(path.join(basicRoot,'model/model.json'),'utf8'));
const shards=[];for(const manifest of model.weightsManifest)for(const name of manifest.paths)shards.push(await fs.readFile(path.join(basicRoot,'model',name)));
const data={modelTopology:model.modelTopology,signature:model.signature,weightSpecs:model.weightsManifest.flatMap(m=>m.weights),weights:Buffer.concat(shards).toString('base64')};
await fs.writeFile(path.join(dist,'assets/model.js'),'/* Spotify Basic Pitch model, Apache-2.0. See docs/THIRD_PARTY.md. Bundled to work with file:// without fetch. */\nglobalThis.AURALIS_MODEL='+JSON.stringify(data)+';\n');
const wasmRoot=path.join(path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json')),'dist'),wasm={};
for(const name of ['tfjs-backend-wasm.wasm','tfjs-backend-wasm-simd.wasm'])wasm[name]='data:application/wasm;base64,'+(await fs.readFile(path.join(wasmRoot,name))).toString('base64');
// One thread works on file:// without cross-origin isolation or SharedArrayBuffer.
wasm['tfjs-backend-wasm-threaded-simd.wasm']=wasm['tfjs-backend-wasm-simd.wasm'];
await fs.writeFile(path.join(dist,'assets/wasm.js'),'/* TensorFlow.js WebAssembly binaries, Apache-2.0. */\nglobalThis.AURALIS_WASM='+JSON.stringify(wasm)+';\n');
await build({entryPoints:[path.join(source,'app.js')],outfile:path.join(dist,'assets/app.js'),bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'external',loader:{'.txt':'text'},define:{'process.env.NODE_ENV':'"production"'}});
await fs.cp(path.join(root,'docs'),path.join(dist,'docs'),{recursive:true,filter:source=>!source.endsWith('.ts')});
await fs.cp(path.join(root,'examples'),path.join(dist,'examples'),{recursive:true});
// A copied-over installation or an HTTP preview must not combine old and new scripts.
const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
let html=await fs.readFile(path.join(dist,'index.html'),'utf8');
for(const name of ['assets/app.js','assets/model.js','assets/wasm.js','assets/app.css','assets/icon.svg']){
  const hash=createHash('sha256').update(await fs.readFile(path.join(dist,name))).digest('hex').slice(0,12);
  html=html.replaceAll('"'+name+'"','"'+name+'?v='+version+'-'+hash+'"');
}
await fs.writeFile(path.join(dist,'index.html'),html);
for(const name of ['assets/app.js','assets/model.js'])console.log(name,(await fs.stat(path.join(dist,name))).size+' bytes');
