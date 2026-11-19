# MIDI Share 2.4.0

**Comece pelo [guia do host e da troca direta](COMECE-AQUI-HOST.md).**

No Windows, abra `Iniciar-Host-Windows.bat`. Para hospedar uma demonstração pela internet, prepare o ambiente, instale cloudflared e execute `Iniciar-Host-Internet-Windows.bat`. O terminal gera um convite para https://blackox27.github.io/My-Final-Midi-Station-Online/ . Contas usam somente nome de usuário e senha e ficam no host.

Abra duas ou três ferramentas no host e use **Estúdio conectado**. O MIDI é salvo na biblioteca da conta e oferecido à ferramenta escolhida, que confirma antes de importar. Auralis também recebe MIDI; MIDI Tab reencaminha o original.

Validação: **159 testes aprovados**; veja [escopo e limitações](docs/TESTES-2.4.md).

Consulte [mudanças](docs/ATUALIZACAO-2.4.md) e [API do estúdio](docs/API-ESTUDIO.md). Os procedimentos de alwaysdata continuam disponíveis em `COMECE-AQUI-ALWAYSDATA.md`.


Um projeto de Sistemas Distribuídos que conecta três ferramentas de música:
**Auralis** transcreve áudio, **Aurora MIDI** edita a música e **MIDI Tab**
gera tablatura.

| Quero… | O que abrir |
|---|---|
| Hospedar tudo no alwaysdata | Siga [COMECE-AQUI-ALWAYSDATA.md](COMECE-AQUI-ALWAYSDATA.md). |
| Testar no Windows | Execute `Iniciar-Windows.bat` com Python 3.10+ instalado. |
| Testar no Linux/macOS | Execute `python3 iniciar.py --open`. |
| Publicar as três ferramentas no GitHub Pages | Use `site-publico/` e siga [o guia do GitHub Pages](docs/PUBLICAR-GITHUB-PAGES.md). |
| Disponibilizar contas e MIDIs privados pela internet | Configure [o servidor HTTPS separado](docs/SERVIDOR-HTTPS.md). |

No servidor privado, o Auralis pode **enviar a música atual** para a biblioteca
da conta. Abra a música no Aurora ou no MIDI Tab, inclusive em outro
computador conectado ao **mesmo servidor**. Na edição pública, a troca é feita
exportando e importando o arquivo `.mid` no próprio navegador.

No alwaysdata, o portal, login e biblioteca ficam no mesmo endereço HTTPS,
com os dados fora do código. O cadastro usa somente usuário e senha.

O GitHub Pages tem uma página **Minha conta** com as opções **Entrar** e
**Criar conta**. As opções ficam disponíveis quando o endereço do servidor
HTTPS é configurado. O cadastro usa somente nome de usuário e senha, sem
e-mail. A biblioteca guarda apenas os MIDIs que o titular envia à conta.

## Atualização de uma instalação 2.0, 2.1 ou 2.2

1. Encerre o servidor antigo e faça uma cópia da pasta `dados/midis` inteira.
2. Extraia a versão nova. Copie a pasta preservada para o mesmo lugar na
   versão nova ou inicie com `--data` apontando para a pasta que já usa.
3. Entre com o mesmo usuário e a mesma senha. O banco atualiza o esquema
   automaticamente, mantendo as contas e arquivos.

**Manter a sessão neste navegador** mantém uma sessão revogável por até
30 dias, com limite de 7 dias sem acesso ao servidor. A senha é verificada
contra um hash no banco; quem quiser salvá-la no aparelho pode usar o
gerenciador de senhas do navegador. Em um navegador novo, entre novamente
com a senha existente.

Veja também [instruções locais](LEIA-ME.txt), [relatório do trabalho](docs/TRABALHO.md),
[API](docs/API.md) e [testes](docs/TESTES.md).
