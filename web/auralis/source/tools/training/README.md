# Treino opcional de Auralis Timbre

O aplicativo pronto já contém os pesos. Estes passos destinam-se a quem quiser reproduzir o treinamento, em Linux com Python 3, NumPy e GCC. Não são necessários para abrir index.html.

1. Execute `python3 fetch-font.py` nesta pasta. Baixa FluidR3_GM.sf2 do release oficial preservado, confere tamanho e SHA-256. O download é de cerca de 148 MB.
2. Compile o renderizador: `gcc -O3 -shared -fPIC render.c -lm -o render.so`. O cabeçalho TinySoundFont está incluído com sua licença MIT.
3. Execute `OPENBLAS_NUM_THREADS=1 python3 generate.py`. Escreve dense-features.npy e dense-meta.json nesta pasta.
4. Execute `OPENBLAS_NUM_THREADS=1 python3 train.py`. Atualiza src/timbre-model.js e grava timbre-metrics.json.
5. Recompile o aplicativo com `npm run build` na raiz do projeto.

A extração Python foi comparada com src/timbre-features.js no desenvolvimento. A validação reserva alturas inteiras (MIDI módulo 4 igual a 1), incluindo todas as variações da altura; programas e soundfont são compartilhados. A métrica não mede gravações reais. Veja docs/MODELO-TIMBRES.md.

A redistribuição do SF2 não é necessária para usar o programa. A licença FluidR3 está em docs/licenses/FluidR3-MIT.txt. Os dados intermediários não devem ser incluídos no pacote de uso.
