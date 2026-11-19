# Exemplos sintéticos e referências

## Oito notas com instrumentos

ensemble.flac foi renderizado com TinySoundFont e FluidR3 GM: piano, flauta, violino e baixo, incluindo duas notas simultâneas no final. A licença MIT de FluidR3 está em docs/licenses/FluidR3-MIT.txt.

- reference.mid e reference.json são as oito notas enviadas ao sintetizador. São referência, não uma transcrição.
- transcricao-automatica.mid é a saída histórica 1.1, com 12 eventos.
- ensemble-balanced.mid é a saída 1.2 equilibrada, com dez eventos e duas candidatas separadas.
- ensemble-precise.mid é a saída 1.2 seletiva, com oito eventos e quatro candidatas separadas. Igualar a quantidade da referência não garante que todas as notas estejam corretas.
- ensemble.auralis.json guarda o estado equilibrado com as candidatas recuperáveis. O áudio não é incorporado ao projeto.

As caudas dos instrumentos podem durar além dos comandos note-off da referência. A identificação de famílias no trecho simultâneo pode falhar.

## Exemplo de teste reservado

mixed-review.flac é o primeiro trecho do conjunto reservado (ID 52), sintetizado com GeneralUser GS, Chris Collins. O banco não é distribuído; sua licença está em docs/licenses/GeneralUser-GS.txt.

- mixed-reference.mid e mixed-reference.json: comandos conhecidos.
- mixed-review-balanced.mid: 25 eventos mantidos, 11 candidatas separadas.
- mixed-review-precise.mid: 14 eventos mantidos, 22 candidatas separadas.
- mixed-review.auralis.json: resultado equilibrado para revisão, com as candidatas.

Os timbres atribuídos automaticamente podem divergir dos programas de referência. O exemplo não foi escolhido por ser o melhor: é o primeiro dos 20 trechos reservados.

Use Adicionar áudio para analisar o FLAC com Material Geral, motor Híbrido e perfil Equilibrado. Para abrir um projeto com áudio depois de carregar o JSON, use Adicionar stem com o FLAC correspondente. Estes exemplos não medem o acerto em músicas reais.
