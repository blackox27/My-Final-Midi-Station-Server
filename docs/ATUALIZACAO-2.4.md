# Atualização 2.4.0

- Estúdio conectado com descoberta de ferramentas da mesma conta e envio para abas já abertas, inclusive em outro aparelho.
- Fila de referências MIDI em SQLite, confirmação pelo destino, IDs idempotentes e limites de presença/histórico.
- Revalidação da sessão após receber o JSON; vínculo de cada aba à sessão; isolamento entre contas e recusa de destinos revogados.
- Recebimento MIDI no Auralis como novo projeto de notas, sem substituir uma transcrição existente; MIDI Tab reencaminha o MIDI original.
- Rede MIDI também abre MIDIs no Auralis e permite envio a partir do MIDI Tab.
- Host pessoal em Python, dados persistentes, convite apontando para o portal blackox27/My-Final-Midi-Station-Online.
- Modo local em loopback e modo de demonstração na internet por Quick Tunnel HTTPS opcional. Sem autenticação por e-mail.
- Página Minha conta com campo para endereço do host, validação de URL e lembrança apenas do endereço. O login continua na origem privada.
- Preservação das correções 2.3.x, do servidor local, dos perfis Caddy/alwaysdata e do esquema de senhas existente.

Leia COMECE-AQUI-HOST.md antes de atualizar e preserve a pasta de dados completa. As fontes, modelos musicais e licenças originais acompanham o pacote; as extensões alteram principalmente a camada de integração.
