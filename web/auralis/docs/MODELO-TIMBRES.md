# Auralis Timbre v1 — modelo experimental

## Função

Esta rede classifica características acústicas de notas já detectadas. Ela sugere **famílias** de instrumentos; não identifica um preset exato, não reconhece todos os instrumentos reais e não separa arquivos de áudio em stems. Sua saída pode estar errada mesmo quando o indicador é alto.

Basic Pitch continua responsável por alturas e ataques. A rede de timbres não corrige uma altura errada do transcritor. Se a entrada contiver harmônicos identificados como notas falsas, eles também serão classificados.

## Dados e treinamento

- Fonte: FluidR3_GM.sf2, Frank Wen, licença MIT. SHA-256: `74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0`.
- Renderizador: TinySoundFont, MIT, executado durante a geração dos dados; o aplicativo pronto não usa o SF2 completo.
- Notas sintetizadas entre MIDI 36 e 89, em dois níveis de intensidade, com variações de início de ±25 ms, ganho e duração da janela de observação. Não foram usados áudios do usuário.
- 26,175 exemplos de treino e 9,123 de validação, contando as três variações por nota. As variações de uma mesma altura ficam no mesmo conjunto.
- Alturas reservadas para validação: 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 89. Os programas GM são conhecidos nos dois conjuntos; a avaliação testa interpolação entre alturas de **um mesmo soundfont**, não instrumentos ou gravações independentes.
- Seed 444. MLP com 101 entradas, 64 unidades ReLU e 11 saídas softmax. Treino com NumPy, minibatches balanceados, Adam, ruído nas características, dropout e regularização. Pesos armazenados em src/timbre-model.js, sem serviço remoto.
- As 101 características incluem envelopes de 16 harmônicos em três posições temporais, centróide harmônico, planicidade, relação com bandas vizinhas, evolução de energia e 14 coeficientes cepstrais por posição. A extração usa FFT de 4.096 amostras a 22.050 Hz.
- A implementação Python de extração usada no treino foi comparada com a implementação JavaScript: diferença máxima de cerca de 5,1 × 10⁻⁸ na amostra de conferência.

## Resultado e limites

A classificação forçada entre as 11 famílias obteve **97.11%** de acerto nesse conjunto sintético restrito; recall médio por família: **97.61%**. **Isso não é a precisão de transcrição do aplicativo e não estima o acerto em músicas reais ou mixagens.** O soundfont, o renderizador e os programas são compartilhados entre treino e validação. Não houve benchmark com gravações acústicas independentes.

Uma experiência anterior, menor, que reservava programas inteiros para validação, teve desempenho bem inferior, cerca de 45%. Ela não é a avaliação do modelo final, mas mostra o risco de extrapolar resultados de um banco conhecido para timbres novos.

No exemplo de oito notas em examples/, a transcrição também produz eventos falsos. Os trechos isolados permitem reconhecer as quatro famílias, enquanto o trecho simultâneo pode gerar atribuições extras ou incorretas. Os arquivos de referência permitem inspecionar isso.

As probabilidades softmax recebem temperatura 1,6 para reduzir decisões excessivamente extremas, mas não são calibradas. Se a maior saída ficar abaixo de 0,42, ou a diferença para a segunda for menor que 0,10, a nota vai para a pista de timbre incerto. Esses limiares não garantem a correção das demais notas.

Use **Material** para informar uma família conhecida numa gravação isolada. Em uma mixagem, mantenha Geral e revise a atribuição por nota. Para maior controle, importe stems obtidos separadamente e mantenha suas pistas.

## Famílias e reprodução

Piano/teclas; percussão melódica; órgão/acordeão; violão/guitarra; baixo; cordas; voz/coro; metais; palhetas; flautas; sintetizadores. Há ainda uma pista incerta e uma pista para eventos de bateria do motor de percussão.

As famílias recebem um programa GM representativo, que pode ser alterado. Isso não reconstrói o instrumento, sample, amplificador, efeito ou articulação do áudio original. A prévia continua sendo uma síntese simples.

Os scripts de reprodução do treinamento estão em source/tools/training/. O SF2 de 148 MB não está incluído; seu download é necessário apenas para retreinar. Não é necessário retreinar para abrir index.html.
