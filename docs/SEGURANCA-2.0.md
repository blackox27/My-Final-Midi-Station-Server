# Autenticação e isolamento — escopo da versão 2.0

## Controles implementados

- Contas locais com nomes normalizados e únicos. Não há senha padrão.
- Senhas com PBKDF2-HMAC-SHA256, 600.000 iterações, salt individual aleatório e comparação por hmac.compare_digest. O formato registra o número de iterações.
- Tokens de sessão aleatórios de 256 bits, armazenados no banco apenas como SHA-256. Cookies HttpOnly e SameSite=Strict. Secure quando o servidor usa HTTPS.
- Sessão com duração absoluta de 12 horas, expiração por 30 minutos sem atividade e limite de cinco sessões por conta. Logout revoga o token no servidor.
- Limite de tentativas por IP e combinação IP/usuário, com limite adicional de quatro cálculos de senha simultâneos.
- Validação de sessão, conta e token CSRF nos envios e no logout. Login/cadastro exigem JSON e cabeçalho próprio e rejeitam Origin externo.
- Listagens, downloads, HEAD e metadados usam o diretório da conta autenticada. Arquivos de outra conta retornam 404. Um identificador conhecido não concede acesso.
- Cabeçalho X-MIDI-User vincula as requisições dos clientes à conta da página original, impedindo uma aba antiga de enviar dados sob uma conta recém-conectada no mesmo navegador.
- Respostas privadas usam Cache-Control: no-store, private. Os contextos de sessão são inseridos nas páginas autenticadas e não ficam em URLs, localStorage ou logs.
- Aviso de troca de conta por BroadcastChannel, verificação periódica e checagem de sessão ao voltar à página. Os projetos do Aurora usam um namespace local por conta.
- Arquivos ficam fora da pasta web. Os registros legados sem dono não são atribuídos automaticamente a qualquer usuário novo.

## Limites relevantes

Autenticação e autorização não criptografam o tráfego HTTP. Em outro computador na rede, use HTTPS com certificado confiável para proteger senha, cookie e MIDI em trânsito. A opção --tls-cert/--tls-key está incluída; não são distribuídos certificados ou chaves de demonstração. O teste TLS usa exclusivamente um certificado temporário confiado pelo cliente de teste.

Os arquivos em disco e os projetos locais do navegador não são criptografados. O administrador do sistema operacional e pessoas com acesso ao perfil do navegador podem inspecionar esses dados por ferramentas externas à interface. Para uso físico compartilhado com pessoas não confiáveis, use contas/perfis separados no sistema e navegador. A separação de namespaces evita restauração acidental pela aplicação, sem prometer uma fronteira criptográfica entre pessoas que compartilham um único perfil.

Não há MFA, recuperação de senha por e-mail, edição de permissões por terceiros, antivírus de arquivos ou auditoria externa de segurança. O servidor continua destinado a uso didático em rede controlada. O cadastro é local e aberto a quem consegue acessar o servidor, limitado a 100 contas por padrão. Cotas de arquivos são por conta, e o operador deve acompanhar o espaço do disco.

## Referências primárias

- [OWASP — Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): escolha de hash adaptativo, salt e parâmetros PBKDF2.
- [OWASP — Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): tokens, cookies, expiração e revogação.
- [OWASP — CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): validação de tokens e origem em requisições que alteram estado.

Essas referências orientaram a implementação. Não representam certificação OWASP nem prova de ausência de vulnerabilidades.
