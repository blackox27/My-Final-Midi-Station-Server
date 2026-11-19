# PulseForge MIDI

Editor e criador de MIDI desktop, multiplataforma, escrito em C++20 com JUCE 9.0.1.
O projeto foi desenhado para baixa latência, edição rápida e integração com
instrumentos virtuais. Esta entrega é uma base funcional (versão 0.9), não apenas
um protótipo visual.

## Recursos implementados

- Piano roll com notas representadas por posição, altura e duração.
- Ferramentas de selecionar, desenhar, apagar, mover, redimensionar, copiar,
  recortar, colar, duplicar e seleção por área.
- Até 100 operações de desfazer/refazer.
- Quantização em 1/4, 1/8, 1/16, 1/32 e tercina, com força parcial e swing.
- Zoom horizontal ancorado no cursor, zoom vertical e navegação por barras ou roda.
- Editor de velocidade por nota.
- Automações de CC1 (modulação), CC7 (volume), CC10 (pan), CC11 (expressão),
  CC64 (sustain) e pitch bend.
- Glide ascendente/descendente, renderizado como uma curva de pitch bend.
- Editor de partitura sincronizado com o piano roll e apto a inserir/apagar notas.
- Múltiplas pistas e canais MIDI, mute/solo no modelo e importação multitrilha.
- Importação e exportação Standard MIDI File (`.mid`, tipo 1, PPQ).
- Projeto próprio editável (`.pfm`, JSON legível), preservando glides e automações.
- Sintetizador polifônico interno para funcionar imediatamente, sem plug-ins.
- Hospedagem de instrumentos VST3 em Windows, macOS e Linux; Audio Unit no macOS.
- Interface nativa ou genérica para editar os parâmetros do instrumento carregado.
- Entrada de controladores/teclados MIDI conectados ao sistema.
- Renderização offline em WAV, FLAC e OGG; MP3 por meio do `ffmpeg`.

## Por que C++ e JUCE

C++20 permite controle de memória, baixo custo por bloco de áudio e compatibilidade
direta com os formatos de plug-in usados em produção. JUCE fornece uma camada madura
para áudio, MIDI, VST3/AU e interface nativa em três sistemas operacionais.

O motor usa uma linha do tempo imutável trocada atomicamente. Assim, a interface
pode editar o projeto sem bloquear o callback de áudio. Buffers são pré-alocados e
o caminho em tempo real não copia o projeto completo.

## Compilação rápida

Requisitos gerais:

- Git;
- CMake 3.24 ou superior;
- compilador com C++20;
- conexão à internet na primeira configuração, para obter o JUCE 9.0.1.

Se você já possui o JUCE localmente, passe
`-DPULSEFORGE_JUCE_PATH=/caminho/para/JUCE` e nenhuma cópia será baixada.

### Windows

Instale Visual Studio com o pacote **Desenvolvimento para Desktop com C++**, CMake e
Git. Em PowerShell:

```powershell
./scripts/build-windows.ps1
```

Ou manualmente:

```powershell
cmake -S . -B build -A x64
cmake --build build --config Release --parallel
```

O executável fica em `build/PulseForge_artefacts/Release/`.

### macOS

Instale Xcode e as Command Line Tools:

```bash
./scripts/build-macos.sh
```

O aplicativo fica em `build/PulseForge_artefacts/Release/PulseForge MIDI.app`.

### Linux (Ubuntu/Debian)

Dependências usuais do JUCE:

```bash
sudo apt update
sudo apt install build-essential cmake ninja-build git pkg-config \
  libasound2-dev libfontconfig1-dev libfreetype-dev libx11-dev \
  libxcomposite-dev libxcursor-dev libxext-dev libxinerama-dev \
  libxrandr-dev libxrender-dev libgl1-mesa-dev
```

Depois:

```bash
./scripts/build-linux.sh
```

Para MP3, instale também `ffmpeg`. WAV, FLAC e OGG não dependem dele.

## Uso básico

1. Abra o programa. O sintetizador interno já estará selecionado.
2. Escolha **Desenhar** e clique no piano roll ou na aba **Partitura**.
3. Arraste a extremidade direita da nota para mudar a duração.
4. Escolha **Selecionar** para mover notas ou marcar várias com um retângulo.
5. Selecione uma divisão e clique em **Quantizar**. `Força` conserva parte do
   deslocamento humano; `Swing` atrasa ou adianta as subdivisões ímpares.
6. Na lista da pista inferior, escolha velocidade, CC ou pitch bend e desenhe.
7. Para um instrumento externo, clique em **Carregar VST3/AU**, escolha o bundle
   do plug-in e use **Abrir instrumento** para sua interface.
8. Use **Exportar MIDI** ou **Exportar áudio**.

Atalhos dentro do piano roll:

| Ação | Atalho |
| --- | --- |
| Copiar / recortar / colar | Ctrl/Cmd+C, X, V |
| Duplicar | Ctrl/Cmd+D |
| Desfazer / refazer | Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z |
| Apagar seleção | Delete/Backspace |
| Zoom horizontal | Ctrl/Cmd + roda |
| Zoom vertical | Alt/Option + roda |
| Navegação horizontal | Shift + roda |
| Navegação vertical | Roda |

## Testes

O núcleo musical não depende do JUCE e pode ser verificado rapidamente:

```bash
g++ -std=c++20 -Wall -Wextra -Wpedantic -Isrc \
  tests/CoreTests.cpp src/MidiDocument.cpp src/Quantizer.cpp -o core-tests
./core-tests
```

Com CMake, `ctest --test-dir build --output-on-failure` executa a mesma suíte.

## Observações importantes

- Glide MIDI usa pitch bend com faixa presumida de ±2 semitons. Configure a faixa
  de pitch bend do VSTi em ±2 para o resultado esperado. Pitch bend afeta todas as
  notas do mesmo canal; para glides polifônicos independentes, distribua as vozes
  em canais diferentes ou evolua o motor para MPE.
- O editor de partitura representa e insere as notas da sequência, mas não pretende
  substituir um gravador editorial completo: ligaduras, articulações, MusicXML e
  paginação ainda não fazem parte da versão 0.9.
- A versão atual usa um andamento global constante. Arquivos com mapas complexos de
  andamento são importados usando o último evento de andamento encontrado.
- Um instrumento virtual é hospedado por vez. As pistas preservam seus canais MIDI
  e alimentam esse instrumento multitimbral; um grafo com um VSTi por pista está no
  roteiro de evolução.
- Plug-ins são código de terceiros executado dentro do processo. Carregue somente
  VST3/AU de fornecedores confiáveis.

## Licenças

O código original deste repositório está sob licença MIT (consulte `LICENSE`). JUCE
e os SDKs/formats de plug-in possuem licenças próprias. Antes de distribuir uma
versão compilada, escolha e cumpra uma licença JUCE 9 compatível com o seu projeto e
verifique as condições dos instrumentos incluídos.

Documentação oficial: [JUCE](https://juce.com/),
[repositório e releases](https://github.com/juce-framework/JUCE/releases),
[API de CMake](https://github.com/juce-framework/JUCE/blob/master/docs/CMake%20API.md).
