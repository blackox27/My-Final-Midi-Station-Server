# Validação — Aurora MIDI Studio 2.3.0

Data: 17/10/2026. Resultado: **56 testes de componentes aprovados e 16 verificações em navegador real aprovadas**. Uma checagem independente com outros dois leitores MIDI também passou. Os resultados cobrem os cenários abaixo e não equivalem a ausência universal de bugs.

## Ambiente e execução

Node.js 24.19.0. Build completo executado a partir dos fontes: SpessaSynth Core 4.3.22 + Lib 4.3.14, banco sintético de demonstração, módulos do Aurora e HTML autocontido. Dependências do projeto fixadas em package-lock.json; as bibliotecas de execução não receberam atualização de versão nesta revisão.

Navegador: Playwright 1.62.1 com Chromium 153.0.8010.0, Linux headless. Arquivo aberto por `file://` e requisições HTTP/HTTPS bloqueadas pela suíte. As regras de origem e reprodução automática não foram desativadas; o teste clica em Reproduzir para habilitar áudio. O ambiente automatizado usa flags de execução headless/sem sandbox e renderização gráfica por software; nenhum desses ajustes é necessário para o usuário abrir o HTML.

Comandos para desenvolvimento:

```sh
npm ci
npm run build
npm test
npm run test:browser
```

A suíte de navegador exige Playwright e Chromium somente no ambiente de desenvolvimento. `AURORA_BROWSER_PATH` pode selecionar um Chromium instalado. A execução desta entrega usou o pacote de navegador do ambiente, sem adicionar dependências ao aplicativo. Para reconstruir apenas a interface com os motores já incluídos, use `npm run build:app`.

## Componentes: 56 testes

A suíte verifica validação do modelo, tempo em mapas segmentados, assinaturas, MIDI de ida/volta, running status, notas simultâneas com mesma altura, SysEx com comprimento delimitado, bancos/programas/canais/pressão/CC, notas menores que um tick, formato PFM, quantização e histórico de 100 estados.

Também verifica síntese com o Core real, integração Lib/AudioWorklet, síntese em Worker, mistura de dois arquivos SF2 independentes, PCM não silencioso, cabeçalhos WAV/MP3, sustain, cancelamento de eventos futuros e omissão de bancos silenciados na renderização.

Persistência e interface cobrem projetos portáteis com áudio exato, migração de banco único, escolha por pista, colisões de IDs, salvamento mais recente, undo de samples, mute/solo, uso de saída MIDI sem exigir sons internos e inicialização com recursos opcionais indisponíveis.

Regressões novas: fim da própria pista para notas sem Note Off; RMID com chunk desconhecido/padding e rejeição de truncamento; End of Track malformado; formato 0 com quantidade inválida de pistas; PPQ alto; humanização nos extremos da música; rejeição de NaN; limpeza restrita à seleção preservando camadas; clonagem com IDs próprios; tradução sem alterar nomes do usuário ou interpretar valores como HTML; diálogos e preferência de idioma; cache de compassos com invalidação; edição durante importação lenta; ferramentas com undo; Pânico; velocity fracionária; visor de posição ao clicar na régua com transporte parado.

O teste da interface carrega os módulos na ordem declarada no próprio HTML, para que uma referência de script ausente também cause falha na suíte.

## Navegador: 16 verificações

1. HTML autocontido inicia offline.
2. Desenho com mouse, desfazer e refazer por teclado.
3. Dois SF2 independentes com AudioWorklet real e PCM não nulo.
4. Alternância entre piano roll e partitura.
5. Salvar/reabrir projeto portátil mantendo os dois bancos.
6. Worker + OfflineAudioContext produzem WAV estéreo não silencioso.
7. Downloads de MIDI, WAV e MP3.
8. Decodificação de sample WAV junto aos SoundFonts.
9. Recarregar imediatamente preserva a última edição, bancos e sample em IndexedDB.
10. Manual PT-BR embutido pode ser baixado offline.
11. Interface em inglês, humanização, ajuste de visão, duplicação de pista e undo.
12. Manual em inglês embutido pode ser baixado offline.
13. Idioma escolhido persiste após recarregar e volta ao português.
14. Acompanhamento do cursor rola a área de notas; Esc/Pânico interrompe a reprodução.
15. Renderização em 1440, 1024 e 390 pixels de largura; controles principais acessíveis. Capturas em português e inglês inspecionadas visualmente.
16. Nenhuma exceção JavaScript não tratada e nenhuma solicitação externa durante a suíte.

O registro das verificações está em `docs/resultado-navegador.json`.

## Verificação com leitores independentes

MIDI exportado foi aceito por midi-file 1.2.4 e @tonejs/midi 2.0.28. Uma nota de dois tempos atravessando a mudança de 120 para 60 BPM foi interpretada com 1,5 s. O MIDI reexportado por Tone.js foi reaberto pelo Aurora mantendo início e duração em tempos. Os pacotes foram usados só na pesquisa; não são dependências do Aurora. Detalhes em `docs/PESQUISA.md`.

## Limites da validação

Não houve audição humana, uso de equipamento MIDI físico, host VST nativo, Safari, Firefox nem aparelho móvel real. Largura móvel foi simulada em Chromium de desktop. SF2 e o banco demonstrativo foram exercitados; SF3/DLS de terceiros não foram validados individualmente. Armazenamento, codecs e Web MIDI dependem do navegador/permissões. Partitura continua básica; SysEx, letras, MIDI tipo 2, divisão SMPTE e bancos embutidos de RMID não são preservados no modelo do editor.
