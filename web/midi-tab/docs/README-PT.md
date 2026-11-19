# MIDI Tab Studio 3.1

Aplicativo local de MIDI para tablatura. Abra `index.html` com a pasta `assets` ao lado. Os scripts são carregados como arquivos clássicos locais; não há CDN, chamadas a serviços, servidor ou processo de instalação.

## Recursos

- MIDI padrão tipo 0 e 1 com divisão PPQ, seleção por pista/canal e reunião das pistas melódicas.
- Busca limitada de posições, considerando a ocupação das cordas e o deslocamento da mão; execução em Worker local cancelável.
- Leitura MIDI em Worker, incluindo programas por nota, sustain compartilhado por canal entre pistas, All Notes Off e Reset All Controllers.
- Presets de 3 a 8 cordas ou ordens; edição da afinação e transposição manual. Consulte `assets/js/data/instruments.js` para os 21 presets.
- Interface e legendas das exportações em português e inglês. Os nomes de músicas/pistas são metadados do arquivo e não são traduzidos.
- Temas claro/escuro, animações opcionais, cursor, cordas ilustradas e acompanhamento da tablatura. Respeita a preferência do sistema por redução de movimento.
- Reprodução por banco compacto, programa GM da nota, WAV próprio ou tom triangular. Programas sem gravações usam famílias sintetizadas, sem promessa de reproduzir o timbre original.
- Salvar/abrir projeto e desfazer alterações de posição. Preferências de idioma, tema e animação ficam no navegador, quando o armazenamento local está disponível.

## Sons incluídos

Há 12 amostras gravadas: quatro de violão clássico, quatro de guitarra elétrica e quatro de ukulele. As versões distribuídas são recortes mono a 22.050 Hz, PCM de 16 bits, com até quatro segundos e um fade no fim quando necessário. São decodificadas apenas quando usadas. Notas entre amostras usam transposição a partir da gravação mais próxima.

As outras vozes são geradas localmente por síntese aditiva. O cache é limitado a 64 amostras sintetizadas e a reprodução a 128 vozes simultâneas, com compressor na saída. O painel de cordas é uma ilustração da execução: não é um osciloscópio do áudio.

Um WAV importado deve representar uma nota isolada. Informe sua altura original; não há identificação automática confiável da nota pelo áudio. Somente um WAV próprio fica ativo de cada vez. Alterar a altura por resampling também modifica a duração natural e o caráter do som. Não há loop automático nem carregamento SF2/SFZ. Samples internos e externos podem terminar antes de uma nota MIDI longa.

## Leitura e exportação

A primeira corda aparece no alto. Casas são números; os traços cinza representam duração. “—” indica continuação entre compassos. Números no alto acompanham os pulsos da fórmula de compasso. Os BPM são expressos em semínimas por minuto.

O PDF inclui todas as páginas em A4. É um PDF de imagens, sem texto selecionável. PNG exporta uma página por vez em 1240 × 1754 pixels; escolha a página em “Ritmo e apresentação”. A resolução da prévia é adaptada à tela e as páginas são redesenhadas na resolução completa para exportar. Animações não entram nos arquivos.

## Projetos

O `.miditab` é JSON versionado. Guarda as notas MIDI, programa por nota, mapa de andamento/compasso, configurações e posições de corda/casa. Importações são validadas antes de aplicar notas e posições, incluindo altura, duplicidade de IDs e sobreposição na mesma corda. Samples WAV não são embutidos no projeto. Salve antes de recarregar ou fechar: não há salvamento automático da composição.

## Limites e precisão

32 MB por MIDI, 20.000 notas por seleção, 4.000 compassos, 100 páginas e 150.000 entradas de notas sustentadas nos compassos. WAV: até 16 MB e 15 segundos. Projetos: até 16 MB. A busca é heurística: não garante digitação ótima nem reconstrói técnicas ausentes no MIDI. Não há banjo de quinta corda curta, trastes parciais ou geração automática de pares em oitavas. Pistas de percussão são avisadas. Tipo 2 e tempo SMPTE não são aceitos.

## Estrutura

- `assets/css`: temas e layout.
- `assets/js/core`: estado, leitura MIDI, digitação, conversão, índice da música e projetos.
- `assets/js/data`: presets de afinação e nomes General MIDI.
- `assets/js/i18n`: textos PT-BR/EN e mensagens de erro.
- `assets/js/audio`: sampler, síntese, relógio e agendamento de reprodução.
- `assets/js/ui`: desenho, animação e eventos da interface.
- `assets/js/exports`: PNG e PDF.
- `assets/samples`: banco compacto embutido e manifesto de procedência.
- `tests`: testes de lógica e integração de navegador.
- `tools/build.py`: gera a edição de um único HTML a partir destes arquivos.

## Desenvolvimento e testes

O uso normal não requer estas ferramentas. Para desenvolvimento, os testes de lógica usam Node.js (`node --test tests/core.test.cjs`). Os testes de navegador usam Playwright (`node tests/browser.test.cjs`), com Chromium instalado; `CHROMIUM_PATH` permite indicar outro binário compatível. A edição única é gerada com `python tools/build.py` na pasta superior do pacote.

Consulte [REVISAO-3.0.md](REVISAO-3.0.md), [PESQUISA.md](PESQUISA.md) e [SAMPLES.md](SAMPLES.md).

## Acompanhamento da música completa — versão 3.1

O controle “Tocar música completa com acompanhamento” troca o som da seleção atual para o instrumento da tablatura e mantém as outras partes pelos programas MIDI de cada nota. Depois de ativar, ainda é possível escolher WAV ou outro modo de som para a seleção. A pista original selecionada é excluída da base por índice de pista e canal, sem remover notas iguais de outras pistas.

Os volumes geral, da seleção e do acompanhamento são independentes e ficam no projeto. Para tocar seu instrumento de verdade com a base, reduza o volume da seleção a zero. A animação continua mostrando quando as notas deveriam ser tocadas.

Um único mapa de andamento e relógio de áudio agenda todas as partes. O início e o fim originais são mantidos, inclusive introdução e pausas finais. Remover o silêncio inicial só muda a apresentação da tablatura neste modo. Quando a seleção termina antes da música, o acompanhamento continua. A base não é transposta nem quantizada; somente a seleção segue esses ajustes. Escolher todas as pistas melódicas aplica o timbre a todas elas e preserva a percussão como base.

A bateria do canal MIDI 10 usa buffers sintetizados por família (bumbo, caixa, chimbal, pratos e toms), não alturas de piano. Os instrumentos MIDI continuam sendo os timbres gravados/aproximados do banco compacto; não se trata de emulação integral de uma SoundFont original. Mantêm-se os limites de samples curtos, sem loops. O modo completo aceita até 100.000 eventos de nota, 4.000 compassos e 100.000 pulsos de metrônomo. A saída tem limite de 128 vozes, priorizando a seleção em relação à base.

Os projetos usam o mesmo schema 3, com campos adicionais opcionais: arquivos 3.0 abrem com acompanhamento desligado. Veja [REVISAO-3.1.md](REVISAO-3.1.md).
