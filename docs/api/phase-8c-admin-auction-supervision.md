# Fase 8C — supervisão administrativa de leilões

Implementação local sobre `62738102dabf727a89d6e67b11b241589c3bd5b5`, em `feat/api-foundation`. Concretiza a consulta global e acompanhamento administrativo de RF-ADM-01. Complementa as Fases [6A](phase-6a-auctions.md), [6B](phase-6b-socketio.md), [6C](phase-6c-react-auctions.md), [8A](phase-8a-admin-dashboard-users.md) e [8B](phase-8b-admin-order-supervision.md). As regras de licitação, reserva, CAS/transações, prazo, incremento, vencedor e fecho permanecem no serviço existente.

## Arquitetura e endpoints

| Endpoint                           | Responsabilidade                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/admin/auctions`          | Listagem global, filtros combináveis, paginação MongoDB e indicadores do conjunto filtrado.                        |
| `GET /api/admin/auctions/:id`      | Snapshot descritivo e comercial, liderança limitada, versão/sequência e vencedor apenas após resultado persistido. |
| `GET /api/admin/auctions/:id/bids` | Licitações aceites persistidas, paginadas numa leitura snapshot da cabeça e bids.                                  |

O módulo `admin-auctions` separa validação e serviço de leitura. Reutiliza `auctionDto`, pseudónimos HMAC e o repositório existente, sem chamar criação, edição, licitação, cancelamento ou avanço de ciclo nas consultas administrativas REST. O router administrativo é o da Fase 8A, com autenticação, autorização, limites e no-store comuns. Não existe outra administração ou outro servidor de sockets.

Detalhe e histórico não precisam de ETag: não há comandos novos. Ausente devolve 404 seguro, IDs/query inválidos 400, JWT ausente/inativo 401, papel insuficiente 403 e falhas conhecidas 503. O [OpenAPI](openapi.yaml) distingue estes GET implementados dos comandos futuros, preservando os contratos de comprador/produtor.

## Listagem, pesquisa e filtros

Dados reais de auctions. Cada cartão apresenta identificador, produto/lote, produtor, estado, início/fim, base, valor atual, número de ofertas e acesso à supervisão. Dados descritivos e valores vêm do snapshot do leilão; não se reconstituem a partir do catálogo atual. No detalhe, a fotografia do catálogo é apenas ilustrativa e pode faltar; não substitui o snapshot do lote.

- `identificador`: ObjectId completo exato do leilão; sem regex, pesquisa parcial ou pesquisa apenas na página carregada.
- `produtor`: ID da conta users, não do perfil público. `produto`: referência do produto associado. Ambos visíveis para copiar e combinar filtros inequívocos.
- `estado`: agendado, ativo, terminado ou cancelado, como persistido no domínio existente.
- `desde`/`ate`: intervalo de **início** do leilão em dias UTC inclusivos. O limite final é convertido no dia seguinte exclusivo; limites técnicos 1970-01-01 a 9999-12-30 e intervalo não invertido. Não é intervalo de criação ou de fecho.
- `pagina`: 1–1000; `porPagina`: 12/24/36; `ordem`: recentes/antigas pela **criação**, com desempate por _id na mesma direção. Query estrita recusa duplicados, operadores, objetos e campos desconhecidos.

Itens limitados e indicadores são calculados numa agregação `$facet` com majority/primary e orçamento de 5 s. Não se carrega toda a coleção para paginar no browser. Alterar filtros regressa à primeira página; páginas inexistentes devolvem itens vazios com totais reais. O React normaliza a URL para a última página consultável, preserva filtros e foca o título depois de confirmar a resposta. Atualizações de fundo mantêm a última leitura visível, identificada como tal, sem roubar o foco.

## Estado confirmado, detalhe e resultado

São apresentados base, incremento, valor atual do lote, sequência, número de ofertas, início/fim e versão persistida. `estadoEmAtualizacao` é um sinal booleano de prazo atingido segundo `$$NOW`, não um novo estado: se o agendador ainda não materializou a transição, mostra-se que falta confirmação. O temporizador sincronizado existente apresenta «A confirmar…» ao chegar a zero; não escolhe vencedor nem encerra por decisão do browser.

O vencedor só é mostrado se o estado for terminado e o resultado persistido indicar vencedor. Usa a mesma referência HMAC específica do leilão da liderança/histórico, sem ID privado, nome ou email do comprador. Resultado sem ofertas não inventa licitante ou pagamento. Uma oferta vencedora não representa receita recebida ou encomenda criada.

O ciclo de vida e a observação por salas continuam a usar os mecanismos temporais já existentes: o serviço normal pode materializar abertura/fecho quando o prazo o exige. A interface administrativa não envia comandos operacionais nem decide essas transições.

## Histórico de licitações

Leitura transacional snapshot/majority da cabeça e bids até à sequência observada. Ordenação por sequência e ID, paginação limitada e metadados `sequenciaSnapshot`, `versaoSnapshot` e `serverNow`. Não se promete uma fotografia fixa entre páginas pedidas em instantes diferentes; as versões de consulta ficam identificadas.

Cada linha contém ID da oferta, valor em cêntimos, data de aceitação, sequência, pseudónimo e confirmação persistida. Recusas e mensagens transitórias de Socket.IO não se tornam licitações. Sem requestId, requestHash, comprador privado, token, reservas ou auditoria interna. O frontend nunca reconstrói o histórico a partir de eventos.

## Indicadores e MongoDB

Total de leilões, quatro contagens por estado persistido e soma de sequências como número de licitações confirmadas, do mesmo conjunto filtrado e independentes da página. Erros não se tornam zeros. Acrescenta-se a soma de `resultado.valorCent` **apenas** de leilões terminados com resultado vencedor, no mesmo conjunto filtrado: «Valor das ofertas vencedoras». Ofertas atuais de leilões ativos, resultados sem ofertas e cancelados não entram. Usa Decimal128 na agregação e soma inteira segura na fronteira do contrato; exceder o limite devolve 503 explícito, sem arredondar. Não representa receita recebida, lucro ou pagamento. A definição de receita e a conversão do lote em venda continuam fora do âmbito.

Cinco índices adicionais não únicos em auctions: `(createdAt desc, _id desc)`, `(estado, createdAt desc, _id desc)`, `(produtor, createdAt desc, _id desc)`, `(produto, createdAt desc, _id desc)` e `(iniciaEm, createdAt desc, _id desc)`. Todos os índices anteriores são preservados, incluindo unicidade de criação/licitante/seq quando aplicável. Não há novas coleções, migrações, alterações dos schemas de bids ou alterações de regras comerciais. Combinações arbitrárias podem exigir filtragem residual; orçamento temporal não constitui garantia de desempenho industrial.

Os indicadores administrativos de leilões contam estados persistidos. O indicador temporal «leilões ativos» do dashboard 8A tem a definição já documentada por prazo; numa transição ainda por materializar podem existir diferenças momentâneas, assinaladas no detalhe. Não se converte silenciosamente um estado expirado em resultado definitivo.

## Socket.IO: detalhe e subscrição global mínima

Reutiliza o namespace `/auctions`, path `/socket.io`, servidor HTTP, JWT, guardas e limites existentes.

- **Detalhe:** uma sala normal `leilao:<id>`, com `auction:join`, `auction:updated`, `auction:ended`, consulta de estado e cleanup. O cliente de 6C é reutilizado para reconexão, versões e rejeição de snapshots antigos/duplicados. Não se usa o hook de licitação/tentativas nem se disponibiliza qualquer ação bid no novo percurso.
- **Listagem:** extensão compatível `admin:auctions:watch` com corpo vazio e acknowledgement `{ok:true,data:{subscrito:true}}`. Só administrador atual pode subscrever. Recebe `admin:auctions:changed` com **apenas** `{consultar:true}`. Não é snapshot comercial, lista de participantes, ID de comprador, ordem de oferta ou resultado.

A subscrição global evita abrir uma ligação por cartão ou ultrapassar o limite existente de dez salas por socket. O servidor mantém um conjunto interno de subscritores, sem aceitar nomes de rooms administrativas do cliente. Revalida atividade/papel antes de cada publicação; remoção do papel/desativação impede a emissão e fecha a ligação. Nada administrativo é difundido nas rooms normais ou no namespace inteiro.

O publicador escuta `subscribeCommitted` existente, agrupa IDs (até 1000 por lote) e lê apenas versões pelo índice _id. Cache limitada a 5000 marcadores descarta notificações de operações sem mudança. Não agrega toda a coleção a cada publicação. Uma invalidação de recuperação a cada 15 s, só quando há subscritores, cobre mensagens perdidas e commits de outra instância; não é um log durável ou um SLA. O cliente agrupa invalidações durante 1,5 s e relê REST, sem aplicar campos comerciais vindos do evento.

Também no detalhe, as releituras motivadas por eventos/reconexão são agrupadas durante 1,5 s, evitando dois pedidos REST por cada evento numa disputa intensa. A atualização explícita e o limite de prazo continuam disponíveis.

No detalhe, o ID da rota é conhecido antes dos dados: não se abre uma subscrição global transitória enquanto se carrega a semente REST. O handshake é iniciado numa microtask cancelável, evitando ligações de efeitos já desmontados pelo StrictMode de desenvolvimento. As primeiras execuções reais expuseram essas tentativas redundantes ao atingir o limite existente de handshakes. Corrigiu-se o ciclo de vida do novo hook; **não se aumentaram limites nem se alteraram os testes antigos para contornar a proteção**. A navegação nova é verificada com no máximo três upgrades WebSocket por cenário listagem/detalhe/regresso.

## Consistência e recuperação

MongoDB/REST confirmam conteúdo; Socket.IO só indica novas observações. Uma mudança de versão na sala provoca releitura do detalhe e, depois, do histórico. Respostas de versões anteriores não substituem a última versão REST confirmada. Gaps e reconexão recuperam o estado; um histórico observado numa versão superior solicita atualização do detalhe. Eventos globais duplicados/fora de ordem apenas podem provocar uma nova consulta, coalescida, nunca regredir valores ou inventar ofertas.

Consultas são canceláveis e vinculadas à sessão/path. Dados não passam entre contas ou consultas diferentes; 401 segue a invalidação da sessão existente, 403 retira o conteúdo da consulta e oferece confirmar acesso. No refresh normal ou numa falha de rede conserva-se a última leitura, claramente identificada, sem afirmar uma nova confirmação. Existe recuperação periódica de 15 s enquanto a página está visível, além de foco/online, reconexão e atualização explícita. Desmontar ou terminar sessão remove listeners, temporizadores e sockets através do mecanismo de sessão existente.

Sem escrita otimista, comandos automáticos de licitação, geração de novas chaves, saltos de versão impostos pelo cliente ou alteração de fecho. Resultados só surgem do DTO confirmado. A atualização é eventual e limitada por rede, serviço e rate limiting; não se promete convergência instantânea durante indisponibilidade.

## Segurança e limitações

REST exige JWT válido, conta ativa e papel atual administrador, no middleware e novamente no serviço. Mantêm-se no-store, erros seguros, rate limiting administrativo 240/IP e 120/conta por minuto, por instância. Socket.IO mantém os limites anteriores (incluindo 30 tentativas de ligação/min por IP, oito sockets/conta e dez salas/socket), expiração/revalidação e CORS/proxy/HTTPS. A subscrição global aplica autorização administrativa própria; conhecer o nome do evento não concede acesso.

Nenhuma identidade de licitante é divulgada para além do pseudónimo HMAC aprovado. IDs públicos de produto/perfil e referência da conta produtora são usados para supervisão/filtros; não são IDs privados de compradores. Sem novas dependências, permissões, servidor paralelo, autenticação ou storage de JWT. Não há alteração/cancelamento administrativo, licitação, stock, pagamento, reembolso ou conversão do vencedor em encomenda nesta fase.

Pesquisa por referências completas, sem pesquisa textual por título ou seletor remoto. Datas UTC explícitas. Fotografia atual ilustrativa, com fallback quando o produto público deixou de estar disponível. Sem métricas de receita recebida, mecanismo distribuído de invalidação durável ou monitorização Cloud. Q relativas à receita e fases posteriores não são decididas por esta implementação.

## Interface e acessibilidade

Rotas `/area/administrador/leiloes` e `/area/administrador/leiloes/:id`, ligadas ao dashboard e à navegação privada existentes. Reutiliza cartões administrativos, Button, formulários, PriceDisplay, estados, AuctionImage, AuctionClock, layout, cliente HTTP e autenticação. Mantém cores, tipografia, espaços e identidade editorial; mobile em cartões, sem tabela larga.

Atualizações de fundo preservam foco e conteúdo. Labels, foco visível, paginação identificada, mensagens de erro com um único alerta, estados e loading distintos; o relógio não anuncia cada segundo. Teclado/Enter, nomes acessíveis, contraste calculado e árvores AX são verificados em Chrome nas larguras 320/430/768/1024/1280/1440 px. **VoiceOver audível não testado**; não se afirma certificação WCAG ou ensaio de todos os browsers/dispositivos físicos.

## Testes e revisão

Backend: filtros/datas/IDs, paginação/ordem, estados, indicadores, projeções privadas, consulta sem materializar transições, histórico snapshot, leitura de vencedor, papéis/conta inativa, ausência de escrita, subscrição global exclusiva, publicação minimizada, concorrência e fecho via infraestrutura existente. Teste unitário do publicador cobre deduplicação, recuperação e cleanup. Integração usa Express, JWT, Socket.IO e MongoDB reais.

Frontend: parsers, pseudónimos, resultado, versões, query, estados de rede/loading/vazio/403/404, navegação/paginação, subscrição global de leitura, coalescência, reconexão e cleanup. Cenários reais criam leilões e ofertas pelos endpoints existentes, disputam uma oferta entre dois compradores, verificam persistência e fecho, recuperam após offline e inspecionam as seis larguras.

O fixture backend de tempo real recebe opções de supervisão/lifecycle apenas para estes novos ensaios; os defaults dos testes antigos são preservados. O helper de contraste anterior recebe um seletor opcional, mantendo o default das encomendas. Não se alteram os corpos dos testes antigos de leilões, as suas regras ou dados para obter aprovação. Instabilidade histórica de segundos 00 em datetime-local é registada separadamente no relatório final, caso ocorra.

Capturas e evidências fora do Git quando `DOCAMPO_ADMIN_AUCTION_SCREENSHOTS` é um caminho temporário absoluto. Teste focado: `npx playwright test admin-auctions.real --config playwright.integration.config.ts`. O servidor de integração usa base efémera `docampo_test_web_*`, replica set de teste, contas fictícias e cleanup; não usa produção.

## Revisão manual isolada

Com Docker e dependências existentes, da raiz:

```sh
npm run mongo:test:up --workspace @docampo/api
```

Terminal da API, combinando os modos de revisão já existentes:

```sh
DOCAMPO_ADMIN_APPLICATION_REVIEW=1 DOCAMPO_AUCTION_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs
```

Terminal React:

```sh
VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183
```

A API comunica caminhos de ficheiros privados temporários, com contas administrativas e comprador/produtor fictícios. Consultar localmente esses ficheiros, sem copiar credenciais para Git/documentação. Abrir `http://127.0.0.1:5183/entrar`, entrar como administrador e escolher «Supervisionar leilões». Rever listagem/filtros/indicadores, detalhe e histórico. Noutro contexto de browser, um comprador pode apresentar uma oferta no percurso normal: confirmar a atualização administrativa sem comandos próprios de licitação. Rever os lotes agendado/terminado/cancelado do modo existente, perda de ligação, recuperação e teclado.

Não executar esses modos em paralelo com Playwright real, pois usam as mesmas portas. Ctrl+C na API encerra os sockets, remove a base efémera e os ficheiros privados de credenciais. Os modos de revisão não são importados pelo runtime de produção.

## Validação final da entrega local

Validações executadas em 30/10/2026, com dependências existentes e bases efémeras de teste:

| Conjunto                                              | Resultado final                                             |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| Backend completo, incluindo MongoDB e Socket.IO reais | 1747 testes aprovados, 50 ficheiros, execução com um worker |
| Frontend habitual completo                            | 594 testes aprovados                                        |
| Integrações reais React/API/MongoDB/Socket.IO         | 110 testes aprovados                                        |
| Regressões reais dos leilões de 6C                    | 12 testes aprovados                                         |

São 716 testes frontend distintos e 1747 backend. A fase acrescenta 35 testes backend e 29 frontend. Depois das suites completas, corrigiu-se apenas o nome da captura de resultado para indicar a largura efetiva do viewport, repetindo o cenário real de concorrência e fecho. Não houve alteração funcional posterior às validações completas.

TypeScript API/frontend, ESLint da raiz, Prettier com ignore explícito da raiz, builds API/frontend, esquema OpenAPI, referências internas, respostas administrativas reais contra os esquemas, ligações Markdown e `git diff --check` aprovados. Sem dependências novas, segredos detetados ou alterações aos nove documentos originais da Fase 0. Inventário local: **32 ficheiros, 17 novos e 15 modificados**.

A revisão integrada usa Chrome real nas seis larguras e guarda 39 capturas fora do repositório: 36 de listagem/detalhe/oferta/erro/recuperação/vazio, uma de resultado confirmado e duas do modo manual com quatro estados e oferta real. Verificados teclado, labels, árvores de acessibilidade, foco, controlos e contraste; VoiceOver audível permanece por testar. O modo manual também foi exercitado e os seus processos, base efémera e ficheiros privados de contas foram encerrados/removidos.

### Ocorrências de ambiente e repetições

Uma execução paralela de backend/browser encontrou 11 falhas temporais e uma primeira execução dos leilões reais encontrou um estado ainda ativo. O trace dessa execução regista cerca de **135 segundos de diferença entre o relógio HTTP/host e o `$$NOW` do MongoDB**: o fixture tinha vencido pelo relógio do host, mas ainda não pelo relógio autoritativo da base. Uma medição posterior confirmou alinhamento com diferença de 2 ms. Sem alterar relógios, regras comerciais ou testes antigos, a repetição completa do backend com um worker passou os 1747 testes e a repetição dos leilões passou os 12 testes. Não se afirma uma correção permanente do ambiente; os ensaios temporais requerem relógios alinhados.

A instabilidade histórica de `datetime-local` com segundos `00` não ocorreu na repetição final. As tentativas redundantes de handshake do novo hook, identificadas nos primeiros testes focados, foram corrigidas no ciclo de vida desta fase, sem elevar os limites de segurança. Todas estas ocorrências e logs ficam separados dos resultados finais aprovados no relatório temporário.

## Estado de entrega

Implementação exclusivamente local, sem staging, commits, push, merge, rebase, PR ou início da Fase 9. Nove documentos originais da Fase 0 preservados. Proposta, dependente de autorização posterior: `feat(admin): add auction supervision`, para `origin/feat/api-foundation`. Resultados finais e inventário completo acompanham o relatório de entrega.
