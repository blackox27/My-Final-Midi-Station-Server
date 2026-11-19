# Atualização 2.1

A edição local conserva o inicializador Windows e as contas criadas no
MIDI Share 2.0. A edição para internet usa o mesmo núcleo da aplicação
com Uvicorn em loopback e Caddy para HTTPS. A edição estática para GitHub
Pages usa os mesmos aplicativos musicais com importação e exportação
local; o login e os arquivos privados ficam no servidor separado.

## Desempenho e manutenção

- A listagem reaproveita os metadados já validados de arquivos que não
  mudaram. Ao gravar um MIDI, o catálogo atualiza o registro novo sem
  fazer uma segunda varredura completa.
- O portal e as páginas de ferramentas reutilizam o HTML do disco em
  memória. Somente a identificação da sessão é inserida em cada resposta
  privada. JS, CSS e modelos estáticos são servidos sem consultar SQLite e
  podem ser revalidados por ETag.
- Downloads são transmitidos em blocos. Há limites de conexão, tempo,
  tamanho e até quatro uploads de MIDI simultâneos para conter uso de
  memória. O armazenamento continua validando o formato e a cota por conta.
- O banco ganha somente uma coluna de expiração por inatividade nas
  sessões. Os hashes existentes, UUIDs e diretórios dos usuários permanecem.
- Um gerador reúne apenas as ferramentas, recursos e documentos
  públicos para o Pages. Links relativos funcionam também sob `/repositorio/`.

O Auralis, o Aurora corrigido e o MIDI Tab preservam os respectivos
motores e os avisos de licença. A revisão não inclui replicação,
recuperação de senha por e-mail, edição simultânea do mesmo projeto
ou teste de carga em produção. A configuração de hospedagem encontra-se
em [GitHub Pages](PUBLICAR-GITHUB-PAGES.md) e [servidor HTTPS](SERVIDOR-HTTPS.md).
