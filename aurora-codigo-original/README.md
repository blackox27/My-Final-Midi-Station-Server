# Aurora MIDI Studio 2.3.0

Editor MIDI para navegador, atualizado a partir do Aurora enviado, com algoritmos e importação de projetos do PulseForge MIDI e sintetizador real SpessaSynth Core + Lib. A aplicação pronta está em `dist/`; todos os scripts de execução são locais. Não é necessário compilar para usar.

## Abrir o aplicativo

Na distribuição pronta, extraia o ZIP e abra **index.html**, na pasta principal, com duplo clique. Esse `index.html` é autocontido. Se o sistema abrir um editor de texto, use **Abrir com → Chrome/Edge**. Não há comandos, servidor ou instalação necessários para usar o aplicativo.

No repositório de desenvolvimento, o mesmo HTML autocontido é `dist/Aurora-MIDI.html`. Todos os componentes de execução estão embutidos; o banco de demonstração também funciona offline. Seus próprios SoundFonts e samples são carregados pela interface. Clique em ▶ para liberar o áudio.

A execução `file://` foi testada em Chromium 153 no Linux: dois SF2 por pistas diferentes, sample WAV, MIDI/WAV/MP3, IndexedDB e projeto portátil. Outros navegadores/sistemas não foram testados. Web MIDI externo depende de suporte e permissões; VSTi nativo continua exigindo host externo. Salve projetos `.aurora`: mover o HTML ou limpar o navegador pode separar/apagar o salvamento local.

A distribuição inclui os fontes na pasta `codigo-fonte`, para quem quiser modificar o programa. Essa pasta não é necessária para abrir o HTML. O iniciador Python continua disponível nos fontes como alternativa opcional para localhost.

## Combinar SoundFonts de arquivos diferentes

1. Clique em **Adicionar SF2 / SF3 / DLS**. Você pode selecionar vários arquivos de uma vez; o primeiro é aplicado à pista selecionada e os demais ficam disponíveis no projeto.
2. Selecione uma pista, escolha **Banco desta pista** e depois o **Preset**.
3. Em outra pista, escolha outro banco e outro preset. Ao tocar a música, os timbres serão misturados, com volume, pan, mute e solo individuais.
4. **Salvar projeto** inclui todos os bancos no `.aurora`. WAV/MP3 incluem a mistura. Arquivos `.mid` continuam contendo somente os dados MIDI.

Exemplo: piano do arquivo A na pista 1 e cordas do arquivo B na pista 2. Para sobrepor os dois na mesma melodia, copie e cole as notas entre as pistas. Adicionar um banco não muda as outras pistas. **Aplicar este banco a todas as pistas** é uma ação explícita, opcional.

Projetos antigos com um único banco são convertidos automaticamente. O novo formato de projeto exige Aurora 2.1 ou superior para manter as escolhas de vários arquivos. Até 16 bancos por projeto, 128 MB por arquivo e 180 MB de áudio no total no projeto portátil; mais bancos aumentam o uso de memória. Bancos que nenhuma pista usa como SoundFont podem ser removidos: escolha-os em uma pista, mude o timbre da pista para um sintetizador interno e use **Remover banco sem uso**.

## Novidades 2.3

Idioma PT-BR/English com preferência persistente, ferramentas de humanização, limpeza de notas duplicadas, duplicação de pista, ajuste de visão, acompanhamento do cursor e Pânico/Esc. Leitura RIFF MIDI (.rmi), importação por arrastar e correções de duração/validação MIDI. Os nomes do usuário permanecem intactos ao trocar de idioma. Veja `docs/ATUALIZACAO-2.3.md` e `docs/PESQUISA.md`.

O código mantido fica em `src/`, separado em `core`, `audio`, `storage`, `ui`, `locales` e `styles`. `scripts/build-app.cjs` gera a distribuição organizada e `build-standalone.cjs` a versão autocontida. Modifique os fontes em `src/`, depois rode `npm run build:app` para reconstruir o HTML usando os motores já compilados.

## O que está incluído

- Piano roll com 128 alturas MIDI, seleção em área, mover/redimensionar, desenhar, apagar, dividir, copiar/cortar/colar, duplicar, transpor e 100 passos de desfazer/refazer.
- Quantização com grade, força, swing e opção de quantizar finais, adaptada do PulseForge.
- Sintetizadores Web Audio, samples de áudio e SpessaSynth com até 16 bancos e escolha independente de arquivo e preset por pista.
- Velocity, automação CC1, CC7, CC10, CC11, sustain CC64 e pitch bend, glide e echo.
- Até 16 pistas, mute/solo, loop, gravação do teclado e entrada/saída Web MIDI quando disponíveis.
- Mapas de andamento e de compasso; importação MIDI preserva bancos, programas, canais e mudanças de controle.
- Partitura básica em pauta dupla, navegação por páginas e inserção de notas; impressão da página visível.
- Exportação MIDI, WAV estéreo PCM16/44,1 kHz e MP3/192 kbps, incluindo SpessaSynth e samples internos.
- Projetos `.aurora` portáteis com sons embutidos, importação do JSON antigo e do `.pfm` do PulseForge, cópia automática no navegador.

Leia `dist/LEIA-ME.txt` para atalhos, uso e limites. `MUDANCAS.md` descreve as correções. `TESTES.md` separa o que foi verificado do que ainda depende de navegador e equipamento reais.

## Limites principais

VST/VST3/AU nativos precisam de um host externo ligado por porta MIDI virtual; não são carregados pelo navegador. Áudio de um host externo não entra na exportação WAV/MP3. O banco demonstrativo contém quatro timbres sintéticos, não uma biblioteca General MIDI completa. A partitura não substitui um programa de editoração musical profissional. SF2 foi testado; SF3 e DLS usam os carregadores da biblioteca, mas não foram ensaiados com bancos de terceiros nesta entrega.

A auditoria 2.3 passou em 56 testes de componentes e 16 verificações em Chromium real, incluindo AudioWorklet, Worker, OfflineAudioContext e abertura offline do HTML. Capturas da interface foram inspecionadas. Não houve audição humana, teste com hardware MIDI, host VSTi ou navegador em aparelho móvel. Veja `TESTES.md`.

## Código e reconstrução

No ZIP, entre em `codigo-fonte` antes dos comandos abaixo.

O código da aplicação usa HTML, CSS e JavaScript, Canvas 2D, Web Audio e IndexedDB. Os componentes SpessaSynth enviados, escritos em TypeScript, são compilados por esbuild. O PulseForge original é C++/JUCE: sua hospedagem de plugins nativos não é incorporada à versão web.

Com Node.js 22+ e acesso ao registro npm na primeira instalação:

```sh
npm ci
npm run build
npm test
```

`package-lock.json` fixa as dependências. Para gerar novamente a distribuição:

```sh
python3 scripts/package-release.py aurora-midi-2.3.0.zip
```

`dist/vendor` contém os componentes já compilados. `vendor-source` inclui os fontes recebidos de SpessaSynth, o PulseForge de referência e a distribuição fixada de stb-vorbis. As alterações locais nas bibliotecas estão descritas em `THIRD-PARTY-NOTICES.txt`. A aplicação não envia projetos, samples ou bancos a serviços externos.

A suíte opcional de navegador é `node tests/browser-audit.cjs`, após instalar Playwright e seu Chromium em ambiente de desenvolvimento. `AURORA_BROWSER_PATH` pode apontar para um Chromium instalado. A execução da entrega usou Playwright 1.62.1 e Chromium 153.0.8010.0.
