# Rastreabilidade e validação documental — Fase 3.0

Estado: 44 operações comerciais/futuras propostas e uma operação técnica implementada localmente em 3.1; sem schemas comerciais nem publicação. Complementa [README](README.md), [questões Q/C](decisions.md), [modelos](data-mapping.md), [segurança](security.md), [integração](frontend-integration.md) e [plano](implementation-plan.md). Nenhum requisito é marcado implementado apenas por existir OpenAPI.

## Correspondência académica

| Fonte / requisito           | Evidência documental                                                                                                                                                         | Limite ou dependência                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E p. 14; ENT-02/03          | OpenAPI inicial e sequência 3.1–3.7/4.                                                                                                                                       | Esboço não é M2: faltam API, dados, segurança e SPA integrada.                                                                                                                           |
| E p. 17; RF-API-01          | GET /products 200; POST 201 + Location obrigatório; PUT /products/{id} 200; DELETE 204 sem corpo; POST /orders; PATCH /orders/{id}/estado; erros 400/401/403/404. Base /api. | Contrato preservado; testar respostas reais nas subfases futuras. C02 aprova erro estruturado e 409/500; 503 e detalhes remanescentes são propostas.                                     |
| E p. 18; RNF-CON-02         | users/products/orders/auctions/bids; linhas embebidas e comprador/produtor referenciados; validação schema e consultas planeadas.                                            | Q/modelos precisam de aprovação; operators MongoDB não são executados nesta fase. Demonstração com pelo menos um dos operadores satisfaz a lista formal; usar outros quando pertinentes. |
| E p. 19; RF-API-02          | OpenAPI 3.0.3, parâmetros, pedidos/respostas, components/schemas, bearerAuth e mapa de recursos.                                                                             | Swagger UI /api-docs é futuro na semana 4; não existe serviço de documentação publicado.                                                                                                 |
| E p. 20; RF-AUT/RNF-SEG     | Registo/login, papéis e matriz; expiração, bcrypt, segredos/HTTPS documentados.                                                                                              | C04 aprovada mantém segurança na semana 4; Q01/Q04/Q13 antes da ativação de operações privadas; sem emissão de JWT ou persistência nesta etapa.                                          |
| RF-CAT-01–04                | Produtos/perfis/avaliações públicos, pesquisa/filtros e resumo público de leilões.                                                                                           | Ingredientes/taxonomias Q14, elegibilidade Q04, mapa Q11 e observação Q09.                                                                                                               |
| RF-PRO-01–04                | CRUD próprio, perfil, indicadores e disponibilidade.                                                                                                                         | Remoção Q12, limiar Q15; fotografias Blob/gestão de upload são fase própria, não omitidas como se concluídas.                                                                            |
| RF-ENC-02–05                | Criação, consulta e PATCH estado, snapshots e privacidade.                                                                                                                   | Q02/Q05/Q06; tempo real das encomendas é Fase 5, pagamentos não inventados.                                                                                                              |
| RF-AVA-01/02                | Avaliações dos dois alvos após entrega, denúncias e decisão administrativa.                                                                                                  | Q10/Q12; outros conteúdos não ganham endpoints/poderes sem decisão.                                                                                                                      |
| RF-LEI-01–07; RNF-CON-01/03 | Modelos/consultas/criação proposta, bids separados, invariantes e protocolo Socket.IO referenciado.                                                                          | Q07–Q09/D06; REST inicial não implementa licitar, presença, relógio ou fecho.                                                                                                            |
| RF-ADM-01/02                | Consultas globais, candidaturas, moderação, indicadores e observações dos cinco serviços.                                                                                    | Atualização em tempo real Fase 5; sondas Cloud Fase 6/Q16; sem alegação de operacionalidade.                                                                                             |
| D05/D06/D08/D09             | Cêntimos/snapshots, transações e coleções adicionais analisados.                                                                                                             | Propostas, não novas exigências académicas nem aceitação automática. Notifications persistente é melhoria opcional.                                                                      |

## Inventário de operações

Métodos/caminhos abaixo são extraídos do [openapi.yaml](openapi.yaml). A base é /api. Papéis de acesso público incluem os três papéis autenticados, sem exigir token. Q são dependências pendentes; C01/C02/C04/C06 aprovadas no âmbito do registo, C03/C05 e detalhes não escolhidos continuam pendentes. A fase é previsão de implementação, não autorização.

| Método | Caminho                               | operationId              | Papéis propostos                              | Q pendentes                                 | Fase |
| ------ | ------------------------------------- | ------------------------ | --------------------------------------------- | ------------------------------------------- | ---- |
| GET    | `/health`                             | `getHealth`              | visitante, comprador, produtor, administrador | —; diagnóstico HTTP implementado localmente | 3.1  |
| POST   | `/auth/registo`                       | `register`               | visitante, comprador, produtor, administrador | Q01, Q04, Q13                               | 4    |
| POST   | `/auth/login`                         | `login`                  | visitante, comprador, produtor, administrador | Q01, Q04, Q13                               | 4    |
| GET    | `/me`                                 | `getMe`                  | comprador, produtor, administrador            | Q01, Q13                                    | 4    |
| GET    | `/producers`                          | `listProducers`          | visitante, comprador, produtor, administrador | Q04, Q11, Q12                               | 3.3  |
| GET    | `/producers/{id}`                     | `getProducer`            | visitante, comprador, produtor, administrador | Q04, Q11, Q12                               | 3.3  |
| GET    | `/me/producer`                        | `getOwnProducer`         | produtor                                      | Q01, Q04                                    | 3.3  |
| PUT    | `/me/producer`                        | `replaceOwnProfile`      | produtor                                      | Q04, Q11, Q12                               | 3.3  |
| GET    | `/me/producer/application`            | `getOwnApplication`      | produtor                                      | Q04                                         | 3.3  |
| GET    | `/products`                           | `listProducts`           | visitante, comprador, produtor, administrador | Q03, Q04, Q06, Q12, Q14                     | 3.3  |
| POST   | `/products`                           | `createProduct`          | produtor                                      | Q03, Q04, Q06, Q14, Q15                     | 3.3  |
| GET    | `/products/{id}`                      | `getProduct`             | visitante, comprador, produtor, administrador | Q03, Q04, Q06, Q12, Q14                     | 3.3  |
| PUT    | `/products/{id}`                      | `replaceProduct`         | produtor                                      | Q03, Q04, Q06, Q12, Q14, Q15                | 3.3  |
| DELETE | `/products/{id}`                      | `deleteProduct`          | produtor                                      | Q04, Q07, Q12                               | 3.3  |
| GET    | `/me/products`                        | `listOwnProducts`        | produtor                                      | Q03, Q04, Q12, Q14, Q15                     | 3.3  |
| GET    | `/orders`                             | `listOwnOrders`          | comprador, produtor                           | Q01, Q02, Q05                               | 3.4  |
| POST   | `/orders`                             | `createOrders`           | comprador                                     | Q02, Q03, Q04, Q05, Q06                     | 3.4  |
| GET    | `/orders/{id}`                        | `getOwnOrder`            | comprador, produtor                           | Q01, Q02, Q05, Q06                          | 3.4  |
| PATCH  | `/orders/{id}/estado`                 | `changeOrderState`       | produtor                                      | Q04, Q05                                    | 3.4  |
| GET    | `/products/{id}/reviews`              | `listProductReviews`     | visitante, comprador, produtor, administrador | Q10, Q12                                    | 3.5  |
| GET    | `/producers/{id}/reviews`             | `listProducerReviews`    | visitante, comprador, produtor, administrador | Q10, Q12                                    | 3.5  |
| GET    | `/me/reviews`                         | `listOwnReviews`         | comprador                                     | Q10, Q12                                    | 3.5  |
| POST   | `/reviews`                            | `createReview`           | comprador                                     | Q10, Q12                                    | 3.5  |
| POST   | `/reviews/{id}/reports`               | `reportReview`           | comprador, produtor, administrador            | Q10, Q12                                    | 3.5  |
| GET    | `/auctions`                           | `listAuctions`           | visitante, comprador, produtor, administrador | Q04, Q07, Q08, Q09                          | 3.6  |
| POST   | `/auctions`                           | `createAuction`          | produtor                                      | Q03, Q04, Q06, Q07, Q08                     | 3.6  |
| GET    | `/auctions/{id}`                      | `getAuction`             | comprador, produtor, administrador            | Q07, Q08, Q09                               | 3.6  |
| GET    | `/auctions/{id}/bids`                 | `listAuctionBids`        | comprador, produtor, administrador            | Q08, Q09                                    | 3.6  |
| GET    | `/me/auctions`                        | `listOwnAuctions`        | produtor                                      | Q04, Q07, Q08                               | 3.6  |
| GET    | `/me/bids`                            | `listOwnBids`            | comprador                                     | Q08, Q09                                    | 3.6  |
| GET    | `/me/producer/indicators`             | `getProducerIndicators`  | produtor                                      | Q05, Q06, Q15                               | 3.5  |
| GET    | `/admin/users`                        | `listAdminUsers`         | administrador                                 | Q01, Q13                                    | 3.5  |
| GET    | `/admin/users/{id}`                   | `getAdminUser`           | administrador                                 | Q01, Q13                                    | 3.5  |
| GET    | `/admin/producers`                    | `listAdminProducers`     | administrador                                 | Q04, Q12                                    | 3.5  |
| GET    | `/admin/applications`                 | `listApplications`       | administrador                                 | Q04                                         | 3.5  |
| GET    | `/admin/applications/{id}`            | `getApplication`         | administrador                                 | Q04                                         | 3.5  |
| PATCH  | `/admin/applications/{id}/decision`   | `decideApplication`      | administrador                                 | Q04                                         | 3.5  |
| GET    | `/admin/orders`                       | `listAdminOrders`        | administrador                                 | Q02, Q05, Q06                               | 3.5  |
| GET    | `/admin/orders/{id}`                  | `getAdminOrder`          | administrador                                 | Q02, Q05, Q06                               | 3.5  |
| GET    | `/admin/review-reports`               | `listModerationCases`    | administrador                                 | Q10, Q12                                    | 3.5  |
| GET    | `/admin/review-reports/{id}`          | `getModerationCase`      | administrador                                 | Q10, Q12                                    | 3.5  |
| PATCH  | `/admin/review-reports/{id}/decision` | `decideModeration`       | administrador                                 | Q10, Q12                                    | 3.5  |
| GET    | `/admin/auctions`                     | `listAdminAuctions`      | administrador                                 | Q07, Q08, Q09                               | 3.6  |
| GET    | `/admin/indicators`                   | `getAdminIndicators`     | administrador                                 | Q04, Q05, Q10, Q15                          | 3.5  |
| GET    | `/admin/services`                     | `getServiceObservations` | administrador                                 | Q16                                         | 6    |

45 operações em 39 caminhos e 49 schemas de DTO/entrada/tipos auxiliares: uma operação técnica local e 44 operações comerciais/futuras bloqueadas. Não confundir essa contagem com coleções MongoDB ou endpoints implementados. As candidaturas usam o ID do perfil produtor; ModerationCase é projeção de review/denúncias, sem exigir coleção autónoma.

## Método de validação

Ferramentas já existentes: Python/PyYAML para leitura estrita de YAML e chaves duplicadas; jsonschema para validar a estrutura contra o schema oficial OpenAPI 3.0; verificação adicional de refs internas, operationId único, parâmetros de caminho, respostas/security e ligações documentais. Prettier instalado no monorepo, dirigido aos documentos desta pasta. Não instalar openapi-spec-validator, Swagger CLI ou bibliotecas para este fim.

Fontes técnicas consultadas: [especificação OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html) e [schema oficial OAS 3.0 de 2024-10-18](https://spec.openapis.org/oas/3.0/schema/2024-10-18). O schema é documento de validação lido em memória, não dependência de execução ou ficheiro acrescentado ao projeto. Validar refs locais e invariantes sem assumir que jsonschema verifica semântica comercial ou executa a API.

Verificar também a igualdade byte a byte dos nove documentos F0 com c10d031, inexistência de diff/staging em ficheiros originais e que só docs/api tem ficheiros novos. Não executar build/testes de aplicação apenas por documentação: a referência anterior continua 274 testes aprovados, não uma nova execução declarada nesta subfase.

## Resultado da versão documental inicial, anterior à aprovação parcial

Registo histórico das verificações da primeira versão (o hash abaixo identifica essa versão, não o ficheiro atualizado após aprovação):

| Verificação                | Resultado observado                                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estrutura OpenAPI 3.0.3    | Aprovada com jsonschema/Draft4Validator contra o schema oficial OAS 3.0; zero erros estruturais.                                                                                                         |
| YAML                       | Sem chaves duplicadas; leitura com PyYAML.                                                                                                                                                               |
| Referências internas       | 478 referências resolvidas, sem referências externas de componentes ou irmãos inválidos de Reference Object.                                                                                             |
| Inventário e permissões    | 44 operationId únicos, 38 caminhos, 48 schemas; todas as operações constam do inventário e da matriz. Parâmetros de caminho, corpos, autenticação e respostas verificados.                               |
| Obrigações REST académicas | Métodos/caminhos/status exigidos preservados; Location obrigatório na criação de produto; 204 sem corpo.                                                                                                 |
| Questões e plano           | Q01–Q16 analisadas; sete subfases 3.1–3.7; dependências e estados pendentes explícitos.                                                                                                                  |
| Ligações Markdown          | 34 ligações locais verificadas nesta pasta; zero destinos ou âncoras em falta.                                                                                                                           |
| Formatação                 | Prettier instalado: oito ficheiros aprovados.                                                                                                                                                            |
| Integridade/âmbito         | Nove documentos F0 iguais byte a byte a c10d031; apenas oito ficheiros novos em docs/api; nenhum ficheiro anterior modificado ou staged. Sem credenciais ou artefactos gerados entre os novos ficheiros. |
| Git                        | feat/admin-dashboard em 807aa68 e main em c10d031, sem alteração; sem nova branch, staging, commits, push, merge ou PR.                                                                                  |

SHA-256 do schema oficial consultado: `2385f5bbb8c37878daae73baeabe7f34b2f022a4a8c049329ee61f71796f039c`. SHA-256 do openapi.yaml validado: `628884f298b3e0151959a969e689b5e4d5da54d28045aba89ade634a775fb392`. A primeira leitura HTTPS pelo urllib encontrou um problema de certificados locais; a leitura foi concluída com curl do sistema e verificação TLS ativa, sem instalar certificados/bibliotecas nem desativar verificação.

Uma validação estrutural aprovada não aprova recomendações Q/C, não executa endpoints e não prova regras comerciais, autorização, atomicidade ou integração. Não se executaram suites/build de aplicação nesta subfase documental; os 274 testes anteriores e respetivos ficheiros foram preservados. Nada nesta entrega inicia a Fase 3.1.

## Revisão após aprovação parcial — 2026-10-15

C01/C02/C04/C06 foram registadas como aprovadas exclusivamente no âmbito indicado pelo utilizador. Q01–Q16 e C03/C05 permanecem pendentes. C04 fixa autenticação/autorização reais na semana 4 e bloqueio de todas as operações privadas até à implementação dessa segurança. A nova proposta de entrada técnica não autoriza executar 3.1 nem instalar as versões apresentadas.

Foram atualizados os oito documentos complementares existentes e acrescentado phase-3.1-proposal.md: nove documentos locais em docs/api. As alterações ao OpenAPI são de descrição/estado documental; não acrescentam operações, parâmetros ou modelos comerciais.

| Verificação repetida       | Resultado                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema oficial OpenAPI 3.0 | jsonschema/Draft4Validator: zero erros; schema consultado em memória por HTTPS com verificação TLS ativa.                                            |
| YAML e referências         | Sem chaves duplicadas; 478 referências internas resolvidas.                                                                                          |
| Inventário e permissões    | Mantidos 44 operationId únicos, 38 caminhos e 48 schemas; operações presentes na matriz e inventário; parâmetros, respostas e bloqueios verificados. |
| Âmbito da aprovação        | C01/C02/C04/C06 nas extensões de aprovadas; C03/C05 nas pendentes; todas as operações continuam documentalmente bloqueadas pelas Q indicadas.        |
| Ligações locais            | 41 ligações Markdown verificadas, sem destinos ou âncoras em falta.                                                                                  |
| Formatação                 | Prettier já instalado: nove documentos aprovados; sem instalação de ferramentas.                                                                     |
| Integridade                | Nove documentos F0 iguais byte a byte a c10d031; código, configurações, testes e lockfile existentes sem alterações; staging vazio.                  |
| Git                        | feat/admin-dashboard em 807aa68, main em c10d031; nenhuma mutação Git executada.                                                                     |
| Testes de aplicação        | Não executados nesta revisão documental; 274 Playwright é a referência aprovada anterior, não uma nova execução.                                     |

SHA-256 do OpenAPI desta revisão: `1ea747f3fb31382f5097296e463f93ac8112a04ef0846498388408e4172710dd`. O schema oficial mantém SHA-256 `2385f5bbb8c37878daae73baeabe7f34b2f022a4a8c049329ee61f71796f039c`.

Versões e requisitos foram consultados nos metadados públicos npm e documentação oficial; Node/npm/mongod locais foram apenas identificados. Não se conectou a MongoDB, não se iniciou Docker, não se descarregaram imagens/pacotes e não se validou a prontidão de infraestrutura. A compatibilidade executada, o ensaio de transações e a suite de aplicação pertencem à futura implementação autorizada.

## Execução autorizada da fundação 3.1 — 2026-10-16

O utilizador autorizou posteriormente implementação/instalação locais e a criação de feat/api-foundation a partir de 807aa68. A proposta histórica foi ajustada para manter Node 22.21.1/npm 10.9.4 e usar MongoDB 8.0.34 com replica set de membro único. Os nove documentos locais anteriores continuam presentes. Esta autorização não inclui staging, commit, push, merge, PR ou Fase 3.2.

| Verificação executada           | Resultado final                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend antes da implementação | Build de produção aprovado.                                                                                                                                                            |
| Dependências                    | Engines/peers confirmados antes de instalar; npm ls válido; nenhuma versão de pacote preexistente alterada no lockfile.                                                                |
| TypeScript                      | API e frontend aprovados separadamente.                                                                                                                                                |
| ESLint                          | Monorepo aprovado, incluindo código e testes novos da API.                                                                                                                             |
| Prettier                        | Verificação da raiz e documentação complementar aprovadas.                                                                                                                             |
| Build                           | API e frontend aprovados; JavaScript compilado da API executado com Node 22.21.1, sem tsx.                                                                                             |
| Unidade / HTTP / integração     | 49 testes aprovados em quatro ficheiros: 19 unidade, 22 HTTP, 8 integração MongoDB real. Sem integração omitida ou substituída por mocks.                                              |
| Evidência MongoDB               | Mongoose conectado a 8.0.34; rs-dcm-test, um membro/primário; nenhum modelo comercial registado.                                                                                       |
| Commit técnico                  | Duas escritas técnicas persistidas na mesma transação.                                                                                                                                 |
| Rollback técnico                | Falha após primeira escrita: zero documentos persistidos. Segundo ensaio preserva documento anterior após abortar atualização/inserção.                                                |
| Ciclo de vida                   | Falha de conexão normalizada; configuração inválida não inicia HTTP; porta ocupada liberta conexão; encerramento idempotente/limitado; SIGTERM termina com código 0.                   |
| Verificação compilada           | GET /api/health HTTP 200 e resposta técnica esperada; SIGTERM/saída 0, mensagens de arranque/encerramento sem segredos.                                                                |
| Playwright                      | 274 testes aprovados com Chrome, quatro workers, retries 0; duração 2,8 minutos. Ficheiros de testes web preservados.                                                                  |
| OpenAPI                         | Zero erros contra schema oficial; 45 operações/39 caminhos/49 schemas, 483 refs internas válidas. Apenas getHealth implementado localmente; 44 operações futuras continuam bloqueadas. |
| Ligações documentais            | 55 ligações locais válidas em docs/api e README da API.                                                                                                                                |
| Preservação                     | Frontend byte a byte igual ao estado inicial; nove F0 byte a byte iguais a c10d031; root package.json e configurações web intactos; nenhum ficheiro anterior eliminado.                |
| Git                             | feat/api-foundation em 807aa68; main e origin/main em c10d031; staging vazio, nenhuma publicação ou reescrita.                                                                         |

SHA-256 do OpenAPI nesta entrega: `18e992ce784e518b6b131f08bd711f97a190c2f6549440d7df64cf16597e3802`. O schema oficial OAS usado permanece `2385f5bbb8c37878daae73baeabe7f34b2f022a4a8c049329ee61f71796f039c`. A cobertura de uma operação técnica não aprova os restantes contratos comerciais.

A primeira execução de testes dentro da sandbox não conseguiu abrir sockets/aceder ao MongoDB local; foi interrompida e repetida com a permissão necessária, passando integralmente. Uma infração ESLint de quebra de linha num teste e uma diferença de formatação foram corrigidas antes dos resultados finais. Sem alteração dos testes web ou de funcionalidades aprovadas.

O replica set de teste foi parado após as verificações; o de desenvolvimento fica disponível em 127.0.0.1:27018. Os processos API dos ensaios foram encerrados. Não houve atualização global de Node/npm, criação de .env privado, recursos Cloud ou integração frontend/API. Q01–Q16 e C03/C05 continuam pendentes.
