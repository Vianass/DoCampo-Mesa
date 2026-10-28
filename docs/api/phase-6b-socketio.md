# Fase 6B — Socket.IO e leilões em tempo real

Implementação local sobre `9cc09dde11321697f7378aee3c7c279da1ec9876`, branch `feat/api-foundation`. Não se implementa a interface React da Fase 6C, não se altera checkout e não se criam encomendas ou pagamentos de leilões. Os nove documentos da Fase 0 permanecem intactos. Este documento complementa o [OpenAPI REST](openapi.yaml) e o [contrato transacional da Fase 6A](phase-6a-auctions.md).

## Configuração e ciclo de vida

Socket.IO **4.8.4** é dependência da API; `socket.io-client` **4.8.4** é apenas dependência de desenvolvimento para testes/demonstração. Não há outras dependências diretas novas nem alteração de versões preexistentes.

O transporte é associado ao **mesmo `http.Server` do Express**. Usa o path Engine.IO `/socket.io` e o namespace privado `/auctions`; não cria outra porta HTTP. O namespace raiz não disponibiliza uma ligação alternativa pública. Cliente futuro: `io(origem + '/auctions', { path: '/socket.io', auth: { token } })`. O JWT fica em memória, nunca na URL ou em logs. O cliente deve desligar o socket ao terminar a sessão.

Variáveis opcionais da API, sem alterar os segredos existentes:

| Variável                  | Omissão | Valores                                                             |
| ------------------------- | ------- | ------------------------------------------------------------------- |
| `SOCKET_ENABLED`          | `true`  | `true` ou `false`; desativar mantém REST.                           |
| `SOCKET_SYNC_INTERVAL_MS` | `500`   | Inteiro 50–5000 ms; reconciliação de estado das salas acompanhadas. |
| `SOCKET_AUTH_INTERVAL_MS` | `1000`  | Inteiro 50–5000 ms; verificação de ligações ativas.                 |

Reutilizam-se `JWT_*`, `CORS_ORIGINS` e `TRUSTED_PROXY_IPS`. Origem exata obrigatória quando existe Origin, tanto em WebSocket como em polling. Clientes nativos sem Origin continuam sujeitos a JWT e limites. Produção exige TLS direto ou `X-Forwarded-Proto: https` de um proxy explicitamente confiável. IP encaminhado só é considerado nessa cadeia confiável; um cliente direto não altera a sua identidade de taxa com headers falsos.

O proxy Vite atual encaminha `/api`; não foi alterado nesta fase. O cliente da Fase 6C deverá usar a origem HTTP da API explicitamente, com CORS autorizado, ou acrescentar o encaminhamento de `/socket.io` com upgrade no proxy de desenvolvimento nessa fase. Uma base REST terminada em `/api` não é o namespace Socket.IO. Não se presume que o frontend atual já consome este transporte.

O arranque valida configuração/MongoDB e prepara os modelos existentes; o runtime compõe Socket.IO e o serviço de leilões antes de abrir a porta. O encerramento bloqueia novos comandos, desliga clientes, aguarda operações em curso, remove listeners/temporizadores e fecha HTTP/MongoDB dentro do timeout existente. Uma operação em curso pode fazer commit mesmo após a perda de ligação: recuperar pela mesma chave, sem presumir rollback.

## Autenticação e salas

Handshake estrito: `auth: { token: string }`, máximo 4096 caracteres. JWT é validado pelo **mesmo `AuthService.authenticate`** do REST: assinatura, expiração, conta ativa e papéis atuais. Credenciais em query ou Authorization não são alternativas suportadas. Sessões/tokens ficam num WeakMap privado do transporte, não em `socket.data` partilhável com adapters.

Cada operação revalida a conta; licitar chama o serviço que também aplica guardas transacionais de capacidades/produtor. Cada publicação privada e atualização de presença revalida os destinatários. Há ainda temporizador de expiração do JWT e verificação periódica de atividade: conta desativada ou token inválido provoca erro seguro e desconexão. Não se revalida retroativamente uma mensagem já enviada; a autorização corresponde ao instante da leitura da conta. Logout continua sem revogação imediata, conforme a política existente; o frontend futuro deve fechar a ligação e descartar o token.

O cliente fornece apenas `leilaoId`, um ID hexadecimal estável. O servidor valida existência e compõe `leilao:<id>`; não aceita nomes internos, salas administrativas ou IDs de conta escolhidos pelo cliente. Observação exige conta ativa autenticada, tal como detalhe/histórico REST. Licitar exige capacidade comprador e inscrição nessa sala. A mesma identidade nunca licita no seu lote, mesmo acumulando papéis. Um produtor sem aprovação não recebe novas ofertas no lote.

Presença mínima conta **ligações Socket.IO**, incluindo vários separadores da mesma pessoa. `ligacoes` não significa compradores ou utilizadores únicos. Não são emitidos nomes, emails, IDs privados ou listas de participantes. A contagem é local ao processo e é atualizada na entrada, saída e desconexão.

## Contrato tipado

Tipos em `apps/api/src/realtime/auction.protocol.ts`; snapshot comum em `auction.snapshot.ts`. Todos os comandos exigem **um payload e um acknowledgement**. Não há comandos de gestão comercial por Socket.IO nesta fase; criação/edição/cancelamento mantêm o REST aprovado.

Envelope de acknowledgement:

```json
{ "ok": true, "data": {} }
```

```json
{
  "ok": false,
  "erro": {
    "status": 409,
    "codigo": "LICITACAO_INSUFICIENTE",
    "mensagem": "O valor não satisfaz o incremento mínimo atual."
  }
}
```

`status` é uma equivalência para facilitar o tratamento dos erros existentes; não é uma resposta HTTP do evento.

| Evento                  | Direção                             | Payload / resposta                                                                                                                  |
| ----------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `auction:join`          | Cliente → servidor                  | `{leilaoId}`; ack com snapshot persistido. Revalida existência, inscreve e relê para cobrir commits durante a entrada.              |
| `auction:leave`         | Cliente → servidor                  | `{leilaoId}`; ack `{leilaoId}`. Saída idempotente; não altera o leilão.                                                             |
| `auction:state`         | Cliente → servidor                  | `{leilaoId}`; exige inscrição e devolve snapshot atualizado no ack.                                                                 |
| `auction:bid`           | Cliente → servidor                  | `{leilaoId, requestId, valorCent}`; ack com recibo de aceitação ou erro.                                                            |
| `auction:bid:accepted`  | Servidor → proponente               | Mesmo recibo do ack de sucesso; nunca um broadcast do recibo pessoal.                                                               |
| `auction:bid:rejected`  | Servidor → proponente               | `{leilaoId?, requestId?, erro}` para recusa conhecida: dados, mínimo, prazo, capacidade ou limite.                                  |
| `auction:bid:uncertain` | Servidor → proponente               | Mesmo envelope, `erro.resultadoIncerto: true` em falha técnica 500/503; conservar pedido e chave. Não é prova de rejeição/rollback. |
| `auction:updated`       | Servidor → observadores autorizados | Snapshot de versão confirmada superior à anteriormente enviada. Inclui cancelamento/ativação quando aplicável.                      |
| `auction:ended`         | Servidor → observadores autorizados | Snapshot terminado e resultado confirmado, sem identidade privada do vencedor.                                                      |
| `auction:presence`      | Servidor → observadores autorizados | `{leilaoId, ligacoes}`; contagem de sockets, independente da versão comercial.                                                      |
| `auction:error`         | Servidor → ligação                  | Erro seguro de autenticação, estado/consulta ou evento; 401 implica nova autenticação/ligação.                                      |

Erros seguem códigos existentes: 400 entrada/evento, 401 autenticação, 403 capacidade/sala/auto-licitação/aprovação, 404 inexistente, 409 mínimo/prazo/chave, 413 tamanho, 429 taxa/recursos, 500 interno e 503 indisponível/resultado incerto. Campos inválidos são minimizados; nunca se devolvem valores privados, URI MongoDB, tokens ou stack traces. Erros de handshake incluem esses dados seguros em `connect_error.data`; recusa antes do namespace por CORS/TLS/limite de tentativas é genérica.

### Snapshot comum da sala

```json
{
  "leilaoId": "507f1f77bcf86cd799439012",
  "versao": 2,
  "sequencia": 2,
  "estado": "ativo",
  "valorAtualCent": 30500,
  "incrementoCent": 100,
  "bidId": "507f1f77bcf86cd799439014",
  "lider": { "referencia": "p_pseudonimo-especifico-do-leilao" },
  "iniciaEm": "2026-10-28T10:00:00.000Z",
  "terminaEm": "2026-10-28T10:10:00.000Z",
  "serverNow": "2026-10-28T10:02:00.000Z"
}
```

`lider`/`bidId` são nulos sem ofertas. Após fecho pode existir `resultado: {tipo: "sem_licitacoes" | "vencedor", valorCent: number | null, bidId: string | null}`. Valores em cêntimos inteiros, preço total do lote. O snapshot não inclui `proprio`, ID privado de comprador/produtor, reserva, auditoria ou chave/hash de idempotência; a projeção é igual para todos os observadores. Dados descritivos completos continuam no detalhe REST autenticado.

Recibo pessoal de oferta: `{requestId, origem: "nova" | "replay", licitacao, estado}`. `licitacao` é a projeção privada já existente do próprio bid aceite; `estado` é snapshot confirmado do leilão. Um replay mantém ID, valor, sequência e instante originais, mas pode mostrar uma liderança atual diferente. Ack e evento pessoal podem repetir a mesma informação: deduplicar por ID/requestId.

`requestId` usa exatamente a chave opaca do `Idempotency-Key` REST, no mesmo âmbito leilão/comprador, 1–128 caracteres ASCII visíveis. A mesma oferta pode ser recuperada por qualquer dos transportes com **a mesma chave e valor**. Payload diferente dá conflito. Não gerar automaticamente uma nova chave após timeout, 500/503, desconexão ou perda de ack.

## Publicação depois do commit e garantias reais

Não se duplicam preços, mínimos, prazos, concorrência, reserva ou liderança. `auction:bid` chama `AuctionService.bid`. O serviço mantém as transações snapshot/majority e CAS da Fase 6A. As únicas extensões do domínio são uma projeção comum e notificações locais **depois de `repo.transaction` concluir**. Exceções de listeners não alteram o resultado já confirmado.

O publisher relê o estado persistido com majority/primary e só envia versões superiores. O snapshot de aceitação também é produzido na transação e só devolvido após commit: uma leitura/notificação posterior falhar não converte uma aceitação confirmada numa recusa. Rollback não notifica sucesso; a reconciliação periódica vê a versão anterior e não inventa liderança. Snapshots antigos que terminem de ler fora de ordem não substituem uma versão mais recente em cache.

**Intervalo commit → emissão:** não existe transação distribuída entre MongoDB e a rede. A notificação local acelera a publicação, mas pode perder-se se o processo terminar nesse intervalo. A menor recuperação adotada é **persistência do estado/versão + varredura das salas ativas** (500 ms por omissão), além da leitura ao entrar/reconectar/pedir estado. Assim também se detetam commits REST ou de outra instância que não notificou este processo. O intervalo é um objetivo de agendamento, não um SLA de latência: carga, rede ou indisponibilidade podem atrasá-lo.

São **notificações substituíveis de estado**, sem outbox nem fila durável. Podem ser agrupadas versões intermédias; não se garante entrega de cada oferta/evento, confirmação de receção pelo observador ou entrega exatamente uma vez. O histórico REST continua a fonte das ofertas aceites. Socket.IO fornece entrega no máximo uma vez por omissão; garantias adicionais exigem mecanismo próprio ([documentação oficial](https://socket.io/docs/v4/delivery-guarantees/)). Se uma fase futura exigir todos os eventos duráveis, será necessário outro requisito e publicação persistente; não é dada por implementada aqui.

Cliente futuro mantém maior `versao` por leilão: ignora snapshots inferiores e deduplica iguais. Não aplica um ack antigo sobre um broadcast mais recente. Se houver salto de sequência, pode consultar o histórico REST; não presume que um salto significa ofertas perdidas no MongoDB. Um evento final repetido só é aceitável com resultado compatível e versão atual: nunca reabrir nem escolher outro vencedor no cliente.

## Tempo, encerramento e reconexão

`serverNow`, início e fim vêm do serviço MongoDB. O relógio do cliente não decide aceitação. A contagem visual futura deve estimar offset/RTT e progredir com relógio monotónico, revalidando após foco/reconexão. Não se enviam ticks de contagem decrescente por segundo. Um snapshot de aceitação pode representar o instante atómico anterior ao fim, mesmo que o commit/ack termine depois: regra Q08 preservada.

O mesmo mecanismo de encerramento e recuperação da Fase 6A determina resultado e reserva. O commit de término notifica os observadores e também é recuperável pela varredura. Dois encerradores e uma oferta concorrente disputam o mesmo documento; versões/resultado/histórico continuam transacionais. Sem ofertas liberta stock uma vez; com vencedor mantém lote afeto. Não há encomenda ou pagamento automático.

Recuperação automática de sessões/rooms do Socket.IO não é ativada. Em reconexão: apresentar JWT válido novamente, revalidar conta, efetuar `auction:join` e ler o snapshot persistido, incluindo término durante a ausência. Não reutilizar uma sala anterior sem autorização. Token expirado exige autenticação nova; conta desativada não regressa enquanto estiver inativa. A política JWT existente continua sem refresh token ou revogação imediata no logout.

## Limites e deployment

Payload Engine.IO até 16 KiB; evento de aplicação até 8 KiB. Por processo: 30 tentativas de ligação/minuto/IP; 240 comandos/minuto/IP; 120 comandos/minuto/conta e 60 licitações/minuto/conta. Orçamentos são partilhados entre sockets e sobrevivem à desconexão durante a janela. Ligação nova não reinicia a quota. Há Retry-After equivalente em `repetirEmSegundos` para os limites de taxa.

Máximos técnicos: 1000 sockets, 50/IP, oito/conta, dez salas/socket e oito comandos pendentes/socket. Contadores de taxa limitados a 10 000 entradas HMAC, sem retenção de tokens/emails e sem expulsão que permita contornar quotas ativas. Liberação de ligações é idempotente; salas/cache/listeners são removidos quando deixam de ser usados.

Estes limites **não são distribuídos** e os orçamentos REST/Socket.IO são independentes. Não se afirma uma quota única agregada nos dois transportes. Várias réplicas exigirão uma decisão de armazenamento de limites e presença global. O adapter atual é local; a varredura de MongoDB permite descobrir o estado confirmado por outra instância, mas não transforma presença/quotas em globais. Polling em múltiplas réplicas exige afinidade; o reverse proxy terá de encaminhar `/socket.io`, upgrade WebSocket e timeouts adequados ([deployment com múltiplos nós](https://socket.io/docs/v4/using-multiple-nodes/)). Esses recursos distribuídos não são instalados nesta fase.

## Demonstração real reproduzível

Com Docker e dependências de desenvolvimento disponíveis:

```sh
npm run mongo:test:up --workspace @docampo/api
DOCAMPO_AUCTION_DEMO=1 npm run demo:auctions --workspace @docampo/api
```

O script recusa produção e requer a flag explícita. Usa exclusivamente o replica set de teste local na porta 27019, numa base aleatória `docampo_test_socket_*`. Não lê URI/segredos privados de desenvolvimento, não cria utilizadores reais e não altera o catálogo de desenvolvimento. Cria duas contas compradoras fictícias, um produtor aprovado e um lote, inicia servidor HTTP e dois clientes Socket.IO reais, envia duas ofertas, espera pelo prazo real e compara o encerramento com MongoDB. Imprime apenas passos/valores/versões, sem tokens, passwords ou identidades privadas. Fecha servidor/clientes e remove somente a sua base efémera no fim.

Resultado observado: A licitou 301,00 € e B recebeu versão 1; B licitou 305,00 € e A recebeu versão 2; ambos receberam o encerramento versão 3 e o MongoDB confirmou vencedor, valor e dois bids, mantendo a reserva afeta. Sem encomendas ou pagamentos.

## Testes e preparação para 6C

Novos testes unitários verificam configuração, envelopes, privacidade, proxies, quotas partilhadas, cache monotónica e limpeza. Testes com replica set, servidor HTTP e clientes Socket.IO reais cobrem handshake/JWT, conta/papéis/aprovação atuais, salas, presença, mínimos/prazos, concorrência de múltiplos compradores, REST/Socket.IO simultâneos, falha/rollback, commit antes da emissão, estado de outra instância, resultado incerto/replay, expiração, reconexão, CORS, payload, quotas entre sockets, encerramento concorrente e reinício real do runtime.

Injeções de falha/barreiras mantêm as escritas MongoDB reais; duplicados unitários não são usados como prova de consistência. A suite completa e as regressões frontend são executadas no fecho; o relatório final distingue os resultados efetivamente reexecutados. A Fase 6C poderá consumir estes tipos/contratos, deduplicar versões, preservar requestId em tentativas incertas, ligar/desligar com a sessão e estimar a contagem decrescente. A interface não foi implementada nesta fase.

## Resultados executados e inventário local

Suite backend completa: **1 497 testes aprovados**, sendo 928 unitários, 146 HTTP e 423 de integração MongoDB real. São **90 testes novos**: 39 unitários e 51 com clientes Socket.IO reais. Os 1 407 testes backend anteriores permanecem aprovados. Frontend habitual **413/413** e integração real React/API/MongoDB **53/53**, ambas reexecutadas sem skips ou retries. A demonstração com dois compradores e prazo real também passou.

TypeScript API/frontend, ESLint global, Prettier, builds API/frontend, OpenAPI, ligações Markdown e `git diff --check` aprovados. Os caminhos e schemas REST foram comparados semanticamente com a Fase 6A e preservados; 12 respostas REST reais do runtime atual foram validadas contra esses schemas. Verificada a integridade dos nove documentos da Fase 0, do frontend e checkout, ausência de segredos identificados no inventário e preservação das versões preexistentes das dependências.

**12 ficheiros criados:**

- `apps/api/src/config/realtime-environment.ts`.
- `apps/api/src/modules/auctions/auction.snapshot.ts`.
- Em `apps/api/src/realtime/`: `auction.limits.ts`, `auction.protocol.ts`, `auction.publication.ts`, `auction.socket.ts` e `socket.security.ts`.
- `apps/api/scripts/demo-auctions.ts`.
- `apps/api/tests/unit/auction-realtime.spec.ts`.
- `apps/api/tests/integration/auction-sockets.spec.ts`.
- `apps/api/tests/support/realtime-fixtures.ts`.
- Este documento, `docs/api/phase-6b-socketio.md`.

**11 ficheiros modificados:**

- `apps/api/src/runtime.ts`: associação ao servidor HTTP e encerramento.
- `apps/api/src/modules/auctions/auction.service.ts`: notificação após commit e projeção comum, sem alterar as regras de licitação.
- `apps/api/package.json` e `package-lock.json`: duas dependências diretas indispensáveis e comando de demonstração.
- `apps/api/tsconfig.json`: inclusão do script de demonstração no typecheck, sem o incluir no build de produção.
- `apps/api/.env.example`: três opções técnicas sem segredos; `.env` real preservado.
- `README.md`, `apps/api/README.md`, `docs/api/decisions.md`, `docs/api/security.md` e `docs/api/openapi.yaml`: estado local, instruções e referências ao protocolo complementar; sem eventos apresentados como endpoints HTTP.

Total: **23 ficheiros locais**. Branch `feat/api-foundation`, base `9cc09dde11321697f7378aee3c7c279da1ec9876`; main intacta em `c10d031dafc3a0173f5540875152f35f61bb1549`. Não se executa staging, commit, push, merge ou criação de branch nesta entrega. Os artefactos de execução/compilação não pertencem ao inventário Git; publicação exige nova autorização.
