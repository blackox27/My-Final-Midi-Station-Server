# Correções da versão 2.2.1

- A verificação de sessão cancela consultas de páginas ocultas e ignora
  respostas antigas. Eventos de foco e abertura compartilham uma consulta.
- O painel **Rede MIDI** retoma a atualização automática ao navegar de volta.
  Transferências têm um prazo próprio, mais longo que as consultas de lista.
- Os links para Aurora e MIDI Tab preservam o MIDI selecionado quando o
  servidor acrescenta a barra à URL.
- O servidor consulta só os metadados do MIDI solicitado em downloads e
  consultas individuais. O catálogo completo é serializado e recebe um ETag
  somente quando a lista é solicitada. Metadados inválidos são descartados
  sem comprometer a biblioteca. A validação MIDI reduz alocações por evento.
- O GitHub Pages continua exibindo **Minha conta**. As credenciais são
  recebidas pelo servidor HTTPS configurado, sem uso de e-mail.

A atualização não exige migração de banco. Reuse a pasta de dados existente
e publique novamente o conteúdo de `site-publico/`. Caso use a área de conta,
gere a edição pública com o endereço HTTPS do seu servidor ou mantenha a
variável do GitHub Actions configurada.
