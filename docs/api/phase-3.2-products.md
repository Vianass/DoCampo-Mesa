# Fase 3.2 — modelo products

Base local aprovada: `feat/api-foundation`, `c87f928`; main permanece `c10d031`. P01–P08 aprovadas pelo utilizador. Autorização limitada ao modelo products, tipos, constantes, validações, índices, testes e documentação, sem operações Git de escrita ou integração frontend.

## Decisões aprovadas

| ID  | Regra aprovada                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01 | Doze categorias controladas, cada uma com ID estável independente do rótulo; uma categoria principal por produto. Lista abaixo.                                                                                                                                                                                                                             |
| P02 | Preço obrigatório para publicar, EUR/cêntimos inteiros entre 1 e 1 000 000 (0,01 €–10 000 €); modalidades peso/volume/unidade/embalagem; quantidades inteiras em g/ml/unidades/número de embalagens; mínimos e incrementos positivos na mesma unidade; stock não negativo.                                                                                  |
| P03 | Débito de stock quando o comprador submete a encomenda, seguro sob concorrência; carrinho não reserva. **Decisão para encomendas futuras, sem checkout, reserva ou débito implementado agora.** Não aprova cancelamento/reposição nem toda a proposta transacional D08.                                                                                     |
| P04 | Estados rascunho/publicado/arquivado; rascunho pode ter apenas nome entre os campos editáveis. Publicação manual por produtor aprovado exige nome, descrição, categoria, preço, modalidade, stock, mínimo, incremento, pelo menos uma fotografia e ingredientes quando aplicáveis. Etiquetas/sazonalidade opcionais; aprovar produtor não publica produtos. |
| P05 | Stock máximo: peso 10 000 000 g; volume 10 000 000 ml; unidade e embalagem 100 000 unidades comerciais.                                                                                                                                                                                                                                                     |
| P06 | Até duas fotografias, principal identificável; rascunho sem fotos permitido, publicado exige uma; só referências/metadados, sem bytes ou upload.                                                                                                                                                                                                            |
| P07 | Publicado com stock zero permanece visível como esgotado; reposição pode torná-lo disponível se o produtor continuar aprovado. Rascunho/arquivo nunca se publica por reposição. Stock positivo, por si só, não prova existir quantidade comprável que satisfaça o mínimo.                                                                                   |
| P08 | Alteração de preço exige confirmação na interface futura; apenas compras futuras usam preço novo; histórico preserva valores originais; preço alterado no carrinho exige reconfirmação. **Sem interface, carrinho ou encomendas nesta etapa.**                                                                                                              |

### Esclarecimentos adicionais aprovados antes do código

Foram apresentadas duas questões funcionais bloqueantes e o utilizador respondeu explicitamente:

1. **Referência de preço:** preço fixo por 1 kg/1 L, mantendo stock/compras em g/ml; unidade e embalagem com preço por uma unidade/embalagem. Não permitir referência comercial livre de 100 g/500 ml neste bloco. O intervalo P02 aplica-se a essa referência fixa.
2. **Ingredientes:** declaração explícita do produtor sobre aplicabilidade; se forem aplicáveis, uma publicação exige lista preenchida. Não inferir aplicabilidade pela categoria, que pode misturar produtos simples e compostos.

As alternativas anteriores (referência comercial livre e matriz de aplicabilidade por categoria) não foram escolhidas. Com estes esclarecimentos não subsiste um bloqueio funcional para o schema; nenhuma recomendação residual é aprovada por extensão.

### Categorias

Os códigos técnicos abaixo concretizam IDs estáveis; não são recalculados a partir do nome e não exigem nova coleção.

| ID      | Nome aprovado           |
| ------- | ----------------------- |
| cat-001 | Hortícolas              |
| cat-002 | Fruta                   |
| cat-003 | Leguminosas e cereais   |
| cat-004 | Pão e padaria           |
| cat-005 | Laticínios e queijos    |
| cat-006 | Ovos                    |
| cat-007 | Mel e compotas          |
| cat-008 | Azeite e azeitonas      |
| cat-009 | Frutos secos e sementes |
| cat-010 | Ervas e aromáticas      |
| cat-011 | Bebidas                 |
| cat-012 | Outros produtos locais  |

## Coerência com o desenho anterior

P04 substitui expressamente a proposta anterior que exigia categoria até num rascunho: pode faltar categoria, descrição, preço, unidade, stock e fotografias. Identidade técnica, owner e timestamps não são campos editáveis do rascunho; proprietário continua referência users, com perfil em producers. Valores fornecidos têm de ter tipo/representação válidos, mesmo quando ainda não são obrigatórios.

P01 fecha a lista inicial de onze categorias sugeridas; cat-004 recebe o rótulo aprovado e cat-012 é acrescentada sem derivar IDs dos nomes. P02 resolve preço zero e limites de preços de produtos; não define preços base de leilões ou encargos de entrega. P03 resolve apenas o instante do débito de encomendas. P07 não acrescenta um quarto estado de produto. Meses opcionais continuam informativos, sem controlar disponibilidade.

T32-03 half-up aplica-se ao cálculo futuro de cada linha, não ao preço inteiro guardado. Não calcular encomendas neste schema. Grelha de quantidades compradas, agrupamento de linhas, entrega, cancelamento, reserva de leilão, política de mudança de unidade com histórico, detalhes C03 e interfaces de confirmação mantêm os momentos futuros de decisão; não fixar mínimos/passos concretos pelo produtor nem implementar checkout para os decidir.

OpenAPI continua contrato comercial proposto e bloqueado: os schemas documentais de produto foram alinhados quanto a rascunho, preço, declaração de ingredientes, fotografias e unidade; o comando de publicação e os DTOs finais privados ainda precisam de revisão antes dos endpoints. Money é reutilizado por vários recursos e não deve impor limites específicos de produto a leilões/encomendas. Nenhuma rota é disponibilizada por existir um schema.

## Implementação e evidências

### Ficheiros criados

| Ficheiro                                                                                    | Responsabilidade                                                                                    |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [product.constants.ts](../../apps/api/src/modules/products/product.constants.ts)            | Categorias, estados, modalidades, bases/referências fixas e limites.                                |
| [product.types.ts](../../apps/api/src/modules/products/product.types.ts)                    | Tipos de produto, unidade, conteúdo e fotografia; campos condicionais permitem rascunho incompleto. |
| [product.model.ts](../../apps/api/src/modules/products/product.model.ts)                    | Factory por conexão, schema, validações cruzadas e índices de products.                             |
| [product-fixtures.ts](../../apps/api/tests/support/product-fixtures.ts)                     | Dados exclusivamente fictícios, sem seeds de desenvolvimento.                                       |
| [unit/product-model.spec.ts](../../apps/api/tests/unit/product-model.spec.ts)               | 85 testes novos de representação, limites, estados e publicação.                                    |
| [integration/product-model.spec.ts](../../apps/api/tests/integration/product-model.spec.ts) | 19 testes novos com MongoDB real e compatibilidade users/producers.                                 |
| Este documento                                                                              | Aprovações, implementação, evidências e limites deste bloco.                                        |

Atualizados somente documentos complementares em docs/api: README, decisões, proposta, prontidão, modelos, mapeamento, plano, segurança, integração frontend, OpenAPI e rastreabilidade. Não foram alterados ficheiros anteriores de código, testes, configurações, dependências ou frontend.

### Campos e validações efetivas

| Campo/grupo                           | Comportamento                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidade                            | ObjectId, timestamps e produtor imutável referenciado a users; perfil procurado por producers.userId. Sem nova coleção de categorias.                                                                                                                                                                            |
| nome / estadoPublicacao               | Nome obrigatório com NFC/trim; estado inicial rascunho; enum exclusivo rascunho/publicado/arquivado.                                                                                                                                                                                                             |
| descricao / categoriaId               | Opcionais no rascunho, obrigatórios para publicar; categoria enum cat-001–cat-012.                                                                                                                                                                                                                               |
| precoCent / moeda                     | Inteiro seguro 1–1 000 000 quando fornecido, obrigatório para publicar; EUR. Referência fixa por kg/L/unidade/embalagem, não por mínimo de compra.                                                                                                                                                               |
| unidadeVenda                          | Pode faltar/estar incompleta no rascunho; publicação exige modalidade, base, referência, mínimo e incremento. Base/referência derivadas da modalidade quando omitidas e rejeitadas se incompatíveis. Mínimo/incremento inteiros seguros positivos; não exigir divisibilidade de stock ou mínimo pelo incremento. |
| conteudoPorUnidade                    | Metadado opcional na venda por unidade/embalagem: quantidade inteira positiva e unidade g/ml/un; separado da contagem de embalagens. Não representa a referência de preço.                                                                                                                                       |
| stockDisponivel                       | Inteiro seguro não negativo; teto P05 por modalidade. Rascunho sem modalidade admite no máximo o maior teto, 10 000 000, e tem de respeitar o teto específico ao definir a modalidade. Zero é válido na publicação.                                                                                              |
| ingredientesAplicaveis / ingredientes | Booleano sem conversão implícita, obrigatório para publicar; true exige lista não vazia e false exige lista vazia na publicação. Rascunho pode estar incompleto; textos fornecidos têm de ser válidos.                                                                                                           |
| imagens                               | Lista até duas referências HTTP(S) sem credenciais, alt opcional e principal booleano; até uma principal; publicação exige pelo menos uma. Sem seleção automática de principal, bytes ou upload.                                                                                                                 |
| etiquetas / epocaMeses                | Etiquetas opcionais como lista de textos NFC/trim, sem limites comerciais de contagem/tamanho não aprovados. Meses opcionais inteiros 1–12 sem repetições; ausência ou lista vazia não restringem venda.                                                                                                         |
| modoProducao                          | Texto opcional, sem inferir certificação nem exigir para publicação.                                                                                                                                                                                                                                             |

Number representa somente inteiros seguros; preços/stock têm ainda os limites aprovados. Quantidades fora de Number.MAX_SAFE_INTEGER, strings numéricas, booleanos, frações, NaN/Infinity e campos desconhecidos são rejeitados. Nenhuma aritmética monetária de encomenda foi implementada.

A publicação valida a existência da conta com capacidade produtor e do perfil aprovado da mesma identidade, na conexão/sessão do documento. Guardar um produto já publicado também revalida essa elegibilidade. A consulta de contas/perfis não é autenticação, autorização do autor de uma operação HTTP nem garantia de aprovação permanente: não bloqueia alterações concorrentes ao perfil. Serviços/consultas futuros terão de verificar a aprovação atual e a identidade autenticada. Rascunho não garante existência de referência por foreign key.

Não há publicação por alteração de aprovação/stock. Disponibilidade/esgotado são derivados futuros, sem campo persistido extra. Mantêm-se o helper partilhado e o padrão de gravação por documento completo; updates por query/bulk e gravações sem validação são rejeitados. Uma projeção pode ser lida/serializada, mas não guardada sem os campos que sustentam as invariantes de publicação. Acesso direto à coleção/driver não é protegido por esses hooks e não deve ser usado por serviços comerciais.

### Índices e transações

Índices não únicos explícitos: `{ produtor: 1, estadoPublicacao: 1 }` e `{ estadoPublicacao: 1, categoriaId: 1 }`, além de `_id` intrínseco. Nomes repetidos são permitidos; não se anteciparam índices de texto/preço, reservas ou unicidade comercial. autoCreate/autoIndex permanecem desativados; coleção/índices só são criados explicitamente na base efémera de testes, não no arranque da API.

O teste de transação verifica apenas rollback técnico de inserção de products e propagação da sessão às consultas de elegibilidade. Não implementa checkout, desconto de stock, reservas ou snapshots. Foi resolvida incompatibilidade do Mongoose instalado ao restaurar transações com subdocumentos strict:throw: estes schemas locais usam versionKey:false; o produto mantém a versão nativa __v. Esta correção técnica está limitada aos novos subdocumentos de products e coberta pelo rollback com unidade, conteúdo e fotografias.

### Resultados de validação

| Verificação            | Resultado                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Suite backend completa | **228 testes aprovados em oito ficheiros**, incluindo os 124 anteriores sem alterar os respetivos ficheiros.                                    |
| Unitários              | **166 aprovados**: 81 anteriores + 85 de products.                                                                                              |
| HTTP                   | **22 anteriores aprovados**; único endpoint implementado continua GET /api/health.                                                              |
| MongoDB real           | **40 aprovados**: 21 anteriores + 19 de products, em replica set de teste e bases aleatórias removidas pelos testes; sem persistência simulada. |
| TypeScript             | API e frontend aprovados.                                                                                                                       |
| Qualidade/build        | ESLint monorepo, Prettier e build API aprovados, sem novas dependências.                                                                        |
| Contrato e documentos  | OpenAPI estruturalmente válido, referências e ligações locais verificadas; detalhes finais em traceability.md.                                  |
| Frontend               | Código e testes preservados; Playwright não repetido, conforme o âmbito autorizado.                                                             |

Os testes cobrem rascunhos incompletos, obrigatoriedade na publicação, doze categorias, limites de preço/stock, quatro modalidades, conteúdo da embalagem, mínimos/incrementos, declaração de ingredientes, fotografias, meses, aprovação/papéis, proprietário, integridade, projeções, restrições de gravação e rollback. Aprovação não publica, stock zero não arquiva e reposição não publica rascunhos/arquivados. Existem ensaios de edição do preço atual; não se apresentam cópias em memória como snapshots de encomendas implementados.

### Limitações e próxima revisão

Os nove originais da Fase 0, users/producers, frontend e dependências são preservados. C04 mantém todas as operações privadas inacessíveis até segurança real. O modelo não foi ligado ao runtime: sem endpoints comerciais, autenticação, autorização HTTP, integração frontend, upload ou outros modelos.

Ficam para autorização futura: DTOs finais/comando de publicação, atribuição do proprietário pelo serviço autenticado, filtros públicos por aprovação atual, política concorrente entre aprovação e escrita, limites residuais de texto/consulta, mudança de modalidade com histórico, checkout/grelha de quantidades, half-up por linha, stock concorrente, cancelamento, leilões e preservação/reconfirmação de preços em encomendas. As pendências Q/C não são aprovadas por extensão.

Tudo fica local em feat/api-foundation, com HEAD c87f928 e os dois commits anteriores preservados. Sem staging, commit, push, branch, merge ou PR nesta tarefa. Main permanece c10d031. A próxima operação exige autorização explícita após revisão.
