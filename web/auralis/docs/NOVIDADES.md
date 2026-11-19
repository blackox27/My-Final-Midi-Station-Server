# Auralis 1.2.0

## IA e precisão

- Nova rede compacta treinada para revisar candidatas, combinando mapas do Basic Pitch com evidência acústica. Pesos e avaliação estão no pacote; nenhum áudio do usuário foi usado nesse treinamento.
- Revisão equilibrada, opção mais seletiva contra notas extras e possibilidade de desativar o filtro. A opção seletiva também pode omitir notas válidas.
- Candidatas separadas, recuperáveis no piano roll e preservadas no projeto. Recuperação e organização participam de Desfazer/Refazer.
- Basic Pitch e o classificador de famílias conservam seus pesos anteriores. A atualização não pretende executar LLM, MT3 ou um separador de fontes.

## Outros métodos e desempenho

- YIN com múltiplos candidatos e rastreamento Viterbi, para reduzir saltos temporários de altura/oitava. Pode ser desligado nos ajustes avançados.
- Dicionário espectral ajustado à afinação estimada somente quando a estimativa é estável.
- Cache compacto das ativações espectrais e de dicionários: mudar sensibilidade ou duração não repete o ajuste NNLS da camada ativa.
- O piano roll reutiliza seu índice ao atualizar apenas BPM, idioma ou posição. O histórico reduz a quantidade de estados em projetos grandes.

## Bugs corrigidos

- Sensibilidade espectral invertida e tolerância de interrupções fixa.
- Janela de análise incorreta no começo da gravação.
- Eliminação de notas repetidas legítimas muito próximas por uma regra ampla de duplicação.
- Alinhamento encurtando notas abaixo da duração mínima e deslocando suas curvas de afinação.
- Estado de pitch bend herdado pela nota seguinte; desperdício de canais em limites exatos da mesma pista.
- Deltas MIDI longos truncados; notas inválidas e intensidade ausente tratadas antes da escrita.
- Canal lateral ignorado em estéreo com oposição de fase.
- Valores não finitos de áudio substituídos antes de contaminar a análise.
- Reuso de mapas neurais com um novo array de áudio e caso vazio no decodificador detalhado.
- Projeto inválido deixando uma entrada parcialmente criada na fila.
- Seleção simples criando estados de Desfazer; cancelamento de arraste deixando edições parciais; duplo clique sobre nota existente criando duplicata.
- Reprodução retomada no meio de uma nota usando as curvas no tempo errado; eventos vencidos após atraso do agendador.
- Confirmação de exportação prematura: agora há uma indicação de arquivo preparado e um link persistente para baixar novamente.
- Arquivos de interface com identificadores de conteúdo para evitar misturar scripts antigos e novos no cache do navegador.

Veja VALIDACAO.md para os testes e REVISAO-IA.md para treinamento, métricas e limites. As famílias instrumentais continuam sendo estimadas, com edição manual.
