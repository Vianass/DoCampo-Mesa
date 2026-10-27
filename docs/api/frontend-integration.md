# Fase 5C — sessão real e áreas pessoais

Implementação local a partir de `1168252`, em `feat/api-foundation`. Integra os quatro contratos existentes `POST /auth/register`, `POST /auth/login`, `GET /auth/me` e `POST /auth/logout` (base `/api`). API, modelos, autorização no servidor, checkout interno e catálogo público não são alterados.

## Contratos e formulários

O registo envia exclusivamente `{nome,email,password}` e só aceita HTTP 202 com a confirmação genérica. Não envia confirmação da password, papéis, dados de produtor ou propriedades arbitrárias recolhidas no formulário. Um email já registado recebe a mesma apresentação; não se afirma que uma nova conta foi criada. O login é separado. `?perfil=produtor` ou `?perfil=administrador` não concede capacidades no registo real.

A validação real usa nome normalizado (1–120 pontos de código), email e política de password da API: 15–128 pontos de código no registo, até 512 bytes UTF-8, sem caracteres nulos ou substitutos isolados. Não impõe maiúsculas/símbolos; login aceita passwords legadas curtas. O servidor continua a validar e autorizar. Corpos HTTP e credenciais não são usados em mensagens de erro ou logs. Os campos de password são limpos ao submeter; submissões duplicadas são bloqueadas e pedidos abandonados são cancelados.

O cliente tipado reutiliza o transporte da Fase 5B e a base pública `VITE_API_URL`. Valida estados HTTP, JSON, projeção própria, capacidades, datas e forma do token; não atribui papéis descodificando o JWT. Após login, consulta `/me` com Bearer e confirma que a identidade coincide antes de estabelecer a sessão.

## Ciclo de vida e proteção contra respostas antigas

`account-session.ts` centraliza o token privado em memória, o estado observável e os pedidos ativos. O contexto React expõe a projeção da conta e ações de sessão, não o JWT. Não existe token em localStorage/sessionStorage/cookies, URL, mensagens de erro ou configuração pública. O storage anterior da cesta permanece apenas para metadados públicos das escolhas.

Expiração usa `expiresAt` do servidor. Ao atingir o prazo, limpar a sessão e pedir novo login; revalidação também verifica o prazo antes de enviar pedidos. Não existe refresh token. `/me` é consultado ao entrar/navegar numa área privada, ao voltar ao separador e ao recuperar o foco; pedidos concorrentes partilham a mesma consulta. Alterações de papel/inativação são observadas na próxima confirmação e o backend continua a consultar a conta atual em cada pedido protegido.

Uma geração de sessão, AbortController e comparação da identidade impedem que login ou `/me` antigos restaurem uma sessão após logout, troca de conta ou abandono do formulário. O logout limpa o estado local imediatamente, incluindo quando o serviço falha, e tenta o endpoint existente. A resposta `revogado:false` é respeitada: o acesso anterior pode continuar válido até expirar, sujeito ao estado atual da conta. Nenhuma denylist/revogação fictícia é criada.

401 invalida a sessão. 403 mantém a área bloqueada sem inventar novas permissões. Rede/timeout/5xx não se tornam atividade vazia; bloqueiam a apresentação privada até confirmação bem-sucedida ou saída. Recarregar ou abrir um novo separador não recupera o JWT; a entrada explica o comportamento e conserva apenas um destino privado conhecido, sem redirecionamentos externos ou parâmetros de credenciais.

## Áreas reais e demonstração isolada

`/area` e os seus percursos exigem sessão real confirmada. A navegação usa todas as capacidades devolvidas pela API, sem assumir um papel único ou um papel escolhido no cliente. O destino inicial é a primeira capacidade na projeção do serviço; a pessoa pode alternar apenas entre áreas autorizadas. Uma alteração de URL ou estado visual não substitui a autorização do backend.

As áreas autenticadas reutilizam o layout, a navegação e os componentes editoriais existentes. Mostram nome/email/capacidades próprios e estados de disponibilidade; não apresentam dados fictícios como atividade da conta. As funcionalidades privadas de encomendas, avaliações, leilões, candidatura e gestão ainda não ligadas à API ficam indisponíveis na interface nesta etapa, sem inventar endpoints ou preencher indicadores com zero fictício.

O protótipo aprovado continua acessível em `/demonstracao/entrar`, com o mesmo router/componentes sob um basename separado. O seletor de papel só funciona nesse espaço e altera exclusivamente a demonstração; nunca cria um JWT nem abre `/area` real. Abre num separador sem opener, sem a sessão autenticada. Sair para o mercado real requer navegação completa. A cesta demonstrativa usa `docampo.cart.demo.v1`; não altera `docampo.cart.v1`. Dados privados demonstrativos não recebem IDs de contas reais.

## Testes e limites

A cobertura histórica de formulários/dashboards é mantida no espaço de demonstração e não é apresentada como autenticação real. Novos testes cobrem contratos, validação real, gerações de sessão, deduplicação de `/me`, expiração, 401/403, logout, revalidação, cancelamento, ausência de tokens nos armazenamentos e seis larguras responsivas.

A suite real usa a API e MongoDB efémero da Fase 5B: regista contas fictícias únicas, altera papéis/ativo através dos modelos existentes apenas na base isolada e verifica as consequências no browser. Testa token realmente adulterado, expiração natural de um JWT de 60 segundos e ausência de revogação após logout. O TTL de 60 segundos e limites de tentativas mais altos são exclusivos do servidor de testes para permitir a suite acumulada; a configuração da aplicação não é alterada. Não há contas administrativas com passwords fixas nem novos endpoints de preparação/segurança. O seed manual anterior continua sem credenciais utilizáveis.

Validação desta implementação: **344 testes frontend habituais e 25 de integração real aprovados**, total de **369**, incluindo os 314 anteriores e 55 novos. A regressão backend completa passou nos **1 128 testes**. TypeScript de ambas as aplicações, ESLint, Prettier, os dois builds e `git diff --check` aprovados. As seis larguras (320, 430, 768, 1024, 1280 e 1440 px) foram verificadas sem overflow; as capturas de telemóvel, tablet e desktop foram inspecionadas. Os testes reais incluem a expiração natural, não apenas um relógio simulado no browser.

Memória evita persistência por conveniência, mas não torna tokens imunes a XSS. A sessão não sobrevive a reload, não se renova nem sincroniza entre separadores. Ainda não se migram as operações privadas, compras, leilões, recuperação de password ou uploads. As instruções de arranque permanecem no [README](../../README.md). Os nove documentos originais da Fase 0 ficam intactos.

---

## Registos anteriores preservados

# Fase 5B — integração pública implementada localmente

Base `2fa007d`, branch `feat/api-foundation`. Esta etapa integra React com `GET /api/products`, `GET /api/products/:id`, `GET /api/producers` e `GET /api/producers/:id`, sem modificar os seus contratos, os modelos, a autenticação ou as escritas de negócio existentes. São abrangidos `/produtos`, `/produtos/:id`, `/produtores`, `/produtores/:id` e as seleções públicas da homepage.

## Comunicação e apresentação

`apps/web/src/features/api/` contém fetch nativo tipado, validação em execução dos DTOs e adaptadores de apresentação. `VITE_API_URL` é uma base pública, por omissão `/api`; o proxy Vite de desenvolvimento usa a porta 3001. Em produção, configurar reverse proxy ou a base HTTPS antes do build e a origem exata em CORS. Não existem JWT ou credenciais no ambiente do browser. Apenas GET público é usado nesta fase.

O cliente distingue rede/timeout (10 segundos), códigos HTTP, JSON/content-type inválidos e DTOs incompatíveis. Apresenta mensagens acessíveis e tentativa explícita; não mostra stacks, payloads ou mensagens internas do servidor. Cancelamento e isolamento por chave impedem respostas antigas de substituir filtros/IDs novos. A pesquisa e os filtros textuais aguardam 250 ms, sem atraso artificial na obtenção de detalhes. O skeleton conserva a estrutura do catálogo; erros não são apresentados como listas vazias nem provocam fallback aos mocks.

IDs de produto e perfil são opacos e preservados, sem associação a contas ou a nomes/slugs antigos. O adaptador converte nomes portugueses em propriedades dos componentes existentes, conserva preço em cêntimos, referência da unidade e stock na grandeza original. A taxonomia de 12 categorias é uma lista estável do contrato, não inferida de uma página. Categorias antigas ambíguas só são traduzidas explicitamente na preparação dos dados fictícios (por exemplo, farinha vs pão).

`nome`, `descricao`, `imagens`, origem, preço, unidade, disponibilidade, ingredientes e condições comerciais vêm da API. A imagem do perfil é reutilizada na apresentação editorial; não se inventa uma fotografia de capa. Meses ausentes são «não indicados». A indicação biológica e o modo são declarações, sem certificação. História adicional, métodos editoriais, reviews, pontuações, mapas/coordenadas e contactos não contratados não são fabricados. Campos opcionais em falta têm estados de ausência ou o placeholder visual existente.

## Pesquisa, filtros e paginação

O catálogo envia pesquisa, categoria por ID, produtor por ID de perfil, localidade exata, época, modo de produção declarado, biológico, preço máximo, seis ordenações e página/tamanho ao servidor. Mantém a URL e o histórico, incluindo filtros recebidos antes de carregar opções de produtor. A listagem não descarrega o catálogo inteiro para filtrar no browser. O total e as páginas vêm do envelope, incluindo o estado de página além do fim e recuperação explícita da primeira página.

O seletor de produtores pesquisa e pagina os perfis públicos em blocos de 12; o ID selecionado é conservado mesmo quando não pertence à página das opções. Localidade e modo são entradas textuais exatas, evitando apresentar como universais as opções inferidas de resultados parciais. Não existe endpoint de facetas. O preço máximo usa o limite contratual de 10 000 €, não o preço maior de uma única página.

O diretório pesquisa e pagina no servidor. O perfil pagina os seus produtos publicados; as categorias mostradas são explicitamente as da página corrente. As recomendações de detalhe consultam uma página da mesma categoria e excluem o produto atual; não atribuem destaque fictício.

## Cesta local e demonstrações preservadas

O modelo existente é estendido com unidade estruturada e um snapshot público opcional para produtos da API. `docampo.cart.v1` continua a aceitar linhas demonstrativas anteriores sem converter slugs em ObjectIds; novas linhas reais conservam o seu ID e os metadados públicos necessários. Não são guardados tokens, credenciais, contactos privados ou dados administrativos. Os snapshots são validados ao recuperar e são apenas uma estimativa local, nunca autoridade de preço/stock.

A quantidade continua inteira em g/ml/unidades/embalagens, com mínimo e incremento explícitos. Cada subtotal usa arredondamento half-up inteiro de `quantidade × preço / referência`, sem tratar gramas como quilogramas. Quando existem grandezas diferentes, o indicador conta artigos/linhas e não soma g com ml ou contagens. Quantidades por linha mantêm a sua unidade. Os custos de entrega não integram o total local.

Os produtos guardados são atualizados individualmente em blocos de até quatro pedidos simultâneos. Loading, erro ou ausência num resultado paginado não removem linhas. Um 404 autoritativo ou stock insuficiente é reconciliado com aviso; rede/503 conservam escolhas e indicam estimativa. Atualizações de preço/stock geram os avisos existentes. Checkout HTTP, reserva, reconfirmação de oferta e pagamento não são implementados.

Comprador, produtor, administrador, sessão demonstrativa e leilões continuam locais. As suas decisões não afetam dados MongoDB; ligações de registos demo sem identidade real abrem as listagens públicas, em vez de inventarem associações de nomes ou de levarem para perfis reais arbitrários. O sistema visual continua a usar os exemplos locais apenas na sua página de demonstração.

## Dados fictícios de desenvolvimento

O comando [seed-catalog.mjs](../../scripts/seed-catalog.mjs) reutiliza produtos, produtores, descrições e fotografias ilustrativas existentes. É exclusivamente manual e exige `NODE_ENV=development`, base dedicada `docampo_dev_catalog`, URI loopback/porta 27018, `rs-dcm-dev` e ligação direta; recusa Atlas, produção e credenciais. Defaults e comandos de arranque constam do [README](../../README.md).

Os IDs determinísticos derivam de chaves estáveis fictícias e de domínios separados por entidade. O seed verifica colisões, insere através dos modelos validados numa transação e não elimina ou atualiza dados existentes. Repetir sem alterações não insere duplicados; alterações posteriores ao ficheiro de demonstração não são uma migração automática. Uma colisão incompatível cancela a inserção. Não existe conta administrativa: as aprovações são dados fictícios e o autor é uma referência técnica de exemplo. As contas produtor têm passwords aleatórias que são descartadas, sem acesso por credencial fixa.

Preço/kg e preço/L mantêm a referência 1000 e o stock antigo é multiplicado explicitamente por 1000 na preparação desses exemplos; usam mínimo 250 e incremento 50. Preços por unidade/apresentação mantêm contagem inteira. Rótulos como «frasco de 500 g» são preservados como apresentação de embalagem, sem deduzir conteúdo estruturado. A indicação biológica e os meses são declarados fictícios, não certificações. Ingredientes não aplicáveis são declarações destes exemplos de desenvolvimento; dados reais exigem a declaração correta do produtor. Nenhuma destas conversões altera os mocks originais ou constitui migração de dados reais.

`SEED_IMAGE_ORIGIN` permite indicar a origem das imagens locais (default `http://127.0.0.1:5173`). `SEED_MONGODB_URI` e `SEED_DB_NAME` continuam sujeitos às mesmas proteções; não desbloqueiam outros destinos. O seed não lê `.env` nem corre no arranque da API, build ou produção. O teste real usa exclusivamente `docampo_test_web_*` na porta 27019 e remove apenas a sua base efémera.

## Verificação e limites

As suites existentes são preservadas e adaptadas com fixtures de rede válidas, IDs MongoDB e expectativas coerentes com campos efetivamente públicos. Testes novos cobrem DTOs, quatro modalidades, erros, timeout/cancelamento, loading, pesquisa rápida, paginação, stock/unidade, persistência e ausência de fallback. O teste separado com browser, HTTP real e MongoDB real verifica o catálogo, perfis, cesta, idempotência do seed e as seis larguras 320/430/768/1024/1280/1440 px; mocks não são apresentados como prova dessa integração.

Validação executada nesta etapa: **305 testes da suite frontend habitual e 9 testes reais React/API/MongoDB aprovados** (314 no total, incluindo os 274 percursos anteriores adaptados). Os novos testes frontend são 19 de contrato/modelo, 12 de interface/rede e nove de integração real. A regressão backend completa passou **1 128 testes**: 808 unitários (incluindo 12 novos sobre o seed), 109 HTTP e 211 de integração MongoDB. TypeScript, ESLint, Prettier, builds e ligações documentais foram verificados. O ajuste final do loading móvel foi confirmado por uma execução dirigida de 37 testes de catálogo/rede, sem somar repetições ao total.

Não há alteração de dependências, documentos da Fase 0, autenticação ou endpoints comerciais. O acesso JWT pela interface, a gestão privada persistida, o checkout HTTP, as reviews, leilões e uploads exigem fases próprias. Não se inicia automaticamente a etapa seguinte nem se autoriza publicação Git.

---

## Contrato e registos anteriores preservados

# Fase 5A — contrato utilizável pelo catálogo React

Implementação local de **26 de outubro de 2026**, em `feat/api-foundation`, base `c810f0f`. Não se altera React, design system, carrinho ou navegação. Os modelos e regras de persistência anteriores permanecem intactos. O [OpenAPI](openapi.yaml) é o contrato dos endpoints agora disponíveis; as notas históricas seguintes conservam o seu contexto.

## Endpoints implementados

| Endpoint                   | Resposta e acesso                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/products`        | Catálogo público paginado; só publicados de perfis aprovados e contas ativas com capacidade produtor. Stock zero permanece visível, com `disponivel: false`. |
| `GET /api/products/:id`    | Detalhe público; rascunho, arquivo ou produtor não elegível devolvem 404.                                                                                    |
| `GET /api/producers`       | Perfis públicos paginados, com pesquisa/localidade/ordenação.                                                                                                |
| `GET /api/producers/:id`   | Perfil público e `produtos` publicados, paginados.                                                                                                           |
| `GET /api/me/products`     | Produtos próprios, incluindo rascunhos e arquivos; JWT, papel produtor e perfil pendente/aprovado.                                                           |
| `GET /api/me/products/:id` | Consulta própria com ETag forte para gestão; nunca expõe outro owner.                                                                                        |
| `POST /api/products`       | Cria rascunho próprio; 201 com Location, DTO próprio e ETag. O estado inicial não é editável.                                                                |
| `PUT /api/products/:id`    | Substitui os campos editáveis completos; 200, DTO próprio e novo ETag. Estado explícito; publicar exige aprovação e dados completos.                         |
| `DELETE /api/products/:id` | Arquiva, 204 sem corpo; nunca elimina fisicamente ou repõe stock.                                                                                            |

As duas consultas próprias são necessárias para recuperar rascunhos/ETags na gestão; não se usa o GET público para revelar dados privados. Não existem endpoints de gestão de perfis, aprovação administrativa, upload, checkout ou leilões nesta etapa.

## Filtros e paginação

O catálogo aceita `pesquisa`, `categoria`, `produtor`, `localidade`, `epoca`, `mes`, `modoProducao`, `bio`, `precoMax`, `ordem`, `pagina` e `porPagina`. Desconhecidos, campos repetidos/arrays e operadores MongoDB livres são recusados. Omitir filtros vazios. Pesquisa limitada a 100 pontos de código/10 termos, combinados por AND entre nome, descrição, produtor e localidade; regex é construída como texto literal e trata os acentos portugueses em dados NFC. Não é um motor linguístico/fuzzy nem aceita regex do cliente.

`categoria` recebe o ID estável `cat-001`–`cat-012`; `produtor` recebe **ID do perfil**, não `users._id` nem slug. `localidade` e `modoProducao` usam correspondência textual exata, sem distinguir maiúsculas/acentos portugueses. Modo é uma declaração, não certificação. `bio=true` seleciona a declaração Biológico; false não acrescenta filtro.

`precoMax` mantém EUR no URL (`12.34` ou `12,34`), convertido exatamente para cêntimos; máximo 10000. Compara os preços de referência publicados, sem converter preço/kg e preço/unidade. `epoca` aceita Primavera/Verão/Outono/Inverno: meses 3–5/6–8/9–11/12–1–2. `mes` aceita 1–12 e não pode coexistir com `epoca`. Meses ausentes significam informação não declarada, não todo o ano; não controlam venda ou reserva.

As seis ordenações React são aceites: `relevancia`, `preco-asc`, `preco-desc`, `nome-asc`, `nome-desc`, `recentes`. Relevância privilegia nome exato/prefixo/conteúdo; não atribui destaque fictício. Desempate por ID e collation portuguesa. Perfis aceitam as ordenações sem preço; produtos próprios usam nome para relevância.

Envelope estável: `{itens, pagina, porPagina, total, totalPaginas}`. Defaults: página 1 e 12 itens; tamanhos permitidos 12/24/36, página máxima 1000. Além da última página devolve itens vazios, sem mudar silenciosamente a página pedida; catálogo vazio tem zero páginas. React deverá ajustar o comportamento atual de clamp. Não derivar o universo completo de filtros a partir de uma única página: usar taxonomia estável e as consultas paginadas/pesquisáveis de produtores, sem inventar facetas globais. Não há endpoint de facetas nesta etapa.

## Adaptações de apresentação

- `id`, `nome`, `descricao`, `precoCent` correspondem a `id`, `name`, `description`, `priceCents`; `imagens[].url` passa a `images[].src`. O preço continua inteiro em cêntimos.
- A unidade é estruturada: preço por 1 kg/1 L/unidade/embalagem, stock e quantidades em g/ml/unidades/embalagens. Formatar o rótulo sem transformar silenciosamente as quantidades ou a grelha de compra do carrinho.
- `categoria: {id, nome}` substitui os oito rótulos mock por doze IDs estáveis. Será necessário adaptar os tipos/opções, sem colapsar categorias diferentes ou usar nomes como identidade.
- `produtor: {id, nomePublico, localidade, concelho, imagem?}` usa ID do perfil. As referências antigas de mocks/carrinho não podem ser convertidas por comparação de nome.
- `epocaMeses` é informativo. Ausência não cria um selo Todo o ano. `modoProducao` não comprova certificação biológica. Não existem campos persistidos `featured`, avaliações, pontuação, coordenadas, métodos editoriais, história ou capa; a UI deverá omitir essas secções ou usar placeholders de apresentação explícitos. Não anexar avaliações fictícias a produtores reais.
- Informação comercial pública inclui modalidades, métodos, taxa, concelhos e agenda declarados. Excluem-se telefone, contactos bancários, decisor, contas internas, revisão, versão técnica de catálogo e local privado de levantamento. Um perfil antigo sem configuração não recebe condições inventadas.

## Gestão, permissões e concorrência

Usar JWT real de `/api/auth/login`, nunca o papel demonstrativo do frontend. Só a conta proprietária gere o produto; administrador sem capacidade produtor não recebe bypass. Perfil pendente prepara/edita rascunhos e pode arquivá-los; perfil aprovado gere/publica; rejeitado não recebe novos direitos. Rascunhos incompletos são válidos quando os campos fornecidos o forem.

POST recebe campos editáveis, pelo menos `nome`, e força owner/EUR/rascunho. PUT exige `nome` e `estadoPublicacao`; todos os campos editáveis devem ser enviados na substituição. Campos opcionais omitidos são removidos e listas omitidas ficam vazias. Publicar exige os obrigatórios do modelo existente, preço/unidade/stock/categoria válidos e imagens/ingredientes coerentes. Não publicar implicitamente por guardar. Os comprimentos/cardinalidades HTTP são proteções de transporte e não migram ou truncam documentos antigos válidos.

O DTO próprio contém `etag` opaco, também devolvido no header ETag em consulta individual/criação/edição. PUT e DELETE exigem **If-Match**, incluindo aspas, recebido dessa representação própria. Não enviar `id`, owner, `moeda`, datas, `etag` ou revisão no corpo. Ausência do header dá 428, formato inválido 400 e versão antiga 412. Um ETag anterior a compra/débito de stock não pode sobrepor o stock atual. O ETag público de cache, quando gerado pelo Express, não é o token de edição.

As escritas compõem `save` validado/CAS do produto, guarda da conta e guarda limitada da revisão/estado do perfil numa transação única (snapshot/primary/majority), com três tentativas e orçamento de 10 segundos. A guarda de perfil incrementa apenas a revisão; não altera aprovação, configuração ou updatedAt comercial. Uma alteração concorrente de capacidades/aprovação gera conflito/rollback; não há bypass genérico de query updates. As guardas anteriores de stock/checkout são reutilizadas e permanecem intactas.

DELETE guarda estado arquivado, preserva IDs/referências e não reescreve snapshots de orders. Não há restauro por PUT nesta fase. Escritores nativos externos que ignorem o protocolo continuam fora das garantias. POST de produtos não tem uma chave de idempotência comercial: perante 503/resultado indeterminado, consultar produtos próprios antes de repetir; não se promete evitar duplicação entre pedidos novos após resposta perdida.

CORS passa a permitir PUT/DELETE e If-Match, expondo apenas ETag/Location além dos headers normais. Cache-Control no-store evita cache de dados privados e de disponibilidade nesta composição. Preparação explícita dos índices existentes ocorre antes do listen; não há novas coleções, modelos, índices, dependências ou alteração ao frontend. Limites de queries de leitura: maxTimeMS de 5 segundos; pesquisa regex limitada não é garantia de desempenho em produção.

## Validação e próximo âmbito

Novos testes unitários, HTTP e MongoDB real cobrem filtros/ordens/paginação, visibilidade, dados privados, rascunhos/publicação, owner, If-Match, substituição completa, arquivo, stock concorrente, revogação de papel/aprovação, rollback/retry e preservação de uma encomenda criada pelo checkout real. Os testes usam apenas bases efémeras `docampo_test_*`. Resultado final: **84 testes novos aprovados** (24 unitários, 52 HTTP e oito de integração MongoDB), **1 116 backend aprovados**, incluindo os 1 032 anteriores. TypeScript, ESLint, Prettier, build API e OpenAPI aprovados. Um rascunho legado com unidade `null`, válido no modelo anterior, omite `unidadeVenda` no DTO sem alterar a persistência.

Integração React requer adaptador de DTOs, pesquisa/paginação no servidor, fontes de opções de filtros, JWT real e tratamento de If-Match/erros. Não existe checkout HTTP, avaliação real, leilão, geocodificação, upload ou certificação verificada. Recomenda-se rever este contrato antes de autorizar a integração da Fase 5B; não a iniciar automaticamente nem executar operações Git de publicação.

---

## Registo histórico de integração anterior

# Integração futura com o frontend aprovado

> Estado vigente após nova aprovação: O01–O16 e OR01–OR12 aprovadas; orders pronto documentalmente para persistência isolada, aguardando autorização de implementação. Ver [consolidação vigente](phase-3.2-orders-readiness.md). Recomendações/pedidos de aprovação das revisões anteriores são históricos e não reabrem estas decisões.

**Análise e proposta; nenhum ficheiro do frontend é alterado.** Base `807aa68`, com 274 testes aprovados na última validação publicada. Preservar mercado, comprador, produtor, administrador, carrinho, navegação, sistema visual e testes demonstrativos. A implementação real de integração pertence à semana 4/M2 e precisa de autorização específica. A preparação documental 3.2 regista Q01/Q03/Q04/Q06/Q14 e T32-01–T32-06 no âmbito aprovado sem modificar os tipos/componentes existentes.

## Diferenças observadas e adaptações necessárias

| Aspeto           | Implementação atual                                                                      | Contrato/persistência futuros e risco                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDs              | Slugs de produto/produtor e IDs DEMO fixos; novas entradas locais sequenciais.           | C01 aprova IDs estáveis independentes dos nomes, representados como strings opacas no contrato; distinguir User de ProducerProfile. Decidir continuidade de slugs/URLs antes de mudar rotas. Nunca procurar ObjectId usando slug sem contrato.                                      |
| Identidade       | DemoSession visitor/demonstration + role; sem conta, token ou userId.                    | Sessão autenticada separada com identidade/expiração. Guardas continuam apoio visual; servidor autoriza. Não transformar botão demo em login real.                                                                                                                                  |
| Leitura privada  | BuyerDataSource/ProducerDataSource/AdminDataSource devolvem datasets assíncronos locais. | Adaptadores HTTP com validação de DTO, cancelamento e projeções. Fonte load(scenario) é de demonstração; produção não depende de query cenario para decidir disponibilidade.                                                                                                        |
| Escrita privada  | Reducers locais de reviews, produto/perfil e decisões administrativas.                   | Comandos HTTP separados com confirmação persistida, conflitos e recarregamento/invalidação de dados. Trocar apenas load não migra estes comandos.                                                                                                                                   |
| Vocabulário      | name, priceCents, availableStock, producerId, locality.                                  | Português público aprovado em C01; o rascunho usa nome, precoCent, stockDisponivel, produtorId, localidade, com campos comerciais ainda dependentes de Q. Adaptar na fronteira; não renomear componentes aprovados sem necessidade.                                                 |
| Unidade/dinheiro | Inteiros de unidades comerciais e cêntimos; form EUR vírgula/ponto.                      | Q03 aprova venda mista e Q06 EUR/cêntimos; g/ml/unidades/embalagens inteiras e half-up por linha aprovados; zero, limites e referência de preço pendentes; interpretar o texto do formulário explicitamente. Servidor calcula os totais e reconfirma preços segundo decisão futura. |
| Filtros          | Oito categorias, estações, normalizeSearch sem acentos; preçoMax em EUR no URL.          | Q14/C03 definem taxonomias, ingredientes, meses e normalização; converter query EUR para unidade interna de forma validada. Regex case-insensitive isolada pode não preservar acentos.                                                                                              |
| Paginação        | Catálogo completo local e contagem/ordenação no cliente.                                 | Endpoint paginado; forma dos metadados/total C03. Não tratar uma página como conjunto completo nem calcular dashboard sobre essa página.                                                                                                                                            |
| Perfil e imagens | Fotografias/placeholder locais e histórias/métodos fictícios; mapa ilustrativo.          | DTO pode não ter todas as propriedades visuais; usar estado de ausência/fallback, nunca histórias/certificações/coordenadas falsas. Perfil público sem dados privados; mapa Q11; Blob real na fase própria.                                                                         |
| Reviews          | ProducerReview exige demonstration:true; criação apenas de alvo produtor.                | Review real não pode ser marcado como demonstração por adaptação cega, nem vice-versa. Preparar tipo/metadado de origem separado; incluir alvo produto na fase autorizada.                                                                                                          |
| Encomendas       | Snapshots históricos e leitura dos quatro estados; não existe checkout real.             | Preservar nome/preço/unidade históricos; Q02 define grupo; Q05 transições; Q06 entrega/confirmação. Não reutilizar preço atual para reescrever histórico.                                                                                                                           |
| Leilões          | Retrato fixo e modelos de oferta atual nullable/diferenças comprador-produtor.           | Adaptar ausência/resultado/seq; não criar bid base. OwnBid compõe oferta e snapshot com observadoEm do servidor. REST não substitui Socket.IO futuro, nem relógio local define fecho.                                                                                               |
| Serviços         | realStatus nao-monitorizado separado de illustration.                                    | ServiceObservation exige origem/data; ausência de sonda real é desconhecido. Remover ilustrações do modo real ou mantê-las claramente num exemplo separado.                                                                                                                         |

## Migração gradual proposta

1. **Antes da integração:** detalhar DTOs/permissões, resolver Q aplicáveis, C03/C05 e detalhes remanescentes de C01/C02/C06; preservar C04 aprovada (segurança real na semana 4); estabilizar API e testes backend. Conservar frontend demonstrativo como referência independente.
2. **Cliente e adaptadores:** acrescentar futuramente cliente HTTP e conversores de DTOs em fronteiras dedicadas, com origens públicas de API separadas de segredos; não exportar Mongoose para packages/shared ou browser. Escolha de biblioteca ou fetch nativo fica para autorização de implementação.
3. **Leituras públicas:** migrar catálogo/perfis por fatia, preservando pesquisa, URL, paginação, galeria, fallback de imagem e navegação. Novos testes com API não substituem os testes existentes de mocks.
4. **Identidade e leituras privadas:** apenas com JWT/RBAC reais, distinguir explicitamente demo e conta autenticada; obter dados do utilizador atual sem DEMO_* ou ID enviado pelo cliente como autoridade. 401 termina/renova sessão segundo Q13; 403 explica acesso, 404 recupera recurso e 503 conserva estado sem inventar vazio.
5. **Comandos:** migrar produto/perfil, encomendas e avaliações/decisões separadamente; após sucesso persistido, atualizar as projeções relevantes. Em conflito, recuperar o estado atual; não mostrar sucesso por atualização apenas local.
6. **Regressão e tempo real:** verificar as três áreas, navegação, cesta e breakpoints; só depois integrar sockets numa autorização própria. Não iniciar esta sequência durante Fase 3.0 ou fundação isolada 3.1.

O mecanismo concreto de seleção demo/real ainda requer aprovação própria; C06 aprovada abrange configuração independente do backend, não este mecanismo; não se cria agora flag, modo de produção, provider novo ou refatoração global. Recomenda-se manter rotas/componentes e injetar fontes/comandos quando o comportamento estiver estabilizado, com separação explícita entre demonstração e conta real.

## Carrinho e stock

CartProvider aceita catálogo injetável e usa por omissão os mocks; docampo.cart.v1 guarda IDs/quantidades/snapshot de preço/unidade. Reconciliar contra um catálogo remoto vazio durante loading/erro apagaria indevidamente linhas: manter sessão e estado até leitura autoritativa bem-sucedida. A migração de slugs para IDs pode exigir tabela de correspondência ou versão de storage, por aprovar; não limpar silenciosamente a cesta.

Estar na cesta não reserva stock. O preço mostrado no cliente não autoriza o preço de compra; conforme Q06 aprovada, o servidor deve reconfirmar o preço; o mecanismo futuro pode devolver conflito/proposta de novo total e obter confirmação acordada. Falha de checkout não limpa a cesta; remover linhas apenas após confirmação inequívoca, segundo Q02. Nenhuma credencial/JWT/morada deve ser acrescentada ao storage existente como efeito lateral.

## Riscos e critérios de regressão futuros

- Preservar os 274 testes demonstrativos; acrescentar testes de contrato/adaptadores e uma suite de integração independente. Não reduzir a suite para acomodar a API.
- Verificar mapas de IDs, datas UTC/Europe/Lisbon, cêntimos/unidades, refs de produtor e ausência de dados privados. Não duplicar encomendas/leilões ao compor datasets.
- Leituras antigas não podem substituir a sessão/dados novos após logout/troca de utilizador. Cancelamento/ignorar resposta tardia e invalidação após comando devem ser testados.
- Verificar preservação da cesta ao autenticar/sair, erros HTTP, conflitos, token expirado, filtros e voltar/avançar; seis larguras 320/430/768/1024/1280/1440 px e inspeção desktop/tablet/telemóvel na integração autorizada.
- Manter tokens SCSS, componentes, layout, acessibilidade e mensagens de origem dos dados. Integração real pode exigir campos/ações funcionais acordados, mas não é autorização de redesign.

## Impactos identificados na preparação 3.2

| Fonte observada                                                  | Diferença face às aprovações                                                                                                  | Adaptação futura, não executada                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| types/market.ts: ProductCategory e Season                        | Oito rótulos e quatro estações demonstrativos; Q14 não aprova essas listas como oficiais.                                     | Mapear categoriaId estável a rótulo; etiquetas/ingredientes explícitos; meses opcionais informativos aprovados T32-04, sem inventar meses pela createdAt ou controlar disponibilidade.                                                              |
| Product.unit/availableStock e producer ProductDraft              | Texto de unidade e stock inteiro não distinguem embalagem de g/ml, referência do preço, mínimo/passo.                         | Adaptador para inteiros g/ml/unidades/embalagens aprovados e inputs por modalidade; conservar modo demo.                                                                                                                                            |
| cart/model.ts e cart/storage.ts                                  | quantityError só aceita inteiros seguros; subtotal é quantity × preço; docampo.cart.v1 não guarda escala/referência numérica. | Não injetar stock em gramas no carrinho atual como se fossem embalagens. Aprovar versão/migração do storage e calcular por referência; reconfirmar preço/unidade sem apagar cesta silenciosamente.                                                  |
| auth/types.ts: DemoSession.role e admin/types.ts: AdminUser.role | Um papel por sessão/linha; Q01 permite uma conta com múltiplas capacidades.                                                   | Conta real com identidade única, acesso às duas áreas e contexto visual separado das permissões; contagens de utilizadores por ID distinto.                                                                                                         |
| producer/types.ts: application.status pendente                   | A demonstração permite edição isolada sem ciclo real de publicação.                                                           | Perfil pendente pode preparar; estado do produto separa rascunho/publicado/arquivado; stock zero deriva esgotado sem compra; aprovação não publica; rejeitado consulta decisão/justificação. Não aplicar estas regras aos mocks por efeito lateral. |
| BuyerOrderItem/ProducerOrder/AdminOrder                          | quantity e unitPriceCents pressupõem relação comercial simples.                                                               | Snapshots de referência/conteúdo/quantidade e subtotal do servidor; não recalcular histórico com produto atual.                                                                                                                                     |
| Dashboards/seletores                                             | Soma de unidades pode misturar grandezas; limiar demonstrativo três não é Q15.                                                | Separar contagem de linhas/produtos de g/ml/embalagens, aprovados/registados e capacidades/contas; fórmulas continuam Q15.                                                                                                                          |
| Reviews e leilões                                                | Escala 1–5, referência de produtor e snapshots são exemplos; observação/autoria futura por identidade.                        | Preservar demonstration:true só no modo demo; anti-auto-licitação compara user, não perfil ou papel ativo; Q07–Q10/Q12 continuam pendentes.                                                                                                         |

Nenhum frontend, carrinho, navegação, dashboard, SCSS ou teste foi modificado. Os 49 testes backend e 274 Playwright continuam referência publicada de 3.1, sem nova execução nesta tarefa documental. Ver [proposta detalhada](phase-3.2-proposal.md).

## Consolidação técnica aprovada em 2026-10-17

T32-01–T32-06 não autorizam integração. Meses opcionais não passam a controlar stock ou publicação; esgotado é disponibilidade derivada de stock zero num publicado, sem quarto estado. A apresentação em kg/L deve converter g/ml explicitamente e mostrar os subtotais half-up do servidor; quantidades antigas do carrinho não mudam de significado por serem inteiras. Arquivo preserva snapshots históricos. A [análise do primeiro bloco](phase-3.2-readiness.md) mantém users/producers dentro da API, sem alterar papéis demonstrativos, carrinho, navegação, design ou testes.

## Bloco de identidade local implementado

A01–A03 aprovadas e users/producers implementados/testados apenas no backend, sem integração ou alteração de frontend. O perfil inclui concelho, descrição e telefone obrigatórios; responsável deriva da conta e imagem é metadado opcional. DTOs privados e formulários reais ainda precisam de alinhamento antes de qualquer integração. Ver [entrega e limites](phase-3.2-identity-implementation.md). Os 123 backend foram executados; os 274 Playwright continuam referência anterior, com ficheiros preservados.

## Contrato de produtos após P01–P08

O frontend demonstrativo permanece inalterado. Integração futura usa doze categorias, preço por kg/L ou uma unidade/embalagem, stock e quantidades mínimas em g/ml/contagens, referência separada do conteúdo da embalagem e até duas fotografias com principal identificável. A declaração de aplicabilidade de ingredientes e os campos de publicação exigem adaptação própria dos formulários; não alterar mocks por efeito da criação do schema.

P08 exige confirmação de mudanças e snapshots nas encomendas futuras; apenas um preço atual no Product não implementa reconfirmação ou preservação comercial do histórico. P07 é condição derivada de estado/stock/mínimo/perfil atual, não um booleano de disponibilidade persistido. Ver [decisões e limites implementados](phase-3.2-products.md). Não migrar o carrinho nem executar funcionalidades web nesta tarefa.

## Impacto de orders O01–O16 — integração ainda não autorizada

O frontend aprovado conserva os quatro estados demonstrativos. O domínio futuro usa seis estados O02, grupo de compra com order independente por produtor, opções de entrega/período/método por produtor, taxa, pagamento separado, receção e reclamações. [OR01–OR12](phase-3.2-orders-readiness.md) identificam escolhas antes dos adaptadores; não converter entregue/concluida silenciosamente nem considerar o desenho demonstrativo uma implementação dessas regras.

A cesta atual não armazena toda a referência/unidade necessária a g/ml e subtotal half-up; revisão de storage/DTO será explícita. Mudança de preço exige aceitação e stock insuficiente ajuste/remoção pelo comprador. Conservar carrinho em erro ou resultado de commit incerto; retirar linhas só depois de recuperar confirmação inequívoca da operação. Não distribuir moradas, métodos/valores de outras orders do grupo pelo DTO do produtor. Nenhum componente, navegação, design system, provider ou teste web é alterado nesta tarefa.

## OR aprovadas — adaptação futura, sem alterações web

O01–O16/OR01–OR12 fechadas funcionalmente. O modo real futuro apresenta concluida, entrega declarada e receção separadas, sem sétimo estado ou tradução silenciosa para os quatro estados demo. Agrega produto por ID antes de preço/quantidade e recusa subtotal zero; seleção de modalidade/período/método/taxa por produtor e recibo original do grupo são os DTOs documentais propostos.

Pedido de cancelamento pendente não congela produção; stock que não caiba na reposição fica auditado como pendente; várias reclamações podem coexistir, pausando uma só contagem que retoma o tempo restante; proposta de período não muda acordo antes de aceitação. Pagamento rejeitado/corrigido tem história própria e a reversão administrativa não apaga receção anterior nem confirma pagamentos.

Propostas, campos e regras serão adaptados só com autorização de integração, preservando cesta, áreas privadas, navegação, SCSS/design e 274 testes. Repetir checkout usa a mesma chave/condições; timeout não limpa cesta nem gera compra nova. Não inferir estados atuais a partir do recibo original de replay. Nenhuma fonte demonstrativa é promovida a autenticação ou backend real.
