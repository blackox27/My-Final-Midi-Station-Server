# Roteiro da versão 2.1 — três clientes e contas privadas

1. Execute o servidor, abra o portal e crie uma conta de demonstração. Não existe senha padrão.
2. Abra o Auralis. Para uma demonstração rápida, use Abrir projeto com web/auralis/examples/ensemble.auralis.json, que já contém notas de um exemplo. Isso demonstra a integração sem depender da duração de uma análise de áudio ao vivo.
3. Clique em Rede MIDI → Enviar música atual. Mostre o nome, a origem Auralis e o tamanho.
4. Clique em Abrir no Aurora. Confirme a substituição do projeto atual apenas depois de salvá-lo. Mostre as notas recebidas.
5. Volte à biblioteca privada e abra o mesmo MIDI no MIDI Tab para mostrar a tablatura da pista escolhida.
6. Encerre e inicie de novo o servidor com a mesma pasta de dados. No segundo computador, abra o mesmo endereço, entre com a mesma senha e confirme que a biblioteca contém o mesmo arquivo. Utilize HTTPS com certificado confiável se houver senhas reais trafegando na rede.
7. Saia da conta e crie outra conta de demonstração. Mostre que a biblioteca está vazia. Um link do MIDI da primeira conta deve retornar arquivo não encontrado para a segunda.
8. Explique que o servidor verifica a propriedade pelo diretório da sessão, sem depender de ocultar linhas da interface. O áudio foi processado no navegador, enquanto o MIDI foi transferido por HTTP/HTTPS.

A verificação de sessão protege páginas abertas após logout ou troca de conta. Salve os projetos antes de sair. Em uma interrupção de rede, o controle de sessão pode ocultar a interface até que o serviço volte, preservando o estado em memória. Isso evita continuar exibindo dados sem conseguir verificar a conta.

Para demonstrar o Auralis completo, importe um áudio curto e transcreva. O tempo de análise depende de computador, modelo e parâmetros; a geração não é instantânea nem garante reprodução exata de todos os instrumentos.

Para mostrar a versão do GitHub Pages, abra a edição pública. Baixe o MIDI
de exemplo e importe-o no Aurora ou no MIDI Tab. Explique que a edição
pública executa as ferramentas no cliente, enquanto a biblioteca privada
depende do servidor HTTPS e do disco persistente.
