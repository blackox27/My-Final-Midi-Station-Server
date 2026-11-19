# MIDI Share 2.3.1 — instalar no alwaysdata

Esta edição hospeda **o portal, Auralis, Aurora MIDI, MIDI Tab, cadastro,
login e biblioteca privada no mesmo endereço**. Os usuários do MIDI Share
usam nome de usuário e senha, sem e-mail. O alwaysdata administra o HTTPS:
não é preciso instalar Caddy nem contratar domínio para usar o endereço
gratuito da conta.

## 1. Criar a hospedagem e enviar o projeto

Crie uma conta no [alwaysdata](https://www.alwaysdata.com/en/offers/) e
selecione **Free** para um projeto pessoal, acadêmico e sem fins lucrativos.
O cadastro na hospedagem é separado das contas dos visitantes do MIDI Share.

Substitua **CONTA** nos exemplos pelo nome da sua conta alwaysdata.

Use SFTP ou o acesso a arquivos da hospedagem para colocar o ZIP na pasta
`/home/CONTA/`. Pelo acesso SSH indicado no painel, execute:

```sh
cd /home/CONTA
unzip Sistema-MIDI-Distribuido-v2.3.1-alwaysdata.zip
cd Sistema-MIDI-Distribuido
sh Instalar-alwaysdata.sh
```

O programa fica em `/home/CONTA/Sistema-MIDI-Distribuido/`.
Se preferir enviar o ZIP já extraído, preserve toda essa pasta.

O instalador cria um ambiente `.venv` e instala o Uvicorn. Recomenda-se
Python 3.12. Se o Python padrão for antigo e 3.12 estiver disponível, execute:

```sh
PYTHON_BIN=python3.12 sh Instalar-alwaysdata.sh
```

A transcrição musical roda no navegador dos visitantes. Não é necessário
instalar TensorFlow, modelos Python, Node ou compiladores no servidor.

## 2. Criar o site no painel

Abra **Web → Sites → Add a site**. Preencha:

| Campo | Valor de exemplo |
|---|---|
| Name | MIDI Share |
| Addresses | `CONTA.alwaysdata.net` |
| Type | **User program** |
| Command | `/home/CONTA/Sistema-MIDI-Distribuido/.venv/bin/python -m servidor.alwaysdata` |
| Working directory | `/home/CONTA/Sistema-MIDI-Distribuido` |
| Environment | As duas variáveis abaixo |

Variáveis em **Environment**, com os seus valores:

```text
MIDISHARE_PUBLIC_ORIGIN=https://CONTA.alwaysdata.net
MIDISHARE_DATA=/home/CONTA/midishare-data
```

O programa usa automaticamente as variáveis **IP** e **PORT** que o
alwaysdata fornece ao site. A documentação da plataforma exige escuta em
IPv6. Não fixe a porta 8000 nem use o inicializador Windows no painel.

Ative a opção **Redirect HTTP to HTTPS** do site. Mantenha o cache HTTP
do site desativado para as páginas e APIs privadas. Salve. O endereço
utilizado por todos os visitantes será:

```text
https://CONTA.alwaysdata.net/
```

O site deve ser do tipo **User program** em **Web → Sites**. O menu
**Advanced → Services**, que é de outra categoria de execução, não é
necessário. Não configure a pasta principal do projeto como site estático
e não crie um atalho público para a pasta de dados.

## 3. Criar contas e testar

1. Abra o endereço HTTPS e clique em **Criar uma conta**.
2. Escolha um usuário de 3 a 32 caracteres, sem `@`, e senha de 10 a
   128 caracteres.
3. No Auralis ou no Aurora, abra **Rede MIDI → Enviar música atual**.
   Você também pode enviar um arquivo pelo portal.
4. Abra o arquivo no Aurora e no MIDI Tab pela biblioteca.
5. Em outro navegador ou computador, entre na mesma conta e confira a música.
6. Crie uma segunda conta: ela deve começar com biblioteca vazia.
7. O botão **Excluir** remove o MIDI da biblioteca da conta autenticada.
   Exporte uma cópia antes de excluir algo que queira preservar.

A biblioteca guarda os **MIDIs enviados ao servidor**. Áudios, samples,
SoundFonts e projetos que ficaram somente no navegador não são sincronizados
automaticamente. Salve os projetos portáteis para preservá-los.

## 4. Limites do perfil gratuito

| Recurso | Padrão do MIDI Share |
|---|---|
| Contas | Até 20 |
| Arquivos por conta | Até 200 |
| MIDIs por conta | Até 32 MiB |
| Pasta de dados do site | Até 256 MiB; inclui contas, metadados e arquivos |
| Tamanho de um envio | Até 8 MiB |
| Envios simultâneos | 1 |
| Processos do servidor | 1 |

Esses limites deixam margem para o programa, o ambiente Python e os logs na
hospedagem. Eles não garantem capacidade para muitos usuários simultâneos.
O plano Free anunciado pelo alwaysdata tem 1 GB de disco, 256 MB de RAM e
¼ de CPU; a cota da conta também pode ser usada por outros sites, e-mails,
bancos e logs. Verifique o uso no painel.

Para alterar as cotas, veja `deploy/alwaysdata.env.exemplo`. Elas são
variáveis opcionais do painel; o programa não lê esse arquivo de exemplo.
O perfil limita cada upload a no máximo 8 MiB para conter o uso de memória.

## 5. Manter usuários, senhas e arquivos

Os dados ficam em `/home/CONTA/midishare-data`, fora do código.
Atualize o programa sem apagar ou substituir essa pasta.

Para migrar de uma versão anterior, pare o servidor antigo e copie **o
conteúdo completo de `dados/midis`**, inclusive `contas.sqlite3` e
`usuarios/`, para `/home/CONTA/midishare-data`. Use somente uma instalação
escrevendo nessa pasta. Os usuários entram com as senhas existentes.

Faça backups com o site parado e guarde uma cópia fora da hospedagem.
O HTTPS protege o transporte; quem administra a conta da hospedagem
continua tendo acesso ao disco.

Para fechar novos cadastros, adicione no painel e reinicie o site:

```text
MIDISHARE_REGISTRATION_OPEN=0
```

O login das contas existentes continua funcionando. Para reabrir, use `1`.

Não há recuperação por e-mail. Se uma pessoa esquecer a senha, o operador
pode redefini-la pelo SSH:

```sh
cd /home/CONTA/Sistema-MIDI-Distribuido
.venv/bin/python -m servidor.contas --data /home/CONTA/midishare-data nome.do.usuario
```

O comando pede a senha nova de modo oculto e encerra as sessões anteriores
dessa conta. Não coloque a senha no comando, em arquivos ou no Git.

## 6. Diagnóstico

- **Site não abre:** confira **Type**, **Command**, **Working directory**,
  **Environment** e os logs em `/home/CONTA/admin/logs/sites/`.
- **Erro de IP ou porta:** use os valores de **IP** e **PORT** fornecidos
  pelo site no painel. O programa não usa as variáveis antigas
  `ALWAYSDATA_HTTPD_IP` e `ALWAYSDATA_HTTPD_PORT`.
- **Mensagem para usar HTTPS:** acesse `https://` e ative o redirecionamento
  no painel. O perfil exige os cabeçalhos do proxy do alwaysdata.
- **Erro 507:** uma cota foi atingida ou falta espaço; baixe uma cópia dos
  arquivos importantes e exclua MIDIs que não precisa.
- **Erro 503:** há outra operação ou envio em andamento; aguarde e repita.
- **Biblioteca vazia depois de atualizar:** confira `MIDISHARE_DATA`.
  Uma pasta diferente significa outro banco de contas.

Para checar a configuração pelo terminal, use as variáveis do painel.
No SSH elas podem não existir, então informe-as explicitamente, substituindo
CONTA, IP e a PORTA pelos valores do site:

```sh
IP='::' PORT='PORTA-DO-PAINEL' \
MIDISHARE_PUBLIC_ORIGIN='https://CONTA.alwaysdata.net' \
MIDISHARE_DATA='/home/CONTA/midishare-data' \
.venv/bin/python -m servidor.alwaysdata --check
```

`--check` verifica a configuração, cria a pasta de dados e inicializa o
banco se necessário, sem abrir uma segunda porta de servidor.

## Referências oficiais

- [Aplicações Python e ASGI](https://help.alwaysdata.com/en/docs/web-hosting/languages/python/configuration/)
- [Configuração de User program](https://help.alwaysdata.com/en/docs/web-hosting/sites/http-servers/user-program/)
- [Proxy HTTP e cabeçalhos](https://help.alwaysdata.com/en/docs/web-hosting/sites/http-stack/)
- [Redirecionar HTTP para HTTPS](https://help.alwaysdata.com/en/docs/web-hosting/sites/ssl-tls/redirect-http-to-https/)
- [Limites e condições dos planos](https://help.alwaysdata.com/en/docs/admin-billing/billing/public-cloud-prices/)

O perfil foi testado localmente em IPv6 com proxy simulado. A publicação
em uma conta real do alwaysdata ainda precisa ser realizada pelo responsável.
