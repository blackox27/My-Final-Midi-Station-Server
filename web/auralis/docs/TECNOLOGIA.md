# Auralis 1.2.0 — implementação e referências

## Escopo executado

Aplicativo inteiramente local e buildless na distribuição: HTML, CSS e JavaScript clássico em IIFE. O pacote final já contém o runtime de inferência, pesos e WASM. Não utiliza importações ES de arquivos no navegador, fetch de arquivos locais, service worker, servidor Python, chave de API, CDN ou endpoint remoto. As duas tags de script do index carregam os pesos e o aplicativo por caminhos relativos, permitindo uso por file:// em navegadores compatíveis.

## Entrada e preparo

1. Decodificação nativa por Web Audio.
2. Alternativa com WASM para FLAC/Ogg FLAC, Vorbis, Opus e MPEG, escolhida pelo cabeçalho do arquivo e pela extensão apropriada.
3. Mistura mono, seleção de canal ou sinal lateral L−R. Em oposição forte de fase, é usado um canal para evitar cancelamento na soma.
4. Recorte temporal, reamostragem pelo OfflineAudioContext a 22.050 Hz, high-pass opcional de 30 Hz e ajuste de nível opcional com ganho máximo de seis vezes. O áudio original fica preservado para audição.

## IA musical

O modelo incluído é o graph model original de **@spotify/basic-pitch 1.0.1**, sob Apache-2.0. Os pesos Basic Pitch não foram retreinados. O classificador separado de timbres é novo; veja MODELO-TIMBRES.md. O arquivo model.js incorpora topologia, especificações dos pesos e dados binários em base64; tf.io.fromMemory elimina dependência de fetch/CORS para os pesos locais.

A execução tenta WASM/SIMD com binários incorporados em data URLs, uma thread e sem exigir isolamento de origem; verifica a execução do grafo inteiro e usa WebGL/CPU como alternativas. O processamento usa janelas de 43.844 amostras, overlap de 7.680 amostras e remoção das margens de 15 quadros, seguindo a estrutura do pipeline publicado. A adaptação usa uma janela de entrada por vez, dispose explícito dos tensores e mapeamento temporal pelo deslocamento efetivo das amostras de cada janela. Não utiliza o FPS inteiro arredondado como relógio da música.

Nos perfis Equilibrado e Rápido, a reconstrução percorre os mapas de 88 alturas uma vez, com histerese, picos de ataque, retomadas e duração mínima. O perfil Detalhado mantém outputToNotesPoly e, opcionalmente, addPitchBendsToNoteEvents do Spotify para comparação. Os dois decodificadores podem produzir eventos diferentes; o linear reduz o custo sem garantia de superioridade em precisão. Sensibilidade altera limiares de atividade/ataque; duração mínima e tolerância de interrupções alteram a reconstrução dos eventos. A intensidade é derivada da ativação do modelo e não é uma recuperação calibrada da força física da tecla original.

## Análise acústica e modo híbrido

- FFT radix-2, janela Hann, espectrograma e fluxo espectral positivo.
- Energia RMS por quadro, ataques por máximos locais e limiar adaptativo.
- BPM sugerido por autocorrelação normalizada de força de ataque em uma faixa de 55–200 BPM; uma preferência leve de 120 BPM evita algumas hipóteses extremas. A estimativa não cria um mapa detalhado de andamento.
- Um desvio de afinação descritivo é calculado com picos dominantes, sem transpor automaticamente as notas.
- No modo Híbrido, inícios de notas podem ser deslocados até 24 ms para um ataque acústico próximo; a duração é ajustada para preservar o término anterior.
- Uma razão de suporte espectral avalia energia próxima de harmônicos e bandas vizinhas. É informação auxiliar, sem interpretação como probabilidade calibrada. Por padrão não elimina notas do modelo nem elimina oitavas simultâneas legítimas.
- A recuperação espectral opcional acrescenta eventos do dicionário apenas quando há evidência forte, proximidade de ataque e ausência de evento já representado. Não é uma combinação de diversos grandes modelos e não há alegação de melhoria universal.

## Motores clássicos

**Melodia:** YIN com função de diferença cumulativa normalizada, interpolação parabólica do período, rejeição de quadros pouco periódicos e formação temporal dos eventos. O código permite uma altura por quadro. Curvas são estimadas em cents. Não é o algoritmo pYIN completo nem um transcritor polifônico.

**Espectral:** FFT de 4.096 amostras e hop de 512, dicionário harmônico esparso com até oito harmônicos por altura, shortlist de componentes e ajuste por coordenadas com pesos não negativos. Inclui seleção de picos fundamentais e formação temporal dos eventos. É uma decomposição supervisionada por templates harmônicos fixos, relacionada à família NMF/NNLS; não implementa NMF livre, PLCA, reconhecimento treinado de timbre ou source separation. Seu uso mais apropriado é material harmônico simples com fundamental perceptível.

**Percussão:** ataques acústicos e energia em três bandas para atribuição heurística de bumbo (GM 36), caixa (GM 38) ou chimbal (GM 42). Não é um modelo treinado de bateria completa. Outros tambores, pratos e percussões podem ser classificados incorretamente.

As análises DSP são executadas em Worker criado a partir de Blob inline, sem import de arquivos externos no Worker. Existe alternativa cooperativa na thread principal quando Workers são indisponíveis. Cancelar termina o Worker ou interrompe a inferência entre janelas; resultados só são confirmados no projeto após concluir os stems.

## MIDI e edição

Os tempos internos são segundos. A quantização é opcional; mudar o BPM de referência sem quantizar mantém a execução física. A escrita MIDI usa SMF tipo 1, PPQ 960, metaevento de tempo, nomes de pistas, Program Change, Note On e Note Off ordenados. Não declara automaticamente um compasso adivinhado.

Na exportação expressiva, as notas melódicas simultâneas recebem canais distintos entre os quinze canais disponíveis fora do canal GM de bateria. RPN configura ±2 semitons e o pitch bend é inicializado antes de cada nota. Se faltar canal, a exportação inteira volta a notas convencionais para não perder eventos. Não se declara um MPE zone ou conformidade MPE completa. Eventos simultâneos repetidos da mesma altura/canal no modo convencional são terminados na próxima ocorrência para evitar notas presas.

São editáveis até 16 identificadores de pista; a exportação aceita até 15 partes melódicas independentes e bateria sem reutilizar um canal melódico com outro instrumento. Oito stems são permitidos. A classificação por timbre atribui 11 famílias, uma classe incerta e a pista de percussão. Os campos instrumentFamily, instrumentTrack e instrumentConfidence são preservados no projeto. Divisão por registro é explicitamente uma organização por altura, não uma inferência da identidade dos instrumentos. O preview usa síntese simples e não contém SF2.

## Por que não um LLM

O núcleo já é uma rede musical pequena e treinada para mapear áudio em alturas e ataques. Um LLM textual sem um front-end acústico especializado não acrescentaria medição confiável de alturas. Inserir um grande modelo ou alterar notas por plausibilidade de linguagem pode aumentar custo e criar notas não sustentadas pela gravação. Auralis executa Basic Pitch para alturas e um MLP pequeno treinado neste projeto para timbres, sem LLM. A rede de timbres foi treinada com um banco sintetizado e sua validade em gravações reais é limitada.

## Modelos pesquisados que não foram distribuídos

MT3, YourMT3+, MuScriptor, modelos de piano especializados, difusão e separadores como Demucs oferecem direções relevantes, mas não foram incorporados nem validados nesta distribuição local. Incluí-los exigiria novas conversões de runtime, políticas de memória, avaliação conjunta e verificação de licenças dos respectivos pesos. MuScriptor, por exemplo, distingue a licença MIT de seu código da licença CC BY-NC 4.0 dos pesos. Um botão com o nome de um modelo não equivaleria à sua implementação.

## Fontes primárias

- Spotify Basic Pitch: https://github.com/spotify/basic-pitch-ts e https://github.com/spotify/basic-pitch
- Bittner et al., A Lightweight Instrument-Agnostic Model for Polyphonic Note Transcription and Multipitch Estimation, ICASSP 2022: https://arxiv.org/abs/2203.09893
- TensorFlow.js: https://github.com/tensorflow/tfjs
- WASM Audio Decoders, Ethan Halsall: https://github.com/eshaz/wasm-audio-decoders
- YIN, de Cheveigné e Kawahara, 2002: https://pubmed.ncbi.nlm.nih.gov/12002874/
- AudioLabs, fatoração de espectrogramas: https://www.audiolabs-erlangen.de/resources/MIR/FMP/C8/C8S3_NMFSpecFac.html
- AudioLabs, rastreamento de batidas: https://www.audiolabs-erlangen.de/resources/MIR/FMP/C6/C6S3_BeatTracking.html
- MT3: https://arxiv.org/abs/2111.03017
- YourMT3+: https://arxiv.org/abs/2407.04822
- MuScriptor: https://arxiv.org/abs/2607.08168 e https://github.com/muscriptor/muscriptor
- MIDI Association, Standard MIDI Files: https://midi.org/standard-midi-files
- MIDI Association, expressão polifônica e mensagens de canal: https://midi.org/midi-polyphonic-expression-mpe-specification-adopted
- mir_eval e convenções de avaliação: https://mir-eval.readthedocs.io/latest/api/transcription.html

Referências verificadas durante a criação em 23 de outubro de 2026. A relação descreve fundamentos e decisões; citar um modelo não significa que seus pesos estejam dentro do aplicativo.

## Otimizações da revisão 1.1

- Mapas neurais em Float32Array, com tempos em Float64Array, evitando matrizes aninhadas durante a inferência usual.
- Cache LRU de até 96 MiB de buffers retidos; a memória total é maior e inclui áudios, modelo, cópias do Worker e objetos de análise. Chaves consideram projeto, camada, trecho, canal, filtro e normalização.
- Mapas neurais são independentes dos limiares do decodificador. Sensibilidade, duração, tolerância e faixa são reaplicadas sem nova inferência. Curvas de afinação exigem os mapas de contorno; se ausentes, a rede precisa ser executada novamente.
- FFT reutiliza janela, reversão de bits, twiddles e buffers de trabalho por tamanho. YIN usa múltiplos mínimos candidatos, transições de altura e Viterbi próprio. Também usa decimação FIR de 2:1 antes da comparação de períodos quando a faixa termina em MIDI 96 ou abaixo; faixas mais agudas preservam 22.050 Hz.
- O Worker DSP mantém a camada ativa e características de timbre em cache. Não recria um Worker ou copia a camada entre cada etapa.
- O piano roll mantém índice temporal e limites de altura; o agendador MIDI percorre as notas em ordem, em vez de verificar todas a cada ciclo.
- Janelas neurais comprovadamente silenciosas são puladas mantendo os mesmos deslocamentos temporais.

Fontes adicionais: [TensorFlow.js WASM](https://github.com/tensorflow/tfjs/tree/tfjs-v3.21.0/tfjs-backend-wasm), [SIMD no backend](https://blog.tensorflow.org/2020/09/supercharging-tensorflowjs-webassembly.html), [TinySoundFont](https://github.com/schellingb/TinySoundFont), [FluidR3 preservado e licença](https://github.com/pinkflames/fluid-soundfont).

## Revisão 1.2

O novo revisor e seus limites estão documentados em REVISAO-IA.md. Os modelos de transcrição e famílias não foram retreinados. O revisor recebe estatísticas compactas dos mapas neurais e características de FFT; os mapas completos não precisam ser copiados ao Worker para cada nota. Propostas rejeitadas são preservadas para recuperação.

O espectral mantém pesos e alturas em arrays compactos, independentes da sensibilidade, e só refaz NNLS ao mudar a fonte, a faixa ou a afinação usada. A afinação exige confiança acima de 0,65 e deslocamento de até 40 cents. O revisor usa informação de harmônicos inferiores como uma característica, nunca uma regra para apagar toda oitava.

A leitura de projeto valida todas as coleções antes de criar o estado na interface. Notas mais candidatas ficam dentro do limite de 200 mil eventos. O escritor MIDI rejeita alturas/tempos inválidos e representa deltas longos com eventos de texto vazios intermediários, preservando o tempo.
