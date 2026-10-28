# Fase 7A — segurança das candidaturas de produtores

As novas rotas de candidatura reutilizam JWT, contas ativas, capacidades atuais e DTOs privados. `/me/producer-application` deriva a propriedade exclusivamente da identidade autenticada, sem exigir papel produtor na submissão. `/admin/producer-applications` exige administrador atual; o serviço revalida esse papel na base, independentemente da principal passada pelo chamador. Payloads não aceitam papéis, proprietário, decisões, datas ou histórico.

Aprovação e concessão cumulativa de produtor são atómicas em transação MongoDB com fences das contas e revisão do perfil. Inatividade do candidato ou perda de papel administrativo durante a transação impedem aprovação parcial. Decisões exigem ETag atual em `If-Match`; tentativa reapresentada não pode ser aprovada por pedido antigo. Submissão e rejeição não concedem capacidades; papéis legados não são revogados. O backend consulta papéis atuais por pedido, incluindo JWT já emitido.

Histórico e contactos são privados, sem exposição no catálogo ou serialização por omissão. O próprio não recebe IDs administrativos. Não há novos logs, dependências, poderes administrativos genéricos, email, notificações em tempo real ou interface React. Limites JSON/CORS/TLS/proxy mantêm-se; não existe quota dedicada/distribuída de candidaturas. Ver [regras, transações e limitações](phase-7a-producer-applications.md). As secções seguintes conservam o contexto das fases anteriores.

---

# Fase 6B — segurança do transporte Socket.IO

O [contrato de tempo real](phase-6b-socketio.md) define namespace autenticado, revalidação por comando/publicação e quotas comuns entre sockets da mesma conta. JWT apenas em `auth.token`, nunca em URL ou logs; expiração/inatividade desligam a sessão. Origem/TLS/proxy são verificados também no Engine.IO, independentemente do Express. Broadcasts usam projeção comum sem `proprio`/IDs privados; recusas e resultados incertos são distintos.

Payload e recursos são limitados; quotas REST/Socket.IO são independentes e locais ao processo. Não se promete segurança distribuída nem entrega durável de cada evento. Não há permissões fictícias, novos poderes administrativos ou alteração de checkout. O frontend futuro deve fechar a ligação ao terminar sessão; a política atual de logout não revoga tokens emitidos.

---

# Fase 6A — segurança dos leilões REST

Estado local vigente: as regras desta secção complementam a autenticação e as fases comerciais já implementadas. A matriz de preparação mais abaixo é histórica; não representa por si só endpoints ativos. Ver [contratos e limites](phase-6a-auctions.md).

| Operação                                       | Acesso efetivo                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/auctions`                            | Resumo público, sem comprador, pseudónimo, chave, email ou auditoria.                                                                 |
| GET `/api/auctions/:id` e `/bids`              | Qualquer conta autenticada e ativa; apenas pseudónimo por leilão e participação própria.                                              |
| GET `/api/me/producer/auctions`                | Produtor atual, só os seus leilões; não concede capacidade de criar se a aprovação foi retirada.                                      |
| POST `/api/auctions` e PUT `/api/auctions/:id` | Produtor ativo e aprovado, produto/leilão próprios, guardas transacionais de conta/perfil e stock.                                    |
| POST `/api/auctions/:id/cancel`                | Produtor ativo, proprietário, sem oferta e antes do fim. Não exige aprovação comercial atual para libertar uma reserva histórica.     |
| POST `/api/auctions/:id/bids`                  | Comprador ativo atual; produtor do lote também ativo/aprovado. Identidade compradora diferente da produtora, mesmo acumulando papéis. |

JWT, atividade e papéis são consultados no MongoDB. Guardas de escrita participam na transação para detetar alterações concorrentes. Administrador não recebe direitos comerciais por ser administrador. Não há troca de papéis demonstrativos, concessão de capacidades ou acesso a hashes/chaves internas.

Pedidos JSON estritos, sem mass assignment, limitados a 100 KiB. Parâmetros de consulta e cabeçalhos duplicados são rejeitados. PUT/cancelamento exigem ETag forte; criação/licitação exigem chave idempotente opaca. Respostas privadas não são colocadas em cache. Erros não incluem valores recebidos, URI MongoDB, tokens ou detalhes internos; não há logger de corpos/cabeçalhos.

Limites técnicos locais: 120 pedidos/minuto/IP nas rotas de leilões e 60 mutações/minuto/conta, com HTTP 429 e Retry-After, mapa limitado a 10 000 identidades HMAC. Estes contadores são por processo e reiniciam com ele; não constituem garantia de consistência nem defesa distribuída. CORS e proxy mantêm as regras existentes. Presença e Socket.IO continuam por implementar.

---

> **Fase 5C — integração React local:** login real seguido de `/auth/me`, JWT exclusivamente em memória e áreas pessoais com capacidades confirmadas pelo serviço. Registo público só comprador, HTTP 202 genérico e login separado. Expiração/401 descartam a sessão; 403/rede bloqueiam a apresentação privada até revalidar. Logout limpa o cliente sem afirmar revogação. O protótipo por papéis fica isolado em `/demonstracao`, sem autenticar contas; a cesta demo tem chave separada. Ver [ciclo de vida e limites](frontend-integration.md). Não são alterados os contratos, hashes, modelos ou políticas do backend descritos abaixo.

> **Fase 5A:** catálogo público restrito a publicados/aprovados/contas ativas; gestão própria de produtos protegida por JWT, capacidade, owner, If-Match e guardas transacionais. DELETE arquiva; consultas próprias não tornam rascunhos públicos. Ver [contrato de integração](frontend-integration.md). Não há checkout HTTP ou operações de leilão.

# Fase 4 — autenticação JWT e controlo de acessos

Implementação local de **26 de outubro de 2026**, em `feat/api-foundation`, base `745402983b0393e3ef64906860d6d627044a7207`. O pedido da Fase 4 autoriza autenticação real e estes quatro endpoints; não ativa as operações comerciais da matriz histórica abaixo, não altera frontend e não autoriza publicação Git.

| Endpoint                  | Segurança e resultado                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/register` | Público, apenas comprador. JSON estrito com `nome`, `email`, `password`. Resposta **202 idêntica** para novo registo/email duplicado, sem token ou perfil; não substitui conta existente. |
| `POST /api/auth/login`    | Público, credenciais válidas e conta ativa. **200** com JWT Bearer, expiração e projeção própria; **401 genérico** para email inexistente, password errada ou conta desativada.           |
| `GET /api/auth/me`        | Bearer obrigatório; **200** apenas com `id`, `nome`, `email`, `papeis` da própria conta, consultada na base em cada pedido.                                                               |
| `POST /api/auth/logout`   | Bearer obrigatório; **200** com `revogado: false` e mensagem explícita de que o cliente deve descartar o token, válido até expirar.                                                       |

`/api/auth/registo` e `/api/me` eram caminhos documentais propostos: não são aliases implementados. O [OpenAPI](openapi.yaml) passa a descrever os caminhos pedidos, DTOs, exemplos fictícios e códigos. Os restantes endpoints comerciais permanecem ausentes, incluindo checkout. `GET /api/health` é preservado.

## Passwords e identidade

Novos hashes usam **Argon2id**, com 19 MiB, duas iterações, paralelismo um, salt aleatório e digest de 32 bytes, seguindo a configuração de base da [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Dependência `argon2@0.45.1`, verificada no Node.js 22.21.1 instalado. O enunciado original refere bcrypt; o pedido atual dá preferência a Argon2id quando compatível. `bcryptjs@3.0.3` mantém verificação dos hashes anteriores 2a/2b/2y sem migração silenciosa. Bcrypt recusa mais de 72 bytes para impedir equivalências por truncagem.

Política local de registo: 15–128 pontos de código, máximo 512 bytes UTF-8, sem NUL/surrogates isolados; sem trim, normalização ou regras artificiais de maiúsculas/símbolos. Não se recebe confirmação de password neste contrato. Login aceita passwords legadas mais curtas dentro dos limites técnicos. Nome: NFC/trim, 1–120 pontos de código, sem controlos; email: trim/minúsculas e formato válido, até 254 caracteres, sem remover aliases/pontos.

Reutiliza-se `User` e o índice único de `emailNormalizado`; a preparação explícita desse índice ocorre antes de o arranque real abrir HTTP e antes do primeiro registo numa composição de teste. Hashing ocorre também em pedidos duplicados; a violação concorrente do índice devolve o mesmo 202. Uma verificação Argon2 de referência reduz a diferença de trabalho para emails inexistentes. Não se promete igualdade perfeita de tempos, sobretudo entre hashes bcrypt legados e Argon2id. Não se implementa verificação de email, recuperação de password ou consulta de listas de passwords comprometidas.

`ativo?: boolean` é a única propriedade nova em users: novas contas têm `true`, ausência legada equivale a ativa, `false` impede login/autenticação e participação em compras novas. Não se cria endpoint para ativar/desativar ou editar papéis. O campo participa em `save`/revisão operacional. A guarda de capacidades inclui atividade no diagnóstico e na escrita condicionada; o serviço de checkout não é alterado. Ensaios reais verificam desativação concorrente e rollback.

## JWT e autorização

`jose@6.2.13` assina e verifica **HS256**, com algoritmo permitido explícito, tipo JWT, issuer/audience esperados e campos `sub`, `iat`, `exp`, `jti` obrigatórios. Duração por omissão **900 segundos**, configurável entre 60 e 3600; sem segredo ou fallback fixo. A implementação segue a [API de verificação da biblioteca](https://github.com/panva/jose/blob/main/docs/jwt/verify/interfaces/JWTVerifyOptions.md). O segredo tem pelo menos 32 bytes aleatórios em base64url e vem exclusivamente de `JWT_SECRET`. Não há chaves, passwords ou JWT reais no Git.

O token contém apenas `sub/iss/aud/iat/exp/jti`; não contém nome, email, papéis, hashes ou revisões. O servidor consulta a conta ativa e os papéis atuais em cada pedido, pelo que alterações de capacidade/desativação têm efeito mesmo com um token já emitido. Não aceita tokens em query/body/cookies, cabeçalhos DEMO ou papéis enviados pelo cliente.

Os middlewares [access-control.ts](../../apps/api/src/modules/auth/access-control.ts) ligam a identidade ao pedido por `WeakMap`, verificam papéis e propriedade. O resolvedor de propriedade deve consultar uma fonte autoritativa, nunca aceitar o owner do corpo como prova. Um administrador não recebe bypass implícito de propriedade ou autorização para todas as ações. As rotas comerciais terão de compor estes controlos com as suas próprias regras antes de serem expostas; nesta fase são testados em harnesses sem criar endpoints comerciais.

**Logout é stateless e não revoga o JWT no servidor.** O endpoint comunica essa limitação em todas as respostas de sucesso; o token continua aceite até expirar, sujeito ao estado atual da conta. Não há refresh token, denylist ou sessão persistida. Uma password alterada por intervenção interna não revoga automaticamente tokens existentes. A política residual de sessões distribuídas, refresh e armazenamento no futuro frontend continua pendente; não se afirma aprovação global de Q13 além deste bloco autorizado.

## Proteções HTTP e operação

- Validação Zod estrita, sem atribuição de papéis/IDs/estado/hash pelo registo. Não existe provisionamento automático de administrador.
- Respostas de autenticação com `Cache-Control: no-store`; erros 400/401/403/413/415/429/500 sem stack, payload, chave, JWT ou valores privados. Bearer inválido inclui `WWW-Authenticate: Bearer`.
- Rate limiting local por IP (**30 tentativas/15 minutos**, partilhadas por registo/login) e por email normalizado no login (**10/15 minutos**). Sucesso não reinicia quotas. `Retry-After` acompanha 429. Chaves de conta usam HMAC com chave aleatória do processo; armazenamento limitado a 10 000 entradas, esgotamento falha fechado.
- Os limites são por processo e reiniciam no restart; não substituem um limite partilhado no gateway para várias instâncias. A quota por conta pode causar indisponibilidade temporária se um terceiro insistir nesse endereço. Não se promete proteção contra DoS distribuído.
- CORS aceita apenas origens exatas em `CORS_ORIGINS`, sem wildcard ou cookies credenciados. Preflight permite GET/POST/PUT/DELETE e Authorization/Content-Type/If-Match; expõe ETag/Location para gestão de produtos. Sem Origin, clientes não browser continuam sujeitos à autenticação; CORS não é uma permissão de acesso.
- Produção recusa HTTP e origens de browser sem HTTPS. Só confia nos IPs exatos de proxies em `TRUSTED_PROXY_IPS`; por omissão não confia em cabeçalhos encaminhados. Exige terminação TLS num proxy confiável, acesso de rede restrito ao proxy e encaminhamento de headers controlado. Respostas HTTPS de produção incluem HSTS.
- Corpos JSON mantêm o limite de 100 KiB e rejeitam compressão. Acrescentam-se nosniff, DENY e no-referrer. O alerta preexistente de DoS do `body-parser` 2.3.0 foi corrigido por atualização transitiva compatível para 2.4.0; não se atualizou Express.

Não existe logger de pedidos com bodies/headers. Não registar credenciais, tokens, hashes, moradas ou URI privadas no deployment. O cliente demonstrativo permanece independente; a escolha de papel não autentica.

## Validação da fase

Os novos testes [unitários](../../apps/api/tests/unit/auth.spec.ts), [HTTP](../../apps/api/tests/http/auth.spec.ts) e [MongoDB real](../../apps/api/tests/integration/auth.spec.ts) cobrem entradas, hashing, JWT/expiração/assinatura/claims, contas antigas/desativadas/removidas, papéis atuais, propriedade, escalada, logout, limites/CORS/HTTPS, registos simultâneos e compatibilidade concorrente com checkout. Usam exclusivamente bases efémeras `docampo_test_*` e segredos/passwords fictícios de teste. O arranque real é exercitado com HTTP e índice único preparado; importar módulos não abre portas.

O construtor `createApp()` sem dependências continua disponível para os testes históricos de diagnóstico isolado; **o executável `server.ts` exige configuração JWT e liga a autenticação real**. Não existe um modo de produção que substitua JWT por papéis demonstrativos. A suite completa e as verificações de TypeScript/ESLint/Prettier/build são executadas no fecho, preservando Fase 0, frontend e checkout.

---

## Registo histórico da matriz e preparação anteriores

# Segurança e matriz de permissões — proposta

> Estado vigente após nova aprovação: O01–O16 e OR01–OR12 aprovadas; orders pronto documentalmente para persistência isolada, aguardando autorização de implementação. Ver [consolidação vigente](phase-3.2-orders-readiness.md). Recomendações/pedidos de aprovação das revisões anteriores são históricos e não reabrem estas decisões.

A matriz traduz RF-AUT/UC e D03/D04, com [Q01/Q03/Q04/Q06/Q14 aprovadas no âmbito funcional](decisions.md), T32-01–T32-06 aprovadas no âmbito explícito; restantes Q e detalhes técnicos residuais pendentes. O enunciado exige JWT com expiração, bcrypt, papel, segredos de ambiente e HTTPS em produção. Propriedade/aprovação e projeções mínimas concretizam propostas já documentadas. **Nenhuma linha desta matriz implementa autorização nem concede novos poderes.** O OpenAPI exprime autenticação e papéis; as condições de negócio têm de ser validadas no futuro servidor.

## Atualização administrativa limitada a encomendas

O01–O16 aprovadas funcionalmente. O03 autoriza cancelamento administrativo nos estados permitidos, com justificação; O13 intervenção em divergência e O15 decisão fundamentada sobre reclamação. Estes poderes sucedem à proposta antiga apenas de consulta, sem conceder edição genérica, alteração de preços/linhas, confirmação de pagamento pelo admin ou reembolso automático. C04 mantém todas as operações privadas ausentes. Ver [matriz de ações e projeções de orders](phase-3.2-orders-readiness.md).

## Matriz

Legenda: P = público; S = próprio; A = autorizado pelo papel; C = condicionado à decisão Q; — = não autorizado nesta proposta. Operação pública é também acessível a utilizadores autenticados. Visitante significa ausência de conta/token. As colunas comprador/produtor representam capacidades que podem coexistir na mesma conta, conforme Q01. Nas operações de compra, a coluna produtor é condicional à existência da capacidade comprador; não resulta automaticamente do perfil. Permissões administrativas não implicam capacidades comerciais.

| Operação / operationId                                                  | Visitante | Comprador | Produtor | Administrador | Condições e projeção                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | --------- | --------- | -------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| getHealth                                                               | P         | P         | P        | P             | Único diagnóstico implementado localmente em 3.1; confirma HTTP, sem dados privados ou monitorização Cloud.                                                                                                                                        |
| register, login                                                         | P         | P         | P        | P             | Registo público nunca atribui admin/aprovação; preferência inicial não torna os papéis exclusivos. Q01 aprovado; aquisição da capacidade produtor T32-01 e sessão Q13 por detalhar.                                                                |
| getMe                                                                   | —         | S         | S        | S             | Apenas identidade própria, incluindo email próprio; hash nunca devolvido.                                                                                                                                                                          |
| listProducts, getProduct, listProducers, getProducer                    | P         | P         | P        | P             | Perfis públicos só aprovados; catálogo ativo proposto só com publicados de aprovados. Zero stock pode ser visível sem compra; detalhe arquivado Q12, coordenadas Q11.                                                                              |
| listProductReviews, listProducerReviews                                 | P         | P         | P        | P             | Apenas publicadas/não ocultas; sem dados privados do autor/denunciante. Q10/Q12.                                                                                                                                                                   |
| getOwnProducer, getOwnApplication                                       | —         | —         | S/C      | —             | Consulta própria de candidatura/decisão/justificação permitida em pendente/aprovado/rejeitado. Não expor identidade privada do decisor. Recandidatura pendente.                                                                                    |
| listOwnProducts, replaceOwnProfile                                      | —         | —         | S/C      | —             | Pendente edita perfil e prepara rascunhos próprios; aprovado gere a loja. Direitos adicionais do rejeitado não concedidos. Conteúdo mínimo T32-05; localização Q11.                                                                                |
| createProduct, replaceProduct                                           | —         | —         | S/C      | —             | Pendente cria/edita apenas rascunhos próprios; aprovado pode publicar por ação explícita. Rejeitado sem direitos adicionais presumidos. Publicação não é efeito automático de guardar/aprovar.                                                     |
| deleteProduct                                                           | —         | —         | S/C      | —             | Arquivo retira da venda e preserva histórico (T32-05); DELETE/restauro e reservas Q12/Q07 pendentes; não inferir novas permissões de pendente/rejeitado por aprovação da preparação de rascunhos.                                                  |
| createOrders                                                            | —         | A/C       | C        | —             | Capacidade comprador da mesma conta; produtos publicados de produtores aprovados. Totais/preços servidor Q06 aprovado, grupo/atomicidade O01 e preços P02 definidos, formatos/limites/comandos residuais OR pendentes; inteiros/half-up aprovados. |
| listOwnOrders, getOwnOrder                                              | —         | S         | S        | —             | Comprador participante ou produtor responsável; privacidade de morada por necessidade. Admin usa rota própria.                                                                                                                                     |
| changeOrderState                                                        | —         | —         | S/C      | —             | Progressão operacional pelo produtor responsável; ações O03/O13/O15 têm atores/comandos próprios ainda por documentar no contrato; C04 bloqueia todas.                                                                                             |
| listOwnReviews, createReview                                            | —         | S/C       | S/C      | —             | Capacidade comprador e entrega própria persistida; produto/produtor elegível. Produtor também pode comprar, mas escala/cardinalidade/edição Q10 continuam pendentes.                                                                               |
| reportReview                                                            | —         | C         | C        | C             | Denúncia autenticada é recomendação Q10; papéis/limites finais pendentes. Não oculta automaticamente.                                                                                                                                              |
| listAuctions                                                            | P/C       | P/C       | P/C      | P/C           | Resumo público para destaque; sem sala, presença, identidade privada ou comando de licitar. Q09.                                                                                                                                                   |
| getAuction, listAuctionBids                                             | —/C       | A/C       | A/C      | A/C           | Observação autenticada inicialmente proposta; anonimato e projeção dependem de Q09.                                                                                                                                                                |
| listOwnAuctions, createAuction                                          | —         | —         | S/C      | —             | Só próprios; criar exige produtor aprovado. Conta pode licitar noutros lotes se compradora, nunca no próprio. Origem/reserva/prazo Q07/Q08.                                                                                                        |
| listOwnBids                                                             | —         | S         | S/C      | —             | Participações da identidade com capacidade comprador, mesmo que também produtora; sem IDs privados de outros compradores.                                                                                                                          |
| licitar (Socket.IO futuro, não REST)                                    | —         | C         | S/C      | —             | Capacidade comprador e identidade diferente de auction.produtor, mesmo mudando papel/contexto. Q01 aprovado; prazo/mínimo/Q07–Q09/Q13 e D06 ainda condicionam comando futuro.                                                                      |
| getProducerIndicators                                                   | —         | —         | S/C      | —             | Agregações próprias por período/fórmula Q15; sem dados de outros produtores.                                                                                                                                                                       |
| listAdminUsers, getAdminUser                                            | —         | —         | —        | A             | Consulta mínima de utilizadores; não concede edição de papéis, suspensão ou eliminação.                                                                                                                                                            |
| listAdminProducers, listApplications, getApplication, decideApplication | —         | —         | —        | A/C           | Só admin decide candidatura pendente, com autor/data no servidor. Aprovação não publica rascunhos. Recandidatura e reabertura não aprovadas; T32-05 concretiza campos.                                                                             |
| listAdminOrders, getAdminOrder                                          | —         | —         | —        | A             | Consulta global minimizada, sem poder de alterar estado/encomenda.                                                                                                                                                                                 |
| listModerationCases, getModerationCase, decideModeration                | —         | —         | —        | A/C           | Manter/ocultar e preservar evidência; não editar classificação/texto pelo autor. Outros conteúdos Q12.                                                                                                                                             |
| listAdminAuctions, getAdminIndicators                                   | —         | —         | —        | A/C           | Leitura global; não criar bids, adjudicar ou alterar lotes em nome de outros.                                                                                                                                                                      |
| getServiceObservations                                                  | —         | —         | —        | A/C           | Sem URI privada/tokens/detalhes de rede; observação real Q16, desconhecido sem sonda.                                                                                                                                                              |

## Bloqueio aprovado de operações privadas e condições de ativação

C04 foi aprovada: autenticação/autorização reais permanecem na semana 4; até estarem implementadas, nenhuma leitura ou escrita privada pode ser disponibilizada pela API. A matriz descreve o destino futuro, não permissões ativas. A seleção de papel no frontend demonstrativo não autentica nem autoriza.

1. Aplicar Q01/Q04 aprovadas no seu âmbito, resolver os detalhes residuais/T32 e aprovar Q13; a sequência C04 já está fixada na semana 4; definir quem aprovisiona o administrador inicial sem credenciais fixas no Git.
2. Implementar JWT assinado/expirado, verificação de conta atual, papel, propriedade e aprovação no servidor; não confiar na escolha de papel ou nos IDs DEMO do browser.
3. Validar body/query/path com lista explícita de campos e tipos, IDs e enums; rejeitar operadores MongoDB livres e atribuição de hash, papel administrador, proprietário, aprovação, totais, autor/data ou resultado do leilão.
4. Aprovar limites técnicos (texto/body/paginação/login/upload), política de password, detalhes remanescentes de C02 e normalização C03; aplicar os princípios de erro já aprovados. Os números provisórios dos formulários não são política real.
5. Executar testes negativos: ausente/inválido/expirado 401; papel insuficiente 403; recurso alheio 403/404 conforme C02; produtor não aprovado; campos injetados; informação privada/stack em respostas e logs.
6. Guardar segredos apenas no backend, fora do Git; exemplos sem credenciais; VITE_* nunca recebe URI MongoDB/segredo JWT/credenciais Blob. Configurar origens explícitas quando houver integração.

Até cumprir estas condições, rotas privadas ficam negadas/desativadas; não criar endpoint de identidade fictícia, cabeçalho de papel confiável ou bypass de autenticação acessível pela rede. Testes de serviço podem injetar contexto apenas dentro do harness interno. C04 aprovada mantém a segurança real na semana 4. Nesta fundação, testar serviços técnicos internamente não autoriza acesso HTTP privado. Não se implementa autenticação nesta fase.

## Projeções e privacidade

Mercado: perfil/localização autorizados, produto e avaliação pública. Nunca email privado, hash, morada de comprador, denúncias ou identidade privada de licitante. O próprio recebe os seus dados necessários; produtor recebe apenas dados de encomenda indispensáveis ao cumprimento; administração consulta projeção reduzida e não ganha poderes de escrita por ter leitura global.

ApplicationSelf/ProducerSelf retiram autorId administrativo; Application/ProducerManaged são administrativos. Order é privado: morada apenas quando necessária, e omitida da projeção administrativa se não houver necessidade aprovada. Review público não inclui ligação privada à encomenda; essa referência pode existir internamente/na própria atividade, por contrato posterior explícito. Decisões e evidência persistem no servidor, sem necessitar exposição integral ao browser.

Ocultar avaliação deve atualizar consultas/agregados públicos depois de persistir, mantendo texto/classificação/evidências. Esse comportamento futuro é diferente da simulação isolada aprovada, que continua intacta até integração autorizada. Uma lista inacessível não deve aparecer como vazia para mascarar 401/403.

## Erros e concorrência

400/401/403/404 são académicos. C02 aprova erros estruturados e seguros, códigos estáveis, mensagens claras, campos inválidos e HTTP incluindo 400/401/403/404/409/500. requestId, regra 403 versus 404 de recurso alheio, mecanismo concreto de edição obsoleta e códigos adicionais como 503 continuam por confirmar; erro 503 não garante rollback de um commit incerto. Não devolver detalhes do driver, connection strings ou claims sensíveis. IDs de pedido são de diagnóstico, não de autorização.

Aprovação e moderação devem ser avaliadas contra estado persistido atual. A política de repetição/reabertura é Q04/Q10/Q12; não transportar cegamente a regra de sessão demo para produção. PUT/PATCH nunca contornam ownership. ProductReplace prevê versaoEsperada (C02); definir a política para aceitar/recusar edição obsoleta e testar concorrência entre PUT de stock e checkout, sem permitir que o formulário reponha stock já debitado. Preços/stock/transições são validados na mesma unidade de consistência aprovada; autenticação não substitui transações.

O logout local não revoga automaticamente JWT emitidos; duração e eventual revogação precisam de Q13. HTTPS é exigido em produção; serviços de desenvolvimento não são declarados publicação Cloud. Rate limiting, CORS/origens e validação de upload requerem configuração futura aprovada, sem instalação de middleware nesta subfase.

Na fundação 3.1, apenas GET /api/health está registado; todas as operações privadas da matriz permanecem ausentes. Testes verificam que papel/ID DEMO e Bearer fictício não ativam essas operações. O middleware devolve 413 ao exceder o limite técnico JSON de 100 KiB; não é limite comercial ou decisão de upload.

## Preparação 3.2 — propriedade e estado

Q01 permite usar a mesma identidade nas áreas de comprador e produtor. A escolha do contexto da interface não altera capacidades no servidor. Anti-auto-licitação compara users._id do licitante com o owner do leilão, não papeis ou producers._id. Não se cria uma regra de auto-compra fora do leilão sem decisão própria.

Q04 distingue aprovação de publicação: pendente prepara perfil/rascunhos sem exposição pública; aprovado publica explicitamente; rejeitado consulta decisão/justificação, sem vender. Produtos públicos exigem simultaneamente publicação e perfil aprovado. Datas, owner, autor da decisão, papeis e totais não podem ser atribuídos arbitrariamente pelo cliente. PUT completo respeita estas listas de campos e não publica implicitamente.

Lista de papéis aprovada T32-01, sem middleware criado. Mínimos de rascunho além da categoria obrigatória continuam pendentes; justificação/metadados do perfil aprovados e implementados A02/A03. Publicado sem stock pode estar visível como esgotado, sem compra; arquivado não se vende e preserva histórico. Meses são apenas informativos, sem autorizar ou bloquear venda. Recandidatura e poderes de suspensão/moderação de outros conteúdos continuam dependentes das decisões pendentes. Nenhuma rota, JWT ou bcrypt é implementada na preparação 3.2.

A [classificação de pendências e primeiro bloco](phase-3.2-readiness.md) não antecipa segurança: users/producers seriam apenas schemas internos após aprovação A01–A03 e autorização. Nem uma referência Mongoose nem select:false substituem autorização e projeções explícitas; não devolver documentos crus. A decisão administrativa futura exige ator real autorizado, nunca o papel escolhido no frontend.

## Primeiro bloco de modelos A01–A03

users/producers implementados localmente, sem novas rotas; ver [privacidade, validações e limites efetivos](phase-3.2-identity-implementation.md). Hash bcrypt apenas por representação válida, sem hashing/login; select:false e redigido em JSON/toObject. Telefone e autor da decisão excluídos das leituras por omissão e do JSON do perfil. A conta populada não é serializada integralmente no perfil.

Os modelos não recebem pedidos HTTP nem convertem papéis do frontend em autoridade. Guardas de escrita exigem documentos com validação completa, mas não substituem DTO, serviço, JWT ou autorização; ref não comprova que uma conta existe ou é administradora. Esses controlos mantêm-se para as fases autorizadas correspondentes. Nenhum administrador real foi criado; os testes usam apenas entidades fictícias numa base efémera própria.

## Products — elegibilidade interna e C04

P04 permite rascunho com nome editável e owner técnico; publicação manual exige dados completos, conta com papel produtor e perfil aprovado. O modelo verifica essa elegibilidade por referências na conexão/sessão recebida, **sem autenticar um ator ou implementar autorização HTTP**. Atribuição do owner pelo servidor e controlo de ownership continuam responsabilidade dos serviços futuros; nenhuma rota foi acrescentada. Ver [limites de consistência e dados](phase-3.2-products.md).

A leitura de aprovação durante a validação não bloqueia mudanças concorrentes do perfil nem substitui a verificação atual nos serviços/consultas públicas. Atualizações parciais/bulk e save com projeção que omite campos críticos são recusados no bloco. Hashes não entram em products; imagens são só referências sem credenciais/bytes. P03 não introduz débito e P08 não implementa confirmação no browser.

## Orders — privacidade e comandos futuros

Comprador só consulta as próprias orders/grupo; produtor só a sua order, sem manifesto ou dados das outras encomendas da mesma compra. Admin recebe projeção minimizada e detalhe justificado. Métodos de pagamento não autorizam exposição de IBAN, contactos privados, comprovativos, hash de pedido, chaves de retry ou credenciais. Guardar morada apenas para cumprimento quando aplicável e nunca em métricas/logs públicos.

As ações de cancelamento/receção/pagamento/reclamação não são um PATCH genérico que permita atribuir qualquer estado ao cliente. Desenhar comandos e listas de campos após OR01–OR12; autoria/data, totais, propriedade, estado inicial e decisões são atribuídos/validados no servidor. Entrega declarada não é receção confirmada; admin não confirma pagamentos; ator automático não é uma conta fictícia. Hashing/JWT/RBAC continuam fase própria.

Leitura transacional do perfil não resolve aprovação concorrente; helper atual bloqueia updates condicionados e __v não é versão comercial universal. OR12 requer decisão/autorização futura para caminho interno restrito, sem alterar modelos/guardas nesta preparação. Novas rotas não são criadas por atualizar a matriz documental.

## OR10 e projeções de orders consolidadas

Administração pode reverter pagamento já confirmado mediante justificação e auditoria, por OR10; não pode confirmar recebimento normal como produtor. Produtor pode rejeitar comunicado não recebido com razão. Intervenção não elimina acontecimentos anteriores, não reembolsa nem acopla conclusão ao pagamento. Pedidos pendentes não suspendem processamento; todas as alterações verificam estado/versão/ownership e as reclamações legítimas não são deduplicadas por assunto.

Chave global não é autorização. Em replay, validar identidade do comprador antes de recuperar recibo; colisão com chave de outra conta dá conflito genérico sem revelar orders. Metadados de âncora, hashes, manifesto e reserva de auditoria nunca integram DTO comum. Morada/contactos e detalhe de reclamação exigem projeção privada adequada; listagem administrativa minimizada não recebe esses dados por omissão. Modelos/DTOs nunca serializam contas populadas integralmente.

Escrita condicional transacional no perfil elegível/configurado, com revisão comparada e incrementada, coordena aprovação/configuração e checkout; escritores desses campos devem participar no mesmo protocolo. Leitura prévia e transação sem coordenação não bastam. Implementação e testes ainda futuros: C04 mantém todas as rotas privadas ausentes, nenhum JWT/RBAC, bypass demonstrativo ou novo endpoint foi criado. Limite de crescimento conserva auditoria e espaço de decisões; nunca truncar/apagar ou migrar coleção sem análise e autorização.
