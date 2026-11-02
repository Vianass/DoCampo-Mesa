# Fase 12 — Swagger UI, conformidade REST e preparação para produção

## Âmbito e fontes

Implementação local sobre `63079bf7b07d81ba97a6a7f2b7425ef24dff88a9`, na branch `feat/api-foundation`. Sem deployment, contas Cloud, contratação de serviços ou alterações à main. Os nove documentos originais da Fase 0 permanecem preservados.

O enunciado académico original foi consultado integralmente (27 páginas). A matriz da auditoria 11.0 foi usada como referência histórica; as entregas posteriores prevalecem sobre as lacunas entretanto resolvidas.

| Referência do PDF                                                               | Natureza                                                   | Tratamento nesta fase                                                                 |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| p. 15: Bootstrap grid, cards, forms e navegação; Sass; breakpoints              | Requisito literal                                          | Grid responsiva no diretório, cards e navbar Bootstrap, formulários e Sass existentes |
| p. 17: CRUD `/api/products`, POST `/api/orders`, PATCH `/api/orders/:id/estado` | Requisito literal                                          | CRUD e checkout preservados; compatibilidade segura para o PATCH                      |
| p. 4 e exemplo p. 18: estado entregue                                           | Terminologia funcional e exemplo de schema                 | Mapeamento na fronteira do PATCH, sem migração de estados                             |
| p. 18: collections e operadores                                                 | Requisito; basta pelo menos um operador da lista           | Coleções e operadores existentes confirmados, sem migrações destrutivas               |
| p. 19: Swagger UI em `/api-docs`                                                | Requisito literal                                          | Interface real, OpenAPI 3, testes e Bearer Authorize                                  |
| p. 20: bcrypt                                                                   | Requisito literal com divergência aprovada pelo utilizador | Argon2id para novas passwords; bcrypt legado; aceitação académica formal pendente     |
| p. 21: atomicidade e tempo do servidor                                          | Requisito literal                                          | Regras e testes de leilões preservados                                                |
| p. 22: código de atualização do produtor                                        | Exemplo ilustrativo                                        | Não permite ao produtor confirmar a receção pelo comprador                            |
| p. 23: Cloud, Atlas, armazenamento e HTTPS/WSS                                  | Requisito da entrega publicada                             | Preparação local; comprovação externa pertence à Fase 13                              |

## Swagger UI real

Abrir `/api-docs` no servidor da API. `/api-docs/openapi.json` fornece o contrato OpenAPI 3.0.3 das operações realmente montadas nesse processo. A interface usa `swagger-ui-dist` **5.34.1** e `yaml` **2.9.1**, com versões exatas. O lockfile acrescenta também `@scarf/scarf` 1.4.0; a instalação foi executada sem scripts e com analytics desativados. Não foi alterada nenhuma versão preexistente.

Os recursos JS/CSS são servidos localmente, sem CDN ou validador remoto. Configuração por query está desativada. O interceptor só permite pedidos para esta origem e os caminhos da API. A CSP específica da documentação admite os estilos dinâmicos necessários ao Swagger; a CSP restritiva das respostas da API mantém-se. Não existe `unsafe-eval` nem scripts inline na documentação.

**Authorize** aceita um JWT fornecido pelo visitante. O token fica apenas na memória da página: não é predefinido, colocado em URLs ou persistido em localStorage/sessionStorage. Atualizar a página elimina a autorização. O Swagger executa pedidos reais no ambiente atual; a revisão deve usar exclusivamente contas fictícias e MongoDB de teste.

O arranque recolhe métodos e caminhos dos routers Express efetivamente montados, incluindo routers administrativos aninhados, e verifica a existência do respetivo contrato. Uma operação montada sem documentação impede o arranque. Routers sem registo de prefixo também falham explicitamente. Os testes fixam a integração com Express 5; uma atualização desta dependência exige rever o inventário.

O processo completo com armazenamento configurado publica **76 operações únicas**. Propostas antigas explicitamente bloqueadas continuam no ficheiro de planeamento [openapi.yaml](openapi.yaml), mas não são apresentadas como endpoints disponíveis no Swagger. Os componentes sem referências são removidos do JSON publicado. Um processo sem adaptador de fotografias não anuncia esses endpoints como operacionais.

Cobertura: autenticação, utilizadores administrativos, produtores/candidaturas/perfis, produtos/fotografias/pesquisa, checkout/encomendas/pagamentos declarativos, avaliações, leilões/licitações, supervisão, denúncias/moderação e diagnóstico. O carrinho continua local no React; não existe endpoint de carrinho persistido. Os pagamentos existentes representam comunicação/confirmação do pagamento, sem gateway ou cobrança automática.

O contrato é verificado durante o arranque. Reiniciar a API depois de alterar o YAML em desenvolvimento; em produção, gerar um novo build e reiniciar o processo.

O build compila o YAML em `dist/documentation/openapi.json` e copia o inicializador e os estilos. A distribuição da API não depende do caminho do repositório ou de `docs/` em produção. Usar o build completo, não apenas executar `tsc`.

## Compatibilidade REST e estados

GET/POST `/api/products` e PUT/DELETE `/api/products/:id` mantêm os serviços, permissões e validações existentes. POST `/api/orders` mantém o checkout transacional e Idempotency-Key, sem duplicação da lógica.

O novo `PATCH /api/orders/:id/estado` reutiliza exclusivamente os serviços atuais:

| Ação       | Corpo JSON                                                      | Autoridade e serviço                                              |
| ---------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Preparação | `{ "estado": "confirmada" }`, depois `em_preparacao` e `pronta` | Produtor proprietário; serviço de preparação existente            |
| Receção    | `{ "estado": "entregue", "confirmarRececao": true }`            | Comprador proprietário; serviço transacional de receção existente |

Usar o **ETag do detalhe correspondente ao papel**: GET `/api/me/producer/orders/:id` para o produtor; GET `/api/orders/:id` para o comprador. Não são intercambiáveis. `If-Match` é obrigatório e forte. A API mantém 428 sem precondição, 400 para formato inválido, 412 para versão desatualizada, 409 para transição proibida e as regras de recuperação já existentes.

A resposta deste alias inclui `estadoPersistido`. Apenas o estado de topo `concluida` é apresentado como `entregue`; o MongoDB continua com `concluida`. Históricos, auditoria e eventos Socket.IO mantêm os valores originais. O comprador continua a ser o único que confirma a receção, exclusivamente a partir de `pronta`.

Os endpoints canónicos `/api/me/producer/orders/:id/status` e `/api/orders/:id/receipt`, o frontend e os contratos já consumidos não mudam. Não existe confirmação administrativa ou do produtor em nome do comprador. Stock, reservas, snapshots, pagamentos, vencedor e regras de licitação não são alterados pelo alias.

## JWT, hashing e decisão do utilizador

JWT HS256, expiração, issuer/audience, leitura atualizada da conta/papéis/capacidades e bloqueio de contas inativas continuam a ser verificados no backend. Logout não promete revogação imediata de tokens emitidos. JWT continua apenas em memória no frontend.

**Decisão explícita do utilizador na Fase 12:** manter Argon2id para novas passwords e bcrypt para hashes antigos, registando a divergência académica. Não houve troca de algoritmo nem recálculo de hashes nesta fase. Argon2id mantém 19 MiB, duas iterações e paralelismo 1.

A página 20 menciona bcrypt como requisito; a opção técnica aprovada pelo utilizador **não demonstra aceitação pelo docente**. Esta divergência deve ser apresentada na defesa/relatório e confirmada academicamente, sem alegar conformidade literal já obtida. Referência técnica: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## Segurança, uploads e privacidade

- CORS aceita apenas origens configuradas e a própria origem HTTP da API, necessária aos pedidos do Swagger. Não há wildcard ou cookies de autenticação. As origens de produção têm de ser HTTPS.
- HTTPS obrigatório em produção; `X-Forwarded-Proto` só é aceite através dos IPs de proxy explicitamente confiáveis. A configuração do fornecedor ainda precisa de confirmação na Fase 13.
- Payloads estritos, identificadores, limites, pesquisa, filtros e projeções são validados no backend. Erros permanecem estruturados, sem stack traces, URIs ou detalhes internos nas respostas.
- Não foi introduzida renderização HTML de conteúdo de utilizadores ou SVG enviado. O Swagger serve um contrato controlado pelo projeto, sem especificações remotas arbitrárias.
- Fotografias continuam limitadas a JPEG/PNG/WebP, 5 MiB e 16 megapíxeis, com correspondência MIME/bytes, sem animações, normalização para WebP, remoção de metadados por recodificação e limites de concorrência/tempo. A autorização e o ETag precedem a associação ao produto/perfil.
- A leitura de fotografias respeita proprietário, aprovação, conta ativa e moderação. Copiar uma URL não concede direitos de alteração.
- Não existem tokens, passwords, hashes ou dados privados predefinidos no Swagger. Os exemplos são fictícios; testes não criam utilizadores de produção.
- A API conserva mensagens de arranque/erro genéricas, sem logar bodies, JWT ou URIs. A auditoria funcional persistida é preservada.

## MongoDB

As coleções obrigatórias `users`, `products`, `orders`, `auctions` e `bids` já existem. Há ainda perfis de produtores, recibos, avaliações, denúncias, auditoria e metadados de imagens. Campos obrigatórios, enums, limites, índices únicos/compostos e validações partilhadas permanecem nos modelos existentes.

As encomendas incorporam linhas/snapshots históricos e referenciam contas/produtores. Os modelos de leilões e ofertas preservam referências, reservas e operações atómicas. Existem utilizações reais de `$regex`, `$gte`, `$lte` e `$lt`; o PDF exige pelo menos um dos operadores exemplificados, não quatro funcionalidades independentes.

Checkout, receção, moderação e comandos concorrentes conservam as transações e controlo de versões existentes. A preparação Atlas exige replica set com transações, nome de base explícito, utilizador com privilégio mínimo, TLS, regras de rede e políticas de backup/retenção. Não foi efetuada qualquer ligação Atlas nesta fase.

## Bootstrap e Sass

A aplicação já usava Bootstrap, grid, formulários e navegação, mas faltava evidência inequívoca de cards e navbar. Foram importados os partials `card` e `navbar`, aplicadas as classes aos componentes existentes e usada a grid `row`/`col-*` no diretório de produtores. Não se adicionou outra biblioteca de UI ou JavaScript Bootstrap.

Os estilos editoriais continuam a controlar cor, tipografia, bordas e espaçamentos. A grid mantém uma coluna em mobile, duas a partir de 768 px e três a partir de 1024 px. Sass continua com variáveis, mixins, partials e breakpoints 768/1024/1280. As alterações são verificadas nas seis larguras 320/430/768/1024/1280/1440.

## Preparação de produção

Exemplos sem segredos: [API](../../apps/api/.env.production.example) e [frontend](../../apps/web/.env.production.example). Os domínios `.invalid` são marcadores, não serviços publicados. Os ficheiros `.env` reais continuam ignorados.

| Configuração                     | Comportamento                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV=production`            | Segurança HTTPS e restrições de produção                                                |
| `API_HOST`                       | Por omissão `0.0.0.0` em produção; `127.0.0.1` em desenvolvimento                       |
| `API_PORT` / `PORT`              | API_PORT explícita tem prioridade; PORT permite a porta injetada pelo PaaS              |
| `MONGODB_URI`, `MONGODB_DB_NAME` | Injetados no servidor; nunca no build React                                             |
| `JWT_SECRET`                     | Segredo aleatório de pelo menos 32 bytes, base64url, injetado pelo gestor do fornecedor |
| `CORS_ORIGINS`                   | Origens HTTPS exatas do frontend                                                        |
| `TRUSTED_PROXY_IPS`              | Apenas IPs efetivos dos proxies confiáveis, sem confiança global                        |
| `VITE_API_URL`                   | `/api` por reverse proxy ou origem HTTPS pública da API; configuração pública de build  |
| `SOCKET_ENABLED`, intervalos     | Configuração técnica existente, sem mudar regras de leilão                              |

Sequência de build/arranque: `SCARF_ANALYTICS=false npm ci`, `npm run build --workspace @docampo/api`, `npm run build --workspace @docampo/web`, e `npm start --workspace @docampo/api`. O PaaS deve encaminhar todas as rotas SPA para o index React e os caminhos da API/Socket.IO para o backend correto. `vite preview` não substitui esse encaminhamento nem um servidor de produção.

GET `/api/health` conserva a resposta de liveness do processo HTTP. GET `/api/ready` consulta MongoDB por ping limitado, com 200 disponível/503 indisponível, sem expor URI, nome de base ou fornecedor. O limite HTTP e o timeout evitam consultas de diagnóstico ilimitadas. A prontidão não garante que todos os serviços Cloud ou adaptadores estejam disponíveis. Os health checks de produção devem usar HTTPS ou atravessar o proxy verificado; probes HTTP diretos sem terminação TLS e sem encaminhamento confiável são recusados pela mesma política de segurança. A configuração concreta depende do fornecedor da Fase 13.

O servidor abre a porta depois da ligação/preparação da base de dados e da documentação; uma falha de preparação dos contratos fecha a ligação sem abrir HTTP; SIGTERM/SIGINT encerram Socket.IO, ciclo de leilões, HTTP e MongoDB com prazo e libertação forçada. As mensagens de logs não incluem segredos. O ambiente real de produção e a terminação TLS ainda necessitam de validação na Fase 13.

## Fotografias e armazenamento Cloud

A interface `ImageStorage` mantém `put`, `read` e `publicBase`, passando a identificar opcionalmente o tipo de adaptador. O runtime aceita injeção de um adaptador Cloud com URL HTTPS sem credenciais; rejeita adaptadores de desenvolvimento e URLs inseguras em produção. Sem adaptador Cloud, a API pode arrancar mas os endpoints de upload/leitura gerida ficam indisponíveis e são omitidos do contrato publicado. Isso não equivale a uma entrega Cloud completa.

A produção não usa disco local persistente nem base64 em MongoDB. A integração concreta Blob/S3/GCS, SDK, credenciais e custos fica para a Fase 13. O armazenamento futuro deve manter os objetos privados e a leitura através do gateway autorizado da API (`publicBase` deve apontar para esse gateway), evitando contornar a moderação com um bucket público.

A política de órfãos/retenção permanece pendente: falhas após upload e substituições podem deixar objetos não associados. Não apagar automaticamente imagens referenciadas por snapshots históricos, denúncias ou provas de moderação. A futura limpeza exige inventário de referências, período de retenção aprovado e auditoria. Esta fase não adiciona um coletor destrutivo nem promete eliminação física imediata.

## Socket.IO

O frontend deriva a origem Socket.IO da configuração da API e mantém `/socket.io` no mesmo servidor. Os namespaces autenticados, subscrições autorizadas, rooms privadas e verificação periódica de contas/papéis permanecem existentes. CORS deve conter a origem HTTPS do frontend e o proxy deve encaminhar polling/upgrade WebSocket, com timeouts compatíveis com heartbeats.

Reconexão e eventos mínimos continuam a desencadear reconciliação REST; MongoDB mantém-se como fonte de verdade. O relógio é sincronizado com o servidor; o desfasamento do ambiente local já documentado não é corrigido alterando regras de licitação.

Planeia-se inicialmente uma única instância API: não se afirma suporte a várias instâncias sem adaptador partilhado, publicação distribuída e revisão dos limites em memória. Suspensão gratuita do processo, duração dos WebSockets e limites do fornecedor devem ser verificados antes do deployment.

## Testes e revisão

Novos testes cobrem Swagger HTML/assets/JSON, correspondência exata dos routers, referências, Authorize real, não persistência do JWT, CORS, HTTPS/proxy, readiness, porta PaaS, recusa de adaptadores inseguros, compatibilidade REST e estados persistidos com MongoDB real. Os testes de browser verificam Swagger e Bootstrap nas seis larguras, teclado, foco e ausência de overflow. As capturas ficam fora do repositório.

Resultado das suites completas reexecutadas nesta fase:

| Suite                                                    | Testes aprovados |
| -------------------------------------------------------- | ---------------- |
| Backend (unitários, HTTP e integração MongoDB/Socket.IO) | 1 943            |
| Frontend habitual                                        | 661              |
| Integrações reais React/API/MongoDB                      | 190              |
| Leilões reais dedicados                                  | 12               |
| **Total distinto**                                       | **2 806**        |

Os 2 779 testes da base anterior foram preservados; acrescentaram-se 20 backend e sete de browser. Repetições de suites focadas não são somadas ao total. Nenhum teste preexistente foi enfraquecido ou alterado.

Comandos: `npm test --workspace @docampo/api`, `npx playwright test --workers=2`, `npx playwright test --config playwright.integration.config.ts` e `npx playwright test --config playwright.auctions.config.ts`. O servidor real cria uma base aleatória `docampo_test_web_*`, usa apenas contas fictícias e elimina exclusivamente os seus dados no encerramento. As suites backend também isolam os seus próprios nomes de teste. O MongoDB de desenvolvimento permanece preservado.

A revisão visual produziu capturas de Swagger, catálogo e diretório nas seis larguras, fora do Git. O Swagger executou login real, Authorize e GET `/auth/me`, com JWT apenas em memória, sem configuração remota ou pedidos externos. Verificaram-se foco por teclado, contraste dos métodos HTTP e ausência de overflow nas páginas alteradas. Não se apresenta esta inspeção como uma certificação formal de acessibilidade.

A revisão completa inclui regressões de autenticação, produtos/fotografias/stock, pesquisa/mapas, carrinho/checkout, encomendas/pagamentos/receção, avaliações, leilões/licitações/Socket.IO, administração/denúncias/moderação. Os resultados exatos e o inventário final são apresentados no relatório de entrega, sem confundir execuções anteriores com reexecuções desta fase.

Validações: TypeScript API/frontend, ESLint, Prettier com ignore da raiz explícito, builds, OpenAPI 3.0 e referências/cobertura, Markdown/ligações/tabelas, segredos, whitespace dos ficheiros novos, `git diff --check` e integridade dos nove documentos originais.

## Revisão local isolada

1. Na pasta `apps/api`, executar `docker compose --profile test up -d --wait mongo-test`.
2. Na raiz, executar `DOCAMPO_CHECKOUT_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs`. O servidor cria uma base de teste efémera e um segredo aleatório apenas para esta execução.
3. Abrir `http://127.0.0.1:3011/api-docs`. Para rever também o frontend, executar noutro terminal `VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183` e abrir essa origem.
4. No Swagger, registar um comprador fictício com email `.invalid`; confirmar 202, executar login, copiar o accessToken para Authorize e experimentar GET `/auth/me`. Atualizar a página deve limpar a autorização. Não reutilizar credenciais ou tokens reais.
5. Acesso a operações de produtor/administração continua sujeito aos papéis reais. Os exemplos de request não concedem esses papéis.
6. Terminar o servidor com Ctrl+C elimina exclusivamente a base efémera e a pasta de imagens dessa execução. Parar o MongoDB de teste após a revisão, preservando volumes e o serviço de desenvolvimento.

## Limitações e decisões pendentes para a Fase 13

1. Aceitação académica da divergência Argon2id/bcrypt.
2. Escolha e disponibilidade do PaaS/Atlas/armazenamento, quotas gratuitas, região, custos e termos.
3. Domínios, TLS, IPs reais de proxy, CORS e variáveis de ambiente definitivas.
4. Adaptador Cloud privado, permissões, URLs, retenção de provas e limpeza de órfãos.
5. Verificação real de WSS, reconexão e graceful shutdown no fornecedor.
6. Monitorização real dos serviços Cloud e respetivos estados; readiness local não simula essa monitorização.
7. Persistência/backup/restauro, migração inicial não destrutiva, conta administrativa inicial segura e dados demonstrativos separados.
8. Evidências públicas, relatório académico, vídeo e manutenção das URLs até à defesa.

Não foram criadas contas, recursos Cloud, deployments, branches, commits, staging ou push. Não foi iniciada a Fase 13.

## Referências técnicas

- [Configuração oficial Swagger UI](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/): opções de autorização em memória, validação externa e configuração por query.
- [Instalação oficial Swagger UI](https://github.com/swagger-api/swagger-ui/blob/main/docs/usage/installation.md): distribuição local dos recursos da interface.
- [OpenAPI do projeto](openapi.yaml).
- [Moderação de conteúdos e conservação de provas](phase-11d-content-moderation.md).
- [Gestão do produtor e fotografias](phase-11a-producer-management.md).
