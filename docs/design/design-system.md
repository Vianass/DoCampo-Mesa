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

Os nove documentos originais da Fase 0 conservam os SHA-256 iniciais; as 79 ligações Markdown locais do README e deste documento resolviam corretamente no fecho da Fase 2.4.1. Sem novas dependências, alterações à API/shared ou ao modelo/testes do carrinho. Capturas/resultados gerados permanecem temporários/ignorados. As 30 alterações de ficheiros (21 novos e 9 modificados) permaneceram locais durante a implementação; posteriormente, foram publicadas em quatro commits autorizados em `feat/project-setup-design-system`, sem merge para `main`. A Fase 2.4.2 só foi iniciada com autorização posterior.

## Fase 2.4.2 — análise e pressupostos antes da implementação

Revistos os nove documentos da Fase 0, README, sistema visual e estrutura privada existente. RF-ENC-03/UC-06 sustentam lista/detalhe e os estados `pendente`, `confirmada`, `pronta`, `entregue`; RF-ENC-04 reserva as mudanças ao produtor. RF-AVA-01/UC-07 exigem entrega concluída para avaliar. RF-LEI-02/03/05, UC-09/10 e os invariantes de `auction-consistency.md` orientam os snapshots de participação. D05 exige preservar os dados históricos das linhas; D03 e RNF-SEG-04 delimitam consultas próprias, sem confiar no cliente. RNF-RES-01/02, RNF-ACE-01 e RNF-MAN-01 orientam apresentação, estado e navegação.

| Requisito                          | Concretização prevista                                                                                 | Limite desta fase                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| RF-ENC-03; UC-06; D05              | Modelos tipados, seletores, listagem filtrável/ordenável e detalhe com linhas por produtor e histórico | Só encomendas fictícias; sem criar, cancelar, pagar ou alterar estado              |
| RF-AVA-01; UC-07; Q10              | Lista de avaliações a produtores; formulário local só para encomendas entregues elegíveis              | Sem compra verificada, publicação pública ou avaliação de produtos nesta subfase   |
| RF-LEI-02/03/05; UC-09/10; D06/D07 | Participações e detalhe de leilão demonstrativo apenas de leitura                                      | Sem comandos de licitação, concorrência, sockets, timers ou conversão em encomenda |
| RF-ENC-01; RNF-MAN-01              | Resumo e ligação à cesta via `useCart`                                                                 | Sem cópia de estado, checkout ou mudança de persistência                           |
| RF-AUT-03; D03                     | Rotas do comprador sob a guarda demonstrativa existente                                                | Sem autorização real; produtor/administrador não recebem as páginas do comprador   |

Pressupostos registados antes do código: o cenário usa um comprador fictício estável, sem o confundir com uma conta autenticada. Os seletores limitam os dados a esse identificador. Cada encomenda demonstrativa tem um produtor, conforme o schema proposto e a recomendação de Q02; o detalhe agrupa as linhas por produtor. Não se fecha Q02 nem se criam checkouts. Quantidades são unidades comerciais inteiras, como na Fase 2.3. Preços/nomes/unidades são snapshots; total é soma das linhas em cêntimos, sem portes ou taxas. Histórico é apenas ilustrativo e linear; Q05 continua por validar, sem ações de transição.

Q10 permanece provisória: avaliações a produtor, uma por encomenda/autor/alvo, classificação inteira de 1–5, comentário opcional limitado a 1000 caracteres nesta demonstração. Só uma encomenda própria entregue sem avaliação desse alvo permite acrescentar uma avaliação local. As duas avaliações iniciais pertencem a encomendas fictícias entregues; nunca se anuncia compra verificada. Novas avaliações ficam em memória durante a sessão demonstrativa, incluindo a navegação pública, e são repostas ao sair, mudar de papel, recarregar ou mudar de cenário. Não se alteram reviews públicas nem médias dos perfis.

As licitações mostram um snapshot fixo de 15 de outubro de 2026 às 09:00 UTC. Valores atuais e resultados obedecem à sequência/base/incremento do exemplo; «mais elevada»/«ultrapassada» são comparações do snapshot, e vitória só surge com leilão terminado e resultado coerente. Não se infere vencedor de um leilão ativo nem se atualiza estado pelo relógio do browser. Os lotes demonstrativos têm detalhe privado de leitura em `/area/comprador/licitacoes/:id`; o leilão público existente mantém-se independente, sem lhe atribuir resultados incompatíveis.

Uma fonte local assíncrona, sem HTTP nem temporizadores artificiais, alimentará estados tipados de carregamento, erro e dados. Um seletor discreto em «Sobre estes dados» permitirá explorar atividade ilustrativa, ausência de atividade e indisponibilidade demonstrativa, mantendo explícita a natureza dos cenários. Filtros de encomendas ficam no URL para histórico; valores desconhecidos recuperam para opções seguras. Identificadores inválidos terão mensagem e ação de regresso. Sem novas dependências, backend ou início da subfase seguinte.

### Arquitetura implementada da Fase 2.4.2

A branch local `feat/buyer-dashboard` foi criada, por autorização explícita, a partir do estado limpo de `feat/project-setup-design-system`, no commit `12a81f947c2a6f341d8beee1db230934ac1113c7`. A autorização inicial limitava-se à branch e implementação local. Após revisão visual, foram criados e publicados quatro commits temáticos autorizados, sem merge ou PR. A Fase 2.4.3 só começou após autorização posterior.

| Responsabilidade                                      | Implementação                                                                                                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modelos próprios e estados assíncronos                | [types.ts](../../apps/web/src/features/buyer/types.ts)                                                                                                                                             |
| Exemplos separados da apresentação                    | [data/buyer.ts](../../apps/web/src/data/buyer.ts)                                                                                                                                                  |
| Cálculos, consulta própria, elegibilidade e validação | [selectors.ts](../../apps/web/src/features/buyer/selectors.ts)                                                                                                                                     |
| Fronteira de leitura substituível                     | [source.ts](../../apps/web/src/features/buyer/source.ts)                                                                                                                                           |
| Atividade e avaliações transitórias                   | [BuyerProvider](../../apps/web/src/features/buyer/BuyerProvider.tsx), [BuyerContext](../../apps/web/src/features/buyer/BuyerContext.ts), [useBuyer](../../apps/web/src/features/buyer/useBuyer.ts) |
| Composição, loading e recuperação                     | [BuyerPageFrame](../../apps/web/src/features/buyer/BuyerPageFrame.tsx)                                                                                                                             |
| Encomenda e estado reutilizáveis                      | [OrderCard / OrderStatusBadge](../../apps/web/src/features/buyer/OrderCard.tsx)                                                                                                                    |
| Participações e resumo da cesta                       | [BuyerBidList](../../apps/web/src/features/buyer/BuyerBidList.tsx), [BuyerCartSummary](../../apps/web/src/features/buyer/BuyerCartSummary.tsx)                                                     |
| Avaliação local elegível                              | [ProducerReviewForm](../../apps/web/src/features/buyer/ProducerReviewForm.tsx)                                                                                                                     |

`BuyerOrder` contém referência, comprador, data, estado, linhas e histórico. `BuyerOrderItem` preserva produto, produtor, quantidade, unidade e preço unitário; `orderTotal` e `lineSubtotal` verificam inteiros seguros e calculam exclusivamente a partir desses snapshots. `orderGroups` agrupa linhas sem alterar a coleção. O exemplo DCM-261010 conserva tomate a 2,50 €/kg, apesar de o catálogo atual indicar 2,80 €/kg; duas unidades e cenoura a 1,45 € totalizam 6,45 €.

`BuyerReview` acrescenta autor, encomenda e alvo produtor ao modelo visual existente. `BuyerBid` separa a oferta aceite do snapshot de `BuyerAuctionSnapshot`, com base, incremento, sequência, oferta atual e eventual resultado. `BuyerDashboard` é derivado por `dashboardSummary`, não mantido como contadores paralelos. `selectOrders`, `selectOrder`, `selectReviews` e `selectBids` limitam consultas ao comprador demonstrativo; ordenam cópias e nunca modificam os mocks.

O conjunto inicial tem seis encomendas, três ainda não entregues, duas avaliações e quatro participações, duas em leilões ativos. `dashboardSummary` apresenta 6/3/2/2, a encomenda mais recente e as duas participações ativas. Após uma avaliação local válida, a contagem deriva automaticamente do novo conjunto. Os resultados terminados incluem uma vitória e uma participação sem vitória; só existe vitória quando o leilão terminou e o resultado identifica a oferta desse comprador.

`BuyerDataSource.load(scenario): Promise<BuyerDataset>` fornece a fronteira de leitura. `BuyerResource` distingue `loading`, `ready` e `error`; os cenários são `normal`, `vazio` e `erro`. A fonte local devolve ou rejeita uma Promise sem rede, relógio de leilões ou atraso artificial. O seletor em «Sobre estes dados» usa `cenario` no URL; parâmetros desconhecidos recuperam para o cenário normal. O erro tem nova tentativa e regresso ao conjunto ilustrativo. A tentativa no cenário de erro continua a demonstrar indisponibilidade; a segunda ação recupera os dados.

`BuyerProvider` fica dentro de `AuthProvider` e `CartProvider`, envolvendo as rotas públicas e privadas para preservar avaliações locais ao visitar o mercado. Um reducer aplica criação imutável de avaliações, voltando a validar elegibilidade contra os dados mais recentes antes de acrescentar a entrada. A fonte é injetável; o efeito ignora conclusões de pedidos já desmontados/substituídos. Sair, mudar de papel, recarregar ou alterar o cenário repõe a atividade inicial; a cesta conserva o seu Context e storage independentes. Não é criado armazenamento de encomendas, avaliações ou licitações.

### Páginas, navegação e apresentação

| Percurso                         | Página                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/area/comprador`                | [BuyerDashboardPage](../../apps/web/src/pages/private/buyer/BuyerDashboardPage.tsx): indicadores, encomenda recente, participações, cesta e descoberta |
| `/area/comprador/encomendas`     | [BuyerOrdersPage](../../apps/web/src/pages/private/buyer/BuyerOrdersPage.tsx): lista, estado e ordem por data                                          |
| `/area/comprador/encomendas/:id` | [BuyerOrderDetailPage](../../apps/web/src/pages/private/buyer/BuyerOrderDetailPage.tsx): linhas, grupos, total e histórico                             |
| `/area/comprador/avaliacoes`     | [BuyerReviewsPage](../../apps/web/src/pages/private/buyer/BuyerReviewsPage.tsx): avaliações e formulário elegível                                      |
| `/area/comprador/licitacoes`     | [BuyerBidsPage](../../apps/web/src/pages/private/buyer/BuyerBidsPage.tsx): acompanhamento estático                                                     |
| `/area/comprador/licitacoes/:id` | [BuyerAuctionPage](../../apps/web/src/pages/private/buyer/BuyerAuctionPage.tsx): lote, regras monetárias e participação própria                        |

As páginas são lazy e usam `Suspense` com `BuyerLoading`; `BuyerArea` inclui uma fronteira de erro de renderização/módulo e recuperação ao navegar. O frame comum apresenta o estado da fonte antes do conteúdo, incluindo nos detalhes. Listas vazias têm ações contextualizadas; identificadores inexistentes não expõem dados de outros compradores e têm regresso à lista. O dashboard vazio conserva indicadores zero e o resumo da cesta, que é independente do cenário.

Os filtros `estado` e `ordem` das encomendas são normalizados por `parseOrderOptions`. Seleções criam entradas no histórico; voltar/avançar restaura o estado. `demoDestination` passa a aceitar também detalhes internos do comprador com identificadores restritos; continuam recusados URLs externos, caminhos manipulados ou de outro papel. A guarda demonstrativa existente protege todas as páginas, mantendo produtor/administrador nos seus placeholders sem lhes atribuir capacidades de comprador.

`ProducerReviewForm` reutiliza `FormField`, controles nativos e feedback com foco no erro. `eligibleReviewOrders` só oferece entregas próprias sem avaliação prévia do produtor nessa encomenda. No cenário inicial, apenas DCM-261006/Forno da Aldeia está disponível. `validateReview` e `createLocalReview` aplicam classificação inteira de 1–5, comentário opcional até 1000 caracteres e unicidade provisória; comentário vazio apresenta «Sem comentário.». A criação é anunciada como local e não publicada. `ReviewCard` e ligações aos perfis existentes são reutilizados, sem atualizar avaliações ou médias públicas.

`BuyerCartSummary` usa exclusivamente `useCart`: quantidade e subtotal atuais, acesso à cesta e continuação no catálogo. A navegação entre áreas, a saída da demonstração e a criação de uma avaliação não removem produtos nem modificam preços/stock/persistência do carrinho. O detalhe de leilão é apenas leitura; não contém comandos de oferta, contagem decrescente, eventos aleatórios ou transições automáticas.

O [Sass do comprador](../../apps/web/src/styles/_buyer.scss) reutiliza tokens, tipografia, cores e breakpoints existentes. Composição editorial com indicadores discretos, separadores de lista, fotografias já disponíveis e resumo verde da cesta; sem dependências/assets novos ou mudança do sistema visual global. O dashboard só coloca encomenda/cesta lado a lado quando há espaço. Linhas de produtos adaptam imagem/texto/subtotal; filtros e ações reorganizam-se no telemóvel.

Cada página conserva uma h1, labels explícitas, navegação semântica, foco visível e estados textuais além da cor. Filtros/formulário têm campos de 16 px e ações principais de pelo menos 44 px. O menu privado mantém Escape, devolução de foco e foco no conteúdo ao navegar. O suporte global de movimento reduzido é reutilizado. Após inspeção de Chrome em telemóvel, as duas ações de recuperação foram separadas verticalmente com espaçamento próprio; no desktop ficam em linha quando possível.

### Limites e futura API

A sessão e a consulta própria no cliente não constituem autenticação/autorização. O servidor terá de obter a identidade e validar papel, propriedade, aprovação, entrega e unicidade em cada leitura/escrita. `DEMO_BUYER_ID` é apenas um identificador de cenário. Os preços históricos e resultados não representam transações verificadas. Q02, Q05 e Q10 continuam em aberto para decisões comerciais definitivas.

Uma implementação futura poderá substituir `BuyerDataSource` por um adaptador HTTP, validar DTOs na fronteira e mapear os dados para estes modelos de apresentação. Não se fixam endpoints nem contratos não acordados. A criação de avaliação exigirá um comando separado com validação e persistência no servidor; não se deve reutilizar o reducer local como garantia de elegibilidade. Pedidos canceláveis, erros de autorização/rede e atualização de dados terão de ser ligados aos estados já presentes.

As garantias D06/D07 e `auction-consistency.md` pertencem ao servidor: aceitação atómica, sequência, idempotência e fecho/adjudicação autoritativos continuam por implementar. Este snapshot estático não demonstra concorrência, reserva de stock, notificações ou criação de encomendas. Sem checkout, pagamentos, mudança de estado de encomenda, backend, MongoDB, sockets ou serviços Azure. API/shared, dependências e carrinho não foram alterados.

### Testes e validação da Fase 2.4.2

[buyer-model.spec.ts](../../apps/web/tests/buyer-model.spec.ts) acrescenta nove cenários de funções puras: indicadores e imutabilidade; filtros/ordenação; cálculos históricos e inteiros seguros; isolamento por comprador; coerência das relações/históricos; elegibilidade e duplicação de avaliações; base/incremento/sequência/prazos/resultados dos leilões; fonte assíncrona/vazio/erro; destinos internos seguros.

[buyer.spec.ts](../../apps/web/tests/buyer.spec.ts) acrescenta 26 cenários de browser: dashboard/navegação; encomendas/filtros/histórico/detalhe/totais; IDs inválidos; avaliações/classificação/perfis/criação local/reset; quatro situações de participação e detalhe apenas de leitura; preservação da cesta; visitante e acesso incompatível de produtor/administrador; seis páginas em vazio/erro/recuperação; loading real do módulo; teclado/menu móvel; seis larguras responsivas. As expectativas do comprador em [auth.spec.ts](../../apps/web/tests/auth.spec.ts) foram atualizadas das antigas secções placeholder para as encomendas implementadas, conservando os 141 cenários anteriores.

Validação final em 15 de outubro de 2026: **176 testes aprovados**, sem retries — 35 novos e 141 anteriores. `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` e `npm run test:e2e` concluíram sem erros. A execução completa detetou um seletor ambíguo entre o título do lote e a pré-visualização; foi restringido ao heading de nível 2, preservando a verificação do conteúdo antes da execução final aprovada.

As seis páginas são verificadas a 320/430/768/1024/1280/1440 px: sem overflow horizontal, imagens válidas, uma h1 e ações de erro acessíveis. Foram inspecionadas capturas reais do Chrome em desktop (1440 px), tablet (768 px) e telemóvel (390 px), incluindo encomendas, detalhes históricos, avaliações/formulário, licitações, cesta e erro recuperável. O percurso de 22 capturas terminou sem erros JavaScript. Não se declara certificação WCAG, validação formal em leitores de ecrã ou testes em Safari/Firefox.

Os nove documentos originais conservam os SHA-256 registados antes da fase. README e documentação de design incluem pressupostos, limites e referências locais verificadas. Resultados e capturas permanecem ignorados ou em `/tmp`; não existem novas dependências nem artefactos gerados entre as alterações. Os 21 ficheiros novos e oito modificados permaneceram locais durante a implementação; posteriormente foram publicados em quatro commits autorizados em `feat/buyer-dashboard`, terminando em `02ca8c9`, sem merge ou PR.

## Fase 2.4.3 — análise e pressupostos antes da implementação

Revistos os nove documentos originais, README, sistema visual e área do comprador. RF-PRO-01/UC-04 fundamentam consulta/criação/edição de produtos, preços e stock; RF-PRO-02 fundamenta perfil; RF-PRO-03/04 e UC-11, agregados próprios e alertas. RF-AUT-04/UC-03/D03/Q04 exigem decisão administrativa separada. RF-ENC-04/UC-06 autorizam gestão futura de estados, mas o pedido desta subfase limita encomendas a consulta. RF-LEI-01/UC-08 e D06/D07 orientam acompanhamento estático, sem comandos de leilão.

Branch autorizada: `feat/producer-dashboard`, criada a partir de `feat/buyer-dashboard` limpa no commit `02ca8c9c2040ad2b16804702e1b98c6713a85b6d`, preservando os quatro commits já publicados. Nenhum staging, commit, push, merge ou PR autorizado nesta fase.

Pressupostos provisórios, registados antes do código:

- O produtor de exemplo é a Horta da Ribeira. Consultas são limitadas ao seu identificador; o frontend não constitui autorização real. O catálogo privado começa como cópia dos seus 13 produtos públicos; a abóbora tem duas unidades apenas no cenário privado, para demonstrar stock reduzido. Não se altera a fonte pública nem a cesta.
- Q15: limiar ilustrativo de três unidades por produto, editável localmente. Stock reduzido significa `0 < disponível ≤ limiar`; zero é indisponível. Quantidades são unidades comerciais inteiras (Q03), não kg agregados. O painel identifica esta unidade e o limiar provisório. Valor de encomendas entregues soma snapshots em cêntimos no conjunto demonstrativo, não recebimentos, lucro ou vendas num período inferido.
- Produtos: criação/edição apenas em memória, com campos explícitos de nome, descrição, categoria, unidade comercial, preço EUR, quantidade e limiar. Preço não negativo, incluindo zero provisoriamente (Q06), com até duas casas decimais; stock/limiar são inteiros seguros não negativos. Não existem publicação, remoção/arquivo (Q12), certificação, upload ou alteração de propriedade. Produtos novos usam placeholder identificado; fotografias existentes são ilustrativas. Taxonomias atuais são exemplos (Q14).
- Perfil: editar apenas nome público, localidade e descrição na cópia privada. Pré-visualização privada usa estes dados e os produtos locais; o perfil público existente continua independente. Não se editam aprovação, identidade da conta, contactos privados, coordenadas ou certificação. Q11 permanece em aberto.
- Candidatura: exemplo de estado pendente, explicitamente fictício, sem submissão real, decisão, aprovação ou administrador inventado. Mostram-se dados necessários e etapas informativas. A edição privada não concede direitos de publicação; o perfil público demonstrativo existente não prova aprovação (Q04).
- Encomendas: snapshots próprios dos quatro estados, histórico linear ilustrativo; sem alterações de estado, cancelamento, pagamento, taxas ou consumo de stock. Q02/Q05/Q06 não são fechadas. Dados de compradores são rótulos fictícios, sem moradas/contactos.
- Leilões: retrato fixo de 15 de outubro de 2026 às 09:00 UTC, com agendado, ativo, terminado com ofertas e terminado sem ofertas. Sem oferta, preço base não é uma bid nem existe vencedor; resultados/contadores respeitam o snapshot. Sem relógio, criação/edição, reserva, sockets, ofertas ou conversão em encomenda (Q07/Q08/Q09).
- Fonte local assíncrona e estados loading/ready/error, sem HTTP ou timers artificiais. Cenários normal/vazio/erro exploráveis. Edições mantêm-se na navegação pública, mas repõem-se ao sair, mudar de papel, recarregar ou mudar de cenário. Não há persistência adicional nem sincronização entre áreas/separadores.

Reutilização prevista: `PrivateLayout`/guarda, `Button`, `FormField`, `MarketImage`, `ProductGallery`, `ProducerMap`, `StatusBadge`, `PriceDisplay`, `EmptyState`, `LoadingSkeleton`; tipos e funções monetárias/históricas da área do comprador. Estado do produtor separado de `BuyerProvider` e `CartProvider`, sem refatorações globais ou novas dependências.

### Arquitetura implementada da Fase 2.4.3

| Camada       | Implementação e responsabilidade                                                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos        | [types.ts](../../apps/web/src/features/producer/types.ts): ProducerProduct, ProducerOrder, ProducerAuction, ProducerDataset, drafts, comandos, feedback e união loading/ready/error                                                                                                                               |
| Dados        | [data/producer.ts](../../apps/web/src/data/producer.ts): Horta da Ribeira, cópia privada dos 13 produtos, quatro encomendas, quatro leilões e candidatura pendente fictícia                                                                                                                                       |
| Modelo       | [selectors.ts](../../apps/web/src/features/producer/selectors.ts): seleção própria, filtros, stock, agregados, parser EUR, validação e comandos imutáveis                                                                                                                                                         |
| Fonte        | [source.ts](../../apps/web/src/features/producer/source.ts): ProducerDataSource.load(scenario), Promise local substituível, sem HTTP/timers                                                                                                                                                                       |
| Estado       | [ProducerProvider](../../apps/web/src/features/producer/ProducerProvider.tsx), [ProducerContext](../../apps/web/src/features/producer/ProducerContext.ts) e [useProducer](../../apps/web/src/features/producer/useProducer.ts): sessão de trabalho demonstrativa e feedback                                       |
| Estrutura    | [ProducerPageFrame](../../apps/web/src/features/producer/ProducerPageFrame.tsx): introdução, aviso, loading, vazio/erro recuperáveis, cenário e fronteira de erro de renderização                                                                                                                                 |
| Listas       | [ProducerLists](../../apps/web/src/features/producer/ProducerLists.tsx): produtos, estados de stock, encomendas recebidas e leilões                                                                                                                                                                               |
| Formulários  | [ProducerFields](../../apps/web/src/features/producer/ProducerFields.tsx), [ProducerProductForm](../../apps/web/src/features/producer/ProducerProductForm.tsx), [ProducerProfileForm](../../apps/web/src/features/producer/ProducerProfileForm.tsx): labels, erros associados, resumo focável e edição em memória |
| Apresentação | Dez módulos de páginas em apps/web/src/pages/private/producer e [Sass local](../../apps/web/src/styles/_producer.scss), sem alterações aos tokens globais                                                                                                                                                         |

O Provider fica dentro dos contextos existentes e envolve rotas públicas/privadas. Assim, visitar o catálogo não perde edições privadas; terminar a demonstração, trocar de papel, recarregar ou mudar de cenário repõe os mocks. A revisão dos dados assíncronos ignora respostas antigas após mudança/desmontagem. O reducer volta a validar comandos contra o conjunto mais recente; não confia apenas na validação do formulário. Não escreve em localStorage, catálogo público, carrinho ou área do comprador.

`applyProducerCommand` distingue produto e perfil. Campos atribuídos são explícitos: não aceita proprietário, aprovação, certificação ou metadados administrativos do formulário. Produtos novos têm IDs locais sequenciais e placeholder; edições conservam imagens/metadados existentes. Uma quantidade individual ou agregada fora dos inteiros seguros é recusada antes da atualização. Alterar o nome/localidade do perfil atualiza os metadados dos produtos privados, preservando os snapshots das encomendas. Produtos alheios/inexistentes não são editáveis.

O parser de EUR aceita vírgula ou ponto com até duas casas decimais, sem expoentes, negativos ou separadores de milhar. Validações têm limites de apresentação identificados como provisórios: nomes/localidades até 120 caracteres e descrições até 1000. Campos monetários/quantidades não usam floats como estado persistido. A disponibilidade deriva sempre de stock e limiar; não existe estado paralelo desatualizado.

### Percursos e funcionalidades do produtor

| Percurso sob /area/produtor                      | Experiência                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| índice                                           | [Dashboard](../../apps/web/src/pages/private/producer/ProducerDashboardPage.tsx): origem, 13 produtos, quatro encomendas, uma pendente, um alerta, atividade recente e atalhos        |
| candidatura                                      | [Candidatura](../../apps/web/src/pages/private/producer/ProducerApplicationPage.tsx): dados necessários, três etapas e exemplo pendente, sem decisão                                  |
| produtos                                         | [Listagem](../../apps/web/src/pages/private/producer/ProducerProductsPage.tsx): pesquisa, categoria, disponibilidade e recuperação de filtros                                         |
| produtos/novo; produtos/:id; produtos/:id/editar | [Produto](../../apps/web/src/pages/private/producer/ProducerProductPage.tsx): criação/edição local e detalhe com ProductGallery                                                       |
| perfil; perfil/pre-visualizacao                  | [Perfil](../../apps/web/src/pages/private/producer/ProducerProfilePage.tsx): nome/localidade/descrição editáveis, prévia com mapa e produtos privados                                 |
| encomendas                                       | [Encomendas](../../apps/web/src/pages/private/producer/ProducerOrdersPage.tsx): filtros dos quatro estados, linhas resumidas e totais históricos                                      |
| encomendas/:id                                   | [Detalhe de encomenda](../../apps/web/src/pages/private/producer/ProducerOrderDetailPage.tsx): quantidades, preços, subtotais, total e histórico, sem ações de estado                 |
| leiloes                                          | [Leilões](../../apps/web/src/pages/private/producer/ProducerAuctionsPage.tsx): estados agendado/ativo/terminado, contadores e acesso ao lote                                          |
| leiloes/:id                                      | [Detalhe de leilão](../../apps/web/src/pages/private/producer/ProducerAuctionDetailPage.tsx): base, incremento, oferta atual ou ausência, datas e resultado estático                  |
| indicadores                                      | [Indicadores e stock](../../apps/web/src/pages/private/producer/ProducerStockPage.tsx): 295 unidades comerciais iniciais, um alerta e um indisponível, dados recalculados após edição |

São 13 percursos, com módulos lazy, Suspense e erro recuperável. O frame apresenta erros/carregamento da fonte antes dos dados. No cenário vazio, as listas e detalhes apresentam ausência/recuperação; candidatura e formulário do perfil continuam disponíveis por não dependerem de atividade, e a criação local permite explorar um conjunto inicialmente vazio. IDs alheios/inexistentes têm recuperação específica.

Pesquisa e filtros usam `pesquisa`, `categoria`, `stock` no URL; filtros das encomendas usam `estado`. Pesquisa imediata mantém o valor do input enquanto a transição do Router termina; substitui a entrada de histórico, enquanto seleções criam entradas. Voltar/avançar recupera a seleção. Parâmetros desconhecidos usam valores seguros. Destinos de entrada aceitam detalhes/edição/prévia internos conhecidos, nunca URLs externos ou caminhos de outro papel. A administração conserva os placeholders; o produtor não recebe capacidades do comprador.

Os indicadores são calculados por `producerSummary`, exclusivamente sobre os recursos próprios. Não se soma dinheiro de ofertas a encomendas, nem se apresenta stock heterogéneo como kg. As duas encomendas recebidas já demonstradas para a Horta na área do comprador mantêm os mesmos IDs/snapshots; dois exemplos adicionais completam os quatro estados sem alterar os dados do comprador. O valor entregue continua 6,45 € após editar preços atuais.

Os leilões incluem o mesmo lote ativo ilustrativo da Horta apresentado ao comprador: 317 € na sequência 3. Um agendado sem bids conserva base 45 €; um terminado com quatro bids tem resultado 62 €; um terminado sem bids conserva base 20 € sem vencedor. Os sete bids são um contador de ofertas no conjunto, sem expor identidade privada nem afirmar apresentação do histórico completo. O tempo é fixo em 15 de outubro de 2026, 09:00 UTC; nenhum estado muda pelo relógio do browser.

### Identidade visual, acessibilidade e integração futura

A composição usa títulos serifados, divisórias de lista, grelha de indicadores discreta, resumo verde de stock e ações diretas de edição. Produtos são linhas com fotografia, preço, quantidade e situação textual, sem botões de compra na gestão privada. A grelha adapta-se aos breakpoints existentes 768/1024/1280 px; formulário passa de uma para duas colunas, e ações empilham no telemóvel. Não há gráficos decorativos, nova paleta, fontes ou dependências.

`FormField` é reutilizado para inputs; select/textarea têm labels, IDs estáveis, indicação de erro e associação por aria-describedby. Submissão inválida foca o resumo de erros; sucesso anuncia a natureza local. Guardar um produto sem nova edição fica desativado após sucesso, evitando duplicação involuntária. Menu, foco de navegação, ligação de salto e movimento reduzido conservam o suporte existente. Galeria, imagens com fallback e mapa ilustrativo são reutilizados.

A futura API substituirá ProducerDataSource por leitura autenticada com validação de DTOs e cancelamento de pedidos; comandos de produto/perfil precisarão de escrita autenticada, controlo de propriedade, aprovação, versão e erros de conflito no servidor. As validações do cliente são apoio de interface, não segurança. Não se definem endpoints novos nem se assume que estes mocks são o contrato MongoDB.

RF-PRO-01 completo ainda exigirá remoção/arquivo conforme Q12, imagens Cloud e publicação autorizada. RF-PRO-02 completo exigirá atualização pública persistida; RF-ENC-04/05 exigirão transições acordadas e notificações. Leilões reais continuam dependentes de D06/D07, Q07/Q08/Q09, servidor e testes de concorrência. A candidatura não concede aprovação; publicação e recandidatura aguardam Q04. Q03/Q06/Q11/Q14/Q15 continuam provisórias nos aspetos documentados.

### Testes da Fase 2.4.3

[producer-model.spec.ts](../../apps/web/tests/producer-model.spec.ts) acrescenta 12 cenários: indicadores/imutabilidade; pesquisa/filtros; parser EUR; campos inválidos; criação com isolamento; edição e snapshots; limiar/overflow; recursos alheios; perfil e aprovação; históricos; invariantes dos snapshots de leilão; fonte e destinos seguros.

[producer.spec.ts](../../apps/web/tests/producer.spec.ts) acrescenta 36 cenários: dashboard, candidatura, filtros/histórico, galeria, criação/validação/reset, edição monetária/stock sem mudanças públicas, limiar, perfil/prévia, encomendas, IDs alheios, leilões sem ofertas, preservação da cesta, acesso por papéis, retoma de visitante, loading real, 13 percursos em vazio/erro/recuperação, teclado móvel e seis larguras. Os 176 testes anteriores são conservados; auth.spec.ts adapta apenas as expectativas do antigo placeholder de candidatura e o regresso à visão geral do produtor.

Validação final em 15 de outubro de 2026: **224 testes aprovados, sem retries** (176 anteriores e 48 novos). TypeScript strict, ESLint, Prettier e build de produção concluíram sem erros. A primeira execução dos 48 novos testes encontrou apenas uma expectativa com pontuação indevida no título público; corrigida a expectativa, a suite completa aprovou o perfil público original, a prévia e a preservação das edições privadas.

As 13 rotas foram verificadas às seis larguras 320/430/768/1024/1280/1440 px, sem overflow horizontal, com uma h1, imagens válidas e ações de erro acessíveis. Inspeção visual efetiva de capturas Chrome a 1440, 768 e 390 px: dashboard, candidatura, listas/detalhes, formulários de criação/edição/perfil, prévia, leilões, stock e recuperação. O percurso de 45 capturas terminou sem erros JavaScript. Não se declara certificação WCAG, ensaio formal com leitores de ecrã ou cobertura de Safari/Firefox.

Auditoria final: nove documentos originais preservados por SHA-256 e 135 ligações Markdown locais válidas. Sem alterações a dependências, API/shared, modelos/testes do carrinho, área do comprador ou fontes públicas. São 25 ficheiros novos e oito modificados; capturas e resultados gerados ficam em /tmp ou ignorados. HEAD continua em 02ca8c9 e main em c10d031; todas as alterações permanecem locais em feat/producer-dashboard, sem staging, commits, push, merge ou PR. A fase seguinte não foi iniciada.

## Fase 2.4.4 — análise antes da implementação

Revisão dos nove documentos originais da Fase 0, README e áreas do comprador/produtor: RF-AUT-04/UC03 prevê decisão de candidatura; RF-AVA-02/UC07 prevê moderação; RF-ADM-01/02 e UC11 preveem consulta global e estado dos serviços. D03/D04, D05, D06/D07 e D09 continuam a exigir autorização no servidor, snapshots monetários, consistência de leilões e rastreabilidade. Nenhum documento original é alterado.

A implementação local separa dados, modelos, seletores, contexto e apresentação. Reutiliza o layout privado, imagens, formulários, avaliações e cálculos de encomendas. As decisões de candidatura e moderação só existem em memória e não alteram catálogos públicos, avaliações públicas, carrinho ou outras áreas privadas. Recarregar, mudar de papel ou cenário repõe os exemplos. Não há operações administrativas reais.

Pressupostos provisórios: motivos opcionais até 500 caracteres; só um recurso pendente aceita decisão, sem reabertura; contagem de avaliações denunciadas conta avaliações distintas e a fila pendente é separada. Encomendas e leilões partilhados são desduplicados por identificador. Associações entre produtos e lotes são referências ilustrativas, sem reserva de stock. Todos os utilizadores, denúncias e decisões são fictícios.

Dependências pendentes: Q04 (publicação antes de aprovação e recandidatura), Q10/Q12 (moderação e outros conteúdos), Q16 (monitorização Cloud), API autenticada e persistência/auditoria, conflitos de decisão e licitações concorrentes. Serviços têm sempre monitorização real não implementada; exemplos simulados são apresentados em separado. Não se implementam alterações de permissões, contas, encomendas ou leilões, nem endpoints, notificações ou ligações Cloud.

### Modelos, dados e isolamento administrativo

A fonte [admin.ts](../../apps/web/src/data/admin.ts) compõe cópias de referências públicas e snapshots privados existentes: dez utilizadores fictícios (dois compradores, sete produtores e um administrador), sete produtores (dois pendentes, quatro aprovados e um rejeitado), oito encomendas únicas e sete leilões únicos. Não se afirma que a presença no catálogo público implica aprovação: o conjunto administrativo é uma simulação independente, incluindo a candidatura pendente da Horta.

Os [tipos administrativos](../../apps/web/src/features/admin/types.ts) distinguem utilizador, produtor/candidatura, encomenda, caso de moderação, leilão e serviço. Três avaliações denunciadas incluem quatro sinalizações: duas avaliações pendentes e uma decisão anterior de manutenção. Uma avaliação adicional do Forno existe apenas neste cenário e referencia uma entrega; não é publicada. Datas de candidatura, entrega, avaliação, denúncia e decisão respeitam a sequência dos acontecimentos.

Os [seletores e comandos](../../apps/web/src/features/admin/selectors.ts) calculam os seis indicadores a partir dos arrays; a fila de avaliações pendentes é uma contagem distinta do total denunciado. Filtros normalizam acentos/maiúsculas e combinam pesquisa com estado/papel. Encomendas preservam snapshots e reutilizam `orderTotal`/`lineSubtotal`, incluindo os 6,45 € históricos de DCM-261010. Os leilões conservam sequências/resultados existentes; agendados e terminados sem ofertas não ganham bids ou vencedores artificiais. Três produtos associados são referências ilustrativas do mesmo produtor, sem decisão sobre reservas (Q07).

[AdminProvider](../../apps/web/src/features/admin/AdminProvider.tsx) segue o padrão de reducer, fonte assíncrona injetável e cancelamento lógico das outras áreas. Envolve rotas públicas/privadas para preservar decisões ao visitar o mercado. Sair, trocar de papel, recarregar ou mudar de cenário repõe a fonte. Respostas antigas são ignoradas; o reducer verifica cada comando contra o último estado, recusando recurso inexistente, já decidido, escolha inválida, autor sem papel administrativo, data inválida/anterior e motivo acima do limite. O campo atribuído é explícito; a decisão não altera utilizadores, produtos, encomendas, avaliações públicas ou outros contextos.

O registo local conserva autor, data e motivo. O texto/classificação da avaliação e as sinalizações são preservados mesmo ao simular ocultação. Não há reabertura, eliminação, mudanças de permissões, moderação genérica de conteúdos, atualização de encomendas ou escrita no servidor. Estes comandos não são mecanismos de segurança; a implementação real precisa de autenticação/RBAC, validação de DTOs, controlo de conflitos, evidências e auditoria persistente no servidor.

### Percursos, componentes e apresentação

[As páginas administrativas](../../apps/web/src/pages/private/admin/AdminDashboardPage.tsx) usam sete módulos lazy para 14 percursos sob `/area/administrador`: índice; candidaturas/lista e detalhe; produtores/lista e detalhe; utilizadores/lista e detalhe; encomendas/lista e detalhe; moderação/lista e detalhe; leilões/lista e detalhe; serviços. Listas e detalhes de cada domínio partilham um módulo de página. Os IDs inválidos apresentam recuperação específica; caminhos desconhecidos usam o estado privado existente. A entrada só retoma destinos administrativos internos conhecidos e compatíveis com o papel.

[AdminPageFrame](../../apps/web/src/features/admin/AdminPageFrame.tsx) concentra carregamento, erro recuperável, feedback e cenários. O cenário vazio não mantém cartões com dados independentes: esvazia todas as coleções e recalcula os indicadores a zero. O erro não faz chamadas externas; repetir conserva o erro até escolher atividade normal. O boundary trata também erros inesperados de apresentação. Suspense apresenta uma única h1 e um estado de carregamento identificado.

[AdminComponents](../../apps/web/src/features/admin/AdminComponents.tsx) oferece filtros, badges, recuperação, formulário e registo de decisão. Reutiliza Button, FormField, StatusBadge, EmptyState, MarketImage, ProducerMap, ReviewCard, PriceDisplay e OrderStatusBadge, preservando as funcionalidades aprovadas. O formulário exige escolha explícita, apresenta resumo focável de erros e desaparece após decisão; o sucesso é anunciado por role=status. O limite opcional do motivo é provisório, não um requisito inventado para aprovação real.

Pesquisa e estado/papel usam `pesquisa`/`estado` no URL; `cenario` controla a fonte. A pesquisa mantém os caracteres durante transições do Router; filtros e histórico recuperam a seleção, e valores desconhecidos têm fallback seguro. Candidaturas começam por pendentes, mas permitem consultar todas as decisões; Produtores é uma secção própria. A navegação comum conserva menu móvel, Escape, foco no conteúdo e ligação de salto.

[O SCSS administrativo](../../apps/web/src/styles/_admin.scss) conserva paleta, fontes e breakpoints existentes. Seis indicadores discretos, listas com divisórias, informação contextual e formulários espaçosos permitem leitura e gestão sem gráficos decorativos ou densidade excessiva. Duas colunas de indicadores em telemóvel, três em tablet; filas/resumo em duas colunas apenas quando há espaço. Controlos principais têm pelo menos 44 px. Não se adicionaram dependências nem se modificaram os estilos das outras áreas.

### Serviços: exemplos e observação real

[A página de serviços](../../apps/web/src/pages/private/admin/AdminServicesPage.tsx) apresenta API, Socket.io, MongoDB Atlas, Blob Storage e Swagger UI. Todos conservam `realStatus: nao-monitorizado` e `realObservedAt: null`, acompanhados de «Monitorização real: não implementada». Um objeto separado `illustration` mostra exemplos desconhecido, indisponível ou degradado, com nota e data fictícia quando aplicável. Não existem estados verdes de serviço operacional, uptime, latência, pings, endpoints ou consolas fictícias.

O dashboard também informa a ausência de monitorização real. A apresentação exemplifica RF-ADM-02 sem o declarar concluído como integração Cloud. API/Socket/Atlas/Blob/Swagger reais e a profundidade de verificações (Q16) aguardam fase própria; nenhum serviço externo é consultado. O estado temporal dos leilões permanece fixo no retrato demonstrativo, sem relógio de fecho ou eventos simulados como reais.

### Cobertura de validação administrativa

[admin-model.spec.ts](../../apps/web/tests/admin-model.spec.ts) inclui 12 testes: indicadores/desduplicação, integridade de referências, pesquisa/filtros, aprovação com isolamento, decisões sucessivas, comandos inválidos/conflitos, moderação imutável, snapshots monetários, cronologia de denúncias, invariantes de leilões, estados reais não monitorizados e cenários/destinos seguros.

[admin.spec.ts](../../apps/web/tests/admin.spec.ts) inclui 38 testes de browser: indicadores, filtros/histórico, validação/decisões e registos, preservação pública/reset, consulta de utilizadores/encomendas, moderação e isolamento, leilões/resultados, serviços sem pedidos externos, IDs inválidos, restrição por papéis, retoma de visitante, carrinho/área do produtor, Suspense real, 14 percursos em vazio/erro/recuperação, teclado móvel e seis larguras. Os 224 testes anteriores são preservados; auth.spec.ts adapta somente as expectativas do antigo placeholder administrativo e o regresso à visão geral comum.

### Resultado final e entrega local da Fase 2.4.4

Validação em 15 de outubro de 2026: **274 testes aprovados, sem retries** — 224 existentes e 50 novos. TypeScript strict, ESLint, Prettier e build de produção passaram. Nas verificações intermédias corrigiram-se seletores/esperas dos novos testes e alinhou-se o aviso administrativo com a mensagem de demonstração comum; a execução completa final passou sem falhas.

Os 14 percursos foram verificados às seis larguras 320/430/768/1024/1280/1440 px, com uma h1, imagens carregadas, controlos principais de pelo menos 44 px e sem overflow horizontal. Foram obtidas 50 capturas Chrome em desktop (1440), tablet (768) e telemóvel (390); a inspeção visual incluiu indicadores, candidaturas, utilizadores, encomendas, leilões, moderação, formulários, separação de estados Cloud e erro recuperável. Os percursos de captura não registaram erros JavaScript. Não se declara cobertura de Safari/Firefox ou certificação de acessibilidade.

Inventário: 19 ficheiros criados — data/admin.ts; features/admin/{types.ts, selectors.ts, source.ts, AdminContext.ts, AdminProvider.tsx, useAdmin.ts, AdminPageFrame.tsx, AdminComponents.tsx}; pages/private/admin/{AdminDashboardPage.tsx, AdminProducersPage.tsx, AdminUsersPage.tsx, AdminOrdersPage.tsx, AdminModerationPage.tsx, AdminAuctionsPage.tsx, AdminServicesPage.tsx}; styles/_admin.scss; tests/{admin-model.spec.ts, admin.spec.ts}. Os caminhos de código são relativos a apps/web/src e os testes a apps/web.

Oito ficheiros modificados: README.md, docs/design/design-system.md, apps/web/src/{App.tsx, main.tsx}, apps/web/src/features/private-area/navigation.ts, apps/web/src/layouts/PrivateLayout.tsx, apps/web/src/styles/main.scss e apps/web/tests/auth.spec.ts. Não existem alterações às nove fontes originais da Fase 0, dependências, backend/shared, dados públicos, modelos ou páginas do comprador/produtor/carrinho. Capturas e scripts auxiliares ficam em /tmp; build e resultados de testes estão ignorados.

A branch local feat/admin-dashboard parte da versão aprovada ebf6109 de feat/producer-dashboard e conserva o mesmo HEAD. main permanece em c10d031. Sem staging, commits, push, merge ou PR; a revisão visual e qualquer publicação dependem de autorização explícita. Nenhuma fase posterior foi iniciada.

## Fase 6C — O tempo da colheita

Os [leilões reais](../api/phase-6c-react-auctions.md) acrescentam uma composição editorial com introdução tipográfica, fotografias de lotes, origem, estado e valor. Mantêm DM Serif Display/DM Sans, floresta, creme, sálvia, terracota e os espaçamentos existentes. Não alteram os restantes percursos nem a demonstração original.

`LiveAuctionCard` distingue uma oferta pelo lote da compra direta. `AuctionRoom` combina fotografia e narrativa com painel de participação; o valor é o foco visual, seguido do tempo, mínimo e confirmação. O histórico usa linhas adaptáveis, sequência, data e referência anonimizada; «A tua oferta» só deriva de informação autorizada. Não se apresentam nomes inventados para compradores reais. Valores vencedores são identificados como ofertas finais, sem alegar receita ou pagamento.

`AuctionBadge`, `AuctionClock`, `AuctionImage` e `AuctionPagination` usam os componentes base e os tokens. Estados têm texto além da cor. Fotografia indisponível apresenta fallback; não se utiliza imagem remota nova nem se omitem os créditos existentes. O catálogo diferencia filtros REST da pesquisa limitada à página carregada. A informação de presença explica que conta separadores/ligação, não pessoas.

Mobile First: cartões numa coluna a 320/430 px, duas a partir de 768 px; o detalhe mantém uma coluna até 1024 px e passa a fotografia/painel em duas colunas. Formulários usam uma coluna em telemóvel e pares de campos a partir de 768 px, mantendo labels, descrições e botões com quebra de linha. O diálogo de cancelamento tem confirmação explícita e foco nativo. O layout privado e a navegação móvel aprovados são reutilizados.

Não há anúncios por segundo: o relógio tem `aria-live="off"`; confirmações pessoais e resultados usam mensagens discretas. Há foco visível herdado, resumo de erros focável, labels, estados de carregamento/vazio/erro e respeito por movimento reduzido. A zero, «A confirmar…» precede o resultado do servidor. Sem ligação, a última confirmação é identificada e a submissão fica indisponível. A recuperação de uma tentativa pendente é uma ação distinta de enviar uma nova oferta.

As seis larguras 320/430/768/1024/1280/1440 px são verificadas com dados reais de revisão. Capturas de catálogo, detalhe, gestão e formulário ficam nos artefactos ignorados do Playwright; a inspeção humana complementa os testes de overflow, controlos e erros JavaScript. Não se declara certificação de acessibilidade ou cobertura de todos os motores de navegador.

## Fase 7C — análise administrativa de candidaturas

A [interface real de candidaturas](../api/phase-7c-admin-producer-applications.md) conserva a introdução editorial, paleta, tipografia e navegação privada. A administração demonstrativa permanece separada. A visão geral real acrescenta apenas a entrada contextual e o total pendente devolvido pelo serviço, sem métricas fictícias ou redesenho geral.

Os resumos usam cartões, filtros identificados e paginação do servidor. O detalhe reutiliza a leitura da candidatura; identificadores de auditoria e histórico são expansíveis. A decisão fica numa superfície própria, com aprovação explícita e motivo obrigatório apenas para rejeitar. O `dialog` nativo contém o foco e começa na ação de continuar a análise. Confirmações ficam desativadas enquanto o serviço decide.

Uma decisão confirmada foca o título; erros focam um grupo de recuperação com um único texto assertive, distinto do nome do grupo. O motivo inválido foca o campo com erro associado. Conflitos mostram o estado relido, sem sucesso presumido. Cartões e filtros empilham em telemóvel; controlos de pelo menos 44 px, texto com quebra e estados por escrito preservam a utilização nas seis larguras existentes. A verificação audível com VoiceOver exige uma sessão manual própria; não é inferida da árvore de acessibilidade.

As correções finais V7C-01/V7C-02 conservam filtros ao recuperar a última página real disponível, sem apresentar contadores de páginas impossíveis. A URL é substituída, sem criar uma entrada adicional no histórico. Os botões desta área, entrada e diálogos mudam de cor sem interpolação, mantendo os estados finais e o contorno de foco existentes; a regra não afeta o Button global ou outras áreas. O contraste é verificado também durante foco, hover, active e envio desativado.

## Fase 8A — administração real de contas

O [dashboard e gestão de utilizadores](../api/phase-8a-admin-dashboard-users.md) reutiliza a navegação privada e a linguagem editorial administrativa. Indicadores em grelha de duas colunas mobile/três desktop, com definições explícitas; contas em cartões adaptativos, pesquisa nome/email, filtros e paginação do servidor. O detalhe apresenta dados mínimos, capacidades e histórico paginado.

Desativação/reativação exige motivo e confirmação nativa; o `ConfirmationDialog` partilhado com a Fase 7C conserva foco, cancelamento seguro e leitura de motivos longos. Ações nunca são otimistas, não editam papéis e tratam conflitos/resultado incerto com consulta explícita. Erros, loading, vazio, foco e anúncios reutilizam os padrões existentes. Estilos próprios limitados à área, com transições de botões protegidas pelo padrão administrativo já corrigido. Sem redesenhar comprador/produtor/candidaturas.

## Fase 8B — supervisão de encomendas

A [supervisão administrativa](../api/phase-8b-admin-order-supervision.md) reutiliza o layout e dashboard real, cartões adaptativos e componentes de encomendas aprovados. Filtros globais identificam IDs completos e dias UTC inclusivos; indicadores descrevem o conjunto filtrado, sem promessa de receita. Listagem essencial, participantes mínimos, detalhe por snapshots e histórico paginado por domínio mantêm a hierarquia editorial.

Em telemóvel os filtros empilham e as referências longas têm linhas próprias; tablet/desktop usam duas/três colunas nos filtros. Sem tabela larga ou comandos operacionais. Loading, vazio, erro/retry e perda de permissões usam os padrões administrativos existentes. Labels, foco, teclado, um único alerta por falha e contraste calculado são verificados nas seis larguras. Capturas e árvores AX ficam fora do Git. VoiceOver audível continua a exigir avaliação manual própria.

## Fase 8C — supervisão de leilões

A [supervisão administrativa de leilões](../api/phase-8c-admin-auction-supervision.md) conserva o layout administrativo e a linguagem editorial aprovada. Listagem por cartões, filtros globais explícitos, indicadores do conjunto filtrado, com valor das ofertas vencedoras separado de receita recebida e detalhe que destaca o lote, valor atual e prazo, seguido de versão, liderança e histórico. Fotografia atual apenas ilustrativa, com fallback; vencedor e resultado só depois da confirmação persistida. Sem formulários de licitação ou gestão operacional.

Mobile em uma coluna; filtros em duas/três colunas no tablet/desktop, detalhe em duas colunas apenas a partir de 1280 px. Referências longas quebram em linhas próprias. Atualizações de fundo preservam conteúdo e foco, com estado discreto de ligação/consulta; o relógio existente não anuncia cada segundo. Perda de rede distingue a última confirmação de uma atualização nova e oferece recuperação. Teclado, labels, contraste, alertas, seis larguras e árvores AX são verificados; VoiceOver audível continua por testar manualmente.

## Fase 9 — avaliações verificadas e moderação

A [interface integrada](../api/phase-9-reviews-moderation.md) reutiliza ReviewCard, grelhas, formulários e layouts aprovados. O selo «Compra verificada» é reservado a projeções reais; os percursos demonstrativos conservam o seu selo. Média ausente não se torna zero. No perfil, avaliações diretas do produtor e dos seus produtos têm secções e agregados independentes. Comentários preservam quebras de linha e são texto seguro, com quebra de referências longas em mobile.

O formulário usa rádios nativos de 1–5 estrelas, acessíveis por teclado/setas, comentário com label e confirmação explícita. A moderação utiliza motivo obrigatório, dialog nativo, foco inicial no cancelamento e histórico preservado. Conflitos e respostas incertas pedem consulta antes de outra escrita. Cartões empilhados em mobile, filtros em grelha no tablet/desktop; sem tabelas largas. Seis larguras, teclado, contraste calculado e árvores AX fazem parte da revisão; VoiceOver audível permanece por testar. A dependência da futura confirmação operacional de receção é apresentada ao comprador, sem atalhos.
