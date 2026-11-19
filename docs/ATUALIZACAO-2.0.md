# MIDI Share 2.0 — Auralis e bibliotecas privadas

O sistema agora reúne Auralis Audio–MIDI 1.2.0, Aurora MIDI corrigido e MIDI Tab. O usuário autentica-se uma vez no servidor e utiliza a mesma conta nas três interfaces. A geração e a conversão permanecem nos navegadores. O servidor recebe apenas os arquivos MIDI enviados explicitamente.

## Fluxo

1. Criar conta e entrar no portal.
2. Transcrever o áudio no Auralis ou abrir um projeto Auralis já salvo.
3. Revisar as notas e escolher Rede MIDI → Enviar música atual.
4. Abrir o resultado no Aurora para edição ou no MIDI Tab para tablatura. Os links entre aplicativos abrem outra aba para preservar o trabalho na origem.
5. Em outro computador, entrar na mesma conta para acessar esses arquivos.

Os botões existentes para envio em lote, pesquisa, ordenação, repetição de pendentes e atualização periódica continuam disponíveis. A conta não compartilha seus arquivos com outras contas: não há compartilhamento público nem permissões concedidas a terceiros nesta versão.

## Integração do Auralis

Todos os 262 arquivos do pacote fornecido foram incorporados. Apenas quatro arquivos recebem adaptações: index.html, assets/app.js, source/src/app.js e source/web/index.html. O adaptador chama o mesmo escritor MIDI da exportação original e recusa envio enquanto a análise está em andamento ou quando a transcrição não tem notas. Nome, BPM, programas, nomes de pista e a opção de expressão por pitch bend são encaminhados ao escritor existente.

O bundle distribuído e o fonte contêm a interface MidiShareAuralis.exportFile(). O bundle foi adaptado em seu escopo original, sem reconstruir ou substituir modelos, codecs, algoritmos ou dependências. O manifesto original de checksums foi preservado como SHA256SUMS-ORIGINAL.txt e um novo SHA256SUMS.txt corresponde à distribuição integrada. BASE-AURALIS.json registra os hashes da origem e quais arquivos foram adaptados.

## Contas e armazenamento

O servidor usa SQLite da biblioteca padrão para contas e sessões e conserva arquivos MIDI em diretórios separados por UUID de conta. Usuários não escolhem o diretório do arquivo. A autenticação é verificada em cada operação privada. O catálogo de outra conta nunca é carregado para depois ser ocultado no cliente.

O salvamento automático do Aurora foi separado por conta no localStorage e IndexedDB, evitando a restauração automática de projetos de outra conta pela interface normal. Não há migração automática dos checkpoints locais antigos, que não têm proprietário identificado. Os fontes originais do Aurora continuam preservados, e o HTML integrado contém as adaptações de autenticação e armazenamento.

## Atualização

Os MIDIs da versão 1.x não são publicados na biblioteca de uma conta sem uma decisão explícita do operador. O comando --import-legacy-to USUARIO copia os MIDIs legados para a conta indicada e preserva os originais. Não é possível deduzir o dono dos arquivos antigos a partir de seu formato anterior.

A inicialização segue simples: Python e Iniciar-Windows.bat. A aplicação não requer instalação de pacotes pip/npm. SQLite é usado apenas para a nova função de contas e sessões. Os limites anteriores de MIDI, transcrição e conversão continuam aplicáveis.
