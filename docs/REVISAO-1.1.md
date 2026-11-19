# MIDI Share 1.1 — alterações

## Correções

- Um JSON sem campos obrigatórios derrubava a listagem com KeyError. Registros incompletos, inválidos, excessivos ou associados a arquivo ausente/tamanho incorreto agora são ignorados e contabilizados no catálogo.
- Arquivos estáticos e MIDIs eram lidos integralmente para cada download, incluindo HEAD. O envio agora ocorre em blocos de 64 KiB; HEAD apenas envia os cabeçalhos.
- O cliente podia enviar novamente após perder a resposta de um POST já confirmado. Cada operação agora recebe um ID; repetições com os mesmos dados retornam o registro existente, inclusive após reiniciar o servidor. Conflitos recebem HTTP 409.
- Acrescentados limites de conexões e catálogo, tratamento de conexões encerradas, validação de Content-Length e publicação dos dados com flush/fsync e substituição atômica. Não se promete uma transação completa entre vários arquivos durante falta de energia.
- Validação de metaeventos musicais, incluindo andamento zero e comprimentos inválidos. O servidor e o MIDI Tab preservam running status através de metaeventos, seguindo o comportamento do Aurora e da referência Mido.

## Funções

- Envio de até 50 arquivos MIDI por fila, com resultado individual, cancelamento e repetição de pendentes recuperáveis.
- Busca por nome/origem sem diferenciar acentos ou maiúsculas e ordenação por nome, data e tamanho.
- Atualização opcional a cada 5 segundos, com espera maior após falhas e pausa quando a página fica oculta ou o painel fecha.
- Abertura dos arquivos compartilhados tanto no MIDI Tab quanto no Aurora. A abertura no Aurora pede confirmação antes de substituir o projeto atual.
- Links diretos para os dois clientes, detalhes do arquivo, hash e aviso de conteúdo MIDI repetido.
- Renderização inicial de até 50 resultados, com botão para mostrar mais.
- Conferência de tamanho no recebimento e SHA-256 quando o navegador oferece crypto.subtle.

## Desempenho e organização

`servidor/server.py` contém HTTP e inicialização, `servidor/storage.py` gerencia catálogo e persistência e `servidor/midi.py` valida os dados. `web/shared/network-api.js` separa transporte da interface em `network.js`. Os metadados são reutilizados enquanto o conjunto de arquivos e suas estatísticas permanecem iguais. Consultas usam ETag/304. Os limites padrão são 2.000 entradas válidas, 512 MiB no catálogo e 32 conexões. O tamanho máximo de cada MIDI permanece 32 MiB.

## Compatibilidade e atualização

Não é preciso instalar novas bibliotecas. O mínimo técnico continua sendo Python 3.10; recomenda-se uma versão recente com suporte. Os registros válidos da versão 1.0 são aceitos sem conversão.

Para atualizar uma instalação, encerre o servidor antigo e faça uma cópia de segurança de `dados/midis`. Extraia a nova versão em outra pasta e copie os arquivos de `dados/midis` para o diretório correspondente, ou use `python iniciar.py --data "CAMINHO-DA-PASTA-ANTIGA/dados/midis"`. Execute apenas um servidor por pasta de dados: os locks são internos ao processo, sem coordenação entre processos.

A fila pendente fica na memória da página. Recarregar ou fechar a aba descarta seus IDs e arquivos pendentes. Repetir pendentes confirma a operação dentro dessa sessão; não existe recuperação automática da fila após fechar o navegador. A atualização é por consulta periódica, sem sincronização de áudio ou edição colaborativa.
