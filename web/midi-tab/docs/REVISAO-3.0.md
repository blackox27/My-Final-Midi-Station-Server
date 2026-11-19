# Revisão 3.0 — alterações e validação

## Problemas corrigidos

1. **Instrumento MIDI por nota:** a versão anterior guardava somente o último programa do canal na pista. Agora cada note-on recebe o programa ativo, inclusive quando o controle está em outra pista do mesmo canal. Isso evita trocar retrospectivamente o timbre de todas as notas.
2. **Tarefas canceladas:** a busca anterior encerrava o Worker sem encerrar sua promessa. Agora o cancelamento também resolve o ciclo pendente com rejeição controlada; resultados antigos não substituem a seleção atual. A leitura MIDI também foi movida para um Worker cancelável.
3. **Áudio de conferência limitado:** o oscilador triangular foi mantido como opção, mas a reprodução ganhou sampler, bancos gravados locais e síntese por famílias GM. A nota base do WAV é validada, e o ganho tem envelope para suavizar os inícios e fins.
4. **Navegação e animação:** a consulta linear da geometria foi substituída pelo índice do compasso atual. A animação fica numa camada separada, com mapa de notas por página e atualização aproximada a 30 quadros/s. O documento exportado não recebe os destaques transitórios.
5. **Memória das prévias:** buffers retirados da tela são liberados explicitamente. A geração sintética utiliza recorrências numéricas de osciladores e cache limitado, reduzindo chamadas trigonométricas na preparação dos sons.
6. **Perda do trabalho ao fechar:** foram acrescentados projetos versionados `.miditab`, com validação de notas, tempo, posições, altura por corda e sobreposições. Samples de áudio próprios não são embutidos, mas sua nota base é guardada. Ao restaurar um projeto, o WAV anterior é descartado para evitar tocar a gravação errada.
7. **Edição sem recuperação:** existe desfazer de até 100 alterações de posição. Mudanças de aparência e idioma preservam as posições.
8. **Interface monolítica:** HTML, CSS, MIDI, busca, desenho, áudio, traduções, dados e exportação foram separados por responsabilidade. O projeto continua abrindo por arquivo local.

## Adições

PT-BR/English nas legendas e nas exportações, temas claro/escuro, 21 presets de afinação/instrumento, três bancos gravados CC0, importação de WAV, comparação por programa MIDI, teste de som, painel de cordas e acompanhamento automático. Preferências visuais são lembradas no navegador quando possível. Há controles para desativar animações e acompanhamento, além de suporte à preferência do sistema por redução de movimento.

## Verificações executadas

- **11 testes de lógica:** running status, velocity-zero note-off, programas por nota, sustain entre pistas, controles de encerramento/reset, rejeição de dados truncados, mapa de tempo e inversão, alturas e conflitos de cordas, notas sem alcance, mudança de compasso e validade dos presets, incluindo a oitava sonora do cavaquinho.
- **Integração no Chromium com `file://`:** os 21 presets geraram tablatura; alturas posicionadas foram conferidas contra afinação + casa. Edições, desfazer, mudança de título/espaçamento/BPM, persistência de idioma/tema e layout de 390 px passaram.
- **Áudio:** bancos de violão, guitarra e ukulele decodificados e usados; modo GM conferido com programas 24 e 26 na mesma seleção. WAV C4 reproduzido em E4 com razão `2^(4/12)`. Limpeza das vozes ao parar e fluxo com redução de movimento conferidos.
- **Renderização de áudio offline:** uma nota do banco gravado foi renderizada por `OfflineAudioContext`; pico de aproximadamente 0,31 e RMS de 0,04, confirmando sinal não silencioso no cenário verificado.
- **Projetos:** ida e volta de MIDI/configuração/posições, restauração de andamento, rejeição de uma posição incompatível e preservação da nota base do WAV.
- **Exportação:** PDF identificado como A4; PNG conferido em 1240 × 1754 pixels. Exportação visualmente inspecionada sem cursores ou animações. A tradução também foi conferida nas legendas do arquivo.
- **Offline:** nenhuma requisição HTTP/HTTPS e nenhuma exceção JavaScript nos cenários automatizados. A edição organizada e a edição de HTML único foram abertas e testadas.

Um teste sintético de 1.000 notas levou aproximadamente 94 ms na busca em Worker, com nove eventos do laço principal processados durante esse intervalo. A preparação de uma amostra sintética de banjo levou cerca de 9 ms no ambiente de teste. Esses números são observações locais, não garantias para outros computadores.

## O que continua sendo aproximação

A busca de digitação é limitada e não garante uma solução profissional ótima. Os timbres fora das gravações incluídas são sintetizados; as variantes GM também podem reutilizar um banco aproximado. Não foram acrescentados um banco GM completo, SoundFonts, técnicas de articulação, curvas de pitch bend, loops automáticos ou cordas curtas especiais. Passagens extremamente densas ainda podem exigir seleção de pista, quantização ou revisão manual para ficar legíveis. Os testes não constituem garantia de ausência de todos os bugs.
