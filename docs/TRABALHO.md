# Sistema de Compartilhamento de Arquivos MIDI utilizando Arquitetura Cliente-Servidor

**Disciplina:** Sistemas Distribuídos  
**Versão atual:** 2.3

**Aluno(a):** preencher  
**Professor(a):** preencher  
**Instituição e turma:** preencher

## 1. Tema e problema

A proposta integra Auralis, que transcreve áudio em MIDI, Aurora MIDI, usado para editar músicas, e MIDI Tab, que converte partes de um MIDI em tablatura. O problema consiste em disponibilizar a música criada em um computador para a mesma pessoa em outro dispositivo, usando um servidor comum e uma conta privada.

## 2. Objetivo

Implementar um serviço simples que receba, armazene, liste e disponibilize arquivos MIDI. O Auralis e o Aurora enviam exportações do projeto atual. O MIDI Tab recebe o arquivo escolhido e utiliza seu próprio conversor para gerar a tablatura.

## 3. Arquitetura implementada

O projeto utiliza arquitetura cliente-servidor centralizada. O servidor executa em Python e atende requisições HTTP concorrentes. Cada cliente executa em um navegador independente. Para evidenciar a distribuição física, a demonstração pode utilizar dois computadores conectados à mesma rede local. Abrir duas abas no mesmo computador serve como simulação inicial, mas não demonstra comunicação entre máquinas distintas.

| Componente | Responsabilidade | Local de execução |
|---|---|---|
| Cliente Auralis | Transcrição de áudio e envio do MIDI produzido | Navegador do usuário |
| Cliente Aurora MIDI | Edição e serialização MIDI; envio do arquivo | Navegador do usuário |
| Servidor MIDI Share | API HTTP; validação MIDI; armazenamento e consulta | Computador servidor |
| Cliente MIDI Tab | Download; interpretação e conversão em tablatura | Navegador de outro usuário |

Na edição privada, as três interfaces são entregues pelo servidor e usam a mesma origem HTTP ou HTTPS. Os recursos de criação, reprodução e conversão permanecem nos clientes. O servidor não transforma MIDI em tablatura.

## 4. Comunicação e armazenamento

O cliente Aurora envia os bytes do MIDI por POST. O servidor verifica o formato e os eventos e cria um identificador único. Os arquivos ficam em uma pasta, acompanhados de metadados JSON. A listagem usa GET e retorna informações sobre os envios. Outro GET permite obter o MIDI escolhido. A interface usa requisições assíncronas com fetch e atualiza a lista quando solicitado pelo usuário ou por consultas periódicas opcionais, usando ETag para evitar retransmissões desnecessárias.

Arquivos com nomes iguais recebem identificadores diferentes. O servidor mantém os bytes sem alterações e calcula SHA-256 para verificar sua integridade nos testes. Esse hash não substitui autenticação. Os metadados são publicados após a gravação do MIDI; um lock protege as operações de leitura e escrita dentro deste processo servidor.

## 5. Requisitos funcionais

- RF01: enviar a música atual do Aurora como MIDI.
- RF02: permitir envio de um MIDI existente pela interface de rede.
- RF03: persistir arquivos e metadados no servidor.
- RF04: listar nome, data, origem declarada, tamanho e quantidade de notas.
- RF05: receber uma música no MIDI Tab e iniciar sua conversão.
- RF06: permitir download do arquivo MIDI.
- RF07: informar erros de comunicação e arquivos inválidos.

## 6. Requisitos não funcionais e limites

O servidor local requer Python 3.10 ou superior e usa a biblioteca padrão. A edição para internet usa Uvicorn e um proxy Caddy com HTTPS. Os computadores clientes precisam de um navegador moderno. Os arquivos permanecem disponíveis após reiniciar o servidor. A aplicação atende várias conexões por threads e impõe limite de 32 MiB por MIDI e um milhão de eventos na validação. A capacidade não foi dimensionada para grande número de usuários.

O compartilhamento aceita MIDI tipo 0/1 com tempo PPQ. Não inclui samples, SoundFonts, áudio, edição colaborativa nem sincronização musical entre computadores. O MIDI Tab mantém seus próprios limites e aproximações de conversão. O servidor autentica usuários e separa as bibliotecas por conta. O uso pela internet requer HTTPS. Não há replicação.

## 7. Relação com os conteúdos estudados

| Conteúdo das aulas | Aplicação e discussão |
|---|---|
| Sistemas computacionais independentes que se comunicam | Navegadores e processo servidor comunicam-se por HTTP. |
| Arquitetura centralizada cliente-servidor | O servidor concentra o repositório e responde às requisições dos clientes. |
| Componentes, conectores e dados trocados | Clientes e servidor são componentes; HTTP é o mecanismo de comunicação; MIDI e JSON são os dados transportados. |
| Arquitetura centrada em dados | O repositório central permite compartilhar músicas entre clientes. |
| Acesso a recursos e transparência | O usuário escolhe músicas por nome; a interface oculta a organização dos arquivos no servidor. |
| Abertura | O uso de HTTP e MIDI facilita a comunicação entre os aplicativos. Não se pretende implementar todos os formatos MIDI existentes. |
| Comunicação assíncrona | O cliente aguarda respostas sem bloquear todo o processamento da interface. Isso não implementa sincronização de áudio. |
| Escalabilidade e centralização | O servidor é um possível gargalo e ponto único de falha; a solução atende ao escopo didático local. |
| Falhas e premissas de rede | O servidor pode parar e a rede pode atrasar ou falhar. A interface apresenta erros e limita a espera das requisições. |

## 8. Etapas do desenvolvimento

1. Identificação das funções existentes de exportação no Aurora e importação no MIDI Tab.
2. Definição das rotas HTTP e do formato dos metadados.
3. Implementação do servidor, validação MIDI e armazenamento persistente.
4. Adição da interface de rede e dos adaptadores nos clientes.
5. Testes automatizados de comunicação, integridade, persistência e concorrência.
6. Demonstração em rede local e observação do comportamento quando o servidor é interrompido.

## 9. Resultado esperado na demonstração

Uma música enviada pelo Aurora deve aparecer na lista consultada por outro cliente. Ao recebê-la, o MIDI Tab deve gerar a tablatura da parte selecionada. Uma tentativa de atualizar a lista após encerrar o servidor deve mostrar uma mensagem de indisponibilidade. Os arquivos anteriormente recebidos continuam no cliente enquanto a página conservar esses dados.

## 10. Materiais da disciplina utilizados

- Sistemas Distribuídos — Introdução. Arquivo: aula-01_-_introducao_a_sistemas_distribuidos(1).pptx. Conceitos de sistemas independentes e comunicação.
- MAIA, Rennan. Arquiteturas de Sistemas Distribuídos. Arquivo: aula_03_-_arquitetura_de_sd(1).pptx. Arquitetura cliente-servidor, estilos arquitetônicos e repositório comum.
- MAIA, Rennan. Metas de Projeto em Sistemas Distribuídos. Arquivo: aula_04_-_metas_de_projeto(1).pptx. Acesso a recursos, transparência, abertura, escalabilidade e limitações da rede.

As datas e demais dados bibliográficos não foram informados nos materiais analisados. Complete os campos institucionais de acordo com a orientação da disciplina.

## 11. Revisão 1.1

A revisão acrescenta envio em lote, pesquisa, ordenação, atualização periódica opcional e confirmação de operações repetidas por um identificador persistente. Um mesmo ID com dados diferentes é recusado. O catálogo permanece em arquivos JSON, sem banco de dados. HTTP 304 demonstra redução de tráfego por cache; HTTP 409 demonstra conflito de uma operação repetida; HTTP 507 demonstra a recusa de novos arquivos quando a cota do catálogo é atingida. Essas funções ampliam a discussão sobre comunicação, falhas e acesso a recursos sem introduzir serviços externos.

## 12. Contas privadas e terceiro cliente (2.0)

O Auralis é o terceiro cliente e produz MIDIs a partir de áudio. Ele envia o resultado ao servidor e o usuário pode abri-lo no Aurora ou no MIDI Tab, mantendo sua conta. O servidor verifica a sessão em todas as operações privadas e escolhe o catálogo correspondente ao UUID da conta. Um usuário não escolhe o dono do arquivo por parâmetros de requisição.

A proposta acrescenta discussão sobre autenticação, autorização e isolamento entre usuários. SQLite é utilizado para contas e sessões, mantendo os arquivos MIDI em diretórios por conta. Senhas são armazenadas como hash adaptativo com salt. A aplicação oferece HTTPS por certificado próprio para proteger o transporte. O áudio continua no cliente Auralis; não é enviado para análise no servidor.

Os arquivos da versão anterior não possuem dono identificado. Sua atribuição requer importação explícita para uma conta escolhida pelo operador. O histórico de escopo e decisões das revisões 1.x foi mantido neste documento; a descrição atual das contas, da estrutura e das limitações está em ATUALIZACAO-2.0.md e SEGURANCA-2.0.md.

## 13. Continuidade e publicação (2.1)

Ao entrar no mesmo servidor com a mesma senha, outro navegador recebe uma
sessão própria e acessa a biblioteca persistente da conta. Um login optativo
de longa duração demonstra a diferença entre credenciais e sessões. O
administrador mantém a pasta de dados para que reinstalações do programa
não recriem as contas. O GitHub Pages hospeda a edição estática; a edição
com persistência exige um serviço Python separado. A separação exemplifica
a diferença entre distribuição do cliente e execução do servidor.

## 14. Entrada pelo portal público (2.2)

A página Minha conta do portal público encaminha quem deseja entrar ou
se cadastrar ao servidor HTTPS. O usuário informa nome e senha, sem
e-mail. As três ferramentas públicas continuam processando arquivos
localmente. A biblioteca privada exige autenticação e guarda somente
arquivos enviados para a conta pelo portal privado. A separação entre
as duas origens impede que páginas estáticas recebam as credenciais.

## 15. Hospedagem com recursos limitados (2.3)

Um perfil de execução reúne as ferramentas, as contas e a biblioteca no
alwaysdata. A plataforma fornece o endereço IPv6, a porta interna e a
terminação HTTPS. O servidor valida a origem e a conta em cada operação
privada. Cotas por usuário e por instalação, com um envio simultâneo,
demonstram o controle de recursos compartilhados. A exclusão autorizada
permite recuperar espaço. O banco permanece fora do diretório do programa,
preservando as contas durante atualizações.
