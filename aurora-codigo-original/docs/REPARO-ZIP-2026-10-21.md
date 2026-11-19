# Reparo da distribuição ZIP — 21/10/2026

A versão é Aurora MIDI Studio 2.3.0, com correção de empacotamento. Os recursos e o HTML de execução foram preservados.

## Defeito confirmado

A cópia anterior tinha 2.778.008 bytes e começava com cabeçalhos ZIP válidos, mas terminava após o 560º arquivo. Faltavam 55 arquivos e o diretório central/registro de fim do arquivo. Python e unzip recusaram o pacote. A causa observável é truncamento; não foi possível determinar em qual etapa de produção, transferência ou disponibilização os bytes finais deixaram de ser incluídos.

Foram recuperadas 560 entradas verificadas individualmente por CRC. Os 55 arquivos faltantes pertenciam aos fontes da SpessaSynth Lib. Eles foram restaurados a partir do pacote Aurora 2.2.0 original válido. Outros 483 arquivos de terceiros, presentes em ambos os pacotes, foram comparados e eram idênticos. Nenhum arquivo da interface ou recurso da versão 2.3 foi substituído pelo da versão antiga.

O HTML autocontido reconstruído a partir dos fontes recuperados é byte a byte idêntico ao index.html recuperado da versão 2.3.0. Não houve alteração no comportamento do aplicativo nesta reparação.

## Correção no gerador

`scripts/package-release.py` grava em um arquivo temporário, fecha o ZIP, verifica sua lista de arquivos, CRC e conteúdo de cada entrada, sincroniza a gravação e então publica o nome final por renomeação atômica. Uma falha antes da publicação preserva o ZIP anterior e remove o temporário. O pacote usa ZIP Deflate normal, sem criptografia ou divisão em volumes.

## Testes executados nesta reparação

- 56 testes existentes da aplicação aprovados novamente.
- 5 testes novos do empacotamento aprovados: publicação somente após validação; interrupção simulada preservando versão anterior; validação rejeitada sem publicar; detecção de truncamento; proteção contra sobrescrever um fonte por uma saída com extensão incorreta.
- ZIP final verificado por Python e unzip e extraído integralmente, comparando os arquivos extraídos com os fontes por conteúdo.
- A cópia disponibilizada para download foi recuperada e comparada ao ZIP validado por tamanho e SHA-256.

Para executar os testes do empacotador: `python3 tests/package_release_test.py`. Para os testes da aplicação: `npm test`, após `npm ci` na pasta codigo-fonte. As 16 verificações de navegador da edição 2.3 foram executadas na revisão anterior; não foram repetidas nesta reparação, pois o HTML reconstruído é idêntico ao daquela edição.

## Uso

Extraia o pacote e abra index.html na pasta principal. A pasta codigo-fonte contém os fontes organizados; nenhum comando é necessário para usar o aplicativo.
