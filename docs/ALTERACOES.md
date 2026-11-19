# Integração e procedência

Base atual (1.1.1): pacotes aurora-midi-2.3.0-corrigido(1).zip e MIDI-Tab-Pacote (2).zip fornecidos pelo usuário. As referências ao ZIP incompleto abaixo descrevem apenas o histórico das versões 1.0 e 1.1. A documentação do segundo identifica a versão MIDI Tab Studio 3.1.

## Arquivos acrescentados

- servidor/server.py: HTTP, rotas, validação MIDI, armazenamento e concorrência.
- web/index.html: portal com acesso aos clientes e instruções.
- web/shared/lan-compat.js: geração de UUID compatível com HTTP na rede local por crypto.getRandomValues.
- web/shared/network.js e network.css: painel de envio/listagem/recebimento, mensagens, timeout e tradução dos controles de rede conforme o idioma do aplicativo.
- web/shared/tab-bridge.js: adaptador para carregar o MIDI recebido.
- iniciar.py e scripts de inicialização: entrada portátil e abertura do portal.
- exemplos/Estudo-em-Do.mid: exemplo criado para esta demonstração.
- docs/ e tests/: documentação e testes da integração.

## Pontos alterados nos clientes

**Aurora:** web/aurora/index.html preserva o HTML autocontido enviado, adicionando os recursos de rede e `window.MidiShareAurora.exportFile()`. A chamada de criação de IDs no núcleo utiliza o adaptador UUID de rede local, evitando depender exclusivamente de crypto.randomUUID em contexto seguro. O adaptador de exportação chama `Midi.write(project)`, a mesma função da exportação MIDI existente. O envio é recusado enquanto a restauração inicial ainda não terminou. Os fontes originais e as licenças foram preservados em aurora-codigo-original/. Para reconstruir o HTML a partir dos fontes, recoloque o adaptador e as referências /shared/network.* no arquivo resultante.

**MIDI Tab:** web/midi-tab/index.html inclui os recursos de rede e o adaptador. Em assets/js/core/conversion.js, `load(file, propagateError = false)` recebe uma opção para comunicar erros ao painel de rede. O fluxo original de importação local mantém o argumento padrão. A integração verifica também se a conversão gerou páginas/notas e se a importação não foi cancelada por outra ação.

## Histórico de preservação do pacote Aurora até a revisão 1.1

O ZIP original contém entradas locais legíveis, porém não apresenta diretório central ZIP válido. Os arquivos foram recuperados a partir dos cabeçalhos locais, verificando tamanho descomprimido e CRC-32 de cada entrada. O pacote entregue foi recriado como um ZIP comum e validado separadamente.

## Licenças

As licenças, créditos, fontes e documentação dos projetos de origem permanecem no pacote. A integração utiliza esses programas como base, sem atribuir sua autoria ao aluno. O trabalho acadêmico desenvolvido aqui corresponde ao servidor e à integração de compartilhamento. A proposta deve identificar esse reaproveitamento ao ser apresentada.

## Revisão 1.1

As alterações posteriores estão descritas em REVISAO-1.1.md. O servidor foi separado em módulos HTTP, armazenamento e MIDI. O transporte JavaScript está em network-api.js. A integração do Aurora também expõe openFile(), que usa o importador original. O parser do MIDI Tab foi ajustado para preservar running status através de metaeventos. As fontes de referência em aurora-codigo-original continuam originais e não substituem o HTML integrado entregue.

## Base corrigida na revisão 1.1.1

O pacote corrigido fornecido pelo usuário substitui integralmente a base anterior. Seus 617 arquivos estão incluídos, sendo 616 preservados byte a byte e o index.html adaptado apenas para a integração de rede. Manuais e licenças da raiz também acompanham web/aurora. Os detalhes e hashes constam em ATUALIZACAO-1.1.1.md e BASE-AURORA-CORRIGIDA.json.

## Revisão 2.0

Auralis 1.2.0 incorporado integralmente, com adaptadores de exportação e cabeçalhos da sessão. Contas e sessões estão em servidor/auth.py; autorização está no servidor HTTP; o transporte inclui identidade da página e CSRF. O HTML integrado do Aurora também recebeu separação do armazenamento por UUID de conta. Veja ATUALIZACAO-2.0.md e SEGURANCA-2.0.md. As descrições anteriores sem autenticação se referem somente às versões 1.x.
