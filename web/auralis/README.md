# Auralis — Audio to MIDI 1.2.0

Aplicativo local para transcrever áudio em MIDI, com uma IA musical pré-treinada incluída e motores clássicos complementares.

## Abrir e usar

1. Extraia **todo** o arquivo ZIP para uma pasta.
2. Abra **index.html** no Chrome ou Edge recente.
3. Clique em **Adicionar áudio**, ou experimente uma demo.
4. Escolha o material e o motor. Comece com **Híbrido** para um instrumento polifônico e **Melodia** para voz, baixo ou solo monofônico.
5. Use o perfil **Equilibrado** e a organização **Por instrumento estimado**. Clique em **Transcrever áudio**, revise as atribuições e use **Exportar MIDI**. O botão ⇩ de cada pista exporta somente aquela parte.

**Não é necessário instalar Python, Node, servidor, extensão, conta ou chave de API.** Não há dependências carregadas de CDN e o áudio não é enviado a um serviço. Os links de referências no guia são externos e opcionais.

## Novidades 1.2 — revisão de notas

Uma rede neural adicional revisa as candidatas usando evidência do transcritor e do áudio. Comece com **Equilibrada · preservar notas**. Para reduzir mais notas extras, escolha **Priorizar menos notas extras**; ela pode omitir notas válidas. **Sem filtro de revisão** conserva as propostas sem esse filtro.

O botão **Adicionar candidatas à revisão** devolve as notas separadas ao piano roll. Desfazer restaura a separação anterior. As candidatas acompanham organização, projeto JSON e reabertura; o MIDI exporta as notas que estão no editor.

YIN ganhou rastreamento temporal; o modo espectral ganhou afinação adaptativa e cache das ativações. Foram corrigidos problemas de sensibilidade, interrupções, curvas de afinação, importação, canais de áudio e edição. Os relatórios incluem 34 testes de núcleo, testes neurais reais, 20 trechos sintéticos reservados e duas gravações de voz. Veja docs/VALIDACAO.md e docs/REVISAO-IA.md para interpretar os resultados.

A identificação de instrumentos continua experimental. O novo revisor não reconstitui instrumentos ou articulações perdidos e não extrai stems de áudio.

## Otimizações mantidas da 1.1

- **Pistas por instrumento estimado** já selecionadas inicialmente; nomes, presets GM e atribuições de cada nota podem ser corrigidos. Stems preservam suas pistas.
- **Perfis Rápido, Equilibrado e Detalhado**. Equilibrado usa decodificação linear; Detalhado permite comparar com o decodificador residual original, mais lento. Nenhum perfil garante ser mais preciso em todas as gravações.
- Cache de preparo, mapas da IA e análise acústica. Mudar sensibilidade, duração mínima, faixa ou tolerância não exige repetir a IA enquanto o trecho estiver no cache. Mudar áudio, trecho, canal, normalização ou filtro invalida essa preparação; ativar bends pode exigir nova inferência.
- FFT com planos reutilizáveis, YIN com redução de amostragem filtrada, Worker DSP reutilizado e reprodução com agendamento por notas próximas.
- Correções no MIDI expressivo, importação de projetos, restauração, organização e remoção de projetos.

## O que está incluído

- Basic Pitch 1.0.1, do Spotify, com os pesos originais já treinados incorporados ao pacote.
- TensorFlow.js com WebAssembly/SIMD incluído, teste de compatibilidade do modelo e alternativas WebGL/CPU.
- Modo híbrido: IA, análise de ataques, alinhamento conservador de início e indicador de suporte espectral.
- Recuperação espectral opcional de candidatas fortes próximas a ataques; desativada por padrão porque pode aumentar falsos positivos.
- YIN para melodia monofônica e curvas de altura.
- Dicionário harmônico esparso com ajuste não negativo de ativações para polifonia simples.
- Detecção heurística de percussão em três classes: bumbo, caixa e chimbal.
- Decodificadores WebAssembly de FLAC, Ogg Vorbis, Ogg Opus e MP3/MPEG, além dos formatos aceitos pelo navegador.
- Fila de projetos; importação de até oito stems já isolados por projeto.
- Editor com seleção, arraste, ajuste de duração pela borda direita, criação por duplo clique, exclusão, desfazer e refazer.
- Intensidade, instrumento General MIDI e pista editáveis; prévia de áudio original, MIDI ou ambos.
- BPM de referência, quantização opcional, transposição e divisão por famílias de instrumentos estimadas, por registro ou em uma pista.
- Exportação de MIDI tipo 1 com múltiplas pistas, download de cada pista, CSV com timbres/evidências e projeto JSON; temas claro/escuro e PT-BR/English.

## Fidelidade e limites concretos

A transcrição é uma estimativa. Não há garantia de recuperar uma mixagem completa com os instrumentos e as articulações originais. O Basic Pitch funciona melhor com um instrumento por vez. Stems já separados costumam oferecer uma entrada mais apropriada; o programa **não inclui um separador de fontes como Demucs**.

Não foi treinado um novo LLM nem foram incluídos MT3, YourMT3+, MuScriptor ou modelos de difusão. Esses modelos não se tornam um único sistema melhor simplesmente por somar suas previsões, e os modelos maiores têm exigências de processamento, conversão e distribuição diferentes. Basic Pitch reconhece as notas. Auralis Note Reviewer avalia candidatas e permite separar eventos suspeitos. Auralis Timbre, uma pequena rede neural treinada com notas sintetizadas FluidR3, sugere 11 famílias instrumentais e uma pista incerta. Ela não recupera necessariamente o instrumento exato, nem separa fontes de áudio. Os demais motores são implementações DSP identificadas na interface e no guia.

O reconhecimento por IA cobre a faixa MIDI 21–108. Os modos disponíveis não recuperam automaticamente os presets, samples ou efeitos originais. A divisão por registro não é reconhecimento de instrumentos. O modo de percussão é heurístico e limitado às três classes indicadas.

O BPM estimado pode estar pela metade ou pelo dobro. Ele não altera os tempos das notas até que se aplique quantização. O programa começa com a quantização desativada. Um trecho selecionado mantém sua posição temporal em relação à gravação original.

Curvas de afinação são estimativas e ficam desativadas inicialmente. Na exportação expressiva, são distribuídas entre canais independentes, com faixa declarada de ±2 semitons. Se faltar canal para a polifonia, o arquivo é exportado sem bends, preservando todas as notas, e uma mensagem informa a alternativa usada. Isso não é uma implementação completa do protocolo MPE.

A prévia MIDI usa osciladores e percussão sintética simples; não é uma reprodução de soundfont dos 128 instrumentos. A escolha de instrumento é gravada corretamente no MIDI e será interpretada pelo sintetizador de destino.

Arquivos de até 256 MB podem ser selecionados, e cada trecho de análise admite até 10 minutos. O limite real de duração e canais também depende da memória do dispositivo. Em computadores modestos, analise trechos de um ou dois minutos. M4A, AAC, AIFF e outros formatos adicionais dependem do decodificador do navegador e do sistema. Mudar a extensão não converte um codec.

## Projetos e stems

**Salvar projeto** guarda notas, instrumentos, nomes de pistas, parâmetros e a transcrição original usada para restauração. O áudio não é incorporado ao JSON. Reabrir um projeto permite editar e exportar as notas sem precisar do áudio; para nova análise ou audição original, reimporte o áudio como stem nesse projeto.

**Adicionar áudio** cria projetos separados. **Adicionar stem** coloca uma parte já isolada no projeto selecionado. Os stems devem começar na mesma origem e estar alinhados. Cada stem é analisado individualmente e exportado em sua pista. O piano roll reúne as notas; a forma de onda mostra o primeiro stem.

As alterações ficam na memória da página. Salve o projeto antes de fechar ou atualizar a aba. Reaplicar organização parte da base de edição, sem acumular repetidamente a mesma transposição. Restaurar transcrição volta ao resultado da última análise, e não a uma gravação anterior do projeto.

## Atalhos

- Espaço: reproduzir/pausar fora dos campos de edição.
- Delete/Backspace: excluir a nota selecionada.
- Ctrl/Cmd+Z: desfazer; Ctrl/Cmd+Shift+Z: refazer.
- Escape: limpar seleção.
- Duplo clique no piano roll: criar uma nota.

## Estrutura

`index.html`, `assets/` e `docs/` são o aplicativo pronto. `source/` contém os fontes e testes para desenvolvimento. O guia visual está em `docs/GUIA.html` e a descrição técnica em `docs/TECNOLOGIA.md`.

## English

Extract the entire ZIP and open **index.html** in a recent Chrome or Edge. No installation, server, account or API key is required. Switch to English with the language button. The pretrained Basic Pitch model and audio decoders are bundled. All processing is local. Full mixes may produce transcription errors; isolated instruments and aligned stems are preferred. The included guide documents the engines, test scope and limitations.

Consulte docs/NOVIDADES.md, docs/MODELO-TIMBRES.md e docs/VALIDACAO.md para métodos, medições e limitações da atualização.
