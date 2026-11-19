# Referências consultadas e decisões aplicadas

Consulta: 17 de outubro de 2026. As referências abaixo orientaram o projeto. A implementação local de MIDI, digitação, desenho, sampler e exportação continua própria; os programas e SDKs listados não são dependências do aplicativo. As gravações FreePats são o conteúdo de terceiros distribuído no pacote, com licenças CC0 anexas.

| Referência primária | Aplicação no MIDI Tab |
|---|---|
| [TuxGuitar — repositório oficial](https://github.com/helge17/tuxguitar) | Referência de editor/reprodutor multitrack e organização de afinações. Não foram incorporados seus módulos Java ou plug-ins. |
| [alphaTab — repositório](https://github.com/CoderLine/alphaTab) e [destaque na reprodução](https://www.alphatab.net/docs/reference/settings/player/enableelementhighlighting/) | Referência para associar a posição musical aos elementos destacados. A implementação usa camadas de canvas separadas, sem redesenhar o documento inteiro por quadro. |
| [Tone.js — Sampler](https://tonejs.github.io/docs/15.1.22/classes/Sampler.html) e [código-fonte do Sampler](https://github.com/Tonejs/Tone.js/blob/d2d52ffa8803b35debd9f19f2da08ad1c3540de0/Tone/instrument/Sampler.ts) | Referência para associar alturas a buffers, escolher a gravação próxima, transpor e controlar envelopes. O MIDI Tab usa diretamente Web Audio, sem carregar Tone.js. |
| [W3C — Web Audio API](https://www.w3.org/TR/webaudio-1.0/#AudioBufferSourceNode) | Temporização por relógio de áudio, buffers, ganho e agendamento. A velocidade musical altera os instantes das notas; a transposição do sample depende apenas da diferença de altura. |
| [MDN — AudioBufferSourceNode.playbackRate](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate) | Verificação do comportamento de resampling. A duração natural também muda quando um WAV é transposto. |
| [MIDI-to-Tab, Edwards et al., ISMIR 2024](https://arxiv.org/abs/2408.05024) | Contexto da ambiguidade entre várias cordas/casas para a mesma nota e do uso de custos de movimento. Esta edição mantém busca heurística local: não inclui o Transformer, treinamento ou pesos do artigo. |
| [Chord Scale Generator — afinações](https://plucknplay.github.io/en/default-instruments-list.html) | Conferência inicial de referências de afinação para guitarra, baixo, ukulele, mandolim, mandola, bouzouki e balalaica. A oitava do cavaquinho foi conferida separadamente com fabricante e escola de música. Os presets são dados musicais de afinação e o usuário pode ajustá-los. |
| [FreePats — Spanish Classical Guitar](https://github.com/freepats/spanish-classical-guitar) | Quatro gravações CC0 selecionadas para o banco de violão. |
| [FreePats — Electric Guitar FSBS jazz](https://github.com/freepats/electric-guitar-FSBS-jazz) | Quatro gravações CC0 selecionadas para o banco de guitarra. |
| [FreePats — Ukulele](https://github.com/freepats/ukulele1) | Quatro gravações CC0 selecionadas para o banco de ukulele. |

## Conferência da altura do cavaquinho

A tabela geral de afinações apresenta o cavaquinho numa oitava mais grave que sua afinação sonora brasileira. O preset foi conferido com a [tabela de tensões D’Addario EJ93](https://www.daddario.com/en-au/products/ej93-cavaquinho-strings), que especifica D5, B4, G4 e D4 da primeira à quarta corda, e com a [escola Souza Lima](https://souzalima.com.br/blog/as-caracteristicas-do-cavaquinho/), que informa as frequências correspondentes. O aplicativo utiliza **D4–G4–B4–D5 da grave à aguda**, ou MIDI **74, 71, 67, 62** na ordem de exibição, da primeira à última corda. Foi acrescentado um teste específico para evitar regressão de oitava.

## Escolhas de desempenho

O código foi separado em scripts clássicos por responsabilidade para manter a abertura por arquivo local, sem servidor. O banco gravado acompanha o pacote como dados embutidos e é decodificado sob demanda. Workers locais fazem a leitura e a busca de digitação; cancelamentos encerram a tarefa anterior e resolvem as promessas pendentes. O documento é indexado por compasso e seus comandos de desenho são reutilizados na exportação. A animação consulta o compasso atual e desenha uma camada transitória, com limite aproximado de 30 atualizações por segundo.

As amostras sintetizadas usam recorrências de osciladores para evitar milhões de chamadas de seno/exponencial na geração de cada buffer. O cache possui limite, e uma saída comprimida reduz picos quando várias notas coincidem. Programas de instrumento são capturados em cada note-on, incluindo mudanças no mesmo canal.

## Limites das referências

Uma busca limitada por corda/casa não garante o resultado ótimo de uma transcrição profissional. Um banco compacto tampouco reproduz todas as articulações e instrumentos de um banco GM completo. Os modos sintetizados e os instrumentos representados por ordens são identificados na interface e nas instruções para que essas aproximações sejam revisáveis.
