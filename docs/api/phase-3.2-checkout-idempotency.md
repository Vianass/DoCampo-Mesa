# Etapa 4B.2 — idempotência global e preparação da persistência

Implementação local de **24 de outubro de 2026**, em `feat/api-foundation`, sobre HEAD `f35c280172c3038bffa925ba71d03433fb38304f`. `main` permanece em `c10d031dafc3a0173f5540875152f35f61bb1549`. Não se executam staging, commits, push, merges ou alterações de branches.

Referências preservadas: [arquitetura do checkout](phase-3.2-checkout-readiness.md), [contrato e fingerprint v1](phase-3.2-checkout-contract.md), [persistência orders](phase-3.2-orders-persistence.md) e [protocolo de concorrência](phase-3.2-concurrency.md).

## Âmbito e ficheiros

Implementa-se a consulta interna de uma compra previamente persistida, a recuperação do recibo original e a preparação pura dos metadados de idempotência. Não existe serviço de checkout, criação comercial de encomendas, débito de stock, autenticação, endpoint ou integração com o frontend. As escritas realizadas nos testes servem exclusivamente para provisionar fixtures fictícias numa base MongoDB isolada.

Criam-se seis ficheiros, sem modificar qualquer ficheiro preexistente:

- [checkout.idempotency.ts](../../apps/api/src/modules/orders/checkout.idempotency.ts): identidade, preparação dos metadados, verificação integral do grupo e classificação restrita de erros.
- [checkout-idempotency.repository.ts](../../apps/api/src/modules/orders/checkout-idempotency.repository.ts): consulta e recuperação em snapshot confirmado, sem escritas de dados.
- [checkout-idempotency-fixtures.ts](../../apps/api/tests/support/checkout-idempotency-fixtures.ts): fixtures fictícias partilhadas pelos novos testes.
- [checkout-idempotency.spec.ts unitário](../../apps/api/tests/unit/checkout-idempotency.spec.ts).
- [checkout-idempotency.spec.ts de integração](../../apps/api/tests/integration/checkout-idempotency.spec.ts).
- Este relatório.

Não se alteram schemas, tipos persistidos, índices, dependências, configurações, modelos anteriores, documentação histórica ou frontend.

## Campos, identidade e índices existentes

Reutiliza-se exclusivamente a coleção `orders`. `comprador` e `produtor` referem contas `users._id`; não são IDs de perfis de produtores. `operacaoCompraId` associa as encomendas à compra global. A âncora é a encomenda do produtor com o menor ID hexadecimal, seguindo a ordem estável prevista em 4A.

Apenas essa encomenda contém o bloco existente `idempotencia`:

| Campo               | Utilização                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `chave`             | Chave opaca global, preservada exatamente; não se gera outra durante recuperação.                            |
| `hashCanonico`      | SHA-256 da representação `docampo.checkout.v1`, reutilizada sem alterações.                                  |
| `encomendas`        | Manifesto com os IDs de todas as encomendas da compra.                                                       |
| `resultadoOriginal` | Referência global, data inicial, lista de encomendas/produtores/estados iniciais/totais, total global e EUR. |

O índice único parcial `idempotencia.chave` continua a arbitrar a chave global, independentemente do comprador. O índice único composto `operacaoCompraId, produtor` impede duas encomendas do mesmo produtor na operação e suporta a consulta pelo prefixo da referência global. Ambos já existiam. Os restantes índices de comprador/data, produtor/estado/data, estado/prazo e `_id` permanecem intactos: **seis índices, sem TTL ou nova coleção**.

Não se reserva uma chave antes da compra, não se expiram chaves e não se migram encomendas antigas. Um documento antigo sem bloco idempotente permanece inalterado. Uma chave ausente não permite reconstruir retroativamente o recibo dessas encomendas.

## Preparação pura para a escrita futura

`identifyCheckout` revalida o pedido aceite com o contrato anterior e deriva comprador, chave, fingerprint e totais por produtor. Os cálculos reutilizam as funções de orders, incluindo agregação, arredondamento e taxa por produtor. Não há consulta ao catálogo atual nem substituição da oferta aceite.

`prepareCheckoutIdempotency` recebe esse pedido e descritores mínimos das encomendas já planeadas pelo futuro chamador. Exige IDs distintos, exatamente uma encomenda por produtor, mesmo comprador e referência global, moeda EUR, estado inicial `pendente`, datas válidas e montantes coerentes com o pedido original. Recusa blocos idempotentes já associados. Não gera IDs, datas, referências ou documentos comerciais.

O resultado interno identifica a âncora e prepara o manifesto e recibo no formato já suportado pelo modelo. Ordena por produtor, copia IDs e datas e não modifica os objetos recebidos. A data original do recibo é a data de criação planeada da âncora; não se impõe uma nova regra de igualdade entre todas as datas das encomendas.

Este plano contém chave e hash e não é um DTO público. A preparação não valida snapshots completos, existência real das contas/produtos, permissões, aprovação, configuração comercial ou stock. Não equivale a autorização para persistir; o modelo e o futuro coordenador continuam responsáveis pelas restantes validações.

## Consulta, replay e proteção da informação

`findCheckoutPurchase` consulta primeiro a chave global, antes de procurar os restantes membros. A identidade compradora tem de coincidir com a âncora e o fingerprint tem de corresponder ao pedido original. Outro comprador ou conteúdo diferente origina `CheckoutIdempotencyConflict`, com código `CONFLITO_IDEMPOTENCIA` e a mesma mensagem genérica. Não se inclui comprador existente, chave, hash ou recibo no erro.

A comparação com o comprador recebido constitui apenas uma proteção interna de associação. O contexto tipado não é autenticação: um futuro chamador tem de obter a identidade através de um mecanismo confiável. Não se converte a escolha de papel do frontend em segurança real.

O repositório usa uma projeção fechada: `_id`, `comprador`, `produtor`, `operacaoCompraId`, `totalCent`, `moeda` e `idempotencia`. Não lê linhas, moradas, contactos, pagamentos, reclamações ou auditoria. O acesso nativo é exclusivamente de leitura e permite consultar metadados deliberadamente omitidos pela serialização pública do modelo. Não é criado um caminho genérico de escrita nativa.

Depois de verificar comprador e hash, a leitura exige:

1. Manifesto e recibo originais válidos, sem IDs repetidos, com a âncora incluída.
2. Correspondência exata entre manifesto, recibo e encomendas persistidas: sem membros em falta, extra ou duplicados.
3. Mesmo comprador, referência global e moeda; produtores distintos e exatamente os do pedido aceite.
4. Uma única âncora, escolhida de forma determinística; os restantes membros não contêm um bloco idempotente. Um campo legado `null` nesses membros é tratado como ausente.
5. Identidade de cada encomenda/produtor e montantes coerentes entre documento, recibo e pedido aceite; soma global segura em cêntimos.
6. Estado inicial `pendente`, data original válida e moeda EUR no recibo.

Uma âncora isolada, metadados parciais ou um grupo incoerente nunca produzem um recibo parcial. `inspectCheckoutGroup` é a verificação pura desses dados; a garantia de terem sido observados na persistência pertence ao repositório.

O sucesso devolve `tipo: sucesso`, `origem: replay` e uma cópia imutável do recibo original, contendo apenas os campos previstos pelo contrato anterior. Preserva a data, a ordem da lista e os estados iniciais armazenados. Uma evolução comercial válida da encomenda não reconstrói o recibo com o estado atual. Não se voltam a consultar preços nem a executar débitos durante replay ou recuperação.

## Resultado inexistente e recuperação incerta

| Situação                                                     | Resultado                                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Consulta normal sem âncora observada                         | `inexistente`, apenas relativamente ao snapshot lido.                      |
| Recuperação após timeout/commit incerto sem âncora observada | `resultado_indeterminado`, motivo `CONFIRMACAO_NAO_OBSERVADA`.             |
| Grupo integral e coerente                                    | Replay do recibo original.                                                 |
| Grupo incompleto, incompatível ou com metadados inválidos    | `resultado_indeterminado`, motivo `GRUPO_INCONSISTENTE`.                   |
| Grupo excede o orçamento de produtores                       | `resultado_indeterminado`, motivo `LIMITE_TECNICO`, sem truncar um recibo. |
| Ligação indisponível ou falha reconhecida de leitura         | `resultado_indeterminado`, motivo `PERSISTENCIA_INDISPONIVEL`.             |
| Chave de outro comprador ou fingerprint diferente            | Conflito genérico, sem recibo.                                             |
| Erro interno inesperado                                      | Propagação ao chamador, sem o disfarçar como ausência.                     |

`recoverCheckoutPurchase` nunca interpreta uma ausência observada como prova de rollback definitivo. Os resultados indeterminados mantêm `RESULTADO_DESCONHECIDO` e `repetirComMesmaChave: true`; não iniciam uma nova compra nem trocam a chave.

Os erros reconhecidos incluem indisponibilidade/timeout do driver e erros MongoDB transitórios identificados por tipo, código ou labels. Não se analisam mensagens para decidir a existência de uma compra. Erros internos não classificados mantêm-se disponíveis ao coordenador; um futuro limite HTTP deverá sanitizá-los antes de exposição.

## Concorrência e leitura confirmada

Cada consulta abre uma sessão própria e uma transação **apenas de leitura**, com `readConcern: snapshot`, preferência `primary` e confirmação `majority`. A âncora e os membros pertencem à mesma observação consistente. A função não aceita a sessão ativa da futura escrita: documentos ainda não confirmados por essa escrita não podem ser confundidos com uma compra recuperada.

As repetições da transação de leitura são as do driver, com orçamento de tempo explícito: **5000 ms por omissão**, configurável pelo chamador interno. Esgotar o orçamento não devolve ausência. Não se introduz um ciclo adicional de tentativas nem efeitos comerciais no callback. As sessões são terminadas no fim.

O limite de produtores reutiliza o contrato anterior, **10 por omissão**. A consulta pede no máximo limite + 1 documentos para detetar excesso, recusando o resultado integral em vez de esconder membros. Opções inválidas são recusadas. A política operacional de limites e tempos da implantação futura continua por calibrar.

`isCheckoutIdempotencyKeyConflict` reconhece apenas um `MongoServerError` 11000 cujo `keyPattern` corresponde exatamente a `idempotencia.chave`. Não confunde colisões de `_id` ou do índice operação/produtor, não interpreta mensagens e não divulga `keyValue`. É uma primitiva para o futuro escritor: ainda não existe aqui um coordenador que capture a colisão e repita uma compra.

Os testes concorrentes persistem grupos fictícios completos em transações MongoDB reais: uma chave concorrente admite apenas um grupo confirmado, sem encomendas remanescentes do perdedor. Esta prova valida os índices e a recuperação; não equivale a um checkout comercial implementado. A leitura `inexistente` não é uma reserva nem autoriza criação desprotegida: dois chamadores podem observá-la, pelo que a futura escrita tem de continuar a respeitar o índice e a atomicidade global.

## Integração futura e limitações

A etapa de checkout funcional, ainda não iniciada, terá de:

1. Obter a identidade de uma fonte autenticada e coordenar autorização/capacidades das contas, incluindo alterações concorrentes.
2. Confirmar produtos e produtores reais, ofertas aceites, revisões, aprovação, configuração, agenda e fonte confiável do local de levantamento.
3. Construir e validar snapshots completos e IDs/referência estáveis; usar a preparação pura apenas para os metadados de idempotência.
4. Gravar âncora, restantes encomendas, guardas e débitos de stock na **mesma transação**, com uma única sessão e abort integral perante falha.
5. Tratar colisão da chave e resultado de commit desconhecido fora da transação de escrita, consultando novamente o grupo confirmado com a mesma identidade e pedido.
6. Limitar tentativas de escrita e preservar os labels do driver; exigir reconfirmação quando as condições comerciais mudam e emitir efeitos externos apenas depois do commit.

Não se implementa essa sequência, nem uma versão parcial que grave apenas âncora ou encomendas. Não se debitam nem repõem stocks. Não se criam coleções auxiliares, registos de pagamentos, sockets, jobs ou endpoints.

A verificação do grupo prova a coerência dos documentos observados, não a execução histórica de débitos de stock. A garantia comercial completa depende da transação futura e de todos os escritores respeitarem o protocolo. Acesso nativo externo que elimine ou altere documentos depois do snapshot não fica impedido por esta leitura; uma leitura posterior deteta o grupo incompleto. Não existe monitorização permanente ou bloqueio contra escritores externos.

O formato v1 e as regras de normalização têm de permanecer compatíveis para repetir pedidos antigos. Uma mudança de formato, política de revisões ou limites precisa de uma estratégia explícita de compatibilidade. Não se inventa um recibo para documentos antigos sem metadados.

## Testes e validações executadas

Os novos testes usam MongoDB real **8.0.34**, replica set `rs-dcm-test`, porta local 27019 e base aleatória `docampo_test_<uuid>`, removida no fim. Só o provisionamento de fixtures escreve nessa base; não se usa a base de desenvolvimento, Atlas, credenciais reais ou dados comerciais.

Cobertura: ausência versus recuperação incerta, um/vários produtores, replay repetido, fingerprint diferente, comprador alheio, privacidade, recibo original após mudança válida de estado, grupos incompletos/extra/corrompidos, índices existentes, colisão real, documentos antigos, rollback, concorrência, escritas não confirmadas, snapshot consistente, indisponibilidade e falhas transitórias.

As corridas de chaves e os limites de visibilidade transacional são verificados com operações MongoDB reais e intercalações aguardadas. Para testar respostas perdidas e labels transitórios, usam-se também falhas injetadas junto de leituras/commits reais, com verificação posterior dos dados. O ensaio de resposta perdida confirma primeiro a transação da fixture e depois injeta o erro: não é uma falha física de rede durante commit nem uma prova de checkout com stock. Os testes não se limitam a confirmar respostas de mocks.

| Verificação                        | Resultado                                                       |
| ---------------------------------- | --------------------------------------------------------------- |
| Novos testes unitários             | **45 aprovados**.                                               |
| Novos testes de integração MongoDB | **24 aprovados**.                                               |
| Total de testes novos              | **69 aprovados**.                                               |
| Suite backend completa             | **882 aprovados em 18 ficheiros**, incluindo os 813 anteriores. |
| Distribuição backend               | 710 unitários, 22 HTTP e 150 de integração.                     |
| TypeScript API                     | Aprovado.                                                       |
| ESLint API                         | Aprovado.                                                       |
| Prettier API                       | Aprovado com ignore da raiz explícito.                          |
| Build API                          | Aprovado; artefactos ignorados.                                 |

Comandos executados: testes dirigidos aos dois novos ficheiros, `npm test --workspace @docampo/api`, `npm run typecheck --workspace @docampo/api`, `npm run lint --workspace @docampo/api`, `npm run format:check --workspace @docampo/api -- --ignore-path ../../.prettierignore` e `npm run build --workspace @docampo/api`. Não se usa `prettier --write` sobre ficheiros preexistentes. Não se reexecuta Playwright nesta etapa backend isolada.

No fecho verificam-se também formatação e ligações locais deste relatório, `git diff --check`, hashes dos **300 ficheiros preexistentes**, integridade dos nove documentos originais da Fase 0 perante `main`, ausência de segredos nos novos ficheiros e staging vazio. Os ficheiros gerados pelo build mantêm-se ignorados.

Estado de entrega previsto: exatamente os seis novos ficheiros listados, nenhum ficheiro rastreado modificado, HEAD e `main` inalterados, sem publicação Git. Aguardar revisão e autorização antes de qualquer operação Git adicional ou desenvolvimento da etapa seguinte.

Mensagem de commit sugerida, sem execução: `feat(api): add checkout idempotency lookup and receipt recovery`.
