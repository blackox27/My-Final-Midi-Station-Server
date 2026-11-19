# API MIDI Share 2.4.0

A API base abaixo continua disponível. Novas rotas de integração: [API-ESTUDIO.md](API-ESTUDIO.md).


Todas as operações privadas utilizam o cookie de sessão. Os navegadores recebem o cookie no login e o enviam automaticamente na mesma origem. A aplicação não armazena senhas ou tokens de sessão no localStorage.

| Método | Rota | Função |
|---|---|---|
| GET | /api/health | Estado público do serviço |
| POST | /api/auth/register | Criar conta e iniciar sessão |
| POST | /api/auth/login | Autenticar e iniciar nova sessão |
| GET | /api/auth/session | Consultar a sessão atual |
| POST | /api/auth/logout | Revogar a sessão atual |
| GET | /api/midis | Listar apenas os MIDIs da conta |
| POST | /api/midis?name=nome.mid&source=Auralis | Enviar MIDI à conta autenticada |
| GET | /api/midis/ID/meta | Metadados de MIDI pertencente à conta |
| POST | /api/midis/ID/delete | Excluir somente MIDI da conta autenticada |
| GET | /api/midis/ID | Download de MIDI pertencente à conta |
| HEAD | Rotas GET | Cabeçalhos sem corpo |

Login/cadastro recebem JSON com `username`, `password` e `remember` (booleano opcional, padrão `false`), com o cabeçalho `X-MIDI-Share: 1`. A resposta bem-sucedida inclui user (id/username) e csrf; Set-Cookie envia um token opaco HttpOnly. Senhas não aparecem na resposta. Nome de usuário não aceita `@`, e campos fora de `username`, `password` e `remember` são rejeitados, inclusive e-mail.

Nos POSTs privados, enviar X-MIDI-Share: 1, X-MIDI-User correspondente à conta e X-CSRF-Token da sessão. Os clientes usam X-MIDI-User também nas consultas, para detectar abas de outra conta. O corpo de upload continua sendo o binário MIDI, sem multipart.

X-MIDI-Upload-ID mantém a confirmação idempotente de um envio: primeiro POST responde 201, repetição idêntica responde 200, reuso para outros dados na mesma conta responde 409. O identificador é separado por conta. O cliente não pode indicar owner ou usuário de destino para mudar a propriedade do arquivo.

401 indica sessão ausente/inválida. 403 indica CSRF/origem/cabeçalho recusado. 404 não distingue MIDI inexistente de MIDI de outra conta. 409 com code account_changed indica aba vinculada a outra conta; o cliente deve reabrir o login. 429 limita tentativas, 503 indica serviço ocupado e 507 indica cota de arquivos atingida.

Listagens usam ETag próprio da conta. Cabeçalhos de privacidade permanecem no-store, private; o cache de listagem do cliente fica apenas na memória da página. Não existe CORS aberto.

Na edição HTTPS para internet, o cookie tem o prefixo `__Host-`, sinalizadores
`Secure`, `HttpOnly` e `SameSite=Strict`. `remember: true` define
`Max-Age=2592000`; a sessão tem limite absoluto de 30 dias e limite de 7 dias
sem acesso. Sem essa opção, o cookie é da sessão do navegador e o servidor
aplica 12 horas de validade e 30 minutos sem acesso. O servidor exige que
`Origin` corresponda ao domínio HTTPS configurado nos POSTs. A edição
estática do GitHub Pages não expõe esta API.

No perfil alwaysdata, o proxy fornece `X-Forwarded-Proto` e `X-Real-IP`.
A aplicação exige HTTPS, confirma o Host configurado e aplica limites de
tentativas ao IP original. Os limites efetivos estão em `GET /api/health`;
o cadastro pode ser fechado pelo operador, mantendo os logins existentes.
A exclusão exige os mesmos cabeçalhos de origem, conta e CSRF do upload.
A resposta é `200 {"ok":true}`; IDs de outra conta retornam 404.
