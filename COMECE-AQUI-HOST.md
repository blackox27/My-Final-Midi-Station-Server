# MIDI Share 2.4.0 — host pessoal e estúdio conectado

Esta atualização reúne Auralis, Aurora MIDI e MIDI Tab com uma biblioteca privada e entregas diretas entre aplicativos. Preserva as ferramentas da 2.2.1 e incorpora as correções de segurança e persistência das revisões 2.3.x.

**Seu portal:** https://blackox27.github.io/My-Final-Midi-Station-Online/

**Seu repositório:** https://github.com/blackox27/My-Final-Midi-Station-Online

## 1 Teste primeiro no próprio computador

1. Extraia TODO o ZIP em uma pasta nova.
2. Instale Python 3.10 ou superior. No Windows, habilite a opção de adicionar Python ao PATH.
3. Abra `Iniciar-Host-Windows.bat`. Em Linux/macOS: `python3 iniciar-host.py --open`.
4. O navegador abre `http://localhost:8000`. Crie uma conta com nome de usuário e senha. Não use e-mail.
5. Abra Aurora e MIDI Tab pelos links do host. Deixe as duas abas abertas.
6. No Aurora, importe `exemplos/Estudo-em-Do.mid`, ou crie uma música.
7. Abra **Estúdio conectado**, selecione **Música atual deste aplicativo** e escolha a aba MIDI Tab de destino.
8. Clique **Enviar para o aplicativo**.
9. Na aba MIDI Tab, abra **Estúdio conectado → Receber e abrir**. Confirme a abertura.
10. Abra Auralis pelo host. No MIDI Tab, envie o MIDI para a aba Auralis. O Auralis cria um novo projeto de notas.

O botão **Rede MIDI** continua oferecendo a biblioteca completa, upload em lote, download, pesquisa, ordenação, abertura por link e exclusão. O estúdio acrescenta o envio para uma ferramenta já aberta, inclusive em outro computador.

## 2 Usar pela internet sem instalar um servidor num provedor

O computador anfitrião executa a API, as contas e o disco da biblioteca. Um túnel HTTPS encaminha a conexão dos outros computadores. Não é necessário FileZilla, abrir uma porta no roteador nem cadastrar e-mail no MIDI Share.

### Preparação no Windows

1. Execute `Preparar-Host-Windows.bat` uma vez. Ele cria `.venv` e instala o Uvicorn fixado em `requirements-publico.txt`.
2. Instale **cloudflared** pelo instalador oficial: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/ . Escolha Windows 64-bit se esse for seu sistema.
3. Feche e reabra o terminal após a instalação. Confira `cloudflared --version`.
4. Execute `Iniciar-Host-Internet-Windows.bat`.
5. Aguarde o terminal mostrar **Abrir host** e **Convite pelo portal**.
6. Compartilhe o link de convite. Cada pessoa abre o link e clica em **Abrir host e entrar**. O login/cadastro acontece na página HTTPS do host.
7. Para uma pessoa acessar seus próprios MIDIs em outro aparelho, ela usa o mesmo host e a mesma conta.

Se o executável não estiver no PATH, use o caminho real no terminal:

```powershell
.venv\Scripts\python.exe iniciar-host.py --internet --open --cloudflared "C:\Ferramentas\cloudflared.exe"
```

### Linux e macOS

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-publico.txt
# Instale cloudflared pelo pacote oficial do seu sistema.
.venv/bin/python iniciar-host.py --internet --open
```

A opção utiliza Quick Tunnels comuns, sem `--allowed-mail`. A autenticação é do MIDI Share e não solicita e-mail. O túnel é temporário, não tem garantia de disponibilidade e muda de endereço quando é recriado. É uma opção para demonstração e pequenos testes, não uma promessa de hospedagem permanente.

**O computador deve ficar ligado e o terminal aberto.** Ctrl+C encerra o host. Quando criar um novo túnel, envie o novo convite. As senhas e os arquivos permanecem na mesma pasta de dados, mas é necessário entrar de novo no domínio novo. Não existe descoberta automática nem lista pública de hosts.

## 3 Atualizar seu GitHub Pages

O ZIP do sistema contém `site-publico/` pronto. O pacote separado **Portal-GitHub-Pages-v2.4.0.zip** contém somente os arquivos públicos, com `index.html` na raiz.

### Opção simples com publicação por branch

1. Extraia o ZIP do portal; não envie apenas o arquivo ZIP.
2. No seu repositório, atualize **o conteúdo** da fonte de publicação com os arquivos extraídos. Preserve as subpastas. Pelo navegador, divida os arquivos em lotes se o GitHub limitar o envio; o GitHub Desktop também permite enviar a árvore inteira.
3. Em **Settings → Pages**, confirme qual é a fonte atual. Para esta opção, escolha **Deploy from a branch**, `main` e `/ (root)`, se esses forem o branch e a pasta que você atualizou.
4. Aguarde a implantação e abra seu endereço público.
5. Abra **Minha conta** e cole o endereço HTTPS exibido pelo host.

### Opção com código completo e Actions

Se usa o código completo na raiz do repositório, mantenha `.github/workflows/pages.yml`, `ferramentas/`, `servidor/` e `web/`. Em **Settings → Pages → Source**, selecione **GitHub Actions**. Execute o workflow existente. Não misture a raiz do pacote estático com a raiz de código completo na mesma configuração.

É opcional definir `MIDISHARE_PRIVATE_URL` em **Settings → Secrets and variables → Actions → Variables**, apontando para um host HTTPS estável. Para túneis temporários, o convite ou o campo manual evita editar o repositório a cada reinício.

O site público lembra apenas o endereço do host neste navegador. Não armazena senha nem envia credenciais para a API a partir do GitHub Pages. O host entrega os três programas novamente, na mesma origem da biblioteca privada. Um projeto aberto no modo público precisa ser exportado e enviado ao host uma vez; a partir daí a troca direta ocorre no estúdio do host.

## 4 Preservar as contas e MIDIs que você já tem

A biblioteca é uma pasta persistente, não uma conta global do GitHub ou da Cloudflare. O mesmo nome em dois hosts independentes pode pertencer a pessoas diferentes.

O host novo usa `midishare-data` dentro da sua pasta de usuário por padrão. Se houver um banco existente em `dados/midis` da própria instalação, ele é reaproveitado. O caminho é mostrado no terminal.

Para reutilizar explicitamente a pasta de uma instalação 2.2.1, encerre o servidor antigo, faça backup e inicie o novo com o caminho completo:

```powershell
.venv\Scripts\python.exe iniciar-host.py --internet --open --data "C:\MIDI-Antigo\Sistema-MIDI-Distribuido\dados\midis"
```

Preserve **toda** a pasta, incluindo `contas.sqlite3`, `usuarios/` e arquivos auxiliares do SQLite, com o servidor parado. Não copie apenas os `.mid`. O esquema das entregas é criado automaticamente; os hashes das senhas existentes não são substituídos. Não execute as duas versões na mesma pasta ao mesmo tempo.

## 5 Contas e privacidade

- Usuário com 3–32 caracteres e senha com 10–128 caracteres; sem e-mail.
- Cada conta acessa apenas seus arquivos e suas conexões.
- Cada aba de destino fica vinculada à sessão que a abriu. Sair dessa sessão remove seu destino da descoberta.
- Recebimentos exigem um clique e confirmação; não substituem automaticamente um projeto aberto.
- Senhas ficam como hash PBKDF2, e cookies de sessão são HttpOnly. HTTPS protege a conexão externa.
- O operador do host administra o disco e pode acessar os arquivos nele. Não há criptografia dos arquivos em repouso.
- Para fechar novos cadastros, use `--closed-registration`.
- Recuperação sem e-mail pelo operador: `python -m servidor.contas --data "CAMINHO_DOS_DADOS" nome.usuario`. O comando pede a senha no terminal e revoga as sessões da conta.

## 6 Limites da integração musical

**Aurora:** edita e exporta MIDI pelo motor original. Abrir outro MIDI pode substituir o projeto atual; salve antes.

**Auralis:** continua transcrevendo áudio localmente e envia seu MIDI. Agora recebe MIDI como um novo projeto editável de notas, programas e tempos absolutos. A importação admite até 16 grupos de pistas, no máximo 15 canais melódicos e uma bateria, até 100 mil notas e 24 horas. Mudanças de programa podem gerar grupos separados. Arquivos mais complexos devem ser editados no Aurora. A importação não recria áudio, controladores contínuos, SysEx, bancos ou curvas de pitch bend. Reexportar do Auralis cria um novo MIDI de notas; mantenha o original na biblioteca.

**MIDI Tab:** recebe MIDI e gera sua tablatura. Ao enviar, reencaminha os bytes do MIDI originalmente carregado. Alterar afinação, dedilhado, visualização ou transposição da tablatura não reescreve esse arquivo MIDI. Projetos de tablatura sem MIDI original precisam primeiro de um MIDI carregado para esse envio.

**Estúdio:** consulta a API a cada 3 segundos com a página visível e sinaliza presença a cada 20 segundos. Um destino deixa de aparecer após 90 segundos sem presença, ou após revogação da sessão. Entregas aguardam por até uma hora; registros de confirmação são mantidos por até 24 horas, com limpeza por atividade. Há até 64 conexões registradas e 256 entregas por conta nessa janela. A biblioteca permanece disponível mesmo quando uma aba de destino fecha.

Não há edição colaborativa em tempo real, sincronização de reprodução, compartilhamento entre contas, migração automática de host ou P2P entre navegadores. As transferências passam pela API e biblioteca do host. O modelo de anfitrião é inspirado em salas de jogos; o projeto não usa EOS, Steam nem servidores do Meccha Chameleon.

## 7 Diagnóstico rápido

| Problema | O que conferir |
|---|---|
| Nenhum destino no estúdio | Abra outra ferramenta pelo mesmo host, entre na mesma conta e mantenha a aba visível por alguns segundos. |
| Conta antiga não aparece | Confira o host e a pasta `--data`. Um banco vazio cria outra instalação. |
| Túnel não inicia | Confira `cloudflared --version`, conexão de saída e ausência de configuração que impeça Quick Tunnels. |
| Endereço deixou de funcionar | Reinicie o host e compartilhe o novo convite; túneis temporários mudam de domínio. |
| Porta já utilizada | Encerre o processo antigo ou use `--port 8001`. |
| Recebimento falhou | O original está na biblioteca. Confira os limites do aplicativo e tente pelo botão Rede MIDI. |
| Pages continua antigo | Aguarde o workflow, confira a fonte selecionada e recarregue a página. |

## 8 Referências e validação

- Modelo de salas e anfitrião descrito pelo desenvolvedor do jogo: https://store.steampowered.com/app/4704690/MECCHA_CHAMELEON/
- Serviços P2P do EOS, estudados como referência e não integrados: https://dev.epicgames.com/docs/epic-online-services/multiplayer/nat-p2p-interface/p2p-guide/p2p-intro
- Quick Tunnels e seus limites: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
- Download oficial: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/
- Cabeçalhos de proxy: https://developers.cloudflare.com/fundamentals/reference/http-headers/
- GitHub Pages e fonte de publicação: https://docs.github.com/pt/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

Os testes locais verificam a API real, isolamento, repetição segura, integração entre parsers e o ciclo do host com um túnel simulado. Não houve implantação no seu repositório, abertura de túnel público real nem teste nativo dos inicializadores Windows neste ambiente. O pacote permite que você execute esses passos na sua máquina. O endereço público informado foi incorporado à configuração; seu conteúdo atual não foi alterado por esta entrega.
