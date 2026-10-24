# Etapa 4B.1 — contrato, validação e canonicalização do checkout

Implementação local de **24 de outubro de 2026**, em `feat/api-foundation`, HEAD `a43a715a7cd974e3c60bab0a611cf6d977477213`; `main` permanece `c10d031`. A autorização abrange exclusivamente a camada pura. Não existe checkout funcional, replay, âncora operacional, criação de encomendas, débito de stock, endpoint ou mecanismo de autenticação neste bloco.

O documento não rastreado da [Etapa 4A](phase-3.2-checkout-readiness.md) é preservado integralmente. As orientações D4A-01–D4A-09 foram aprovadas para guiar esta implementação; as extensões de persistência, segurança, levantamento e coordenação transacional continuam dependentes da sua autorização específica. O01–O16 e OR01–OR12 não são alteradas.

## Ficheiros e compatibilidade

Criados apenas:

- [checkout.contract.ts](../../apps/api/src/modules/orders/checkout.contract.ts): tipos de entrada/resultado, erros e orçamentos técnicos.
- [checkout.validation.ts](../../apps/api/src/modules/orders/checkout.validation.ts): validação estrita, cópias normalizadas/congeladas e agregação pelos helpers existentes.
- [checkout.canonicalization.ts](../../apps/api/src/modules/orders/checkout.canonicalization.ts): representação JSON v1 determinística e minimização dos dados de entrega.
- [checkout.fingerprint.ts](../../apps/api/src/modules/orders/checkout.fingerprint.ts): SHA-256 da representação canónica.
- [checkout-contract.spec.ts](../../apps/api/tests/unit/checkout-contract.spec.ts): testes unitários sem MongoDB.
- Este relatório.

Nenhum ficheiro preexistente é alterado. Models, repositórios de concorrência, `order.calculations.ts`, fixtures/testes anteriores, frontend, configurações, dependências, documentos históricos e os nove originais da Fase 0 são preservados. Os novos módulos não são registados no runtime HTTP e não exportam serviços de persistência.

Fontes funcionais: [decisões O/OR](decisions.md), [mapeamento](data-mapping.md), [consolidação orders](phase-3.2-orders-readiness.md), [persistência](phase-3.2-orders-persistence.md), [configuração comercial](phase-3.2-producers-commercial.md), [concorrência](phase-3.2-concurrency.md), [plano](implementation-plan.md), [segurança](security.md), [integração frontend](frontend-integration.md) e [contrato HTTP ainda proposto](openapi.yaml). Os documentos da Fase 0 foram consultados e mantidos intactos; as recomendações históricas não prevalecem sobre aprovações posteriores.

## API pura e fronteira de confiança

As três funções recebem argumentos separados e validam dados desconhecidos em runtime:

```ts
validateCheckoutInput(contexto, chaveIdempotencia, pedido, limitesOpcionais);
canonicalizeCheckout(contexto, chaveIdempotencia, pedido, limitesOpcionais);
fingerprintCheckout(contexto, chaveIdempotencia, pedido, limitesOpcionais);
```

`validateCheckoutInput` devolve `ValidatedCheckoutInput`: contexto normalizado, chave exata e pedido agregado/normalizado, em cópias profundamente congeladas. Não altera nem congela argumentos do chamador. A representação normalizada é **interna** e conserva morada/contacto quando necessários; não é um DTO público ou objeto seguro para logging indiscriminado.

`canonicalizeCheckout` devolve uma string JSON sem espaços. `fingerprintCheckout` volta a usar a validação/canonicalização e devolve apenas 64 caracteres hexadecimais. Não há entrada alternativa que permita fornecer um suposto JSON canónico sem validar o pedido. Os limites são dependência do chamador interno, não um campo livre do cliente.

A separação do contexto evita tratar `buyerId` do pedido como identidade autoritativa, mas esta função **não autentica** um contexto nem concede permissões. O futuro chamador tem de obter a conta de um mecanismo confiável; fixtures são válidas apenas para os testes isolados. Não existem campos de papel/JWT ou sessão demonstrativa no contrato.

## Contrato de entrada implementado

| Elemento               | Campos e significado                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contexto separado      | `compradorContaId`, string ObjectId hexadecimal de 24 caracteres; normalizada para minúsculas.                                                         |
| Chave separada         | String opaca de 1–128 caracteres ASCII visíveis, sem espaços; não é normalizada, truncada ou prefixada. Não é incluída na string canónica/fingerprint. |
| `pedido.linhas[]`      | `produtoId`, `produtorContaId`, `quantidade` e `ofertaAceite`.                                                                                         |
| `ofertaAceite`         | `precoReferenciaCent`, `unidadeVenda` completa do tipo existente `OrderSaleUnit`, e `revisaoProdutoObservada`.                                         |
| Condições por produtor | `produtorContaId`, `modalidade`, `periodo`, `metodoPagamento`, `taxaEntregaAceiteCent`, `revisaoProdutorObservada`.                                    |
| Entrega                | Exige também `concelhoId`, `morada` e `contacto`.                                                                                                      |
| Levantamento           | Exige taxa aceite zero e rejeita campos de entrega; não recebe um local de levantamento inventado pelo cliente.                                        |
| Período normalizado    | `inicioEm`, `fimEm` como ISO UTC com milissegundos e `fusoHorario` IANA explícito.                                                                     |

Para verificar a coerência produto/condições **sem acesso a dados**, este bloco acrescenta a associação declarada `produtorContaId` em cada linha ao exemplo inicial de 4A. É o metadado mínimo para exigir uma seleção por produtor, recusar seleções extra/em falta e recusar o mesmo produto associado a dois produtores. Essa associação é incluída na representação canónica.

Não se afirma que o produto pertence realmente à conta indicada. A futura leitura do produto tem de confirmar o owner e a resolução conta/perfil, como previsto em 4A. Um `ProducerProfile._id` pode ter a mesma forma lexical de um ID de conta; só uma consulta autoritativa pode distinguir a sua identidade real. Não se valida a existência de compradores, produtos, perfis ou concelhos oficiais neste bloco.

Não são aceites comprador editável, totais/estados, referência global, stock declarado, autenticação, dados bancários ou campos arbitrários. Datas `Date` válidas também são aceites como entrada interna e copiadas para strings; não permanecem objetos mutáveis no resultado normalizado.

## Validações, normalização e agregação

São aceites apenas objetos simples, com propriedades de dados próprias/enumeráveis e campos conhecidos. Rejeitam-se campos extra em todas as estruturas, símbolos, acessores, listas esparsas ou com propriedades adicionais, objetos inesperados, campos obrigatórios ausentes e valores `null`/`undefined` incompatíveis. Não se invocam getters ou `toJSON` enviados como campos. Esta é uma validação de dados internos/JSON, não um sandbox para executar proxies ou código JavaScript hostil.

IDs de conta/produto usam hexadecimal canónico; os IDs de concelho são opacos, com o limite existente de 128 pontos de código e sem espaços/controlos. Não são derivados de nomes nem convertidos para minúsculas. Textos autorizados seguem NFC/trim, com limites técnicos e rejeição de caracteres de controlo/surrogates isolados. A chave mantém-se exata. Campos opcionais de unidade omitidos não são equiparados a `null` ou `undefined` explicitamente fornecidos.

Reutilizam-se de [order.calculations.ts](../../apps/api/src/modules/orders/order.calculations.ts): `validateOrderQuantity`, `validateOrderPrice`, `validateOrderMoney`, `validateOrderSaleUnit`, `aggregateOrderLines`, `calculateOrderAmounts` e `calculateOrderProductsSubtotal`. Não se copiam os tetos comerciais nem se introduz outro algoritmo de arredondamento.

Cada fragmento tem quantidade inteira positiva, preço/unidade válidos e revisão segura. O helper existente agrega primeiro pelo ID e só depois verifica mínimo, incremento e teto da modalidade. Fragmentos contraditórios em preço, unidade ou revisão são recusados; nenhum valor é escolhido arbitrariamente. A ordenação usa comparação de strings por código, sem `localeCompare`.

Os cálculos existentes são utilizados apenas para verificar a coerência aritmética dos valores aceites: half-up depois de agregar, subtotal mínimo de um cêntimo, taxa única por produtor e total global dentro da representação segura. Esses valores intermédios são descartados; não se cria um recibo ou uma cotação autoritativa. A confirmação comercial contra preços atuais continua futura. Exemplo: 250 + 250 g a 150 cêntimos/kg dão uma linha de 500 g/75 cêntimos, não duas linhas de 38. Fragmentos individualmente abaixo do mínimo podem formar uma linha final válida.

Não se recebe stock nem se executa cálculo de reserva, reconciliação ou débito. Uma quantidade aceite pode continuar indisponível na base de dados. Configuração, aprovação, cobertura e agenda reais não são verificáveis por esta camada.

## Representação canónica v1

Identificador fixo: `docampo.checkout.v1`. A string JSON inclui, em ordem de propriedades explícita:

1. Versão e comprador normalizado.
2. Linhas agregadas e ordenadas por produto: produto, produtor declarado, quantidade, preço, revisão e todos os campos autorizados da unidade comercial.
3. Condições ordenadas por produtor: ID, modalidade, período UTC/fuso, pagamento, taxa, revisão e, para entrega, concelho e digest dos dados privados necessários.

Não inclui chave idempotente, stock mostrado, totais do cliente, JWT, referência de compra, IDs de orders/eventos, timestamps atuais ou metadados arbitrários. Revisões observadas **participam** da representação/fingerprint, seguindo a orientação conservadora D4A-03. Não são apresentadas como versões exclusivas de preço/unidade/configuração; a existência e atualidade dos tokens não são verificadas aqui. O maior inteiro seguro é um token estruturalmente válido, mas uma escrita futura pode rejeitá-lo por não poder incrementar; os repositórios mantêm essa proteção.

Objetos e listas reordenados produzem o mesmo resultado. Fragmentação equivalente também, desde que o pedido respeite os limites técnicos de entrada. Alterações de comprador, produto, associação, quantidade, preço, unidade/conteúdo, revisão, modalidade, método, taxa, concelho, instante/fuso ou dados de entrega mudam a representação. A dimensão bruta pode fazer um pedido excessivamente fragmentado ser recusado mesmo que o seu agregado fosse pequeno.

### Privacidade dos dados de entrega

A morada e o contacto necessários não são colocados em claro na string canónica. Após normalização, calcula-se `dadosEntregaHash` como SHA-256 dos bytes UTF-8 de `docampo.checkout.entrega.v1`, seguidos de um byte zero e do JSON do par `[morada, contacto]`. O separador/domínio e o array evitam concatenações ambíguas. Alterar qualquer um dos textos altera esse digest e o fingerprint final.

Isto preserva a distinção entre pedidos para destinos/contactos diferentes com menor exposição na representação intermediária. Não é cifragem nem anonimização: dados de baixa entropia continuam suscetíveis a tentativa por dicionário. Comprador e referências necessárias continuam presentes. Canonicalização, digests e pedido normalizado são internos e não devem ser enviados a logs públicos.

Esta minimização concretiza a orientação de 4A de incluir os dados necessários à igualdade do pedido sem divulgar dados privados desnecessariamente. Não altera o documento histórico nem os schemas persistidos; a futura idempotência deve conservar esta representação v1 ao comparar pedidos.

### Fingerprint

Algoritmo: SHA-256 da string canónica completa em UTF-8, usando `node:crypto`. Resultado hexadecimal de 64 caracteres. A mesma compra semântica com uma chave opaca diferente tem o mesmo fingerprint; chave e igualdade do pedido são responsabilidades distintas. Uma identidade compradora diferente muda o fingerprint.

O teste de vetor fixo para o pedido mínimo guarda o seguinte resultado, calculado também de forma independente com `hashlib`:

```text
e93b7f38b0aaebc5af4ec93839902729d7a224036aa35f7dd7ef457fae76f942
```

Não há persistência, índice, seleção de âncora, procura de pedido anterior, replay ou geração de chave/UUID. O hash não autentica o comprador nem prova que a oferta continua disponível.

## Resultado futuro e erros

`CheckoutResult` é apenas um tipo discriminado para sucesso (`nova | replay`, com recibo), reconfirmação, recusa ou resultado indeterminado. `CheckoutReceipt` descreve referência global, data inicial, IDs das orders/contas produtoras, estado inicial `pendente`, totais e EUR. Nenhuma função deste bloco cria esses resultados ou gera os identificadores. Os tipos comerciais reutilizam `OrderSaleUnit`, `OrderPaymentMethod`, `OrderReceptionModality`, `OrderState` e a moeda existentes.

Erros efetivamente usados pela validação pura:

| Código                           | Situação                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `PEDIDO_INVALIDO`                | Estrutura/campo/tipo/identificador/chave/revisão/data incompatíveis.                                    |
| `QUANTIDADE_INVALIDA`            | Quantidade ou agregado que não respeita as regras existentes.                                           |
| `OFERTA_INCOERENTE`              | Preço/unidade, fragmentos incompatíveis, subtotal zero ou overflow monetário.                           |
| `CONDICOES_PRODUTOR_INCOERENTES` | Associação contraditória ou conjunto de condições não corresponde exatamente aos produtores declarados. |
| `SELECAO_COMERCIAL_INVALIDA`     | Modalidade/método, entrega/levantamento, concelho ou seleção temporal estruturalmente inválidos.        |
| `LIMITE_TECNICO_EXCEDIDO`        | Orçamento de cardinalidade, texto ou bytes excedido.                                                    |

`RECONFIRMACAO_NECESSARIA`, `CONFLITO_REVISAO` e `CONFLITO_IDEMPOTENCIA` existem somente nos tipos futuros: não é possível detetar tais conflitos reais sem estado autoritativo. Erros contêm código, mensagem estática e caminho de campo conhecido; nunca os valores recebidos, chave, morada/contacto, dados bancários ou causa privada.

Só `OrderValidationError` das regras comerciais é traduzido em erro do contrato. Falhas internas inesperadas continuam a propagar-se, sem serem disfarçadas como erro do utilizador. Não existem códigos/status HTTP ou respostas de rede nestes módulos.

## Datas e fusos horários

Strings devem representar UTC explicitamente com `Z`, segundos e fração opcional de 1–3 dígitos. `Date` interno tem de ser válido e simples. Normalização produz ISO UTC com três dígitos, em anos de quatro algarismos. Verifica-se o calendário por comparação após parsing, recusando por exemplo 30 de fevereiro, `24:00` e leap seconds que seriam normalizados silenciosamente. O fim tem de ser posterior ao início.

O fuso exige um identificador IANA reconhecido pelo `Intl` existente. A validação usa locale explícito apenas para conferir suporte; a representação não usa formatação local. Zonas são preservadas exatamente, sem resolver aliases ou mudar letras, porque a guarda comercial atual também exige igualdade com o identificador da agenda. Não se assume uma zona única para todos os produtores.

Horas locais sem offset e strings com offset numérico não são entradas deste contrato UTC. O chamador futuro deve obter o instante explicitamente escolhido antes de o invocar; esta camada não escolhe uma ocorrência numa hora repetida nem desloca uma hora inexistente. Duas ocorrências de `01:30` em Lisboa, representadas por `00:30Z` e `01:30Z` em 25-10-2026, mantêm fingerprints diferentes.

Não se verifica disponibilidade semanal, futuro/passado, feriados, capacidade, duração mínima ou coincidência entre zona e agenda; essas decisões/dados pertencem ao serviço e à guarda existentes. Não se usa hora atual nem conversão dependente da zona/locale do sistema. A lista de identificadores reconhecidos depende do ICU do runtime, que deve manter compatibilidade na futura implantação/replay; nenhuma biblioteca temporal é instalada.

## Orçamentos técnicos locais

Valores por omissão, configuráveis por `Partial<CheckoutTechnicalLimits>` fornecido pelo chamador interno:

| Limite                              | Valor por omissão     | Justificação                                                                                                                                      |
| ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fragmentos antes de agregar         | 1000                  | Evitar uma lista ilimitada de duplicados que contorne o limite de produtos.                                                                       |
| Produtos distintos normalizados     | 100                   | Orientação conservadora de 4A, aplicada apenas a este contrato, não ao modelo/calculador existente.                                               |
| Seleções de produtores              | 10                    | Orientação conservadora de 4A, sem dividir automaticamente a compra.                                                                              |
| Texto por campo livre permitido     | 4096 pontos de código | Defesa de memória/processamento para rótulo, morada e contacto; não altera os campos persistidos anteriores.                                      |
| Pedido normalizado antes de agregar | 100 KiB UTF-8         | Orçamento interno alinhado com a dimensão já configurada na fundação HTTP; inclui contexto/chave e dados de entrega, sem depender do parser HTTP. |
| Representação canónica              | 100 KiB UTF-8         | Limitar o trabalho de representação/hashing, mesmo quando o formato tem overhead diferente da entrada.                                            |

Mantêm-se separadamente os limites já existentes de chave (128 ASCII), concelho (128 pontos de código), fuso (100 caracteres), preços, quantidades e inteiros monetários. Opções desconhecidas, zero, valores negativos/não inteiros/não seguros são recusados. Alterar um orçamento interno não altera o formato v1 para um pedido que continue válido nem modifica configurações globais.

Estes defaults são parâmetros técnicos documentados desta camada, não novas regras comerciais aprovadas para toda a plataforma. O teste com 101 produtos confirma que o chamador pode elevar o orçamento sem mudar products/orders ou os cálculos existentes. Não se aprovam implicitamente os antigos tetos BSON de 1/6/8 MiB, um limite de reclamações ou uma política de estoque/entrega. O futuro serviço deverá aprovar/calibrar a política operacional da sua implantação.

## Testes e validações

Os **130 novos testes unitários** cobrem os 30 grupos solicitados: um/vários produtores, listas vazias, agregação, valores/IDs/chaves/unidades inválidos, seleções e revisões, campos extra, equivalência por reordenação/fragmentação, diferenças relevantes, determinismo, cópias imutáveis, tipos existentes, excesso de entrada, privacidade, extremos monetários e formato versionado. Incluem vetor fixo, embalagem/conteúdo/volume, calendário estrito, Date/ISO equivalentes, ocorrências DST e propagação de falhas internas.

Os testes novos não ligam a MongoDB nem fazem pedidos HTTP. A suite completa reexecuta os testes anteriores de integração/HTTP, com MongoDB real efémero, para verificar regressão; isso não significa implementação de testes comerciais novos de persistência neste bloco.

| Verificação                            | Resultado                                                        |
| -------------------------------------- | ---------------------------------------------------------------- |
| Novos unitários do contrato            | 130 aprovados.                                                   |
| Unitários backend totais               | 665 aprovados: 535 anteriores + 130 novos.                       |
| HTTP existentes                        | 22 aprovados.                                                    |
| Integração MongoDB existente           | 126 aprovados.                                                   |
| Suite backend completa                 | **813 aprovados**, incluindo os 683 anteriores, em 16 ficheiros. |
| TypeScript API, ESLint API e build API | Aprovados.                                                       |
| Prettier API                           | Aprovado com `--ignore-path ../../.prettierignore`.              |

Comandos executados: teste unitário dirigido, `npm test --workspace @docampo/api`, `npm run typecheck --workspace @docampo/api`, `npm run lint --workspace @docampo/api`, `npm run format:check --workspace @docampo/api -- --ignore-path ../../.prettierignore` e `npm run build --workspace @docampo/api`. O build gera apenas artefactos ignorados; não entram no conjunto de ficheiros do projeto.

No fecho verificam-se também Markdown/Prettier deste relatório, links internos, `git diff --check`, hashes dos 294 ficheiros preexistentes (incluindo 4A), os nove F0 perante `main`, ausência de segredos e estado Git. Não se reexecuta Playwright nem se altera o frontend nesta camada backend pura.

## Limitações, decisões posteriores e Etapa 4B.2

- Contexto tipado não é autenticação; associação declarada não é ownership; aceitar uma seleção não comprova aprovação/configuração/agenda/stock atuais.
- A fonte confiável do local de levantamento e a guarda coordenada das capacidades de `users` continuam por implementar na autorização específica. Não são necessárias para testar a canonicalização pura.
- A política de revisões é conservadora e inclui os tokens no fingerprint. Uma futura política semântica mais permissiva ou alteração deste formato precisa de compatibilidade e testes de replay, não de mudança silenciosa.
- Catálogo real de concelhos, resolução de horas locais/aliases, fronteira HTTP, IDs públicos de perfil e integração com o carrinho permanecem em etapas posteriores.
- Não existe idempotência operacional: ninguém procura/persiste o fingerprint ou uma chave, recupera um recibo, coordena transações ou inicia retries neste código.

Recomendação para uma Etapa 4B.2 separadamente autorizada: leitura de âncora/recibo mínimo com índices existentes, identidade antes de projetar dados e comparação com este fingerprint v1. Especificar os testes reais e o âmbito do repositório antes de implementar; não criar encomendas, débito, serviço global ou endpoint como efeito lateral. O contrato/fingerprint deste bloco estão disponíveis para essa revisão, mantendo as lacunas do checkout completo explícitas.

Mensagem de commit sugerida, sem execução: `feat(api): add pure checkout contract and canonical fingerprint`.

Estado de entrega: nenhum ficheiro rastreado modificado, seis novos ficheiros desta etapa e o documento 4A anterior ainda não rastreados, staging vazio, branch/HEAD/main inalterados e nenhuma operação Git de publicação. Aguardar autorização explícita para Git ou Etapa 4B.2.
