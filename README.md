# Do Campo à Mesa

Mercado digital de produtores agrícolas locais, com encomendas e leilões em tempo real.

**Estado atual: Fase 2.4.1 — Interface de Autenticação e Estrutura da Área Privada.** O frontend inclui o mercado público, o carrinho com persistência local, formulários de acesso/registo/recuperação e percursos demonstrativos de comprador, produtor e administrador. O monorepo usa npm workspaces. Os nove documentos da Fase 0 estão preservados integralmente.

Os dados são fictícios e existem apenas no frontend. Não estão implementados autenticação real, endpoints, MongoDB, compras, leilões em tempo real ou recursos Cloud. As Fases 2.1, 2.2 e 2.3 foram publicadas na feature branch com autorização explícita. As alterações da Fase 2.4.1 permanecem locais; operações Git de escrita e a fase seguinte dependem de autorização explícita do utilizador.

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
│   │   │   ├── features/   # Catálogo, mercado, cart/, auth/ e private-area/
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

O [sistema visual](docs/design/design-system.md) documenta paleta, tipografia, componentes, comportamento responsivo e decisões de acessibilidade até à Fase 2.4.1, incluindo a rastreabilidade dos percursos demonstrativos aos requisitos da Fase 0. Os [créditos das fotografias](apps/web/public/images/credits.md) registam autores, fontes e licença. As fotografias são ilustrativas e não comprovam a origem dos produtores fictícios.

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
- Sessão de demonstração apenas em memória, escolha explícita de papel, navegação tipada, layout privado editorial e placeholders específicos sem operações de negócio.
- Tokens SCSS e Bootstrap personalizado, com breakpoints de 768, 1024 e 1280 px.

| Rota                       | Conteúdo                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `/`                        | Homepage                                                                           |
| `/produtos`                | Catálogo interativo com pesquisa, filtros, ordenação e paginação                   |
| `/produtos/:id`            | Detalhe editorial com galeria e produtos relacionados                              |
| `/produtores`              | Diretório editorial dos sete produtores fictícios                                  |
| `/produtores/:id`          | História, produção, produtos, localização e avaliações                             |
| `/carrinho`                | Cesta com quantidades, várias origens e totais demonstrativos                      |
| `/leiloes`                 | Proposta visual dos leilões                                                        |
| `/leiloes/cabaz-outono`    | Detalhe do lote fictício; licitação indisponível                                   |
| `/como-funciona`           | Conceito do mercado e âmbito demonstrativo                                         |
| `/entrar`                  | Formulário de acesso indisponível e escolha separada de papel demonstrativo        |
| `/registo`                 | Prévia do registo comprador; `?perfil=produtor` apresenta candidatura              |
| `/recuperar-palavra-passe` | Interface informativa, sem email ou reposição real                                 |
| `/area`                    | Encaminhamento para o papel demonstrativo atual                                    |
| `/area/comprador`          | Estrutura de encomendas, avaliações e licitações; ligação à cesta                  |
| `/area/produtor`           | Estrutura de candidatura, produtos, perfil, encomendas, leilões e indicadores      |
| `/area/administrador`      | Estrutura de candidaturas, utilizadores, encomendas, leilões, moderação e serviços |
| `/sistema-visual`          | Galeria dos componentes e da paleta                                                |

Rotas e IDs inexistentes apresentam uma página de recuperação. Preços, disponibilidade e tempos de leilão são fictícios. O carrinho é local e demonstrativo. Não existem encomendas ou ligação a API. As regras comerciais definitivas continuam pendentes de validação.

Os filtros do catálogo usam `pesquisa`, `categoria`, `produtor`, `localidade`, `epoca`, `bio`, `precoMax`, `ordem`, `pagina` e `porPagina` no URL. `precoMax` é expresso em euros; o modelo usa inteiros `priceCents`, conforme a decisão monetária proposta na Fase 0. A pesquisa e o slider atualizam o URL com substituição da entrada atual para não criar uma entrada de histórico por tecla/movimento; seleções e paginação criam entradas navegáveis.

As opções são derivadas dos mocks e não fixam taxonomias finais da API. As fotografias de catálogo têm [créditos próprios](apps/web/public/images/catalog/credits.md) e as duas fotografias distintas de galeria têm [créditos de detalhe](apps/web/public/images/details/credits.md); alguns alimentos usam um placeholder identificado, sem fotografia de outro alimento atribuída indevidamente.

## Fases de desenvolvimento

**Fase 0, concluída:** documentação e configuração inicial de Git.

**Fase 1, concluída:** npm workspaces, configuração do frontend, sistema visual e homepage/páginas demonstrativas.

**Fase 2.1, concluída:** catálogo interativo com dados fictícios, validado e publicado na feature branch através de cinco commits autorizados. Não foi efetuado merge para `main`.

**Fase 2.2, concluída:** detalhes de produtos e perfis de produtores, validados e publicados em cinco commits autorizados na feature branch.

**Fase 2.3, concluída:** carrinho demonstrativo com várias origens, Context e persistência local, sem checkout; validado e publicado em cinco commits autorizados na feature branch.

**Fase 2.4.1, atual:** formulários e sessão de demonstração, navegação e estrutura privada por papel. Não inclui as funcionalidades das Fases 2.4.2–2.4.4. O trabalho permanece local na branch já existente `feat/project-setup-design-system`, sem staging, commit, push, criação de branches ou merge automáticos. O utilizador tem controlo exclusivo dessas operações. Este trabalho não constitui conclusão dos marcos M1–M3 do projeto completo.

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
git switch feat/project-setup-design-system
npm ci
npm run dev
```

Abrir `http://127.0.0.1:5173/`. O servidor usa apenas loopback; não é publicado na Cloud. Parar com `Ctrl+C`.

Enquanto a Fase 2.4.1 não for publicada com autorização do utilizador, clonar a feature branch remota recupera a versão validada da Fase 2.3. Para testar o trabalho local atual, abrir `/entrar` e escolher um dos três papéis em «Explorar sem conta». Não é necessário preencher credenciais. Experimentar também `/registo?perfil=produtor`, o menu privado móvel e a saída da demonstração. A cesta mantém-se ao entrar/sair; recarregar termina apenas a sessão demonstrativa.

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

`DemoRoute` orienta a navegação: sem sessão, `/entrar?destino=...`; com papel incompatível, mensagem e recuperação sem trocar o papel; percursos desconhecidos, estado de página não encontrada. Só destinos internos conhecidos do papel podem ser retomados. `PrivateLayout` oferece identidade, papel visível, navegação desktop/móvel, saída e ligação ao mercado. As secções configuradas em `features/private-area/navigation.ts` são placeholders sem métricas ou operações.

Esta guarda do frontend **não é uma fronteira de segurança**. Na integração futura, a API REST validará credenciais, hashes e expiração e imporá papel/propriedade/aprovação atuais no servidor. Q01 (papéis), Q04 (produtores pendentes) e Q13 (sessão) continuam por validar para contas reais; esta demonstração não fecha essas decisões. A [análise e rastreabilidade da Fase 2.4.1](docs/design/design-system.md#fase-241--análise-e-pressupostos-antes-da-implementação) distingue interfaces presentes e operações futuras.

## Validação e limitações

Os testes da Fase 2.4.1 verificam formulários, papéis, destinos, sessão em memória, saída, menu privado e preservação do carrinho, incluindo submissões que nunca autenticam nem enviam dados. Um cenário histórico de indisponibilidade do registo foi adaptado aos novos campos, mantendo as restantes verificações.

Execução final em 15 de outubro de 2026: **141 testes aprovados**, sem retries (32 novos e 109 cenários anteriores). TypeScript, ESLint, Prettier e build passaram. Os nove documentos da Fase 0 mantêm os hashes iniciais.

TypeScript, ESLint, Prettier, build de produção e testes de browser são executáveis pelos comandos acima. Os testes do carrinho incluem operações, agrupamento, cálculos, persistência, stock reduzido, JSON inválido, IDs antigos, falhas de localStorage e interação móvel. A suite usa Playwright tanto para testes de funções puras do catálogo como para percursos em Chrome. Abrange pesquisa, todos os filtros, ordenações, paginação, URL/back/forward, loading, painel móvel, detalhes, galeria por teclado/fallback, perfis, reviews, navegação, imagens e regressões da homepage. Larguras verificadas: 320/430/768/1024/1280/1440 px. A inspeção visual utiliza capturas efetivas do Chrome; não se declara certificação de acessibilidade ou cobertura de Safari/Firefox.

O carrinho persiste apenas neste browser via localStorage. Não há persistência em servidor, contas, pagamentos, checkout, mapa com coordenadas verificadas, API ou tempo real. O mapa do perfil é uma representação ilustrativa com ligação pública à localidade; não inclui serviços pagos, chaves ou iframes externos. As médias são calculadas apenas sobre avaliações fictícias, sem compras verificadas. Não há formulário de submissão de avaliações. Os workspaces API/shared permanecem estruturas iniciais. As questões de negócio da Fase 0 continuam pendentes de validação antes dos módulos correspondentes.

## Assistência de inteligência artificial

Foi utilizado o assistente **Codex, da OpenAI**, como apoio à análise do enunciado, à documentação da Fase 0, à configuração Git e à implementação/verificação do frontend até à Fase 2.4.1. A skill Sites apoiou o fluxo de desenvolvimento local e a preparação de assets; não foi criada uma publicação em Sites. As propostas e o código produzidos com apoio de IA devem ser revistos e validados pelo estudante, que mantém a responsabilidade pelas decisões, pelo trabalho individual e pela explicação das soluções na defesa.

A declaração de uso de IA e bibliotecas deverá também constar do relatório final, conforme o enunciado. O apoio recebido não substitui a compreensão e validação do projeto pelo autor.

## Repositório

[Vianass/DoCampo-Mesa](https://github.com/Vianass/DoCampo-Mesa)
