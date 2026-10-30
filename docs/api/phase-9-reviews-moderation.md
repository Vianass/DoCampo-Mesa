# Fase 9 — avaliações reais e moderação administrativa

Implementação local sobre `da7f50b6a5576704dedb63bcf6748ec663f1d6b3`, na branch `feat/api-foundation`. Complementa RF-AVA-01/02 e as integrações de encomendas, autenticação, catálogo e administração existentes. Os nove documentos originais da Fase 0 permanecem intactos.

## Regras confirmadas pelo utilizador nesta fase

- Apenas encomendas persistidas como `concluida`, com a evidência de conclusão que o modelo já exige. Não se promove `pronta` a entrega, não se confirma pagamento por inferência e não se altera o ciclo de encomendas.
- Uma avaliação por comprador/encomenda/produto e uma avaliação direta por comprador/encomenda/produtor. Novas compras permitem novas experiências; ocultar não liberta a unicidade.
- Classificação inteira 1–5; comentário obrigatório de 1–1000 caracteres Unicode, normalizado em NFC e aparado, sem controlos perigosos. Texto simples, apresentado por React sem interpretação de HTML.
- Publicação inicial imediata. Comprador e administrador não editam nem eliminam o comentário ou a classificação. Administrador pode ocultar/restaurar com motivo e auditoria.
- Médias de avaliações de produtos e de avaliações diretas de produtores são separadas, incluindo no perfil público.

**Dependência operacional conhecida:** o fluxo real atual só permite `pendente → confirmada → em_preparacao → pronta`. A declaração de entrega/levantamento e confirmação de receção de O13 ainda não estão expostas. Por isso as compras desse percurso continuam inelegíveis nesta fase. A API e os formulários aceitam uma compra histórica concluída válida, mas nenhum botão ou endpoint desta fase cria artificialmente essa conclusão. Os testes positivos e a revisão visual usam fixtures históricas explicitamente fictícias; isso não é prova de um percurso operacional completo de entrega. O checkout real pendente é exercitado como caso negativo.

## Arquitetura e dados

Módulo `reviews`, com tipos, modelo, validação Zod, serviço transacional e routers. Reutiliza Express, Mongoose, JWT, papéis atuais, revisão operacional de contas, cliente HTTP/sessão React, componentes privados, ReviewCard, formulários, ConfirmationDialog e paginação existentes. Nenhuma dependência nova, servidor paralelo ou novo mecanismo de autenticação.

Coleção `reviews`, já prevista em T32-06. Campos privados: autor/encomenda, referência da conta vendedora, referência do perfil e histórico de decisões. Alvo exclusivo: `produto` ou `produtor` conforme `alvoTipo`; `vendedor` permite agregar produtos da mesma origem sem confundir isso com avaliação direta do produtor. Nome do alvo guardado como snapshot; conteúdo e identidade da compra são imutáveis. Estado `publicada`/`oculta`, versão inteira e timestamps. O serviço resolve encomenda/produto/produtor/perfil; a entrada nunca aceita autor, produtor livre, elegibilidade, estado inicial ou auditoria.

Nove índices: dois únicos parciais por autor/encomenda/produto ou autor/encomenda/produtor; produto/estado/data/ID; perfil/alvo/estado/data/ID; autor/data/ID; encomenda; estado/data/ID; classificação/data/ID; data/ID. Não se altera qualquer índice ou regra de orders/products/auctions/bids. Preparação das coleções/índices antes de listen, nos padrões existentes; sem migração de dados de produção.

## Endpoints implementados

| Endpoint                                  | Âmbito                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GET `/api/products/:id/reviews`           | Público; avaliações publicadas desse produto.                                                             |
| GET `/api/producers/:id/reviews`          | Público; `alvoTipo=produtor` por omissão; `produto` consulta as experiências dos produtos, separadamente. |
| GET `/api/me/review-eligibility`          | Comprador; compras próprias e alvos já avaliados/elegíveis.                                               |
| GET `/api/me/reviews`                     | Comprador; histórico próprio, incluindo avaliações ocultadas.                                             |
| GET `/api/me/reviews/:id`                 | Comprador proprietário; detalhe original e estado.                                                        |
| POST `/api/reviews`                       | Comprador; valida compra e alvo; 201, com Location privado.                                               |
| GET `/api/admin/reviews`                  | Administrador; pesquisa e filtros globais.                                                                |
| GET `/api/admin/reviews/:id`              | Administrador; conteúdo preservado, referências e ETag.                                                   |
| GET `/api/admin/reviews/:id/history`      | Administrador; decisões paginadas com versão de snapshot.                                                 |
| PATCH `/api/admin/reviews/:id/moderation` | Administrador; `estado`, `motivo` e If-Match forte atual.                                                 |

O contrato implementado está no [OpenAPI](openapi.yaml), com schemas próprios da Fase 9. Os antigos contratos propostos de denúncias continuam assinalados como propostas; não são operações implementadas por inferência.

Queries estritas, IDs completos e paginação 1–1000, 12/24/36 itens, ordem recentes/antigas por criação e ID na mesma direção. Na administração: `identificador` exato, `produto`, `produtor` como **ID do perfil público**, `estado`, `classificacao` e `alvoTipo`. Pesquisa textual por comentário não foi acrescentada. Inputs extra, operadores, IDs inválidos e queries duplicadas são rejeitados. Orçamento de consulta 5 s. Não há paginação de toda a coleção no browser.

Sem cache persistente: Cache-Control no-store. Erros seguros 400/401/403/404/409/412/428/429/503. ETag ausente 428, malformado 400, desatualizado 412; mesmo estado 409. Resultado transacional desconhecido devolve 503 com instrução para consultar antes de repetir. Não há promessa de idempotência por chave; a unicidade e o ETag impedem duplicação de avaliações/decisões, sem repetir escritas automaticamente no browser.

## Visibilidade, médias e privacidade

DTOs públicos contêm apenas nome do alvo, classificação, comentário, data, referências públicas e pseudónimo HMAC específico da avaliação, sem nome/email/ID privado do comprador, encomenda ou histórico de moderação. A referência da compra só aparece ao proprietário e na consulta administrativa autorizada. O responsável e o motivo das decisões só são apresentados na administração. Uma conta desativada não consegue consultar ou escrever por JWT antigo; desativar a conta não apaga automaticamente avaliações históricas.

Consultas públicas verificam a disponibilidade do produto/perfil pelos mecanismos de catálogo existentes e filtram `estado=publicada`. Itens, total, média e distribuição são derivados no mesmo `$facet`; os agregados cobrem todos os resultados do alvo, não apenas a página. Vazio tem média `null`, nunca classificação zero ou fictícia. Ocultação retira o registo de novas consultas públicas e de todos os agregados correspondentes; restauro volta a incluí-lo. Não há contadores desnormalizados que possam divergir.

Uma consulta iniciada antes de uma decisão pode refletir o estado observado antes dela. Páginas não representam um snapshot fixo entre pedidos. Um comentário já entregue a um navegador não pode ser retirado retroativamente; a interface pública oferece atualização explícita. Não se acrescentaram eventos Socket.IO ou uma promessa de moderação instantânea em ecrãs já abertos.

## Concorrência e auditoria

Criação e moderação usam transações snapshot/majority, tempo e tentativas limitados, com consulta e escrita condicional da revisão operacional da conta que age. Isto impede que uma desativação concorrente seja ignorada pela escrita. A compra concluída é terminal no domínio existente e é lida na transação; não se alteram estado, stock, pagamentos, versão ou histórico da encomenda para permitir avaliar.

Dois pedidos para a mesma compra/alvo: apenas um registo persiste; o outro recebe 409. Dois administradores com o mesmo ETag: apenas uma decisão vence; o outro tem de consultar uma versão atualizada. A atualização condicional de estado/versão e o append do evento acontecem na mesma escrita transacional. Evento inclui responsável, data, estado anterior/novo, motivo e versão. Não é possível sobrescrever conteúdo ou eliminar auditoria pelos endpoints.

Histórico embebido até 1000 decisões, limite conservador de tamanho; atingir o limite recusa uma nova decisão sem truncar ou apagar eventos. Consulta histórica é paginada numa transação de leitura. Não é um mecanismo de arquivo ilimitado nem uma garantia contra alteração direta por um operador com acesso irrestrito à base de dados.

## Interfaces e acessibilidade

- Comprador: `/area/comprador/avaliacoes`, compras próprias, elegibilidade explícita, formulário de produto ou produtor, confirmação, histórico e detalhe `/:id`. A dependência de conclusão de encomendas é visível. Resultado incerto bloqueia novo POST até consultar o histórico.
- Produto: secção pública com média real, total, distribuição e comentários paginados.
- Produtor: secções independentes para avaliações diretas e para produtos da origem, com médias separadas. Sem associar avaliações do protótipo à conta real.
- Administração: `/area/administrador/moderacao`, pesquisa por referências, filtros, paginação, detalhe `/:id`, ocultação/restauro, confirmação nativa e histórico de decisões. Um conflito/resultado incerto obriga a consultar antes de decidir outra vez.

Cartões, cores e tipografia aprovados; grelhas responsivas sem tabela larga. Labels, rádio nativo 1–5 navegável por setas, checkbox de confirmação, foco visível, dialog com foco contido e cancelamento inicial, loading, vazio, alertas, erros recuperáveis e proteção contra respostas de uma sessão antiga. Não se injeta HTML dos comentários, mesmo quando o texto contém tags. O ReviewCard conserva por omissão o selo «Demonstração» dos percursos anteriores; o selo «Compra verificada» só é usado nas novas projeções confirmadas.

## Testes e verificação

Testes backend de validação/modelo, HTTP sem autenticação configurada e integração MongoDB: elegibilidade, compra real pendente, fixtures históricas concluídas, propriedade, alvo, escalas/limites, unicidade, concorrência, médias, paginação, ocultação/restauro, auditoria, ETag, papéis e contas desativadas, proteção dos dados e preservação de orders/stock.

Frontend: parsers, integridade de agregados, vazio sem média fictícia, ETag, teclado, confirmação, perda de resposta, conflito, perda de acesso e texto seguro. Integrações reais React/API/MongoDB para submissão, publicação, moderação, auditoria, compras/alvos e concorrência; inspeção nas larguras 320/430/768/1024/1280/1440 px. Capturas, árvores AX, ariaSnapshots e contraste calculado guardados em diretório temporário fora do repositório. VoiceOver audível e dispositivos físicos não testados; não se afirma certificação WCAG integral.

Dois testes antigos de detalhe do perfil passam a verificar as duas secções vazias reais e a ausência de classificações/avaliações fictícias, em vez de um aviso de funcionalidade indisponível. O mock do catálogo fornece apenas um envelope vazio para as novas rotas públicas. Isto é atualização ao novo contrato; não se alteram testes antigos de leilões/encomendas ou autenticação para mascarar regressões. Resultados finais e eventuais instabilidades acompanham o relatório de entrega.

## Revisão manual isolada

Com dependências existentes, da raiz:

```sh
npm run mongo:test:up --workspace @docampo/api
```

Terminal API:

```sh
DOCAMPO_REVIEWS_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs
```

Terminal React:

```sh
VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183
```

A API imprime o caminho de um ficheiro privado temporário (0600) com contas fictícias de comprador/produtor/administrador, IDs de produto/perfil e uma encomenda histórica concluída elegível. Não copiar passwords para o Git ou relatório. Entrar em `/entrar`, consultar compras/avaliações na área do comprador, publicar numa compra histórica e observar as páginas públicas. Depois terminar sessão e entrar como administrador, abrir Moderação, filtrar, consultar detalhe, ocultar/restaurar com motivo e verificar o histórico e uma nova consulta pública. A seed tem avaliações publicadas e ocultas, sem fingir que a receção foi confirmada pelo fluxo real da plataforma.

Não partilhar portas 3011/5183 com suites de integração. Ctrl+C na API encerra serviços, remove a base efémera e os ficheiros privados; nunca usa produção. O modo de revisão não é importado pelo runtime de produção.

## Limitações e entrega

### Validação final local — 30/10/2026

| Suite completa                                          | Resultado                           |
| ------------------------------------------------------- | ----------------------------------- |
| Backend, incluindo HTTP, MongoDB e Socket.IO existentes | 1800 testes aprovados, 53 ficheiros |
| Frontend habitual                                       | 606 testes aprovados                |
| Integrações reais React/API/MongoDB/Socket.IO           | 122 testes aprovados                |
| Regressões reais dos leilões existentes                 | 12 testes aprovados                 |

São **740 testes frontend distintos e 1800 backend**, com 53 testes backend e 24 frontend novos nesta fase. Após a última alteração de acessibilidade, as duas suites frontend completas foram repetidas. Corrigiu-se a perda de foco para o corpo após uma decisão: agora o foco regressa ao título depois da consulta confirmada, tal como na paginação das áreas de comprador/produto/administração. A regressão real com 13 avaliações e as seis larguras confirmam esse comportamento.

TypeScript API/frontend, ESLint, Prettier com ignore explícito da raiz, builds API/frontend, OpenAPI, ligações Markdown, verificação de segredos, integridade da Fase 0 e `git diff --check` aprovados. Sete respostas HTTP reais, incluindo uma página vazia com média `null`, foram validadas contra os schemas novos. Os contratos anteriores fora dos quatro percursos de avaliações que eram propostas permanecem iguais. Sem dependências novas ou alterações às regras de encomendas/leilões.

Foram guardadas 75 capturas fora do repositório (72 cenários nas seis larguras e três do modo manual), árvores AX/ariaSnapshots e 1434 amostras de contraste de texto, com mínimo observado de 5,24:1. A revisão manual documentada foi exercitada com contas fictícias, médias separadas e avaliações publicadas/ocultas; sem pageerrors ou credenciais nos logs. Processos, ficheiros privados e bases web efémeras removidos, MongoDB de teste encerrado e MongoDB de desenvolvimento preservado.

Na primeira suite frontend, três falhas estavam ligadas à apresentação anterior do perfil (duas expectativas de avaliações indisponíveis e uma concordância de texto). Foram corrigidas dentro do âmbito desta integração, mantendo a ausência de avaliações fictícias. Houve também uma falha isolada de recuperação demonstrativa com feedback vazio: a repetição focada de 84 testes e as suites completas posteriores passaram, sem alterar o teste ou a lógica de autenticação. A causa dessa ocorrência isolada não foi confirmada; não se alega uma correção da autenticação ou uma instabilidade preexistente demonstrada. Os testes antigos de leilões e encomendas não foram alterados.

Inventário final: **41 ficheiros, 23 novos e 18 modificados**. Código da aplicação, testes, configurações e recursos permaneceram iguais durante as verificações finais; a documentação foi concluída após os resultados. Staging vazio, sem commits ou push. Relatório completo, inventário e hashes de entrega acompanham as evidências temporárias da revisão.

Sem confirmação operacional de receção nesta fase, sem edição/eliminação de conteúdo, sem denúncia por utilizadores ou moderação genérica de outros conteúdos. Estes últimos continuam requisitos académicos a concretizar num âmbito autorizado; não são apresentados como concluídos. Sem atualização pública por push, pesquisa textual/autocomplete, histórico ilimitado ou ensaios de carga de produção. O desfasamento de relógios observado na Fase 8C é uma limitação do ambiente dos testes temporais; não se altera o relógio autoritativo ou regras de leilões.

Trabalho exclusivamente local, sem staging, commits, push, merge, rebase, PR ou início da Fase 10. Proposta após autorização: `feat(reviews): add verified reviews and moderation`, para `origin/feat/api-foundation`.
