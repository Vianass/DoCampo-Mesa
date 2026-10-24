# Fase 3.2 — users/producers/products implementados; modelos seguintes propostos

> Estado vigente após nova aprovação: O01–O16 e OR01–OR12 aprovadas; orders pronto documentalmente para persistência isolada, aguardando autorização de implementação. Ver [consolidação vigente](phase-3.2-orders-readiness.md). Recomendações/pedidos de aprovação das revisões anteriores são históricos e não reabrem estas decisões.

Ler em conjunto com a [proposta principal](phase-3.2-proposal.md), que define autoridade, alternativas de quantidade, categorias, permissões e plano. Consolidação: 2026-10-17; preparação: 2026-10-16; base `68f41ec`. A preparação era documental; users/producers foram posteriormente implementados/testados. Ver [entrega do primeiro bloco](phase-3.2-identity-implementation.md). products implementado após aprovação P01–P08; orders em revisão documental após O01–O16, sem schema criado; outros quatro modelos não implementados. Q01/Q03/Q04/Q06/Q14 estão aprovadas no âmbito funcional; T32-01–T32-06 estão aprovadas no âmbito do registo; detalhes residuais e restantes Q continuam pendentes. Ver [prontidão, bloqueios A01–A03 e primeiro bloco](phase-3.2-readiness.md).

## Convenções e leitura dos exemplos

O = requisito académico; A = decisão funcional ou técnica aprovada; P = concretização técnica proposta; B = dependência pendente. «Obrigatório» abaixo refere-se ao schema candidato, sujeito à aprovação técnica, não a uma obrigação académica adicional. Tipos Mongoose/BSON são opções futuras. Referências são lógicas, sem foreign keys automáticas.

Proposta comum P: `_id: ObjectId` obrigatório, `createdAt` e `updatedAt: Date` UTC geridas pelo servidor; versão inteira não negativa quando necessária. DTO usa ID estável em string e datas ISO, nunca exporta documento Mongoose. Contas e perfis têm IDs distintos. Não permitir atribuição pelo cliente de proprietários, autores de decisão, timestamps, totais, permissões ou resultados. Validar tipos e representações antes dos casts permissivos do Mongoose; não aceitar booleanos, strings malformadas, NaN/Infinity ou perda de resolução só porque o driver consegue convertê-los. A política de conversão explícita faz parte de T32.

Os blocos JSON são **recortes documentais ilustrativos**, não fixtures/seeds/documentos prontos a inserir: omitem timestamps comuns e alguns campos condicionais; hash é placeholder explícito, nunca credencial real. Quantidades dos exemplos usam a representação B aprovada; products concretiza P01–P08 e os esclarecimentos aprovados. Campos dos modelos seguintes e referências de preço fora de products continuam propostas. IDs são sintaticamente plausíveis e fictícios: user vendedor/comprador `...001`, comprador `...002`, administrador `...003`, perfil `...101`, produto `...201`, encomenda `...301`, leilão `...401`, bid `...501`, review `...601`. Identidades referenciadas seriam fornecidas num conjunto de teste autorizado; não existem na base por esta documentação.

## 1. users — obrigatório O

O primeiro bloco implementado segue A01 aprovada: nome/emailNormalizado/passwordHash/papeis, ID e timestamps. Os campos ativo e versaoPermissoes abaixo são possibilidades posteriores, excluídas desse bloco; limites e índice único aprovados, com resultados na entrega e contexto na [análise de prontidão](phase-3.2-readiness.md).

**Finalidade:** uma identidade por conta, com capacidades acumuláveis Q01, dados privados e relações de compra/venda. Não criar conta visitante ou duplicar conta para alternar áreas.

| Campo candidato  | Tipo                                  | Obrigatório proposto               | Valores / validação / origem                                                                                                                           |
| ---------------- | ------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| nome             | String                                | Sim                                | A01 implementada: nome completo 1–120 pontos de código após NFC/trim. Nome público reduzido depende Q10.                                               |
| emailNormalizado | String                                | Sim                                | A01 implementada: email válido, normalizado e único; não aplicar regras específicas de fornecedores como remover pontos automaticamente.               |
| passwordHash     | String privado, select:false proposto | Sim para futura conta autenticável | Representação bcrypt validada, select:false e removido de JSON/objeto; hashing/autenticação não implementados.                                         |
| papeis           | Array de String enum                  | Sim, não vazio e sem repetidos     | A/T32-01: lista de papéis e comprador+produtor acumuláveis; enum académico, sem visitante. Obrigatoriedade/deduplicação aprovadas e implementadas A01. |
| ativo            | Boolean                               | Sim apenas se política adotada     | P; estado técnico não concede ao administrador poderes novos de suspensão. Não inventar ciclo de contas.                                               |
| versaoPermissoes | Inteiro não negativo                  | Só se adotado                      | P para revalidação futura; não substitui estado atual/expiração Q13.                                                                                   |

**Referências/embedding:** não embeber catálogo, encomendas, bids ou reviews em users; perfil separado aprovado em producers (T32-06). A relação um-para-zero/ou-um não é uma segunda identidade. Comprar e vender podem referenciar o mesmo user em relações distintas.

**Índice implementado A01:** emailNormalizado único, criado e aguardado explicitamente no teste; eventual `{papeis:1, createdAt:-1}` apenas por consulta justificada. Um índice multikey não deduplica elementos do próprio array: validar papeis sem repetidos separadamente. Não fazer email único só por consulta prévia, sujeita a corrida.

**Integridade/estados/acesso:** capabilities comerciais não bastam para vender sem perfil aprovado. Registo futuro não aceita admin/ativo/hash/versaoPermissoes do cliente. Admin inicial só por procedimento controlado. Campo ativo, combinações administrativas e revalidação de claims ficam P/Q13. Público não recebe email/hash/versão; próprio recebe identidade necessária; admin recebe projeção mínima, sem hash.

```json
{
  "_id": { "$oid": "000000000000000000000001" },
  "nome": "Conta de exemplo",
  "emailNormalizado": "produtor@example.invalid",
  "passwordHash": "<placeholder-documental-nao-inserir>",
  "papeis": ["comprador", "produtor"]
}
```

## 2. producers — coleção adicional aprovada A/T32-06

A02/A03 aprovadas incluem userId, nomePublico, responsável derivado da conta, localidade, concelho, descricao obrigatória, telefone privado, imagem opcional por metadados e aprovacao, com ID/timestamps; coordenadas e moderacao ficam fora. Ver resultados na entrega e contexto na [análise de prontidão](phase-3.2-readiness.md).

**Finalidade:** perfil comercial e candidatura separados da conta, com dados públicos e decisão privada. Coleção própria aprovada por T32-06; embedding do perfil em users deixa de ser alternativa pendente. Cardinalidade, mínimos, índices e metadados do primeiro bloco aprovados em A02/A03; campos fora desse bloco continuam propostas.

| Campo candidato                | Tipo                      | Obrigatório proposto      | Valores / validação / origem                                                                             |
| ------------------------------ | ------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| userId                         | ObjectId → users          | Sim                       | Único e imutável; conta com capacidade produtor; A/Q01, referência física P.                             |
| nomePublico / localidade       | String                    | Sim no perfil completo    | Nome/localidade não vazios; mínimos de perfil editável A02 aprovados; normalização derivada para filtro. |
| descricao                      | String                    | Sim                       | Texto limitado por regra futura; sem HTML ativo arbitrário.                                              |
| concelho                       | String                    | Sim                       | A02: texto não vazio normalizado.                                                                        |
| telefone                       | String privado            | Sim                       | A02: não vazio, select:false; sem formato nacional presumido.                                            |
| nomeResponsavel                | Virtual derivado da conta | Na leitura com populate   | Sem cópia persistida do nome; A02.                                                                       |
| localizacao                    | Objeto latitude/longitude | Não até Q11               | Intervalos técnicos válidos; publicar apenas localização autorizada, sem inferir morada privada.         |
| imagem                         | Metadados url/alt         | Não                       | URL/chave/alt; bytes só em Blob na fase própria; limites P.                                              |
| aprovacao.estado               | String enum embebido      | Sim                       | pendente/aprovado/rejeitado A/Q04; inicial pendente aprovado A02.                                        |
| aprovacao.submetidaEm          | Date                      | Sim                       | Data atribuída pelo servidor, P.                                                                         |
| aprovacao.decisao.autor / data | ObjectId → users / Date   | Condicional               | P: presentes em decisão, ausentes em pendente; ator administrativo real, não do body.                    |
| aprovacao.decisao.justificacao | String                    | Na rejeição, aprovada A03 | Q04 aprova consultar justificação; regra de não vazio/limite aprovada A03.                               |
| moderacao                      | Objeto opcional           | Só após Q12               | Não aprovar novos estados/poderes por antecipação.                                                       |

**Índice implementado A02:** userId único. Índices futuros propostos: `{aprovacao.estado:1, createdAt:1}` para fila; localidade normalizada para consulta elegível, se demonstrada. Não criar índice geoespacial só por existir mapa.

**Integridade/estados:** decisão e estado têm de ser coerentes; referência do autor existe e tem competência administrativa no serviço. Aprovação não altera produtos. Rejeitado tem consulta própria da decisão/justificação; edição/recandidatura não são concedidas implicitamente. Nenhuma transição de revogação/aprovado→rejeitado é inventada. Atualizações concorrentes só decidem uma candidatura ainda pendente segundo política futura.

**Acesso:** público recebe apenas perfil autorizado e de produtor aprovado; próprio recebe perfil/candidatura sem identidade privada do decisor; administração consulta decisão completa necessária. Morada privada, contactos não autorizados e hash nunca entram em projeções públicas.

```json
{
  "_id": { "$oid": "000000000000000000000101" },
  "userId": { "$oid": "000000000000000000000001" },
  "nomePublico": "Horta ilustrativa",
  "localidade": "Localidade de teste",
  "concelho": "Concelho de teste",
  "descricao": "Descrição fictícia da atividade.",
  "telefone": "+351 000 000 000",
  "aprovacao": {
    "estado": "aprovado",
    "submetidaEm": { "$date": "2026-10-10T09:00:00Z" },
    "decisao": {
      "autor": { "$oid": "000000000000000000000003" },
      "data": { "$date": "2026-10-11T09:00:00Z" },
      "justificacao": "Dados ilustrativos revistos."
    }
  }
}
```

## 3. products — modelo implementado localmente

P01–P08 e os esclarecimentos de preço/aplicabilidade foram aprovados antes do código. Ver [decisões, estrutura, testes e limites](phase-3.2-products.md). Os campos abaixo são efetivos do modelo; orders/auctions/bids/reviews seguintes continuam propostas.

| Campo                                 | Regras implementadas                                                                                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| produtor                              | ObjectId obrigatório/imutável → users. ID de perfil não é identidade da conta. Atribuição pela sessão fica para serviço futuro, sem API agora.                                                                                                |
| nome                                  | Obrigatório, String NFC/trim não vazia, inclusive em rascunho.                                                                                                                                                                                |
| estadoPublicacao                      | rascunho/publicado/arquivado, inicial rascunho; reposição de stock/aprovação de perfil não publica.                                                                                                                                           |
| descricao / categoriaId               | Podem faltar em rascunho; obrigatórios na publicação. Categoria entre cat-001–cat-012, com rótulos separados dos IDs. P04 substitui a antiga obrigatoriedade de categoria em rascunho.                                                        |
| precoCent / moeda                     | Preço opcional no rascunho, obrigatório para publicar; inteiro seguro de 1 a 1 000 000, EUR. Sem valor zero por omissão.                                                                                                                      |
| unidadeVenda                          | Opcional no rascunho, obrigatória para publicar; modalidade, base e referência fixas coerentes; mínimo/incremento inteiros positivos na base. Referências: 1000 g, 1000 ml, uma unidade ou uma embalagem.                                     |
| unidadeVenda.conteudoPorUnidade       | Metadados opcionais para unidade/embalagem, com quantidade inteira positiva e dimensão un/g/ml; não altera a contagem comercial do stock.                                                                                                     |
| stockDisponivel                       | Inteiro seguro não negativo; obrigatório na publicação. Máximo por peso/volume 10 000 000 g/ml; unidade/embalagem 100 000. Sem modalidade num rascunho, aplica-se apenas o teto global 10 000 000 até ser possível validar o teto específico. |
| ingredientesAplicaveis / ingredientes | Declaração booleana obrigatória na publicação. Se true, lista não vazia; se false, lista vazia, sem apagar dados silenciosamente. Rascunho pode ter a declaração/lista ainda incompletas.                                                     |
| etiquetas / epocaMeses                | Opcionais; etiquetas e ingredientes como listas de strings NFC/trim não vazias; meses inteiros 1–12 sem repetição, informativos. Sem limites comerciais de dez etiquetas/trinta ingredientes adotados por inferência.                         |
| imagens                               | De zero a duas no rascunho; uma ou duas para publicar. URL HTTP(S) sem credenciais, alt opcional, principal booleana com no máximo uma marcada. Só metadados; sem bytes/upload. Sem principal escolhida não há seleção automática nesta fase. |
| modoProducao                          | Texto opcional; taxonomia/certificação não fechadas por P01–P08 nem exigidas para publicar por inferência.                                                                                                                                    |
| _id / createdAt / updatedAt / __v     | Identidade e timestamps; versão técnica Mongoose no documento raiz. Unidade/conteúdo/imagens sem identidade ou versão própria. Não define protocolo público de concorrência.                                                                  |

**Índices efetivos:** _id intrínseco; compostos produtor/estadoPublicacao e estadoPublicacao/categoriaId, sem unicidade do nome. Sem índices multikey, geoespaciais, TTL ou contadores de disponibilidade por antecipação.

**Integridade:** publicar valida internamente existência da conta com papel produtor e perfil aprovado, usando a mesma conexão/sessão quando fornecida. Esta é elegibilidade do dado; não autentica um ator, não verifica ownership de um pedido e não implementa middleware de autorização. Não existe transação que bloqueie mudanças concorrentes do perfil; leituras públicas futuras têm de verificar aprovação atual. Rascunho apenas referencia o owner, sem prometer chave estrangeira.

**Persistência:** tipos e campos fornecidos são validados mesmo incompletos; publicação exige a combinação completa. Escritas por documento/create/save com validação; queries/bulk recusadas como nos modelos existentes. Save com projeção que omite campos de publicação é recusado. Sem reserva, desconto ou checkout. Um publicado com stock zero mantém estado publicado; disponibilidade comercial é derivada futuramente de estado/stock/mínimo/perfil, nunca um booleano persistido controlável pelo cliente.

Exemplo documental com quantidade comercial por embalagem distinta do seu conteúdo:

```json
{
  "_id": {
    "$oid": "000000000000000000000201"
  },
  "produtor": {
    "$oid": "000000000000000000000001"
  },
  "nome": "Morangos de exemplo",
  "estadoPublicacao": "publicado",
  "categoriaId": "cat-002",
  "etiquetas": ["Colheita local"],
  "precoCent": 350,
  "moeda": "EUR",
  "unidadeVenda": {
    "modalidade": "embalagem",
    "unidadeBase": "un",
    "quantidadeReferencia": 1,
    "quantidadeMinima": 1,
    "incrementoCompra": 1,
    "rotulo": "Embalagem de 500 g",
    "conteudoPorUnidade": {
      "quantidade": 500,
      "unidade": "g"
    }
  },
  "stockDisponivel": 20,
  "descricao": "Morangos fictícios para documentação.",
  "ingredientesAplicaveis": false,
  "imagens": [
    {
      "url": "https://example.invalid/morangos.jpg",
      "principal": true
    }
  ]
}
```

O exemplo não é seed nem prova de produtor real aprovado. O snapshot das linhas de encomenda abaixo continua proposta para o modelo futuro, não implementação de P08 nesta etapa.

## 4. orders — obrigatório O; apenas análise

**Finalidade e aprovação:** O01–O16 aprovadas funcionalmente, sem autorização de implementação. Referências comprador/produtor a users e linhas embebidas cumprem E p. 18; uma order independente por produtor e referência comum à compra são agora decisões aprovadas. Ver [prontidão, estrutura completa, OR01–OR12 e plano de testes](phase-3.2-orders-readiness.md). O01 não escolhe a representação física de idempotência nem aprova todos os campos desta tabela.

| Campo/grupo candidato                                      | Tipo / conteúdo proposto                                                                                           | Aprovação e decisões residuais                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| comprador / produtor                                       | ObjectId → users, imutáveis; perfil resolvido por producers.userId                                                 | Referências académicas, O01; atribuição pelo serviço autenticado, não por IDs do frontend.                                          |
| operacaoCompraId / chave do pedido                         | Referência comum opaca; chave idempotente e hash canónico internos separados                                       | O01 exige referência; OR05 define formato, documento âncora ou coleção extra e índices.                                             |
| linhas[]                                                   | Array embebido não vazio; produto → products, nome, quantidade, unidadeSnapshot, precoReferenciaCent, subtotalCent | O11/T32-02/03/06 e P02; OR03 grelha/duplicados, OR04 limites. Valores comerciais imutáveis após submissão.                          |
| subtotalProdutosCent / taxaEntregaCent / totalCent / moeda | Cêntimos inteiros/EUR; subtotal soma linhas, total soma subtotal e taxa                                            | O06/O11; levantamento sem taxa; OR04 define tetos e subtotal zero derivado de half-up. Não aplicar teto do preço unitário ao total. |
| entrega                                                    | Modalidade, morada/concelho/local necessários, taxa e período pedido/acordado/propostas                            | O05–O08; formatos e configuração de origem OR02/OR08; guardar só condições aplicadas, não todas as zonas.                           |
| pagamento                                                  | Método, estado e histórico próprio com responsável/data                                                            | O09/O10; três estados independentes da encomenda; OR10 transições/correções; sem processamento bancário ou dados privados públicos. |
| estado / historicoEstado[]                                 | pendente/confirmada/em_preparacao/pronta/concluida/cancelada e histórico estruturado                               | O02/O03; OR01 explicita entregue académico versus concluida; OR07 ações/concorrência.                                               |
| pedidosCancelamento[] / cancelamento                       | Pedido identificado, responsável/data/motivo, decisão e estado anterior ao cancelamento efetivo                    | O03; OR07 cardinalidade e progressão enquanto aguarda. Pedido não cancela por si.                                                   |
| reposicaoStock[]                                           | Movimento/saldo por linha, unidade histórica, autor/data e decisão                                                 | O04; OR06 reposição controlada, teto, unidade alterada/ausência de produto e exceções sem duplicações.                              |
| rececao                                                    | Declaração de entrega, limite, confirmação/conclusão e motivo                                                      | O13/O14; OR09 contagem dos sete dias e retoma após reclamação. Não modifica pagamento.                                              |
| reclamacoes[]                                              | Reclamações e intervenções embebidas com IDs/atores/datas/tipos/conteúdo/decisões; quatro estados O16              | O15/O16; OR11 cardinalidade/limites/resolução/reabertura. Sem coleção adicional nem reembolso automático.                           |
| versao / timestamps                                        | Controlo concorrente explícito proposto e datas UTC do servidor                                                    | OR12 nos serviços; não assumir que __v existente resolve todos os escritores.                                                       |

**Índices propostos, não criados:** comprador/data; produtor/estado/data; operação/produtor único; unicidade global da chave do pedido por comprador conforme OR05. Um índice comprador/chave/produtor isolado não impede retries com produtores disjuntos. Não criar índice de origem de leilão ou TTL nesta etapa. Índices/refs não garantem ownership ou existência automaticamente.

**Correspondência e integridade:** o preço candidato precoReferenciaCent corresponde semanticamente ao precoUnitCent legado do DTO, com referência numérica em unidadeSnapshot.quantidadeReferencia. Nomes de campos e DTOs finais ainda são propostas. Snapshots não mudam ao editar produto, taxa, zona ou agenda habitual; proposta de novo período exige aceitação e histórico O08. Linhas de todas as orders do grupo são debitadas na mesma compra atómica futura, sem reservas na cesta. Reclamação não resolvida bloqueia conclusão automática; pagamento tem ciclo independente.

**Acesso:** privado ao comprador/produtor intervenientes e administração por projeção necessária. Produtor não recebe restantes orders do grupo. O03/O13/O15 concedem intervenção administrativa limitada, sem alteração genérica de preços/linhas ou confirmação de pagamento. Não criar comandos ou endpoints nesta revisão; C04 preservada.

**Recorte JSON ilustrativo, não DTO completo nem fixture inserível:** representa conclusão pelo comprador usando O02, com uma linha já comprada. Omite operação comum, entrega, pagamento, receção e parte do histórico para não fixar OR pendentes. Não prova conformidade do futuro schema nem resolve a equivalência académica OR01. A review ilustrativa posterior conserva ligação a esta order; critérios finais de avaliação continuam Q10.

```json
{
  "_id": {
    "$oid": "000000000000000000000301"
  },
  "comprador": {
    "$oid": "000000000000000000000002"
  },
  "produtor": {
    "$oid": "000000000000000000000001"
  },
  "linhas": [
    {
      "produto": {
        "$oid": "000000000000000000000201"
      },
      "nome": "Morangos de exemplo",
      "quantidade": 2,
      "unidadeSnapshot": {
        "modalidade": "embalagem",
        "unidadeBase": "un",
        "quantidadeReferencia": 1,
        "conteudoPorUnidade": {
          "quantidade": 500,
          "unidade": "g"
        },
        "quantidadeMinima": 1,
        "incrementoCompra": 1
      },
      "subtotalCent": 700,
      "precoReferenciaCent": 350
    }
  ],
  "subtotalCent": 700,
  "totalCent": 700,
  "moeda": "EUR",
  "estado": "concluida",
  "historicoEstado": [
    {
      "estado": "concluida",
      "data": {
        "$date": "2026-10-12T12:00:00Z"
      },
      "autor": {
        "$oid": "000000000000000000000002"
      }
    }
  ]
}
```

Subtotal de duas embalagens permanece 700 cêntimos. totalCent igual ao subtotal neste recorte não aprova uma política geral de entrega gratuita; a taxa será registada no modelo completo segundo O06. Este exemplo não executa conclusão, pagamento, débito ou reposição.

## 5. auctions — obrigatório O

**Finalidade:** lote e retrato atual do leilão; histórico separado em bids. Estados académicos agendado/ativo/terminado, sem rascunho/cancelado acrescentado por analogia com products.

| Campo candidato                   | Tipo                                         | Obrigatório proposto  | Valores / validação / dependência                                                                  |
| --------------------------------- | -------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| produtor                          | ObjectId → users                             | Sim                   | Capacidade produtor e perfil aprovado; A/Q01/Q04.                                                  |
| produto                           | ObjectId → products                          | Só conforme Q07       | Se associado, produto do mesmo user e snapshot da unidade.                                         |
| lote                              | Subdocumento nome/quantidade/unidadeSnapshot | Sim na proposta       | P; origem/composição/reserva Q07; quantidade Q03/T32-02.                                           |
| precoBaseCent / incrementoCent    | Inteiros                                     | Sim                   | EUR/cêntimos A/Q06; incremento >0; preço zero pendente.                                            |
| licitacaoAtual                    | Objeto valorCent/comprador/bidId             | Sim na proposta       | Valor inicial é base O; comprador/bid nulos sem oferta. Depois deve corresponder a uma bid aceite. |
| iniciaEm / terminaEm / estado     | Date / Date / enum                           | Sim na proposta       | Fim posterior ao início; estados O; semântica temporal/edição Q08.                                 |
| sequencia / versao                | Inteiros                                     | Se estratégia adotada | P/D06/D07; sequência 0 sem bids, versão não é contagem de ofertas.                                 |
| reserva / resultado / encerradoEm | Objetos / Date                               | Só conforme decisões  | Q07/Q08; resultado técnico não autoriza conversão/adjudicação comercial.                           |

**Índices/unicidade P:** estado/terminaEm, produtor/data; estado/iniciaEm se agendador aprovado. Sem TTL para fechar ou apagar leilões/bids. Não tornar produto único: o mesmo produto pode originar lotes distintos ao longo do tempo, se Q07 o permitir.

**Integridade/embedding:** lote/oferta atual pequenos e lidos juntos; bids separados. Produtor pendente não cria leilão. Mesmo user não pode licitar no próprio lote, ainda que tenha capacidade comprador. Comparação de valor mínimo depende do estado persistido na operação atómica; future CAS+bid transacional D06 não é aprovado por este desenho. Não inserir preço base em bids ou atribuir vencedor sem ofertas.

**Acesso:** resumo público para destaque; histórico/sala/identidade dos observadores Q09. Projeção privada do comprador nunca expõe dados de outro licitante; produtor acompanha o seu lote, sem poder licitar nele. Admin consulta sem ganhar poder de licitar/adjudicar.

```json
{
  "_id": { "$oid": "000000000000000000000401" },
  "produtor": { "$oid": "000000000000000000000001" },
  "produto": { "$oid": "000000000000000000000201" },
  "lote": {
    "nome": "Quatro embalagens ilustrativas",
    "quantidade": 4,
    "unidadeSnapshot": {
      "modalidade": "embalagem",
      "unidadeBase": "un",
      "conteudoPorUnidade": { "quantidade": 500, "unidade": "g" }
    }
  },
  "precoBaseCent": 1200,
  "incrementoCent": 100,
  "licitacaoAtual": {
    "valorCent": 1300,
    "comprador": { "$oid": "000000000000000000000002" },
    "bidId": { "$oid": "000000000000000000000501" }
  },
  "iniciaEm": { "$date": "2026-10-15T10:00:00Z" },
  "terminaEm": { "$date": "2026-10-15T11:00:00Z" },
  "estado": "ativo",
  "sequencia": 1
}
```

Este é um snapshot fictício às 10:10 de 2026-10-15, não um leilão atualmente operacional. A referência ao produto é só a alternativa Q07 ilustrada; não prova reserva ou alteração do stock do exemplo de produto.

## 6. bids — obrigatório O

**Finalidade:** ofertas aceites com crescimento próprio; não guardar recusas como bids. Propriedade/autor vêm da sessão futura, não do body.

| Campo candidato         | Tipo                        | Obrigatório proposto       | Valores / validação / dependência                                                           |
| ----------------------- | --------------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| leilao / comprador      | ObjectId → auctions / users | Sim                        | Leilão existente, conta compradora elegível e diferente do produtor, A/Q01.                 |
| valorCent               | Inteiro                     | Sim                        | EUR/cêntimos; >= valor atual + incremento na operação atómica O, não por validator isolado. |
| sequencia               | Inteiro >=1                 | Se D06/D07 adotado         | Ordenação e unicidade por leilão, P.                                                        |
| aceiteEm                | Date                        | Sim na proposta            | Data do servidor/base; semântica temporal Q08.                                              |
| requestId / requestHash | String                      | Só se idempotência adotada | D06; chave estável e payload consistente, não um ID de diagnóstico HTTP escolhido por C02.  |

**Índices/unicidade P:** leilao/sequencia único se adotado; leilao/comprador/requestId único se adotado; comprador/data para atividade própria. Índices não garantem que o maior valor de auctions corresponda ao histórico: precisa de operação/consistência aprovadas e ensaio real.

**Integridade/estados/acesso:** imutável para a gestão normal, sem TTL; política final de retenção Q12. Recusa não cria documento; sem oferta não existe bid artificial de base. Snapshot da quantidade fica em auction/lote, não altera o sentido de valorCent como total oferecido. Público recebe pseudónimo/projeção autorizada Q09/Q10, não email/userId privado; própria conta recebe as suas participações; admin tem leitura autorizada, sem mutação arbitrária.

```json
{
  "_id": { "$oid": "000000000000000000000501" },
  "leilao": { "$oid": "000000000000000000000401" },
  "comprador": { "$oid": "000000000000000000000002" },
  "valorCent": 1300,
  "sequencia": 1,
  "aceiteEm": { "$date": "2026-10-15T10:10:00Z" }
}
```

## 7. reviews — coleção adicional aprovada A/T32-06, política bloqueada por Q10/Q12

**Finalidade:** avaliações de produto/produtor após entrega, com denúncia/moderação. Funcionalidade académica e coleção separada aprovada T32-06; embedding nos alvos deixa de ser escolha pendente. Escala, cardinalidade, campos de denúncia/moderação e índices continuam Q10/Q12.

| Campo candidato            | Tipo                                | Obrigatório proposto                                   | Valores / validação / dependência                                                                                                           |
| -------------------------- | ----------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| autor / encomenda          | ObjectId → users / orders           | Sim                                                    | Comprador da encomenda entregue O; conta pode também ser produtora Q01.                                                                     |
| alvoTipo                   | Enum produto/produtor               | Sim                                                    | Exatamente um alvo correspondente; ambos os alvos são O.                                                                                    |
| produto ou produtor        | ObjectId → products ou users        | Um, conforme alvoTipo                                  | Produto pertence às linhas; produtor corresponde ao da encomenda. DTO usa ID de perfil para alvo produtor.                                  |
| classificacao / comentario | Inteiro / String                    | Classificação sim na proposta; texto conforme política | Escala 1–5, edição, limites e cardinalidade continuam Q10; não adotar os mocks por omissão.                                                 |
| moderacao                  | Objeto estado/autor/data/motivo     | Se política adotada                                    | Manter/ocultar e preservar evidência; enum/campos Q12.                                                                                      |
| denuncias                  | Array limitado de autor/data/motivo | Não                                                    | Proposta de embedding apenas se limites/repetições Q10 definidos. Crescimento ilimitado exigiria nova análise, não nova coleção automática. |

**Índices/unicidade P:** consultas por alvo/data/visibilidade; únicos parciais por autor/encomenda/alvo apenas se Q10 adotar essa cardinalidade. Não criar unique global por autor/produtor impedindo compras repetidas sem decisão. Unicidade parcial precisa filtrar o tipo de alvo e referência válida, não apenas campo ausente.

**Integridade/estados/acesso:** exatamente um alvo, entrega própria, referência existente e legitimada pela encomenda; não usar entrega demonstrativa como prova. Ocultação futura retira da projeção/média públicas sem editar classificação/texto pelo administrador. Público não recebe encomenda, denúncias, email ou ID privado do autor; próprio pode receber ligação à sua encomenda; admin recebe apenas dados necessários à moderação. Estados e edição dependem Q10/Q12.

```json
{
  "_id": { "$oid": "000000000000000000000601" },
  "autor": { "$oid": "000000000000000000000002" },
  "encomenda": { "$oid": "000000000000000000000301" },
  "alvoTipo": "produto",
  "produto": { "$oid": "000000000000000000000201" },
  "classificacao": 4,
  "comentario": "Comentário inteiramente fictício."
}
```

O valor 4 ilustra uma classificação, não aprova a escala 1–5. A encomenda ilustrada está entregue e contém o produto; o exemplo não prova que já exista funcionalidade real de avaliação.

## 8. Controlo de implementação e evidências futuras

Não criar notifications, candidaturas, moderação, categorias, carrinho ou saúde como novas coleções nesta proposta. Candidatura/decisão podem ficar no perfil; denúncias na review condicionadas à política; carrinho continua estado frontend; indicadores são agregações com fórmula Q15. Se uma nova necessidade surgir, voltar à aprovação.

O ambiente real da fundação já tem autoIndex false e base de teste isolada: numa implementação autorizada, definir explicitamente a criação/espera dos índices no ensaio, nunca usar syncIndexes/limpeza de desenvolvimento por conveniência. Testar required/enums/números inválidos, referências/ownership no serviço, índices únicos sob concorrência, snapshots, quantidades/preços exatos e transações aplicáveis. Não converter testes técnicos existentes em endpoints comerciais.

As tabelas são candidatas nos detalhes não aprovados; A01/A02/A03 da [análise de prontidão](phase-3.2-readiness.md) foram aprovadas e delimitam os dois schemas implementados. Ver etapas, riscos, critérios de aceitação e decisões T32 no [plano da proposta](phase-3.2-proposal.md). Os recortes acima não são inseridos. Os testes novos usam dados próprios fictícios na base isolada; só users/producers foram implementados, como documenta a entrega.

## Orders — especificação vigente após OR01–OR12

A tabela e o exemplo anteriores são a base documental preservada; as OR deixam de ser bloqueios funcionais pendentes. Estrutura final proposta e limites estão na [consolidação](phase-3.2-orders-readiness.md). Orders isolado está pronto para autorização própria, sem qualquer schema criado.

Acrescentar aos grupos candidatos: versao explícita, unidade histórica/versionada, snapshot inicial de entrega e acordo atual separado, estado/histórico de pagamento, pedidos pendente/aceite/rejeitado sem congelar preparação, reposição autorizada/reposta/pendente/não destinada a reposição, várias reclamações independentes e cronómetro de 604800000 ms efetivamente consumidos. Zero de linha após half-up é inválido; agrupar antes de validar/calcular. Todos os nomes/tipos auxiliares são concretização técnica compatível, não funcionalidades novas.

Índices propostos: comprador/data, produtor/estado/data, operação/produtor único, chave global de idempotência única parcial só na âncora, prazo de receção para job futuro. O índice chave/produtor antigo é insuficiente e não é a proposta vigente. Pedido original tem recibo imutável; alterações de estado posteriores não mudam replay.

Imutabilidade comercial não impede acontecimentos legítimos: acordos aceites, pagamentos/correções, cancelamento/reposição e intervenções são acrescentados com versão/auditoria. Alterar fuso/agenda/método/taxa em producers não reescreve condições já submetidas. Fora das projeções privadas necessárias, não serializar morada/contactos, chave/hash/manifesto ou capacidade de auditoria; projeções parciais têm guardas de leitura e gravação.
