# Revisor de notas da versão 1.2

Data da revisão: 28 de outubro de 2026.

## O que mudou na IA

Auralis agora executa três redes pequenas com funções diferentes. **Basic Pitch** continua propondo alturas e ataques com seus pesos originais, sem retreinamento. **Auralis Timbre** continua sugerindo famílias instrumentais com os pesos da versão 1.1. O novo **Auralis Note Reviewer v1** avalia propostas de notas usando a evidência neural e características acústicas. Ele pode separar candidatas suspeitas antes da exportação.

Isso não é um LLM, um novo separador de fontes ou um retreinamento do Basic Pitch. O ganho medido vem da revisão das propostas e de correções no processamento. As redes têm seus pesos incorporados e são executadas localmente, sem enviar áudio a um serviço.

## Treinamento novo e reproduzível

- 72 composições sintéticas, 7,5 s por trecho, com 1.746 eventos de referência antes da transcrição.
- 40 trechos de treino e 12 de validação renderizados com FluidR3 GM. Os outros 20 trechos usam **GeneralUser GS**, composições diferentes e eventos que não participaram do ajuste.
- Misturas com uma, duas ou três partes, oitavas legítimas, acordes, diferentes programas e intensidades, pequenas desafinações, ruído, eco curto e saturação moderada em parte dos exemplos.
- Propostas extraídas em três sensibilidades: 35%, 55% e 75%. Todas as variantes de um trecho permanecem na mesma divisão.
- 6994 propostas de treino, 2025 de validação e 3577 de teste, contando as variantes de sensibilidade.
- Rótulo positivo de treino: correspondência de altura e ataque a até 80 ms de uma nota conhecida. A avaliação usa 50 ms, um critério mais rigoroso. O objetivo do revisor é reconhecer notas, não ajustar artificialmente seus tempos para obter pontuação.
- 24 entradas, 24 unidades ReLU e uma saída sigmoide: 625 parâmetros, incluindo vieses. Seed do corpus: 1207; seed do ajuste: 1209. Adam, ruído nas características, dropout e regularização. Pesos escolhidos por perda na validação, sem usar o teste.
- O limiar equilibrado (0.03) foi escolhido na validação buscando F1 e preservando pelo menos 98% do recall de origem nesse conjunto. O limiar seletivo (0.68) usa F0,5, que dá mais peso à precisão. Essas condições não garantem a mesma preservação em outra gravação.

As entradas incluem atividade média e pico do Basic Pitch, evidência de ataque, continuidade, mudança de atividade, concorrência de alturas e harmônicos inferiores, duração, registro, energia harmônica, contraste com bandas vizinhas e evolução do envelope acústico.

Pesos: src/review-model.js. SHA-256 do arquivo: `98dae1d670f9efc49be91f5ce0b9935597134c45dfdd9b480f8009d1f70b9723`. Os scripts estão em source/tools/reviewer/ e a receita está no README dessa pasta. Não é preciso executar o treinamento para usar index.html. O banco SF2 completo não é distribuído.

## Aplicação e controles

**Equilibrada · preservar notas** é o padrão e usa uma revisão conservadora. **Priorizar menos notas extras** é mais seletivo e pode omitir notas válidas ou fracas. **Sem filtro de revisão** conserva as propostas do transcritor, mantendo os demais ajustes da interface.

As propostas separadas pelo revisor aparecem como candidatas. O botão **Adicionar candidatas à revisão** as devolve ao piano roll; Desfazer/Refazer inclui tanto as notas aceitas quanto as candidatas. A organização de pistas, a transposição, o salvamento e a reabertura também mantêm essa separação. A exportação usa as notas atualmente presentes no piano roll.

O revisor foi treinado em propostas neurais entre MIDI 28 e 89. Notas fora dessa faixa, eventos de bateria e propostas de motores clássicos sem mapas neurais não são rejeitados silenciosamente pela rede. O modo de voz do Material continua usando YIN e rastreamento temporal. A reconstrução de notas pode continuar produzindo falsos positivos mesmo com revisão ativada.

Os valores exibidos como evidência do revisor **não são porcentagens calibradas de acerto**. Não use o score isoladamente para decidir que uma nota musical é verdadeira ou falsa.

## Resultado no teste reservado

O relatório completo está em VALIDACAO.md e em data/pipeline-metrics.json. A comparação usa as mesmas propostas neurais armazenadas, aplicando o refinamento Híbrido da versão 1.1 e o fluxo novo com revisão. A correspondência é máxima, por altura e ataque, com tolerância de 50 ms. Duração, pedal, intensidade e identidade instrumental não entram nessa pontuação.

| Fluxo | Corretas | Extras | Ausentes | Precisão | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|
| 1.1 de referência | 435 | 665 | 62 | 39.55% | 87.53% | 54.48% |
| 1.2 equilibrada | 430 | 426 | 67 | 50.23% | 86.52% | 63.56% |
| 1.2 menos notas extras | 326 | 42 | 171 | 88.59% | 65.59% | 75.38% |

A revisão equilibrada reduziu as extras de 665 para 426 nesse teste; as correspondências corretas passaram de 435 para 430. O modo seletivo obteve maior precisão, acompanhada de menor recall. Esses resultados pertencem ao corpus descrito: **não representam um percentual de acerto em músicas reais**.

Nos dois trechos de voz Vocadito 10/14, não usados no treino ou no ajuste de limiares, o revisor equilibrado removeu poucas propostas e manteve as correspondências corretas de origem nas duas anotações avaliadas. O ganho foi pequeno; o rastreamento temporal não alterou a pontuação do YIN nesses dois casos. O relatório mostra os resultados completos, inclusive os limites.

## Limitações

O treinamento é majoritariamente sintético e não cobre todos os instrumentos, técnicas, salas, efeitos ou estilos. Identificar uma oitava real e distingui-la de um harmônico continua difícil. O revisor não recupera sozinho notas que o transcritor nunca propôs e não garante durações de MIDI iguais aos comandos de um instrumento que possui cauda de release. A recuperação espectral permanece opcional e pode introduzir candidatas extras.

Usar instrumentos isolados, revisar a faixa de notas e importar stems continua ajudando a controlar o resultado. As sugestões de famílias instrumentais permanecem experimentais; suas métricas da versão 1.1 dizem respeito a outro modelo e não devem ser confundidas com as métricas do revisor.

## Referências de método

- [Spotify Basic Pitch: implementação e pesos](https://github.com/spotify/basic-pitch).
- [Onsets and Frames: evidência conjunta de ataques e atividade](https://research.google/pubs/onsets-and-frames-dual-objective-piano-transcription/).
- [mir_eval: correspondência máxima e tolerâncias de avaliação](https://github.com/mir-evaluation/mir_eval/blob/main/mir_eval/transcription.py). O avaliador deste projeto é próprio e usa correspondência por altura/ataque, sem offset.
- [librosa: implementação de YIN/pYIN e decodificação temporal](https://github.com/librosa/librosa/blob/main/librosa/core/pitch.py). Auralis implementa YIN com busca Viterbi própria; não distribui nem declara implementar integralmente pYIN.
- [GeneralUser GS, Chris Collins](https://github.com/mrbumpy409/GeneralUser-GS) e [site do autor](https://www.schristiancollins.com/generaluser.php).
- [Vocadito, Bittner et al., 2021, CC BY 4.0](https://zenodo.org/records/5578807).
