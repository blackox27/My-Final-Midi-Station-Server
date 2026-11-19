# Revisão 3.1 — acompanhamento sincronizado

## Novo modo

“Tocar música completa com acompanhamento” reproduz o arranjo completo e troca somente a seleção atual para o som do instrumento da tablatura. A seleção é identificada por pista e canal; sua versão original é removida da base. O usuário também pode escolher WAV ou som simples para a seleção, mantendo as outras partes nos programas MIDI.

Há três níveis independentes: volume geral, volume da seleção e volume do acompanhamento. Zerar a seleção permite tocar um instrumento real junto da base, com a animação das notas ainda ativa. Se a seleção estiver muda, um WAV ausente não impede ouvir o acompanhamento.

## Correções e verificações

- **Origem comum de tempo:** todas as partes compartilham o mapa de andamento e o relógio de áudio. A remoção do silêncio inicial da tablatura não desloca a entrada da seleção em relação à música completa. Ao ativar o modo com a reprodução parada, a música começa no início original; durante reprodução ou pausa, conserva-se a posição musical quando possível.
- **Sem duplicação:** a remoção usa a combinação de pista e canal, não somente altura ou canal. Assim, uma nota igual em outra pista continua na base, e outros canais da mesma pista continuam tocando normalmente.
- **Acompanhamento original:** transposição, quantização e afinação modificam apenas a seleção de tablatura. A base permanece nas alturas e nos tempos do MIDI. BPM fixo e velocidade de ensaio atuam sobre o relógio comum.
- **Introdução e final:** a duração do MIDI é preservada. Durante a introdução ou após a seleção terminar, o painel informa que o acompanhamento continua e não desenha notas falsas na tablatura.
- **Percussão:** notas do canal MIDI 10 na base usam síntese de bumbo, caixa, chimbal, pratos e toms. Não são convertidas em alturas de piano. É uma aproximação, não o kit original do arquivo.
- **Mistura e recursos:** a seleção tem prioridade no limite de 128 vozes. Ganhos são separados e desconectados ao parar. Amostras sintéticas da janela inicial são preparadas antes de iniciar o relógio, reduzindo atrasos de preparação.
- **Projetos:** a duração declarada do MIDI agora é restaurada, incluindo pausas finais. O modo completo e os três volumes são salvos, com valores padrão para projetos 3.0. Downloads de projeto que excederiam os limites de leitura são recusados com mensagem, evitando arquivos que não poderiam ser reabertos.
- **Limites explícitos:** até 100.000 notas no modo completo, 4.000 compassos e 100.000 pulsos de metrônomo. Uma falha ao ativar o acompanhamento conserva o modo anterior; ao desativá-lo após uma falha de conversão, a seleção pode ser gerada novamente.

## Testes executados

Os 14 testes de lógica passaram, incluindo a substituição exata da combinação pista/canal, preservação de notas iguais em outras pistas, ausência de duplicação ao selecionar todas as partes melódicas e manutenção da bateria na base.

Um teste de navegador carregou um MIDI de cinco pistas, com introdução de quatro semínimas, oboé na seleção, piano, baixo, bateria e mudança de 120 para 60 BPM. Com transposição de +12 e início da tablatura na primeira nota:

- as duas notas da seleção ficaram em 72 e 79 MIDI;
- suas entradas na música completa foram 2 s e 5 s;
- a duração original de 16 semínimas com a mudança de andamento foi 12 s;
- as dez notas da base ficaram com alturas, canais e tempos originais;
- o programa original da seleção não foi reproduzido em dobro;
- a introdução e o trecho após o fim da seleção não receberam destaques falsos;
- busca, BPM fixo, velocidade 2×, pausa, retomada e troca de pista mantiveram a posição musical;
- volumes independentes, seleção muda, percussão sem transposição e troca para som simples foram conferidos;
- projeto com acompanhamento e volumes foi salvo e restaurado;
- a duração de pausa final foi preservada na validação;
- PT-BR/EN, tema claro e tela de 390 px foram conferidos sem transbordamento horizontal;
- não houve exceções JavaScript nos cenários verificados.

A suíte de integração anterior também passou para os 21 presets, reprodução gravada, WAV, edição, projetos e exportações. Os testes de núcleo, de interface e do acompanhamento estão em `tests` e podem ser repetidos no ambiente de desenvolvimento.

## Limitações mantidas

Os instrumentos da base usam o banco compacto e as famílias de síntese já incluídas. A versão não carrega uma SoundFont original do usuário e não reproduz integralmente articulações, expressão MIDI ou curvas de pitch bend. As gravações continuam curtas e sem loops automáticos. A tablatura e sua exportação continuam referentes apenas à seleção atual. Testes específicos não garantem ausência de todos os defeitos possíveis.
