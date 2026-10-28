# Do Campo à Mesa

**Fase 6C — interface React dos leilões em tempo real, implementação local para revisão.** Catálogo público REST, salas autenticadas com JWT em memória, ofertas confirmadas, recuperação de tentativas, relógio sincronizado e gestão dos próprios leilões pelo produtor. Demonstração isolada com dois compradores, API/Socket.IO/MongoDB reais; sem encomendas ou pagamentos automáticos. Ver [arquitetura, revisão visual, testes e limitações](docs/api/phase-6c-react-auctions.md).

**Fase 6B — leilões em tempo real, implementação local.** Socket.IO partilha o servidor HTTP e reutiliza o serviço transacional da Fase 6A. Salas autenticadas recebem versões confirmadas, liderança e encerramento; reconexão relê MongoDB. Presença conta ligações, sem identidades privadas. A interface React fica para 6C. Ver [protocolo, garantias, limitações e demonstração real](docs/api/phase-6b-socketio.md).

**Fase 6A — backend REST de leilões e licitações, implementação local.** Produtores aprovados podem reservar um lote, agendar, consultar, editar antes do início e cancelar antes da primeira oferta. Compradores autenticados licitam com controlo transacional de prazo, incremento, liderança e histórico. Há resumo público e detalhe/histórico autenticados. O encerramento conserva o vencedor e o lote reservado; não cria encomenda nem pagamento. Sem nova interface React ou Socket.IO. Ver [contratos, decisões aprovadas, testes e limitações](docs/api/phase-6a-auctions.md).

**Fase 5F — gestão real de encomendas pelo produtor, implementação local.** A área autenticada permite consultar, filtrar e avançar encomendas próprias até pronta, com concorrência protegida e histórico persistido. O comprador pode atualizar a consulta para ver os novos estados. Os indicadores contam dados reais e separam encomendas concluídas de pagamentos recebidos. Ver [contratos e limites](docs/api/frontend-integration.md).

**Fase 5E — checkout real no React, implementação local.** O percurso Cesta → Checkout → Confirmação utiliza a API e MongoDB, com escolhas de receção/pagamento por produtor e encomendas próprias na área do comprador. Reutiliza o checkout transacional de 4B/5D, mantém o JWT apenas em memória e recupera tentativas com a mesma chave/pedido. Não há pagamentos online. Ver [contrato, recuperação e limitações](docs/api/frontend-integration.md).

**Fase 5C — autenticação JWT no React, implementação local.** Registo comprador, login, identidade confirmada por `/auth/me`, áreas pessoais por capacidades e logout usam a API existente. O catálogo público da Fase 5B permanece integrado. A sessão fica apenas em memória: atualizar a página ou abrir outro separador exige novo login. Não há refresh tokens nem revogação imediata no logout.

Os dashboards fictícios continuam disponíveis exclusivamente em `/demonstracao/entrar`, num espaço visual separado e sem conceder permissões reais. As áreas autenticadas apresentam a identidade da conta e indicam as funcionalidades privadas ainda não integradas; não lhes associam encomendas, avaliações ou indicadores fictícios. A cesta da demonstração tem armazenamento separado da cesta pública.

## Arranque integrado local

Usar as dependências já instaladas e Docker em execução. A configuração privada da API é descrita em [apps/api/README.md](apps/api/README.md); se ainda não existir, preparar `apps/api/.env` a partir do exemplo e gerar um JWT_SECRET aleatório, sem o versionar. Não substituir uma configuração privada existente.

Da raiz, preparar os dados fictícios na **base dedicada** `docampo_dev_catalog`:

```sh
npm run mongo:dev:up --workspace @docampo/api
NODE_ENV=development node --import tsx scripts/seed-catalog.mjs
```

O seed é manual e idempotente: insere apenas registos em falta, não atualiza nem apaga existentes. Recusa produção, Atlas, outro servidor/replica set, credenciais no URI e qualquer base diferente da dedicada. Contas de produtor fictícias recebem passwords aleatórias descartadas; não é criada conta administrativa. Ver [dados e limitações](docs/api/frontend-integration.md).

Em dois terminais:

```sh
MONGODB_DB_NAME=docampo_dev_catalog CORS_ORIGINS=http://127.0.0.1:5173 npm run dev --workspace @docampo/api
```

```sh
npm run dev
```

Abrir `http://127.0.0.1:5173/produtos`. O Vite encaminha `/api` para `http://127.0.0.1:3001`. A variável pública `VITE_API_URL`, documentada em [apps/web/.env.example](apps/web/.env.example), permite outra origem/base. Nunca contém JWT, passwords ou segredos. No build de produção, usar `/api` com reverse proxy ou uma URL HTTPS da API e configurar a origem exata no CORS. Reiniciar Vite/recriar o build depois de alterar a variável. `vite preview` não fornece o proxy de desenvolvimento.

## Rever o checkout numa base isolada

O seed antigo da base de desenvolvimento pode não ter local de levantamento. O seed não atualiza dados existentes e a aplicação não inventa esse local. Para revisão completa, usar uma base temporária independente, sem alterar `docampo_dev_catalog`.

Com Docker ativo, iniciar MongoDB de teste e, em dois terminais, executar:

```sh
npm run mongo:test:up --workspace @docampo/api
DOCAMPO_CHECKOUT_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs
```

```sh
VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183
```

Abrir `http://127.0.0.1:5183`. O modo de revisão insere o catálogo fictício numa base aleatória `docampo_test_web_*` e configura locais de levantamento explicitamente fictícios nessa base. Conserva a disponibilidade declarada de sábado, 09:00–12:00, e pagamento em dinheiro. Não cria credenciais administrativas ou contas de comprador fixas; a sessão de revisão dura 15 minutos. O servidor de testes normal mantém o TTL de 60 segundos para os ensaios de expiração.

1. Criar uma conta **fictícia** em `/registo`, confirmar o aviso genérico e iniciar sessão em `/entrar`.
2. Adicionar produtos, eventualmente de produtores diferentes, à cesta e seguir **Continuar para checkout**. Um visitante pode entrar sem perder a cesta.
3. Rever quantidades, preços, total previsto e condições. Selecionar data, janela e pagamento para cada produtor; aceitar as condições e confirmar.
4. Verificar a referência global, encomendas, valores persistidos, receção e pagamento por pagar. Seguir **Consultar as minhas encomendas** para listagem, ordenação, paginação e detalhe/histórico.
5. Se houver resultado incerto, usar **Recuperar resultado da compra**. Após reload, iniciar sessão na mesma conta e recuperar: a chave e o pedido originais vêm do servidor. Não iniciar outra tentativa enquanto o resultado for desconhecido.

A referência local não contém JWT, password, morada ou contacto. O pedido privado temporário tem prazo técnico de 24 horas; a sua expiração não elimina encomendas nem prova falha da compra. As alterações posteriores da cesta são preservadas. As demonstrações em `/demonstracao` não permitem comprar.

**Ctrl+C no servidor da revisão elimina apenas a sua base temporária**, incluindo as contas e compras fictícias dessa execução. A base de desenvolvimento permanece intacta. Entrega, taxas, métodos alternativos, falhas e concorrência são cobertos pelos testes com configurações fictícias próprias; não são inventados na configuração de levantamento do catálogo de revisão.

## Rever a gestão de encomendas do produtor

Num ambiente isolado, com Docker e dependências já disponíveis:

```sh
npm run mongo:test:up --workspace @docampo/api
DOCAMPO_PRODUCER_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs
```

Noutro terminal:

```sh
VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183
```

O servidor cria a sua própria base aleatória `docampo_test_web_*`, dois produtores fictícios, um comprador e uma compra transacional com duas encomendas. Não altera contas ou dados de desenvolvimento. As credenciais aleatórias ficam num **ficheiro temporário privado**, com permissões `0600`, cujo caminho é indicado no terminal; não são impressas nos logs nem guardadas no repositório. O registo público continua exclusivamente comprador, sem seleção de papéis privilegiados. A sessão de revisão dura 15 minutos.

1. Abrir `http://127.0.0.1:5183/entrar`, usar uma das contas produtoras desse ficheiro e consultar `/area/produtor`. Os indicadores iniciais mostram as encomendas efetivamente persistidas; o valor concluído é zero enquanto não houver conclusão.
2. Abrir **As minhas encomendas**, testar estado, ordenação e detalhe. Avançar **Confirmar encomenda → Iniciar preparação → Marcar como pronta**. Cada ação mostra a confirmação e acrescenta um evento ao histórico.
3. Abrir outro separador com a segunda conta produtora: a encomenda da primeira conta não fica disponível. Um segundo separador da mesma conta com um detalhe antigo recebe conflito, exigindo **Atualizar consulta**.
4. Entrar com o comprador noutro separador, consultar as duas encomendas e usar **Atualizar consulta** para ver os estados atualizados. Não há atualização em tempo real.
5. Verificar 320, 430, 768, 1024, 1280 e 1440 px e navegar pelos filtros e ações com teclado. Recarregar exige novo login, preservando a política JWT em memória.

**Ctrl+C no servidor remove apenas a sua base e o ficheiro temporário de credenciais.** Não há botão de conclusão direta, cancelamento ou alteração de pagamento. A autorização e propriedade são verificadas na API; este modo é apenas uma preparação de dados de teste, fora do runtime de produção.

## Rever a autenticação

1. Preparar API e React conforme o arranque acima e abrir `/registo`. O registo público recebe apenas nome, email e password (15–128 caracteres; sem composição artificial) e cria exclusivamente uma conta compradora. A confirmação 202 é genérica, inclusive para emails duplicados, e não inicia sessão.
2. Em `/entrar`, usar as credenciais da conta fictícia criada localmente. O React confirma `/auth/me` antes de apresentar a identidade em `/area`. Os papéis vêm da API; não existe seletor de produtor ou administrador no registo real.
3. Percorrer a área pessoal, voltar ao catálogo e à cesta. A secção de encomendas do comprador usa dados reais; a restante atividade privada ainda não integrada está explicitamente indisponível. A prévia visual dos três dashboards abre num separador separado em `/demonstracao/entrar`, sem partilhar a sessão real.
4. Atualizar uma página privada exige novo login, mantendo a cesta. Terminar sessão descarta o token no cliente e chama `/auth/logout`; não revoga imediatamente tokens emitidos. Expiração/401 limpam a sessão; 403 e falhas temporárias bloqueiam a apresentação privada e permitem nova confirmação.

JWT e passwords não são guardados em localStorage, sessionStorage, cookies ou variáveis Vite. Memória reduz a persistência de um token roubado, mas não elimina o risco de XSS no separador ativo. Não existe sincronização ou renovação de sessões entre separadores. Ver [segurança](docs/api/security.md) e [integração](docs/api/frontend-integration.md).

## Testar a integração

```sh
npm run test:e2e -- --workers=4
npm run mongo:test:up --workspace @docampo/api
npx playwright test --config playwright.integration.config.ts
npm test --workspace @docampo/api
npm run typecheck
npm run typecheck --workspace @docampo/api
npm run lint
npm run build
npm run build --workspace @docampo/api
```

A suite habitual mantém os percursos anteriores com fixtures HTTP (os dashboards fictícios são testados no espaço `/demonstracao`); a suite separada inicia a API real na porta 3011 e React na 5183, popula duas vezes uma base aleatória `docampo_test_web_*` no replica set de teste 27019, verifica idempotência e elimina apenas essa base no final. Não lê `.env`, não usa a base de desenvolvimento e falha se MongoDB não estiver disponível. Executar as suites sequencialmente para conservar os respetivos artefactos em `test-results/`.

A revisão visual pode começar em `/produtos`, seguindo um cartão para o detalhe, a ligação de origem para o perfil e a cesta. Pesquisa, filtros, seis ordenações e paginação são executados no servidor. A cesta respeita g/ml/unidades/embalagens e mínimo/incremento; guarda apenas escolhas locais, sem reservar stock ou criar encomendas. Falhas da API não substituem dados por mocks nem apagam as escolhas guardadas.

Os perfis públicos apresentam apenas informação efetivamente devolvida: não se associam avaliações fictícias, coordenadas, histórias ou certificações aos IDs reais. As ligações provenientes de registos privados demonstrativos abrem as listagens públicas; não existe correspondência automática entre slugs demo e IDs MongoDB. As secções seguintes documentam o protótipo anterior e não substituem este estado atual.

---

## Registo histórico do frontend demonstrativo

Mercado digital de produtores agrícolas locais, com encomendas e leilões em tempo real.

**Estado atual: Fase 2.4.4 — Área Privada do Administrador.** O frontend inclui o mercado público, carrinho, autenticação demonstrativa e áreas de comprador, produtor e administrador com atividade fictícia. Edições privadas, decisões de candidatura e moderação funcionam apenas em memória. O monorepo usa npm workspaces. Os nove documentos da Fase 0 estão preservados integralmente.

Os dados existem apenas no frontend. Não estão implementados autenticação real, endpoints, MongoDB, compras, licitações reais ou recursos Cloud. A Fase 2.4.3 foi aprovada e publicada em `feat/producer-dashboard`, no commit `ebf6109`. A implementação da Fase 2.4.4 permanece local em `feat/admin-dashboard`, criada a partir desse commit, sem staging, commits, push, merge ou PR. A publicação e as fases seguintes dependem de nova autorização explícita.

## Contexto académico

Projeto individual da unidade curricular **Desenvolvimento Web e para a Cloud**, do **Mestrado em Engenharia Informática**, IPVC — Escola Superior de Tecnologia e Gestão, 1.º semestre de 2026/2027.

O enunciado prevê sete semanas de desenvolvimento, três marcos de entrega e uma defesa individual. A documentação distingue requisitos obrigatórios do enunciado, componentes de valorização opcionais, melhorias propostas e decisões arquiteturais. As referências usam as páginas do ficheiro `Do_Campo_a_Mesa_Enunciado.pdf`; o PDF original não está incluído neste repositório.

## Descrição e objetivos

A plataforma prevista liga pequenos produtores agrícolas a consumidores e à restauração local. Os produtores poderão apresentar produtos e gerir encomendas; os compradores poderão explorar o catálogo, encomendar, avaliar e licitar em lotes sazonais ou excedentes.

Os principais objetivos planeados são:

- Disponibilizar catálogo pesquisável, filtros e perfis públicos de produtores com mapa.
- Implementar registo, autenticação e autorização para comprador, produtor e administrador, além do acesso público de visitante.
- Gerir aprovação de produtores, carrinho, encomendas, avaliações e moderação.
- Validar licitações concorrentes no servidor e manter um histórico consistente dos leilões.
- Apresentar notificações de encomendas e painéis de produtor e administrador.
- Construir uma interface responsiva segundo a abordagem Mobile First.
- Documentar a API e publicar frontend, backend, dados e imagens em serviços Cloud.

Estes objetivos descrevem o âmbito completo a desenvolver. Nesta fase existem apenas os componentes, os layouts e os percursos demonstrativos descritos abaixo. As regras de negócio em aberto estão registadas no [documento de decisões](docs/architecture/decisions.md).

## Tecnologias e estado

| Área                      | Tecnologias selecionadas                                                  | Estado                                                 |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Frontend                  | React 19, TypeScript 5.9, Vite 8, React Router 7, Bootstrap 5 e SASS/SCSS | Implementado com dados fictícios                       |
| Tipografia                | DM Serif Display e DM Sans, via Fontsource                                | Fontes alojadas pelo build, licença OFL                |
| Qualidade                 | ESLint, Prettier e TypeScript strict                                      | Configurados                                           |
| Testes                    | Playwright                                                                | Percursos e responsividade do protótipo; Chrome        |
| Backend                   | Node.js, Express, TypeScript e Mongoose                                   | Workspace vazio; bibliotecas de backend não instaladas |
| Base de dados             | MongoDB Atlas                                                             | Planeada; sem ligação                                  |
| Autenticação e tempo real | JWT, bcrypt e Socket.IO                                                   | Planeados; não implementados                           |
| Documentação da API       | OpenAPI 3 e Swagger UI                                                    | Planeados                                              |
| Cloud                     | App Service, Static Web Apps e Blob Storage                               | Planeados; não configurados                            |
| Testes futuros            | Vitest e Supertest                                                        | Planeados; não instalados nesta fase                   |

As versões exatas estão fixadas em `package-lock.json`; consultar `npm ls --depth=0`. O React Router 7 mantém compatibilidade com o Node.js instalado, sem exigir atualização do sistema. O desenvolvimento foi configurado para Node.js 22.13+ na série 22, ou 24+, e npm 10 ou superior.

## Arquitetura prevista

O projeto seguirá um **monorepo com monólito modular e API REST**. A SPA React será publicada em Azure Static Web Apps; um único backend Node.js em Azure App Service reunirá Express, Socket.IO e o agendador interno de leilões. MongoDB Atlas armazenará os dados, e Azure Blob Storage armazenará as imagens.

A autorização será aplicada no servidor por papel e propriedade dos recursos. O modelo propõe snapshots das linhas de encomenda e transações para manter coerência de stock e de estado/histórico dos leilões. A recuperação de ligações usará o estado persistido, versões e sequências. Estas soluções são propostas documentadas, sujeitas às decisões de negócio ainda em aberto.

Consultar a [visão global](docs/architecture/system-overview.md), os [diagramas Mermaid](docs/architecture/architecture-diagram.md) e a [consistência dos leilões](docs/architecture/auction-consistency.md).

## Estrutura atual do repositório

```text
.
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.base.json
├── eslint.config.js
├── .prettierrc.json
├── .prettierignore
├── playwright.config.ts
├── apps/
│   ├── web/
│   │   ├── public/          # Favicon, fotografias WebP e créditos
│   │   ├── src/
│   │   │   ├── components/ # Componentes tipados e marca
│   │   │   ├── layouts/    # Layout público, layout privado e navegação
│   │   │   ├── pages/      # Mercado, auth/ e private/ demonstrativos
│   │   │   ├── data/       # Produtos, produtores e leilão fictícios
│   │   │   ├── features/   # Catálogo, mercado, cart/, auth/, private-area/, buyer/, producer/ e admin/
│   │   │   ├── types/      # Modelo tipado de produto e dados de apresentação
│   │   │   └── styles/     # Tokens, mixins e parciais SCSS
│   │   ├── tests/          # Testes de browser Playwright
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   └── api/                # Apenas package.json, README e src reservado
├── packages/
│   └── shared/             # Estrutura inicial; sem exports ou dependências
└── docs/
    ├── requirements/
    │   ├── functional-requirements.md
    │   ├── non-functional-requirements.md
    │   └── use-cases.md
    ├── architecture/
    │   ├── system-overview.md
    │   ├── architecture-diagram.md
    │   ├── auction-consistency.md
    │   └── decisions.md
    ├── database/
    │   └── data-model.md
    ├── design/
    │   └── design-system.md
    └── planning/
        └── implementation-plan.md
```

`apps/api` não contém servidor ou endpoints. `packages/shared` reserva espaço para contratos realmente necessários; não define contratos finais a partir dos mocks. O nome deste workspace segue o pedido da Fase 1, sem alterar a proposta histórica da Fase 0.

## Documentação da Fase 0

| Documento                                                                     | Conteúdo                                                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Requisitos funcionais](docs/requirements/functional-requirements.md)         | Requisitos por módulo, intervenientes, prioridades, critérios de aceitação e referências ao enunciado |
| [Requisitos não funcionais](docs/requirements/non-functional-requirements.md) | Segurança, responsividade, qualidade, consistência, Cloud e obrigações académicas                     |
| [Casos de utilização](docs/requirements/use-cases.md)                         | Atores, pré-condições, fluxos, alternativas, pós-condições e autorização                              |
| [Visão global do sistema](docs/architecture/system-overview.md)               | Componentes, responsabilidades, dados, comunicação e serviços Cloud                                   |
| [Diagramas de arquitetura](docs/architecture/architecture-diagram.md)         | Contexto, contentores e componentes em Mermaid                                                        |
| [Consistência dos leilões](docs/architecture/auction-consistency.md)          | Concorrência, atomicidade, histórico, expiração, salas e reconexão                                    |
| [Decisões e questões em aberto](docs/architecture/decisions.md)               | Fundamentação das escolhas, alternativas, recomendações e riscos                                      |
| [Modelo de dados](docs/database/data-model.md)                                | Coleções, validação, referências, documentos embebidos, índices e relações                            |
| [Plano de implementação](docs/planning/implementation-plan.md)                | Sete semanas, dependências, entregáveis, testes e marcos Git                                          |

O [sistema visual](docs/design/design-system.md) documenta paleta, tipografia, componentes, comportamento responsivo e decisões de acessibilidade até à Fase 2.4.4, incluindo a rastreabilidade dos percursos demonstrativos aos requisitos da Fase 0. Os [créditos das fotografias](apps/web/public/images/credits.md) registam autores, fontes e licença. As fotografias são ilustrativas e não comprovam a origem dos produtores fictícios.

## Implementação disponível

- Homepage editorial com seleção sazonal, destaque ilustrativo de leilão, produtores, explicação do mercado, prévia do catálogo e chamada para produtores.
- Componentes `Button`, `Container`, `SectionHeading`, `ProductCard`, `ProducerCard`, `AuctionCard`, `CategoryPill`, `StatusBadge`, `PriceDisplay`, `EmptyState`, `LoadingSkeleton` e `FormField`.
- Header, navegação desktop e móvel, layout público e footer; foco visível, ligação de salto e suporte a movimento reduzido.
- Catálogo de 36 produtos e sete produtores fictícios, com pesquisa imediata por nome, descrição e produtor, sem distinção de acentos/maiúsculas.
- Filtros combináveis por categoria, produtor, localidade, época, biológico e preço máximo; indicadores ativos e remoção individual/global.
- Ordenação por relevância, preço, nome e data; paginação de 12/24/36 produtos e recuperação da seleção ao voltar/avançar ou recarregar o browser.
- Filtros desktop e painel modal móvel acessível; cartões com localização, preço/unidade, stock e etiqueta biológica; estado vazio e skeleton durante o carregamento real do módulo da página.
- Detalhes editoriais com breadcrumbs, galeria acessível, disponibilidade, época, descrição, ligação ao produtor e recomendações determinísticas.
- Perfis públicos com história, métodos de produção, categorias, produtos, avaliações fictícias e média derivada; diretório com sete produtores.
- Localização ilustrativa sem coordenadas inventadas, alternativa textual e ligação externa à localidade no OpenStreetMap; ausência de contactos públicos explícita.
- Componentes `Breadcrumbs`, `ProductGallery`, `MarketImage`, `ProducerMap` e `ReviewCard`; loading real dos módulos e recuperação específica de IDs inválidos.
- Carrinho em React Context com adição desde cartões e detalhe, quantidades inteiras, remoção, agrupamento por produtor, subtotais/total em cêntimos e badge no header.
- Persistência local versionada, recuperação de dados inválidos/antigos, reconciliação de preço/stock e funcionamento em memória quando o armazenamento falha.
- Formulários demonstrativos de entrada, registo comprador/produtor e recuperação, com validação reutilizável, visibilidade da palavra-passe, feedback e indicação de indisponibilidade real.
- Sessão de demonstração apenas em memória, escolha explícita de papel, navegação tipada e layout privado editorial com experiências próprias por papel, sem operações reais de negócio.
- Dashboard do comprador com indicadores derivados de seis encomendas, duas avaliações iniciais e quatro participações fictícias; encomenda recente, resumo do carrinho e descoberta editorial.
- Encomendas filtráveis pelos quatro estados e ordenáveis por data, detalhe com preços históricos, grupos por produtor, totais em cêntimos e histórico ilustrativo.
- Avaliações a produtores e formulário local apenas para entregas elegíveis; participações com situações derivadas e detalhe de lote só de leitura, sem tempo real.
- Fonte local assíncrona, carregamento real dos módulos, recuperação de erros/IDs inválidos e cenários de apresentação exploráveis em «Sobre estes dados».
- Área do produtor com indicadores derivados, candidatura pendente fictícia, catálogo próprio pesquisável/filtrável, criação/edição local de produtos, preços, quantidades e limiares de stock.
- Edição privada do nome público, localidade e descrição, com pré-visualização separada do perfil público; encomendas recebidas e leilões apenas de consulta, com detalhes e históricos.
- Tokens SCSS e Bootstrap personalizado, com breakpoints de 768, 1024 e 1280 px.

| Rota                             | Conteúdo                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/`                              | Homepage                                                                                                 |
| `/produtos`                      | Catálogo interativo com pesquisa, filtros, ordenação e paginação                                         |
| `/produtos/:id`                  | Detalhe editorial com galeria e produtos relacionados                                                    |
| `/produtores`                    | Diretório editorial dos sete produtores fictícios                                                        |
| `/produtores/:id`                | História, produção, produtos, localização e avaliações                                                   |
| `/carrinho`                      | Cesta com quantidades, várias origens e totais demonstrativos                                            |
| `/leiloes`                       | Proposta visual dos leilões                                                                              |
| `/leiloes/cabaz-outono`          | Detalhe do lote fictício; licitação indisponível                                                         |
| `/como-funciona`                 | Conceito do mercado e âmbito demonstrativo                                                               |
| `/entrar`                        | Formulário de acesso indisponível e escolha separada de papel demonstrativo                              |
| `/registo`                       | Prévia do registo comprador; `?perfil=produtor` apresenta candidatura                                    |
| `/recuperar-palavra-passe`       | Interface informativa, sem email ou reposição real                                                       |
| `/area`                          | Encaminhamento para o papel demonstrativo atual                                                          |
| `/area/comprador`                | Dashboard demonstrativo, atividade recente e resumo da cesta                                             |
| `/area/comprador/encomendas`     | Listagem, filtros de estado e ordenação por data                                                         |
| `/area/comprador/encomendas/:id` | Detalhe, snapshots e histórico de encomenda fictícia                                                     |
| `/area/comprador/avaliacoes`     | Avaliações a produtores e criação exclusivamente local                                                   |
| `/area/comprador/licitacoes`     | Participações demonstrativas, sem envio de ofertas                                                       |
| `/area/comprador/licitacoes/:id` | Detalhe privado do lote ilustrativo, apenas leitura                                                      |
| `/area/produtor`                 | Dashboard demonstrativo com produção, encomendas e alertas de stock                                      |
| `/area/produtor/candidatura`     | Dados necessários, etapas e exemplo de candidatura pendente                                              |
| `/area/produtor/produtos`        | Catálogo privado, pesquisa e filtros                                                                     |
| `/area/produtor/produtos/novo`   | Criação de produto apenas em memória                                                                     |
| `/area/produtor/produtos/:id`    | Consulta privada do produto; `/:id/editar` permite edição local                                          |
| `/area/produtor/perfil`          | Edição privada; `/pre-visualizacao` apresenta o perfil local                                             |
| `/area/produtor/encomendas`      | Encomendas próprias filtráveis; `/:id` mostra detalhe e histórico                                        |
| `/area/produtor/leiloes`         | Leilões próprios estáticos; `/:id` mostra o lote e o resultado                                           |
| `/area/produtor/indicadores`     | Stock disponível, alertas e agregados de encomendas                                                      |
| `/area/administrador`            | Indicadores, candidaturas, produtores, utilizadores, encomendas, leilões, moderação e serviços simulados |
| `/sistema-visual`                | Galeria dos componentes e da paleta                                                                      |

Rotas e IDs inexistentes apresentam uma página de recuperação. Preços, disponibilidade e tempos de leilão são fictícios. O carrinho é local e demonstrativo. As encomendas da área do comprador são exemplos, sem operações comerciais ou ligação a API. As regras comerciais definitivas continuam pendentes de validação.

Os filtros do catálogo usam `pesquisa`, `categoria`, `produtor`, `localidade`, `epoca`, `bio`, `precoMax`, `ordem`, `pagina` e `porPagina` no URL. `precoMax` é expresso em euros; o modelo usa inteiros `priceCents`, conforme a decisão monetária proposta na Fase 0. A pesquisa e o slider atualizam o URL com substituição da entrada atual para não criar uma entrada de histórico por tecla/movimento; seleções e paginação criam entradas navegáveis.

As opções são derivadas dos mocks e não fixam taxonomias finais da API. As fotografias de catálogo têm [créditos próprios](apps/web/public/images/catalog/credits.md) e as duas fotografias distintas de galeria têm [créditos de detalhe](apps/web/public/images/details/credits.md); alguns alimentos usam um placeholder identificado, sem fotografia de outro alimento atribuída indevidamente.

## Fases de desenvolvimento

**Fase 0, concluída:** documentação e configuração inicial de Git.

**Fase 1, concluída:** npm workspaces, configuração do frontend, sistema visual e homepage/páginas demonstrativas.

**Fase 2.1, concluída:** catálogo interativo com dados fictícios, validado e publicado na feature branch através de cinco commits autorizados. Não foi efetuado merge para `main`.

**Fase 2.2, concluída:** detalhes de produtos e perfis de produtores, validados e publicados em cinco commits autorizados na feature branch.

**Fase 2.3, concluída:** carrinho demonstrativo com várias origens, Context e persistência local, sem checkout; validado e publicado em cinco commits autorizados na feature branch.

**Fase 2.4.1, concluída:** formulários, sessão demonstrativa, navegação e estrutura privada por papel; publicada em quatro commits autorizados em `feat/project-setup-design-system`.

**Fase 2.4.2, concluída:** área do comprador com dados fictícios e integração da cesta, publicada em quatro commits autorizados em `feat/buyer-dashboard`, sem merge para `main`.

**Fase 2.4.3, concluída:** área do produtor, aprovada e publicada em quatro commits autorizados em `feat/producer-dashboard`, até `ebf6109`, sem merge para `main`.

**Fase 2.4.4, atual:** área do administrador, implementada localmente em `feat/admin-dashboard`. A criação da branch foi autorizada; sem staging, commits, push, merge ou PR. Não se iniciou a fase seguinte. O protótipo não constitui conclusão dos marcos M1–M3 do projeto completo.

O desenvolvimento restante, sujeito a aprovação da fase seguinte, mantém o calendário do enunciado:

| Semana | Trabalho previsto                                                      | Marco            |
| ------ | ---------------------------------------------------------------------- | ---------------- |
| 1      | Protótipos e frontend responsivo                                       | Início da Fase 1 |
| 2      | SPA com componentes, estado, routing e dados simulados; esboço OpenAPI | M1               |
| 3      | API REST e modelo MongoDB                                              | —                |
| 4      | OpenAPI/Swagger, autenticação, segurança e integração com a SPA        | M2               |
| 5      | Leilões e notificações em tempo real                                   | —                |
| 6      | Publicação na Cloud e armazenamento de imagens                         | —                |
| 7      | Testes finais, relatório e vídeo                                       | M3               |

O backoffice Laravel e a análise de elasticidade/custos são componentes opcionais de valorização. Só serão considerados depois de todos os requisitos obrigatórios estarem completos e funcionais. Não há datas de submissão ou defesa definidas neste README.

## Instalação e execução

Pré-requisitos: Node.js 22.13+ na série 22, ou 24+, e npm ≥10. A instalação é feita na raiz do monorepo. O protótipo não precisa de ficheiros `.env`, conta Azure ou MongoDB. O ambiente verificado usa Node.js 22.21.1 e npm 10.9.4.

```bash
git clone https://github.com/Vianass/DoCampo-Mesa.git
cd DoCampo-Mesa
git switch feat/buyer-dashboard
npm ci
npm run dev
```

Abrir `http://127.0.0.1:5173/`. O servidor usa apenas loopback; não é publicado na Cloud. Parar com `Ctrl+C`.

Os comandos de instalação acima recuperam a versão publicada. A Fase 2.4.4 está apenas no diretório local em `feat/admin-dashboard`. Para a rever, executar `npm run dev`, abrir `/entrar` e escolher «Explorar como administrador», sem credenciais. As instruções de revisão de cada secção estão abaixo. Comprador e produtor continuam disponíveis nas respetivas opções de demonstração. Recarregar termina a sessão; a cesta conserva a persistência existente.

```bash
npm run typecheck    # Validação TypeScript strict
npm run lint         # ESLint
npm run format:check # Formatação, excluindo documentos históricos da Fase 0
npm run build        # Produção em apps/web/dist
npm run preview      # Prévia do build em http://127.0.0.1:4173/
npm run test:e2e     # Browser e layouts demonstrativos
```

Os testes Playwright usam Google Chrome instalado e podem arrancar o Vite automaticamente. Em ambientes sem Chrome, pode instalar-se o Chromium de Playwright e selecionar esse canal:

```bash
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
```

`npm run format` formata apenas a implementação, o README e a documentação de design; não modifica os nove documentos originais. Credenciais, tokens e `.env` privados não devem ser versionados. Um futuro `.env.example` deverá conter apenas valores ilustrativos sem segredos.

## Carrinho demonstrativo

`CartProvider`, `CartContext` e `useCart` partilham a cesta entre navegação, cartões, detalhes e `/carrinho`. O reducer e as funções de cálculo ficam fora da apresentação. As ações públicas são `addItem`, `removeItem`, `updateQuantity` e `clearCart`; a informação derivada inclui quantidade total, grupos por produtor, subtotal e total em cêntimos.

O schema `docampo.cart.v1` guarda versão, IDs, quantidade, `unitPriceSnapshotCents`, unidade e `updatedAt`, sem catálogo completo, nomes, imagens ou dados pessoais. Ao restaurar, cada linha é revista contra os mocks atuais; preços/unidades/origens são atualizados, stock excessivo é reduzido e produtos removidos/esgotados são descartados, sempre com aviso. O storage normalizado é guardado novamente. Se o browser recusar o armazenamento, as operações continuam em memória.

Quantidades representam unidades comerciais inteiras. No campo de edição, Enter ou saída do campo confirma valores válidos; valores inválidos permanecem com erro, sem alterar a cesta. Introduzir explicitamente zero retira a linha; diminuir está desativado em 1. Uma adição que ultrapasse o stock é recusada. O carrinho não reserva nem decrementa stock. Total = soma dos subtotais, sem portes, taxas ou descontos fictícios.

Esta demonstração aceita vários produtores por pedido da Fase 2.3; a futura divisão de encomendas continua dependente de Q02. Quantidades fracionárias (Q03), checkout, confirmação de preços (Q06) e stock autoritativo (D08) serão resolvidos na integração com a API. A persistência não sincroniza separadores ou dispositivos. Consultar [pressupostos e arquitetura do carrinho](docs/design/design-system.md#fase-23--pressupostos-do-carrinho-antes-da-implementação).

## Entrada e área privada demonstrativas

Os papéis seguem `users.papel` da Fase 0: **comprador, produtor e administrador**; visitante é ausência de sessão. O registo só apresenta comprador/produtor. Nome e email seguem `users`; a candidatura acrescenta nome público e localidade de `producers`, com informação sobre decisão administrativa. Não existe registo administrativo, aprovação automática, candidatura efetivamente submetida ou mecanismo legal de aceitação inventado.

`AuthProvider`, `AuthContext` e `useAuth` isolam a sessão `{ kind: 'visitor' } | { kind: 'demonstration', role }`. Só os botões de demonstração iniciam esta sessão; os formulários nunca autenticam nem criam contas. Não há JWT, hash, API, identidade pessoal no Context ou persistência de sessão/credenciais. Sair ou recarregar repõe o visitante. O `CartProvider` continua montado e independente.

A validação partilhada verifica presença, formato de email e confirmação; no registo usa provisoriamente oito caracteres sem regras de composição. O login exige apenas uma palavra-passe não vazia. O estado «A verificar» corresponde à verificação local, sem rede ou atraso artificial. Após submissão válida, campos de palavra-passe ficam vazios e surge a indisponibilidade da operação. Usa apenas dados fictícios. A recuperação é uma interface solicitada nesta fase, não uma obrigação adicional do enunciado; nunca envia email.

`DemoRoute` orienta a navegação: sem sessão, `/entrar?destino=...`; com papel incompatível, mensagem e recuperação sem trocar o papel; percursos desconhecidos, estado de página não encontrada. Só destinos internos conhecidos do papel podem ser retomados. `PrivateLayout` oferece identidade, papel visível, navegação desktop/móvel, saída e ligação ao mercado. Comprador, produtor e administrador têm experiências demonstrativas próprias, isoladas entre si.

Esta guarda do frontend **não é uma fronteira de segurança**. Na integração futura, a API REST validará credenciais, hashes e expiração e imporá papel/propriedade/aprovação atuais no servidor. Q01 (papéis), Q04 (produtores pendentes) e Q13 (sessão) continuam por validar para contas reais; esta demonstração não fecha essas decisões. A [análise e rastreabilidade da Fase 2.4.1](docs/design/design-system.md#fase-241--análise-e-pressupostos-antes-da-implementação) distingue interfaces presentes e operações futuras.

## Área do comprador demonstrativa

O dashboard deriva os indicadores de seis encomendas, duas avaliações e quatro participações fictícias: três encomendas em curso e duas participações em leilões ativos. Mostra a encomenda mais recente, participações relevantes, descoberta de produtos e o resumo da cesta real deste browser através de `useCart`, sem duplicar o seu estado.

As encomendas permitem filtrar os estados `pendente`, `confirmada`, `pronta`, `entregue` e ordenar por data; `estado` e `ordem` ficam no URL. O detalhe agrupa linhas por produtor, apresenta quantidades, preços históricos em cêntimos, subtotais, total e histórico ilustrativo. Cada exemplo tem um produtor, mantendo Q02 em aberto. Não permite criar, pagar, cancelar ou mudar o estado. Os preços atuais do catálogo não recalculam compras históricas.

As avaliações a produtores apresentam classificação, comentário, data e ligação ao perfil. A regra provisória de Q10 permite uma avaliação por encomenda entregue/autor/produtor: classificação inteira de 1–5 e comentário opcional até 1000 caracteres. Inicialmente só a entrega do Forno da Aldeia ainda não foi avaliada. O formulário acrescenta apenas uma avaliação em memória; mantém-se ao navegar para o mercado, mas desaparece ao sair, mudar de papel, recarregar ou mudar de cenário. Não publica nos perfis nem altera as suas médias, e não existe compra verificada.

As licitações representam um snapshot de **15 de outubro de 2026, 09:00 UTC**: mais elevada, ultrapassada, leilão terminado ganho e terminado sem vitória. O detalhe privado de cada lote apresenta base, incremento, valor atual e resultado coerentes com o snapshot. Não aceita ofertas nem atualiza estados pelo relógio; não existem sockets, adjudicações reais ou criação automática de encomendas. O leilão público existente permanece independente.

Os [modelos](apps/web/src/features/buyer/types.ts), [dados fictícios](apps/web/src/data/buyer.ts) e [seletores puros](apps/web/src/features/buyer/selectors.ts) estão separados da apresentação. `BuyerProvider` consome uma fonte local assíncrona substituível e gere avaliações transitórias. Em «Sobre estes dados» pode selecionar-se atividade ilustrativa, ausência de atividade ou indisponibilidade demonstrativa, sem atrasos artificiais. Todas as páginas têm carregamento, vazio e erro recuperável; detalhes com IDs inválidos têm recuperação específica. Consultar a [arquitetura e integração futura](docs/design/design-system.md#arquitetura-implementada-da-fase-242).

## Área do produtor demonstrativa

A Horta da Ribeira é o produtor de exemplo. Treze produtos privados, quatro encomendas e quatro leilões alimentam os indicadores, sem contadores paralelos. O stock inicial soma 295 unidades comerciais de produtos diferentes, não kg; existe um produto com stock reduzido e um indisponível. O limiar inicial de três unidades por produto é provisório (Q15) e editável. A abóbora tem duas unidades apenas nesta cópia privada, para explorar o alerta.

Produtos permitem pesquisa sem acentos/maiúsculas, filtros de categoria/disponibilidade, detalhe e criação/edição em memória. Nome, descrição, categoria, unidade, preço em EUR, stock e limiar são os campos aceites; preço tem até duas casas decimais e quantidades são inteiros seguros não negativos. Preço zero é provisoriamente permitido (Q06). Disponibilidade deriva do stock: zero indisponível, positivo até ao limiar reduzido, restantes disponíveis. Novos produtos usam placeholder identificado. Sem publicação, remoção, upload ou edição de certificação nesta subfase.

O perfil permite editar nome público, localidade e descrição e pré-visualizar os dados locais, reutilizando o mapa ilustrativo e os componentes existentes. A candidatura mostra requisitos, dados necessários, etapas e um exemplo pendente, sem submissão, decisão ou aprovação. Nenhuma edição concede direitos comerciais ou altera o perfil público original. Q04, Q11, Q12 e Q14 continuam por validar.

Encomendas recebidas têm filtros, linhas, preços históricos, totais e histórico dos quatro estados; não podem ser alteradas. O agregado entregue inicial é 6,45 €, referente a todo o conjunto ilustrativo, sem afirmar pagamentos, lucro ou vendas num período. Os leilões apresentam agendado, ativo e terminado, incluindo término sem ofertas e sem vencedor, num snapshot fixo de 15 de outubro de 2026, 09:00 UTC. Não existem licitações, timers, reservas ou conversão automática em encomendas; Q05/Q07/Q08/Q09 continuam pendentes.

[Tipos](apps/web/src/features/producer/types.ts), [dados](apps/web/src/data/producer.ts), [seletores e comandos puros](apps/web/src/features/producer/selectors.ts) e [fonte assíncrona](apps/web/src/features/producer/source.ts) estão separados de componentes/páginas. `ProducerProvider`/`ProducerContext`/`useProducer` mantêm as edições na navegação pública, sem copiar nem alterar o estado do carrinho ou do comprador. Sair, mudar de papel, recarregar ou mudar de cenário repõe os dados. Loading, vazio, erro e IDs inválidos têm recuperação; não há temporizadores artificiais nem chamadas HTTP. Consultar a [arquitetura do produtor](docs/design/design-system.md#arquitetura-implementada-da-fase-243).

## Área administrativa demonstrativa

[Dados administrativos](apps/web/src/data/admin.ts), [tipos](apps/web/src/features/admin/types.ts), [seletores e decisões](apps/web/src/features/admin/selectors.ts), [fonte substituível](apps/web/src/features/admin/source.ts) e [AdminProvider](apps/web/src/features/admin/AdminProvider.tsx) separam os modelos da apresentação. O contexto envolve todas as rotas e preserva decisões durante a navegação pública. Só o papel administrativo pode emitir comandos; o reducer valida novamente o recurso pendente no estado mais recente. Não existe armazenamento de decisões, HTTP ou alteração de dados públicos.

O conjunto inicial tem **10 utilizadores, sete produtores, duas candidaturas pendentes, oito encomendas únicas, três avaliações denunciadas e dois leilões ativos**. A fila de moderação começa com duas pendências; quatro sinalizações correspondem a três avaliações distintas. As oito encomendas e sete leilões resultam da união desduplicada dos snapshots de comprador/produtor. Os valores monetários mantêm preços históricos em cêntimos; a encomenda DCM-261010 continua a totalizar 6,45 €. Produtos associados a três lotes são referências ilustrativas, sem reserva de stock.

| Secção sob `/area/administrador`    | Revisão visual sugerida                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| índice                              | Confirmar os seis indicadores, as duas filas e o aviso sobre monitorização real.                                                                       |
| `candidaturas` e `candidaturas/:id` | Consultar a Horta da Ribeira; submeter sem escolha para ver validação; aprovar/rejeitar com motivo opcional e verificar o registo local e o indicador. |
| `produtores` e `produtores/:id`     | Pesquisar Horta, combinar estados, limpar filtros e consultar perfil, utilizador associado e mapa ilustrativo.                                         |
| `utilizadores` e `utilizadores/:id` | Filtrar por papel, pesquisar e consultar associações; não existem ações de segurança ou edição de papéis.                                              |
| `encomendas` e `encomendas/:id`     | Filtrar entregues, pesquisar Horta e consultar DCM-261010: quantidades, preços, subtotais, total e histórico.                                          |
| `moderacao` e `moderacao/:id`       | Abrir `denuncia-1`, consultar duas sinalizações e simular ocultar; filtrar decisões e verificar que a avaliação pública permanece igual.               |
| `leiloes` e `leiloes/:id`           | Comparar agendado, ativo e terminado; abrir `lote-sem-ofertas` e `lote-mel` para ausência de vencedor e resultado fictício.                            |
| `servicos`                          | Consultar API, Socket.io, MongoDB Atlas, Blob Storage e Swagger UI; distinguir os cinco estados reais não monitorizados dos exemplos simulados.        |

Nos 14 percursos, «Sobre esta demonstração» permite escolher atividade normal, vazio ou erro e recuperar. Experimentar um identificador inexistente em qualquer detalhe e verificar a saída para a lista. Em telemóvel, usar o menu e Escape; confirmar foco e ausência de deslocação horizontal a 320/430/768/1024/1280/1440 px.

Decisões conservam autor fictício, data e motivo opcional até 500 caracteres (limite provisório). Só recursos pendentes aceitam uma decisão, sem reabertura. Visitar o mercado preserva-as; sair, mudar de papel, recarregar ou mudar de cenário repõe os exemplos. Não se muda a classificação/texto da avaliação, o papel de utilizador, o catálogo público ou a candidatura da área do produtor. Não há aprovação administrativa real, notificações, alteração de encomendas, licitações, sockets ou monitorização Cloud.

Q04, Q10/Q12 e Q16 continuam pendentes: direitos antes da aprovação/recandidatura, moderação de outros conteúdos e profundidade da monitorização. Persistência, autorização no servidor, auditoria, conflitos e integração Cloud pertencem a fases futuras. A interface não constitui um contrato definitivo da API.

## Validação e limitações

Verificação da Fase 2.4.4 em 15 de outubro de 2026: **274 testes aprovados**, sem retries — os 224 anteriores e 50 administrativos (12 de modelo, 38 de browser). TypeScript, ESLint, Prettier e build de produção passaram. Os 14 percursos administrativos foram verificados a 320/430/768/1024/1280/1440 px, sem overflow horizontal, com uma h1, imagens válidas e controlos principais com pelo menos 44 px. Foram obtidas 50 capturas reais de Chrome; a inspeção visual incluiu desktop, tablet, telemóvel, formulários, exemplos Cloud e erro recuperável, sem erros JavaScript. Os nove documentos originais conservam os hashes iniciais e as ligações Markdown locais verificadas resolvem corretamente.

Os testes da Fase 2.4.1 verificam formulários, papéis, destinos, sessão em memória, saída, menu privado e preservação do carrinho, incluindo submissões que nunca autenticam nem enviam dados. Um cenário histórico de indisponibilidade do registo foi adaptado aos novos campos, mantendo as restantes verificações.

Execução final da Fase 2.4.2 em 15 de outubro de 2026: **176 testes aprovados**, sem retries (35 novos: 9 de modelo e 26 de browser; 141 cenários anteriores preservados). As expectativas do comprador em `auth.spec.ts` foram adaptadas às páginas agora implementadas, sem remover testes. TypeScript, ESLint, Prettier e build passaram. Os nove documentos da Fase 0 mantêm os hashes iniciais.

Os testes novos cobrem indicadores derivados, isolamento por comprador, snapshots monetários, filtros/histórico, detalhes inválidos, elegibilidade/duplicação de avaliações, estados/resultados dos leilões, navegação entre papéis, loading real, recuperação de erros e preservação da cesta. As seis páginas do comprador são verificadas às seis larguras abaixo, incluindo ações do estado de erro. Foram inspecionadas capturas Chrome de desktop, tablet e telemóvel; as ações de recuperação móveis foram separadas após essa inspeção.

TypeScript, ESLint, Prettier, build de produção e testes de browser são executáveis pelos comandos acima. Os testes do carrinho incluem operações, agrupamento, cálculos, persistência, stock reduzido, JSON inválido, IDs antigos, falhas de localStorage e interação móvel. A suite usa Playwright tanto para testes de funções puras do catálogo como para percursos em Chrome. Abrange pesquisa, todos os filtros, ordenações, paginação, URL/back/forward, loading, painel móvel, detalhes, galeria por teclado/fallback, perfis, reviews, navegação, imagens e regressões da homepage. Larguras verificadas: 320/430/768/1024/1280/1440 px. A inspeção visual utiliza capturas efetivas do Chrome; não se declara certificação de acessibilidade ou cobertura de Safari/Firefox.

O carrinho persiste apenas neste browser via localStorage. Não há persistência em servidor, contas, pagamentos, checkout, mapa com coordenadas verificadas, API ou tempo real. O mapa do perfil é uma representação ilustrativa com ligação pública à localidade; não inclui serviços pagos, chaves ou iframes externos. As médias públicas são calculadas apenas sobre avaliações fictícias, sem compras verificadas; o novo formulário privado é um exercício local e não publica avaliações. Os workspaces API/shared permanecem estruturas iniciais. As questões de negócio da Fase 0 continuam pendentes de validação antes dos módulos correspondentes.

## Assistência de inteligência artificial

Foi utilizado o assistente **Codex, da OpenAI**, como apoio à análise do enunciado, à documentação da Fase 0, à configuração Git e à implementação/verificação do frontend até à Fase 2.4.4. A skill Sites apoiou o fluxo de desenvolvimento local e a preparação de assets; não foi criada uma publicação em Sites. As propostas e o código produzidos com apoio de IA devem ser revistos e validados pelo estudante, que mantém a responsabilidade pelas decisões, pelo trabalho individual e pela explicação das soluções na defesa.

A declaração de uso de IA e bibliotecas deverá também constar do relatório final, conforme o enunciado. O apoio recebido não substitui a compreensão e validação do projeto pelo autor.

## Repositório

[Vianass/DoCampo-Mesa](https://github.com/Vianass/DoCampo-Mesa)
