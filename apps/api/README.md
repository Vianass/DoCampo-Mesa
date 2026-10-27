> **Integração local da Fase 5B:** React consulta o catálogo público. O [README da raiz](../../README.md) descreve o arranque conjunto, a base dedicada `docampo_dev_catalog`, o seed manual protegido e a suite real separada. Não há alteração aos contratos ou autenticação desta API. Os registos de validação das fases anteriores abaixo conservam o seu contexto.

# API — catálogo e gestão de produtos da Fase 5A

Disponíveis localmente: GET `/api/products`, `/api/products/:id`, `/api/producers`, `/api/producers/:id`; GET próprios `/api/me/products` e `/api/me/products/:id`; POST/PUT/DELETE de produtos com JWT e propriedade. O DELETE arquiva. PUT é completo e PUT/DELETE exigem If-Match obtido na representação própria. Rascunhos não são públicos.

Ver [contratos e adaptação React](../../docs/api/frontend-integration.md) e [OpenAPI](../../docs/api/openapi.yaml). O arranque continua a exigir JWT_SECRET/MongoDB conforme os comandos abaixo; prepara também os índices existentes de products/producers. Não há novo modelo, dependência, frontend modificado, checkout HTTP ou leilão.

---

## Autenticação e configuração anteriores, preservadas

# API — autenticação local da Fase 4

Além do diagnóstico `GET /api/health`, estão implementados `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` e `POST /api/auth/logout`. Checkout continua interno e os endpoints comerciais não existem. Ver [segurança e limitações](../../docs/api/security.md) e [OpenAPI](../../docs/api/openapi.yaml).

## Arranque com autenticação

Copiar `.env.example` para `.env` local, manter a configuração MongoDB de desenvolvimento e preencher **JWT_SECRET** com pelo menos 32 bytes aleatórios codificados em base64url. Não versionar `.env` ou o segredo. Um comando local para gerar o valor é:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Não usar o segredo gerado como exemplo público. `JWT_ISSUER=docampo-api`, `JWT_AUDIENCE=docampo-web` e `JWT_TTL_SECONDS=900` são os valores por omissão. `CORS_ORIGINS` contém origens exatas separadas por vírgulas; vazio bloqueia origens de browser. `TRUSTED_PROXY_IPS` vazio não confia em X-Forwarded-*; produção exige HTTPS através de proxy confiável explicitamente configurado e acesso de rede restrito.

```sh
npm run mongo:dev:up --workspace @docampo/api
npm run dev --workspace @docampo/api
```

O arranque real falha sem segredo válido e prepara o índice único de email antes de abrir HTTP. Registo aceita apenas `{nome, email, password}`, com 202 genérico também para duplicados e sem token; não aceita papel/estado ou confirmação de password. Login aceita `{email, password}` e devolve Bearer/expiração/identidade própria. Usar `Authorization: Bearer ...` em me/logout. Logout devolve `revogado: false`: descartar o token no cliente **não o revoga no servidor**.

Hashes novos são Argon2id; bcrypt anterior continua verificável. A conta tem capacidades acumuláveis e um indicador ativo compatível com documentos antigos; não há criação de administrador, reset de password, refresh, UI real ou endpoint de alteração de permissões.

## Validação atual

```sh
npm run typecheck --workspace @docampo/api
npm run lint --workspace @docampo/api
npm run format:check --workspace @docampo/api -- --ignore-path ../../.prettierignore
npm run build --workspace @docampo/api
npm run mongo:test:up --workspace @docampo/api
npm test --workspace @docampo/api
```

Os testes não leem `.env`, usam MongoDB real isolado na porta 27019 e segredos aleatórios gerados apenas em memória. Dependências novas exatas: argon2 0.45.1, bcryptjs 3.0.3 e jose 6.2.13; body-parser transitivo corrigido para 2.4.0. Não se alteram dependências do frontend.

---

## Fundação 3.1 — registo histórico

# API — fundação técnica, Fase 3.1

Node.js 22.21.1, npm 10.9.4, Express 5 e TypeScript, com configuração própria independente do frontend. Implementação local, sem módulos comerciais, autenticação real, integração web, recursos Cloud ou publicação. Q01–Q16 e C03/C05 continuam pendentes.

## Execução local

As dependências estão declaradas no workspace `@docampo/api` e fixadas no lockfile da raiz. Num novo checkout, instalar pelo lockfile da raiz com `npm ci`. Não é necessário atualizar globalmente Node/npm.

Da raiz do repositório:

```sh
npm run mongo:dev:up --workspace @docampo/api
cp -n apps/api/.env.example apps/api/.env
npm run dev --workspace @docampo/api
```

Copiar o exemplo apenas se ainda não existir `.env`; preservar qualquer configuração local existente. O exemplo não contém credenciais. O ficheiro privado é ignorado pelo Git. Não enviar URIs/segredos para variáveis `VITE_*`.

Consultar `http://127.0.0.1:3001/api/health`. A resposta é `{"estado":"operacional","ambito":"processo-http"}` e confirma somente que o processo HTTP respondeu. Não é monitorização de MongoDB/Atlas/Blob/Socket.IO/Swagger. A ligação MongoDB é exigida antes de abrir HTTP; uma falha posterior da base não transforma este endpoint numa sonda de prontidão.

O diagnóstico não aceita parâmetros de consulta. Não existem rotas de autenticação, CRUD, encomendas, administração ou acesso privado. Enviar papel demo, ID ou Bearer fictício não concede acesso. Rotas não implementadas devolvem 404; não se simula uma sessão real.

Build e execução JavaScript sem tsx:

```sh
npm run build --workspace @docampo/api
npm start --workspace @docampo/api
```

`start` e `dev` leem `.env` apenas se existir; variáveis já fornecidas ao processo têm precedência. Sem configuração MongoDB obrigatória, o arranque termina com código 1 antes de abrir a porta. SIGINT/SIGTERM param novas ligações HTTP, aguardam pedidos em curso e fecham MongoDB; há um prazo máximo de encerramento.

## Estrutura

| Caminho                                   | Responsabilidade                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| src/app.ts                                | Composição Express, JSON limitado, rotas e pipeline de erros; importar não abre portas nem liga MongoDB. |
| src/server.ts                             | Entrada executável, ambiente, mensagens seguras e sinais.                                                |
| src/runtime.ts                            | Ligação antes do listen, libertação após falha e encerramento idempotente/limitado.                      |
| src/config/environment.ts                 | Zod para ambiente, valores técnicos e mensagens sem valores privados.                                    |
| src/database/connection.ts                | Conexão Mongoose independente, buffering/índices automáticos desativados, falhas normalizadas.           |
| src/http                                  | Erros estruturados e middleware reutilizável de validação.                                               |
| src/routes/technical.ts                   | Única rota técnica.                                                                                      |
| tests/unit, tests/http, tests/integration | Suites independentes de Playwright/frontend.                                                             |

Os futuros módulos podem ser acrescentados em `src/modules/<modulo>` com rotas/serviço/validação/acesso a dados. Nenhum módulo ou schema comercial é criado nesta fase. A configuração `NodeNext` emite imports ESM executáveis; a compilação de produção exclui testes e configuração Vitest. Não herda DOM/Bundler/noEmit do frontend.

## Variáveis

| Variável                            | Regra                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| NODE_ENV                            | development por omissão; aceita development/test/production. Em test exige nome `docampo_test_*`. |
| API_HOST                            | 127.0.0.1 por omissão.                                                                            |
| API_PORT                            | 3001 por omissão; inteiro de 1 a 65535.                                                           |
| MONGODB_URI                         | Obrigatória, formato mongodb:// ou mongodb+srv://; nunca devolvida nos erros/logs.                |
| MONGODB_DB_NAME                     | Obrigatória, letras/números/underscore/hífen; base explícita por ambiente.                        |
| MONGODB_SERVER_SELECTION_TIMEOUT_MS | 5000 por omissão; entre 100 e 60000 ms.                                                           |
| SHUTDOWN_TIMEOUT_MS                 | 10000 por omissão; entre 100 e 60000 ms.                                                          |

Os valores são limites técnicos desta fundação, não decisões comerciais. URI `mongodb+srv://` permite configurar Atlas futuramente sem criar recursos ou escolher um plano agora.

## MongoDB local

Docker Compose usa `mongo:8.0.34` e dois **replica sets de membro único**: `mongo-dev` / `rs-dcm-dev` na porta local 27018, com volume persistente próprio; `mongo-test` / `rs-dcm-test` na porta 27019, com armazenamento efémero tmpfs. O healthcheck inicia apenas o replica set respetivo e aguarda um primário elegível. A API nativa usa `directConnection=true`, evitando descoberta de endereços internos do contentor.

As portas estão publicadas apenas em 127.0.0.1. Esta infraestrutura local sem autenticação não é uma configuração de produção nem demonstra tolerância a falhas. Cada contentor tem base/armazenamento próprios. Não utilizar a base de desenvolvimento para testes transacionais. Não executar `down -v` para limpar indiscriminadamente dados de desenvolvimento.

## Validações

Da raiz:

```sh
npm run typecheck --workspace @docampo/api
npm run lint
npm run format:check --workspace @docampo/api -- --ignore-path ../../.prettierignore
npm run build --workspace @docampo/api
npm run mongo:test:up --workspace @docampo/api
npm test --workspace @docampo/api
npm run build
npm run test:e2e -- --workers=4
```

Também existem `test:unit`, `test:http`, `test:integration` e `test:watch` no workspace API. Os testes HTTP usam Supertest e portas efémeras locais; algumas sandboxes exigem autorização para abrir sockets. `test` inclui sempre MongoDB real: um ambiente indisponível faz falhar a suite, sem fallback ou omissão silenciosa.

A integração usa exclusivamente `127.0.0.1:27019`, replica set `rs-dcm-test`, nome aleatório `docampo_test_<uuid>` e não lê `.env`. Confirma versão/topologia antes dos ensaios. Só a base criada pela suite é eliminada no final. Coleções técnicas verificam commit de duas escritas, rollback após falha e preservação de dados anteriores; não existem schemas comerciais. A suite também verifica ligação indisponível, arranque, configuração inválida e encerramento por SIGTERM.

Para parar apenas o MongoDB efémero de teste após validar:

```sh
docker compose -f apps/api/compose.yaml --profile test stop mongo-test
```

## Erros e limites

Respostas usam `codigo`, `mensagem` e `campos` quando aplicável, com nomes/mensagens controlados e sem stack, driver, URI ou valores rejeitados. Códigos técnicos: ROTA_NAO_ENCONTRADA (404), PEDIDO_INVALIDO e JSON_INVALIDO (400), PEDIDO_DEMASIADO_GRANDE (413; limite JSON 100 KiB) e ERRO_INTERNO (500). A infraestrutura suporta erros controlados 401/403/409, sem implementar ainda autenticação/autorização ou conflitos comerciais. Não se escolheu política 403/404 para propriedade, duração de JWT, paginação, requestId ou precondições de edição.

Ver [documentação complementar](../../docs/api/README.md), [registo de decisões](../../docs/api/decisions.md) e [entrega 3.1](../../docs/api/foundation-implementation.md). Os nove documentos originais da Fase 0 e o frontend aprovado permanecem preservados.
