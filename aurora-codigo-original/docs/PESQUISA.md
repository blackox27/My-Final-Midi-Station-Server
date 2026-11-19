# Pesquisa técnica — Aurora MIDI Studio 2.3.0

Data: 17/10/2026. Revisão do ZIP Aurora 2.2.0 fornecido. O objetivo foi corrigir o editor existente e manter uso local por `index.html`. Foram consultados projetos livres, documentação primária e código-fonte. As implementações novas do editor são locais; nenhum novo pacote de execução foi adicionado.

| Referência primária | O que foi examinado | Aplicação nesta revisão |
| --- | --- | --- |
| [SpessaSynth Lib](https://github.com/spessasus/spessasynth_lib) e [documentação](https://spessasus.github.io/spessasynth_lib/) | Separação entre síntese em AudioWorklet, processamento em Worker e exportação offline; código correspondente já incluído no pacote | Preservação dos motores e dos bancos independentes por pista, testes reais de síntese e exportação, descarte de buffers obsoletos |
| [SpessaSynth Core](https://github.com/spessasus/spessasynth_core) | `src/midi/read/rmidi.ts`, `basic_midi.ts` e utilitários RIFF do código fornecido | Leitura do contêiner RMID para extrair o SMF, com tamanhos e alinhamento validados; o Aurora não importa bancos embutidos |
| [midi-file](https://github.com/carter-thaxton/midi-file), MIT | Código publicado no pacote 1.2.4, `lib/midi-parser.js`: comprimento de End of Track, Note On com velocity zero, status e eventos meta | Rejeição de End of Track malformado, revisão de limites e verificação independente do MIDI exportado |
| [Tone.js MIDI](https://github.com/Tonejs/Midi), MIT | Pacote 2.0.28, `src/Header.ts`: conversão entre ticks e segundos por segmentos de andamento; representação de notas e mapas | Verificação independente de MIDI com mudança de andamento no meio de uma nota; preservação dos mapas existentes |
| [i18next](https://www.i18next.com/translation-function/interpolation), MIT | Código publicado no pacote 26.4.7 e documentação de interpolação/escape | Catálogo local, valores interpolados e atualização por idioma; apresentação por `textContent`/atributos para não interpretar nomes e valores como HTML. O i18next não foi incorporado como dependência |
| [LMMS — Piano Roll](https://docs.lmms.io/user-manual/navigation/piano-roll) | Ferramentas de edição de notas, seleção, intensidade e navegação descritas no manual oficial | Referência de interação para humanização, edição reversível e enquadramento das notas; sem cópia de código GPL |
| [signal](https://github.com/ryohey/signal), MIT | Repositório e arquitetura pública de editor MIDI para navegador | Referência de separação entre interface, dados musicais e recursos de síntese; sem incorporação de código |
| [MDN Web Audio — sequenciamento](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques) e [exemplos livres](https://github.com/mdn/webaudio-examples/tree/main/step-sequencer) | Agendamento com antecedência no relógio de áudio e desenho com requestAnimationFrame | Preservado o agendador de áudio; cache de compassos reduz trabalho repetido da interface sem substituir o relógio por animação |
| PulseForge MIDI — MIT, fonte já incluída em `vendor-source/PulseForgeMIDI` | Estrutura de notas, quantização e importação PFM existentes | Compatibilidade mantida, incluindo força/swing/finais e histórico |

## Validação independente de formato

Um projeto com dois andamentos, dois compassos e uma nota atravessando a mudança de BPM foi exportado pelo Aurora e lido por midi-file 1.2.4 e @tonejs/midi 2.0.28. Ambos aceitaram o arquivo. Tone.js confirmou a duração real de 1,5 s para a nota de 2 tempos que atravessa a mudança de 120 para 60 BPM. O MIDI reexportado por Tone.js foi reimportado pelo Aurora, preservando início e duração em tempos. Essa checagem foi executada separadamente; os pacotes de pesquisa não são necessários para usar nem reconstruir o Aurora.

## Decisões e limites

As bibliotecas de áudio incluídas permanecem nas versões fornecidas e já integradas: Core 4.3.22, Lib 4.3.14, stb-vorbis 0.0.5 e lamejs 1.2.1. Não houve troca automática por versões novas sem ensaio de compatibilidade. Licenças e alterações locais anteriores continuam em THIRD-PARTY-NOTICES.txt.

Não foi feita promessa de suporte universal a MIDI, trackers ou bancos de sons: MIDI tipo 2, divisão SMPTE, letras, SysEx e bancos embutidos de RMID continuam fora do modelo de edição. SF3 e DLS continuam encaminhados aos carregadores existentes, mas esta revisão não incluiu uma coleção de arquivos externos desses formatos para validá-los. Recursos futuros razoáveis são métricas por pista, suporte explícito a metadados e ensaios em outros navegadores; não são anunciados como implementados.
