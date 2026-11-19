# Validação 2.4.0

**159 testes aprovados:** 95 Python, 59 JavaScript e 5 de empacotamento Aurora. Nenhum teste ignorado nesta execução Linux. Logs em `docs/evidencias-2.4/`.

As suítes anteriores foram mantidas. Novos testes verificam envio entre três conexões, vínculo da conexão à sessão, isolamento entre contas, idempotência e confirmação, resposta perdida após envio/ACK, retomada após reinício, presença expirada, cotas de conexão, exclusão do MIDI antes do envio, CSRF e origem, importação de notas no Auralis pela fonte e pelo bundle integrado, tempo variável, reencaminhamento byte a byte no MIDI Tab e recusa de URLs inválidas no portal.

O host foi iniciado como processo real em modo local e em modo HTTPS com um `cloudflared` simulado. O teste criou a conta no modo local, reiniciou com a mesma pasta, entrou com a senha existente, verificou cookie Secure/__Host-, endereço externo e recusa de cabeçalhos de proxy inválidos. Não abriu túnel público nem utilizou contas de provedores.

O teste de interface usa DOM simulado com requisições a um servidor HTTP real. Não substitui inspeção visual/audio em um navegador completo. Os scripts `.bat` e a trava msvcrt não foram executados nativamente em Windows neste ambiente. Não houve publicação no repositório do usuário, ensaio de carga, teste de disponibilidade do provedor nem auditoria externa de segurança.

## Reproduzir

```sh
python -m pip install -r requirements-publico.txt
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/interop.test.cjs tests/studio-vm.test.cjs tests/network-errors.test.cjs tests/login-links.test.cjs tests/auth-guard.test.cjs tests/network-vm.test.cjs web/midi-tab/tests/core.test.cjs aurora-codigo-original/tests/model.test.cjs aurora-codigo-original/tests/editor-tools.test.cjs
```

Na pasta `aurora-codigo-original`:

```sh
python -m unittest discover -s tests -p 'package_release_test.py'
```

Node.js 20+ e OpenSSL para os testes TLS. Use diretórios temporários de teste, sem expor dados de usuários.
