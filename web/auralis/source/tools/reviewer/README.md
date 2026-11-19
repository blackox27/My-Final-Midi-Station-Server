# Revisor de notas — reprodução opcional

O aplicativo pronto já contém os pesos. Nada nesta pasta precisa ser executado para abrir index.html. O treino usa dados sintetizados, nunca os arquivos enviados pelo usuário ao aplicativo.

Requisitos para reproduzir: Node.js 20+, dependências npm do projeto, Python 3 com NumPy, GCC e FFmpeg. Execute a partir desta pasta:

```sh
python3 fetch-inputs.py
gcc -O3 -shared -fPIC ../training/render.c -lm -o work/render.so
python3 generate.py
node collect.mjs
OPENBLAS_NUM_THREADS=1 python3 train.py
node evaluate.mjs
```

No Windows, prefira WSL para compilar o renderizador. A extração de características e a coleta de propostas usam a implementação JavaScript do próprio programa e os pesos Basic Pitch incluídos no build. Compile com npm run build antes da coleta se dist/ não existir.

fetch-inputs.py baixa FluidR3 GM e GeneralUser GS dos repositórios oficiais e confere tamanho e SHA-256. As licenças estão em docs/licenses/. O SF2 completo não faz parte do pacote. work/ é uma pasta de dados gerados, que pode ocupar algumas centenas de MB e não deve ser distribuída com o aplicativo.

generate.py usa seed 1207. Os IDs 0–39 são treino e 40–51 são validação, com FluidR3. IDs 52–71 são teste com GeneralUser e composições diferentes. collect.mjs executa Basic Pitch em três sensibilidades, sem repetir a inferência ao trocar limiares. train.py usa seed 1209 e escolhe pesos/limiares apenas em treino/validação; atualiza src/review-model.js. evaluate.mjs compara o refinamento completo com uma cópia congelada do DSP da versão 1.1. Pesos e dados do teste não são utilizados no ajuste.

Para os dois testes adicionais de voz:

```sh
python3 fetch-inputs.py --vocals
node vocals.mjs
```

Os áudios Vocadito não estão no pacote. O teste usa os números 10 e 14 e as anotações A1/A2 do registro Zenodo 5578807, CC BY 4.0, de Bittner et al. Resultados de dois trechos não são uma estimativa geral da precisão em canto.

Veja docs/REVISAO-IA.md e docs/VALIDACAO.md. As métricas ignoram duração, pedal, dinâmica e identidade instrumental. Os scripts geram relatórios em work/. A reconstrução do aplicativo pronto é feita com npm run build na raiz do projeto, após atualizar os pesos.
