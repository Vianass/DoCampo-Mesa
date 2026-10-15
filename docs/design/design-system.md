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

## Extensão na Fase 2.1 — catálogo

O catálogo `/produtos` reutiliza o sistema visual, `ProductCard`, `Container`, `FormField`, `PriceDisplay`, `StatusBadge`, `EmptyState` e `LoadingSkeleton`. O hero, as fontes, os tokens e a estrutura pública da Fase 1 são preservados. A homepage continua a apresentar apenas quatro produtos e três produtores em destaque, mesmo com o dataset completo ampliado.

### Dados e organização

[O modelo de apresentação](../../apps/web/src/types/market.ts) define um único `Product`, com campos readonly: ID, nome, descrição, categoria, `priceCents`, unidade, stock, array não vazio de imagens com alt, ID/nome/localidade do produtor, biológico, épocas, destaque e data ISO. O preço mantém os inteiros em cêntimos da proposta de arquitetura; não se duplica um campo de preço em euros. Nomes e localidades dos produtos são derivados dos perfis fictícios, em vez de repetidos manualmente nos seeds.

A amostra contém 36 produtos portugueses, oito categorias e sete produtores inteiramente fictícios. Preços, stock, épocas, certificações e datas servem para demonstração; não são dados comerciais nem validação final das questões Q da Fase 0. Categorias e épocas da interface não impõem um schema à futura API.

A [página do catálogo](../../apps/web/src/pages/ProductsPage.tsx) coordena a apresentação; [funções puras](../../apps/web/src/features/catalog/catalog.ts) tratam seleção, ordenação, paginação e leitura/escrita do URL; [useCatalog](../../apps/web/src/features/catalog/useCatalog.ts) reúne hooks e memoização. Tipos não são copiados para o workspace shared, que continua reservado.

### Pesquisa, filtros e ordenação

Pesquisa imediata por nome, descrição, produtor e localidade, com normalização de acentos e capitalização. Uma pesquisa com várias palavras exige que todas ocorram no texto relevante. Não é criada uma dependência de pesquisa ou um pedido a API.

Categoria, produtor, localidade e época são opções derivadas da amostra completa; produção biológica e preço máximo podem combinar-se com todas as restantes condições. O slider vai de zero ao teto de preço derivado do dataset, com passos de cinco cêntimos. O filtro é inclusivo (`preço ≤ máximo`) e explica que os preços se referem à unidade indicada; não compara artificialmente kg com embalagens por conversão não definida.

Os filtros ativos aparecem em indicadores removíveis, com ação para limpar todos. A ausência de resultados apresenta `EmptyState` e recuperação do catálogo completo. O contador tem nome acessível «Resultados do catálogo», distinguindo-se do `output` do slider.

Ordenações: relevância, preço crescente/decrescente, nome A–Z/Z–A e mais recentes. Relevância prioriza correspondência no nome e produtos em destaque; os empates preservam a ordem da amostra. Nomes usam colação pt-PT. A ordenação cria uma nova lista e não modifica os mocks.

### Paginação e URL

Tamanhos de página configuráveis: 12, 24 e 36. Botões nativos anterior/seguinte e páginas numeradas, `aria-current`, indicador de página e intervalo mostrado. Sem resultados, não se apresenta «página 1 de 0». Página fora dos limites é ajustada ao intervalo disponível; mudar pesquisa, filtro, ordem ou tamanho repõe a página 1. Limpar filtros conserva a preferência de ordenação e tamanho.

Estado partilhável por `pesquisa`, `categoria`, `produtor`, `localidade`, `epoca`, `bio`, `precoMax`, `ordem`, `pagina` e `porPagina`. `precoMax` está em euros no URL e é convertido para cêntimos na leitura. Valores inválidos usam opções seguras; parâmetros externos ao catálogo são preservados. Pesquisa/slider substituem a entrada atual de histórico; seleções e páginas acrescentam entradas. Voltar, avançar e recarregar recuperam controlos e resultados. Não é introduzido estado global. [API useSearchParams](https://reactrouter.com/api/hooks/useSearchParams).

Os controlos atualizam primeiro o estado local, para não perder caracteres durante a transição de navegação do router. Quando a atualização do URL termina, este volta a determinar o estado; o mesmo se aplica ao histórico do browser. O teste de pesquisa inclui escrita sequencial rápida, sem atrasos artificiais.

### Interação responsiva e acessibilidade

Em desktop, filtros numa coluna lateral e resultados em três colunas. Abaixo de 1024 px, um botão abre um painel dedicado implementado com `dialog` nativo e `showModal`: fundo inerte, foco contido no modal, Escape, botão de fechar e ação de aplicar. O diálogo fecha também ao mudar para desktop; fechar devolve foco ao botão, aplicar e mudar página focam a área de resultados. [Elemento dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

A pesquisa permanece visível; o input tem 16 px para leitura e interação móvel, enquanto o stock tem 12 px. Controlos principais têm pelo menos 44 px. Grelha: duas colunas no telemóvel e três desde 768 px; os breakpoints 768/1024/1280 px são mantidos. Etiquetas biológicas e stock são textuais, além da cor; localização nunca é ocultada nos cartões.

O módulo da página é carregado por `React.lazy`/`Suspense`; `LoadingSkeleton` aparece enquanto esse código é obtido. Não se introduziu temporizador para simular uma API lenta. Produtos e filtros são síncronos em memória depois de o módulo carregar.

### Fotografia e limites

Doze fotografias WebP adicionais, com [créditos próprios](../../apps/web/public/images/catalog/credits.md), cerca de 442 KiB no total. A fotografia de cada alimento é ilustrativa e não comprova variedade, origem, produção biológica ou denominação protegida. Para 17 produtos sem imagem adequada, usa-se um [placeholder vetorial original](../../apps/web/public/images/product-placeholder.svg), identificado por texto e alt. Proporções reservadas e loading lazy mantêm a estabilidade dos cartões.

Sem novas dependências, autenticação, backend, MongoDB, checkout, pagamentos ou tempo real. Os perfis e detalhes existentes recebem apenas a adaptação de campos necessária para continuar a navegar a partir do catálogo.

### Verificação da Fase 2.1

Testes em [catalog.spec.ts](../../apps/web/tests/catalog.spec.ts) e [catalog-model.spec.ts](../../apps/web/tests/catalog-model.spec.ts), com a infraestrutura Playwright existente; regressões da homepage permanecem em [market.spec.ts](../../apps/web/tests/market.spec.ts). Cobrem os catorze cenários pedidos, mais descrição, nome/data, histórico, loading, paginação fora dos limites, imutabilidade e URL inválido.

Execução final em 15 de outubro de 2026: 39 testes aprovados, sem retries. TypeScript, ESLint, Prettier e build de produção concluíram sem erros. Os nove documentos da Fase 0 mantêm os hashes SHA-256 iniciais e as 54 ligações Markdown locais verificadas resolvem corretamente.

Inspeção efetiva em Chrome: desktop, telemóvel e modal de filtros. Verificações de overflow e navegação a 320, 430, 768, 1024, 1280 e 1440 px. Não há validação formal em Safari/Firefox ou leitores de ecrã. Durante a implementação, os ficheiros permaneceram locais. Posteriormente, a Fase 2.1 foi publicada em cinco commits na feature branch, com autorização explícita; `main` não foi alterada.

## Referências técnicas adicionais da Fase 1

- [Vite — configuração inicial e requisitos de Node.js](https://vite.dev/guide/).
- [React Router — modo declarativo](https://reactrouter.com/start/declarative/installation).
- [Bootstrap 5 — personalização SASS](https://getbootstrap.com/docs/5.3/customize/sass/).
- [ESLint — configuração flat](https://eslint.org/docs/latest/use/configure/configuration-files).

Versões efetivamente instaladas constam do lockfile; consultar `npm ls --depth=0`. Referências consultadas durante a Fase 1, em 15 de outubro de 2026.

## Extensão na Fase 2.2 — detalhes e perfis públicos

### Experiências e organização

As rotas existentes mantêm-se. [ProductDetailPage](../../apps/web/src/pages/ProductDetailPage.tsx) apresenta breadcrumbs, fotografia à esquerda e informação à direita desde 1024 px, preço por unidade, stock, indicação biológica demonstrativa, épocas, descrição em dois parágrafos, origem e produtos relacionados. Em telemóvel a fotografia precede a informação. [ProducerDetailPage](../../apps/web/src/pages/ProducerDetailPage.tsx) apresenta capa, imagem representativa, identidade/localidade, história editorial, métodos de produção, categorias, produtos, localização e avaliações. O diretório `/produtores` reutiliza `ProducerCard` e acrescenta descrição e categorias derivadas, sem alterar o conjunto de três destaques da homepage.

`Breadcrumbs`, `ProductGallery`, `MarketImage`, `ProducerMap` e `ReviewCard` são componentes reutilizáveis. `ProductCard` mantém a apresentação e oferece ligações independentes pela fotografia/nome do produto e pelo nome do produtor; não existem anchors aninhados. `SectionHeading`, `PriceDisplay`, `StatusBadge`, `EmptyState`, `LoadingSkeleton` e `Container` são reutilizados.

### Dados e recomendações

[Product e Producer](../../apps/web/src/types/market.ts) conservam os IDs e relações existentes. Os [produtores](../../apps/web/src/data/producers.ts) são a fonte única de nome/localidade, imagem de capa, região, história, métodos e indicador biológico opcional estritamente demonstrativo. `publicContact` é opcional; nenhum perfil atual tem contactos reais ou públicos inventados. Os produtos continuam definidos em `data/market.ts`, com descrição detalhada derivada da descrição existente e de contexto por categoria. Não se altera o preço em cêntimos ou as funções do catálogo.

Seis [avaliações tipadas](../../apps/web/src/data/reviews.ts) pertencem a quatro produtores; os restantes mostram ausência de avaliações, sem média zero fictícia. Nomes, comentários e classificações estão identificados como demonstração, sem compras verificadas. `ReviewCard` apresenta nome público, texto, escala de 1–5, estrelas com alternativa textual e `time`; datas são formatadas em pt-PT e Europe/Lisbon. Não existe submissão, moderação ou persistência. Este modelo de apresentação não implementa os contratos finais de avaliação da Fase 0.

[Funções puras de seleção](../../apps/web/src/features/market/selectors.ts) derivam categorias dos produtos e calculam médias das avaliações associadas. As recomendações excluem o produto atual e priorizam, por esta ordem, categoria comum, produtor comum e número de épocas em comum; empates usam nome pt-PT e ID. A seleção não é aleatória e não altera os arrays originais.

### Galeria, navegação e acessibilidade

`ProductGallery` usa fotografias distintas, um botão nativo por miniatura, `aria-pressed`, `aria-controls`, estado textual da fotografia e setas/Home/End para mudar imagem e foco. Enter/espaço mantêm o comportamento nativo dos botões. Uma única imagem não gera navegação artificial. O estado da galeria reinicia quando muda o produto. `MarketImage` recupera falhas com o placeholder local, alt explícito e reset quando muda a fonte.

Os breadcrumbs usam `nav`, lista ordenada e `aria-current`. Rotas de detalhe usam `React.lazy`/`Suspense` com `DetailLoadingPage`; o skeleton corresponde ao carregamento real do módulo, sem temporizador ou API fictícia. IDs inválidos apresentam `EntityNotFound` específico e uma ligação de recuperação. Produtos ligam ao produtor e perfis aos respetivos produtos; categorias do perfil abrem o catálogo com produtor/categoria combinados. Browser Back/Forward preserva a seleção do catálogo em query parameters.

Foco visível, controlos principais de pelo menos 44 px, headings com uma única h1, imagens com dimensões/proporções reservadas, descrição textual de stock/épocas e movimento reduzido reutilizam o sistema existente. O parcial [SCSS de detalhes](../../apps/web/src/styles/_details.scss) mantém os tokens e os breakpoints 768/1024/1280 px; os estilos das antigas páginas de detalhe foram removidos por já não serem usados.

### Localização, fotografia e limites

`ProducerMap` é um desenho vetorial original, explicitamente ilustrativo, com localidade/região em texto e alternativa acessível. Não é um mapa geográfico nem um marcador de uma exploração real; não se inventam coordenadas, moradas, distâncias ou geolocalização do visitante. A ligação externa pesquisa apenas a localidade pública no OpenStreetMap, com indicação de novo separador; nenhum serviço externo carrega automaticamente. A falta de localidade tem recuperação textual. Não há serviços pagos, chaves ou biblioteca de mapas. O mapa verificado previsto na Fase 0 permanece para a integração futura.

A capa e a imagem representativa dos produtores reutilizam fotografias existentes; não são retratos de pessoas reais associadas aos perfis. Foram acrescentadas duas fotografias genuinamente distintas às galerias de tomate e pera, cerca de 77 KiB no total, com [créditos, fontes e licença](../../apps/web/public/images/details/credits.md). São ilustrativas e não comprovam variedade, origem ou produção biológica. Os restantes produtos mantêm uma imagem; os placeholders continuam identificados. Sem novas dependências, backend, autenticação, carrinho, compras, pagamento, sockets, Cloud ou início da Fase 2.3.

### Verificação da Fase 2.2

Os [testes de detalhe](../../apps/web/tests/details.spec.ts) cobrem os quinze cenários pedidos, mais imagem falhada, imagem única, stock esgotado, diretório, filtragem desde o perfil, avaliações ausentes, mapa ilustrativo, carregamento real e regressões de navegação. Os [testes do modelo](../../apps/web/tests/details-model.spec.ts) validam integridade das relações, imagens distintas, prioridade determinística, imutabilidade e médias derivadas. As suites existentes do catálogo e homepage continuam a ser executadas.

Validação responsiva nas larguras 320/430/768/1024/1280/1440 px. A verificação usa Chrome, sem declaração de certificação formal de acessibilidade ou cobertura de Safari/Firefox. Durante a implementação, as alterações da Fase 2.2 permaneceram locais; posteriormente, foram publicadas em cinco commits autorizados na feature branch, sem alterar `main`.

Execução final em 15 de outubro de 2026: 75 testes aprovados, incluindo as regressões das Fases 1 e 2.1; TypeScript, ESLint, Prettier e build de produção sem erros. Inspeção visual efetiva de produto, perfil e diretório em desktop e telemóvel, incluindo história, localização e avaliações. A galeria usa proporção 4:3 em ecrãs pequenos e uma fotografia maior em desktop; o preço mantém o tamanho de `PriceDisplay` grande. Os nove documentos da Fase 0 conservam os SHA-256 iniciais. As 56 ligações Markdown locais verificadas resolvem corretamente.

## Fase 2.3 — pressupostos do carrinho antes da implementação

Âmbito autorizado: carrinho demonstrativo público, em React Context, com produtos de vários produtores e persistência local. Não representa autenticação de comprador, encomenda, reserva de stock ou decisão final sobre checkout. O pedido desta fase permite explicitamente vários produtores; Q02 continua a condicionar a futura divisão/criação de encomendas. Nenhum documento da Fase 0 é alterado.

Para concretizar Q03 nesta demonstração, a quantidade é um inteiro de unidades comerciais: `2` de um produto em kg representa 2 unidades de 1 kg, e `2` de um frasco de 500 g representa dois frascos. Não se aceita peso fracionário. A edição direta só é aplicada com um valor válido, ao sair do campo ou premir Enter; valores inválidos mantêm-se visíveis com erro e não alteram a quantidade guardada. Introduzir explicitamente `0` retira a linha, com indicação junto ao campo. O botão de diminuir fica desativado em 1, evitando remover por acidente. Adições repetidas somam quantidades na mesma linha, sem ultrapassar o stock; uma tentativa acima do limite é recusada, sem ajustar silenciosamente a escolha.

Preços e totais usam inteiros em cêntimos EUR, conforme D05. O total demonstrativo é igual ao subtotal, sem portes, impostos adicionais, descontos ou taxas inventadas. O preço/unit/produtor do snapshot guardado é revisto contra o catálogo atual ao restaurar ou operar; mudanças são comunicadas. Não se trata do snapshot imutável de uma encomenda concluída. A futura API terá de validar preços, unidades, disponibilidade e stock e solicitar confirmação de preços alterados antes de qualquer encomenda (Q06/D08).

Persistência versionada contém apenas IDs, quantidade, preço unitário demonstrativo, unidade e data; não inclui catálogo completo ou dados pessoais. JSON/esquema inválidos recuperam para um carrinho vazio; linhas inválidas ou produtos removidos/esgotados são descartados com aviso, quantidades acima de stock são reduzidas com aviso e duplicados são reunidos. Falhas de localStorage mantêm o carrinho em memória e explicam a limitação. A recuperação de stock verifica o catálogo ao restaurar e nas operações; não existe observação remota de stock nem sincronização entre dispositivos/separadores nesta fase.

### Arquitetura e API do Context

[CartProvider](../../apps/web/src/features/cart/CartProvider.tsx) envolve a aplicação dentro de `BrowserRouter`, preservando o estado ao navegar. [CartContext](../../apps/web/src/features/cart/CartContext.ts) e [useCart](../../apps/web/src/features/cart/useCart.ts) expõem `addItem`, `removeItem`, `updateQuantity`, `clearCart`, `itemCount`, `producerGroups`, `subtotalCents` e `totalCents`; `subtotal`/`total` são aliases também em cêntimos. O [reducer e os cálculos](../../apps/web/src/features/cart/model.ts) são funções puras, com operações sequenciais que evitam perder adições rápidas. `useMemo` reúne grupos/totais; `useEffect` sincroniza armazenamento e reconcilia mudanças da referência do catálogo, sem API remota.

[Tipos do carrinho](../../apps/web/src/features/cart/types.ts): `CartItem` contém `productId`, `producerId`, `quantity`, `unitPriceSnapshotCents` e `unit`; `CartState` contém linhas e `updatedAt` ISO. Preços, imagens, nomes e localidades apresentados são resolvidos a partir do catálogo existente. Repetir uma adição preserva uma linha por produto. Quantidades, stock e preços devem ser inteiros seguros; overflow de valores monetários é recusado antes de guardar o estado. Subtotais de produto = preço × quantidade; subtotais de produtor somam as suas linhas; subtotal/total global somam os grupos, sem aritmética decimal ou taxas inventadas.

### Persistência e recuperação

[A camada de armazenamento](../../apps/web/src/features/cart/storage.ts) usa a chave `docampo.cart.v1` e schema `{ version: 1, items, updatedAt }`. Lê JSON como dados desconhecidos, valida versão/estrutura/data e cada linha, e limita a recuperação a 100 registos antes de reunir duplicados. Nunca aceita um preço ou produtor guardado como autoridade. A reconciliação normaliza metadados do catálogo, remove IDs antigos/produtos indisponíveis e reduz quantidades acima do stock, com mensagens. Mantém as linhas válidas quando só algumas estão inválidas; JSON ou schema global inválido recupera vazio. O estado reconciliado é guardado novamente, incluindo a cesta vazia depois de limpar.

Acesso e escrita de localStorage têm tratamento de falha. `CartNotices` comunica a limitação em memória e encaminha para os ajustes visíveis em `/carrinho`; não se instala serviço alternativo nem se recolhem dados pessoais. O carrinho não sincroniza separadores/dispositivos. No futuro, enviar IDs/quantidades à API, validar novamente preços/stock/unidades e confirmar alterações antes de checkout; snapshots de encomenda e transações continuam fora desta fase.

### Apresentação, navegação e acessibilidade

[CartPage](../../apps/web/src/pages/CartPage.tsx) apresenta introdução editorial, grupos por produtor, imagens, preço/unidade, quantidades, subtotal de produto/produtor, contagens e resumo global. `CartLineItem`, `QuantityControl`, `AddToCart` e `CartNotices` usam o sistema visual e componentes existentes. Quantidades de kg/embalagem continuam explicitadas no produto. O resumo usa uma coluna própria desde 1024 px; abaixo disso segue os produtos. A cesta vazia reutiliza `EmptyState` com «A tua cesta ainda está à espera dos primeiros sabores.» e «Explorar produtos».

`AddToCart` usa `Button` e respeita o stock restante na cesta, sem impedir ligações ao detalhe/produtor. No detalhe existe seleção da quantidade a adicionar; nos cartões a adição é de uma unidade. Produtos esgotados e limites alcançados têm botão desativado e indicação textual. O header apresenta ligação «Carrinho, N unidades» e badge; o menu móvel também oferece acesso. Em ecrãs pequenos, o acesso ao carrinho permanece visível e a pesquisa do header dá lugar à pesquisa dentro do catálogo, evitando overflow.

Campos usam labels, `inputMode`, mensagens ligadas por `aria-describedby`, `aria-invalid` e erros anunciados. Os botões aumentar/diminuir/retirar identificam o produto; a quantidade positiva mínima não é removida pelo botão diminuir. A edição mantém o rascunho até confirmação. Remover/limpar devolve foco ao título do carrinho. As operações têm feedback textual e uma região viva global, incluindo ações repetidas. Imagens reutilizam `MarketImage` com fallback; não são acrescentados novos assets. Foco visível, botões de pelo menos 44 px e movimento reduzido são preservados. O [parcial SCSS](../../apps/web/src/styles/_cart.scss) usa tokens e breakpoints 768/1024/1280 px.

### Verificação e limites da Fase 2.3

[Testes do modelo](../../apps/web/tests/cart-model.spec.ts) verificam quantidades, operações imutáveis, agrupamento, cálculos, reconciliação, dados inválidos, overflow e falhas de armazenamento. [Testes de browser](../../apps/web/tests/cart.spec.ts) cobrem os vinte cenários pedidos, incluindo adição por catálogo/detalhe, várias origens, edição direta/zero, remoção/limpeza, reload, versões inválidas, IDs antigos, stock, metadados adulterados, falhas de leitura/escrita, histórico, badge e teclado móvel. A suite completa inclui as regressões anteriores.

Execução final em 15 de outubro de 2026: 109 testes aprovados, sem retries — 34 novos e 75 regressões anteriores. TypeScript, ESLint, Prettier e build de produção concluíram sem erros. Verificações responsivas a 320/430/768/1024/1280/1440 px, com inspeção visual efetiva em Chrome de carrinho vazio/preenchido, produtos e resumo em desktop, tablet e telemóvel. A introdução móvel foi compactada após essa inspeção. Não há validação formal em Safari/Firefox ou leitores de ecrã. Os nove documentos da Fase 0 mantêm os SHA-256 iniciais e as 56 ligações Markdown locais verificadas resolvem corretamente.

Sem novas dependências, autenticação, backend, MongoDB, checkout, encomendas, pagamentos, sockets, publicação Cloud ou início da Fase 2.4 durante esse trabalho. A validação do cliente é demonstrativa e não garante disponibilidade comercial. Durante a implementação, as alterações da Fase 2.3 permaneceram locais; posteriormente, foram publicadas em cinco commits autorizados na feature branch, sem alterar `main`.

## Fase 2.4.1 — análise e pressupostos antes da implementação

Fontes revistas: README, requisitos funcionais/não funcionais, casos de utilização, visão global, decisões, modelo de dados, plano de implementação e este sistema visual. Papéis exatos: `comprador`, `produtor`, `administrador`. Visitante corresponde à ausência de sessão; não é uma conta/papel persistido. Não se atribuem ao produtor as capacidades do comprador nem ao administrador poderes de licitar/alterar encomendas alheias. Autorregisto administrativo não existe (RF-AUT-01, UC-02, D03).

| Requisito da Fase 0                   | Interface/componente previsto nesta fase                                                                               | Limite                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| RF-AUT-01; UC-02; `users`/`producers` | Registo comprador/produtor; nome, email, palavra-passe/confirmação; nome público e localidade adicionais para produtor | Só validação local; nenhuma conta ou candidatura criada                           |
| RF-AUT-02; UC-02; D04/Q13             | Login, `AuthContext`/`AuthProvider`/`useAuth` e seletor de demonstração separado                                       | Credenciais nunca iniciam sessão; apenas escolha explícita do papel demonstrativo |
| RF-AUT-03; UC-02; D03                 | Guarda de navegação, falta de sessão, papel incompatível e destinos internos conhecidos                                | Não constitui autorização nem fronteira de segurança                              |
| RF-AUT-04; UC-03; Q04                 | Nota de aprovação no registo produtor e estrutura da candidatura/moderação administrativa                              | Sem aprovação automática, decisões ou candidaturas reais                          |
| RF-ENC-03; RF-AVA-01; RF-LEI-02/03    | Navegação do comprador: encomendas, avaliações e licitações                                                            | Placeholders; a cesta pública existente mantém-se                                 |
| RF-PRO-01–04; RF-ENC-04; RF-LEI-01    | Navegação do produtor: produtos, perfil, encomendas, leilões e indicadores/stock; candidatura                          | Placeholders, sem CRUD, métricas ou estado de aprovação inventados                |
| RF-ADM-01/02; RF-AVA-02               | Navegação administrativa: utilizadores, encomendas, leilões, moderação e serviços; candidaturas                        | Sem dados privados, operações ou saúde de serviços simulada                       |
| RNF-RES-01/02; RNF-ACE-01; RNF-MAN-01 | Layout editorial privado, formulários reutilizáveis, feedback/foco e navegação móvel                                   | Protótipo responsivo e testes de interface; sem certificação formal               |
| RNF-SEG-01–04                         | Informação explícita sobre ausência de autenticação real                                                               | JWT, bcrypt, autorização e persistência no servidor continuam por implementar     |

Pressupostos provisórios: um papel de demonstração de cada vez (Q01 continua em aberto para contas reais); sessão em memória, terminada ao recarregar/sair (D04/Q13), sem tokens, credenciais ou identidade fictícia persistidos. A cesta mantém o seu Provider e armazenamento independentes. Não há expiração fictícia, «lembrar-me» ou sessão autenticada derivada de email/password.

O modelo da Fase 0 não define política de palavra-passe: para demonstrar o registo, mínimo de oito caracteres, sem regras de composição; login exige apenas presença. A confirmação tem de coincidir. Esta regra é provisória e não é apresentada como requisito académico/segurança implementada. Nome público e localidade do produtor seguem o schema proposto; descrição é opcional e fica para o perfil futuro. Não se pedem NIF, contactos, moradas ou aceitação legal sem fonte.

Q04 mantém-se por validar: o registo explica a necessidade de decisão administrativa, sem afirmar que uma candidatura foi enviada nem atribuir aprovação. A demonstração de produtor permite conhecer a estrutura futura, sem executar operações. A página de candidatura não inventa um estado para uma pessoa real.

A recuperação de palavra-passe não é obrigação identificada no enunciado (último parágrafo dos requisitos funcionais). Inclui-se apenas uma interface informativa/validação de email em `/recuperar-palavra-passe`, por pedido explícito desta fase, sem email enviado, token, conta consultada ou reposição. Não se altera o âmbito obrigatório da Fase 0.

Os formulários validam dados fictícios localmente, mostram o estado de verificação e a indisponibilidade da operação; não fazem pedidos. Valores de palavras-passe são retirados dos campos após uma submissão válida. O carregamento representa apenas a verificação/apresentação local, sem atraso de rede simulado. Redirecionamentos aceitam apenas percursos conhecidos do papel escolhido, sem URLs externos. Um teste histórico que exigia zero inputs no registo será atualizado para o comportamento autorizado, conservando a verificação de indisponibilidade do registo real; as restantes regressões mantêm-se.

### Arquitetura implementada da Fase 2.4.1

[AuthProvider](../../apps/web/src/features/auth/AuthProvider.tsx) envolve o `CartProvider` dentro de `BrowserRouter`, sem desmontar a cesta ao mudar de papel. [AuthContext](../../apps/web/src/features/auth/AuthContext.ts) e [useAuth](../../apps/web/src/features/auth/useAuth.ts) expõem `session`, `startDemonstration(role)` e `endDemonstration()`. A união [DemoSession/Role](../../apps/web/src/features/auth/types.ts) distingue visitante e demonstração com um papel válido; o Provider verifica o valor também em runtime. Não representa um utilizador autenticado, aprovação ou DTO da futura API.

[DemoAccess](../../apps/web/src/features/auth/DemoAccess.tsx) apresenta três escolhas fora do formulário de login e anuncia a sessão atual. [A configuração tipada](../../apps/web/src/features/private-area/navigation.ts) reúne secções, descrições, requisito de origem e slugs. `demoDestination` aceita apenas correspondências exatas conhecidas do papel; ignora destinos externos, caminhos manipulados ou de outro papel. `roleHome` centraliza o destino inicial. Não são atribuídas operações de outros papéis por herança.

[DemoRoute](../../apps/web/src/features/private-area/DemoRoute.tsx) verifica somente navegação demonstrativa. Sem sessão redireciona com substituição para `/entrar?destino=...`; se compatível, a escolha de papel retoma uma secção conhecida; caso contrário, abre a sua visão geral. Um papel incompatível vê a mensagem e ações de recuperação sem mudar de sessão. `/area` encaminha para o papel atual; secções desconhecidas e caminhos aninhados inválidos têm recuperação dentro do layout. As rotas públicas e os seus estados de 404 mantêm-se.

Rotas: `/entrar`, `/registo` (comprador), `/registo?perfil=produtor`, `/recuperar-palavra-passe`, `/area`, `/area/comprador`, `/area/produtor` e `/area/administrador`. Cada base de papel tem placeholders de `/:section`, limitados aos slugs da configuração. Não se cria um endpoint ou um estado HTTP 401/403 fictício na SPA.

[PrivateLayout](../../apps/web/src/layouts/PrivateLayout.tsx) oferece marca, papel, navegação numerada, regresso ao catálogo, saída e footer simples. O desktop usa navegação lateral desde 1024 px; abaixo disso existe um menu expansível no fluxo normal, sem comportamento modal. Escape fecha e devolve foco ao botão; navegar fecha e foca o main. A saída agrupa a mudança de sessão e rota numa transição React para evitar que a guarda substitua o destino. Header/menu públicos passam a apontar para a área do papel durante a demonstração.

As [landing pages](../../apps/web/src/pages/private/PrivatePages.tsx) apresentam boas-vindas, papel, estatuto de protótipo e ligações contextualizadas. Não existem métricas, encomendas, decisões, leilões privados, saúde de serviços ou estados pessoais simulados. A candidatura do produtor esclarece que não existe candidatura associada à demonstração. As operações das Fases 2.4.2–2.4.4 não foram iniciadas.

### Formulários, apresentação e acessibilidade

[AuthPageFrame](../../apps/web/src/pages/auth/AuthPageFrame.tsx) partilha a composição editorial entre [login](../../apps/web/src/pages/auth/LoginPage.tsx), [registo](../../apps/web/src/pages/auth/RegistrationPage.tsx) e [recuperação](../../apps/web/src/pages/auth/RecoveryPage.tsx). Reutiliza fotografia local existente, `Container`, `Button`, `FormField` e `MarketImage`, sem assets/dependências novos. A fotografia surge no desktop; o telemóvel prioriza texto e campos. Estilos em [auth](../../apps/web/src/styles/_auth.scss) e [private-area](../../apps/web/src/styles/_private-area.scss), com tokens e breakpoints existentes; sem alterações à paleta, tipografia ou componentes públicos de base.

[validateAuthForm](../../apps/web/src/features/auth/validation.ts) concentra presença, email, mínimo provisório e confirmação; diferencia recuperação/login/registo e campos do produtor. Campos sensíveis permanecem apenas nos inputs e em `FormData` transitório durante a verificação, nunca no Context, logs ou storage. [usePrototypeForm](../../apps/web/src/features/auth/usePrototypeForm.ts) bloqueia submissões duplicadas por ref/disabled, valida localmente, limpa palavras-passe válidas e permite pintar o estado de verificação através de dois frames, sem timeout para simular rede. Cancela os frames ao desmontar. A conclusão comunica sempre que a operação real está indisponível.

[PasswordField](../../apps/web/src/features/auth/PasswordField.tsx) usa botão nativo de mostrar/ocultar com nome contextual, `aria-controls` e `aria-pressed`. Confirmação tem controlo independente. Labels, `required`, autocomplete adequado e `aria-describedby` reutilizam `FormField`. [FormFeedback](../../apps/web/src/features/auth/FormFeedback.tsx) apresenta resumo de erros com `role=alert` e foco programático; estado de verificação/indisponibilidade usa `role=status`. Uma h1, headings hierárquicos, foco visível, ligação de salto e anúncio de navegação são mantidos. Os campos têm 16 px e altura mínima de 50 px; ações principais têm pelo menos 44 px. Movimento reduzido reutiliza o suporte global.

### Segurança, integração futura e verificação

Não existe autenticação/autorização real. Papéis de cliente não são confiáveis; escolher administrador só altera a apresentação de placeholders. Os formulários não consultam contas, detetam emails duplicados, criam candidaturas ou enviam recuperação. Nenhum password/JWT/hash é guardado ou criado. A sessão demonstrativa perde-se no reload e não sincroniza separadores. O carrinho local conserva o comportamento da Fase 2.3.

Na futura integração, separar identidade autenticada deste estado demonstrativo; obter papel e aprovação do servidor; validar credenciais, expiração, propriedade e decisões administrativas em cada operação protegida. D03/D04 e Q01/Q04/Q13 continuam a orientar o contrato a acordar. Esta interface não demonstra cumprimento de bcrypt, JWT, HTTPS ou RBAC no servidor.

[Testes do modelo](../../apps/web/tests/auth-model.spec.ts) cobrem papéis, configuração de responsabilidades, destinos permitidos e validação partilhada. [Testes de browser](../../apps/web/tests/auth.spec.ts) cobrem os dezoito cenários pedidos e casos adicionais de campos de produtor, loading, credenciais sem sessão/persistência/rede, troca/reload, recuperação e redirecionamentos manipulados. O cenário existente em [market.spec.ts](../../apps/web/tests/market.spec.ts) substitui apenas a expectativa desatualizada de zero inputs no registo por verificações do formulário, indisponibilidade real e ausência de autorregisto administrativo; não remove a regressão de catálogo, leilão, sistema visual ou 404.

Verificação final em 15 de outubro de 2026: **141 testes aprovados**, sem retries; 32 novos (5 de modelo e 27 de browser) e 109 cenários anteriores, incluindo a adaptação explícita do registo. TypeScript, ESLint, Prettier e build de produção sem erros. A seleção comprador/produtor recebeu estado visual imediato, sincronizado com o URL/histórico, após o teste completo detetar a transição atrasada; voltar/avançar também é verificado. A saída foi verificada para os três papéis após agrupar a transição de sessão/rota.

Verificação de formulários (entrada, comprador, produtor, recuperação) e três áreas, incluindo menus móveis, nas larguras 320/430/768/1024/1280/1440 px, sem scroll horizontal nem erros JavaScript nos percursos. Inspeção visual efetiva de capturas Chrome de desktop (1440 px) e telemóvel (390 px), incluindo entrada, candidatura, recuperação, áreas de comprador/produtor/administrador e menu privado. Não se declara certificação WCAG nem validação formal em Safari/Firefox ou leitores de ecrã.

Os nove documentos originais da Fase 0 conservam os SHA-256 iniciais; as 79 ligações Markdown locais do README e deste documento resolvem corretamente. Sem novas dependências, alterações à API/shared ou ao modelo/testes do carrinho. Capturas/resultados gerados permanecem temporários/ignorados. As 30 alterações de ficheiros (21 novos e 9 modificados) desta fase permanecem locais na feature branch existente, sem staging, commit, push, merge ou início da Fase 2.4.2.
