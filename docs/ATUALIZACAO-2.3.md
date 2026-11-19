# MIDI Share 2.3 — perfil alwaysdata

O site completo pode ser executado como User program no alwaysdata. O
inicializador usa IP/PORT da plataforma e valida os cabeçalhos de seu
proxy. Os formulários são entregues pela mesma origem da biblioteca.
Usuários entram com nome e senha; e-mails não são aceitos.

O perfil começa com 20 contas, 200 arquivos e 32 MiB por conta, até
256 MiB na pasta de dados e 8 MiB por envio. Um único processo, até
quatro threads de trabalho, uma derivação de senha por vez e um upload
por vez contêm o consumo. Os dados ficam fora do código, com o diretório
restrito ao operador. Um lock recusa duas instâncias escrevendo nele.

A biblioteca ganhou exclusão com confirmação, propriedade verificada e
proteção CSRF. As cotas globais incluem arquivos e metadados. Uma redefinição
de senha via terminal revoga as sessões da conta e não precisa de e-mail.
O operador pode fechar novos cadastros. A tela de login respeita essa opção.

Correções incluem o uso do IP original atrás do proxy para não aplicar
o limite de tentativas a todos os visitantes como se fossem uma pessoa.
O limite efetivo de upload é mostrado na interface. Cancelar uma requisição
não libera prematuramente o slot de gravação do servidor.

A edição local e a edição estática para GitHub Pages continuam no pacote.
Não houve mudança dos motores de transcrição ou síntese musical.
Veja [o guia de instalação](../COMECE-AQUI-ALWAYSDATA.md).
