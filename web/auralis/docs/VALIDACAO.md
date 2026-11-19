# Validação da versão 1.2.0

28 de outubro de 2026.

## Testes do núcleo

`npm test`: 34 testes. Incluem os testes anteriores de FFT, YIN, silêncio, tríades, oitavas, tempos de MIDI, importação e decodificação real de FLAC/MP3/Vorbis/Opus, além de verificações novas:

- probabilidades e características finitas; revisão desligada sem mutar propostas;
- preservação de propostas clássicas e das extremidades não representadas no treino;
- recuperação de candidatas, Desfazer/Refazer e identidades separadas;
- rastreamento temporal contra saltos breves de oitava, preservando mudanças deliberadas;
- tolerância de interrupções realmente aplicada;
- ajuste espectral a um tom desafinado em 25 cents e reuso das ativações;
- sensibilidade espectral com direção correta;
- notas repetidas curtas preservadas; alinhamento sem apagar a duração mínima e com curvas no mesmo tempo físico;
- reset de pitch bend antes da próxima nota e reuso de canal em limites exatos seguros;
- preservação de evidência do revisor nos projetos;
- canais lateral/direito respeitados diante de oposição de fase;
- validação de projeto concluída antes da criação na fila;
- validação de notas para MIDI, intensidade padrão audível e intervalos longos sem saturar deltas.

`npm run test:ai` executa os pesos reais. `npm run test:precision` executa Basic Pitch, a rede revisora, o cache e três arquivos FLAC de teste, com correspondência máxima por altura/ataque. Os testes incluem também uma oitava simultânea legítima. O pacote contém os exemplos necessários a esse teste.

## Comparação de precisão

Veja REVISAO-IA.md e data/pipeline-metrics.json. O conjunto reservado contém 20 trechos e 497 notas de referência, renderizados com GeneralUser GS; esse banco e essas composições não participaram do ajuste da rede ou dos limiares. A avaliação usa altura e ataque a até 50 ms e ignora duração e instrumento.

- **Referência 1.1**: 435 corretas, 665 extras, 62 ausentes; F1 54.48%.
- **1.2 equilibrada**: 430 corretas, 426 extras, 67 ausentes; F1 63.56%.
- **1.2 seletiva**: 326 corretas, 42 extras, 171 ausentes; F1 75.38%.

A referência utiliza o DSP da versão 1.1 congelado em tools/reviewer/baseline-dsp.js. O fluxo novo é reproduzido com as mesmas propostas neurais e o revisor aplicado antes do refinamento. A avaliação não foi usada para escolher pesos ou limiares.

Há um teste adicional executando novamente os três primeiros trechos reservados, a partir dos FLAC distribuídos. Nessa execução, F1 passou de 56,97% para 66,67%, com 92 e 91 correspondências corretas, respectivamente. Pequenas diferenças de arredondamento e formato junto ao limite de 50 ms podem alterar contagens entre as diferentes rotas de entrada.

## Dois trechos de voz gravada

Fonte: Vocadito 10 e 14, Zenodo 5578807, Bittner et al. (2021), CC BY 4.0. Os áudios não são distribuídos no pacote. Foram avaliadas as duas anotações independentes A1 e A2, com tolerâncias de 50 ms e 50 cents, sem julgar durações. Não houve treinamento ou ajuste dos limiares nesses trechos.

| Trecho / anotação | F1 Basic Pitch sem revisão | F1 revisão equilibrada | F1 revisão seletiva | F1 YIN 1.1 | F1 YIN temporal |
|---|---:|---:|---:|---:|---:|
| 10 / A1 | 44.68% | 46.15% | 47.46% | 26.47% | 26.47% |
| 10 / A2 | 39.53% | 40.96% | 43.14% | 20.00% | 20.00% |
| 14 / A1 | 52.17% | 52.75% | 54.55% | 42.11% | 42.11% |
| 14 / A2 | 38.10% | 38.55% | 43.48% | 32.35% | 32.35% |

A revisão equilibrada manteve as correspondências corretas de origem e retirou três propostas no trecho 10 e uma no 14. As pontuações do YIN não mudaram nesses dois exemplos. O modo seletivo omitiu mais notas corretas. São somente dois trechos e não um benchmark abrangente de canto, polifonia ou instrumentos reais.

## Tempo do modo espectral

No trecho de 7,5 s de ID 52, o ajuste espectral mediu cerca de 158 ms na referência, 163 ms na primeira chamada nova e 1,08 ms ao reaplicar sensibilidade com as ativações retidas. É uma medição do motor, não do carregamento, da IA ou da exportação; a primeira chamada não ficou mais rápida nesse exemplo. O benefício medido foi o reuso. Veja data/spectral-speed.json.

## Interface e alcance

Foram exercitados a transcrição com WASM/SIMD, a revisão seletiva, sensibilidade alta com cache, a demo de acordes, a recuperação de duas candidatas (12 → 14 notas), Desfazer (14 → 12 com as candidatas restauradas) e a tradução para inglês. Erros de uma extensão do navegador foram separados dos erros do aplicativo.

Após a inclusão dos identificadores de conteúdo, o recarregamento confirmou os scripts atualizados. A demo melódica resultou em oito notas em 1,41 s nessa execução; a exportação exibiu um link persistente para um MIDI de aproximadamente 0,3 KB. O clique foi exercitado, mas o navegador remoto não retornou um evento de download no prazo de 10 s. Portanto, essa verificação confirma a preparação e o link, sem confirmar o recebimento do arquivo pelo sistema operacional. A escrita e a leitura dos bytes MIDI são cobertas pelos testes locais.

A prévia utiliza HTTP local. Abertura direta file:// não foi exercitada no navegador remoto. O pacote mantém scripts clássicos relativos, pesos em memória, WASM em data URLs e Worker em Blob, sem dependências de CDN.

A importação por seletor de arquivos na prévia foi bloqueada por permissão na revisão anterior e não foi tentada por outra via. Arquivos reais de áudio, codecs, geração e leitura de MIDI foram testados diretamente nos motores locais. Os controles de exportação preparam um arquivo e mantêm um link clicável; o programa não afirma que o sistema operacional já salvou o download.

Não foi demonstrada superioridade sobre MT3, YourMT3+, MuScriptor ou ferramentas comerciais. Não foi calculado um percentual global de precisão do aplicativo. Os limites de durações, dinâmica, articulação e famílias de timbres permanecem. Todas as métricas estão acompanhadas do método e do conjunto que lhes deram origem.
