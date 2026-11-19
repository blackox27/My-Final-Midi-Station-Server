# Versão 2.3.0

Veja [docs/ATUALIZACAO-2.3.md](docs/ATUALIZACAO-2.3.md) e [docs/PESQUISA.md](docs/PESQUISA.md) para mudanças e referências desta revisão.

# Aurora 2.2.0 — auditoria e abertura direta

- HTML autocontido com duplo clique; nenhum servidor ou compilação exigido.
- AudioWorklet local usa módulo data: para funcionar em file:// sem desativar segurança.
- Exportação MIDI mantém pelo menos um tick por nota; notas muito curtas não ficam presas.
- Salvamento escolhe o checkpoint mais recente e preserva a última edição ao sair da página.
- Importar projeto portátil não sobrescreve bytes de samples/SF2 usados por projetos anteriores ou histórico.
- Preparação de áudio respeita mute/solo; preview prepara a pista atual; saída MIDI externa dispensa bancos internos.
- Validação mais robusta para coleções inválidas e poly pressure; compassos 1/32 cobrem toda a duração máxima.
- Proteção contra edição durante restauração e falha síncrona na API opcional WebMCP.
- Corrigida sobreposição do nome/marca e corte de textos nos controles laterais/compactos.
- Preservados piano roll, partitura básica, quantização, gravação, CC, samples, múltiplos bancos, exportação e histórico.
- 40 testes de componentes e 12 verificações em Chromium real; limitações em TESTES.md e LEIA-ME.txt.

# Alterações do Aurora 2.1.0

- Vários arquivos SoundFont no mesmo projeto, com escolha independente de banco e preset em cada pista. Até 16 bancos; o seletor também distingue arquivos com nomes iguais.
- Carregamento de vários arquivos de uma vez, sem substituir bancos de outras pistas. Catálogo de presets funciona antes de ativar o áudio.
- Um sintetizador por arquivo usado, impedindo que presets de mesmo banco/programa se sobreponham por prioridade global.
- Reprodução, pré-escuta, CC, sustain, parada e volume roteados ao banco correto. Exportação WAV/MP3 mistura os bancos usados e respeita mute/solo.
- Salvamento portátil inclui cada banco uma vez. Migração automática de projetos antigos com banco global para referências por pista.
- Remoção de bancos sem uso, validação de referências ausentes, recuperação de seleção no desfazer e manutenção do banco anterior quando um arquivo novo é inválido.
- Cinco testes de regressão adicionais: migração, seleção/carregamento, projeto portátil, reprodução com dois SF2 reais de teste e mistura offline comparada às renderizações individuais.

# Alterações do Aurora 2.0.0

## Instrumentos e exportação

- Integração efetiva dos fontes enviados: SpessaSynth Core 4.3.22 + Lib 4.3.14. SF2/SF3/DLS, presets por pista, bancos e percussão, processamento em AudioWorklet.
- Banco SF2 demonstrativo gerado a partir de quatro formas de onda, incluído no download.
- SoundFont também é renderizado no WAV/MP3, em um Worker separado, junto dos sintetizadores e samples.
- Correção da acumulação indevida de amostras ao reutilizar buffers de exportação.
- Stop cancela notas futuras na fila do SpessaSynth e desconecta buffers de echo, evitando som residual.
- Sustain é liberado ao finalizar a exportação; o cache de samples acompanha a identidade do arquivo ao desfazer/reabrir.
- Ganho e pan atualizados na pré-escuta; preparação de sons restaurados antes de tocar notas no editor.

## MIDI e edição

- Quantização do PulseForge portada para JavaScript: força, swing e ajuste opcional dos finais.
- Importação de `.pfm`: pistas, notas, canais, automação, compasso e curvas de glide. Estado de plugins nativos não é importado.
- Parser MIDI com limites e validação; correção de comprimentos SysEx, running status e notas sobrepostas da mesma altura.
- Preservação de mapas de andamento/compasso, bancos, programas, pressão e canais. Exportação tipo 1, 960 PPQ.
- Reprodução com relógio baseado no mapa de andamento, cursor e eventos ordenados; início no meio da música recupera controladores na ordem original, incluindo RPN/NRPN.
- Cancelamento de Play duplo durante a preparação dos instrumentos; gravação separa teclas iguais de dispositivos diferentes.
- Identidades estáveis em desfazer/refazer, duplicação e gravação. Operações estruturadas validam o lote inteiro antes de alterar o projeto.
- Canvas limitado à área visível, zoom ancorado no cursor e navegação por tempo/oitavas.
- Pauta dupla com paginação; correção do controle ausente que impedia abrir a partitura.

## Projetos e entrega

- IndexedDB para metadados e áudio, com aviso quando armazenamento persistente está indisponível.
- Formato `.aurora` portátil contendo samples e banco; importação do projeto JSON anterior.
- Iniciador local, dependências de execução embutidas, fontes, licenças e testes incluídos.
- Funcionalidades anteriores mantidas: edição, sintetizadores, samples, automação, Web MIDI, gravação, MIDI/WAV/MP3, partitura, impressão e atalho estruturado opcional.
