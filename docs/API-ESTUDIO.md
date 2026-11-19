# API do Estúdio conectado 2.4.0

A API utiliza a mesma origem do host e a autenticação de `docs/API.md`. Não há CORS aberto nem token em URL. Sem sessão, as rotas respondem 401; POST exige origem válida, `X-MIDI-Share: 1`, `X-MIDI-User` e `X-CSRF-Token`. Corpos JSON são limitados a 2.048 bytes. Identificadores são UUIDs sem hífens, em hexadecimal minúsculo de 32 caracteres.

| Método | Rota | Corpo ou consulta |
|---|---|---|
| POST | `/api/studio/heartbeat` | `client_id`, `app`, `label` |
| GET | `/api/studio?client_id=ID` | Conexão da própria sessão |
| POST | `/api/studio/send` | `client_id`, `target`, `midi_id`, `request_id` |
| POST | `/api/studio/ack` | `client_id`, `delivery_id`, `state` |

`app`: `aurora`, `auralis`, `midi-tab` ou `portal`. `label`: 1–64 caracteres sem controles. `portal` pode enviar itens da biblioteca; não é destino de importação.

`GET` retorna `clients` com id, app e label das conexões ativas da conta, e `incoming` com id, midi_id, source_app, source_label e created. Nunca retorna hashes de sessão. As conexões são vinculadas ao token de sessão que as registrou. Login em outro aparelho cria outra sessão e outra conexão.

O envio primeiro usa `POST /api/midis`, com identificador idempotente, para guardar o MIDI. `/send` referencia esse MIDI e um destino autorizado. A propriedade do item é conferida no servidor. A fila não copia bytes. `request_id` torna a confirmação de envio idempotente durante a janela de 24 horas: reenvio igual devolve delivery_id e state existentes; reutilização diferente responde 409. Destino ausente/expirado responde 404. Identidade de outra conta não é revelada.

`state` no ACK pode ser `accepted` ou `dismissed`. A confirmação é idempotente, mas mudar o resultado de uma confirmação já concluída responde 409. Apenas a sessão da aba de destino confirma. O cliente só envia accepted após baixar, conferir integridade quando Web Crypto está disponível e importar com sucesso. Se a resposta do ACK se perde, repetir a confirmação não importa o projeto novamente na mesma aba. Recarregar a aba cria outra conexão; entregas antigas não migram automaticamente.

Presença: 90 segundos. Heartbeat da interface: 20 segundos. Consulta: 3 segundos em página visível, 10 segundos após falha. Oferta: até uma hora. Histórico: até 24 horas. Limites: 64 registros de conexão e 256 entregas por conta; 2.048 conexões e 10.000 entregas no host. Conexões inativas podem ser removidas para abrir espaço. Limites atingidos respondem 429. A limpeza ocorre ao registrar conexões/enviar, sem processo em segundo plano.

Uma entrega accepted significa que a ferramenta importou o MIDI e confirmou. Não significa que um projeto editável foi salvo por ela. O MIDI original permanece no catálogo até exclusão explícita. Se o usuário excluir um item enquanto uma entrega aguarda, o destino recebe 404 ao tentar obter o arquivo e pode dispensar a oferta.
