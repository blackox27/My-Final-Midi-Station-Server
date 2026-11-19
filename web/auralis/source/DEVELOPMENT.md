# Desenvolvimento

O aplicativo pronto está um nível acima da pasta source no pacote de distribuição. Não é preciso executar os passos abaixo para utilizá-lo.

Os fontes são módulos ES em src/. O HTML e os assets editáveis estão em web/. build.mjs empacota o Worker em texto inline, compila app.js em IIFE, incorpora o modelo e copia os guias para dist/.

Para reconstruir, utilize Node.js 20+ e npm:

```sh
npm ci
npm run build
```

A saída estará em dist/index.html. Os testes do núcleo usam Node e FFmpeg para gerar arquivos de codecs de teste:

```sh
npm test
npm run test:ai
```

test:ai executa de fato os pesos incorporados e pode levar alguns segundos ou mais em CPU. Para testar a interface, use um navegador recente; nenhum servidor é necessário para a distribuição pronta.

Arquivos:

- src/audio.js: decodificação, preparo e demos sintéticas.
- src/ai.js: carregamento e inferência Basic Pitch, descarte de tensores e suporte espectral.
- src/dsp.js: FFT, YIN, ataques, BPM, dicionário harmônico, refinamento e organização.
- src/worker.js: execução DSP em Worker.
- src/midi.js: escrita SMF e canais de expressão.
- src/playback.js: comparação de áudio e síntese simples.
- src/app.js: projetos, edição, interface e exportação.
- src/i18n.js: PT-BR/English e nomes General MIDI.
- tests/: validação do núcleo, codecs e inferência neural.

Não utilize o grau de evidência do modelo como uma probabilidade calibrada. Se adicionar novos modelos, execute avaliações com dados anotados e verifique separadamente as licenças do código e dos pesos. O aplicativo pronto não treina nem usa serviço remoto. O treinamento opcional de Auralis Timbre está em tools/training/.

A revisão 1.1 acrescenta src/cache.js, src/note-decoder.js, src/timbre-features.js, src/instruments.js e src/timbre-model.js. O build também incorpora os binários WebAssembly em assets/wasm.js, sem CDN.

Na versão 1.2, src/note-evidence.js extrai as características, src/review-model.js contém os pesos e src/note-review.js aplica a revisão. src/project-state.js mantém notas/candidatas em estados reversíveis; src/project-file.js valida o projeto antes de alterar a interface.

Execute npm run test:precision para o teste neural integrado com os três FLAC fornecidos e uma oitava real. A receita completa de treinamento/avaliação está em tools/reviewer/. Resultados históricos de 1.1 estão separados dos relatórios atuais.
