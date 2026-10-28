# Fase 6C — Leilões em tempo real no React

Implementação local para revisão, sobre `feat/api-foundation`, base `d59193daf32a8bee00256c922adf5a614b53eaf2`. Não publica alterações nem inicia outra fase. Complementa os [contratos REST](phase-6a-auctions.md) e o [protocolo Socket.IO](phase-6b-socketio.md), sem alterar o backend transacional ou os eventos dessas fases.

## Percursos e experiência

| Percurso                            | Utilização                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/leiloes`                          | Catálogo público REST, estados, ordenação, paginação e pesquisa **apenas na página carregada**. |
| `/leiloes/:id`                      | Resumo de navegação para visitantes; detalhe, histórico e sala para contas autenticadas.        |
| `/area/comprador/licitacoes`        | Acesso ao mercado real e explicação de onde consultar as próprias ofertas.                      |
| `/area/comprador/licitacoes/:id`    | Detalhe autorizado do lote, sem inferir que o comprador participou.                             |
| `/area/produtor/leiloes`            | Consulta paginada dos leilões da própria conta.                                                 |
| `/area/produtor/leiloes/novo`       | Criação com produto próprio publicado e reserva de stock confirmada pelo serviço.               |
| `/area/produtor/leiloes/:id`        | Acompanhamento em direto, resultado, reserva na última consulta e cancelamento permitido.       |
| `/area/produtor/leiloes/:id/editar` | Substituição completa dos campos editáveis, com `If-Match`.                                     |

O resumo REST não tem pesquisa textual global: não se enviam parâmetros inventados. A pesquisa local identifica expressamente o seu âmbito; os filtros de estado e a ordenação consultam o servidor. O total da consulta e as correspondências da página são separados. Há carregamento, vazio, erro com recuperação e identificadores inválidos.

O detalhe público direto não pode consultar o endpoint autenticado. Quando se chega a partir do catálogo, o estado de navegação é validado e permite apresentar o último resumo público. Sem esse resumo, o endereço apresenta uma entrada para autenticação, sem afirmar que o recurso existe. A autenticação preserva um destino interno validado.

O antigo lote `cabaz-outono` e a área `/demonstracao` conservam a experiência ilustrativa anterior, explicitamente sem licitações reais. Não são prova de integração. Carrinho, checkout, encomendas, catálogo e áreas privadas anteriores mantêm os seus percursos.

## Organização e reutilização

Módulo [features/auctions](../../apps/web/src/features/auctions/AuctionsPage.tsx):

- `contracts.ts`: projeções públicas/autorizadas, validação de DTO, histórico, snapshots e recibos; não propaga campos privados adicionais.
- `model.ts`: cêntimos inteiros, limite seguro, versões, pesquisa local e relógio monotónico.
- `form-model.ts`: validação pura de título, descrição, preço, incremento, datas e grelha de quantidades.
- `attempts.ts`: preservação defensiva das tentativas sem confirmação e separação por conta.
- `live-client.ts`: uma ligação por sala montada, entrada/saída, acknowledgements, versões, reconexão e cleanup.
- `useAuctionRoom.ts`: associação à sessão existente, estado visual, tentativa pendente e recibo.
- `components.tsx`: fotografia, estado, temporizador, cartão e paginação.
- `AuctionsPage.tsx`, `AuctionDetailPage.tsx`, `ProducerAuctionsArea.tsx` e `BuyerAuctionsArea.tsx`: apresentação e percursos.

Reutiliza `Button`, `Container`, `MarketImage`, `PriceDisplay`, `Breadcrumbs`, `LoadingSkeleton`, `EmptyState`, `useRemote`, o cliente HTTP e o `AuthProvider`. Não há um segundo estado de autenticação ou outra biblioteca de gestão global. Estilos em [auctions.scss](../../apps/web/src/styles/_auctions.scss), com tokens e mixins existentes, Bootstrap e fotografias já creditadas.

Dependência nova do frontend: `socket.io-client` **4.8.4**, alinhada com o servidor existente. Era já dependência de testes do backend. As versões preexistentes do lockfile não mudam; três dependências passam a ser também necessárias em produção.

## REST, permissões e produtor

O cliente usa os endpoints documentados: `GET /auctions`, detalhe/histórico autorizado, `GET /me/producer/auctions`, `GET /me/products`, `POST /auctions`, `PUT /auctions/:id` e `POST /auctions/:id/cancel`. O próprio serviço confirma conta, papéis, aprovação, propriedade, stock, calendário e concorrência.

Os produtos selecionáveis pertencem ao catálogo próprio publicado. Quantidades respeitam mínimo, incremento a partir do mínimo e stock disponível; preços referem-se ao **lote completo**, em cêntimos inteiros. O formulário não envia produto ou quantidade numa edição. A ausência de início significa início imediato decidido pelo servidor. As datas do formulário usam o fuso horário do navegador e são enviadas como instantes ISO.

Edição apenas antes do início e sem ofertas; cancelamento apenas quando permitido, com confirmação explícita. A presença da projeção privada `reserva` identifica a propriedade autorizada; não se confunde o ID público do perfil com o ID da conta. Os controlos consideram o snapshot atual e não reutilizam um ETag desatualizado. Mudanças anteriores à primeira oferta provocam nova consulta REST para atualizar título, descrição e ETag, ausentes do evento.

Uma edição com resultado não confirmado bloqueia nova submissão até reler o recurso. Um conflito exige consulta atualizada. Na criação sem confirmação, conserva-se a chave e o corpo original para recuperar o resultado; o serviço mantém a autoridade. A reserva apresentada é identificada como sendo a da última consulta REST. Nenhum valor vencedor é descrito como pagamento, receita recebida ou encomenda criada.

## Autenticação e Socket.IO

Reutiliza o JWT privado do `account-session` existente. O token é entregue ao callback `auth` da ligação Socket.IO; nunca é colocado em estado React, armazenamento, URL ou logs. Logout, expiração, substituição da sessão e dispose encerram as ligações registadas antes de limpar o token. As demonstrações não concedem permissões reais.

Namespace `/auctions`, path `/socket.io`. Com API absoluta usa-se a origem dessa API; com `/api` relativa usa-se a origem da página e o proxy Vite, que agora encaminha também WebSocket. Em produção, o proxy deve encaminhar HTTP e upgrade, preservar as regras HTTPS/proxy e respeitar as origens permitidas na Fase 6B.

Após o detalhe REST autorizado, o cliente liga e executa `auction:join`. Consome `auction:updated`, `auction:ended`, `auction:presence` e `auction:error`. Solicita `auction:state` para reconciliar e usa `auction:bid` com acknowledgement. Ao desmontar, abandona a sala, remove listeners de socket/manager/browser e desliga. O registo de recursos na sessão impede ligações privadas sobreviventes ao logout.

A reconexão apresenta novamente o token em memória; o handshake e cada comando/broadcast são sujeitos à validação atual de conta e papéis no backend. Não recupera permissões a partir de estado React. Reentra explicitamente na sala e lê o snapshot persistido. Foco/visibilidade e retoma da rede também solicitam atualização; a revalidação `/auth/me` existente mantém-se. Estados: a ligar, ligado, a reconectar, indisponível, sessão expirada e sem autorização. Durante indisponibilidade não se permite uma nova oferta. Não foi criado um fallback REST automático de licitação.

## Versões, relógio e ofertas

O cliente conserva a maior versão por leilão. Eventos inferiores são ignorados; uma versão igual com conteúdo incompatível é recusada e provoca releitura. Uma lacuna aplica o snapshot mais recente e pede confirmação persistida. O histórico REST é atualizado após mudanças de sequência, com paginação e pequeno agrupamento de pedidos; não se presume a entrega de todos os eventos intermédios.

A referência temporal é `serverNow`, ajustada com metade do RTT observado em consultas à sala, e progride com `performance.now()`. Atualizações recebidas substituem a referência, incluindo após reconexão/suspensão. É uma estimativa visual, não uma garantia de precisão nem autoridade para aceitar ofertas. O temporizador não anuncia cada segundo a leitores de ecrã e não envia pedidos por tick. A zero, apresenta «A confirmar…», impede nova oferta e solicita estado; só o servidor confirma término e resultado.

Uma oferta só é apresentada como aceite após recibo válido, correlacionado com leilão, valor e `requestId`. Um broadcast pode atualizar o valor antes do ack, sem constituir confirmação pessoal. Distingue aceitação, recusa, ultrapassagem, encerramento, falta de autorização, desconexão e resultado incerto. Um bloqueio síncrono impede duplo envio acidental.

Antes do envio, preserva-se o `requestId`, leilão e valor em `sessionStorage`, **sem JWT, email, nome ou ID de conta em claro**; a chave de armazenamento usa SHA-256 do ID da conta para separar tentativas. Na criação preserva-se também o corpo original do lote. Este armazenamento não autentica nem autoriza: só permite recuperar a mesma intenção depois de navegação, recarregamento ou nova entrada da mesma conta. Outras contas não veem a tentativa. Não se apaga uma tentativa incerta no logout; fecha-se a ligação e o token desaparece. Fechar o separador pode perder esta recuperação local.

Se o armazenamento estiver indisponível, não se envia a operação. Uma confirmação ou recusa definitiva limpa apenas a tentativa correspondente; resultado incerto mantém-na e bloqueia outra chave. Recuperação é sempre explícita com a chave e o valor/corpo originais, sem repetição automática. O recibo pode ser histórico: nunca substitui um snapshot posterior, incluindo um leilão já encerrado. A garantia de idempotência é a da Fase 6B, não uma garantia inventada no browser.

## Revisão integrada isolada

Não usar contas ou bases reais. O harness de testes cria exclusivamente uma base `docampo_test_web_<uuid>` no replica set local `rs-dcm-test`, porta 27019. O modo de leilões acrescenta duas contas de compradores, uma de produtor, produto ilustrativo e quatro cenários. As passwords e o segredo JWT são gerados de novo; não são constantes nem publicados. As credenciais são escritas apenas num ficheiro temporário privado, modo 0600, cujo **caminho** é apresentado no terminal. O encerramento por SIGINT/SIGTERM remove a própria base e o próprio ficheiro.

1. Iniciar o MongoDB de testes: `npm run mongo:test:up --workspace @docampo/api`.
2. Num terminal, executar `DOCAMPO_AUCTION_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs`.
3. Noutro, executar `VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183`.
4. Consultar localmente o ficheiro indicado, sem copiar credenciais para documentação, logs ou Git. API em 3011, React em 5183; não executar outra suite real que utilize as mesmas portas em simultâneo.
5. Abrir `http://127.0.0.1:5183/leiloes`. Experimentar estados, ordenação, pesquisa nesta página e entrada pública no lote.
6. Em dois perfis de navegador independentes, entrar com os dois compradores fictícios e abrir o mesmo lote ativo. A oferece 13 €, B recebe a atualização; B oferece 14 €, A observa a ultrapassagem. Comparar contagens e histórico anonimizado.
7. Usar o modo offline num dos perfis e regressar à rede: a oferta deve ficar bloqueada durante a ausência e a sala deve reconciliar ao regressar. Nunca repetir automaticamente uma tentativa incerta.
8. Com a conta de produtor, visitar `/area/produtor/leiloes`, criar um lote com prazo curto para observar o encerramento nas duas sessões. Criar outro agendado para editar e cancelar; confirmar o diálogo e as restrições. Sem pagamento ou encomenda automática.
9. Rever 320/430/768/1024/1280/1440 px, teclado, erros e ausência de deslocação horizontal. Terminar os dois servidores com Ctrl+C; confirmar a mensagem de remoção da base efémera e do ficheiro privado.

Execução automatizada integrada: `npx playwright test --config playwright.auctions.config.ts`. O próprio runner prepara/encerra os dois servidores e remove os dados. Não reutiliza uma instância de desenvolvimento. O teste das duas sessões usa prazo real, ofertas reais e confirmação direta de estado, reserva e número de bids no MongoDB. Outro cenário cria uma oferta REST persistida, conserva uma tentativa sem confirmação e recupera o recibo pelo Socket **depois do término**, verificando uma única oferta e sem reabrir o lote. Não utiliza mocks como prova destes resultados.

## Cobertura e limitações

Os testes de modelos e do controlador de ligação usam entradas controladas para limites monetários, relógio, versões, cleanup, ack perdido, recusa, reconexão e bloqueio offline. Testes de componentes cobrem carregamento, erro recuperável, vazio, pesquisa local, paginação, IDs inválidos, visitante e navegação do comprador. Os cenários reais cobrem o produtor, duas sessões, privacidade, sessão perdida ao recarregar e seis larguras. As suites anteriores continuam separadas e são executadas para regressão. Os resultados efetivamente executados são registados na entrega, sem apresentar resultados antigos como nova execução.

Limitações herdadas: snapshots substituíveis, sem outbox/entrega de todos os eventos, monitorização da presença por **ligações**, e não pessoas; uma instância de demonstração, sem adapter distribuído ou alegação de prontidão para escala horizontal. O relógio depende de latência, suspensão e retoma. A listagem pública não é uma sala em direto; os estados/totais apresentados são os da consulta e podem ser atualizados manualmente. Imagens vêm do produto público quando disponível, com placeholder caso já não esteja acessível. Uma imagem de catálogo não comprova o estado exato do lote.

Não existe endpoint de participações globais do comprador; a área remete para o histórico autorizado por lote. Sem lista de vencedores identificáveis, licitação automática, extensão automática, refresh token, revogação imediata, pagamentos ou conversão em encomendas. O browser não constitui controlo de permissões. A evolução destas capacidades exige uma fase e decisões próprias. Não foi feita certificação WCAG nem validação Safari/Firefox.

## Resultados da validação e inventário local

Validação em 28 de outubro de 2026, sem retries ou skips nas execuções finais:

| Verificação                                               | Resultado                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Suite frontend habitual                                   | **460 aprovados**: 413 existentes e 47 novos.                                                    |
| Integrações React/API/MongoDB anteriores                  | **53 aprovadas**, com o worker único previsto na configuração.                                   |
| Integração real dos leilões                               | **11 aprovadas**, incluindo seis larguras e duas sessões independentes.                          |
| Total frontend                                            | **524 aprovados**, incluindo **58 testes novos** nesta fase.                                     |
| Suite backend completa                                    | **1 497 aprovados**; inclui os 90 testes de Socket.IO da fase anterior.                          |
| TypeScript API/frontend, ESLint global, Prettier e builds | Aprovados. Ignore do Prettier indicado explicitamente a partir da raiz.                          |
| OpenAPI                                                   | YAML 3.0.3, 733 referências locais resolvidas e IDs de operações únicos; contrato intacto.       |
| Documentação                                              | 523 ligações locais e quatro âncoras Markdown verificadas.                                       |
| Integridade                                               | Nove documentos da Fase 0 e os 140 ficheiros rastreados do backend intactos por SHA-256.         |
| Git e inventário                                          | `git diff --check` aprovado; sem staging, artefactos gerados ou credenciais reais no inventário. |

Após os últimos acertos de apresentação e estados de ligação, os **47 testes diretamente afetados** foram novamente executados. A suite backend e as 53 integrações anteriores referem-se às execuções completas desta tarefa, não apenas a resultados herdados. Numa execução intermédia foram usados indevidamente dois workers na integração antiga: cenários que partilham dados fizeram variar as contagens do catálogo. A repetição com o único worker previsto passou integralmente, sem alterar os testes anteriores para ocultar essa interferência. Seletores dos novos testes também foram ajustados aos textos reais.

A demonstração de dois React reais confirmou ofertas de **13,00 €** e **14,00 €**, mudança de liderança, temporizadores com diferença inferior a 2,2 segundos no ensaio, reconexão e encerramento. O MongoDB confirmou estado terminado, sequência 2, dois bids e reserva afeta ao vencedor. A recuperação de uma tentativa original após o encerramento confirmou um só bid e conservou o estado terminado. As credenciais e bases efémeras foram removidas, os servidores de revisão encerrados e o MongoDB de testes reposto no estado inicial, parado.

Foram obtidas **26 capturas** na integração real: catálogo, detalhe, gestão e formulário às seis larguras, mais as duas sessões compradoras. A inspeção visual incluiu detalhe em mobile/tablet/desktop, formulários carregados e gestão do produtor, sem deslocação horizontal, fragmentação excessiva ou erros JavaScript nos cenários verificados. Fotografia, tipografia, painel de oferta e navegação mantêm a identidade aprovada. As capturas são artefactos locais ignorados em `test-results/auction-integration/`.

### Ficheiros criados — 19

Onze ficheiros em `apps/web/src/features/auctions/`:

- `contracts.ts`, `model.ts`, `form-model.ts` e `attempts.ts`.
- `live-client.ts` e `useAuctionRoom.ts`.
- `components.tsx`, `AuctionsPage.tsx` e `AuctionDetailPage.tsx`.
- `ProducerAuctionsArea.tsx` e `BuyerAuctionsArea.tsx`.

Oito ficheiros adicionais:

- `apps/web/src/styles/_auctions.scss`.
- `apps/web/tests/auction-model.spec.ts`.
- `apps/web/tests/auction-live-client.spec.ts`.
- `apps/web/tests/auctions.spec.ts`.
- `apps/web/tests/auctions.real.spec.ts`.
- `apps/web/tests/support/auction-review.mjs`.
- `playwright.auctions.config.ts`.
- Este documento, `docs/api/phase-6c-react-auctions.md`.

### Ficheiros modificados — 15

- `README.md` e `docs/design/design-system.md`.
- `apps/web/package.json` e `package-lock.json`.
- `apps/web/src/App.tsx`.
- `apps/web/src/features/api/client.ts`.
- `apps/web/src/features/auth/AuthContext.ts`.
- `apps/web/src/features/auth/AuthProvider.tsx`.
- `apps/web/src/features/auth/account-session.ts`.
- `apps/web/src/features/private-area/AccountArea.tsx`.
- `apps/web/src/features/private-area/navigation.ts`.
- `apps/web/src/styles/main.scss`.
- `apps/web/vite.config.ts`.
- `apps/web/tests/support/real-api-server.mjs`.
- `playwright.integration.config.ts`.

Total: **34 ficheiros locais**. Sem alterações à lógica transacional, protocolo do servidor, dependências do backend ou documentação original. A única dependência direta acrescentada é a necessária para o cliente Socket.IO.

### Proposta de consolidação futura — não executada

1. `feat(auctions): add typed REST and realtime client` — contratos, modelos, tentativas, cliente/hook, ligação à sessão, cliente HTTP e dependência.
2. `feat(ui): implement live auctions and producer management` — páginas, componentes, estilos, rotas, navegação e proxy.
3. `test(auctions): cover realtime sessions recovery and responsive flows` — testes, harness isolado e configurações de execução.
4. `docs(auctions): document React flows and review scenarios` — este documento, README e sistema visual.

Manter os ficheiros dependentes no mesmo grupo e rever os diffs antes de qualquer futura consolidação. **Não foi executado staging, commit, push, merge, rebase ou criação de branch/PR.** `HEAD` conserva `d59193daf32a8bee00256c922adf5a614b53eaf2`; main local/remota conserva `c10d031dafc3a0173f5540875152f35f61bb1549`. A árvore contém intencionalmente as alterações locais e o staging permanece vazio.

Próxima ação: revisão visual e aprovação explícita da Fase 6C. Só depois deve ser decidido o âmbito seguinte, consultando o planeamento e as decisões pendentes; não se assume autorização para implementar pagamentos, encomendas de leilões, escala distribuída ou outras funcionalidades.
