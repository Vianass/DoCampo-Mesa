# Sistema visual — Do Campo à Mesa

## Âmbito e estado

Fase 1: configuração do monorepo e primeira implementação do sistema visual, em React/TypeScript/Vite. Esta documentação complementa os nove documentos da Fase 0, cujo conteúdo foi preservado. A aplicação funciona com dados fictícios em memória; não existem autenticação, endpoints, MongoDB, compras ou licitações reais.

As decisões de negócio Q01–Q16 permanecem em [decisions.md](../architecture/decisions.md). Categorias, unidades, produtos e produtores demonstrativos não constituem decisões definitivas da API. O pedido desta fase seleciona `packages/shared` como nome do workspace reservado, em lugar do nome `packages/contracts` que constava apenas como proposta futura na Fase 0. Não se criaram abstrações ou contratos partilhados sem utilização.

## Identidade visual

A direção é um mercado editorial contemporâneo, inspirado na proximidade dos mercados portugueses, nas colheitas sazonais e no prazer de conhecer a origem. Composição com espaço generoso, títulos serifados, linhas finas, cores naturais e fotografia como elemento principal. A marca tipográfica combina «do campo / à mesa» com um símbolo vetorial original de rebento. O favicon deriva do mesmo símbolo.

O hero usa uma fotografia de mercado recortada por um arco, um selo amarelo da época e uma composição assimétrica. A secção de leilão usa verde floresta para criar um segundo momento visual; perfis de produtores mantêm uma leitura editorial, sem reproduzir dashboards genéricos. A chamada final contém um desenho vetorial original simples, coerente com a marca, e não uma ilustração de stock.

Textos em pt-PT, próximos e claros. O título principal é «O melhor da nossa terra, à tua mesa.», com as ações «Explorar produtos» e «Conhecer produtores». Produtos, produtores e valores de leilão são identificados como fictícios. Não há testemunhos, classificações ou números de clientes apresentados como reais.

## Paleta e contraste

| Token SCSS    | Cor       | Utilização                                                           |
| ------------- | --------- | -------------------------------------------------------------------- |
| `$forest`     | `#193C34` | Marca, títulos, navegação, ações principais e fundo de leilão/rodapé |
| `$sage`       | `#A9B9A2` | Superfícies e apontamentos naturais; não texto pequeno sobre creme   |
| `$cream`      | `#F7F3EA` | Fundo principal e texto sobre verde escuro                           |
| `$terracotta` | `#C56A45` | Pontuação da marca e pequenos acentos gráficos                       |
| `$harvest`    | `#E6BC68` | Selo sazonal, detalhes e foco sobre fundos escuros                   |
| `$graphite`   | `#252923` | Texto principal                                                      |
| `$white`      | `#FFFFFF` | Campos e superfícies auxiliares                                      |

Tokens auxiliares: `$muted: #62675E` para texto secundário; `$line: #DEDFD3` para separadores. Verde intermédio do hero é reservado a título grande; terracota não é usado como texto pequeno sobre creme. Estados de erro usam um tom mais escuro, `#943D26`, acompanhado de texto.

As variáveis SCSS estão em [tokens](../../apps/web/src/styles/_tokens.scss); cores principais são também expostas como custom properties CSS. Bootstrap 5 é personalizado antes da importação dos seus parciais: cores, tipografia, border radius, inputs e breakpoints. Importam-se componentes relevantes, sem o JavaScript de Bootstrap; interações são controladas por React.

## Tipografia

- **DM Serif Display**, peso 400, normal/itálico: títulos principais, títulos editoriais e marca. Alternativa: Georgia/serif.
- **DM Sans Variable**, pesos visuais 400/500/600: corpo, navegação, etiquetas, formulários, botões e informação de produto. Alternativa: system-ui/sans-serif.

Fontes alojadas pelo próprio build através de Fontsource, sob SIL Open Font License 1.1. As licenças são distribuídas pelos pacotes `@fontsource-variable/dm-sans` e `@fontsource/dm-serif-display` e conservadas no diretório público: [DM Sans](../../apps/web/public/fonts/OFL-DM-Sans.txt) e [DM Serif Display](../../apps/web/public/fonts/OFL-DM-Serif-Display.txt). `font-display: swap`; subset latino e carregamento por unicode-range. Não há pedidos a Google Fonts durante a navegação.

Escala responsiva com `clamp()` para títulos; texto de corpo de 16 px; títulos de cartões com sans-serif legível. Etiquetas pequenas são secundárias, não o único meio de perceber uma ação ou estado. Os pesos são limitados a três na sans-serif e um na serif.

## Espaçamento, formas e movimento

| Escala        | Valor              |
| ------------- | ------------------ |
| 1 / 2 / 3 / 4 | 4 / 8 / 12 / 16 px |
| 5 / 6 / 7     | 24 / 32 / 48 px    |
| 8 / 9         | 64 / 96 px         |

Gutters: 20 px no telemóvel, 32 px desde tablet e 56 px em ecrã largo; largura máxima exterior de 1320 px. Secções usam espaçamento que cresce de 64 px até 88 px. Raios: 6 px em ações/campos, 14 px em cartões, 24 px em superfícies maiores, 999 px em pills. O arco do hero é uma forma editorial específica, não um raio genérico dos cartões.

Sombras suaves definidas como token, sem necessidade de aplicar sombra a todos os cartões. Transições de 160 ms em ações e 350 ms em fotografias; zoom de hover muito discreto. Skeleton tem pulsação leve. `prefers-reduced-motion: reduce` remove movimentos relevantes e scroll suave. O estado de leilão não pulsa nem usa contagem fictícia em execução.

## Componentes implementados

| Componente        | Contrato e comportamento                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`          | Props tipadas e união entre link React Router e botão nativo; variantes principal, secundária, clara e texto; tamanhos regular/pequeno; `disabled` nativo. |
| `Container`       | Largura e gutters partilhados, com classe adicional opcional.                                                                                              |
| `SectionHeading`  | Eyebrow, h2, descrição e ação opcional; empilha no telemóvel.                                                                                              |
| `ProductCard`     | Produto tipado, imagem, etiqueta opcional, origem, nome, preço/unidade; um destino de detalhe demonstrativo.                                               |
| `ProducerCard`    | Produtor tipado, imagem ilustrativa, especialidade e localidade; destino do perfil.                                                                        |
| `AuctionCard`     | Destaque visual tipado, preço/tempo ilustrativos e destino de detalhe; sem Socket.IO ou lógica de licitação.                                               |
| `CategoryPill`    | Botão nativo com `aria-pressed`, label, ícone opcional e callback.                                                                                         |
| `StatusBadge`     | Texto e tons neutro, sazonal, biológico e direto; estados não dependem só da cor.                                                                          |
| `PriceDisplay`    | Cêntimos → formatação `Intl.NumberFormat('pt-PT')`; unidade e tamanho opcionais. Apenas apresentação, não cálculo de encomendas.                           |
| `EmptyState`      | Título h2, descrição e ação opcional; utilizado em pesquisa e páginas futuras.                                                                             |
| `LoadingSkeleton` | Estado `role=status`, label acessível e quantidade limitada; demonstração na galeria, sem atrasos artificiais na homepage.                                 |
| `FormField`       | Label associada a ID estável, hint/erro com `aria-describedby`, `aria-invalid`; props nativas de input.                                                    |

Auxiliares: `Icon` com SVGs vetoriais originais de interface e `Brand`. Não existem bibliotecas de ícones, estado, animação ou UI adicionais. Componentes usam dados de demonstração do frontend; o package shared ainda não exporta tipos.

A galeria navegável encontra-se em `/sistema-visual`. [Código dos componentes](../../apps/web/src/components/Button.tsx), [galeria](../../apps/web/src/pages/MarketPages.tsx).

## Layout e navegação

`PublicLayout` reúne Header, main/Outlet e Footer. `DesktopNavigation` aparece a partir de 1024 px. Em formatos menores, `MobileNavigation` é um painel expansível no fluxo normal, com textos próprios e ações de conta; não reduz a navegação desktop. O botão informa `aria-expanded`/`aria-controls`. Escape fecha o painel e devolve foco ao botão; navegar fecha o painel.

A marca liga à homepage; pesquisa liga ao catálogo; entrar/registar têm páginas honestas de indisponibilidade, sem recolha de credenciais. O rodapé liga a produtos, produtores, leilões, explicação do mercado, sistema visual e [créditos das fotografias](../../apps/web/public/images/credits.md).

Existe ligação «Saltar para o conteúdo», `main` focável na navegação entre páginas e anúncio discreto de mudança de rota. As rotas desconhecidas e IDs ausentes apresentam uma página de recuperação.

## Comportamento responsivo

Abordagem Mobile First. Mixins `from(md)`, `from(lg)` e `from(xl)` em [mixins](../../apps/web/src/styles/_mixins.scss); os três breakpoints exigidos são definidos tanto em tokens como na personalização de Bootstrap.

| Intervalo              | Comportamento                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base, abaixo de 768 px | Hero e leilão empilhados; menu expansível; produtos de época em coluna; catálogo em duas colunas; produtores em coluna; botões podem quebrar linha. |
| ≥ 768 px               | Hero/leilão em duas colunas; produtos de época e produtores em três colunas; secções com títulos e ações lado a lado; navegação continua móvel.     |
| ≥ 1024 px              | Navegação desktop; catálogo em quatro colunas; «Como funciona» coloca introdução e três passos lado a lado.                                         |
| ≥ 1280 px              | Margens maiores, hero/fotografia e tipografia mais amplos; limite de largura preserva leitura em monitores largos.                                  |

Imagens com dimensões explícitas, `object-fit`, largura fluida e proporções reservadas; hero com prioridade alta, restantes imagens com `loading=lazy` e decoding assíncrono. Sete WebP locais otimizados, cerca de 710 KiB no total. Não se utiliza uma URL remota inventada ou um serviço de imagem necessário em runtime.

## Fotografia e licenças

Direção: alimentos e agricultura com luz natural, madeira e textura do campo, sem rostos identificados como produtores fictícios. Os assets locais foram obtidos do Unsplash, com página da fotografia, autor e licença registados em [credits.md](../../apps/web/public/images/credits.md). São imagens ilustrativas: por exemplo, a vinha fotografada na Califórnia não é apresentada como uma exploração portuguesa real. O perfil respetivo informa expressamente que a fotografia não representa a exploração fictícia.

O ficheiro de créditos conserva fonte e condições de utilização; não constitui uma indicação de parceria ou adesão dos fotógrafos/produtores à plataforma. Marca, ícones e desenho vetorial da chamada final foram criados em código para este projeto.

## Acessibilidade e verificação

HTML semântico com header/nav/main/section/article/footer e uma única h1 por página; h2 das secções e h3 dos cartões. Labels visíveis ou texto acessível equivalente; mensagens de erro ligadas ao campo; ícones decorativos ocultados da árvore acessível. Links para navegação, botões para ações; foco visível, contraste contextual e alvos principais com pelo menos 44 px. Categorias quebram em linhas em vez de provocar scroll horizontal.

Verificações previstas/executáveis: TypeScript strict, ESLint, Prettier, build de produção e testes Playwright. Os testes de browser usam Chrome instalado por omissão e cobrem 320/430/768/1024/1280/1440 px, imagens lazy ao percorrer a página, navegação por teclado/Escape, pesquisa/categoria/estado vazio, destinos e indisponibilidade de contas/licitação. A inspeção visual é registada apenas depois da abertura efetiva em browser.

Não se declara certificação WCAG nem cobertura de todos os browsers/leitores de ecrã. O futuro fluxo de autenticação, checkout, regras de filtros completas e tempo real ficam fora desta fase. A validação do esquema de dados não é substituída pelos mocks usados no design.

### Verificação realizada em 15 de outubro de 2026

TypeScript strict, ESLint, Prettier e build de produção concluíram sem erros. O servidor Vite arrancou em `http://127.0.0.1:5173/` e a homepage respondeu com HTTP 200. A última execução completa de Playwright passou os dez testes; uma repetição final, após simplificação interna de `Button`, foi recusada na autorização da ferramenta e não foi executada. As verificações estáticas e o build passaram depois dessa simplificação.

Inspeção efetiva em Chrome de capturas de desktop (1440 px), tablet (768 px) e telemóvel (390 px), incluindo hero, menu móvel, produtos de época, leilão, produtores, catálogo e chamada final. Verificação adicional de onze páginas em cinco larguras (320/768/1024/1280/1440 px), num total de 55 combinações, sem overflow horizontal nem múltiplas h1. Não se apresenta esta inspeção como certificação formal de acessibilidade.

Os nove documentos da Fase 0 foram comparados por SHA-256 com o estado inicial e permaneceram idênticos. As ligações locais do README e da documentação foram verificadas, incluindo créditos e licenças das fontes. Capturas e resultados temporários de browser não são incluídos no Git.

## Referências técnicas

- [Vite — configuração inicial e requisitos de Node.js](https://vite.dev/guide/).
- [React Router — modo declarativo](https://reactrouter.com/start/declarative/installation).
- [Bootstrap 5 — personalização SASS](https://getbootstrap.com/docs/5.3/customize/sass/).
- [ESLint — configuração flat](https://eslint.org/docs/latest/use/configure/configuration-files).

Versões efetivamente instaladas constam do lockfile; consultar `npm ls --depth=0`. Referências consultadas durante a Fase 1, em 15 de outubro de 2026.
