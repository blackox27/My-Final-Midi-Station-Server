# Testes da versão 2.4.0

Validação atual: [TESTES-2.4.md](TESTES-2.4.md). O histórico anterior está preservado abaixo.

# Validação — MIDI Share 2.3.1

- **81 testes Python**: HTTP, TLS local, contas, permissões, uploads
  concorrentes, preservação das bases e publicação estática. A revisão
  confirma a migração de um banco 2.0, a sessão persistente, o login
  em outro cliente após reiniciar o Uvicorn, e a abertura dos recursos
  públicos sob uma URL de projeto como `/projeto-midi/`. Também verifica os links da página Minha conta e a recusa de e-mail no cadastro e no login.
- **50 testes JavaScript**: lógica musical, controle de sessão e
  integração com HTTP real em DOM simulado e retorno a uma página restaurada pelo navegador. O escritor MIDI do Auralis
  gera os bytes que os parsers do Aurora e do MIDI Tab leem no teste.
- **5 testes de empacotamento** da base corrigida do Aurora.

**Total: 136 testes aprovados.** O perfil alwaysdata foi iniciado como
subprocesso em IPv6, com os cabeçalhos do proxy simulados. Foram verificados
cadastro sem e-mail, senha persistente, restart, biblioteca por proprietário,
recusa de exclusão por outra conta, CSRF, limite de upload e fechamento
dos cadastros. Os testes também cobrem a cota global entre duas contas,
falha de exclusão, redefinição de senha e cancelamento durante uma operação.

A revisão 2.3.1 inclui regressões para logout, redefinição de senha e
expiração durante upload; corrupção MIDI sem mudança de tamanho; cache
de integridade; resposta JSON inválida; e erro de login com conexão incompleta.

As verificações de interface usaram DOM simulado e requisições HTTP.
Não houve inspeção visual em navegador completo, publicação em uma conta
real do alwaysdata, implantação no GitHub Pages, execução dos inicializadores
no Windows/macOS ou teste de carga.

## Executar os testes

Na pasta principal:

```sh
python -m pip install -r requirements-publico.txt
python -m unittest discover -s tests -p "test_*.py" -v
node --test tests/network-errors.test.cjs tests/login-links.test.cjs tests/auth-guard.test.cjs tests/network-vm.test.cjs web/midi-tab/tests/core.test.cjs aurora-codigo-original/tests/model.test.cjs aurora-codigo-original/tests/editor-tools.test.cjs
```

Para os cinco testes de empacotamento, na pasta `aurora-codigo-original`:

```sh
python -m unittest discover -s tests -p "package_release_test.py" -v
```

Node 20+ é usado nos testes JavaScript. O teste TLS local usa OpenSSL
para emitir um certificado temporário. Os testes trabalham em pastas
temporárias e não alteram a biblioteca do usuário.

## Conferência no navegador

1. Sirva `site-publico/` conforme o [guia do GitHub Pages](PUBLICAR-GITHUB-PAGES.md).
2. No Auralis, carregue a demonstração, transcreva e exporte o MIDI.
3. Abra esse arquivo no Aurora e no MIDI Tab. Nenhuma conta é exigida.
4. Para instalar no alwaysdata, siga [COMECE-AQUI-ALWAYSDATA.md](../COMECE-AQUI-ALWAYSDATA.md).
5. Para a edição com contas, siga o [roteiro de apresentação](ROTEIRO-APRESENTACAO.md).
