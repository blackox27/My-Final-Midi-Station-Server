# Publicar MIDI Share no GitHub Pages

O GitHub Pages entrega arquivos estáticos: HTML, CSS, JavaScript e recursos
associados. Ele não executa o servidor Python ou o SQLite do MIDI Share.
A edição pública tem a página **Minha conta**, com acesso ao cadastro e ao
login no servidor HTTPS. O formulário e a API ficam nesse servidor, pois
o GitHub orienta a não usar o Pages para o envio de senhas, mesmo sem e-mail.

Qualquer visitante pode usar Auralis, Aurora MIDI e MIDI Tab na edição pública.
Exporte um `.mid` de uma ferramenta e importe na seguinte. Para ter uma conta
e sincronizar a biblioteca em vários computadores, configure o
[servidor privado em HTTPS](SERVIDOR-HTTPS.md).

## Opção 1 — Publicar a edição pronta

1. Extraia o ZIP do MIDI Share. Abra a pasta **`site-publico`**. O
   `index.html` que está nela é a página inicial correta para o GitHub.
2. Crie um repositório **público** no GitHub, por exemplo `midi-share`.
3. Envie **o conteúdo** de `site-publico` para a raiz da branch `main`,
   incluindo `.nojekyll` e as subpastas. Pelo site, use **Add file → Upload
   files** e mantenha a estrutura ao arrastar as pastas. O GitHub limita a
   100 arquivos por envio pelo navegador; separe em dois envios, por exemplo
   primeiro `auralis/` e depois todos os demais arquivos e pastas.
4. Em **Settings → Pages**, em **Build and deployment**, escolha
   **Deploy from a branch**, selecione **`main`** e **`/ (root)`**, e salve.
5. Aguarde a publicação e abra o endereço mostrado em **Settings → Pages**.
   Para um repositório de projeto, normalmente é
   `https://SEU-USUARIO.github.io/midi-share/`. Ative **Enforce HTTPS** se a
   opção estiver disponível e ainda não estiver habilitada.
6. Abra as três ferramentas pelo portal. No Aurora e no MIDI Tab, experimente
   importar o **Estudo em Dó** disponível na página inicial.

A raiz do repositório dessa opção deve conter `index.html`, `conta.html`, `estilo.css`,
`.nojekyll`, `auralis/`, `aurora/`, `midi-tab/`, `shared/` e `exemplos/`.
A pasta `web/` pertence à edição privada.

## Opção 2 — Publicar pelo GitHub Actions

Esta opção mantém o código-fonte completo num repositório e reconstrói
o site automaticamente a cada envio para `main`.

1. Envie o código da pasta principal `Sistema-MIDI-Distribuido` para um
   repositório público. Use o `.gitignore` do projeto e confira os arquivos
   incluídos antes do primeiro commit. Preserve `.github/workflows/pages.yml`.
2. Em **Settings → Pages → Build and deployment → Source**, escolha
   **GitHub Actions**.
3. Abra **Actions → Publicar MIDI Share no GitHub Pages → Run workflow**,
   selecione `main` e execute. Depois, envios a `main` acionam a publicação.
4. O workflow gera `_site/` e envia somente essa pasta para o Pages. Abra
   **Settings → Pages** para confirmar a URL do site publicado.

O repositório é público. Mantenha `dados/`, backups, bancos SQLite, arquivos
`.env`, senhas, certificados com chave privada e MIDIs de usuários fora dos
commits. O `.gitignore` não remove arquivos que o Git já rastreava.

## Habilitar Entrar e Criar conta

Primeiro, execute a versão 2.3 do servidor privado em HTTPS. Em seguida,
configure o endereço abaixo para que **Minha conta** mostre **Entrar** e
**Criar conta**. O visitante vê o domínio de destino antes de continuar.
No servidor, ele informa um nome de usuário sem `@` e uma senha.
O cadastro recusa e-mail e não oferece recuperação por e-mail.

Para a opção 1, gere de novo o diretório local e atualize os arquivos no GitHub:

```sh
python ferramentas/build_pages.py --private-url https://midi.seudominio.com
```

Na opção 2, crie a variável **MIDISHARE_PRIVATE_URL** em
**Settings → Secrets and variables → Actions → Variables** e rode novamente
o workflow. O valor é a URL HTTPS pública do servidor, sem caminho, usuário
ou senha. Se a variável estiver vazia, o site funciona apenas com importação
e exportação local dos arquivos. Depois de entrar no servidor, use
**Rede MIDI** para guardar os arquivos de uma conta. Se já fez um MIDI
no modo público, baixe o arquivo e envie-o pelo portal privado.

Para experimentar a edição estática antes de enviar, na pasta principal:

```sh
python -m http.server 8080 --bind 127.0.0.1 --directory site-publico
```

Abra `http://localhost:8080/`. Esse comando é só para visualizar no seu
computador. O GitHub hospeda os arquivos publicados.

## Documentação oficial

- [O que é GitHub Pages?](https://docs.github.com/pt/pages/getting-started-with-github-pages/what-is-github-pages)
- [Como criar um site](https://docs.github.com/pt/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Como escolher a fonte de publicação](https://docs.github.com/pt/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Como enviar arquivos ao repositório](https://docs.github.com/pt/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
- [Como usar fluxos de trabalho personalizados](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Como habilitar HTTPS](https://docs.github.com/pt/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [Limites do serviço](https://docs.github.com/pt/pages/getting-started-with-github-pages/github-pages-limits)
