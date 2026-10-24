# Etapa 4A — prontidão do checkout transacional

Análise e proposta documental de **24 de outubro de 2026**. Base verificada: `feat/api-foundation`, HEAD `a43a715a7cd974e3c60bab0a611cf6d977477213`; `main` em `c10d031dafc3a0173f5540875152f35f61bb1549`. A árvore estava limpa e a referência local de acompanhamento tinha zero commits de diferença. Não foi feita nova consulta ao remoto nesta etapa.

**Estado: proposta para revisão; não é uma implementação nem autorização para a Etapa 4B.** Apenas este documento é criado. Código, configurações, dependências, frontend, documentos históricos e os nove originais da Fase 0 permanecem inalterados. Os 683 testes backend são o resultado anterior, não uma execução desta análise.

## 1. Resumo executivo

Recomenda-se compor os mecanismos existentes numa transação MongoDB única: uma encomenda por produtor, débito condicionado dos produtos, guarda efetiva de cada produtor e uma encomenda âncora que conserva a chave global e o recibo original. Não é necessária uma coleção adicional para essa proposta.

O índice único parcial da chave já existe no modelo `orders` e foi testado. É compatível com várias encomendas quando **apenas a âncora contém `idempotencia`**. O índice, isoladamente, não cria o grupo atomicamente nem implementa replay, fingerprint ou recuperação de commit incerto; essas responsabilidades pertencem ao futuro coordenador.

Há duas lacunas materiais para o checkout completo: falta uma origem canónica para `localLevantamento`, obrigatório no snapshot de levantamento, e as alterações de papéis de `users` não participam nas guardas da Etapa 3B. É necessário decidir a solução e autorizar o respetivo âmbito antes da implementação dependente. Os blocos puros de contrato, fingerprint e projeção podem ser preparados separadamente após aprovação.

Não se reabrem O01–O16 ou OR01–OR12. As opções técnicas e questões deste relatório são distinguidas das regras já aprovadas. A disponibilidade real pela rede continua dependente de autenticação/autorização; C04 mantém as operações privadas inacessíveis.

## 2. Estado atual e evidências consultadas

### Fontes preservadas

Consultados os nove documentos da Fase 0: [requisitos funcionais](../requirements/functional-requirements.md), [não funcionais](../requirements/non-functional-requirements.md), [casos de utilização](../requirements/use-cases.md), [visão global](../architecture/system-overview.md), [diagramas](../architecture/architecture-diagram.md), [consistência dos leilões](../architecture/auction-consistency.md), [decisões originais](../architecture/decisions.md), [modelo de dados](../database/data-model.md) e [planeamento oficial](../planning/implementation-plan.md).

Consultados [README da API](README.md), [decisões vigentes](decisions.md), [mapeamento](data-mapping.md), [modelos](phase-3.2-models.md), [proposta 3.2](phase-3.2-proposal.md), [prontidão anterior](phase-3.2-readiness.md), [consolidação O/OR](phase-3.2-orders-readiness.md), [persistência orders](phase-3.2-orders-persistence.md), [configuração comercial](phase-3.2-producers-commercial.md), [concorrência](phase-3.2-concurrency.md), [products](phase-3.2-products.md), [plano API](implementation-plan.md), [OpenAPI](openapi.yaml), [segurança](security.md), [rastreabilidade](traceability.md) e [integração frontend](frontend-integration.md).

Os avisos históricos «orders não implementado», «configuração ainda inexistente» ou «aguarda autorização» nesses relatórios descrevem as respetivas datas. O código publicado e os relatórios posteriores demonstram a persistência/configuração/guardas agora existentes; não se altera documentação histórica para atualizar esses avisos. A diferença entre o termo académico `entregue` e os seis estados aprovados continua registada; esta etapa não acrescenta estados ou aliases.

### Implementado, documentado e pendente

| Área          | A — implementado e coberto pelos testes existentes                                                                                                                                                                                                                                                                                                                                                | B/C — apenas documentado ou pendente                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidade    | [users](../../apps/api/src/modules/users/user.model.ts): conta, múltiplos papéis, hash privado, validação e índice de email.                                                                                                                                                                                                                                                                      | Autenticação/autorização reais, contexto de compra e coordenação de alterações concorrentes de papéis. Não existem campos de suspensão/ativação a presumir. |
| Produtores    | [modelo](../../apps/api/src/modules/producers/producer.model.ts), configuração comercial opcional, aprovação, serialização protegida e revisão operacional.                                                                                                                                                                                                                                       | Fonte exata do local de levantamento; catálogo nacional de concelhos; exposição HTTP e instruções privadas de pagamento.                                    |
| Produtos      | [modelo](../../apps/api/src/modules/products/product.model.ts): rascunho/publicado/arquivado, preço, unidade, stock e revisão.                                                                                                                                                                                                                                                                    | Um serviço de compra que componha estas regras com encomendas. Não existe versão comercial exclusiva da unidade.                                            |
| Orders        | [modelo](../../apps/api/src/modules/orders/order.model.ts), [tipos](../../apps/api/src/modules/orders/order.types.ts), [validação](../../apps/api/src/modules/orders/order.validation.ts), snapshots, auditoria, índices, capacidade BSON e versão `versao`.                                                                                                                                      | Criação global, escolha da âncora, hash do pedido, replay, autorização e ciclo comercial executável.                                                        |
| Cálculos      | [order.calculations.ts](../../apps/api/src/modules/orders/order.calculations.ts): agregação por ID, grelha, half-up, taxa por produtor e controlo de overflow.                                                                                                                                                                                                                                    | Orquestração entre vários produtores; não existem efeitos sobre stock nestas funções.                                                                       |
| Concorrência  | [débito de stock](../../apps/api/src/modules/products/product-stock.repository.ts), [guarda](../../apps/api/src/modules/producers/producer-guard.repository.ts), [elegibilidade](../../apps/api/src/modules/producers/producer-eligibility.ts), [revisões](../../apps/api/src/modules/concurrency/document-revision.ts) e [sessões](../../apps/api/src/modules/concurrency/operation-session.ts). | Idempotência global operacional, coordenação do grupo e proteção de todos os escritores de contas.                                                          |
| HTTP/frontend | Fundação HTTP com `GET /api/health`; frontend demonstrativo preservado.                                                                                                                                                                                                                                                                                                                           | Checkout privado, adaptadores, migração do carrinho e respostas HTTP definitivas. A demonstração não autentica o comprador.                                 |

Foram inspecionados também [testes dos cálculos](../../apps/api/tests/unit/order-calculations.spec.ts), [modelo unitário](../../apps/api/tests/unit/order-model.spec.ts), [persistência real](../../apps/api/tests/integration/order-model.spec.ts), [concorrência unitária](../../apps/api/tests/unit/concurrency.spec.ts), [concorrência real](../../apps/api/tests/integration/concurrency.spec.ts) e testes/fixtures de identidade, products e configuração comercial. A revisão do código distingue a prova de índices/guardas da prova ainda inexistente de um checkout completo.

## 3. Decisões funcionais aplicáveis

| Decisões                              | Invariante a preservar no futuro serviço                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O01, OR05, OR12                       | Uma compra global, uma order por produtor, uma referência comum; confirmação integral ou rollback integral.                                                      |
| O05–O08, OR02, OR08                   | Modalidade, taxa fixa, concelho e período por produtor; configuração atual validada e condições aplicadas preservadas.                                           |
| O09/O10, OR10                         | Método escolhido por order; pagamento inicial `por_pagar`; nenhum processamento bancário nem confirmação automática.                                             |
| O11/O12                               | Preços/totais calculados no servidor, snapshots imutáveis, sem reserva no carrinho e sem aceitação silenciosa de alterações.                                     |
| OR03/OR04                             | Agregar fragmentos pelo ID antes de mínimos/incrementos/stock/arredondamento; subtotal por produto pelo menos um cêntimo.                                        |
| O02–O04, O13–O16, OR01, OR06/07/09/11 | Criar estado `pendente` e estruturas iniciais compatíveis; não executar cancelamentos, reposições, reclamações, conclusão automática ou alterações de pagamento. |

Uma falha não retira linhas silenciosamente nem divide uma compra em subconjuntos bem-sucedidos. A escolha de modalidades/métodos continua individual por produtor. Esta proposta não cria uma proibição adicional de comprar a um produtor da própria conta: a regra documentada contra licitar no próprio leilão não é transposta para encomendas sem decisão específica.

## 4. Contrato interno proposto

### Fronteira e identidades

Contrato exclusivamente documental. A futura função recebe três elementos separados: contexto autenticado confiável, chave opaca e pedido de compra. Conexão, relógio, gerador de IDs e política de transação são dependências internas, nunca propriedades livres enviadas pelo browser.

| Elemento                    | Proposta e origem                                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contexto.compradorContaId` | Identidade obtida pelo futuro mecanismo autenticado. Em testes internos, fixture explícita e isolada. Nunca aceitar `buyerId`, papel demonstrativo ou conta arbitrária do corpo HTTP como autoridade.      |
| `chaveIdempotencia`         | Chave global opaca, string ASCII visível de 1–128 caracteres, sem espaços, conforme modelo/contrato atuais. Não normalizar, truncar ou prefixar com comprador/produtor.                                    |
| `linhas[]`                  | `produtoId`, quantidade inteira e `ofertaAceite`: preço de referência em cêntimos, unidade completa e `revisaoProdutoObservada`. A oferta é uma condição a comparar, não uma fonte autoritativa de preços. |
| `condicoesPorProdutor[]`    | `produtorContaId`, modalidade, período UTC/fuso, método de pagamento, taxa aceite, `revisaoProdutorObservada`; entrega inclui concelho, morada e contacto privados necessários.                            |
| `operacaoCompraId`          | UUID opaco gerado no servidor para a compra nova; todas as orders e o recibo partilham-no. Não é a chave do cliente.                                                                                       |
| IDs de order/linha/evento   | Gerados no servidor; estáveis entre tentativas internas da mesma execução lógica. Não são derivados de nomes.                                                                                              |

No armazenamento, `Product.produtor`, `Order.produtor` e a entrada da guarda referem **`users._id`**. `ProducerProfile._id` é outro ID. O OpenAPI propõe IDs públicos de perfil: um futuro adaptador terá de os resolver e verificar o owner dos produtos. Este contrato interno usa o nome explícito `produtorContaId` para evitar a troca. A identificação dos produtores é sempre confirmada a partir dos produtos atuais; exigem-se condições para exatamente esse conjunto, sem duplicados ou produtores extra.

O pedido não contém totais autoritativos, estado, comprador editável, aprovação, dados bancários ou local de levantamento atribuído pelo cliente. Se surgir um campo desconhecido, recomenda-se rejeitá-lo; não propagá-lo para schemas, hash ou logs.

### Normalização e validação em duas etapas

Antes de consultar condições comerciais atuais, validar estrutura/tipos e produzir representação determinística usando **os dados originalmente aceites**. Isto permite reconhecer um replay mesmo que stock, preço ou aprovação tenham mudado depois do primeiro commit.

Converter IDs de produto/conta para ObjectId válido e representação hexadecimal canónica; não usar slugs. Textos destinados a campos `textField` seguem a normalização existente NFC/trim; chave opaca continua exata. Datas entram como instantes explícitos, são validadas e normalizadas para ISO UTC com milissegundos. Números têm de ser inteiros seguros, sem conversão permissiva de strings; campos obrigatórios não aceitam `null` como omissão.

Reutilizar `aggregateOrderLines` com `versaoUnidade` preenchida a partir da revisão observada e sem stock do frontend. Fragmentos do mesmo produto têm de apresentar preço, unidade e revisão compatíveis. O helper já agrega antes da grelha e não arredonda fragmentos. Na transação, recalcular com produtos efetivamente lidos e stock atual. Não implementar outro algoritmo comercial de agregação/cálculo no serviço.

### Resultado e erros internos

Sucesso proposto: envelope com `origem: nova | replay` e `recibo`. Apenas a indicação de origem pode variar; o conteúdo do recibo original é recuperado da persistência, sem reconstruir estados/totais atuais. O recibo contém operação, data inicial, moeda, total global e, por order, ID, `produtorContaId`, estado inicial e total. Não contém chave, hash, manifesto interno, moradas, contactos ou dados bancários.

Falhas de domínio propostas distinguem pedido inválido, compra indisponível, reconfirmação necessária, conflito de revisão e conflito de idempotência. Um resultado de commit ainda desconhecido é `resultado_indeterminado`, não uma encomenda cancelada nem autorização para comprar novamente com outra chave. Estes nomes descrevem propostas internas; só os códigos dos auxiliares já existem em código.

Falhas internas inesperadas e erros originais do driver continuam identificáveis pelo coordenador. A sanitização futura de HTTP não pode destruir os labels necessários às retentativas. O OpenAPI já prevê 400/401/403/409/500/503 para criação de orders; esta etapa não escolhe um novo status de replay nem congela o mapeamento dos novos conflitos.

### Exemplo documental, sem execução

Pedido fictício simplificado com um produtor; o contexto e a chave são argumentos separados. Num pedido com vários produtores, cada grupo tem a sua seleção e gera a sua order.

```json
{
  "linhas": [
    {
      "produtoId": "000000000000000000000101",
      "quantidade": 250,
      "ofertaAceite": {
        "precoReferenciaCent": 150,
        "revisaoProdutoObservada": 0,
        "unidadeVenda": {
          "modalidade": "peso",
          "unidadeBase": "g",
          "quantidadeReferencia": 1000,
          "quantidadeMinima": 250,
          "incrementoCompra": 50
        }
      }
    },
    {
      "produtoId": "000000000000000000000101",
      "quantidade": 250,
      "ofertaAceite": {
        "precoReferenciaCent": 150,
        "revisaoProdutoObservada": 0,
        "unidadeVenda": {
          "modalidade": "peso",
          "unidadeBase": "g",
          "quantidadeReferencia": 1000,
          "quantidadeMinima": 250,
          "incrementoCompra": 50
        }
      }
    }
  ],
  "condicoesPorProdutor": [
    {
      "produtorContaId": "000000000000000000000012",
      "modalidade": "entrega",
      "concelhoId": "concelho-ficticio-001",
      "morada": "Morada fictícia de teste",
      "contacto": "Contacto fictício de teste",
      "periodo": {
        "inicioEm": "2026-10-26T14:00:00.000Z",
        "fimEm": "2026-10-26T15:00:00.000Z",
        "fusoHorario": "Europe/Lisbon"
      },
      "metodoPagamento": "dinheiro",
      "taxaEntregaAceiteCent": 250,
      "revisaoProdutorObservada": 0
    }
  ]
}
```

Com configuração/stock compatíveis, as duas entradas tornam-se uma linha de 500 g: 75 cêntimos de produtos + 250 de entrega = 325. Não se somam dois subtotais de 38. Exemplo de resposta interna proposta, não uma resposta HTTP implementada:

```json
{
  "origem": "nova",
  "recibo": {
    "operacaoCompraId": "compra-ficticia-4a",
    "criadaEm": "2026-10-24T10:00:00.000Z",
    "encomendas": [
      {
        "orderId": "000000000000000000000201",
        "produtorContaId": "000000000000000000000012",
        "estadoInicial": "pendente",
        "totalCent": 325
      }
    ],
    "totalCent": 325,
    "moeda": "EUR"
  }
}
```

## 5. Arquitetura de idempotência global

### Identificadores com responsabilidades diferentes

| Conceito             | Responsabilidade                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chave idempotente    | Identifica a tentativa lógica do cliente globalmente, inclusive entre compradores/produtores disjuntos. A persistência impede uma segunda compra confirmada com a mesma chave. |
| Comprador            | Determina a propriedade do resultado. Conhecer a chave nunca concede acesso.                                                                                                   |
| Fingerprint canónico | Permite comparar o pedido normalizado com o primeiro pedido confirmado, independentemente da ordem dos campos/linhas. Não autentica ninguém.                                   |
| Referência global    | Identifica a compra efetivamente criada pelo servidor; pode ser devolvida no recibo.                                                                                           |
| Order individual     | Recurso de um produtor, com estado/histórico próprios e referência global comum.                                                                                               |
| Recibo original      | Resultado mínimo imutável da operação confirmada; distingue-se das orders cujo estado pode evoluir.                                                                            |

### Alternativas

| Solução                                    | Atomicidade, recuperação e concorrência                                                                                                                                                                                                         | Simplicidade, integridade, índices e custo                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — âncora em `orders`, recomendada        | Âncora, manifesto, recibo, restantes orders e débitos na mesma transação. A chave única arbitra concorrência; o recibo permite recuperar após resposta perdida.                                                                                 | Reutiliza schema/índices existentes, sem coleção adicional. Exige validação de consistência do grupo no coordenador e preservação da âncora. Menor custo e adequada ao projeto académico.   |
| B — registo global persistente separado    | Pode oferecer uma identidade de operação independente e estados operacionais. Só é integral se esse registo e todas as escritas comerciais partilharem a transação. Uma reserva anterior exigiria protocolo adicional de expiração/recuperação. | Nova coleção/schema/índices, retenção e possíveis duas fontes de verdade. Útil se houver requisitos futuros que a âncora não satisfaça; precisa de autorização própria e não está aprovada. |
| C — chave por order ou bloqueio em memória | Unicidade por produtor permite duas compras incompatíveis em produtores disjuntos; memória perde-se no restart e não coordena processos. Não cumpre OR05 isoladamente.                                                                          | Não recomendar. Propagar a mesma chave global para todas as orders também falha o índice único atual.                                                                                       |

Escolha proposta: A, mantendo exatamente os índices existentes. Escolher a order do menor `produtorContaId` hexadecimal como âncora; ordenar também os produtos por ID. A escolha é determinística, não depende da ordem do carrinho e não concede privilégios adicionais ao produtor da âncora.

### Compatibilidade dos índices

No código existente, `{ 'idempotencia.chave': 1 }` é único apenas quando o campo tem tipo string. Só a âncora contém esse campo; as demais orders omitem o bloco, sem chave vazia ou `null`. `{ operacaoCompraId: 1, produtor: 1 }` impede duas orders do mesmo produtor na compra, mas não substitui a unicidade global da chave. Esta interpretação corresponde ao comportamento dos [índices únicos parciais do MongoDB](https://www.mongodb.com/docs/manual/core/index-partial/) e aos testes reais de `order-model.spec.ts`.

O índice não garante, por si, uma única âncora por referência global com chaves diferentes, igualdade de comprador entre orders ou completude de um manifesto. O coordenador deve gerar a referência, construir o grupo fechado e validar essas invariantes. Não disponibilizar gravações diretas que permitam fabricar grupos inconsistentes.

`autoCreate` e `autoIndex` estão desligados. Antes da futura aceitação de compras, verificar a existência/configuração dos índices e das coleções existentes no ambiente; aguardar a preparação explícita fora da transação. Não criar índices durante uma compra, não aplicar TTL e não converter a chave global num índice composto por comprador/produtor.

### Fingerprint proposto, versão inicial fixa

Proposta técnica a aprovar com o contrato: SHA-256 dos bytes UTF-8 de uma representação determinística identificada como `docampo.checkout.v1`. Utilizar `node:crypto`, sem dependência adicional. O schema atual guarda apenas os 64 caracteres hexadecimais; a versão da representação é constante do algoritmo e não um novo campo persistido. Uma alteração futura do algoritmo requer compatibilidade de replay, não troca silenciosa.

Incluir comprador autenticado, linhas agregadas/ordenadas com ID/quantidade/preço/unidade completa/revisão observada, e seleções por produtor ordenadas com modalidade, taxa, método, período/fuso, revisão observada e dados necessários de entrega. Campos de unidade incluem referência, base, mínimo, incremento, rótulo e conteúdo por unidade quando aplicáveis. A ordem das propriedades é explícita; omissão e `null` não são intercambiáveis sem regra.

Excluir ordem dos fragmentos, ordem arbitrária dos objetos, stock mostrado, totais calculados pelo browser, labels de transporte, JWT, chave, datas de receção do pedido, IDs/referência gerados no servidor e dados comerciais lidos depois. Duas entradas equivalentes de 250 g correspondem à mesma representação que uma de 500 g, se as condições aceites forem iguais. Duplicados com ofertas contraditórias são rejeitados, não fundidos por preferência arbitrária.

Esta primeira proposta inclui as revisões observadas como parte do pedido aceite e usa comparação conservadora de revisão. Não confundir essas revisões operacionais com uma versão exclusiva de preço/unidade/configuração. A alternativa de excluir contadores técnicos do fingerprint e comparar apenas semântica comercial está identificada na questão D4A-03; não está aplicada. Um replay exato conserva sempre o payload original, mesmo quando os contadores atuais já avançaram.

Hash apenas os campos privados estritamente necessários; o hash não elimina o caráter sensível de dados de baixa entropia nem constitui cifragem. Não registar o payload canónico ou o hash em logs públicos. A chave não transporta emails, moradas ou identificadores pessoais.

### Recuperação e cenários obrigatórios

A pesquisa interna usa a chave global; antes de devolver dados, compara o comprador confiável e depois o hash. Outro comprador recebe conflito genérico, sem grupo, existência detalhada ou identidade do titular. Não limitar a unicidade ao par comprador/chave.

| Cenário                          | Comportamento proposto                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Primeira execução válida      | Nenhuma âncora confirmada; validar e confirmar o grupo integral. Um único recibo original é persistido.                                                 |
| 2. Mesmo pedido/chave            | Mesmo comprador/hash: devolver o recibo guardado como replay, sem nova order, guarda ou débito.                                                         |
| 3. Mesma chave, dados diferentes | Âncora confirmada com hash diferente: conflito; nunca substituir o primeiro resultado.                                                                  |
| 4. Timeout do pedido             | Não presumir rollback. Repetir a pesquisa/solicitação com a mesma chave e o payload original.                                                           |
| 5. Resposta perdida              | Recuperar o recibo já persistido; não revalidar preço/stock para transformar a repetição numa nova compra.                                              |
| 6. Duas chamadas simultâneas     | Ambas podem não ver âncora inicialmente. Índice único e transação escolhem um commit; a outra aborta e recupera o vencedor fora do snapshot antigo.     |
| 7. Falha antes do commit         | Rollback integral; não há chave confirmada, orders, débitos ou guardas parciais dessa tentativa. Nova tentativa continua a precisar de validação atual. |
| 8. Falha depois do commit        | O recibo da âncora é a fonte do resultado, mesmo que o chamador não tenha recebido sucesso.                                                             |
| 9. Vários produtores             | Uma chave, uma âncora e todas as orders/débitos/guardas na mesma transação; produtores disjuntos também disputam a chave global.                        |
| 10. Compradores diferentes       | A mesma chave não pode confirmar duas compras. Não devolver o recibo alheio nem revelar o seu conteúdo.                                                 |
| 11. Falha transitória MongoDB    | Repetir a transação abortada dentro do orçamento, mantendo a chave e relendo documentos; não repetir efeitos externos.                                  |
| 12. Conflito de escrita          | Distinguir label transitório de conflito comercial/de revisão; reler e revalidar na tentativa permitida, sem aceitar uma oferta nova automaticamente.   |

Uma chave só é vinculada por uma operação confirmada. Uma tentativa definitivamente abortada não cria um registo de falha reservado. Depois de reconfirmação pode existir outro pedido, mas nunca alterar o pedido de um commit ainda incerto; resolver primeiro o seu resultado. A retenção da chave acompanha a âncora, sem expiração automática.

## 6. Estratégia transacional proposta

### Antes da transação

1. Obter o contexto confiável, validar tipos/tamanho, normalizar o pedido original e calcular o fingerprint. Fazer apenas verificações independentes do catálogo atual nesta fase inicial.
2. Consultar uma âncora confirmada no `primary`, com leitura `majority`, e verificar identidade/hash. Se existir replay válido, devolver o recibo após os controlos de acesso aplicáveis; alterações comerciais posteriores não o anulam. A permissão para recuperar uma compra própria não deve ser confundida com a elegibilidade para criar outra; a futura política de acesso tem de ser explícita.
3. Se não existir, preparar uma única vez referência global, IDs do grupo/eventos e data lógica. Ainda não há reserva, order persistida ou débito. Leituras prévias para melhorar mensagens não substituem as leituras/condições transacionais.
4. Verificar que a infraestrutura foi preparada: índices existentes, cliente/conexão, replica set e política temporal. Não carregar catálogos externos ou efetuar pedidos de rede comercial dentro da transação.

### Dentro de cada tentativa

1. Usar a mesma conexão/cliente e uma sessão explícita. Política proposta: `readConcern: snapshot`, `writeConcern: majority`, `readPreference: primary`. Todas as consultas, guardas, débitos e `save({ session })` usam essa sessão.
2. Voltar a procurar a âncora na sessão. Se um commit concorrente já for visível, verificar identidade/hash e recuperar o resultado, sem executar escritas comerciais. A verificação exterior não substitui esta etapa.
3. Ler conta compradora, produtos, contas produtoras e perfis. Validar capacidade comprador/produtor, existência/ownership e conjunto exato de seleções. A proteção de alterações concorrentes de papéis continua dependente de D4A-05; uma simples leitura não resolve essa lacuna.
4. Reagregar linhas, comparar ofertas/condições aceites, aprovação, configuração, modalidade, concelho, método, horário, stock e revisões. Calcular valores a partir dos dados atuais com os helpers existentes. Qualquer reconfirmação/invalidade interrompe aqui, antes da criação de orders ou débito.
5. Construir todos os snapshots e documentos em memória, o manifesto completo e o recibo. Validar cada order e o orçamento BSON, incluindo o recibo da âncora; verificar soma global e grupo. Snapshots de levantamento dependem de D4A-04.
6. Guardar a order âncora completa com `save({ session })`, incluindo a chave/hash/manifesto/recibo. Esta inserção arbitra cedo pedidos da mesma chave. Ainda não existe sucesso visível nem encomenda parcial confirmada.
7. Executar uma guarda efetiva por produtor, em ordem estável, e um débito por produto agregado, em ordem estável, com a mesma sessão e revisões esperadas. Uma guarda não é repetida com o mesmo token dentro da tentativa.
8. Guardar as restantes orders completas sequencialmente. Confirmar que IDs, compradores, produtores, totais e referência correspondem ao manifesto/recibo, sem consultar modelos serializados que omitem esses campos.
9. Confirmar a transação. Só depois devolver sucesso. Qualquer falha em 6–9 aborta também âncora, outras orders, guardas e débitos; nunca capturar um erro para confirmar apenas as escritas anteriores.

Operações na mesma sessão são sequenciais, sem `Promise.all`/`Promise.allSettled`. Os auxiliares não iniciam transações. Esta utilização e a separação entre erros de transação e de commit seguem a [documentação do driver Node.js](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/), também conferida no driver 7.7.0 instalado. Não se propõe atualizar dependências.

### Retentativas e resultado desconhecido

Recomenda-se `ClientSession.withTransaction` do driver já instalado, coordenado explicitamente pelo serviço, com orçamento temporal finito. Proposta inicial para ensaios: 20 s para a execução transacional, incluindo repetições do driver, e até 5 s para pesquisa de recuperação. São parâmetros técnicos propostos, não um SLA ou requisito comercial aprovado. Não criar um segundo ciclo ilimitado à volta do driver.

`TransientTransactionError` permite repetir o corpo com documentos novos; `UnknownTransactionCommitResult` exige repetir o commit da mesma transação enquanto o driver o puder resolver, não iniciar outro corpo comercial por iniciativa da aplicação. O callback pode ser invocado várias vezes, pelo que chave/identidade/oferta original não mudam e objetos Mongoose de uma tentativa falhada não são reutilizados. A distinção está nas [especificações do driver MongoDB](https://specifications.readthedocs.io/en/latest/transactions-convenient-api/transactions-convenient-api/) e no código instalado.

Depois de `E11000` especificamente no índice da chave, sair/abortar a tentativa e procurar a âncora confirmada fora do snapshot antigo. Só um resultado com comprador/hash iguais autoriza replay. Uma violação de `_id` ou de operação/produtor não é automaticamente um replay; preservar a identificação do erro e investigar a invariante. Não registar `keyValue` em bruto.

Se o orçamento esgotar com commit desconhecido, procurar a chave no `primary` com leitura `majority`. Âncora correspondente permite recuperar sucesso; chave alheia/dados diferentes dão conflito genérico. **Ausência momentânea não prova rollback**: devolver resultado indeterminado e instruir a repetição com a mesma chave/payload, sem novo débito isolado ou geração automática de chave. O próximo pedido volta ao protocolo global; a unicidade continua a arbitrar uma eventual transação ainda em resolução.

Não enviar emails, sockets, pagamentos, chamadas de mapas ou outros efeitos irreversíveis no callback. Publicação de eventos após commit e recuperação durável desses eventos são temas posteriores; esta etapa não promete entrega exatamente uma vez de notificações.

## 7. Integração com os módulos existentes

| Recurso                                                  | Entradas/sessão e resultado real                                                                                                                                                             | Erros, garantia e limite                                                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aggregateOrderLines`, cálculos `calculateOrder*`        | IDs string, quantidades, preço de referência, unidade, versão e stock opcional; funções puras devolvem linhas/totais em cêntimos.                                                            | `OrderValidationError` específico. Agrega, valida e arredonda; não verifica ownership/aprovação nem executa escritas.                                                                          |
| `validateProductStockCandidate` / `decreaseProductStock` | ObjectIds de produto/conta produtora, revisão esperada, quantidade agregada, preço/unidade aceites; no checkout, sessão obrigatoriamente fornecida. Devolve ID, stock e revisão após débito. | Códigos de validação/stock/indisponibilidade/oferta/revisão; erros do driver propagados. Escrita condicionada real impede stock negativo, mas isoladamente não protege o grupo ou a aprovação. |
| `validateProducerGuardCandidate`, `producerPeriodFits`   | Perfil/seleção comercial e revisão; período UTC e zona. Funções de verificação, sem escrita.                                                                                                 | Aprovação/configuração/modalidade/método/concelho/taxa/horário/revisão. Não comprovam conta ativa, identidade ou autorização.                                                                  |
| `guardProducerEligibility`                               | Conta produtora, revisão e seleção; exige sessão real com transação ativa. Devolve conta e revisão após incremento.                                                                          | Escrita efetiva protege o perfil contra escritores cooperantes. Não lê dados bancários, não muda aprovação/configuração e não protege papéis em `users`.                                       |
| `createOrderModel`, validação e `save`                   | Documento completo com snapshots e históricos, mesma sessão. Índices preparados antes da compra.                                                                                             | Validação, `VersionError`, `E11000`, capacidade BSON e erros internos. Modelo individual não garante um grupo completo nem gera o fingerprint/recibo.                                          |
| `serializeOrderSummary`                                  | Projeção comum minimizada de uma order.                                                                                                                                                      | Não é o recibo global nem autorização por papel. Não recuperar idempotência pelo JSON público; usar leitura interna mínima explícita.                                                          |
| Revisão/sessão da Etapa 3B                               | `revisaoOperacional`, ausência legada = zero; `save` e dois repositórios participam.                                                                                                         | `CONFLITO_VERSAO`, `LEITURA_INCOMPLETA`, `TRANSACAO_OBRIGATORIA`, MongoDB 112 e labels. Queries genéricas continuam bloqueadas; acesso direto externo pode contornar o protocolo.              |

As revisões devolvidas pelos débitos/guardas são posteriores à escrita. Proposta de mapeamento para os snapshots existentes: `linhas[].versaoUnidade` recebe a revisão do produto validada **antes** do débito e `entrega.snapshot.versaoConfiguracao` a revisão do perfil validada **antes** da guarda. Ambos são tokens operacionais observados, não contadores exclusivos de uma unidade/agenda. Guardar sempre o snapshot completo. D4A-03 pede confirmação deste significado; não inventar campos ausentes nem usar `__v` como substituto. A futura reposição não pode inferir compatibilidade de unidade apenas pela igualdade destes contadores.

## 8. Reconfirmação comercial

Uma proposta de condições atuais nunca é uma order ou reserva. Só nova aceitação explícita permite um pedido com essas condições. Rejeitar o grupo inteiro antes de escrever quando a comparação inicial já identifica conflito; se a alteração ocorrer depois, as condições de escrita provocam rollback integral.

| Alteração                                                                        | Categoria e resposta proposta                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preço diferente ou taxa de entrega diferente, incluindo diminuição               | Reconfirmação explícita; mostrar apenas valores atuais públicos/necessários. Não atualizar o preço aceite silenciosamente.                                                                                        |
| Unidade, referência, conteúdo de embalagem, mínimo ou incremento alterados       | Reconfirmação e eventual ajuste explícito de quantidade; se a quantidade deixar de ser válida, recusar até correção. Nunca converter automaticamente g/ml/unidades/embalagens.                                    |
| Stock menor que a quantidade agregada                                            | Compra inválida até ajuste/remoção explícitos; sem redução automática da quantidade.                                                                                                                              |
| Produto ausente/rascunho/arquivado; produtor sem aprovação/configuração          | Compra indisponível; sem criação parcial. Não divulgar motivos administrativos privados.                                                                                                                          |
| Modalidade/método retirado, concelho excluído ou período já incompatível         | Seleção inválida; comprador escolhe novamente entre opções atuais válidas.                                                                                                                                        |
| Agenda/cobertura alterada mas seleção continua válida; stock mudou e ainda chega | Sem alteração comercial efetiva da seleção, mas o contador pode estar desatualizado. A política conservadora proposta devolve conflito técnico de revisão; não exige aceitar um preço novo inexistente.           |
| Só `updatedAt`, guarda de outra compra ou edição visual sem impacto conhecido    | Não inferir alteração de preço/configuração pela revisão. Ainda pode haver conflito conservador. Uma futura política mais permissiva depende de comparação semântica especificada/testada, não de ignorar tokens. |
| Nome, ingredientes ou outros conteúdos alterados                                 | Não declarar automaticamente irrelevantes apenas por preço/unidade coincidirem. Sem snapshot aceite desses campos não há prova suficiente da equivalência; manter conflito conservador e reconsulta.              |

Proposta interna de conflito: `tipo`, código estável, IDs pertinentes, campos afetados e mensagens sem dados privados. Pode incluir uma projeção mínima das novas condições disponíveis, sem dados bancários, hash, chave alheia ou identidade administrativa. A representação HTTP e a integração visual ficam para etapas autorizadas.

Se a chave já confirmou a compra, prevalece o replay do recibo original, antes desta revalidação comercial. Se a tentativa anterior foi definitivamente abortada, não há vínculo persistido à chave; se o resultado é incerto, não mudar o payload até o resolver. Não usar uma nova chave para contornar a dúvida.

## 9. Horários, fusos e snapshots

Configuração atual: dia ISO 1–7 e intervalos locais `HH:mm` por modalidade, zona IANA e períodos sem passagem da meia-noite. A order guarda `Date` UTC de início/fim e o fuso IANA. O domínio não representa uma hora local ambígua como um `Date` sem escolha explícita.

Proposta de contrato: instantes UTC canónicos e zona exatamente igual à configuração atual; no armazenamento, `Date`, e no exemplo/transportes futuros, ISO com `Z`. Início anterior ao fim; usar o helper existente para validar a união das janelas, pausas e mudança de hora. A agenda tem resolução de minuto e o fim é exclusivo. Não acrescentar duração mínima, antecedência, capacidade, feriados ou limite temporal comercial que não foram aprovados.

Na futura entrada em hora local, alternativas: rejeitar ambiguidades e pedir escolha, ou solicitar deslocamento UTC/ocorrência explicitamente. Recomenda-se não deslocar automaticamente horas inexistentes e exigir escolha para horas repetidas. Esse adaptador não existe nem é introduzido na Etapa 4A; o núcleo 4B pode receber instantes UTC já explícitos e verificados.

Exemplos conferidos com `Intl` instalado para `Europe/Lisbon`: em 29-03-2026, `01:30` local não existe; em 25-10-2026, `01:30` ocorre em `00:30Z` e `01:30Z`. Uma string local sem offset não permite distinguir as duas ocorrências de outubro. Intervalos que atravessem pausas ou uma parte não autorizada de uma mudança de hora devem ser recusados, mesmo com extremos aparentemente válidos.

Guardar o período efetivamente aceite e o fuso no snapshot; edição posterior da agenda não o reescreve. Mudanças futuras da base de fusos podem alterar a apresentação local histórica; o instante UTC persistido continua a referência. O modelo atual não guarda versão dessa base nem offsets separados; essa extensão não é indispensável ao contrato UTC e não está autorizada. Propostas posteriores de alteração de horário continuam sujeitas a OR08 e não fazem parte do checkout inicial.

## 10. Segurança e privacidade

O futuro serviço é interno e fechado até C04 estar cumprida. Contexto tipado, fixture ou papel demonstrativo não constituem autenticação por si. A futura fronteira HTTP deve obter identidade de credenciais verificadas, verificar acesso/capacidades atuais e não permitir ao cliente escolher comprador, aprovação, papéis ou totais definitivos.

Revalidar existência e capacidade comprador para uma compra nova; verificar a conta com capacidade produtor além do perfil aprovado. Não inventar `ativo`, `suspenso` ou uma versão de permissões que não existem no modelo. A lacuna de coordenação desses escritores consta de D4A-05; não se resolve lendo `users` duas vezes em snapshot.

Validar campos e tamanho antes de iniciar trabalho dispendioso. O limite HTTP atual de 100 KiB não protege automaticamente chamadas internas, pelo que o contrato interno também precisa de um orçamento explícito a aprovar. Não aceitar operadores MongoDB, objetos arbitrários, `any` sem validação ou projeções fornecidas pelo cliente.

Morada/contacto de entrega são privados e necessários ao cumprimento da order, mas não pertencem ao recibo comum. Dados bancários do produtor não são necessários para calcular/preparar esta transação; não carregá-los nem copiá-los para o recibo. A falta de instruções privadas de pagamento não é convertida numa nova regra de inelegibilidade sem aprovação.

Logs futuros podem incluir correlação gerada pelo servidor, fase, duração e código sanitizado. Excluir chave bruta, hash canónico, payload completo, JWT, password/hash, morada, contacto, dados bancários, `keyValue` de duplicação e documentos Mongoose em bruto. Não chamar `toJSON` e assumir que daí resulta autorização; o recibo é construído por whitelist própria.

Para o recibo interno, o ID do produtor é a conta já persistida. O contrato público atual usa perfil: definir o mapeamento na fase HTTP sem tornar o replay dependente de um perfil atual que pode ter mudado. Não inventar que o recibo atual já conserva um ID de perfil que não contém.

## 11. Limites técnicos: o que existe e o que continua proposto

| Limite              | Situação real e consequência                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Preço de referência | Existente: 1–1 000 000 cêntimos por kg/L/unidade/embalagem, conforme products. Não aplicar este teto a totais ou taxas.                                                                                                                                                                                      |
| Quantidade/stock    | Existente: inteiros, grelha após agregação; máximo 10 000 000 g/ml ou 100 000 unidades/embalagens. Respeitar mínimo/incremento e stock.                                                                                                                                                                      |
| Dinheiro            | Existente: inteiros seguros até `9007199254740991`; linha/total positivo, taxa não negativa. Cálculos intermédios com BigInt e conversão verificada. Validar também a soma global de todas as orders.                                                                                                        |
| Chave/hash          | Existente no modelo: chave ASCII visível 1–128 caracteres e hash hexadecimal de 64; versão/canonicalização concreta do serviço são proposta.                                                                                                                                                                 |
| Pedido HTTP         | Existente na fundação: `express.json({ limit: '100kb' })`, equivalente a 100 KiB. Não significa que o serviço interno já aplique esse teto.                                                                                                                                                                  |
| Produtos/produtores | Proposta anterior de 100 produtos distintos / 10 produtores; aparece no contrato documental, mas não é limite funcional aprovado nem imposição dos cálculos/modelo. Decidir um orçamento operacional antes de ligar o coordenador; não ativá-lo como facto existente.                                        |
| BSON                | O MongoDB limita cada documento a 16 MiB; o código mede BSON real e exige margem de auditoria. Não existe um teto de 16 MiB para a soma inteira da transação decorrente desta regra por documento. Ver [limites oficiais](https://www.mongodb.com/docs/manual/reference/limits/#bson-documents).             |
| Envelope 1/6/8 MiB  | Limites inicial/normal/absoluto propostos anteriormente; não implementados. Não os promover a regras aprovadas.                                                                                                                                                                                              |
| Reserva/históricos  | Existente: `measureOrderBudget` calcula reserva pessimista com base mínima de 128 KiB por processo/base, quatro eventos máximos e margem por linha, perante 16 MiB. Textos novos têm 128/500/2000/4000 pontos de código conforme campo. Não há um limite de uma reclamação ativa nem truncagem de auditoria. |
| Tempo/retries       | Proposta 20 s + 5 s de recuperação, a calibrar/testar; driver admite orçamento explícito. Não confundir com o prazo comercial aprovado de 168 h, que só começa após entrega declarada.                                                                                                                       |

Medir o snapshot real antes de escrever; nomes existentes sem teto comercial não devem ser truncados para caber numa order. A âncora pode ser maior por conter o recibo/manifesto de todos os produtores e tem de passar a mesma admissão. Não reservar capacidade apenas nas orders não âncora. Medidas de segurança não podem apagar histórico nem transformar cancelamento/regularização pendente em perda de dados.

## 12. Dependências e fronteiras

| Dependência                     | Quando é necessária e estado                                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrato/canonicalização/âncora | Aprovar proposta técnica para os blocos puros 4B; não exige endpoint, nova coleção ou dependência.                                                                                                                                                            |
| Local de levantamento confiável | Necessário antes de criar compras com levantamento; gap no schema comercial atual. Alternativas em D4A-04.                                                                                                                                                    |
| Coordenação dos papéis          | Necessária para afirmar proteção concorrente completa da elegibilidade de contas, além da aprovação/configuração do perfil; âmbito `users` ainda não autorizado.                                                                                              |
| Concelhos                       | Os IDs opacos configurados permitem validar pertença em testes internos. Catálogo real, versão e associação fiável morada/concelho exigem decisão antes da utilização real; não transformar fixtures em catálogo nacional.                                    |
| Infraestrutura transacional     | Replica set MongoDB real e índices atuais preparados; reutilizar ambiente de testes efémero e aleatório, sem Atlas/desenvolvimento. Nenhum contentor é iniciado nesta análise.                                                                                |
| Autenticação/autorização        | Bloqueiam qualquer exposição privada real; núcleo interno/fixtures não são substitutos. Política de acesso a replay próprio após mudança de capacidades precisa de ficar explícita.                                                                           |
| HTTP/OpenAPI                    | Adaptação de IDs, contacto de entrega, respostas de conflito/replay, limites e DTOs ainda não estabilizados. O `OrderConditionSelection` atual não descreve todos os dados privados requeridos pelo modelo, incluindo contacto; não alterar o contrato agora. |
| Frontend/carrinho               | Migração dos IDs/unidades, storage, oferta/revisões aceites e confirmação visual numa etapa própria. Preservar demonstração, três áreas, design, navegação e testes.                                                                                          |
| Ciclo posterior                 | Transições, proposta de horário, pagamento, reclamação, cancelamento/reposição e job de conclusão automática permanecem separados. Não são condição para testar criação inicial isolada.                                                                      |

## 13. Riscos e divergências a não corrigir nesta etapa

1. **Conta versus perfil:** trocar os IDs pode associar condições ao produtor errado. Resolver/verificar a referência em fronteira explícita e em testes com IDs diferentes.
2. **Local de levantamento ausente:** `OrderDeliverySnapshot` exige texto mas `ProducerCommercialSettings` não fornece uma origem autoritativa. `localidade`/`concelho` não são automaticamente uma morada acordada. Não preencher com texto inventado ou com um valor livre do comprador.
3. **Papéis sem guarda coordenada:** snapshot de `users` não disputa uma alteração concorrente de capacidades. `__v` normal ou uma escrita que não muda nada não são prova de proteção. Uma nova guarda exige escrita real e integração de todos os escritores relevantes.
4. **Semântica das versões:** `versaoUnidade`/`versaoConfiguracao` não têm contadores exclusivos de origem. O mapeamento proposto usa revisão observada e snapshots completos; interpretar esses nomes como versões comerciais específicas seria uma garantia falsa.
5. **Revisão conservadora e contenção:** stock, guardas e edições irrelevantes avançam o contador. Isto pode causar mais conflitos do que mudanças comerciais efetivas; não remover a verificação sem protocolo alternativo aprovado/testado.
6. **Commit incerto:** ausência de resposta ou de âncora numa leitura não prova cancelamento. É necessário resultado indeterminado e repetição com a mesma chave, sem efeitos externos antecipados.
7. **Recibo versus serialização:** `serializeOrderSummary` omite metadados internos e não conserva todo o resultado global. Recalcular a resposta com estado atual quebraria o replay original.
8. **Escritores externos:** acesso nativo, scripts ou futuras rotas que ignoram revisão/grupo podem invalidar as garantias. Não abrir bypass genérico nem novas operações parciais.
9. **BSON e ciclo posterior:** o grupo cabe em várias orders, mas cada documento/âncora precisa de reserva de auditoria. Os ensaios atuais não provam carga de produção, crescimento ilimitado ou disponibilidade de Cloud.
10. **Contrato histórico:** o OpenAPI e os relatórios antigos são propostas/estados históricos, não uma implementação atual. A divergência de IDs, contacto, revisão e exposição tem de ser resolvida na respetiva autorização, sem reescrever história.

## 14. Plano detalhado da Etapa 4B — proposta, sem execução

Os caminhos seguintes são **previstos e ainda inexistentes**; não são ligações a ficheiros criados. Todos os novos ficheiros ficam dentro de `apps/api/`, salvo relatório específico futuro. Preservar helpers/modelos existentes por omissão; qualquer alteração indispensável exige âmbito explícito.

| Bloco                                                     | Objetivo e ficheiros previstos                                                                                                                                                                                                      | Dependências e riscos                                                                                                                                                                                       | Testes e critérios de aceitação                                                                                                                                                                     | Isolamento                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 4B.1 — contrato e canonicalização                         | `src/modules/checkout/checkout.types.ts`, `checkout.validation.ts`, `checkout.canonical.ts`, `checkout.errors.ts`; `tests/unit/checkout-canonical.spec.ts`.                                                                         | D4A-01/02/03. Riscos: hash variável, campos privados indevidos, duplicados contraditórios e confusão de IDs.                                                                                                | Mesma semântica/ordem diferente dá hash igual; oferta diferente dá conflito; NFC/trim, UTC, overflow, IDs e campos desconhecidos; reutilizar agregação sem efeitos.                                 | Sim, puro, sem MongoDB/HTTP.                                                                                  |
| 4B.2 — leitura de idempotência e recibo                   | `src/modules/checkout/checkout-idempotency.repository.ts`, `checkout.receipt.ts`; testes unitário/integração próprios e `tests/support/checkout-fixtures.ts`.                                                                       | 4B.1, schema/índices existentes. Riscos: recibo alheio, reconstrução com estado atual, identificação errada de E11000.                                                                                      | Pesquisa global, comprador antes de dados, hash, projeção mínima, recibo imutável e índice real; nenhuma nova coleção ou escrita fora de sessão.                                                    | Sim, com âncoras fictícias criadas pelos testes.                                                              |
| 4B.3 — preparação de snapshots                            | `src/modules/checkout/checkout-preparation.ts`; `tests/unit/checkout-preparation.spec.ts`.                                                                                                                                          | 4B.1, cálculos/validação existentes, D4A-03/04/06. Riscos: usar preço cliente, taxa duplicada, local inventado e reserva insuficiente na âncora.                                                            | Grupo por produtor, snapshots completos, valores atuais coincidentes com os aceites, estado `pendente`, pagamento `por_pagar`, relógio inicial sem execução, BSON incluindo manifesto/recibo.       | Sim, com dados já carregados e fonte de levantamento confiável de teste; não prova integração operacional.    |
| Pré-requisito condicionado — lacunas de origem/escritores | Proposta separada: campo canónico de levantamento em `producer-commercial.types.ts`/schema/validação e testes; coordenação em `users/user.model.ts` e eventual `user-concurrency.repository.ts`, com testes de todos os escritores. | D4A-04/05 e autorização específica por ficheiro. Riscos de alterações a contratos/serialização e falsas guardas sem escrita efetiva.                                                                        | Perfil antigo preservado sem preenchimento inventado; snapshot fiel; alteração concorrente de conta versus compra gera conflito/rollback real. Não adicionar suspensão/permissões funcionais novas. | Pode ser autorizado/testado antes do coordenador; não executar sob autorização apenas documental.             |
| 4B.4 — coordenador transacional                           | `src/modules/checkout/checkout.service.ts`, `checkout-transaction.ts`; `tests/integration/checkout.spec.ts`.                                                                                                                        | Blocos anteriores, lacunas indispensáveis resolvidas e D4A-06/07. Reutiliza os dois repositórios 3B e `Order.save`. Riscos: sessão omitida, snapshots antigos, commit parcial, retries com objetos antigos. | Um/vários produtores; mesma sessão em tudo; todos os documentos/guardas/débitos ou nenhum; sucesso apenas após commit. Sem rotas, jobs ou pagamentos.                                               | Núcleo interno com fixtures/contexto confiável, sem rede privada. Compra completa depende dos pré-requisitos. |
| 4B.5 — falhas, concorrência e replay                      | Completar `tests/integration/checkout-concurrency.spec.ts`, `checkout-idempotency.spec.ts`, `checkout-recovery.spec.ts` e fixtures.                                                                                                 | 4B.4 e orçamento de retry. Riscos: mocks substituírem prova real, loops infinitos e chave nova após dúvida.                                                                                                 | Índice global, simultaneidade, último stock, rollback no último produtor, falhas antes/depois de commit e resultado indeterminado; sem sleeps arbitrários.                                          | Ensaios MongoDB real isolados; instrumentos de falha apenas nos testes.                                       |
| 4B.6 — regressão e entrega                                | Relatório técnico futuro `docs/api/phase-3.2-checkout-implementation.md`.                                                                                                                                                           | Todos os blocos autorizados. Risco de alegar HTTP/autenticação/integração concluídos.                                                                                                                       | Preservar os 683 backend, novos testes, TypeScript, ESLint, Prettier com ignore explícito, build API, links e integridade; revisão antes de Git.                                                    | Entrega local, sem publicação automática.                                                                     |

Fora de 4B interno: rotas/middleware/DTOs HTTP e autenticação reais; adaptações React/carrinho/áreas privadas; comandos posteriores das orders; jobs/sockets/Cloud. São planos dependentes separados, não tarefas implícitas destes blocos. Na futura integração frontend, preservar os 274 testes demonstrativos existentes e acrescentar cobertura real sem os substituir.

## 15. Plano de testes futuros

Nenhum teste é criado ou executado nesta etapa. Mocks servem para funções puras e injeção pontual de falhas, não para demonstrar atomicidade ou arbitragem de índices.

| Cenários                      | Unitários previstos                                                                                          | Integração MongoDB real e evidência esperada                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Um/vários produtores          | Agrupamento, seleções exatas, soma de totais e taxa por order.                                               | Número exato de orders; mesma operação/comprador; uma âncora; stock e guardas corretos; recibo global coerente.                                                                                                                                                   |
| Fragmentos/cálculos           | 250 + 250 g → 75; mínimos/incrementos depois da soma; referências kg/L; zero/overflow; oferta contraditória. | Snapshots/totais persistidos correspondem aos dados validados, sem taxa duplicada.                                                                                                                                                                                |
| Stock/elegibilidade           | Quantidade inválida, produto indisponível, aprovação/configuração/modos/métodos/horários.                    | Última unidade entre compradores: no máximo uma compra confirmada. Stock insuficiente e produto/produtor inválido desfazem o grupo inteiro.                                                                                                                       |
| Oferta/reconfirmação          | Preço/taxa/unidade/grelha alterados; revisão técnica versus alteração comercial.                             | Edição antes da compra ou entre leitura/escrita provoca recusa/conflito e nenhum commit parcial; oferta nova nunca aceite por retry automático.                                                                                                                   |
| Snapshots                     | Preço, unidade, nome, taxa, período e local; estado/pagamento/cronómetro iniciais; versões pré-escrita.      | Edições posteriores de produto/perfil não mudam orders/recibo; prova de reserva BSON da âncora e das outras orders.                                                                                                                                               |
| Rollback global               | Classificação de erros sem mascarar falhas internas.                                                         | Falha injetada na última guarda, último débito ou última order reverte inclusive âncora, índices associados, stock e revisões anteriores.                                                                                                                         |
| Idempotência/replay           | Ordenação determinística, fragmentação equivalente, dados diferentes, bytes/textos/datas canónicos.          | Mesmo comprador/chave/pedido sequencial ou concorrente: um grupo e um débito por produto; outro payload conflita, inclusive em produtores disjuntos.                                                                                                              |
| Compradores distintos         | Comparação de identidade antes de projetar recibo.                                                           | Mesma chave global não confirma duas compras e não expõe dados do vencedor ao outro comprador.                                                                                                                                                                    |
| Timeout/resposta perdida      | Resultado indeterminado e manutenção da chave/payload.                                                       | Confirmar no MongoDB e falhar antes de entregar a resposta; repetir recupera o recibo original mesmo após mudança de preço/estado. Não simular apenas a base com mocks.                                                                                           |
| Commit incerto/retries        | Orçamento finito, labels preservados, callback repetível e documentos relidos.                               | Injeção controlada junto da fronteira de commit real; demonstrar commit repetido/recuperação sem duplicar efeitos. Para perda de resposta do protocolo de rede, prever ensaio específico isolado; não afirmar que uma exceção anterior ao commit prova esse caso. |
| Concorrência de contas/perfis | Portas de contexto e capacidades sem papéis demonstrativos.                                                  | Barreiras explícitas: snapshot, alteração externa confirmada e escrita; testar aprovação, configuração, produto e, após autorização da guarda, papéis da conta.                                                                                                   |
| Fusos/agenda                  | UTC, intervalo inválido, pausa, zonas diferentes e ocorrências DST.                                          | Período guardado igual ao aceite; alteração concorrente da agenda impede confirmar condições incompatíveis.                                                                                                                                                       |
| Privacidade/legado            | Projeções/erros sem chave/hash/morada/contacto/banco; perfis parciais e ausência de revisão/configuração.    | Revisão ausente tratada como zero; ausência comercial continua válida para perfil, mas impede compra; nenhuma migração automática ou ID alterado.                                                                                                                 |

Bases de teste aleatórias `docampo_test_<uuid>`, MongoDB real replica set existente, criação explícita dos índices e limpeza apenas da base da suite. Usar barreiras por operações aguardadas; nada de sleeps para presumir uma intercalação. Falhas transitórias e violações de índices são identificadas separadamente. Não utilizar a base de desenvolvimento/Atlas nem criar coleções além das existentes necessárias aos ensaios.

## 16. Questões pendentes e aprovações necessárias

Todas as linhas são propostas ou decisões de entrada, não escolhas feitas pelo utilizador nesta etapa. O/OR mantêm-se aprovadas.

| ID     | Questão, alternativas e recomendação                                                                                                                                                                                                                                                                                                                                                | Momento e natureza                                                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D4A-01 | Confirmar a arquitetura técnica: âncora em `orders` versus registo global separado. Recomenda-se âncora, já prevista/modelada/testada, sem coleção nova. Não reabrir a unicidade global ou a atomicidade aprovadas.                                                                                                                                                                 | Antes de 4B.2/4B.4; confirmação da proposta de implementação, não novo requisito funcional.                                                                  |
| D4A-02 | Aprovar o contrato/canonicalização v1 e replay por recibo original. Alternativa: algoritmo genérico de canonicalização de JSON com dependência adicional; recomenda-se representação explícita, whitelist, normalização existente e `node:crypto`.                                                                                                                                  | Antes de 4B.1; congelar os campos que determinam igualdade, sem instalar dependências.                                                                       |
| D4A-03 | Definir semântica dos tokens e reconfirmação: revisão estrita, conservadora, incluindo tokens no hash; ou comparação semântica com revisões correntes e política adicional. Recomenda-se começar estrito para reutilizar 3B, guardar revisões pré-escrita nos campos existentes e não alegar versões exclusivas.                                                                    | Antes de 4B.1/4B.3. Uma evolução semântica posterior precisa de protocolo/testes; nomes dos campos não reabrem O11.                                          |
| D4A-04 | Fonte de `localLevantamento`: novo campo canónico validado no produtor; resolver confiável já mantido noutro sistema; ou tratar localidade genérica como suficiente mediante decisão expressa. Não existe esse resolver atualmente. Recomenda-se campo explícito, opcional em perfis antigos, necessário para compras com levantamento; não aceitar morada arbitrária do comprador. | **Bloqueia o levantamento completo** até decisão e autorização específica da extensão/guardas/snapshots. Não criar o campo agora.                            |
| D4A-05 | Concorrência de capacidades: revisão/guarda real em `users` e todos os escritores; ou ensaio interno restrito, sem escritores concorrentes de papéis e com limitação expressamente aceite. Recomenda-se coordenação real para a garantia completa. Uma leitura ou no-op não equivalem à guarda.                                                                                     | **Bloqueia a alegação de elegibilidade concorrente completa** e o coordenador com essa garantia. Autorizar âmbito próprio; não alterar users implicitamente. |
| D4A-06 | Orçamento de compra: confirmar/rever propostas de 100 produtos distintos/10 produtores e tamanho interno; manter controlo monetário/BSON existente. Recomenda-se limite operacional explícito ensaiado, sem tratar os valores propostos ou 1/6/8 MiB como já aprovados.                                                                                                             | Antes de 4B.3/4B.4. Não inventar limite comercial ou diminuir capacidade dos modelos existentes.                                                             |
| D4A-07 | Aprovar política temporal de retries/recuperação: orçamento finito do driver, proposta 20 s + 5 s, versus coordenação manual. Recomenda-se reutilizar `withTransaction`, preservar labels e resultado indeterminado, sem loops exteriores ilimitados.                                                                                                                               | Antes de 4B.4/4B.5; parâmetro técnico, não SLA.                                                                                                              |
| D4A-08 | Catálogo/entrada temporal: fonte canónica de concelhos, correspondência morada/concelho e escolha explícita nas horas ambíguas versus entrada já resolvida em UTC. Recomenda-se núcleo UTC explícito e IDs configurados para testes; resolver fontes reais na integração.                                                                                                           | IDs opacos/UTC bastam aos blocos internos isolados; utilização real/entrada local exige decisão posterior antes da exposição.                                |
| D4A-09 | Fronteira pública e replay: IDs de perfil versus conta, contacto privado, acesso ao recibo próprio após alteração de capacidades e status HTTP de replay/conflitos. Recomenda-se DTO mínimo próprio e acesso autenticado contextual, mantendo C04.                                                                                                                                  | Etapa HTTP/segurança; não bloqueia funções puras e não autoriza modificar OpenAPI agora.                                                                     |

As confirmações técnicas D4A-01/02/03/06/07 podem integrar uma autorização limitada dos blocos 4B correspondentes. Não é necessária uma nova votação sobre decisões O/OR, estados, meio de pagamento ou regra de stock já aprovados. D4A-04/05 exigem indicação explícita do âmbito de código adicional ou da limitação aceite; não ficam resolvidas só por aprovar este relatório.

## 17. Critérios de prontidão e fecho documental

Prontidão para autorizar **4B.1/4B.2 isolados**: contrato/fingerprint/recibo e política de tokens revistos; restrição a operações internas, sem checkout público; ficheiros/testes autorizados. São blocos executáveis separadamente e não dependem de autenticação real para testar funções puras ou leituras com fixtures isoladas.

Prontidão para autorizar **o checkout transacional completo**: D4A-04/05 resolvidas para o âmbito prometido; fontes de snapshots fiáveis; orçamento e política transacional definidos; nenhum ID ou token inventado; todas as escritas relevantes coordenadas; índices/replica set disponíveis; plano de concorrência/rollback/replay aprovado. O núcleo não é considerado pronto para produção só porque os seus auxiliares já passaram testes.

Critério de saída futuro de 4B: compra de um/vários produtores integral, stock não negativo, um único grupo por chave, recibo original recuperável após falha, ausência de efeitos externos antecipados, privacidade comprovada e regressão anterior preservada. Só uma autorização posterior de segurança/HTTP pode expor a operação. Não iniciar 4B por efeito desta documentação.

Validações desta Etapa 4A: estrutura Markdown e formatação com Prettier em modo `--check`, exemplos JSON, ligações/âncoras internas, `git diff --check`, comparação SHA-256 dos 293 ficheiros anteriores, comparação dos nove documentos F0 com `main` e confirmação de apenas este novo caminho. Código/modelos/repositórios/configurações permanecem iguais; **não foram reexecutados os 683 testes backend**, nem TypeScript, ESLint ou build, por não haver alteração de código. Não foram instaladas dependências, iniciados contentores ou feitas escritas Git.

Entrega prevista: zero ficheiros rastreados modificados, um documento não rastreado, staging vazio, HEAD/main inalterados e nenhuma operação de commit/push/branch/merge/rebase. Aguardar revisão e autorização explícita para qualquer implementação ou consolidação.
