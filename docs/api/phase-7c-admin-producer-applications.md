# Fase 7C — interface administrativa de candidaturas

Implementação local para revisão, na branch `feat/api-foundation`, sobre `5cbb6aff52fbf99fa12ffff7ad798d3f2437e181`. Utiliza exclusivamente os contratos reais da [Fase 7A](phase-7a-producer-applications.md) e preserva o percurso do candidato da [Fase 7B](phase-7b-react-producer-applications.md). Não altera backend, contratos, dependências ou os nove documentos da Fase 0. Sem consolidação Git ou início da Fase 8.

## Rotas e integração administrativa

| Rota real                              | Utilização                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `/area/administrador`                  | Entrada contextual com o total real de candidaturas pendentes e uma ação para analisar |
| `/area/administrador/candidaturas`     | Resumos, filtros, ordenação e paginação reais                                          |
| `/area/administrador/candidaturas/:id` | Dados privados autorizados, auditoria, histórico e decisões                            |

As rotas administrativas já existiam. O dispatcher `AccountArea` passa a carregar o módulo real através de `lazy`/`Suspense`, após verificar o papel confirmado. A entrada utiliza a navegação existente; retira-se apenas o cartão genérico de indisponibilidade de candidaturas na visão geral administrativa, evitando uma segunda chamada para a mesma tarefa. As restantes secções continuam identificadas como não integradas. Não se inventam contagens de utilizadores, vendas ou serviços operacionais.

Os percursos demonstrativos em `/demonstracao` continuam isolados e mantêm as simulações anteriores. Não chamam estes endpoints nem concedem capacidades administrativas.

## Arquitetura frontend e componentes

O módulo `apps/web/src/features/admin-applications/` separa:

| Ficheiro                                                  | Responsabilidade                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `contracts.ts`                                            | DTOs administrativos, projeção segura, ETag, envelope paginado, filtros e motivo de rejeição |
| `AdminApplicationsContext.ts` / `useAdminApplications.ts` | Contrato tipado do estado e acesso ao contexto                                               |
| `AdminApplicationsProvider.tsx`                           | Detalhe, versão, rascunho temporário, exclusão de envios concorrentes, decisão e recuperação |
| `useApplicationList.ts`                                   | Consulta paginada, cancelamento e invalidação após decisões                                  |
| `AdminApplicationEntry.tsx`                               | Entrada e total pendente devolvido pelo serviço                                              |
| `AdminApplicationsArea.tsx`                               | Listagem e composição do detalhe, estados, navegação e foco                                  |
| `AdminApplicationDetails.tsx`                             | Dados da exploração, auditoria e tentativas anteriores                                       |
| `AdminApplicationDecision.tsx`                            | Validação do motivo e confirmação nativa antes do POST                                       |

Reutiliza `useAuth().request`, sem outro cliente HTTP, armazenamento de JWT ou autenticação. Reutiliza `ApplicationDetails`, `parseApplication`, labels de estado, `ProducerSelect`, `ProducerTextarea`, `Button`, `StatusBadge`, `EmptyState`, `LoadingSkeleton` e datas do projeto. Os DTOs administrativos acrescentam apenas os identificadores autorizados; a projeção do próprio da Fase 7B continua a omiti-los.

O provider fica dentro de `AuthProvider`, acima da área protegida, para conservar o motivo em memória durante a confirmação de sessão por foco/visibilidade. O estado pertence à combinação identidade/expiração da sessão com papel administrativo confirmado. Sair ou perder esse papel limpa os dados e cancela pedidos. O motivo pertence também ao ETag consultado: uma nova versão retira um rascunho de decisão da tentativa anterior, mesmo depois de uma falha de leitura. Não existe persistência deste rascunho.

## Listagem e limites dos dados

GET `/api/admin/producer-applications` utiliza `pagina` (1–1000), `porPagina` (12/24/36), `ordem` (`recentes`/`antigas`) e `estado` opcional (`pendente`/`aprovado`/`rejeitado`). Os controlos guardam esses filtros na query da rota; alterar filtros ou ordenação regressa à primeira página. O detalhe conserva a query para voltar à mesma listagem. A API recebe apenas os parâmetros suportados.

Os totais e a paginação vêm do envelope real `itens`, `pagina`, `porPagina`, `total`, `totalPaginas`. Não se filtra uma página carregada como se fosse a população completa. Uma página acima do total é substituída na URL pela última página válida devolvida pela API, preservando estado, ordenação e tamanho da página. Quando não há resultados, o destino é a página 1. Durante a correção apresenta-se carregamento, sem renderizar contadores impossíveis; a consulta seguinte é real e o título recebe foco. Cada correção reduz estritamente a página solicitada, sem repetir automaticamente a mesma página ou alterar contratos. O mesmo comportamento cobre URLs antigos, atualização de totais e regresso depois de decidir a última candidatura de uma página. O teto de 1000 páginas é o do backend, sem tentativa de o contornar.

O resumo só fornece ID da candidatura, ID da conta, `nomePublico`, estado e data de submissão. **Não fornece nome pessoal do candidato, email ou localidade**. A listagem apresenta a exploração e a data, sem inventar dados ou fazer junções com perfis públicos. A localidade, o concelho, a descrição e o telefone estão no detalhe administrativo protegido. Não se implementa pesquisa textual, pois não existe no contrato.

Há skeleton, lista, ausência de candidaturas, ausência de resultados para o filtro, página vazia e erro recuperável. Uma falha não é apresentada como total zero. O indicador na visão geral utiliza `total` da consulta `estado=pendente`; não conta apenas a página carregada nem representa uma nova métrica de negócio.

## Detalhe, auditoria e histórico

GET `/api/admin/producer-applications/:id` valida o identificador, o DTO e o ETag forte antes de permitir decidir. IDs inválidos e inexistentes apresentam recuperação; não há ações sobre um detalhe inválido ou incompleto. ETags ausentes/fracos são tratados como consulta inválida, não substituídos por uma versão local.

O detalhe mostra os cinco campos submetidos, estado, datas e motivo atual de rejeição. Identificadores da candidatura, conta e administrador ficam numa secção de auditoria expansível. O histórico preserva os dados, datas, motivos e administrador das tentativas anteriores. A tentativa rejeitada atual só entra no histórico quando o candidato reapresenta, conforme o backend. A interface não elimina nem edita auditoria.

## Aprovação e rejeição

Ambas as ações só são apresentadas para a tentativa pendente confirmada e utilizam um `dialog` nativo, com fundo inerte, foco contido, cancelamento por Escape e retorno à ação de origem. A opção inicial é continuar a análise. Os limites de Tab/Shift+Tab são explícitos: o foco permanece nos elementos do diálogo, sem passar pelos controlos do Chrome e desencadear uma confirmação de sessão que fecharia o modal. Atalhos do browser não são intercetados. Motivos longos têm uma região focável de leitura com deslocação vertical, conservando título e ações visíveis. No envio, os controlos ficam desativados e Escape não dispensa a confirmação em curso.

- Aprovar: POST `/api/admin/producer-applications/:id/approve`, JSON `{}`.
- Rejeitar: POST `/api/admin/producer-applications/:id/reject`, JSON `{"justificacao":"..."}`.
- Ambos enviam `If-Match` com o ETag forte recebido do detalhe e esperam HTTP 200 com DTO e ETag válidos.

O motivo é obrigatório apenas para rejeitar, normalizado em NFC e aparado, entre 1 e 2000 caracteres Unicode. O campo indica o limite e que o candidato pode ler o texto. Uma rejeição inválida foca o campo com `aria-invalid` e erro associado, sem abrir confirmação ou enviar POST. A aprovação não exige esse motivo.

Uma guarda síncrona impede POST simultâneo, além de `disabled` e `aria-busy`. Uma resposta confirmada atualiza o detalhe com **o DTO devolvido pelo serviço**, anuncia o resultado, foca o título e retira as ações da tentativa terminal. A listagem/indicador são invalidados e relidos quando apresentados, sem alterar resumos por suposição. Não existe edição de decisões concluídas.

Não se atribuem papéis no browser. A aprovação, elegibilidade atual da conta candidata e persistência são responsabilidade do serviço transacional. O candidato da Fase 7B confirma as suas capacidades através de `/auth/me`. Uma candidatura pendente cujo candidato ficou inativo pode ser recusada com 409, sem sucesso falso ou invalidação da sessão do administrador.

## Concorrência e resultado incerto

Não se cria contador de versão ou mecanismo de concorrência paralelo. O ETag opaco é reenviado intacto; uma nova tentativa ou decisão externa invalida o ETag antigo.

HTTP 412 ou 409 não produz confirmação de sucesso. A interface informa a mudança/inelegibilidade, bloqueia decisões e faz GET do detalhe. A consulta também invalida a listagem. A decisão atual, motivo e autoria passam a refletir o serviço. Uma tentativa já decidida não volta a apresentar ações.

Rede, timeout, resposta inválida e HTTP 503 também exigem consulta, nunca repetição automática do POST. Uma resposta perdida depois do commit pode mostrar a decisão já gravada; não se atribui o resultado à tentativa incerta apenas por suposição. Se o estado ainda for pendente, é necessário usar explicitamente a ação de consulta para retomar a análise com uma nova confirmação. Se a consulta falhar, mantém-se o bloqueio e a possibilidade de recuperar. Erros de precondição/validação seguem a mesma política conservadora de consulta.

Leituras substituídas são canceladas, respostas de outra sessão são descartadas e o cliente de sessão existente aplica a sua guarda de identidade. A saída da página durante um envio não concede outra decisão; uma nova página aguarda a operação/consulta própria. Não há polling ou eventos Socket.IO de candidaturas nesta fase.

## Segurança e acessibilidade

As guardas existentes protegem a rota com o papel `administrador` confirmado. A API verifica identidade, atividade e papel atuais em cada operação. O estado de demonstração não autentica. JWT fica apenas na infraestrutura de sessão em memória; não entra em storage, URLs, logs ou dados do módulo.

HTTP 401 usa a invalidação de sessão existente e retira dados privados. HTTP 403 apresenta indisponibilidade administrativa e não mantém dados/ações; o administrador pode confirmar permissões pelo mecanismo `/auth/me`, sem ciclo automático de revalidação. A projeção por lista de campos permitidos não guarda passwords, hashes, emails ou dados comerciais extras.

Erros de transporte/decisão focam um grupo de recuperação distinto do texto em `role=alert`, evitando anunciar o mesmo erro em duas regiões live. Paginação e decisões focam um título estável; alterações de filtros mantêm os controlos. Estados têm texto além da cor, labels e descrições associadas. O diálogo tem título e descrição acessíveis. O padrão incorpora as correções de foco e recuperação da Fase 7B.

SASS próprio e Bootstrap existente preservam tokens, DM Serif Display/DM Sans e navegação privada. Apenas os botões de `.admin-applications`, `.admin-application-entry` e `.admin-decision-dialog` deixam de interpolar cores: as mudanças de foco, hover, active e disabled são imediatas, evitando perda de contraste durante a transição. Mantêm-se as cores finais e o contorno de foco existentes; o Button global e as restantes áreas não são alterados. Cartões substituem tabelas largas: uma coluna em telemóvel e duas quando há espaço. Filtros empilham em mobile. Textos e identificadores podem quebrar dentro das superfícies; os controlos principais têm pelo menos 44 px. Não se declara certificação de acessibilidade ou leitura audível com VoiceOver sem execução manual efetiva.

## Testes e validação

- `apps/web/tests/admin-application-model.spec.ts`: projeção, privacidade, ETag forte, estados, histórico/autoria, coerência de páginas, query e limite Unicode do motivo.
- `apps/web/tests/admin-applications.spec.ts`: recuperação de páginas inexistentes/vazias ou reduzidas, regresso após decisão da última candidatura e amostragem de contraste por frame nos estados normal/hover/focus/focus-visible/active/disabled; acesso, listagem/filtros/paginação, vazio/erro/loading, confirmações, motivo, duplicados, recuperação, conflitos, privacidade, rascunho/versionamento, 401/403, navegação e foco.
- `apps/web/tests/admin-applications.real.spec.ts`: React/API/MongoDB reais, recuperação de página inexistente e da última candidatura decidida com filtros preservados, paginação, aprovação, rejeição/reapresentação, histórico, dois administradores com 412, resposta perdida após commit, candidato inativo, permissões atuais, recuperação de transporte e seis larguras. Inclui confirmação de capacidades na interface da Fase 7B.
- `apps/web/tests/support/admin-application-fixtures.ts`: transporte controlado apenas para testes determinísticos; não é fonte da aplicação real.

As integrações usam a base efémera do servidor existente, contas fictícias e endpoints reais; os administradores são fixtures provisionadas apenas nessa base. Não se alteram os testes anteriores de leilões. A sua instabilidade conhecida com segundos `00` em `datetime-local` deve ser registada separadamente, sem a corrigir nesta fase.

Com MongoDB de teste ativo, a partir da raiz:

```sh
npm run mongo:test:up --workspace @docampo/api
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.integration.config.ts
npx playwright test --config playwright.auctions.config.ts
npm test --workspace @docampo/api -- tests/unit/producer-applications.spec.ts tests/http/producer-applications.spec.ts tests/integration/producer-applications.spec.ts
npm run typecheck --workspace @docampo/web
npm run typecheck --workspace @docampo/api
npm run lint
npx prettier --check --ignore-path .prettierignore apps packages docs/api docs/design README.md
npm run build --workspace @docampo/web
npm run build --workspace @docampo/api
git diff --check
```

As configurações reais partilham as portas 3011/5183 e correm sequencialmente. `DOCAMPO_ADMIN_APPLICATION_SCREENSHOTS` permite guardar PNGs, snapshots semânticos e árvores AX num diretório externo. As seis larguras verificadas são 320, 430, 768, 1024, 1280 e 1440 px. O relatório de entrega distingue testes reexecutados de resultados históricos, inclui OpenAPI, ligações documentais, pesquisa de segredos e integridade da Fase 0.

### Resultados de validação

Validação local: **542 testes frontend habituais**, **80 integrações reais React/API/MongoDB** e **12 integrações reais de leilões**, totalizando **634 testes frontend distintos aprovados**. Incluem os 574 anteriores e 60 novos: 19 de modelo, 25 de interface e 16 reais. Os testes adicionais do diálogo também verificam Tab/Shift+Tab, Escape e foco enquanto o envio está em curso. As correções finais acrescentam seis casos: quatro de recuperação de paginação, um de contraste durante estados interativos e um de paginação com decisão real. As asserções distinguem leituras canceladas/repetidas pela guarda de sessão do único destino de recuperação, sem alterar a autenticação.

Foram reexecutados os **110 testes backend relevantes** de candidaturas (45 unitários, 26 HTTP, 39 MongoDB). A suite backend completa de 1607 testes não foi repetida nesta fase; os seus ficheiros e o backend permanecem inalterados. TypeScript frontend/API, ESLint, Prettier, builds, OpenAPI, ligações documentais e integridade da Fase 0 foram verificados. O relatório de entrega regista as execuções finais e eventuais repetições sem somar os mesmos casos.

A suite real de leilões passou 12/12 nesta fase. A instabilidade preexistente de `datetime-local` com segundos zero permanece documentada, sem alterações ao respetivo teste. A inspeção adicional usa árvore de acessibilidade, teclado e amostras de contraste; **VoiceOver audível não foi testado**. Capturas e relatórios ficam fora do repositório.

## Preparação da revisão manual isolada

Com MongoDB de teste ativo, iniciar em terminais separados:

```sh
DOCAMPO_ADMIN_APPLICATION_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs
```

```sh
VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183
```

O modo de revisão prepara duas contas administrativas e três candidaturas fictícias nos estados pendente, rejeitado e aprovado. Utiliza os modelos/serviços existentes apenas na base `docampo_test_web_*` e guarda credenciais aleatórias num ficheiro privado temporário (modo 0600); a consola informa apenas o caminho. O servidor remove a base e o ficheiro quando termina. Não é um fluxo público de criação de administradores, não lê `.env` e não é utilizado pelo runtime de produção. O TTL de teste passa a 15 minutos apenas neste modo; os testes automáticos continuam com 60 segundos.

1. Abrir `http://127.0.0.1:5183/entrar` e usar uma conta administrativa fictícia do ficheiro indicado.
2. Na visão geral, abrir **Analisar candidaturas**; verificar os três estados, filtros e detalhe. As restantes métricas/áreas não são apresentadas como integradas.
3. Consultar uma candidatura pendente; testar motivo vazio e confirmação/cancelamento antes de aprovar ou rejeitar.
4. Abrir a mesma candidatura com o segundo administrador num separador/sessão distintos; decidir no primeiro e tentar decidir no segundo para observar o conflito e a consulta atualizada.
5. Se necessário, entrar com a conta compradora fictícia e reapresentar uma rejeição na Fase 7B. Consultar novamente no administrador e expandir o histórico.
6. Terminar ambos os processos após rever. Não deixar este ambiente ativo ao executar suites que usam as mesmas portas.

Não usar contas, contactos ou credenciais reais.

## Limitações

Esta fase trata apenas candidaturas e decisões administrativas. Sem gestão genérica de utilizadores/permissões, suspensão, uploads, emails, monitorização Cloud, notificações em tempo real ou publicação automática de produtos. Não altera regras de aprovação nem permite rever uma decisão terminal. Pesquisa e novos campos exigem contrato backend próprio, fora deste âmbito. A confirmação de sessão e o rascunho continuam temporários em memória. A profundidade de auditoria é a que a API fornece, sem inventar identidades pessoais para os IDs administrativos.

A implementação permanece local, a aguardar revisão visual e autorização explícita para consolidar. A Fase 8 não foi iniciada.
