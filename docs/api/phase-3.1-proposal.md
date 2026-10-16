# Proposta técnica de entrada na Fase 3.1

**Estado histórico: proposta de 2026-10-15, anterior à autorização de execução.**

Em 2026-10-16, o utilizador autorizou a Fase 3.1 com ajustes que prevalecem sobre esta proposta: manter Node 22.21.1/npm 10.9.4 se compatíveis e usar MongoDB 8 com replica set de membro único. A fundação foi implementada localmente nesses termos. Ver [entrega efetiva](foundation-implementation.md); as versões Node 24/npm 11 e a topologia de três membros abaixo não foram adotadas. O texto original da proposta é mantido para rastreabilidade. Preparada em 2026-10-15 após a aprovação explícita de C01/C02/C04/C06. Essas aprovações não autorizam instalações nem implementação. Q01–Q16 e C03/C05 continuam pendentes. Ver o [registo de decisões](decisions.md) e o [plano](implementation-plan.md).

## Âmbito proposto

Fundação técnica de `apps/api`: aplicação Express separada do arranque, configuração validada, ligação/encerramento MongoDB, tratamento de erros e testes. Sem modelos comerciais, autenticação antecipada, integração do frontend ou novos poderes administrativos. Todas as operações privadas, de leitura e escrita, permanecem inacessíveis até à segurança real da semana 4. Não confiar num papel, identificador DEMO ou token fictício enviado pelo browser.

## Versões concretas propostas

Consulta de metadados públicos efetuada em 2026-10-15, sem instalar pacotes. Fixar versões diretas exatas na implementação autorizada e rever o lockfile; não usar `latest` como versão de instalação. Disponibilidade e requisitos declarados não demonstram, por si só, compatibilidade executada: esta será verificada em 3.1.

| Componente       | Versão proposta          | Local / razão                                                                                                                                                                              |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js          | **24.22.0 LTS**, Krypton | Runtime da API e referência dos testes; versão LTS confirmada no índice oficial.                                                                                                           |
| npm              | **11.19.1**              | Versão distribuída com esse Node; utilização futura requer autorização da mudança de ambiente e validação do lockfile.                                                                     |
| Express          | **5.3.0**                | Dependência de execução em `@docampo/api`; suporta Node >=18.                                                                                                                              |
| Mongoose         | **9.11.2**               | Dependência de execução; requer Node >=20.19 e declara compatibilidade com MongoDB 8.x.                                                                                                    |
| Zod              | **4.6.7**                | Nova dependência de execução recomendada, ainda por aprovar; validação de ambiente e, nas fases próprias, pedidos HTTP.                                                                    |
| TypeScript       | **5.9.3**                | Manter a versão já adotada no monorepo; declarar ferramenta do workspace API sem atualizar o frontend para a versão mais recente.                                                          |
| tsx              | **4.23.15**              | Nova ferramenta de desenvolvimento proposta para executar TypeScript com reinício automático; produção usa JavaScript compilado.                                                           |
| Vitest           | **5.0.5**                | Testes backend; requisito Node ^22.12 ou ^24 ou >=26, compatível com o runtime proposto.                                                                                                   |
| Vite             | **8.3.4**                | Dependência de desenvolvimento direta da API para satisfazer o peer de Vitest 5; mesma versão declarada no frontend, sem alterar a configuração web. Não cria um servidor Vite para a API. |
| Supertest        | **7.3.1**                | Testes HTTP da aplicação Express sem iniciar o processo de produção.                                                                                                                       |
| @types/express   | **5.0.6**                | Tipos de desenvolvimento compatíveis com a linha Express 5.                                                                                                                                |
| @types/supertest | **7.2.1**                | Tipos dos testes HTTP.                                                                                                                                                                     |
| @types/node      | **24.19.2**              | Tipos da linha Node 24, limitados ao workspace API; não atualizar os tipos Node da raiz nesta autorização.                                                                                 |
| MongoDB Server   | **8.0.34**               | Patch proposto da linha 8.0 para os ambientes locais isolados; não é escolha de plano/versão provisionada em Atlas.                                                                        |

O ambiente observado tem Node **22.21.1**, npm **10.9.4**, CLI Docker disponível e binário `mongod` **7.0.28**. Não se verificou se o daemon Docker está ativo, se existe replica set configurado ou se há recursos Atlas disponíveis. Não se iniciou qualquer processo ou conexão MongoDB. A existência dos binários não prova que o ambiente proposto esteja pronto.

A passagem para Node 24/npm 11 é proposta, não atualização efetuada. Usar ambiente dedicado à API, por exemplo o contentor descrito abaixo, sem substituir silenciosamente o runtime usado pelo frontend. Revalidar a suite web caso uma futura autorização adote Node 24 também na raiz.

Dependências futuras de JWT/bcrypt pertencem à semana 4; não são necessárias em 3.1. Mongoose inclui os próprios tipos e o driver MongoDB: não acrescentar `@types/mongoose` nem driver direto sem necessidade real. Não propor por omissão dotenv, CORS, Swagger UI, Socket.IO, biblioteca de logs, coverage ou downloads automáticos de MongoDB para esta fundação.

## Validação HTTP recomendada

Recomenda-se **Zod 4.6.7** pela utilização conjunta com TypeScript, validação em execução e conversão de erros para `codigo`, `mensagem` e `campos`. Os schemas HTTP ficam separados dos documentos Mongoose: um pedido válido ainda tem de cumprir permissões e regras de negócio. Usar objetos estritos para rejeitar campos não permitidos e conversões explícitas para parâmetros recebidos como texto.

Alternativas: Ajv privilegia JSON Schema e aproxima a validação de contratos desse formato, mas requer atenção às diferenças entre OpenAPI 3.0 e JSON Schema; express-validator integra-se diretamente nos middlewares Express, mas separa mais a validação das definições TypeScript. Zod é a recomendação técnica, não uma decisão já concedida por C06.

Nesta subfase, validar apenas ambiente e limites técnicos necessários à fundação. Campos comerciais continuam dependentes das Q; não copiar limites ou enums dos mocks. Zod não mantém automaticamente o OpenAPI sincronizado: prever verificações de contrato e evitar uma nova biblioteca de geração nesta entrada.

## Configuração TypeScript e execução

Propor `apps/api/tsconfig.json` independente, com `module` e `moduleResolution` em `NodeNext`, `target`/`lib` em `ES2022`, `strict`, `types: ["node"]`, emissão para `dist` e imports relativos compatíveis com ESM compilado. Não herdar `DOM`, `Bundler`, `allowImportingTsExtensions` ou `noEmit` do frontend. Confirmar a compilação e a execução com Node, não apenas com tsx.

Separar a compilação de produção dos testes: `tsconfig.build.json` inclui apenas `src`; a configuração de verificação inclui `src`, `tests` e `vitest.config.ts`. A configuração Vitest usa ambiente `node`, inclui apenas testes da API e não lê a configuração Vite/Playwright do frontend. Não partilhar DTOs em `packages/shared` antes da decisão C05.

## Scripts propostos, ainda inexistentes

Executar da raiz por `npm run <script> --workspace @docampo/api`, depois de aprovação e implementação. Os comandos seguintes são conteúdo proposto para o manifesto, não comandos executados nesta entrega.

| Script           | Comando proposto                                          | Finalidade                                                                                                                     |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| dev              | `node --env-file=.env --import tsx --watch src/server.ts` | Desenvolvimento com ficheiro local explicitamente criado pelo utilizador; valores já fornecidos pelo ambiente têm precedência. |
| typecheck        | `tsc -p tsconfig.json --noEmit`                           | Verificar código, testes e configuração.                                                                                       |
| build            | `tsc -p tsconfig.build.json`                              | Gerar JavaScript da API em `apps/api/dist`.                                                                                    |
| start            | `node dist/server.js`                                     | Arranque compilado; ambiente injetado externamente, sem carregar ficheiro privado implicitamente.                              |
| test             | `vitest run --config vitest.config.ts`                    | Suite backend completa: unidade, HTTP e integração; ausência do ambiente de integração provoca falha, não omissão silenciosa.  |
| test:unit        | `vitest run --config vitest.config.ts tests/unit`         | Configuração, validação e tratamento de erros sem MongoDB.                                                                     |
| test:http        | `vitest run --config vitest.config.ts tests/http`         | Pipeline Express através de Supertest, com dependências técnicas controladas.                                                  |
| test:integration | `vitest run --config vitest.config.ts tests/integration`  | Persistência/conexão e ensaio transacional técnico em MongoDB real isolado.                                                    |
| test:watch       | `vitest --config vitest.config.ts`                        | Iteração local, mantendo o requisito de ambiente dos testes selecionados.                                                      |

O arranque no contentor de desenvolvimento pode usar o mesmo comando sem `--env-file=.env`, recebendo configuração por injeção. Isso deve ser explícito no Compose/README futuros; não exigir ficheiro privado dentro da imagem. Os diretórios de testes indicados serão criados apenas na implementação autorizada.

Reutilizar ESLint/Prettier existentes sem novas instalações. Propor verificação dirigida por `npm exec -- eslint apps/api` e `npm exec -- prettier --check apps/api`, além dos comandos atuais da raiz para regressão. A inclusão de `docs/api` nas verificações da raiz exige futura autorização; os scripts atuais de formatação não abrangem esta pasta.

## Estratégia de variáveis de ambiente

Propor um único exemplo sem segredos em `apps/api/.env.example`, um ficheiro local ignorado `apps/api/.env` e variáveis injetadas no ambiente nos testes/contentores/publicação. Nenhum destes ficheiros é criado agora. Não ler nem copiar segredos existentes.

| Variável proposta                   | Regra / valor proposto                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| NODE_ENV                            | `development`, `test` ou `production`; valor explícito e validado.                                                                    |
| API_HOST                            | `127.0.0.1` em execução nativa; `0.0.0.0` apenas dentro do contentor com publicação local controlada.                                 |
| API_PORT                            | `3001` no desenvolvimento; inteiro válido, configurável.                                                                              |
| MONGODB_URI                         | Obrigatória para arranque/integração; nunca emitida em logs ou respostas. Exemplo apenas com endereços locais, sem credenciais reais. |
| MONGODB_DB_NAME                     | Nome explícito por ambiente; desenvolvimento separado de testes.                                                                      |
| MONGODB_SERVER_SELECTION_TIMEOUT_MS | Proposta de `5000` ms para falhar de forma controlada quando a ligação não é possível.                                                |
| SHUTDOWN_TIMEOUT_MS                 | Proposta de `10000` ms para encerrar HTTP e conexão antes de terminar o processo.                                                     |

Validar configuração antes de abrir a porta HTTP. Não acrescentar segredos JWT/Blob nem variáveis `VITE_*` de backend nesta subfase. Os valores técnicos acima são propostas a aprovar, não limites comerciais nem política de autenticação.

Nos testes, injetar configuração explicitamente; não carregar `.env` de desenvolvimento. Exigir modo de teste e destino isolado antes de permitir limpeza. Nunca imprimir a URI, mesmo em caso de configuração inválida. Erros públicos seguem os princípios aprovados C02; formato concreto de `requestId`, códigos individuais e política 403/404 de recursos alheios ainda necessitam de confirmação documental.

## MongoDB de desenvolvimento e testes

**Recomendação para aprovação:** replica set MongoDB **8.0.34**, com três membros de dados em contentores Docker, e instâncias separadas para desenvolvimento e testes. A API executa num contentor Node **24.22.0** ligado à mesma rede de cada conjunto, para resolver corretamente os nomes anunciados pelos membros. A topologia não depende de nomes internos Docker resolvidos pelo sistema anfitrião.

- Desenvolvimento: replica set `rs-dcm-dev`, base `docampo_dev`, volumes próprios persistentes e apenas a porta HTTP publicada em `127.0.0.1:3001`. Credenciais, se configuradas, ficam fora dos ficheiros versionados.
- Testes: replica set `rs-dcm-test`, rede/armazenamento efémeros separados e base `docampo_test_<runId>`. Sem portas MongoDB publicadas; o runner tem acesso apenas ao ambiente de teste. Aguardar eleição e disponibilidade real antes de executar a suite.
- Fixar imagens e validar disponibilidade das tags, arquitetura e digest na implementação autorizada, antes de qualquer download. A versão proposta não significa imagem já verificada/executada. Os futuros ficheiros Compose ficam em `apps/api`, sem alterar infraestrutura global nesta entrega.
- A limpeza só atua na base efémera criada pelo próprio ensaio, após verificar modo/destino permitidos; não usar limpeza indiscriminada de bases ou volumes de desenvolvimento.

Um MongoDB standalone não serve para provar transações entre documentos. A documentação oficial distingue standalone de replica set. A topologia de três membros proposta evita tratar a existência do binário local como prova de capacidade transacional. O custo é maior utilização de memória e necessidade de Docker operacional; avaliar recursos antes de aprovar.

**Alternativa:** Atlas para desenvolvimento, com base/utilizador dedicados e testes num ambiente isolado com capacidade transacional. Reduz infraestrutura local de desenvolvimento, mas depende de rede, conta, permissões e condições do plano. Atlas mantém-se a tecnologia Cloud prevista; o ambiente local proposto não altera essa escolha nem aprova região, custos ou plano Q16. O binário local 7.0.28 é uma alternativa a avaliar separadamente, não a versão escolhida silenciosamente para os ensaios.

## Estratégia de testes de integração e transações

Em **3.1**, testar apenas a fundação: configuração inválida não abre HTTP; aplicação/arranque separados; rota inexistente e erro seguro; pedidos sem credenciais e com papéis/IDs demo não ganham acesso privado; ligação válida, ligação indisponível, encerramento e ausência de recursos pendurados. Testes de erro usam dependências injetadas internamente, nunca um endpoint público criado para provocar falhas.

No replica set real de teste, propor ensaio técnico com duas escritas numa coleção temporária: confirmação preserva ambas; exceção antes da confirmação não preserva nenhuma. Verificar a topologia e falhar se não suportar sessões/transações. Não criar User/Product/Order/Auction/Bid comerciais nem adotar D06/D08 com esse ensaio. Estes continuam dependentes de aprovação.

Em **3.2–3.6**, após as decisões correspondentes, acrescentar integridade de modelos, índices, concorrência pelo último stock, falha parcial de encomenda e consistência entre leilão/oferta. Uma simulação não prova atomicidade. Repetições e resultado incerto de confirmação exigem política aprovada, sem prometer rollback por um erro HTTP.

Manter a suite completa de **274 testes Playwright** como referência demonstrativa e executá-la na validação da futura implementação, além de TypeScript/ESLint/Prettier/build web/API e testes backend. Não reduzir testes nem ativar consumo da API pelo frontend em 3.1. Nesta revisão documental, nenhum desses testes de aplicação é declarado novamente executado.

## Ficheiros previstos e critérios de aceitação

Somente após autorização: `apps/api/package.json`, `README.md`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.env.example`, ficheiros Compose de desenvolvimento/teste, `src/app.ts`, `src/server.ts`, `src/shared/{config,database,http}/*` e `tests/{unit,http,integration}/*`. A instalação npm no monorepo altera também `package-lock.json`, pelo que esse efeito deve estar explicitamente autorizado; não atualizar dependências web como efeito lateral.

Aceitação: runtime e scripts confirmados; build compilado executa sem tsx; erros sem segredos; falha de conexão/encerramento controlados; testes técnicos MongoDB reais aprovados; operações privadas inacessíveis; frontend e nove documentos F0 intactos. Nenhuma rota comercial é considerada entregue em 3.1. Uma rota pública de diagnóstico/readiness e o eventual 503 permanecem propostas específicas a aprovar, sem antecipar o painel Q16.

## Aprovações necessárias antes de executar

1. Versões da tabela, adoção de Zod/tsx, Vite como peer de Vitest e tipos Node próprios da API; confirmar manutenção de TypeScript 5.9.3.
2. Scripts, configuração ESM/NodeNext, variáveis/valores técnicos e ficheiros futuros previstos.
3. Ambiente MongoDB recomendado ou alternativa, recursos locais e acesso a uma base de teste realmente isolada.
4. Autorização explícita para iniciar 3.1, instalar as dependências aprovadas, obter imagens/runtime e atualizar o lockfile. Definir também a branch de implementação; esta proposta não cria nem muda branches.

Nenhuma aprovação acima resolve Q01–Q16 ou C03/C05, autoriza Git de publicação ou inicia fases comerciais.

## Fontes técnicas consultadas

- [Node.js 24.22.0 LTS](https://nodejs.org/en/blog/release/v24.22.0) e [índice oficial de versões](https://nodejs.org/dist/index.json).
- Metadados do registo npm: [Express 5.3.0](https://registry.npmjs.org/express/5.3.0), [Mongoose 9.11.2](https://registry.npmjs.org/mongoose/9.11.2), [Vitest 5.0.5](https://registry.npmjs.org/vitest/5.0.5), [Supertest 7.3.1](https://registry.npmjs.org/supertest/7.3.1), [Zod 4.6.7](https://registry.npmjs.org/zod/4.6.7), [tsx 4.23.15](https://registry.npmjs.org/tsx/4.23.15), [Vite 8.3.4](https://registry.npmjs.org/vite/8.3.4) e [TypeScript 5.9.3](https://registry.npmjs.org/typescript/5.9.3).
- Tipos: [Express](https://registry.npmjs.org/@types%2fexpress/5.0.6), [Supertest](https://registry.npmjs.org/@types%2fsupertest/7.2.1), [Node 24](https://registry.npmjs.org/@types%2fnode/24.19.2).
- [Zod](https://zod.dev/), [requisitos e configuração Vitest](https://vitest.dev/guide/) e [compatibilidade Mongoose/MongoDB](https://mongoosejs.com/docs/compatibility.html).
- [MongoDB 8.0.34](https://www.mongodb.com/docs/manual/release-notes/8.0/) e [condições de utilização de transações](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/).
