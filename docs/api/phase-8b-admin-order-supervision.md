# Fase 8B — supervisão administrativa de encomendas

Implementação local sobre `dd1e7f9`, em `feat/api-foundation`. Concretiza a consulta global de encomendas de RF-ADM-01 sem conferir poderes operacionais ao administrador. Reutiliza o modelo orders, snapshots, autenticação JWT, autorização atual, cliente HTTP, navegação privada e design system. Os contratos e comandos do comprador/produtor e o checkout transacional mantêm-se.

## Endpoints e arquitetura

| Endpoint                            | Contrato                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/orders`             | Listagem global paginada, filtros combináveis e contagens por estado do mesmo conjunto filtrado. Resumos sem linhas, moradas, contactos ou emails.                   |
| `GET /api/admin/orders/:id`         | Linhas, quantidades, preços de referência, unidades, subtotais, taxa, total, estados e local/período inicial da compra. Identidades mínimas das contas relacionadas. |
| `GET /api/admin/orders/:id/history` | Histórico paginado de `historicoEstado` ou `pagamento.historico`, escolhido por `dominio=operacional                                                                 | pagamento`. Não agrega outros domínios de auditoria. |

Contratos executáveis no [OpenAPI](openapi.yaml). Módulo `admin-orders` separa validação, projeções e consultas. As rotas integram o router administrativo existente: as mesmas guardas JWT/papéis, cache privada e limites da Fase 8A, sem uma segunda administração. O runtime e o servidor de integração real ligam o serviço à mesma conexão MongoDB. Não há comandos novos, listeners de encomendas, polling ou escrita comercial.

## Pesquisa, filtros e paginação

- `identificador`: ObjectId completo exato da encomenda. Não aceita pesquisa parcial, nomes, regex ou operadores MongoDB.
- `comprador` e `produtor`: IDs de contas **users**, não de perfis producers. Apresentados na listagem e detalhe para poder copiar uma referência inequívoca. Pesquisa por nomes de participantes e seletores remotos não fazem parte desta fase.
- `estado`: pendente, confirmada, em_preparacao, pronta, concluida ou cancelada.
- `pagamento`: por_pagar, pagamento_comunicado ou pago, independente do estado operacional.
- `desde` e `ate`: dias válidos em formato YYYY-MM-DD e UTC, ambos inclusivos. O limite final é convertido no dia seguinte exclusivo no MongoDB; não usa o fuso do browser nem omite o último milissegundo. Intervalo invertido é inválido. Limites técnicos: 1970-01-01 a 9999-12-30.
- `pagina`: 1–1000; `porPagina`: 12/24/36; `ordem`: recentes/antigas. Ordenação por createdAt e _id na mesma direção. Histórico desempata pela posição original do evento.

Zod recusa parâmetros desconhecidos, duplicados, objetos, enums/datas/IDs inválidos e paginação excessiva. Pesquisa e contagens são executadas no backend. Uma agregação com `$facet` devolve itens limitados e contagens do mesmo conjunto, sem carregar tudo para o React. Consulta com majority/primary e orçamento de 5 s; nomes atuais são uma consulta posterior limitada às contas da página. Não se promete snapshot transacional conjunto com a atualização posterior de nomes.

A API devolve páginas inexistentes vazias, conservando totais reais. O React corrige para a última página consultável (ou 1 no vazio), preserva filtros, substitui a URL e foca o título depois da resposta confirmada. Alterar filtros regressa à primeira página. Os campos de pesquisa são submetidos explicitamente; filtros e paginação ficam na URL. Histórico separado usa páginas de 12 e nunca carrega toda a auditoria no detalhe.

## Snapshots, privacidade e histórico

Nome do produto, quantidade, unidade, preço por referência, subtotal, taxa e total vêm exclusivamente da encomenda. Reutiliza-se a projeção `buyerOrderDto` para as linhas/valores; não se procura o preço atual do catálogo nem se recalculam valores históricos. `OrderDetails` é reutilizado sem alterações aos percursos comprador/produtor. O parser existente mantém as verificações de totais inteiros seguros.

Identificação mínima: contaId e nomeAtual (ou null se já não existir). Nomes atuais são explicitamente distinguidos de snapshots; não se apresenta o nome como sendo o da data da compra. Não há emails, telefone privado, password/hash, tokens, revisões técnicas, chaves de idempotência, fingerprint, manifesto ou recibos de outras encomendas nas projeções.

O detalhe apresenta o local de levantamento ou a morada/concelho da entrega e o período **inicial** com o fuso persistido. Não devolve contacto privado nem configuração comercial atual; não promete representar propostas de reagendamento posteriores. Essa limitação fica visível na interface.

O histórico apresenta tipo/data, de/para e responsável quando persistidos: conta/papel da ação ou sistema sem identificador interno. Justificação é apresentada quando existe. Comando, revisão observada e conteúdo interno não atravessam o contrato. Eventos sem estado anterior/seguinte ou ator são identificados como não registados; não se infere `de` a partir do evento anterior. Operacional e pagamento têm fontes e páginas distintas, sem eventos sintéticos. Auditorias de cancelamento, receção, reclamações, reposição de stock e propostas de agenda não são disponibilizadas por este endpoint.

## Indicadores e MongoDB

Total confirmado e seis contagens por estado, calculados na mesma agregação da listagem. Respeitam **todos os filtros**, mas não o número da página. Erros nunca se transformam em zeros; zeros são dados confirmados. Não se acrescenta soma financeira: valor das encomendas não equivale a receita recebida e o estado pago não constitui conciliação de movimentos financeiros.

Acrescentam-se cinco índices não únicos em orders: `(createdAt desc, _id desc)`, `(estado, createdAt desc, _id desc)`, `(pagamento.estado, createdAt desc, _id desc)`, `(produtor, createdAt desc, _id desc)` e `(comprador, createdAt desc, _id desc)`. A preparação existente de orders cria-os antes de listen. Mantêm-se todos os índices anteriores, incluindo unicidade da compra/produção e chave global de idempotência. Não há novas coleções, migração de documentos, alteração de validações comerciais, stock ou efeitos colaterais. Combinações arbitrárias podem exigir filtragem residual; o orçamento temporal limita consultas, sem alegação de desempenho industrial ou índice para cada combinação.

## Segurança e recuperação

Todos os endpoints exigem JWT válido, conta ativa e papel atual administrador, verificados no middleware existente e novamente na entrada do serviço. Comprador/produtor recebem 403, falta de token/conta desativada 401, filtros inválidos 400, ausente 404 e indisponibilidade conhecida 503, com erros estruturados sem detalhes internos. `Cache-Control:no-store` e rate limiting administrativo da Fase 8A (240/IP e 120/conta por minuto, por instância) são reutilizados. Consultar não exige capacidade de comprar/vender e não concede capacidade de operar a encomenda.

O transporte autenticado preserva JWT em memória e cancelamento/respostas vinculadas à sessão e consulta atuais. Alterar filtros, sair ou perder permissões não permite aproveitar uma resposta antiga. Não há dados de encomendas ou contactos novos no storage. 403 remove o conteúdo e permite confirmar acesso; 401 termina a sessão segundo o cliente existente. Falhas de rede mostram uma mensagem segura com uma ação de repetição GET, sem sucesso falso ou comandos automáticos.

## React, responsividade e acessibilidade

Rotas `/area/administrador/encomendas` e `/area/administrador/encomendas/:id`, ligadas ao dashboard real e à navegação privada existente. Cartões adaptativos, filtros em uma coluna no mobile, duas no tablet e três no desktop; sem tabela larga. Referências de contas em linhas próprias, ID do detalhe com escala contida. Superfícies, paleta e tipografia existentes preservadas.

Reutiliza Button, FormField, ProducerSelect, StatusBadge, PriceDisplay, LoadingSkeleton, EmptyState, AdminFeedback e OrderDetails. Labels explícitas, validação nativa dos IDs/datas, carregamento/vazio/erro distintos, anúncios discretos, um único alerta por falha e foco no grupo de recuperação. Paginação é um nav com nome, botões desativados nas fronteiras e foco no título após navegação. Estados têm texto, não apenas cor.

Verificação nas seis larguras 320/430/768/1024/1280/1440 px: listagem, detalhe, histórico operacional/pagamento, filtros/indicadores, vazio e erro/recuperação. Integrações reais guardam PNG, árvores AX e medições de contraste fora do repositório quando `DOCAMPO_ADMIN_ORDER_SCREENSHOTS` está definido. Verificação por teclado, foco e contraste calculado no Chrome; **VoiceOver audível não testado**, sem alegação de certificação WCAG ou cobertura de todos os browsers.

## Testes e revisão

Testes novos cobrem validação/filtros/datas, projeções, fronteira HTTP por papel, paginação/ordenação global, snapshots, estados independentes, históricos paginados, privacidade, conta desativada, UI/loading/vazio/erro/recuperação, navegação e responsividade. Integração React/API/MongoDB utiliza compras reais criadas pelo checkout existente, com vários produtores; verifica transição pelo produtor e consulta administrativa posterior. A falha de rede é injetada apenas no transporte; a recuperação volta à API real.

A regressão completa preserva checkout/atomicidade/rollback/idempotência, encomendas comprador/produtor, candidaturas, contas e leilões. Asserções antigas de contagem fixa de índices são atualizadas para os novos índices, conservando os testes de unicidade/ausência de TTL. A regressão encontrou uma asserção anterior da Fase 8A que exigia 412 em duas decisões concorrentes sobre a mesma conta, embora o limite de tentativas transacionais já permita 409. Apenas esse teste passa a aceitar os dois códigos contratuais, exigindo uma única decisão, uma auditoria com o autor vencedor e o estado persistido correto; a implementação de contas permanece intacta. Os testes de leilões não são alterados; qualquer instabilidade de datetime-local é registada separadamente nos resultados da entrega.

## Limites e revisão manual

Sem alteração/cancelamento administrativo, pagamentos, reembolsos, escrita de histórico, preços, quantidades, produtos ou stock. Sem novas dependências, mudanças à Fase 0 ou às demonstrações aprovadas. Nenhuma Fase 8C/9 é iniciada.

Para rever, iniciar o replica set de teste e a configuração de integração do projeto, com contas fictícias provisionadas pelo cenário de teste. Executar `npx playwright test admin-orders.real --config playwright.integration.config.ts`; os testes criam a sua base efémera e encerram-na. Para revisão manual continuada, combinar os dois modos isolados **já existentes**, verificados nesta entrega. Com Docker em execução, da raiz:

```sh
npm run mongo:test:up --workspace @docampo/api
```

Num terminal dedicado à API:

```sh
DOCAMPO_ADMIN_APPLICATION_REVIEW=1 DOCAMPO_PRODUCER_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs
```

Noutro terminal:

```sh
VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183
```

Abrir `http://127.0.0.1:5183/entrar`. A API comunica os caminhos de dois ficheiros privados temporários com contas fictícias; usar uma conta com `papel=administrador` do ficheiro de revisão administrativa. Não copiar as credenciais para documentação ou Git. A compra fictícia multi-produtor do modo de produção fornece duas encomendas reais para supervisionar. A API usa uma base `docampo_test_web_*` efémera e JWT de revisão com duração limitada; encerrá-la com Ctrl+C remove a base e os ficheiros de credenciais. Estes modos não pertencem ao runtime de produção. Não executar em paralelo com Playwright real, que usa as mesmas portas. A autorização continua no backend, sem provisionamento pelo browser ou registo público.

Entrar como administrador → «Supervisionar encomendas» → combinar estado/pagamento/IDs/datas → mudar página/ordem → consultar detalhe → alternar histórico → simular falha de rede e repetir. Confirmar ausência de comandos operacionais e comparar uma compra entre comprador, produtor e administrador. As capturas da entrega permitem revisão visual sem reter credenciais ou uma base de dados aberta.

## Resultado final da execução integrada

- 1 712 testes backend aprovados, em 48 ficheiros; 53 novos relativamente aos 1 659 anteriores.
- 576 testes frontend habituais, 99 integrações reais React/API/MongoDB e 12 testes reais de leilões/Socket.IO: **687 testes frontend distintos**, incluindo 20 novos. Suites completas reexecutadas nesta fase; sem skips no resultado final.
- TypeScript API/frontend, ESLint, Prettier com ignore explícito da raiz, builds API/web, OpenAPI e diff aprovados. 855 referências OpenAPI e quatro respostas reais validadas; 583 destinos Markdown e cinco âncoras internas válidas. Nove documentos da Fase 0 comparados byte a byte com main.
- 36 capturas fora do Git, seis cenários em cada largura; 1 260 amostras de contraste calculado, mínimo observado 5,2369:1, sem falhas nos limiares aplicáveis. Teclado/foco, nomes acessíveis, alerta único e ausência de overflow/erros JavaScript verificados. VoiceOver audível não executado.
- Instabilidade anterior: o teste de concorrência administrativa recebeu 409 em vez do 412 assumido em duas execuções intermédias. Corrigida apenas a asserção, para o contrato existente e invariantes reforçadas; nenhuma mudança ao serviço de contas. Asserções de índices atualizadas para 11 índices. A instabilidade histórica de segundos 00 em datetime-local não ocorreu na regressão final de leilões, cujos testes permaneceram intactos.
- O novo cenário de paginação foi corrigido durante o desenvolvimento: 13 produtores exigem duas compras, respeitando o limite existente de dez por checkout. As compras finais foram criadas pelo serviço real; não se aumentou o limite ou inventou persistência. Ajustes de tipagem dos cenários não alteram regras comerciais.
- Estado preparado para revisão/consolidação: 29 ficheiros locais (14 novos, 15 modificados), staging vazio, sem commits/push, dependências preservadas e main intacta. Proposta: `feat(admin): add order supervision`.
