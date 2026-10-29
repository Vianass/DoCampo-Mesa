# Fase 7B — candidatura de produtores no React

Implementação **local para revisão**, na branch `feat/api-foundation`, a partir de `b7e5fc40dc9868e4fa1c3d5ff16ae08ed5631b31`. Integra exclusivamente o contrato próprio da [Fase 7A](phase-7a-producer-applications.md). Não modifica o backend, os nove documentos da Fase 0, dependências ou o sistema de autenticação. Não inclui interface administrativa ou a Fase 7C.

## Percurso e navegação

A rota autenticada `/area/candidatura-produtor` recebe contas ativas sem exigir antecipadamente o papel produtor. Um visitante é encaminhado para a entrada e regressa à candidatura depois de iniciar sessão. O destino passa pela lista segura de destinos existente; não aceita URLs externas ou caminhos arbitrários.

Na visão geral do comprador há um único ponto de entrada contextual: conhecer, acompanhar ou rever a candidatura. Contas já confirmadas com papel produtor não recebem a chamada para se candidatar. Se o perfil estiver aprovado mas o papel estiver ausente, a consulta é apresentada como aprovação, sem promover uma nova submissão ou atribuir permissões.

Na navegação real do produtor, a opção anterior passa a **Estatuto de produtor**, apontando para o mesmo recurso. O caminho anterior `/area/produtor/candidatura` redireciona para a rota canónica; não cria uma segunda experiência. Os percursos demonstrativos em `/demonstracao` conservam os seus dados, navegação e separação da autenticação real. A candidatura real não é disponibilizada como operação da demonstração.

Há uma ligação de regresso à área pessoal e mantém-se a navegação existente para mercado, cesta e saída. O texto do registo explica que a conta inicial é compradora e que a candidatura está na área pessoal; não acrescenta papéis ao formulário de registo.

## Arquitetura frontend

O módulo `apps/web/src/features/producer-application/` contém:

| Ficheiro                                      | Responsabilidade                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `model.ts`                                    | Tipos próprios, estados, projeção segura das respostas, validação e normalização dos cinco campos       |
| `ApplicationContext.ts` / `useApplication.ts` | Contrato tipado do estado do formulário e acesso ao contexto                                            |
| `ApplicationProvider.tsx`                     | Consulta/submissão autenticadas, pedidos em curso, erros, prevenção de duplicados e rascunho em memória |
| `ApplicationEntry.tsx`                        | Ponto de entrada contextual na visão geral do comprador                                                 |
| `ApplicationForm.tsx`                         | Campos, ajuda, validação acessível e envio/reapresentação                                               |
| `ApplicationDetails.tsx`                      | Dados, datas e estado da tentativa atual ou anterior                                                    |
| `ProducerApplicationPage.tsx`                 | Composição editorial, processo de aprovação, estados e histórico                                        |

O provider é colocado dentro do `AuthProvider` existente, acima das páginas protegidas. Reutiliza `useAuth().request`, sem guardar ou aceder diretamente ao JWT. O estado pertence à identidade/sessão confirmadas, é limpo na saída/troca de conta e não usa `localStorage`, `sessionStorage`, cookies ou URLs.

O rascunho fica apenas em memória e sobrevive à confirmação de sessão por foco/visibilidade. Esta confirmação desmonta temporariamente a área protegida no padrão existente; manter o rascunho no provider evita perder dados escritos. Atualizar a página ou terminar sessão elimina o rascunho. Candidaturas persistidas são novamente lidas no servidor após entrar.

O dispatcher real `AccountArea` reconhece a rota canónica antes dos percursos por papel; o `PrivateLayout` e o controlo de acesso existentes permanecem a proteger a página. O módulo é carregado com `lazy`/`Suspense`, como as áreas reais anteriores. Não cria outra autenticação, outro cliente HTTP ou um conjunto paralelo de campos.

Reutiliza `FormField`, `ProducerTextarea`, `ProducerFormErrors`, `Button`, `Icon`, `LoadingSkeleton` e a formatação de datas. `ProducerTextarea` ganha ajuda opcional e composição de `aria-describedby`, preservando o comportamento dos consumidores anteriores. SCSS próprio utiliza os tokens, tipografia, Bootstrap/SASS e navegação existentes, sem alterar a paleta ou os componentes globais.

## Integração REST e validação

| Operação                            | Uso no frontend                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| GET `/api/me/producer-application`  | Consulta inicial, ponto de entrada, atualização do estado e confirmação após resposta incerta |
| POST `/api/me/producer-application` | Primeira submissão ou reapresentação de uma tentativa rejeitada; espera HTTP 201              |

Não chama endpoints administrativos. O ID da conta, papéis, estado, decisão, datas e histórico não são enviados pelo formulário. Não necessita de `If-Match` ou chave idempotente para estes dois contratos próprios. Utiliza JWT em memória através do cliente autenticado já existente; a API continua a ser a autoridade de acesso.

O corpo contém exatamente `nomePublico`, `localidade`, `concelho`, `descricao`, `telefone`, todos obrigatórios. Normaliza NFC e apara espaços antes de enviar. Limites por caracteres Unicode: 160 no nome, 120 na localidade/concelho/telefone, 5000 na descrição. O telefone continua textual, sem alegação de validação nacional ou contacto verificado. Não acrescenta certificados, imagens, moradas, dados bancários ou campos obrigatórios.

As respostas são validadas e projetadas em objetos próprios. Estados desconhecidos, dados em falta, datas inválidas, decisão incoerente ou histórico não rejeitado não são apresentados como válidos. Campos administrativos ou adicionais não entram no estado da interface. A leitura conserva contactos legados sem aplicar retroativamente os limites do novo formulário.

## Estados e feedback

| Situação confirmada                                  | Experiência                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 404 `CANDIDATURA_NAO_ENCONTRADA`                     | Formulário inicial e explicação do percurso                                          |
| `pendente`                                           | Receção, dados, data e estado; formulário retirado, atualização disponível           |
| `aprovado`                                           | Decisão, dados e acesso à área do produtor apenas com capacidade confirmada          |
| `rejeitado`                                          | Motivo/data, dados anteriores, formulário preenchido para reapresentação e histórico |
| Carregamento                                         | Skeleton próprio; sem formulário ativo antes de conhecer o estado                    |
| Falha de consulta                                    | Mensagem clara e nova consulta, sem assumir ausência de candidatura                  |
| Erros de validação                                   | Resumo focado, campos associados às mensagens e dados mantidos                       |
| Resposta perdida/5xx/resultado inválido/409 no envio | Sem repetir automaticamente; formulário bloqueado até consultar o estado             |

Um 404 genérico de rota não é interpretado como ausência de candidatura: exige o código estável próprio da Fase 7A. 400 pede revisão dos campos; 403 indica recusa de acesso; 413 indica limite e contacto com a administração; 401 utiliza a invalidação da sessão existente. Nunca apresenta mensagens internas recebidas do serviço.

O envio tem guarda síncrona de pedido em curso, botão e campos desativados e confirmação de receção. Duplo clique/Enter não produzem um segundo POST. Depois de uma resposta incerta ou conflito, **Confirmar estado da candidatura** faz apenas GET. Só após uma consulta válida pode existir uma nova ação manual, se o estado a permitir. A interface não promete idempotência que o contrato não oferece.

Uma reapresentação conserva o mesmo perfil e mostra as tentativas anteriores fornecidas pelo backend. O histórico é expansível por teclado e inclui dados, datas e motivos. Não há edição ou eliminação de história no cliente. A confirmação de receção é retirada quando se volta a consultar o estado, para não acompanhar uma decisão posterior com uma mensagem desatualizada.

O formulário tem labels, campos obrigatórios, ajuda e erros associados. O resumo de erros recebe foco. Após submissão confirmada, o título do estado recebe foco; o feedback e as atualizações de estado são anunciados com `role="status"`/`aria-live`. Os estados têm texto além da cor. Mensagens e valores longos quebram dentro dos cartões, sem comprimir campos ou esconder botões.

## Sessão e capacidades

Não há atribuição local de papéis nem leitura de permissões a partir do payload JWT. Ao utilizar **Atualizar estado**, uma resposta aprovada desencadeia o mecanismo `revalidate()` existente, que consulta `/api/auth/me`. A navegação para a área do produtor só aparece como acesso quando a sessão confirmada inclui `produtor`.

Se a candidatura estiver aprovada mas a sessão ainda não incluir esse papel, a ação **Confirmar acesso à área do produtor** revalida a identidade. Se o serviço não devolver a capacidade, a interface não a inventa. Não há ciclo automático de revalidações ou forma de contornar o backend. Falhas 401/403/rede na revalidação seguem o bloqueio já implementado da área privada.

Pedidos de leitura anteriores são cancelados quando substituídos. A sessão existente protege contra respostas de pedidos de uma identidade anterior; o contexto tem ainda guarda por proprietário e cancelamento na troca/saída. JWT, drafts e dados de contacto não são persistidos no browser. Atualizar a página continua a terminar a sessão em memória, como nas fases anteriores.

## Testes e evidência real

Novos ficheiros:

- `apps/web/tests/producer-application-model.spec.ts`: contrato, Unicode, limites, estados, decisão, histórico e projeção de campos privados.
- `apps/web/tests/producer-application.spec.ts`: formulário, autenticação, carregamento, validação/foco, envio único, códigos HTTP, estados, reapresentação, papéis confirmados e limpeza na saída. Duplicados de transporte apenas para falhas determinísticas; não são dados da aplicação real.
- `apps/web/tests/producer-application.real.spec.ts`: React/API/MongoDB reais, primeiro perfil pendente, bloqueio de duplicado, rejeição/reapresentação/aprovação, atualização por `/auth/me`, perda de resposta após commit real, inatividade, fim de sessão e responsividade nos quatro estados.
- `apps/web/tests/support/producer-application-fixtures.ts`: dados exclusivamente fictícios para testes.

O servidor de testes frontend `real-api-server.mjs` liga o serviço já existente da Fase 7A ao `createApp`, preparando os seus índices. Não altera qualquer ficheiro da API. Usa apenas MongoDB local de teste, replica set `rs-dcm-test`, base efémera aleatória `docampo_test_web_*`, JWT aleatório em memória e credenciais fictícias. Os testes criam administradores **apenas como fixtures nessa base**, e usam os endpoints administrativos existentes para representar decisões externas. Não acrescentam administração à aplicação React. Os registos próprios de cada teste são removidos; o servidor elimina a base ao terminar.

São verificadas as larguras 320, 430, 768, 1024, 1280 e 1440 px, com formulário, estados pendente/rejeitado/aprovado, campos e botões. As capturas opcionais ficam no diretório externo indicado por `DOCAMPO_APPLICATION_SCREENSHOTS`, nunca no Git. A inspeção visual cobre telemóvel, tablet e desktop; a regressão completa mantém as áreas demonstrativas e reais anteriores.

Da raiz, com MongoDB de teste ativo:

```sh
npm run mongo:test:up --workspace @docampo/api
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.integration.config.ts
npx playwright test --config playwright.auctions.config.ts
npm test --workspace @docampo/api
npm run typecheck --workspace @docampo/web
npm run typecheck --workspace @docampo/api
npm run lint
npx prettier --check --ignore-path .prettierignore apps/web docs/api/phase-7b-react-producer-applications.md README.md
npm run build --workspace @docampo/web
npm run build --workspace @docampo/api
git diff --check
```

As duas configurações Playwright reais partilham portas e devem correr sequencialmente. Mantêm um worker para isolar fixtures. O relatório de entrega identifica as suites realmente reexecutadas e os seus resultados.

Validação final desta implementação, com suites efetivamente reexecutadas:

| Verificação                                                          | Resultado                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Frontend habitual completo                                           | 494 testes aprovados                                                                              |
| React/API/MongoDB completo                                           | 64 testes aprovados, incluindo 11 novos de candidatura                                            |
| React/API/Socket.IO/MongoDB de leilões                               | 12 testes aprovados na execução final                                                             |
| Total frontend                                                       | 570 aprovados: os 525 anteriores e 45 novos                                                       |
| Novos testes                                                         | 19 de modelo, 15 de interface, 11 de integração real                                              |
| Backend completo, sem alterações                                     | 1607 aprovados: 973 unitários, 172 HTTP, 462 integração                                           |
| TypeScript API/React, ESLint, Prettier, builds API/React, diff check | Aprovados                                                                                         |
| Preservação                                                          | Backend, contratos, dependências, sistema visual documentado e nove documentos da Fase 0 intactos |

Foram produzidas 24 capturas fora do repositório: formulário e três estados persistidos nas seis larguras. A inspeção visual confirmou legibilidade e alinhamento em telemóvel, tablet e desktop, sem overflow horizontal nos percursos testados.

Na primeira execução da suite de leilões, um teste anterior falhou ao preencher `datetime-local` com segundos `00`. A reprodução isolada no Chrome confirmou que esse valor é normalizado retirando os segundos, e o Playwright o recusa com `Malformed value`; valores com segundos não nulos ou sem segundos são aceites. A suite foi repetida sem modificar código ou testes e passou integralmente. Esta instabilidade temporal preexistente fica identificada para uma tarefa própria, sem alteração dos leilões na Fase 7B.

## Revisão manual isolada

Com Docker ativo, iniciar MongoDB de teste e, em dois terminais, arrancar:

```sh
DOCAMPO_APPLICATION_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs
```

```sh
VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183
```

O modo de revisão aumenta apenas o TTL de teste para 15 minutos; o servidor normal de testes conserva 60 segundos. Não lê `.env`, não usa a base de desenvolvimento e não cria administradores ou passwords fixas.

1. Abrir `http://127.0.0.1:5183/registo` e criar uma conta fictícia; iniciar sessão separadamente.
2. Na visão geral do comprador, escolher **Conhecer a candidatura**, ou abrir `/area/candidatura-produtor` na mesma sessão.
3. Verificar validação, preencher os cinco campos e enviar; confirmar estado pendente e ausência do formulário.
4. Para decisões reais, utilizar uma conta administrativa de teste provisionada externamente e os endpoints existentes da Fase 7A; esta fase não inclui ecrã para decidir.
5. Usar **Atualizar estado** para consultar uma decisão; numa rejeição rever e reapresentar. Na aprovação, confirmar acesso à área do produtor sem novo login e conservar o acesso comprador.
6. Terminar os processos com Ctrl+C: o servidor de testes remove a base efémera. Não deixar o ambiente de revisão a correr antes de executar outra suite com as mesmas portas.

As capturas e os testes reais permitem rever os quatro estados sem provisionar uma conta administrativa manual. Não utilizar credenciais ou dados de produção.

## Limitações e preparação para a Fase 7C

- Apenas candidatura própria. Administração, listagens administrativas, aprovação/rejeição no React e outros poderes não foram implementados.
- O estado é consultado ao entrar/regressar à página e pela ação de atualização. Não há polling, evento Socket.IO de candidatura, email ou promessa de atualização contínua.
- Não há uploads, certificados, escolha de papéis, alteração de decisão, configuração comercial ou publicação automática de produtos.
- O rascunho é temporário em memória; perde-se ao atualizar/sair. Os dados confirmados e o histórico são persistidos exclusivamente pelo backend.
- Uma aprovação sem capacidade confirmada não abre a área do produtor. A confirmação depende da disponibilidade de `/auth/me`, sem novos tokens ou refresh tokens.
- Sem chave idempotente de submissão ou alterações ao limite de histórico da Fase 7A. Respostas incertas exigem consulta, nunca repetição automática.
- A futura Fase 7C poderá reutilizar os componentes de leitura e os estados, mantendo as projeções administrativas separadas e as decisões protegidas por ETag. Não importa serviços administrativos para esta interface nem implementa essa fase.

Não foram executados staging, commits, push, merge, rebase ou criação de branches/PR. A implementação aguarda revisão e autorização de consolidação.
