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

Validação responsiva nas larguras 320/430/768/1024/1280/1440 px. A verificação usa Chrome, sem declaração de certificação formal de acessibilidade ou cobertura de Safari/Firefox. Todas as alterações da Fase 2.2 permanecem locais; não há operações Git de escrita nesta fase.

Execução final em 15 de outubro de 2026: 75 testes aprovados, incluindo as regressões das Fases 1 e 2.1; TypeScript, ESLint, Prettier e build de produção sem erros. Inspeção visual efetiva de produto, perfil e diretório em desktop e telemóvel, incluindo história, localização e avaliações. A galeria usa proporção 4:3 em ecrãs pequenos e uma fotografia maior em desktop; o preço mantém o tamanho de `PriceDisplay` grande. Os nove documentos da Fase 0 conservam os SHA-256 iniciais. As 56 ligações Markdown locais verificadas resolvem corretamente.
