# Validação da versão 1.1.0

Data: 23 de outubro de 2026.

## Núcleo — 20 testes automatizados

`npm test` executa os 13 testes de fundamentos e codecs da versão anterior e sete verificações da atualização. Foram conferidos:

- Frequência/altura, FFT, YIN, silêncio, ataques e tríade estável sem divisões falsas nesse caso.
- Preservação de oitavas simultâneas; quantização opcional sem modificar os dados de entrada.
- Decodificação WASM real de FLAC, MP3, Ogg Vorbis e Ogg Opus gerados por FFmpeg.
- Escrita e leitura independente de MIDI com tempos físicos, programas e pistas; polifonia expressiva e preservação de notas ao exceder canais.
- Decodificador linear com notas repetidas, oitavas reais, interrupções e limite do trecho.
- Organização por timbre independente do registro; troca de motor sem transformar notas antigas em bateria.
- Cache com descarte por limite e chaves independentes da sensibilidade.
- Importação preservando pistas acima de oito e metadados instrumentais; sanitização de valores não finitos.
- MIDI expressivo com pistas de instrumentos separadas e nomes/programas recuperados por leitor independente; rejeição de excesso de canais melódicos.
- Probabilidades de timbre finitas e normalizadas; escolha explícita de Material prevalecendo sobre a estimativa.
- YIN acelerado em MIDI 40/84 e preservação da faixa aguda em MIDI 108.

Os testes não medem a fidelidade em gravações comerciais.

## Inferência neural real e tempo

Os pesos reais de Basic Pitch foram executados, com três alturas detectadas e ataques dentro da tolerância de 130 ms. A contagem de tensores permaneceu estável em 245 entre chamadas. Uma região silenciosa também foi executada.

A comparação abaixo usa exatamente a mesma amostra sintética de três segundos, o mesmo ambiente Node e a mesma versão dos pesos. A versão 1.0 foi extraída do ZIP anterior. Os arquivos completos estão em data/benchmark-baseline.json e data/benchmark-current.json.

| Execução | 1.0 CPU | 1.1 WASM/SIMD |
|---|---:|---:|
| Primeira chamada, incluindo preparo do modelo | 6.139 ms | 991 ms |
| Modelo já carregado, nova inferência | 6.015 ms | 566 ms |
| Mesmos mapas retidos, reconstrução das notas | Não disponível | 1,28 ms |

Na primeira chamada desse teste houve redução de cerca de 6,2 vezes. Esse número não é uma promessa para outros computadores, GPUs, navegadores ou gravações. A linha do cache mede apenas o reconhecimento/reconstrução, sem incluir importação, análise acústica ou interface.

Em Chrome, a demo interna de seis segundos produziu oito notas. O tempo observado numa chamada foi 1,68–1,72 s. Mudar a duração mínima ou informar Material Piano reutilizou o reconhecimento e concluiu em 0,08–0,09 s. Esses tempos incluem o fluxo da interface, mas continuam sendo testes sintéticos.

## Timbres e mixagem

O treinamento, métricas e limites estão em MODELO-TIMBRES.md. A acurácia de 97,11% ali descrita pertence a notas sintetizadas com um banco conhecido e não é um percentual de acerto deste conversor em música real.

No exemplo ensemble.flac, com oito notas conhecidas, as duas versões detectaram as mesmas 12 combinações de altura/ataque aproximado: oito eventos de referência e quatro extras. O teste não demonstra que o novo decodificador melhore a precisão; demonstra funcionamento e ausência de perda dessas alturas nesse caso. Os tempos e as durações variam entre os decodificadores.

A classificação dos trechos isolados reconheceu piano, flauta, cordas e baixo. No trecho simultâneo ocorreram atribuições extras/incorretas e timbre incerto. examples/reference.mid é a execução conhecida; examples/transcricao-automatica.mid mostra o resultado automático, sem remover os erros para a apresentação.

## Interface

- Inicialização dos scripts empacotados e backend WASM/SIMD real.
- Perfis, nova organização por instrumento estimado, programas GM, cache e tempo exibido.
- Material Piano convertendo as oito notas para a mesma família, reutilizando a IA.
- Alternância de organização por registro e por instrumento, mantendo oito notas.
- Demo interna, temas/idiomas e controles do editor.
- Verificações da versão anterior de criação, edição, desfazer, manutenção de nota manual e exportação permaneceram cobertas pelas rotas mantidas; a atualização acrescenta testes de regressão no núcleo.

A tentativa de importar a amostra externa na prévia foi bloqueada pela permissão de upload do navegador. Esse arquivo foi validado diretamente nos motores locais, sem contornar o bloqueio. Não foi confirmado o fluxo de importação de arquivos pela interface nesta revisão.

O navegador de QA usa uma prévia HTTP. A abertura direta file:// não foi exercitada nesse navegador remoto. O pacote usa scripts clássicos relativos, pesos em memória, binários WASM em data URLs e Worker em Blob; não exige fetch de arquivos locais nem CDN.

A interface confirmou a geração de MIDI, mas a captura automatizada de download expirou sem fornecer um caminho de arquivo. A escrita, leitura e separação de pistas foram verificadas diretamente nos testes do núcleo; o recebimento desse download pela prévia não foi confirmado.

## Alcance

Não foi demonstrada superioridade de fidelidade sobre MT3, YourMT3+, MuScriptor ou ferramentas comerciais. Não existe garantia de reconstrução de mixagens completas. Perfis, limiares, alinhamento e recuperação podem ajudar ou prejudicar uma gravação. As notas e as famílias devem ser revisadas; stems continuam oferecendo maior controle.
