# Fase 7A — candidaturas e aprovação real de produtores

Implementação **local**, na branch `feat/api-foundation`, sobre `f40f21913930446a28c00016feed3a9de46397c3`. Sem frontend novo, dependências novas, publicação, alterações da main ou dos nove documentos da Fase 0. Esta fase concretiza o pedido de candidatura, decisão administrativa e reapresentação; as propostas antigas conservam o seu contexto histórico.

## Arquitetura e persistência

O módulo `apps/api/src/modules/producer-applications/` separa validação HTTP, rotas, serviço transacional e projeções explícitas. É ligado por `app.ts` e preparado antes de abrir HTTP em `runtime.ts`. Reutiliza autenticação JWT, controlo de acesso, erros estruturados, paginação e as coleções **users** e **producers**. Não existe uma coleção adicional de candidaturas ou decisões.

`producers.userId` continua imutável e único: uma conta tem no máximo um perfil, cujo ID permanece estável entre tentativas. A tentativa atual utiliza os campos já aprovados `nomePublico`, `descricao`, `localidade`, `concelho`, `telefone` e `aprovacao`. A candidatura não recolhe documentos de identidade, dados bancários, certificações ou outros dados pessoais novos. Fotografia e configuração comercial preexistentes são preservadas, sem serem aceites no formulário de candidatura.

`aprovacao` conserva `estado`, `submetidaEm` e `decisao`, esta com `autor`, `data` e justificação obrigatória na rejeição. Os estados existentes são `pendente`, `aprovado` e `rejeitado`. Os dados da decisão são sempre atribuídos pelo servidor.

O novo campo privado e opcional `historicoCandidaturas` guarda snapshots de tentativas **rejeitadas anteriores**. Cada entrada conserva os cinco campos submetidos, data de submissão e decisão com administrador, data e motivo. O estado rejeitado é implícito na persistência histórica e explícito no DTO. A tentativa rejeitada atual só é movida para o histórico ao reapresentar. Nenhuma tentativa é apagada ou truncada. A nova data de submissão sucede à decisão anterior, mesmo perante diferenças de relógio.

O histórico usa `select: false` e é removido por `toJSON`/`toObject` por omissão, incluindo documentos completos ou parciais. DTOs privados são construídos por lista de campos permitidos. O DTO do próprio omite IDs administrativos e ID da conta; o detalhe administrativo inclui esses IDs para auditoria. Não incluem hashes, papéis editáveis, revisões internas, configurações comerciais, segredos ou email.

Os perfis existentes sem histórico continuam válidos e apresentam `historico: []`. Não há migração, alteração de estados ou atribuição retroativa de permissões. Mantém-se o índice único `userId`; acrescenta-se o índice `{ aprovacao.estado: 1, aprovacao.submetidaEm: -1, _id: 1 }` para consulta administrativa. Os testes antigos de índices foram atualizados para verificar este acréscimo, preservando as verificações de unicidade e ausência de coleções novas.

## Endpoints implementados

Todos os caminhos abaixo têm prefixo `/api`, exigem JWT válido e conta ativa, e devolvem `Cache-Control: no-store`. O contrato completo está no [OpenAPI](openapi.yaml).

| Método e caminho                                | Acesso                           | Resultado                                                                         |
| ----------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| POST `/me/producer-application`                 | Qualquer conta ativa autenticada | 201: primeira submissão ou reapresentação; perfil pendente, sem conceder produtor |
| GET `/me/producer-application`                  | Próprio, determinado pelo JWT    | Tentativa atual e histórico próprio; 404 se não existir perfil                    |
| GET `/admin/producer-applications`              | Papel administrador atual        | Resumos paginados, filtro `estado`, ordenação por data                            |
| GET `/admin/producer-applications/:id`          | Papel administrador atual        | Dados submetidos e histórico com autoria administrativa                           |
| POST `/admin/producer-applications/:id/approve` | Papel administrador atual        | Aprovação e adição cumulativa de produtor, na mesma transação                     |
| POST `/admin/producer-applications/:id/reject`  | Papel administrador atual        | Rejeição fundamentada, sem concessão de capacidades                               |

As quatro propostas antigas `/me/producer/application`, `/admin/applications`, `/admin/applications/:id` e `PATCH /admin/applications/:id/decision` permanecem documentadas como propostas substituídas/deprecated; não são implementadas nem aliases. As rotas escolhidas seguem as sugestões do pedido da Fase 7A e permitem submeter sem exigir previamente o papel produtor.

A validação estrita do OpenAPI identificou `required: []` no corpo de cancelamento de leilões, já presente no HEAD inicial. Retirou-se apenas essa declaração redundante, inválida no schema OpenAPI 3.0. O corpo continua a ser um objeto vazio obrigatório, sem propriedades permitidas; o contrato e o comportamento anteriores são preservados.

### Submissão e reapresentação

O corpo JSON contém exatamente os seguintes campos, todos obrigatórios:

```json
{
  "nomePublico": "Horta fictícia de revisão",
  "localidade": "Localidade fictícia",
  "concelho": "Concelho fictício",
  "descricao": "Atividade agrícola fictícia para revisão local.",
  "telefone": "+351 000 000 000"
}
```

Os textos são normalizados em NFC e aparados; têm de ficar não vazios. Limites por caracteres Unicode: nome 160, localidade/concelho/telefone 120, descrição 5000. O telefone segue a representação textual existente; não se introduz validação de número nacional ou alegação de contacto verificado. Os snapshots legados preservam concelho/telefone sem aplicar retroativamente os novos limites de entrada.

IDs, papéis, estados, decisão, datas, histórico, configuração comercial e campos adicionais são recusados. A identidade vem do JWT. Sem perfil, cria-se um perfil pendente. Pendente ou aprovado devolve 409, sem alteração. Após rejeição, o mesmo perfil é reapresentado, a tentativa anterior é arquivada e a decisão atual é retirada. Duas submissões ou reapresentações concorrentes não criam duplicados nem duas entradas históricas.

Submeter não atribui papéis, não publica produtos nem configura vendas. Os papéis anteriormente existentes são preservados, incluindo o produtor de perfis legados pendentes; as guardas comerciais existentes continuam a exigir aprovação para publicação e venda.

Não existe chave idempotente de submissão nesta fase. Após resposta perdida ou HTTP 503, consultar o GET próprio antes de repetir. Uma candidatura pendente já confirmada devolve 409 numa repetição.

### Consulta administrativa

Parâmetros estritos: `pagina` de 1 a 1000, `porPagina` em 12/24/36, `ordem=recentes|antigas`, `estado=pendente|aprovado|rejeitado` opcional. Ordena por submissão e desempata por ID. Uma agregação com `$facet` obtém a página e a contagem do mesmo conjunto; fora da última página devolve itens vazios. O envelope contém `itens`, `pagina`, `porPagina`, `total`, `totalPaginas`. O resumo inclui ID do perfil, ID da conta, nome, estado e data; contactos e histórico ficam no detalhe protegido. Pesquisa textual não faz parte desta fase.

### Aprovar ou rejeitar

Consultar primeiro o detalhe administrativo e copiar o cabeçalho `ETag` para `If-Match`. Aprovar envia `{}`; rejeitar envia `{"justificacao":"Descrição clara do motivo."}`, normalizada e não vazia, até 2000 caracteres. Ambos exigem `application/json` e query vazia.

O ETag é forte e opaco, com HMAC, ID do perfil, revisão operacional e aprovação atual. A alteração de tentativa, decisão ou revisão invalida-o. Não se pode aprovar uma nova tentativa com um pedido antigo. Ausência de `If-Match`: 428; valor inválido/duplicado: 400; versão diferente: 412. Decisão repetida com versão antiga: 412; com versão atual mas candidatura já decidida: 409. Repetições não alteram autoria ou data.

Administrador sem papel atual recebe 403; conta administrativa inativa recebe 401. Candidato entretanto inativo ou eliminado recebe 409 `CANDIDATO_INELEGIVEL`, sem invalidar a sessão do administrador ou produzir efeitos parciais. ID inválido recebe 400 e inexistente 404. Motivo inválido recebe 400. Não existe alteração de decisões terminais, suspensão de produtores ou atribuição de outros papéis.

## Transações e concorrência

Cada mutação utiliza uma sessão MongoDB explícita e transação com `readConcern: snapshot`, `writeConcern: majority`, leitura primária e limite de 10 segundos. O driver pode repetir transações transitórias; a aplicação limita o callback a três execuções, relendo os dados em cada uma. Exige replica set, como checkout e leilões.

As contas são revalidadas dentro da transação e recebem um write fence por compare-and-swap em `revisaoOperacional`, já utilizada pelos serviços existentes. A guarda administrativa exige papel administrador atual, independentemente da principal passada ao serviço. A conta candidata tem de continuar ativa. Alterações concorrentes de atividade/papéis provocam conflito/repetição e revalidação. O `save` do perfil mantém validação completa e a guarda existente de revisão operacional.

Na aprovação, a transação grava a decisão no perfil e adiciona `produtor` a `users.papeis` com `$addToSet`, preservando comprador e quaisquer outros papéis. Falhar a segunda escrita reverte a primeira. Não se emite JWT novo: o serviço de autenticação consulta papéis atuais na base em cada pedido. Na rejeição não se atribui produtor nem se revogam papéis legados. A reapresentação preserva histórico, perfil e capacidades anteriores na mesma transação.

O índice único impede perfis duplicados. Duas decisões concorrentes têm apenas um vencedor; a restante operação relê e encontra versão/estado alterados. Erros transitórios não resolvidos ou resultado de commit indeterminado devolvem 503 `RESULTADO_INDETERMINADO`: consultar o recurso antes de repetir. Não se promete sucesso ou rollback quando o resultado é desconhecido. Outros erros internos não expõem valores, stacks ou dados da ligação.

## Segurança e compatibilidade

Reutiliza JWT HS256, verificação de expiração, consulta atual de conta/papéis, middleware administrativo e CORS/TLS/proxy existentes. A demonstração de papéis do frontend não autentica nem autoriza estes endpoints. Não existe registo público administrativo nem endpoint genérico de atribuição de papéis. Os limites JSON existentes continuam a aplicar-se; não há logs novos de pedidos ou credenciais. As quotas de autenticação e leilões continuam específicas desses módulos; não se afirma haver quota dedicada ou distribuída para candidaturas.

Só o próprio obtém o seu recurso através de `/me`; não aceita ID de outro utilizador. O comprador/produtor sem papel administrativo não acede a listagem, detalhes ou decisões administrativas. Contactos e histórico nunca entram no catálogo ou no perfil público. A serialização parcial continua segura. Não são alterados catálogo, checkout, encomendas, stock, leilões, Socket.IO, autenticação, configurações comerciais ou dashboards React.

A aprovação não publica rascunhos, define stock, cria leilões, encomendas ou pagamentos. O produtor aprovado necessita das configurações comerciais e ações explícitas exigidas pelos serviços existentes antes de vender.

## Testes e validação

Os novos ficheiros unitário, HTTP e de integração chamam-se `producer-applications.spec.ts`, nas respetivas pastas. As fixtures utilizam contas/domínios/telefone fictícios. A integração usa MongoDB 8 em replica set na porta 27019, base aleatória `docampo_test_*`, descartada no final; não utiliza Atlas ou dados de produção.

Cobertura: payloads válidos/inválidos, limites Unicode, mass assignment, JWT ausente/expirado/adulterado, conta inativa, isolamento do próprio, operações administrativas, capacidades atuais, repetição e concorrência de submissões/decisões, rollback após escrita do perfil, reapresentações e snapshots, ETag antigo após reapresentação, privacidade pública, perfis e papéis legados, catálogo e leilões reais. Inclui alteração de candidato/admin **durante** a transação, entre a leitura snapshot e o write fence.

Comandos da raiz, com MongoDB de teste disponível:

```sh
npm run test:unit --workspace @docampo/api
npm run test:http --workspace @docampo/api
npm run test:integration --workspace @docampo/api
npm run typecheck --workspace @docampo/api
npm run typecheck --workspace @docampo/web
npm run lint
npx prettier --check --ignore-path .prettierignore apps/api docs/api README.md
npm run build --workspace @docampo/api
npm run build --workspace @docampo/web
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.integration.config.ts
npx playwright test --config playwright.auctions.config.ts
git diff --check
```

As três configurações Playwright são executadas separadamente; as duas de integração real partilham portas e usam um worker, com bases e contas fictícias isoladas. O relatório de entrega distingue resultados efetivamente reexecutados de históricos. OpenAPI é verificado quanto a sintaxe, referências, operações, exemplos e preservação das operações anteriores; a integridade da Fase 0 é comparada byte a byte com a main aprovada.

Validação final efetivamente reexecutada nesta entrega:

| Verificação                                              | Resultado                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Backend completo                                         | 1607 testes aprovados: 973 unitários, 172 HTTP, 462 integração                                    |
| Testes novos de candidaturas                             | 110: 45 unitários, 26 HTTP, 39 integração MongoDB real                                            |
| Frontend habitual                                        | 460 testes Playwright aprovados                                                                   |
| React/API/MongoDB existente                              | 53 testes aprovados                                                                               |
| React/API/Socket.IO/MongoDB de leilões                   | 12 testes aprovados, incluindo seis larguras                                                      |
| TypeScript API/React, ESLint, Prettier, builds API/React | Aprovados                                                                                         |
| OpenAPI 3.0                                              | Schema estrito, 789 referências e exemplos válidos; 31 operações anteriores preservadas e 6 novas |
| Documentação                                             | 569 ligações locais em 42 ficheiros Markdown, sem ligações quebradas                              |
| Preservação                                              | Nove documentos da Fase 0, frontend, packages e dependências verificados por conteúdo             |

A suite completa backend voltou a executar todos os testes após o último ajuste do teste de concorrência. Este aceita 409 quando se esgotam as tentativas transitórias, ou 412 quando a releitura deteta a versão antiga, exigindo sempre exatamente um vencedor e consistência entre perfil e papéis. Os resultados finais substituem as falhas intermédias de execução em sandbox, expectativas antigas de índices e expectativa demasiado restrita do código concorrente. Não foi alterado comportamento comercial para fazer passar os testes.

## Limitações e preparação para React — futura Fase 7B

- Apenas backend local. Os formulários e decisões dos dashboards demonstrativos ainda não chamam estes endpoints e não são prova de aprovação real.
- O futuro React deverá consultar `/me/producer-application`, enviar os cinco campos e apresentar claramente estado, datas, motivo e tentativas anteriores. Um 404 significa ausência de candidatura; um 409 pede atualização da consulta.
- A área administrativa deverá obter o detalhe antes de decidir, conservar o ETag e reler após 412/409/503, sem repetir uma decisão às cegas.
- Após aprovação, revalidar `/api/auth/me` para atualizar os papéis apresentados pelo cliente. O token existente continua a representar a mesma identidade, com permissões decididas pelo backend. Atualizar o browser continua a terminar a sessão em memória.
- Não há upload/prova documental, certificação, envio de email, notificações Socket.IO de candidaturas, revisão de decisão terminal, suspensão, provisionamento administrativo ou UI de configuração comercial. Nenhum destes poderes é inferido nesta fase.
- O histórico embebido está sujeito ao limite BSON de 16 MiB por documento; não se elimina auditoria para o contornar. Históricos excecionais exigirão decisão arquitetural antes de extrair dados para outra coleção. O erro de tamanho do servidor é traduzido para 413 quando identificado.
- A unicidade de perfil e as transações exigem índices preparados e replica set. Em múltiplas instâncias, MongoDB conserva a consistência; não existe quota distribuída de candidaturas.
- Não se implementa a Fase 7B, nem se executa qualquer operação Git de consolidação/publicação, sem nova autorização.
