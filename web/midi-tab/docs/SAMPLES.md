# Gravações e créditos

As 12 gravações distribuídas são uma seleção reduzida dos projetos abaixo, publicados sob **CC0 1.0**. O banco não inclui integralmente as bibliotecas originais. As licenças completas acompanham este diretório.

| Banco | Origem | Amostras incluídas | Crédito |
|---|---|---|---|
| Violão clássico | [Spanish Classical Guitar](https://github.com/freepats/spanish-classical-guitar) | C2, C3, C4, C5 | Roberto, FreePats; versão 2019-06-18. Gravações de violão clássico feitas em 2008. |
| Guitarra elétrica | [Electric Guitar FSBS jazz](https://github.com/freepats/electric-guitar-FSBS-jazz) | E2, E3, E4, B4, primeira tomada | FreePats; versão 2026-08-07. Guitarra elétrica Fender com variante de processamento jazz. |
| Ukulele | [Ukulele](https://github.com/freepats/ukulele1) | C4, E4, G4, C6 | Mateusz Dąbrowski / FreePats; versão 2026-08-11. Flight Fireball tenor. |

Adaptação neste pacote: mono, 22.050 Hz, PCM de 16 bits, até quatro segundos por sample, com fade de 0,2 s quando o recorte atinge quatro segundos. As notas intermediárias são reproduzidas por resampling da gravação próxima. Não foram incluídos loops SFZ, layers completos de velocidade ou round robin. Isso constitui um banco de comparação compacto, não uma reprodução integral das bibliotecas.

Os dados WAV estão embutidos em `assets/samples/bank.js` para que a leitura local funcione sem fetch ou servidor. `manifest.json` registra os arquivos de origem e seus hashes. Os demais timbres são sintetizados pelo próprio aplicativo, sem gravações externas. O usuário pode importar um WAV de sua escolha como sample único.

Páginas das bibliotecas: [violão](https://freepats.zenvoid.org/Guitar/acoustic-guitar.html), [guitarra](https://freepats.zenvoid.org/ElectricGuitar/clean-electric-guitar.html), [ukulele](https://freepats.zenvoid.org/GuitarFamily/ukulele.html). Texto da dedicação: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
