# Do Campo à Mesa

Mercado digital de produtores agrícolas locais, com encomendas e leilões em tempo real.

**Estado atual: Fase 1 — Configuração do Projeto e Sistema Visual.** O frontend demonstrativo está implementado com uma homepage responsiva, componentes reutilizáveis e navegação React Router. O monorepo usa npm workspaces. Os nove documentos da Fase 0 estão preservados integralmente.

Os dados são fictícios e existem apenas no frontend. Não estão implementados autenticação, endpoints, MongoDB, compras, leilões em tempo real ou recursos Cloud. A Fase 2 depende de aprovação explícita.

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
│   │   │   ├── layouts/    # Layout público e navegação
│   │   │   ├── pages/      # Homepage e páginas demonstrativas
│   │   │   ├── data/       # Produtos, produtores e leilão fictícios
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

O [sistema visual](docs/design/design-system.md) documenta paleta, tipografia, componentes, comportamento responsivo e decisões de acessibilidade da Fase 1. Os [créditos das fotografias](apps/web/public/images/credits.md) registam autores, fontes e licença. As fotografias são ilustrativas e não comprovam a origem dos produtores fictícios.

## Implementação disponível

- Homepage editorial com seleção sazonal, destaque ilustrativo de leilão, produtores, explicação do mercado, prévia do catálogo e chamada para produtores.
- Componentes `Button`, `Container`, `SectionHeading`, `ProductCard`, `ProducerCard`, `AuctionCard`, `CategoryPill`, `StatusBadge`, `PriceDisplay`, `EmptyState`, `LoadingSkeleton` e `FormField`.
- Header, navegação desktop e móvel, layout público e footer; foco visível, ligação de salto e suporte a movimento reduzido.
- Pesquisa e seleção de categoria sobre quatro produtos fictícios, incluindo estado vazio; navegação para detalhes demonstrativos.
- Tokens SCSS e Bootstrap personalizado, com breakpoints de 768, 1024 e 1280 px.

| Rota                    | Conteúdo                                                     |
| ----------------------- | ------------------------------------------------------------ |
| `/`                     | Homepage                                                     |
| `/produtos`             | Catálogo demonstrativo com pesquisa e categorias             |
| `/produtos/:id`         | Detalhe de um produto fictício                               |
| `/produtores`           | Produtores fictícios em destaque                             |
| `/produtores/:id`       | Perfil demonstrativo e respetivos produtos                   |
| `/leiloes`              | Proposta visual dos leilões                                  |
| `/leiloes/cabaz-outono` | Detalhe do lote fictício; licitação indisponível             |
| `/como-funciona`        | Conceito do mercado e âmbito demonstrativo                   |
| `/entrar` e `/registo`  | Páginas informativas; sem formulário de autenticação/registo |
| `/sistema-visual`       | Galeria dos componentes e da paleta                          |

Rotas e IDs inexistentes apresentam uma página de recuperação. Preços e tempos de leilão são estáticos. O catálogo não implementa ainda os filtros de negócio completos, carrinho ou encomendas.

## Fases de desenvolvimento

**Fase 0, concluída:** documentação e configuração inicial de Git.

**Fase 1, atual:** npm workspaces, configuração do frontend, sistema visual e homepage/páginas demonstrativas. A implementação ocorre na branch `feat/project-setup-design-system`; não há merge automático para `main`. Este trabalho não constitui conclusão dos marcos M1–M3 do projeto completo.

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

## Validação e limitações

TypeScript, ESLint, build de produção e testes de browser são executáveis pelos comandos acima. A cobertura Playwright inclui 320/430/768/1024/1280/1440 px, fotografias lazy ao percorrer a página, navegação por teclado/Escape, pesquisa, estado vazio e destinos dos cartões. A inspeção visual utiliza capturas efetivas do Chrome; não se declara certificação de acessibilidade ou cobertura de Safari/Firefox.

Não há persistência, contas, pagamentos, checkout, mapa integrado, API ou tempo real. Os workspaces API/shared permanecem estruturas iniciais. As questões de negócio da Fase 0 continuam pendentes de validação antes dos módulos correspondentes.

## Assistência de inteligência artificial

Foi utilizado o assistente **Codex, da OpenAI**, como apoio à análise do enunciado, à documentação da Fase 0, à configuração Git e à implementação/verificação do frontend da Fase 1. A skill Sites apoiou o fluxo de desenvolvimento local e a preparação de assets; não foi criada uma publicação em Sites. As propostas e o código produzidos com apoio de IA devem ser revistos e validados pelo estudante, que mantém a responsabilidade pelas decisões, pelo trabalho individual e pela explicação das soluções na defesa.

A declaração de uso de IA e bibliotecas deverá também constar do relatório final, conforme o enunciado. O apoio recebido não substitui a compreensão e validação do projeto pelo autor.

## Repositório

[Vianass/DoCampo-Mesa](https://github.com/Vianass/DoCampo-Mesa)
