# Fase 11B — pesquisa, localização e descoberta

Implementação local na branch `feat/api-foundation`, a partir de `c6f1bd1`. Sem publicação, migrações destrutivas ou alteração dos nove documentos originais da Fase 0.

## Requisitos e decisões

A referência é o enunciado académico original e a auditoria 11.0, não uma nova especificação comercial:

| Matriz / lacuna             | Enunciado                                                                               | Entrega                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| RF-CAT-01 / G01             | Pesquisa por nome, ingrediente e produtor, p. 9                                         | Ingredientes persistidos participam na consulta MongoDB existente.                           |
| RF-CAT-02                   | Filtros de categoria, produtor, localização, sazonalidade e modo de produção, pp. 4 e 9 | Mantidos os filtros reais, combinação, URL, paginação e ordenação.                           |
| RF-CAT-03 / G04             | Perfil do produtor com localização e mapa, pp. 4 e 9                                    | Ponto público autorizado no perfil existente e mapa interativo.                              |
| RF-CAT-04 / G02             | Leilões em direto na página inicial, p. 9                                               | O destaque de leilão passa a consultar a API; restantes secções reais são preservadas.       |
| RF-PRO-01/02                | Gestão de produtos e perfil                                                             | Reutilização do CRUD da Fase 11A para ingredientes e localização.                            |
| RF-LEI-06/07, RNF-CON-01/02 | Contagem sincronizada, ciclo da ligação, atomicidade e modelos MongoDB validados        | Reutilização do relógio e da reconciliação; preservação das transações, índices e validação. |

**Q11 aprovada pelo utilizador nesta fase:** localização pública opcional, escolhida pelo produtor, com coordenadas, descrição, autorização explícita e remoção. Não reutilizar a morada privada de levantamento, não geocodificar localidades automaticamente e apresentar localização indisponível na ausência do ponto. Carregar OpenStreetMap apenas após escolha do visitante. Esta aprovação delimita a implementação; não implica uma localização verificada da exploração nem altera os documentos históricos.

## Pesquisa e filtros

`GET /api/products?pesquisa=acafrao` inclui agora o array `ingredientes` na pesquisa sobre nome, descrição e produtor. Todos os termos têm de corresponder, podendo corresponder a campos diferentes. Acentos portugueses e maiúsculas/minúsculas usam a normalização e os padrões escapados já existentes. Espaços entre palavras são tratados como separadores; não há execução de expressões regulares fornecidas pelo cliente.

Mantêm-se os limites de 100 caracteres e dez termos, validação estrita de parâmetros, paginação de 12/24/36 itens, ordenação estável e combinação com categoria, produtor, localidade, estação/mês, modo de produção, indicador biológico e preço máximo. A ordenação por relevância conserva a prioridade existente para o nome; não se inventa uma classificação nova de ingredientes.

O campo e a gestão de ingredientes já existiam. O produtor pode definir, editar, consultar e remover ingredientes no formulário real. A publicação continua a exigir a lista quando o produtor declara ingredientes aplicáveis. Um produto antigo sem o array é apresentado com `[]`, sem escrever valores fictícios na base de dados.

## MongoDB e desempenho

As consultas continuam no servidor: `$match`, `$and`, `$or`, `$regex`, `$lookup`, `$project`, `$unwind`, `$facet`, `$sort`, `$skip`, `$limit` e `$count`, reutilizando ainda `$in` para sazonalidade e `$lte` para preço. A leitura mantém `majority`, collation portuguesa e `maxTimeMS: 5000`. Os índices existentes de produtos por produtor/publicação e publicação/categoria são preservados. Não é criado um índice geográfico: não existe pesquisa por distância nesta fase.

Na revisão, cinco consultas reais do repositório sobre 1 000 produtos fictícios, com pesquisa combinada e categoria, encontraram 251 resultados e demoraram entre 385 e 588 ms (mediana de cerca de 500 ms). A medição inclui acesso MongoDB e serialização, com outras suites em execução; não mede latência HTTP, concorrência de produção ou Atlas.

As expressões de correspondência parcial não passam a ser indexadas por acrescentar um índice simples aos ingredientes. O custo depende do catálogo elegível e dos filtros, incluindo as junções existentes. A validação local e as medições de revisão não equivalem a um ensaio de carga Cloud. Se o volume real exigir outra estratégia, deverá ser aprovada uma pesquisa normalizada/indexada; não se introduz um serviço externo ou uma promessa de escala nesta fase.

## Localização, contratos e privacidade

Campo opcional `producers.localizacaoPublica`:

- `latitude`: número finito entre −90 e 90;
- `longitude`: número finito entre −180 e 180;
- `descricao`: texto NFC, sem controlos, entre 1 e 200 caracteres;
- `autorizada`: obrigatoriamente `true` na escrita.

`GET/PUT /api/me/producer` mantém sessão, capabilities, propriedade e ETag. O PUT substitui os campos editáveis; omissão ou `null` remove o ponto. Alterar o ponto no formulário exige confirmar novamente a autorização. Substituir a fotografia do perfil preserva a localização. Não são alterados aprovação, histórico de candidaturas, reservas ou condições comerciais privadas.

`GET /api/producers` e `GET /api/producers/{id}` acrescentam apenas latitude, longitude e descrição quando o ponto está autorizado e válido. A morada de levantamento, telefone, dados bancários e identidade privada não são transformados em informação cartográfica. Perfis sem ponto continuam compatíveis. Os dados públicos são, por definição, acessíveis aos visitantes; a interface avisa o produtor antes de os publicar.

Os contratos continuam aditivos, com erros estruturados existentes e sem novos endpoints. Ver [OpenAPI](openapi.yaml), [gestão real do produtor](phase-11a-producer-management.md) e [segurança](security.md).

## Mapa integrado

Leaflet **1.9.4**, licença BSD-2-Clause, é carregado dinamicamente ao abrir o mapa. `@types/leaflet` **1.9.22** é apenas de desenvolvimento; `@types/geojson` **7946.0.16** chega transitivamente, ambos com licença MIT. A [licença integral de Leaflet](../../apps/web/public/licenses/leaflet.txt) acompanha os ficheiros públicos e o build. Não se adiciona wrapper React, SDK pago, CDN de código ou chave no frontend. As versões preexistentes são preservadas no lockfile.

A cartografia raster usa `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, atribuição visível, cache normal do browser, Referer com a origem e sem pré-carregamento em massa ou modo offline. As regras do fornecedor são parte da escolha técnica: [versão estável](https://leafletjs.com/download.html), [licença](https://github.com/Leaflet/Leaflet/blob/main/LICENSE) e [política dos tiles](https://operations.osmfoundation.org/policies/tiles/).

O visitante lê o aviso de comunicação do IP e da origem antes de escolher «Mostrar mapa OpenStreetMap». Não há pedidos de tiles antes dessa escolha. O link externo também exige uma ação e abre um novo separador sem transmitir Referer. O mapa mantém alternativa textual, coordenadas, descrição, controlos com nomes portugueses, teclado, atribuição e ligação externa. Não utiliza GPS do visitante.

Sem ponto autorizado, não há marcador inventado. Um ponto geograficamente válido fora da projeção Web Mercator (latitude absoluta superior a 85,05112878°) mantém o texto e a ligação externa, com explicação honesta da limitação. Há carregamento, erro, limite de espera e nova tentativa; falhar a cartografia não elimina a descrição ou o resto do perfil.

O serviço comunitário é best-effort, sem SLA, pode bloquear tráfego e não deve ser tratado como infraestrutura contratada. Para Cloud: rever política de utilização, volume e fornecedor, HTTPS, CSP `img-src` para os tiles, Referer compatível, atribuição e cache. Não enviar JWT, cookies privados, moradas ou contactos ao fornecedor. A precisão é declarada pelo produtor, não certificada pela plataforma.

## Homepage e leilões

`FeaturedAuctions` reutiliza `GET /api/auctions?estado=ativo&porPagina=12&ordem=recentes`, os DTOs, imagem, preço, lote, estado e `AuctionClock` existentes. Escolhe um leilão ativo elegível entre os doze resumos recentes; não promete um ranking global de relevância nem uma pesquisa de todo o catálogo.

O preço base sem ofertas é identificado como tal; valores confirmados não são inventados. O relógio usa `serverNow`, amostras de ida/volta e `performance.now()`, sem depender exclusivamente do relógio local. O limite temporal provoca nova leitura REST. Foco, retoma de ligação e visibilidade reconciliam dados; há consulta periódica a cada 15 segundos enquanto a página está visível. A homepage pública não ganha acesso a salas Socket.IO privadas nem licitações diretas.

Sem leilões ativos, apresenta um estado vazio e ligação aos leilões. Falhas têm recuperação explícita. O backend continua a determinar encerramento e vencedor. As regras de licitação, stock, reservas, transações, pagamentos e permissões permanecem intactas. A grelha do destaque adapta preço e temporizador à largura disponível, mantendo o tempo numa linha.

## Validação e revisão

Resultados desta revisão: **1 870 testes backend**, **632 testes frontend habituais**, **153 integrações reais React/API/MongoDB** e **12 regressões reais de leilões** aprovados, totalizando **2 667 testes distintos**. Os nove cenários reais de descoberta foram repetidos após os ajustes finais de apresentação e de captura, sem os contar novamente no total. Foram preservados os testes anteriores.

TypeScript API/frontend, ESLint, Prettier com ignore explícito da raiz, builds, validação estrutural/referências OpenAPI, ligações Markdown, pesquisa de padrões de segredos e `git diff --check` passaram. A integridade dos nove documentos da Fase 0 foi confirmada por comparação de conteúdo e SHA-256.

Novos testes em `apps/api/tests/integration/discovery.spec.ts`, `apps/web/tests/discovery.spec.ts` e `apps/web/tests/discovery.real.spec.ts` cobrem ingredientes exclusivos, acentos, espaços, filtros combinados, paginação, ordenação, produtos antigos, CRUD, propriedade, conta inativa, ETag, autorização/remoção do ponto, privacidade, preservação da localização no upload, mapa, falhas, destaque, encerramento e reconciliação.

As integrações reais registam contas fictícias, aprovam candidaturas pela API administrativa, escrevem e leem produtos no MongoDB e percorrem React/API/MongoDB. Um cenário apresenta uma oferta real e confirma encerramento e resultado persistidos. Nenhum desses dados é inserido em produção.

Os testes cartográficos automáticos intercetam tiles com PNG local para não repetir tráfego automatizado no serviço comunitário. Isto valida Leaflet, marcadores, controlos, privacidade, integração e erros; **não comprova disponibilidade externa nem cartografia real do fornecedor**. Numa inspeção pontual separada, o mapa carregou cartografia externa real: zero pedidos antes da escolha, 12 tiles HTTP 200 depois da abertura, Referer limitado à origem e nenhum erro JavaScript. Essa evidência representa apenas a disponibilidade nessa execução, sem garantia de serviço futuro.

Larguras: **320, 430, 768, 1024, 1280 e 1440 px**. Capturas temporárias fora do Git mediante `DOCAMPO_DISCOVERY_SCREENSHOTS`; verificação de overflow, temporizador numa linha, erros JavaScript, contraste, foco e teclado. A alternativa textual permite consultar o ponto sem mapa. VoiceOver audível só pode ser declarado se houver reprodução e inspeção efetivas no ambiente; a árvore acessível não substitui essa prova.

Comandos, a partir da raiz:

```sh
npm test --workspace @docampo/api
npx playwright test --workers=4
npx playwright test --config playwright.integration.config.ts
npx playwright test --config playwright.auctions.config.ts
npm run typecheck --workspace @docampo/api
npm run typecheck --workspace @docampo/web
npm run lint
npx prettier --check --ignore-path .prettierignore README.md apps packages docs/api docs/design
npm run build --workspace @docampo/api
npm run build --workspace @docampo/web
git diff --check
```

O mapa ilustrativo das áreas de demonstração foi preservado; o perfil público usa `PublicProducerMap`, com Leaflet e dados da API. Os testes anteriores não foram alterados para acomodar esta separação.

As suites reais e de leilões usam portas partilhadas e devem correr sequencialmente. O MongoDB de teste deve estar disponível no replica set `rs-dcm-test`; os testes criam e eliminam bases efémeras. O ambiente de revisão não deve usar contas ou bases de produção. Os resultados exatos e os caminhos das evidências pertencem ao relatório da execução, sem confundir testes anteriores com reexecuções.

## Revisão visual manual isolada

Depois de terminar as suites, com Docker e as dependências instaladas, iniciar MongoDB de teste e o servidor efémero existente, a partir da raiz:

```sh
npm run mongo:test:up --workspace @docampo/api
DOCAMPO_PRODUCER_REVIEW=1 DOCAMPO_AUCTION_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs
```

Noutro terminal:

```sh
VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183
```

Abrir `http://127.0.0.1:5183`. O servidor indica os caminhos dos ficheiros privados com contas fictícias desta execução; não copiar essas credenciais para o repositório. A base aleatória é de teste e é eliminada ao terminar o servidor normalmente. Não executar as suites reais em simultâneo, pois usam as mesmas portas.

Rever `/` para o destaque ativo, `/produtos` para pesquisa e filtros combinados e `/produtores/:id` para o perfil público. Com a conta fictícia de produtor, abrir `/area/produtor/perfil`, escolher um ponto de ensaio, autorizar e guardar. Confirmar no perfil público o texto, a escolha de carregar o mapa, os controlos e a ligação externa. Desativar a publicação, guardar e verificar a ausência do mapa público. Nos produtos próprios, editar ingredientes e confirmar os resultados públicos. O leilão ativo da revisão tem prazo limitado; o seu encerramento deve retirar o destaque. Não usar este seed ou estas contas em produção.

Repetir em 320, 430, 768, 1024, 1280 e 1440 px, com teclado, incluindo os estados de rede indisponível. O carregamento cartográfico manual usa o serviço externo após escolha explícita; não fazer recolha automatizada em massa.

## Limites e próximos passos sujeitos a aprovação

Não há geocodificação, validação administrativa do ponto, pesquisa por proximidade, novo fornecedor contratado ou armazenamento offline de mapas. Não há garantia de SLA externo ou benchmark de produção. O destaque público pode ter até 15 segundos de atraso entre reconciliações, sem atribuir esse atraso a uma regra de licitação. O catálogo de desenvolvimento continua a identificar os dados como fictícios.

O armazenamento Cloud das fotografias continua dependente da Fase 13, conforme a Fase 11A. A instabilidade histórica do teste `datetime-local` não é ocultada nem corrigida através da alteração de testes antigos nesta fase. A Fase 11C, atalhos de licitação e moderação genérica estão fora do âmbito.

Proposta futura de commit, sem o executar:

`feat(discovery): add ingredient search and producer maps`
