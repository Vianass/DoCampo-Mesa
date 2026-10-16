# Fase 3.1 — fundação técnica local

Autorização explícita de 2026-10-16: implementar localmente, criar `feat/api-foundation` a partir de `807aa68`, preservar os nove documentos locais de 3.0, manter Node 22.21.1 se compatível e preferir replica set MongoDB 8 de membro único. Não autoriza staging, commits, push, merge, PR ou Fase 3.2. Main permanece em c10d031.

## Implementação

Criada a fundação no workspace `@docampo/api`: Express independente do arranque, configuração Zod, ligação Mongoose, validação reutilizável, tratamento de erros, rota técnica, ciclo de vida e testes. Ver [estrutura/comandos completos](../../apps/api/README.md), [manifesto](../../apps/api/package.json) e [OpenAPI](openapi.yaml).

Único endpoint implementado: **GET /api/health**, público, sem query, resposta `estado: operacional` / `ambito: processo-http`. Confirma resposta do processo HTTP, não disponibilidade atual de MongoDB nem serviços Cloud. MongoDB tem de estar acessível antes do arranque HTTP. Todas as rotas comerciais/privadas permanecem não registadas, sem bypass de autenticação. Os mocks do frontend não são autoridade para a API.

Node **22.21.1** e npm **10.9.4** foram mantidos, sem atualização global. Versões diretas instaladas: Express **5.3.0**, Mongoose **9.11.2**, Zod **4.6.7**; desenvolvimento: TypeScript **5.9.3**, tsx **4.23.15**, Vitest **5.0.5**, Supertest **7.3.1**, Vite **8.3.4**, @types/node **22.20.5**, @types/express **5.0.6** e @types/supertest **7.2.1**. Requisitos de engines/peers foram confirmados nos metadados oficiais antes da instalação. Vite satisfaz o peer de Vitest; não é o servidor da API.

Instalação limitada ao workspace API, com versões diretas exatas e `--ignore-scripts`. Lockfile atualizado; nenhuma versão de pacote preexistente foi alterada e os manifestos de frontend/raiz permanecem iguais. Não foram acrescentados dotenv, driver MongoDB direto, ferramentas de autenticação, mapa, Cloud ou dependências comerciais.

## Ambiente e consistência técnica

`apps/api/.env.example` sem credenciais; nenhum `.env` privado criado ou lido nesta implementação. Configuração nativa Node lê `.env` opcionalmente apenas no arranque CLI. Testes recebem ambiente explícito e não leem configuração de desenvolvimento. URI e falhas do driver não são propagadas em erros/logs.

MongoDB **8.0.34** via Docker: desenvolvimento em `rs-dcm-dev` / porta local 27018 / volume persistente próprio; testes em `rs-dcm-test` / porta 27019 / tmpfs separado. Membro único por replica set, conforme ajuste do utilizador, com inicialização/espera pelo primário. Apenas loopback publicado; `directConnection=true` permite acesso nativo sem resolução dos nomes internos Docker. Não se criou ou modificou Atlas ou outro serviço Cloud.

Coleções transacionais são exclusivamente técnicas e isoladas por base aleatória, sem schemas Mongoose comerciais. A configuração de teste tem destino local fixo; a limpeza remove apenas a base criada pela suite. Commit preserva duas escritas; falha após a primeira deixa zero escritas; rollback de atualização/inserção preserva um documento anterior. Isto prova o mecanismo técnico no ambiente testado, não aprova nem implementa D06/D08 ou regras Q de encomendas/leilões.

## Limitações e decisões preservadas

- Q01–Q16 e C03/C05 continuam pendentes. A autorização de fundação não aprova coleções adicionais, regras comerciais, autenticação, paginação ou partilha de contratos.
- Segurança real permanece na semana 4 conforme C04. Não há login/registo reais, JWT, autorização, endpoints privados, CORS para integração ou frontend a consumir a API.
- Replica set de membro único não demonstra alta disponibilidade ou tolerância a falhas. Portas/infraestrutura sem autenticação são exclusivamente locais; não são publicação de produção.
- O diagnóstico HTTP não é readiness de dependências nem monitorização Cloud; não se implementou 503/sondas dos serviços.
- Limite JSON de 100 KiB e resposta 413 são limites técnicos desta implementação; não fixam limites comerciais de texto/upload. Códigos técnicos do erro estão documentados no README da API; requestId e política 403/404 de recursos alheios continuam sem escolha.
- Ensaios técnicos não substituem os futuros testes concorrentes de stock/licitações. Não existem reservas, checkout, licitação ou encerramento de leilões.

## Validação e revisão

Resultados finais em [traceability.md](traceability.md): 49 testes backend aprovados (19 de unidade, 22 HTTP e 8 de integração), 274 Playwright aprovados sem retries, build API e verificação compilada HTTP/SIGTERM aprovados. A suite backend inclui unidade, HTTP e integração MongoDB real, além dos 274 Playwright preservados. Não alterar testes existentes para acomodar a API.

Para revisão local, seguir os comandos do README da API, consultar /api/health, experimentar query inválida e rota inexistente e terminar por Ctrl+C. As três áreas privadas mantêm as sessões demonstrativas e dados atuais; a API não altera essa experiência.

## Sugestão de commits, não executados

1. `feat(api): add isolated REST foundation and MongoDB lifecycle` — implementação, configuração, exemplo de ambiente, Compose, manifesto e lockfile.
2. `test(api): cover HTTP lifecycle and MongoDB transactions` — testes de unidade, HTTP e integração técnica isolada.
3. `docs(api): record phase 3 decisions and foundation setup` — documentação complementar 3.0/3.1 e README da API.

A organização final deve respeitar dependências entre configuração/testes, sem commits artificiais ou estados intermédios quebrados. Toda a publicação depende de nova autorização explícita.

## Inventário desta implementação

Comparação com o estado local anterior à autorização (que já continha nove documentos 3.0 não versionados): **19 ficheiros criados e 10 modificados**, nenhum eliminado. Os dois documentos locais data-mapping.md e frontend-integration.md permaneceram byte a byte iguais nesta implementação. Todos os nove documentos 3.0 continuam presentes.

Ficheiros criados:

```text
apps/api/.env.example
apps/api/compose.yaml
apps/api/src/app.ts
apps/api/src/config/environment.ts
apps/api/src/database/connection.ts
apps/api/src/http/api-error.ts
apps/api/src/http/error-handler.ts
apps/api/src/http/validate.ts
apps/api/src/routes/technical.ts
apps/api/src/runtime.ts
apps/api/src/server.ts
apps/api/tests/http/foundation.spec.ts
apps/api/tests/integration/mongodb.spec.ts
apps/api/tests/unit/environment.spec.ts
apps/api/tests/unit/runtime.spec.ts
apps/api/tsconfig.build.json
apps/api/tsconfig.json
apps/api/vitest.config.ts
docs/api/foundation-implementation.md
```

Ficheiros modificados:

```text
apps/api/README.md
apps/api/package.json
package-lock.json
docs/api/phase-3.1-proposal.md
docs/api/traceability.md
docs/api/README.md
docs/api/implementation-plan.md
docs/api/openapi.yaml
docs/api/security.md
docs/api/decisions.md
```

Estado final dos processos: MongoDB de desenvolvimento disponível em loopback; MongoDB efémero de teste parado após validação. Os processos API usados nos ensaios foram encerrados. Para revisão, arrancar a API pelos comandos do README; para repetir integração, iniciar primeiro mongo-test.
