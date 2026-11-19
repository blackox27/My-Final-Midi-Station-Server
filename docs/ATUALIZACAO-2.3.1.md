# MIDI Share 2.3.1 — integridade e transferências

O servidor volta a validar a sessão depois de receber o corpo do upload,
antes de iniciar a gravação. Logout, expiração e redefinição da senha
durante essa transferência impedem a publicação do arquivo. Se o banco
não estiver acessível, retorna um erro temporário e o cliente pode repetir.

Ao carregar ou detectar mudanças nos arquivos, o catálogo compara os
bytes do MIDI com o SHA-256 registrado. Corrupção com o mesmo tamanho
não aparece como música válida. Arquivos sem mudanças usam o resultado
já verificado, evitando reler o conteúdo em cada consulta.

Uma resposta de proxy com HTML no lugar de JSON agora produz uma
mensagem compreensível. No envio de MIDI, a operação fica disponível
para repetição com o mesmo identificador, preservando a confirmação
idempotente. A tela de login também explica a resposta inválida e
libera o formulário para tentar outra vez.

As contas existentes e a configuração do alwaysdata são preservadas.
Atualize o código, reinstale as dependências se necessário e reinicie
o site mantendo MIDISHARE_DATA apontado para a mesma pasta.
