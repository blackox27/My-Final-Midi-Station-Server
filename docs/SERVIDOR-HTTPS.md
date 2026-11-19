# Hospedar contas privadas com HTTPS

Para alwaysdata, use [COMECE-AQUI-ALWAYSDATA.md](../COMECE-AQUI-ALWAYSDATA.md).
As instruções de Caddy abaixo são para uma VPS própria.

A biblioteca privada é um serviço separado do GitHub Pages. Os navegadores
abrem o **mesmo endereço HTTPS**, e o servidor valida as senhas e guarda
os MIDIs no mesmo disco. A criação de contas está aberta até atingir o
limite configurado. O cadastro usa nome de usuário e senha, sem e-mail. Cada conta tem sua própria biblioteca.

## Antes de iniciar

- Tenha uma máquina ou VPS que permaneça ligada, Python 3.10+ e um domínio
  que aponte para ela. Exemplo: `midi.seudominio.com`.
- Separe um diretório **persistente e privado**, fora do código e da pasta
  web. Um exemplo em Linux é `/var/lib/midishare`, gravável apenas pelo
  usuário que roda o serviço. Use um volume persistente se o provedor
  recriar a máquina ou o contêiner.
- Para preservar contas da versão 2.0, pare o servidor antigo e copie
  **o conteúdo completo de `dados/midis`** para o novo diretório, incluindo
  `contas.sqlite3` e `usuarios/`. Se houver arquivos `-wal` e `-shm`,
  copie-os junto com o banco enquanto ele estiver fechado. Depois use
  esse diretório em `--data`. Faça backups com o serviço parado.
- Rode apenas uma instância para essa pasta. Em rede, cada computador usa
  o endereço do mesmo servidor; rodar outro servidor com um banco vazio
  cria uma instalação independente.

## Iniciar o serviço

Na pasta principal do projeto, crie um ambiente Python. Exemplo em Linux:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-publico.txt
.venv/bin/python -m servidor.publico \
  --origin https://midi.seudominio.com \
  --data /var/lib/midishare \
  --max-users 40 --max-files 200 --max-total-mib 64
```

As cotas de arquivos e MiB são por conta. Os números do exemplo podem
ser ajustados ao disco e ao número de pessoas. No Windows, use
`.venv\Scripts\python.exe` no lugar de `.venv/bin/python`.

O processo Uvicorn escuta em `127.0.0.1:8000`. O servidor verifica o
domínio e a origem dos POSTs, e a edição pública do GitHub Pages não faz
chamadas a essa API. Use apenas o endereço HTTPS externo para abrir
as ferramentas privadas.

## Ativar o HTTPS com Caddy

Instale Caddy na mesma máquina. Copie `deploy/Caddyfile.exemplo` para o
Caddyfile da instalação, substitua o domínio e inicie ou recarregue o
serviço. Se alterar `--port`, ajuste a porta no Caddyfile também.
Caddy administra o certificado e redireciona HTTP para HTTPS quando o DNS
e as portas 80 e 443 estão configurados para o domínio. Mantenha a
porta interna 8000 fora do acesso público. O Caddyfile sobrescreve o
cabeçalho de IP que o aplicativo usa para limitar tentativas de login.

Para um serviço contínuo, configure o processo Python e o Caddy para
reiniciarem automaticamente com o sistema. Confirme que o volume
persistente está disponível antes do processo Python iniciar.

Abra `https://midi.seudominio.com/`, crie uma conta de teste e envie um
MIDI. Em outro navegador, entre na mesma conta. Depois entre com uma
conta diferente e confirme que ela tem biblioteca própria. Depois habilite os botões **Entrar** e **Criar conta** na [edição pública](PUBLICAR-GITHUB-PAGES.md).

## O que a opção de sessão faz

O servidor guarda o hash da senha com salt individual em SQLite. Não
há recuperação por e-mail e o servidor não consegue mostrar a senha.
A opção **Manter a sessão neste navegador** grava só o cookie de sessão
revogável, por até 30 dias (até 7 dias sem acesso). A sessão comum vale
até 12 horas e expira após 30 minutos sem acesso ao servidor. Fechar a
aba, sozinho, não encerra a sessão; use **Sair** em aparelhos compartilhados.

As contas e os MIDIs ficam no disco do servidor. O HTTPS protege os dados
em trânsito; mantenha a pasta e as cópias de segurança protegidas pelo
sistema operacional. O operador do servidor tem acesso ao disco.

Referências: [configuração do Uvicorn](https://uvicorn.dev/settings/),
[proxy reverso do Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
e [HTTPS automático do Caddy](https://caddyserver.com/docs/automatic-https).
