# Orders — Etapa 2: persistência isolada

Implementação local de 22 de outubro de 2026, em `feat/api-foundation`, HEAD `15c85e95395d9421ef3f65d909c29406f2633032`; main `c10d031`. Autoriza apenas schema, validações, índices, fixtures, testes e este relatório. Sem staging, commits, push, endpoints, checkout, serviços comerciais ou autenticação. A [consolidação O01–O16/OR01–OR12](phase-3.2-orders-readiness.md) permanece a referência funcional; os seus registos anteriores são preservados, não reescritos.

## Ficheiros

Criados exclusivamente:

- [order.model.ts](../../apps/api/src/modules/orders/order.model.ts): factory `createOrderModel(connection)`, schemas embebidos e hooks.
- [order.validation.ts](../../apps/api/src/modules/orders/order.validation.ts): coerência de persistência, evolução documental e medição BSON.
- [order.serialization.ts](../../apps/api/src/modules/orders/order.serialization.ts): resumo comum minimizado.
- [order-fixtures.ts](../../apps/api/tests/support/order-fixtures.ts): dados exclusivamente fictícios para as fases e situações aprovadas.
- [order-model.spec.ts unitário](../../apps/api/tests/unit/order-model.spec.ts): validações locais, evolução, privacidade e capacidade.
- [order-model.spec.ts integração](../../apps/api/tests/integration/order-model.spec.ts): persistência, índices e concorrência documental com MongoDB real.
- Este documento.

Nenhum ficheiro preexistente é modificado. Inclui a preservação integral dos quatro ficheiros da Etapa 1, dos modelos users/producers/products, frontend, dependências, configurações, alterações documentais anteriores e nove documentos da Fase 0.

## Modelo

Coleção `orders`; cada documento pertence a um produtor e referencia comprador/produtor em `users`. Produtos e orders do recibo usam referências ObjectId. Essas referências descrevem identidade, não verificam a existência ou elegibilidade de uma conta.

Subdocumentos: linhas comerciais com unidade completa/versionada, período e snapshot de entrega/levantamento, acordo atual e propostas, pagamento/histórico, pedidos de cancelamento, cancelamento/reposições/movimentos, receção/cronómetro, reclamações/intervenções e idempotência opcional na âncora. Todos usam `strict: throw`, sem IDs ou versionamento Mongoose implícitos nos subdocumentos. IDs de domínio são explícitos. Não existe uma coleção de operações ou de reclamações.

Os seis estados de encomenda e os enums auxiliares vêm da Etapa 1. Não existe estado `entregue`. Declaração de entrega e confirmação de receção são datas/acontecimentos distintos; os dados da conclusão automática não executam qualquer job. O método de pagamento é imutável, mas o estado tem histórico próprio e não é alterado por conclusão/cancelamento.

Criação exige identidade, linhas, totais, condições iniciais, pagamento e histórico inicial, estado e estrutura do cronómetro. Pode omitir propostas, pedidos, reclamações, cancelamento, entrega declarada, confirmação e idempotência. Dados de etapas posteriores só são exigidos quando essas situações estão representadas: conclusão com data/modo/auditoria, cancelamento com contexto, proposta selecionada já aceite, entrega com morada/contacto/concelho, reclamação resolvida com decisão adequada.

## Validações e escrita

- Quantidades, referências comerciais, mínimos, incrementos e preços reutilizam `calculateOrderLineSubtotal`. `calculateOrderProductsSubtotal` e `calculateOrderTotal` verificam os valores recebidos; o schema não recalcula nem substitui snapshots silenciosamente.
- Rejeita linhas repetidas por produto ou ID, inteiros inválidos, totais incoerentes e taxa de levantamento. Peso/volume mantêm g/ml e preço por kg/L; embalagem continua distinta do seu conteúdo.
- Datas têm de ser instâncias Date válidas. Intervalo com fim posterior ao início e zona reconhecida por `Intl.DateTimeFormat`. A interpretação de horas locais ambíguas/inexistentes ficará no futuro adaptador/serviço; o modelo recebe instantes UTC já definidos.
- Históricos estruturados, com IDs próprios, comando, ator real ou técnico, data, versão observada e estado canónico quando aplicável. IDs de acontecimentos não se repetem no respetivo histórico; um comando pode originar vários acontecimentos com IDs diferentes. O último estado registado deve corresponder ao estado atual.
- Pagamento confirmado requer ator produtor; confirmação direta só para dinheiro. Rejeição de comunicação exige justificação; reversão de pago exige ator administrativo justificado. Estes campos verificam coerência do registo, sem autenticar o responsável.
- Reposição mantém `reposta + pendente = autorizada` e `autorizada + naoRepor = debitada`; movimentos somam a quantidade reposta e respeitam capacidade observada e teto da modalidade. A linha/unidade original não é convertida; nenhum stock real é alterado.
- Várias reclamações semelhantes podem coexistir. Resolução exige comprador ou administrador com justificação. O estado recebido do cronómetro tem de respeitar pausa enquanto existirem reclamações não resolvidas e retoma do tempo restante. Não se calcula automaticamente uma pausa ou conclusão.

Documentos carregados guardam um baseline interno, fora da persistência e serialização. A comparação na validação impede reescrever identidade, linhas, totais, condições iniciais, método, recibo e acontecimentos anteriores. Permite acrescentar acontecimentos, propostas e reclamações, preservando os conteúdos originais e os prefixos de auditoria. Reposições já registadas não podem diminuir. Documentos parciais podem ser lidos/serializados, mas não guardados, incluindo projeções que excluem campos privados aninhados.

`versao` é a chave de versão Mongoose, com `optimisticConcurrency: true`: `save()` incrementa-a e uma cópia antiga falha com VersionError, protegendo os históricos entre escritores cooperantes. Não deve ser atribuída manualmente. Timestamps são geridos pelo Mongoose.

Reutilizam-se as guardas existentes contra query updates, replace, insertMany, bulkWrite e save sem validação completa. A eliminação pelo modelo também é bloqueada neste bloco. As verificações cruzadas usam hooks assíncronos de `validate`/`save`; `validateSync()` não é uma prova suficiente de coerência. Acesso nativo à coleção, operações fora destas guardas e alterações diretas à base não ficam protegidos pelo schema.

## Índices

`autoCreate`/`autoIndex` ficam desligados. Os testes criam e aguardam explicitamente os índices na sua base aleatória; não executam syncIndexes nem limpam desenvolvimento.

| Índice                                                    | Finalidade                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `_id` único, nativo                                       | Identidade do documento.                                                                        |
| `{ comprador: 1, createdAt: -1 }`                         | Histórico cronológico do comprador.                                                             |
| `{ produtor: 1, estado: 1, createdAt: -1 }`               | Gestão por produtor/estado/data.                                                                |
| `{ operacaoCompraId: 1, produtor: 1 }`, único             | Várias orders por operação, uma por produtor. O prefixo suporta consultas da operação.          |
| `{ 'idempotencia.chave': 1 }`, único parcial para strings | Chave global, mesmo entre operações com produtores disjuntos; orders sem âncora podem omiti-la. |
| `{ estado: 1, 'rececao.limiteAtualEm': 1 }`               | Consulta operacional para futuro processamento de prazos. Não é um TTL.                         |

Unicidade não cria um checkout: determinar a âncora, validar propriedade, calcular/comparar o hash, garantir que só existe uma âncora por grupo, gravar todos os membros/stock atomicamente e devolver o recibo original são obrigações do serviço futuro. O modelo valida apenas a coerência local entre manifesto/recibo/âncora e a unicidade dos índices.

## Privacidade

`toJSON()` e `toObject()` usam `serializeOrderSummary`, com uma lista explícita de campos: ID, estado, totais/moeda/datas, linhas comerciais minimizadas e método/estado de pagamento. O resumo não inclui comprador/produtor populados, morada, contacto, reclamações detalhadas, atores, versões, históricos, chave, hash ou manifesto. Populates não transportam contas ou produtos completos para esse resumo.

Não há DTO HTTP final nem função que atribua acesso por um papel recebido. Comprador, produtor e administrador terão projeções contextualizadas, após autenticação/autorização e verificação de propriedade/necessidade nos serviços futuros. O resumo comum não substitui esse trabalho.

O documento interno conserva dados privados necessários. `lean()`, leitura nativa e a opção explícita `transform: false` não são projeções públicas seguras. Não devolver esses objetos diretamente. O baseline e os validadores usam a representação interna de forma deliberada, não uma resposta destinada ao browser.

## Capacidade e auditoria

Mede-se BSON real através da biblioteca já disponibilizada pelo driver Mongoose; não se instala uma dependência nova. O orçamento respeita o limite BSON de 16 MiB, incluindo reserva antes de aceitar a gravação. Não são ativados automaticamente os limites propostos de 100 linhas/10 produtores, 1/6/8 MiB nem uma quantidade funcional máxima de reclamações.

Proteções técnicas locais, distintas de regras comerciais: IDs/tipos de evento até 128 pontos de código; motivo até 500; justificação/conteúdo de intervenção até 2000; descrição de reclamação até 4000. Textos humanos são normalizados sem truncagem. Identificadores/chaves não são silenciosamente aparados; a chave opaca exige ASCII imprimível sem espaços, até 128 caracteres, e o hash exige 64 dígitos hexadecimais. Nomes comerciais de products não recebem um novo limite de texto.

A reserva é calculada como base de 128 KiB e mais 128 KiB por reclamação não resolvida, pedido ou proposta pendentes, ou o tamanho medido de quatro eventos máximos Unicode mais 8 KiB caso seja superior. Soma-se por linha espaço para dois eventos máximos e metadados de reposição. Assim, crescimento excessivo pode ser recusado antes de esgotar BSON, sem eliminar conteúdos existentes, resolver reclamações ou encurtar históricos.

Esta é uma margem técnica verificada para os registos deste bloco, não uma promessa de aceitação ilimitada nem uma implementação da admissão de comandos. Antes de ativar serviços, estes terão de medir os seus efeitos completos e provar que as decisões de fecho/regularização de processos admitidos cabem na reserva, incluindo os piores casos concorrentes e de Unicode. Se exigirem mais eventos/metadados, rever a reserva antes de os ativar; se não for possível preservar a auditoria embebida, interromper e apresentar o problema, sem arquivo/coleção nova ou eliminação silenciosa.

## Testes e resultados

As fixtures cobrem todos os seis estados, levantamento/entrega, pagamento comunicado/pago, pedido pendente, reposição parcial com saldo, várias reclamações, auditoria, receção pendente e conclusão automática já registada. São fictícias; não criam contas reais nem simulam permissões efetivas.

Os testes de integração usam exclusivamente MongoDB 8.0.34, replica set `rs-dcm-test`, porta local 27019 e uma base `docampo_test_<uuid>`, removida pela própria suite. Não leem `.env`, não utilizam desenvolvimento/Atlas e não omitem testes quando o ambiente está indisponível. A alteração de um produto num ensaio comprova a conservação dos snapshots, sem alterar o respetivo modelo.

Resultados executados nesta tarefa, após o último teste acrescentado:

| Verificação                                    | Resultado                                                   |
| ---------------------------------------------- | ----------------------------------------------------------- |
| Novos testes específicos da Etapa 2            | 131 aprovados: 97 unitários e 34 de integração.             |
| Unitários backend completos                    | 429 aprovados, incluindo os 166 cálculos orders da Etapa 1. |
| HTTP existente                                 | 22 aprovados; sem endpoints comerciais.                     |
| Integração MongoDB completa                    | 74 aprovados.                                               |
| Suite backend completa                         | 525 aprovados; os 394 anteriores preservados.               |
| TypeScript backend, ESLint backend e build API | Aprovados.                                                  |

O ensaio próximo do limite BSON admite uma reclamação com a reserva calculada e depois acrescenta quatro acontecimentos com textos Unicode máximos, resolvendo-a sem perder os eventos anteriores. Também se verificam excesso real de BSON, excesso de processos face à reserva, 101 linhas válidas sem impor o teto proposto de 100, leitura/serialização parcial, proibição de gravação parcial, snapshots após edição de Product e conflito entre duas gravações concorrentes da mesma versão. Não se testa nem apresenta como implementado um checkout transacional.

Prettier, ligações deste documento, `git diff --check` e integridade são confirmados no fecho. A comparação dos 267 ficheiros preexistentes mantém todos os hashes; só se acrescentam os sete ficheiros listados. Nenhuma alteração à Etapa 1 ou aos documentos anteriores foi necessária. Playwright não é repetido nesta etapa de persistência isolada; frontend e testes existentes são preservados.

## Dependências e próximo passo

Compatibilidade com O/OR e Etapa 1 limitada à persistência: criação global tudo-ou-nada, stock condicionado, aprovação/configuração concorrentes, autenticação, autorização, transições comerciais, idempotência de comandos, regularização real, interpretação de agenda, admissão de auditoria e jobs são trabalho posterior. Os validadores locais e o versionamento de uma order não garantem invariantes entre coleções.

Os modelos atuais bloqueiam updates por query e producers ainda não tem a configuração comercial/versionamento coordenado. Uma próxima etapa que altere esses modelos requer autorização expressa, especificação do protocolo comum e testes transacionais/concorrentes próprios. O frontend/carrinho demonstrativos permanecem independentes. A divergência académica `entregue`/`concluida` continua registada, sem acrescentar estado ou alterar os documentos originais.

Após validação, recomendar a revisão deste bloco antes de autorizar a Etapa 3. Não iniciar automaticamente serviços, extensões a outros modelos, endpoints ou operações Git.
