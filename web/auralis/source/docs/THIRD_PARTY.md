# Componentes de terceiros

Auralis usa o modelo pré-treinado Basic Pitch do Spotify e bibliotecas distribuídas por seus autores. O código próprio tem licença MIT; as dependências e os pesos conservam suas licenças.

Os arquivos de licença encontrados nas distribuições npm estão em licenses/. app.js.LEGAL.txt contém avisos preservados pelo bundler. O código-fonte editável do aplicativo está em source/. O SF2 completo não é distribuído. As demos internas são geradas matematicamente. O exemplo em examples/ foi sintetizado a partir de FluidR3_GM; a licença MIT de Frank Wen está incluída. O modelo de timbres foi treinado com notas renderizadas desse mesmo banco, com TinySoundFont.

## Novos componentes 1.1

- TensorFlow.js WebAssembly 3.21.0 e binários SIMD: Apache-2.0, https://github.com/tensorflow/tfjs/tree/tfjs-v3.21.0/tfjs-backend-wasm
- TinySoundFont, usado apenas na geração de dados de treinamento: MIT, Bernhard Schelling, https://github.com/schellingb/TinySoundFont
- FluidR3 GM, Frank Wen: MIT, cópia preservada em https://github.com/pinkflames/fluid-soundfont e download https://github.com/pianobooster/fluid-soundfont/releases/tag/v3.1
- Auralis Timbre v1: pesos de uma rede pequena treinada neste projeto; licença MIT. Ver MODELO-TIMBRES.md.

## Software e modelo principais

- Spotify Basic Pitch 1.0.1 e pesos: Apache-2.0, https://github.com/spotify/basic-pitch-ts
- TensorFlow.js 3.21.0: Apache-2.0, https://github.com/tensorflow/tfjs
- WASM Audio Decoders: https://github.com/eshaz/wasm-audio-decoders — wrappers MIT; consulte as licenças dos codecs incorporados (libFLAC, libvorbis, libopus e mpg123) e os fontes de construção upstream.
- mpg123: https://www.mpg123.de/ e fontes upstream https://github.com/madebr/mpg123 ; os arquivos WASM do decoder são incluídos sem alteração de seus algoritmos.

## Inventário de dependências do ambiente de build

A lista também inclui ferramentas de desenvolvimento que não são executadas no aplicativo final.

| Pacote | Versão | Licença declarada | Repositório |
|---|---|---|---|
| ansi-regex | 5.0.1 | MIT | chalk/ansi-regex |
| ansi-styles | 4.3.0 | MIT | chalk/ansi-styles |
| argparse | 1.0.10 | MIT | nodeca/argparse |
| array-flatten | 3.0.0 | MIT | git://github.com/blakeembrey/array-flatten.git |
| asynckit | 0.4.0 | MIT | git+https://github.com/alexindigo/asynckit.git |
| call-bind-apply-helpers | 1.0.2 | MIT | git+https://github.com/ljharb/call-bind-apply-helpers.git |
| chalk | 4.1.2 | MIT | chalk/chalk |
| cliui | 7.0.4 | ISC | yargs/cliui |
| codec-parser | 2.5.0 | LGPL-3.0-or-later | git+https://github.com/eshaz/codec-parser.git |
| color-convert | 2.0.1 | MIT | Qix-/color-convert |
| color-name | 1.1.4 | MIT | git@github.com:colorjs/color-name.git |
| combined-stream | 1.0.8 | MIT | git://github.com/felixge/node-combined-stream.git |
| core-js | 3.51.0 | MIT | git+https://github.com/zloirock/core-js.git |
| delayed-stream | 1.0.0 | MIT | git://github.com/felixge/node-delayed-stream.git |
| dunder-proto | 1.0.1 | MIT | git+https://github.com/es-shims/dunder-proto.git |
| emoji-regex | 8.0.0 | MIT | https://github.com/mathiasbynens/emoji-regex.git |
| es-define-property | 1.0.1 | MIT | git+https://github.com/ljharb/es-define-property.git |
| es-errors | 1.3.0 | MIT | git+https://github.com/ljharb/es-errors.git |
| es-object-atoms | 1.1.2 | MIT | git+https://github.com/ljharb/es-object-atoms.git |
| es-set-tostringtag | 2.1.0 | MIT | git+https://github.com/es-shims/es-set-tostringtag.git |
| esbuild | 0.28.2 | MIT | git+https://github.com/evanw/esbuild.git |
| escalade | 3.2.0 | MIT | lukeed/escalade |
| form-data | 4.0.6 | MIT | git://github.com/form-data/form-data.git |
| function-bind | 1.1.2 | MIT | https://github.com/Raynos/function-bind.git |
| get-caller-file | 2.0.5 | ISC | git+https://github.com/stefanpenner/get-caller-file.git |
| get-intrinsic | 1.3.0 | MIT | git+https://github.com/ljharb/get-intrinsic.git |
| get-proto | 1.0.1 | MIT | git+https://github.com/ljharb/get-proto.git |
| gopd | 1.2.0 | MIT | git+https://github.com/ljharb/gopd.git |
| has-flag | 4.0.0 | MIT | sindresorhus/has-flag |
| has-symbols | 1.1.0 | MIT | git://github.com/inspect-js/has-symbols.git |
| has-tostringtag | 1.0.2 | MIT | git+https://github.com/inspect-js/has-tostringtag.git |
| hasown | 2.0.4 | MIT | git+https://github.com/inspect-js/hasOwn.git |
| is-fullwidth-code-point | 3.0.0 | MIT | sindresorhus/is-fullwidth-code-point |
| long | 4.0.0 | Apache-2.0 | https://github.com/dcodeIO/long.js.git |
| math-intrinsics | 1.1.0 | MIT | git+https://github.com/es-shims/math-intrinsics.git |
| midi-file | 1.2.4 | MIT | git+https://github.com/carter-thaxton/midi-file.git |
| mime-db | 1.52.0 | MIT | jshttp/mime-db |
| mime-types | 2.1.35 | MIT | jshttp/mime-types |
| mpg123-decoder | 1.0.3 | MIT | git+https://github.com/eshaz/wasm-audio-decoders.git |
| node-fetch | 2.6.13 | MIT | https://github.com/bitinn/node-fetch.git |
| ogg-opus-decoder | 1.7.5 | MIT | git+https://github.com/eshaz/wasm-audio-decoders.git |
| opus-decoder | 0.7.12 | MIT | git+https://github.com/eshaz/wasm-audio-decoders.git |
| regenerator-runtime | 0.13.11 | MIT | https://github.com/facebook/regenerator/tree/main/packages/runtime |
| require-directory | 2.1.1 | MIT | git://github.com/troygoode/node-require-directory.git |
| safe-buffer | 5.2.1 | MIT | git://github.com/feross/safe-buffer.git |
| seedrandom | 3.0.5 | MIT | git://github.com/davidbau/seedrandom.git |
| simple-yenc | 1.0.4 | MIT | git+https://github.com/eshaz/simple-yenc.git |
| sprintf-js | 1.0.3 | BSD-3-Clause | https://github.com/alexei/sprintf.js.git |
| string-width | 4.2.3 | MIT | sindresorhus/string-width |
| string_decoder | 1.3.0 | MIT | git://github.com/nodejs/string_decoder.git |
| strip-ansi | 6.0.1 | MIT | chalk/strip-ansi |
| supports-color | 7.2.0 | MIT | chalk/supports-color |
| tr46 | 0.0.3 | MIT | git+https://github.com/Sebmaster/tr46.js.git |
| undici-types | 8.9.0 | MIT | git+https://github.com/nodejs/undici.git |
| webidl-conversions | 3.0.1 | BSD-2-Clause | jsdom/webidl-conversions |
| whatwg-url | 5.0.0 | MIT | jsdom/whatwg-url |
| wrap-ansi | 7.0.0 | MIT | chalk/wrap-ansi |
| y18n | 5.0.8 | ISC | yargs/y18n |
| yargs | 16.2.2 | MIT | https://github.com/yargs/yargs.git |
| yargs-parser | 20.2.9 | ISC | https://github.com/yargs/yargs-parser.git |
| @esbuild/linux-x64 | 0.28.2 | MIT | git+https://github.com/evanw/esbuild.git |
| @eshaz/web-worker | 1.2.2 | Apache-2.0 | https://github.com/eshaz/web-worker |
| @spotify/basic-pitch | 1.0.1 | Apache-2.0 |  |
| @tensorflow/tfjs | 3.21.0 | Apache-2.0 | https://github.com/tensorflow/tfjs.git |
| @tensorflow/tfjs-backend-cpu | 3.21.0 | Apache-2.0 | https://github.com/tensorflow/tfjs.git |
| @tensorflow/tfjs-backend-webgl | 3.21.0 | Apache-2.0 | https://github.com/tensorflow/tfjs.git |
| @tensorflow/tfjs-converter | 3.21.0 | Apache-2.0 | https://github.com/tensorflow/tfjs.git |
| @tensorflow/tfjs-core | 3.21.0 | Apache-2.0 | https://github.com/tensorflow/tfjs.git |
| @tensorflow/tfjs-data | 3.21.0 | Apache-2.0 | https://github.com/tensorflow/tfjs.git |
| @tensorflow/tfjs-layers | 3.21.0 | Apache-2.0 AND MIT | https://github.com/tensorflow/tfjs.git |
| @tonejs/midi | 2.0.28 | MIT | https://github.com/Tonejs/Midi.git |
| @types/long | 4.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped.git |
| @types/node | 26.6.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped.git |
| @types/node-fetch | 2.6.13 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped.git |
| @types/offscreencanvas | 2019.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped.git |
| @types/seedrandom | 2.4.34 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped.git |
| @types/webgl-ext | 0.0.30 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped.git |
| @types/webgl2 | 0.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped.git |
| @wasm-audio-decoders/common | 9.0.7 | MIT | git+https://github.com/eshaz/wasm-audio-decoders.git |
| @wasm-audio-decoders/flac | 0.2.9 | MIT | git+https://github.com/eshaz/wasm-audio-decoders.git |
| @wasm-audio-decoders/ogg-vorbis | 0.1.20 | MIT | git+https://github.com/eshaz/wasm-audio-decoders.git |
| @wasm-audio-decoders/opus-ml | 0.0.3 | MIT | git+https://github.com/eshaz/wasm-audio-decoders.git |
| @webgpu/types | 0.1.16 | BSD-3-Clause | gpuweb/types |

## Acrescentado em 1.2

- Auralis Note Reviewer v1, código e pesos deste projeto, MIT. Treinado com composições sintéticas e timbres FluidR3, avaliado separadamente com GeneralUser GS.
- GeneralUser GS 2.0.3, Chris Collins: banco usado para avaliação e para sintetizar os exemplos de teste. O SF2 não é distribuído. A licença original está em licenses/GeneralUser-GS.txt; repositório https://github.com/mrbumpy409/GeneralUser-GS e site https://www.schristiancollins.com/generaluser.php .
- Vocadito, Rachel Bittner, Katherine Pasalo, Juan José Bosch, Gabriel Meseguer Brocal e David Rubinstein (2021), Zenodo 5578807, CC BY 4.0. Somente os trechos 10/14 foram usados para avaliação; seus áudios, letras e anotações não são distribuídos. https://zenodo.org/records/5578807 .
- Nenhum áudio do usuário participou do treinamento ou da avaliação descritos.
