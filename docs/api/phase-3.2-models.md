# Fase 3.2 — users/producers implementados; modelos seguintes propostos

Ler em conjunto com a [proposta principal](phase-3.2-proposal.md), que define autoridade, alternativas de quantidade, categorias, permissões e plano. Consolidação: 2026-10-17; preparação: 2026-10-16; base `68f41ec`. A preparação era documental; users/producers foram posteriormente implementados/testados. Ver [entrega do primeiro bloco](phase-3.2-identity-implementation.md). Outros cinco modelos não implementados. Q01/Q03/Q04/Q06/Q14 estão aprovadas no âmbito funcional; T32-01–T32-06 estão aprovadas no âmbito do registo; detalhes residuais e restantes Q continuam pendentes. Ver [prontidão, bloqueios A01–A03 e primeiro bloco](phase-3.2-readiness.md).

## Convenções e leitura dos exemplos

O = requisito académico; A = decisão funcional ou técnica aprovada; P = concretização técnica proposta; B = dependência pendente. «Obrigatório» abaixo refere-se ao schema candidato, sujeito à aprovação técnica, não a uma obrigação académica adicional. Tipos Mongoose/BSON são opções futuras. Referências são lógicas, sem foreign keys automáticas.

Proposta comum P: `_id: ObjectId` obrigatório, `createdAt` e `updatedAt: Date` UTC geridas pelo servidor; versão inteira não negativa quando necessária. DTO usa ID estável em string e datas ISO, nunca exporta documento Mongoose. Contas e perfis têm IDs distintos. Não permitir atribuição pelo cliente de proprietários, autores de decisão, timestamps, totais, permissões ou resultados. Validar tipos e representações antes dos casts permissivos do Mongoose; não aceitar booleanos, strings malformadas, NaN/Infinity ou perda de resolução só porque o driver consegue convertê-los. A política de conversão explícita faz parte de T32.

Os blocos JSON são **recortes documentais ilustrativos**, não fixtures/seeds/documentos prontos a inserir: omitem timestamps comuns e alguns campos condicionais; hash é placeholder explícito, nunca credencial real. Quantidades dos exemplos usam a representação B aprovada; nomes dos subcampos, limites e referência de preço ainda são concretizações propostas. IDs são sintaticamente plausíveis e fictícios: user vendedor/comprador `...001`, comprador `...002`, administrador `...003`, perfil `...101`, produto `...201`, encomenda `...301`, leilão `...401`, bid `...501`, review `...601`. Identidades referenciadas seriam fornecidas num conjunto de teste autorizado; não existem na base por esta documentação.

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

## 3. products — obrigatório O

**Finalidade:** catálogo, rascunho próprio, modalidade de venda, preço por referência e stock. Campo/código concretos abaixo são P, com suporte funcional A/Q03/Q04/Q06/Q14.

| Campo candidato          | Tipo                                   | Obrigatório proposto                                      | Valores / validação / dependência                                                                     |
| ------------------------ | -------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| produtor                 | ObjectId → users                       | Sim                                                       | Atribuído à identidade proprietária; resolver perfil por userId, nunca usar ID de perfil como userId. |
| nome / descricao         | String                                 | Nome sim; descrição não                                   | Comprimentos P; mínimo de rascunho T32-05.                                                            |
| estadoPublicacao         | String enum                            | Sim                                                       | A/T32-05: rascunho/publicado/arquivado, inicial rascunho; sem quarto estado esgotado.                 |
| categoriaId              | String de lista controlada             | Sim, incluindo rascunho                                   | A/T32-04; lista/IDs ainda pendentes.                                                                  |
| etiquetas / ingredientes | Arrays embebidos de rotulo/normalizado | Etiquetas podem ser vazias; ingredientes quando aplicável | A/Q14; limites e estrutura P/T32-04; deduplicação normalizada.                                        |
| sazonalidade             | Array de meses inteiros                | Não; informação opcional                                  | A/T32-04: meses opcionais, sem controlar disponibilidade; ausência/vazio residuais.                   |
| modoProducao             | String controlada                      | Para publicação, proposta                                 | Filtro académico inclui biológico; enum/certificação não definidos por etiquetas, Q14 residual.       |
| precoCent / moeda        | Inteiro / String                       | Para publicação                                           | A/Q06: EUR/cêntimos; Number seguro ou BSON long P; zero pendente, sem default de gratuitidade.        |
| unidadeVenda             | Objeto embebido                        | Para publicação                                           | A/T32-02: g/ml/unidades/embalagens inteiras; referência/conteúdo/mínimo/passo concretos pendentes.    |
| stockDisponivel          | Inteiro não negativo                   | Para publicação                                           | Unidade/escala do produto; não aceitar NaN/Infinity/fração incompatível/overflow.                     |
| stockReservadoLeilao     | Quantidade                             | Só após Q07                                               | Não criar reserva nem decrementar só por carrinho.                                                    |
| limiarStockBaixo         | Quantidade                             | Só após Q15                                               | Mesma dimensão/escala; não usar três automaticamente.                                                 |
| imagens                  | Array de metadados                     | Conforme regra futura                                     | Pequeno e limitado; sem bytes, credenciais ou URLs de escrita no DTO.                                 |
| versao                   | Inteiro não negativo                   | Se política adotada                                       | P/D07/C02; impedir edição antiga de repor stock; política concreta pendente.                          |

**Embedding/referências:** unidade/conteúdo/etiquetas/imagens pequenas embebidas; owner users referenciado; snapshots residem nas orders/auctions, não são recalculados deste documento.

**Índices P:** `{produtor:1, estadoPublicacao:1}`; `{estadoPublicacao:1, categoriaId:1, precoCent:1}` se útil ao filtro por preço da referência acordada. Índices separados de etiquetas.normalizado, ingredientes.normalizado e meses se adotados; não compor dois arrays paralelos. Nome não é único; etiqueta não é identidade global. Unicidade de slug só se política C01 aprovada.

**Integridade/estados/acesso:** pendente pode criar/editar rascunhos próprios; publicar exige perfil aprovado no momento e dados completos. O serviço valida existência do owner/perfil. Perfil aprovado com produto rascunho não é público. Aprovar perfil não publica; reduzir stock/alterar unidade não pode ignorar concorrência/reservas futuras. Rascunhos públicos, autoatribuição de owner/aprovação e publicação por atualização implícita são recusados. Compradores só veem produtos publicados de produtores aprovados; publicado com stock zero pode continuar visível como esgotado, mas não pode ser comprado. Arquivado não se vende e preserva histórico; recomenda-se excluí-lo do catálogo ativo. Visibilidade do detalhe arquivado ainda Q12, sem nova regra por inferência. Sazonalidade é informativa, sem controlo automático de stock/visibilidade. Restauro e DELETE físico não são concedidos. Rejeitado não recebe permissões adicionais por este desenho.

```json
{
  "_id": { "$oid": "000000000000000000000201" },
  "produtor": { "$oid": "000000000000000000000001" },
  "nome": "Morangos de exemplo",
  "estadoPublicacao": "publicado",
  "categoriaId": "cat-002",
  "etiquetas": [{ "rotulo": "Colheita local", "normalizado": "colheita local" }],
  "precoCent": 350,
  "moeda": "EUR",
  "unidadeVenda": {
    "modalidade": "embalagem",
    "unidadeBase": "un",
    "quantidadeReferencia": 1,
    "quantidadeMinima": 1,
    "incrementoCompra": 1,
    "rotulo": "Embalagem de 500 g",
    "conteudoPorUnidade": { "quantidade": 500, "unidade": "g" }
  },
  "stockDisponivel": 20
}
```

O exemplo supõe publicação explícita posterior à aprovação e não é documento completo de publicação. A categoria cat-002 e os campos/limites da unidade são ilustrativos; estados e inteiros em unidades mínimas estão aprovados.

## 4. orders — obrigatório O

**Finalidade:** encomenda com comprador/produtor referenciados e linhas embebidas, como E p. 18. Uma encomenda por produtor continua proposta Q02; não fechar esquema de agrupamento sem essa decisão.

| Campo candidato                                               | Tipo                                  | Obrigatório proposto   | Valores / validação / dependência                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| comprador / produtor                                          | ObjectId → users                      | Sim                    | O para referências; dono vem da sessão, produtor é owner dos produtos segundo Q02. Conta pode acumular relações Q01.                  |
| linhas                                                        | Array de subdocumentos                | Sim, não vazio         | O para embedding; limites P.                                                                                                          |
| linhas[].produto / nome                                       | ObjectId → products / String snapshot | Sim                    | Referência válida e nome do momento da compra; não usar nome atual para histórico.                                                    |
| linhas[].quantidade / unidadeSnapshot                         | Inteiro / objeto snapshot             | Sim                    | A/T32-02: inteiro na unidade mínima do produto; mesma dimensão/escala; snapshot aprovado T32-06.                                      |
| linhas[].precoUnitCent / unidadeSnapshot.quantidadeReferencia | Inteiro / quantidade                  | Sim na proposta        | A: preço em cêntimos; guardar a referência necessária a calcular peso/volume, sem fingir preço por 1 g/ml.                            |
| linhas[].subtotalCent                                         | Inteiro                               | Sim                    | A/T32-03: cálculo exato no servidor, half-up por linha; agrupamento continua pendente.                                                |
| subtotalCent / totalCent / moeda                              | Inteiros / EUR                        | Sim                    | Soma coerente; encargos não são zero por omissão sem decisão. Pagamento direto não é pagamento confirmado.                            |
| estado / historicoEstado                                      | Enum / array de estado, data, autor   | Sim na proposta        | O: pendente/confirmada/pronta/entregue; transições, débito/reposição Q05.                                                             |
| entrega                                                       | Objeto embebido                       | Bloqueado nos detalhes | Levantamento/entrega previstos academicamente, modalidades/custos/campos finais Q06 residual. Não impor morada ou tarifa sem decisão. |
| checkoutId / requestHash                                      | String                                | Só se adotado          | Q02/D08; chave não vem a ser obrigação por existir no rascunho.                                                                       |
| origemLeilao / versao                                         | ObjectId → auctions / inteiro         | Condicional            | Q07/D07; não converter lote automaticamente.                                                                                          |

**Índices/unicidade P:** comprador/data; produtor/estado/data. Único composto comprador/checkoutId/produtor só se Q02/D08 adotados. Origem de leilão única parcial apenas se conversão Q07 aprovada; não criar índice único de campo opcional que proíba vários documentos sem valor.

**Correspondência com o DTO:** a referência de preço da linha fica em `unidadeSnapshot.quantidadeReferencia`, também em SaleUnit no OpenAPI; não exige uma segunda cópia divergente na linha. Os recortes documentais podem omitir outros campos, não são DTOs completos.

**Integridade/embedding:** todos os produtos pertencem ao produtor atribuído se a opção de order única por produtor for aprovada; cada linha contém quantidade/preço/unidade coerentes e totais do servidor. Alterar produto não altera snapshots. Linhas, entrega/histórico limitado são embebidos; identidades partilhadas referenciadas. Transação de stock/encomendas fica dependente de Q05/D08, não executada em 3.2 preparatória.

**Acesso:** comprador próprio e produtor interveniente recebem dados necessários; admin consulta projeção mínima pela rota própria. Moradas privadas não são públicas nem se copiam para métricas. Não criar operações de pagamento, cancelamento ou alteração administrativa de encomendas.

```json
{
  "_id": { "$oid": "000000000000000000000301" },
  "comprador": { "$oid": "000000000000000000000002" },
  "produtor": { "$oid": "000000000000000000000001" },
  "linhas": [
    {
      "produto": { "$oid": "000000000000000000000201" },
      "nome": "Morangos de exemplo",
      "quantidade": 2,
      "precoUnitCent": 350,
      "unidadeSnapshot": {
        "modalidade": "embalagem",
        "unidadeBase": "un",
        "quantidadeReferencia": 1,
        "conteudoPorUnidade": { "quantidade": 500, "unidade": "g" }
      },
      "subtotalCent": 700
    }
  ],
  "subtotalCent": 700,
  "totalCent": 700,
  "moeda": "EUR",
  "estado": "entregue",
  "historicoEstado": [
    {
      "estado": "entregue",
      "data": { "$date": "2026-10-12T12:00:00Z" },
      "autor": { "$oid": "000000000000000000000001" }
    }
  ]
}
```

O recorte não escolhe entrega/taxas nem transições intermédias; o total representa apenas as linhas ilustrativas, sem política implícita de encargos. O histórico completo e entrega requerem as decisões correspondentes antes de qualquer documento real.

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
