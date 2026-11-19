# Atualização 1.1.1 — incorporação da base Aurora corrigida

A atualização utiliza diretamente o arquivo `aurora-midi-2.3.0-corrigido(1).zip` fornecido pelo usuário. O ZIP de origem passou pela leitura do diretório central e pela conferência CRC de todas as entradas.

## Incorporação completa

Todos os 617 arquivos do pacote foram incluídos. Os arquivos originalmente dentro de `codigo-fonte/` estão em `aurora-codigo-original/`. Os demais, incluindo HTML, manuais e a pasta `LICENCAS/`, estão em `web/aurora/`.

A comparação com a base extraída da primeira entrega identificou 57 arquivos antes ausentes e uma alteração no script de empacotamento. A atualização incorpora tanto esses arquivos quanto os demais arquivos do novo pacote, sem completar a base por suposições.

## Adaptações preservadas

O HTML do pacote corrigido foi utilizado como ponto de partida. As únicas modificações nele são as referências CSS/JavaScript da rede, o adaptador para UUID em HTTP local e `MidiShareAurora`, que chama as rotinas existentes de importação e exportação. O servidor, o MIDI Tab e as funções de compartilhamento da revisão 1.1 permanecem no sistema.

Os 616 arquivos sem adaptação mantêm exatamente seus hashes da origem. O teste de fidelidade remove as modificações declaradas do HTML integrado e verifica que seu hash volta a ser o do HTML original. O manifesto `BASE-AURORA-CORRIGIDA.json` registra origem, destino e SHA-256 de cada arquivo.

## Instalação

Extraia a versão atualizada em outra pasta e execute `Iniciar-Windows.bat`. Para conservar os envios de uma instalação anterior, encerre o servidor antigo, faça backup de `dados/midis` e copie essa pasta para a instalação atualizada, ou indique seu caminho com `--data`. Não execute dois servidores usando a mesma pasta de dados.

Os testes automatizados foram repetidos com a base corrigida. Não houve nova inspeção visual nem teste entre dois computadores físicos nesta atualização.
