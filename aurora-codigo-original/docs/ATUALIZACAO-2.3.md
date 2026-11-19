# Aurora MIDI Studio 2.3.0 — alterações

## Tradução e usabilidade

- Seletor PT-BR / English com preferência persistente no navegador. Mais de 300 entradas cobrem controles, legendas, dicas, diálogos, notificações e erros definidos pela aplicação.
- Nomes digitados/importados permanecem intactos; erros nativos do navegador podem seguir o idioma do próprio navegador.
- Manual PT-BR e inglês, ambos disponíveis sem rede, incluindo download pela ajuda do HTML autocontido.
- Cabeçalho e barra de ferramentas flexíveis, foco visível e controles extras com o estilo original do Aurora.

## Edição

- Humanização ajusta início e velocity dentro de limites configuráveis. Preserva durações e limites da música; pode ser desfeita.
- Limpeza remove notas exatamente iguais em altura, início, duração e velocity. Preserva diferenças de intensidade e de tempo. Atua na seleção ou na pista inteira.
- Duplicação de pista cria IDs independentes para notas e CC, conserva escolhas de áudio e escolhe um canal MIDI livre. Não duplica os bytes dos sons nos projetos portáteis.
- Ajustar visão enquadra a seleção ou a pista na horizontal e ajusta altura/centro das notas, respeitando limites de zoom.
- Seguir acompanha o cursor durante a reprodução. Pânico/Esc interrompe transporte e notas sustentadas. Em diálogos, Esc fecha o diálogo primeiro.
- Arquivos MIDI e projetos Aurora/PFM podem ser arrastados sobre o editor.

## Correções

1. Importador MIDI encerrava notas sem Note Off usando a maior duração já encontrada, inclusive de outras pistas. Agora usa o fim da própria pista.
2. Notas MIDI com PPQ muito alto e duração menor que a resolução do editor podiam ser rejeitadas. Agora respeitam a menor duração representável do editor.
3. End of Track com tamanho inválido e formato 0 declarando várias pistas são rejeitados com mensagem específica.
4. Leitura de RIFF MIDI `.rmi`, respeitando tamanho de contêiner/chunks e padding. Apenas SMF é importado; a interface informa a omissão de bancos/metadados externos.
5. Importações concorrentes não permitem que um pedido antigo substitua o mais recente; edições feitas durante leitura lenta são preservadas.
6. Nome do arquivo `.aurora` é capturado junto com o estado salvo, evitando usar um título posterior ao início do salvamento.
7. Velocity digitada com fração é arredondada na criação de notas, produzindo inteiros MIDI válidos.
8. Buffers de samples e seus identificadores obsoletos são liberados ao carregar estados que já não os usam. Os bytes dos arquivos continuam no armazenamento para permitir restauração/undo.
9. Mapa de compassos passa a ser reutilizado entre desenhos quando projeto, duração e fórmulas permanecem iguais, evitando reconstruí-lo a cada quadro.

10. O visor de posição agora acompanha imediatamente o clique na régua com o transporte parado.

## Organização

`src/core/`: modelo musical, MIDI e operações sobre notas. `src/audio/`: motor compartilhado de áudio. `src/storage/`: persistência e formato portátil. `src/ui/`: interface, tradução e ferramentas. `src/locales/`: catálogo inglês, com chaves em português como texto padrão. `src/styles/`: estilos. `scripts/`: build/empacotamento. `tests/`: regressões. `docs/`: pesquisa e relatório de mudanças. `vendor-source/`: fontes e licenças de terceiros.

`dist/` contém a aplicação construída nas pastas `js`, `css`, `locales` e `vendor`. O `index.html` principal do ZIP incorpora esses componentes para abrir por duplo clique sem servidor. Os fontes continuam separados e podem reconstruir esse HTML.
