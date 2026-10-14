# Do Campo à Mesa

Mercado digital de produtores agrícolas locais, com encomendas e leilões em tempo real.

**Estado atual: Fase 0 — Requisitos e Arquitetura.** O repositório contém a documentação inicial de análise, arquitetura, modelo de dados e planeamento. A aplicação, a API, as ligações à base de dados e os recursos Cloud ainda não foram implementados ou configurados. O início da Fase 1 depende de aprovação explícita.

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

Estes objetivos descrevem o âmbito a desenvolver; não representam funcionalidades já disponíveis. As regras de negócio em aberto estão registadas no [documento de decisões](docs/architecture/decisions.md).

## Tecnologias planeadas

| Área | Tecnologias selecionadas |
| --- | --- |
| Frontend | React, TypeScript, Vite, React Router, Bootstrap 5 e SASS/SCSS |
| Backend | Node.js, Express, TypeScript e Mongoose |
| Base de dados | MongoDB Atlas |
| Autenticação | JWT e bcrypt |
| Tempo real | Socket.IO |
| Documentação da API | OpenAPI 3 e Swagger UI |
| Cloud | Microsoft Azure: App Service, Static Web Apps e Blob Storage |
| Testes | Vitest, Supertest e Playwright |

As versões concretas e o runtime suportado serão definidos na fase de implementação. Não existem dependências instaladas ou aplicações geradas nesta fase.

## Arquitetura prevista

O projeto seguirá um **monorepo com monólito modular e API REST**. A SPA React será publicada em Azure Static Web Apps; um único backend Node.js em Azure App Service reunirá Express, Socket.IO e o agendador interno de leilões. MongoDB Atlas armazenará os dados, e Azure Blob Storage armazenará as imagens.

A autorização será aplicada no servidor por papel e propriedade dos recursos. O modelo propõe snapshots das linhas de encomenda e transações para manter coerência de stock e de estado/histórico dos leilões. A recuperação de ligações usará o estado persistido, versões e sequências. Estas soluções são propostas documentadas, sujeitas às decisões de negócio ainda em aberto.

Consultar a [visão global](docs/architecture/system-overview.md), os [diagramas Mermaid](docs/architecture/architecture-diagram.md) e a [consistência dos leilões](docs/architecture/auction-consistency.md).

## Estrutura atual do repositório

```text
.
├── .gitignore
├── README.md
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
    └── planning/
        └── implementation-plan.md
```

A futura estrutura de aplicações e contratos partilhados encontra-se descrita na documentação de arquitetura. Essas pastas ainda não foram criadas.

## Documentação da Fase 0

| Documento | Conteúdo |
| --- | --- |
| [Requisitos funcionais](docs/requirements/functional-requirements.md) | Requisitos por módulo, intervenientes, prioridades, critérios de aceitação e referências ao enunciado |
| [Requisitos não funcionais](docs/requirements/non-functional-requirements.md) | Segurança, responsividade, qualidade, consistência, Cloud e obrigações académicas |
| [Casos de utilização](docs/requirements/use-cases.md) | Atores, pré-condições, fluxos, alternativas, pós-condições e autorização |
| [Visão global do sistema](docs/architecture/system-overview.md) | Componentes, responsabilidades, dados, comunicação e serviços Cloud |
| [Diagramas de arquitetura](docs/architecture/architecture-diagram.md) | Contexto, contentores e componentes em Mermaid |
| [Consistência dos leilões](docs/architecture/auction-consistency.md) | Concorrência, atomicidade, histórico, expiração, salas e reconexão |
| [Decisões e questões em aberto](docs/architecture/decisions.md) | Fundamentação das escolhas, alternativas, recomendações e riscos |
| [Modelo de dados](docs/database/data-model.md) | Coleções, validação, referências, documentos embebidos, índices e relações |
| [Plano de implementação](docs/planning/implementation-plan.md) | Sete semanas, dependências, entregáveis, testes e marcos Git |

## Fases de desenvolvimento

**Fase 0, atual:** requisitos, arquitetura, modelo de dados, consistência dos leilões, planeamento e configuração inicial do repositório.

Após aprovação, o desenvolvimento seguirá o calendário do enunciado:

| Semana | Trabalho previsto | Marco |
| --- | --- | --- |
| 1 | Protótipos e frontend responsivo | Início da Fase 1 |
| 2 | SPA com componentes, estado, routing e dados simulados; esboço OpenAPI | M1 |
| 3 | API REST e modelo MongoDB | — |
| 4 | OpenAPI/Swagger, autenticação, segurança e integração com a SPA | M2 |
| 5 | Leilões e notificações em tempo real | — |
| 6 | Publicação na Cloud e armazenamento de imagens | — |
| 7 | Testes finais, relatório e vídeo | M3 |

O backoffice Laravel e a análise de elasticidade/custos são componentes opcionais de valorização. Só serão considerados depois de todos os requisitos obrigatórios estarem completos e funcionais. Não há datas de submissão ou defesa definidas neste README.

## Instalação e execução

**A completar quando existir uma implementação executável.** Nesta fase não há comandos de instalação ou de arranque da aplicação.

As instruções futuras deverão identificar os pré-requisitos e versões, a instalação de dependências, a configuração através de exemplos sem segredos, a execução local de frontend/backend, os testes e a publicação. Credenciais, tokens e ficheiros `.env` privados não devem ser versionados; um eventual `.env.example` deverá conter apenas valores ilustrativos sem segredos.

Para consultar a Fase 0, basta abrir os documentos Markdown ou navegar pelas ligações acima no GitHub.

## Assistência de inteligência artificial

Foi utilizado o assistente **Codex, da OpenAI**, como apoio à análise do enunciado, à elaboração da documentação da Fase 0 e à configuração inicial deste repositório. As propostas produzidas com apoio de IA devem ser revistas e validadas pelo estudante, que mantém a responsabilidade pelas decisões, pelo trabalho individual e pela explicação das soluções na defesa.

A declaração de uso de IA e bibliotecas deverá também constar do relatório final, conforme o enunciado. O apoio recebido não substitui a compreensão e validação do projeto pelo autor.

## Repositório

[Vianass/DoCampo-Mesa](https://github.com/Vianass/DoCampo-Mesa)
